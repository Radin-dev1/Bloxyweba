import { after } from "next/server";
import { z } from "zod";
import { token } from "@/lib/bridge/types";
import {
  makeOfflineExecutor,
  makeStudioExecutor,
  OFFLINE_SYSTEM_PROMPT,
  OFFLINE_TOOLS,
  PROVIDERS,
  runAgent,
  type AgentEvent,
  type StepBilling,
} from "@/lib/agent";
import { BIT_ESTIMATES, refund, reserve, resolveBilling, settle } from "@/lib/bits";
import { pickSkills, skillBlock } from "@/lib/skills";
import { MCP_SYSTEM_PROMPT, makeMcpExecutor, mcpStudio, mcpTools } from "@/lib/studioMcp";
import { SYSTEM_PROMPT } from "@/lib/tools";

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
});

/**
 * Starts an agent job and persists progress independently of the browser connection. When no
 * job store is available (no session, or no Redis on Vercel) the reply streams back directly
 * as NDJSON instead, in offline mode, so the chat always works.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { sessionId, provider, model, messages } = parsed.data;
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
      let held = 0;
      billing = {
        beforeStep: async () => {
          if (!(await reserve(userId, BIT_ESTIMATES.chatStep))) return false;
          held = BIT_ESTIMATES.chatStep;
          return true;
        },
        afterStep: async (cost, failed) => {
          if (!held) return;
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
  // Load the skill packs this request needs (modeling, maps, textures), like skills on demand.
  const skills = skillBlock(pickSkills(history.at(-1)?.content ?? ""));

  const { bridge } = await import("@/lib/bridge");
  // Without Studio the chat still works: it can talk, write Luau and build into the Bloxy workspace.
  const status = sessionId ? await bridge.getSessionStatus(sessionId).catch(() => null) : null;
  const studioConnected = !!status?.connected;
  // No plugin? Roblox Studio's own MCP server (local only) may still reach an open Studio.
  const mcp = studioConnected ? null : await mcpStudio();
  const jobCreated = sessionId ? await bridge.createChatJob(sessionId, jobId).catch(() => false) : false;
  if (!sessionId || !jobCreated) return streamReply(request, { provider, model, apiKey, history, billing, skills, mcp });

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
        ...(await agentSetup(studioConnected ? sessionId : undefined, mcp, skills, emit)),
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
};

/**
 * Tools, prompt and executor for this run: the Bloxy plugin when it's connected, else Roblox
 * Studio's built-in MCP server when a Studio is reachable, else offline (build into the workspace).
 */
async function agentSetup(
  pluginSession: string | undefined,
  mcp: { id: string; name: string } | null,
  skills: string,
  emit: (e: AgentEvent) => void,
) {
  if (pluginSession) return { executeTool: makeStudioExecutor(pluginSession, emit), system: SYSTEM_PROMPT + skills };
  if (mcp) {
    try {
      return {
        executeTool: makeMcpExecutor(mcp.id, emit),
        tools: await mcpTools(OFFLINE_TOOLS[0].parameters),
        system: MCP_SYSTEM_PROMPT + skills,
      };
    } catch {
      // Fall through to offline if the MCP server went away.
    }
  }
  return { executeTool: makeOfflineExecutor(emit), tools: OFFLINE_TOOLS, system: OFFLINE_SYSTEM_PROMPT + skills };
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
        const { skills, mcp, ...agent } = run;
        await runAgent(run.provider, {
          ...agent,
          emit,
          signal: request.signal,
          ...(await agentSetup(undefined, mcp, skills, emit)),
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
  return e?.message ? String(e.message).slice(0, 500) : "Something went wrong.";
}
