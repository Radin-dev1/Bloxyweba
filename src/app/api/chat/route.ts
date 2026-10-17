import { after } from "next/server";
import { z } from "zod";
import { token } from "@/lib/bridge/types";
import {
  makeOfflineExecutor,
  makeStudioExecutor,
  OFFLINE_SYSTEM_PROMPT,
  OFFLINE_TOOLS,
  GENERATE_3D_NOTE,
  GENERATE_3D_TOOL,
  SCULPT_NOTE,
  SCULPT_TOOL,
  sculptAvailable,
  PROVIDERS,
  runAgent,
  type AgentEvent,
  type ToolExecutor,
  type StepBilling,
} from "@/lib/agent";
import { chatStepEstimate, refund, reserve, resolveBilling, settle } from "@/lib/bits";
import { pickSkills, skillBlock } from "@/lib/skills";
import { MCP_SYSTEM_PROMPT, makeMcpExecutor, mcpStudio, mcpTools } from "@/lib/studioMcp";
import { getAccount, tierOf } from "@/lib/accounts";
import { currentUser } from "@/lib/auth";
import { KNOWLEDGE_TOOL, knowledgeBlock, runKnowledgeSearch } from "@/lib/knowledge";
import { isNetworkError, NETWORK_ERROR } from "@/lib/openrouter";
import { SYSTEM_PROMPT, TOOL_SPECS } from "@/lib/tools";
import type { Generate3DOptions } from "@/lib/agent/generate3d";

// Vercel Hobby allows at most 300s per function; long agent runs continue in the next message.
export const maxDuration = 300;

const Body = z.object({
  // Optional: without a Studio session (e.g. no Redis on Vercel) the reply streams back directly.
  sessionId: z.string().min(1).optional(),
  jobId: z.string().min(1).max(100).optional(),
  provider: z.enum(["openrouter", "claude", "gemini"]),
  model: z.string().min(1).max(100),
  apiKey: z.string().max(500).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(200_000) }))
    .min(1)
    .max(200),
  // Open-source models for generate_3d_model (Hugging Face), picked in Settings.
  imageModel: z.enum(["flux-schnell", "qwen-image-2512", "hidream-o1"]).optional(),
  meshModel: z.enum(["hunyuan3d-2.1", "trellis-2", "stable-fast-3d", "uniforge3d", "hunyuan3d-2"]).optional(),
});

