import { existsSync } from "fs";
import path from "path";
import { checkBuild, groundBuild, normalizeShapes } from "./buildCheck";
import { Build, type BuildT } from "./openrouter";
import { SYSTEM_PROMPT } from "./tools";
import type { AgentEvent, AgentToolSpec, ToolExecutor } from "./agent/types";

/**
 * Talks to Roblox Studio WITHOUT the Bloxy plugin, through Roblox's own built-in Studio MCP
 * server (StudioMCP.exe, installed with Studio and launched by %LOCALAPPDATA%\Roblox\mcp.bat).
 * Bloxy's server is the MCP client: JSON-RPC over the process's stdin/stdout, one line each.
 * Local only: it never runs on Vercel.
 */

type Json = Record<string, unknown>;
type McpTool = { name: string; description?: string; inputSchema?: Json };
type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Tools the agent doesn't get: faking user input, Roblox's own sub-agent, local files, and ones Bloxy handles itself. */
const HIDDEN = new Set([
  "user_mouse_input",
  "user_keyboard_input",
  "character_navigation",
  "subagent",
  "store_image",
  "upload_image",
  "http_get",
  "screen_capture",
  "list_roblox_studios",
]);

function launcher(): { command: string; args: string[] } | null {
  if (process.env.VERCEL) return null;
  const custom = process.env.STUDIO_MCP_COMMAND;
  if (custom) return { command: custom, args: [] };
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return null;
  const bat = [process.env.LOCALAPPDATA, "Roblox", "mcp.bat"].join(path.sep);
  return existsSync(bat) ? { command: "cmd.exe", args: ["/c", bat] } : null;
}

class StudioMcp {
  private child: import("child_process").ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private buffer = "";
  tools: McpTool[] = [];

  available() {
    return launcher() !== null;
  }

  private async start() {
    const how = launcher();
    if (!how) throw new Error("Roblox Studio's MCP server isn't installed on this machine.");
    // Loaded at runtime so the bundler doesn't trace the spawn.
    const { spawn } = await import(/* turbopackIgnore: true */ "child_process");
    const child = spawn(how.command, how.args, { windowsHide: true });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let i;
      while ((i = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        let msg: Json;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const id = msg.id as number | undefined;
        const p = id !== undefined ? this.pending.get(id) : undefined;
        if (!p) continue;
        this.pending.delete(id!);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(String((msg.error as Json).message ?? "Studio MCP error")));
        else p.resolve((msg.result ?? {}) as Json);
      }
    });
    child.on("exit", () => {
      this.child = null;
      this.ready = null;
      for (const p of this.pending.values()) p.reject(new Error("Roblox Studio's MCP server stopped."));
      this.pending.clear();
    });
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bloxy", version: "1.0.0" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const list = await this.request("tools/list", {});
    this.tools = (list.tools as McpTool[]) ?? [];
  }

  private connect() {
    this.ready ??= this.start().catch((err) => {
      this.ready = null;
      this.child?.kill();
      throw err;
    });
    return this.ready;
  }

  private request(method: string, params: Json, timeoutMs = 30_000): Promise<Json> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("Roblox Studio's MCP server isn't running."));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Roblox Studio didn't answer within ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  /** Calls a Studio MCP tool and returns its text output. */
  async call(name: string, args: Json, timeoutMs = 120_000) {
    await this.connect();
    const result = await this.request("tools/call", { name, arguments: args }, timeoutMs);
    const text = ((result.content as { type: string; text?: string }[]) ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} omitted]`))
      .join("\n");
    return { ok: !result.isError, text };
  }

  /** Open Studio windows connected to the MCP server. */
  async studios(): Promise<{ id: string; name: string }[]> {
    const r = await this.call("list_roblox_studios", {}, 10_000);
    try {
      const data = JSON.parse(r.text) as { studios?: Json[] };
      return (data.studios ?? []).map((s) => ({
        id: String(s.studio_id ?? s.id ?? s.studioId ?? ""),
        name: String(s.name ?? s.place_name ?? s.placeName ?? s.title ?? "Roblox Studio"),
      }));
    } catch {
      return [];
    }
  }
}

const g = globalThis as unknown as { __bloxyStudioMcp?: StudioMcp };
export const studioMcp = (g.__bloxyStudioMcp ??= new StudioMcp());

/** Is a Studio reachable through the MCP server right now? Returns the studio to target. */
export async function mcpStudio(): Promise<{ id: string; name: string } | null> {
  if (!studioMcp.available()) return null;
  try {
    const list = await studioMcp.studios();
    return list[0] ?? null;
  } catch {
    return null;
  }
}

// ── Building into Studio through execute_luau ──

const lua = (v: number) => String(Math.round(v * 1000) / 1000);

/** Luau that builds a part model at the camera's focus point, as one undoable step. */
export function buildToLuau(build: BuildT) {
  const parts = build.parts
    .map((p) => {
      const kind = p.shape === "Wedge" ? "WedgePart" : "Part";
      return [
        `do local p = Instance.new("${kind}")`,
        `p.Name = ${JSON.stringify(p.name)}`,
        kind === "Part" && p.shape !== "Block" ? `p.Shape = Enum.PartType.${p.shape}` : "",
        `p.Size = Vector3.new(${p.size.map(lua).join(", ")})`,
        `p.CFrame = origin * CFrame.new(${p.position.map(lua).join(", ")}) * CFrame.fromOrientation(math.rad(${lua(p.rotation[0])}), math.rad(${lua(p.rotation[1])}), math.rad(${lua(p.rotation[2])}))`,
        `p.Color = Color3.fromHex("${p.color}")`,
        `pcall(function() p.Material = Enum.Material[${JSON.stringify(p.material)}] end)`,
        p.transparency ? `p.Transparency = ${lua(p.transparency)}` : "",
        `p.Anchored = true p.Parent = model end`,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
  return `local CHS = game:GetService("ChangeHistoryService")