/**
 * Starts an agent job and persists progress independently of the browser connection. When no
 * job store is available (no session, or no Redis on Vercel) the reply streams back directly
 * as NDJSON instead, in offline mode, so the chat always works.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { sessionId, provider, model, messages, imageModel, meshModel } = parsed.data;
  // Who's asking: AI 3D generation is limited per plan per day.
  const viewer = await currentUser();
  const viewerAccount = viewer ? await getAccount(viewer.id).catch(() => null) : null;
  const gen = { imageModel, meshModel, account: viewer ? { id: viewer.id, tier: tierOf(viewerAccount) } : null };
  const jobId = parsed.data.jobId ?? token(18);

  let apiKey: string;
  let billing: StepBilling | undefined;
  if (provider === "openrouter") {
    // Bloxy: the user's own OpenRouter key is free; otherwise the owner's key on bits.
    const b = await resolveBilling(parsed.data.apiKey);
    if (!b.ok) return b.response;
    apiKey = b.key;
    if (b.charge) {
      const userId = b.user.id;
      // Each model holds what a step with it typically costs (with the markup); free ones hold 0.
      const estimate = await chatStepEstimate(model);
      let held = 0;
      billing = {
        beforeStep: async () => {
          if (!(await reserve(userId, estimate))) return false;
          held = estimate;
          return true;
        },
        afterStep: async (cost, failed) => {
          // Free models hold 0 but a fallback model could still have cost something.
          if (!held && !(cost && cost > 0)) return;
          if (failed) await refund(userId, held);
          else await settle(userId, held, cost);
          held = 0;
        },
      };
    }
  } else {
    // A key typed by the user wins; the server's own key (if configured) is the fallback.
    apiKey = parsed.data.apiKey?.trim() || process.env[PROVIDERS[provider].envKey] || "";
    if (!apiKey) {
      return Response.json(
        { error: `No ${PROVIDERS[provider].label} API key. Add yours in Settings.` },
        { status: 400 },
      );
    }
  }

  // Drop empty turns (e.g. an assistant reply that was only tool calls) so providers don't reject them.
  const history = messages.filter((m) => m.content.trim() !== "");
  const { bridge } = await import("@/lib/bridge");
  // Without Studio the chat still works: it can talk, write Luau and build into the Bloxy workspace.
  const status = sessionId ? await bridge.getSessionStatus(sessionId).catch(() => null) : null;
  const studioConnected = !!status?.connected;
  // No plugin? Roblox Studio's own MCP server (local only) may still reach an open Studio.
  const mcp = studioConnected ? null : await mcpStudio();
  // Load the skill packs this request needs (modeling, maps, textures...), like skills on demand.
  // Sculpting only when this run can actually sculpt (offline mode with Blender on this machine).
  const canSculpt = !studioConnected && sculptAvailable();
  // Plus the knowledge-base sections that match this request (the previous user turn too, so
  // follow-ups like "now fix it" still find the topic).
  const users = history.filter((m) => m.role === "user");
  const skills =
    skillBlock(pickSkills(history.at(-1)?.content ?? "").filter((id) => id !== "sculpting" || canSculpt)) +
    (await knowledgeBlock(users.slice(-2).map((m) => m.content.slice(0, 1500)).join("\n")));
  const jobCreated = sessionId ? await bridge.createChatJob(sessionId, jobId).catch(() => false) : false;
  if (!sessionId || !jobCreated) return streamReply(request, { provider, model, apiKey, history, billing, skills, mcp, gen });

  const controller = new AbortController();
  let writes = Promise.resolve();
  const tidy = paragraphs();
  const emit = (raw: AgentEvent) => {
    const event = tidy(raw);
    writes = writes.then(() => bridge.appendChatJobEvent(sessionId, jobId, event)).then(() => undefined);
  };
  emit({ type: "user", content: history.at(-1)?.content ?? "" });

  after(async () => {
    let finished = false;
    const monitor = (async () => {
      while (!finished && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const job = await bridge.getChatJob(sessionId, jobId).catch(() => null);
        if (!job || job.status === "stopped") controller.abort();
      }
    })();
    try {
      await runAgent(provider, {
        model,
        apiKey,
        history,
        emit,
        signal: controller.signal,
        ...(await agentSetup(studioConnected ? sessionId : undefined, mcp, skills, emit, gen)),
        billing,
      });
      await writes;
      if (!controller.signal.aborted) {
        emit({ type: "done" });
        await writes;
        await bridge.finishChatJob(sessionId, jobId, "completed");
      }
    } catch (err) {
      await writes;
      if (!controller.signal.aborted) {
        emit({ type: "error", message: describeError(err) });
        emit({ type: "done" });
        await writes;
        await bridge.finishChatJob(sessionId, jobId, "error");
      }
    } finally {
      finished = true;
      await monitor;
    }
  });

  return Response.json({ jobId });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const jobId = url.searchParams.get("jobId") ?? "";
  const rawSeq = url.searchParams.get("afterSeq") ?? "-1";
  const afterSeq = Number(rawSeq);
  if (!sessionId || !jobId || !Number.isInteger(afterSeq) || afterSeq < -1) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { bridge } = await import("@/lib/bridge");
  const job = await bridge.getChatJob(sessionId, jobId, afterSeq).catch(() => null);
  return job
    ? Response.json(job, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "unknown_job" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const jobId = url.searchParams.get("jobId") ?? "";
  if (!sessionId || !jobId) return Response.json({ error: "bad_request" }, { status: 400 });
  const { bridge } = await import("@/lib/bridge");
  const stopped = await bridge.stopChatJob(sessionId, jobId).catch(() => false);
  return Response.json({ stopped });
}

const MESH_NOTE = `

Meshes: generate_3d_model (open-source AI 3D models) and, when listed, sculpt_model (Blender) make real meshes for detailed or organic objects (characters, creatures, food, statues). They land in the user's Bloxy workspace, not in Studio: tell the user to select the mesh there, press Download .glb and import it in Studio with File > Import 3D. For blocky things, build with Studio parts directly.`;

/** Text after a tool step starts a new paragraph, so replies from separate steps don't run together. */
function paragraphs() {
  let spoke = false;
  let afterTool = false;
  return (raw: AgentEvent): AgentEvent => {
    if (raw.type === "tool_call") afterTool = true;
    if (raw.type !== "text" || !raw.delta) return raw;
    const event = spoke && afterTool ? { ...raw, delta: `\n\n${raw.delta}` } : raw;
    spoke = true;
    afterTool = false;
    return event;
  };
}