local rec = CHS:TryBeginRecording("Bloxy: ${build.name.replace(/"/g, "")}")
local old = workspace:FindFirstChild(${JSON.stringify(build.name)})
local focus = workspace.CurrentCamera and workspace.CurrentCamera.Focus.Position or Vector3.zero
local origin = old and old:GetPivot() or CFrame.new(math.floor(focus.X + 0.5), 0, math.floor(focus.Z + 0.5))
if old then old:Destroy() end
local model = Instance.new("Model")
model.Name = ${JSON.stringify(build.name)}
${parts}
model.Parent = workspace
game:GetService("Selection"):Set({ model })
if rec then CHS:FinishRecording(rec, Enum.FinishRecordingOperation.Commit) end
print("Built " .. model:GetFullName() .. " with " .. #model:GetChildren() .. " parts")`;
}

// ── The agent's tools in MCP mode ──

function withoutStudioId(schema: Json | undefined): Json {
  const s = JSON.parse(JSON.stringify(schema ?? { type: "object", properties: {} })) as Json;
  const props = (s.properties ?? {}) as Json;
  delete props.studio_id;
  if (Array.isArray(s.required)) s.required = (s.required as string[]).filter((r) => r !== "studio_id");
  delete s.$schema;
  return s;
}

export async function mcpTools(buildModelSchema: Json): Promise<AgentToolSpec[]> {
  if (!studioMcp.tools.length) await studioMcp.studios().catch(() => []); // connects and lists tools
  const tools = studioMcp.tools
    .filter((t) => !HIDDEN.has(t.name))
    .map((t) => ({ name: t.name, description: (t.description ?? "").slice(0, 1500), parameters: withoutStudioId(t.inputSchema) }));
  return [
    ...tools,
    {
      name: "build_model",
      description:
        "Build a model in the open Studio place from Roblox parts (anchored, one undo step, selected when done). Shape Block | Ball | Cylinder | Wedge, size in studs, position = part centre relative to the model (Y up, the model's ground is y = 0), rotation in degrees, color hex, Roblox Material name, transparency 0-1. Up to 400 parts; the same name replaces that model in place. Ball parts are ALWAYS perfect spheres (diameter = the smallest size value; a stretched size just makes a smaller sphere) and Cylinders are always round (length on X, diameter = the smaller of Y/Z). Long round shapes (pickle, capsule, sausage, banana, limb, log) = a Cylinder body plus a Ball of the same diameter on each end. Surface details (bumps, buttons, rivets, eyes) must touch their surface: put their centre about 0.3 of their own size outside the surface, never in the air.",
      parameters: buildModelSchema,
    },
  ];
}

export const MCP_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Connection: you reach Roblox Studio through Roblox's built-in Studio MCP tools (no Bloxy plugin). Your tools are named differently from the list above:
- look first with get_studio_state, search_game_tree, inspect_instance, script_search, script_grep and script_read
- edit scripts with multi_edit; run any Luau (create instances, bulk edits, read positions) with execute_luau, printing what you need to see
- build physical things with build_model (it handles anchoring, undo and placement), or execute_luau for anything procedural
- check errors with get_console_output after changes; use start_stop_play only when a playtest is actually needed
- Roblox's own AI generators are available too: generate_mesh, generate_procedural_model, generate_material, generate_texture (slow; use when a real mesh or material is wanted), plus search_asset and insert_asset for Creator Store assets.`;

/** Runs MCP tools against one Studio; build_model becomes execute_luau. */
export function makeMcpExecutor(studioId: string, emit: (e: AgentEvent) => void): ToolExecutor {
  return async (callId, name, input) => {
    let ok = false;
    let content: string;
    try {
      if (name === "build_model") {
        const parsed = Build.safeParse(input);
        if (!parsed.success) {
          content = `Invalid build: ${parsed.error.message.slice(0, 1200)}`;
        } else {
          const build = groundBuild(parsed.data);
          const r = await studioMcp.call("execute_luau", { code: buildToLuau(build), studio_id: studioId });
          ok = r.ok;
          const check = checkBuild(build, normalizeShapes(parsed.data).stretched);
          content = r.ok
            ? `${r.text.trim()}\n${check.summary}${check.problems.length ? "\nFix these by calling build_model again with the same name." : ""}`
            : r.text;
        }
      } else {
        const r = await studioMcp.call(name, { ...((input as Json) ?? {}), studio_id: studioId });
        ok = r.ok;
        content = r.text || (r.ok ? "Done." : "The tool failed with no message.");
      }
    } catch (err) {
      content = err instanceof Error ? err.message : String(err);
    }
    if (content.length > 60_000) content = content.slice(0, 60_000) + "\n…[truncated]";
    emit({ type: "tool_result", id: callId, ok, preview: content.slice(0, 2000) });
    return { ok, content };
  };
}