type StreamRun = {
  provider: "openrouter" | "claude" | "gemini";
  model: string;
  apiKey: string;
  history: { role: "user" | "assistant"; content: string }[];
  billing?: StepBilling;
  skills: string;
  mcp: { id: string; name: string } | null;
  gen: Generate3DOptions;
};

/**
 * Tools, prompt and executor for this run: the Bloxy plugin when it's connected, else Roblox
 * Studio's built-in MCP server when a Studio is reachable, else offline (build into the workspace).
 */
/** Every mode also gets search_knowledge, answered here from Bloxy's knowledge base. */
async function agentSetup(
  pluginSession: string | undefined,
  mcp: { id: string; name: string } | null,
  skills: string,
  emit: (e: AgentEvent) => void,
  gen: Generate3DOptions = {},
) {
  const setup = await modeSetup(pluginSession, mcp, skills, emit, gen);
  const executeTool: ToolExecutor = async (id, name, input, signal) => {
    if (name !== "search_knowledge") return setup.executeTool(id, name, input, signal);
    const r = await runKnowledgeSearch(input);
    emit({ type: "tool_result", id, ok: r.ok, preview: r.content.slice(0, 600) });
    return r;
  };
  return { ...setup, executeTool, tools: [...(setup.tools ?? TOOL_SPECS), KNOWLEDGE_TOOL] };
}

async function modeSetup(
  pluginSession: string | undefined,
  mcp: { id: string; name: string } | null,
  skills: string,
  emit: (e: AgentEvent) => void,
  gen: Generate3DOptions = {},
) {
  if (pluginSession) {
    // Studio tools go to the plugin; making meshes (AI 3D models, Blender sculpts) happens here
    // and the result lands in the Bloxy workspace, ready to download and import.
    const studio = makeStudioExecutor(pluginSession, emit);
    const meshes = makeOfflineExecutor(emit, gen);
    const sculpt = sculptAvailable();
    const executeTool: ToolExecutor = (id, name, input, signal) =>
      name === "generate_3d_model" || name === "sculpt_model" ? meshes(id, name, input, signal) : studio(id, name, input, signal);
    return {
      executeTool,
      tools: [...TOOL_SPECS, GENERATE_3D_TOOL, ...(sculpt ? [SCULPT_TOOL] : [])],
      system: SYSTEM_PROMPT + MESH_NOTE + skills,
    };
  }
  if (mcp) {
    try {
      return {
        executeTool: makeMcpExecutor(mcp.id, emit, gen),
        tools: [...(await mcpTools(OFFLINE_TOOLS[0].parameters)), GENERATE_3D_TOOL, ...(sculptAvailable() ? [SCULPT_TOOL] : [])],
        system: MCP_SYSTEM_PROMPT + skills,
      };
    } catch {
      // Fall through to offline if the MCP server went away.
    }
  }
  // With Blender on this machine the agent can also sculpt organic meshes.
  const sculpt = sculptAvailable();
  return {
    executeTool: makeOfflineExecutor(emit, gen),
    tools: [...OFFLINE_TOOLS, GENERATE_3D_TOOL, ...(sculpt ? [SCULPT_TOOL] : [])],
    system: OFFLINE_SYSTEM_PROMPT + (sculpt ? SCULPT_NOTE : "") + GENERATE_3D_NOTE + skills,
  };
}

/** Runs the agent (MCP or offline mode) and streams its events back as newline-delimited JSON. */
function streamReply(request: Request, run: StreamRun) {
  const encoder = new TextEncoder();
  const tidy = paragraphs();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (raw: AgentEvent) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(tidy(raw)) + "\n"));
      };
      try {
        const { skills, mcp, gen, ...agent } = run;
        await runAgent(run.provider, {
          ...agent,
          emit,
          signal: request.signal,
          ...(await agentSetup(undefined, mcp, skills, emit, gen)),
        });
      } catch (err) {
        if (!request.signal.aborted) emit({ type: "error", message: describeError(err) });
      } finally {
        emit({ type: "done" });
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function describeError(err: unknown) {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401 || e?.status === 403) return "The API key was rejected. Check it in Settings.";
  if (e?.status === 429)
    return "This model is busy or rate-limited right now (free models are limited by OpenRouter). Wait a minute, or pick another model from the model chip.";
  if (e?.status === 402) return "Your OpenRouter account is out of credits for this model. Pick a free model, or add credits on openrouter.ai.";
  if (e?.status === 404) return "That model isn't available for this API key. Pick another model in Settings.";
  if (isNetworkError(err)) return NETWORK_ERROR;
  return e?.message ? String(e.message).slice(0, 500) : "Something went wrong.";
}
