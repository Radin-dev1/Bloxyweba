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

// Vercel Hobby allows at most 300s per function; long agent runs continue in the next message.
export const maxDuration = 300;

const Body = z.object({
  sessionId: z.string().min(1),
  jobId: z.string().min(1).max(100).optional(),
  provider: z.enum(["openrouter", "claude", "gemini"]),
  model: z.string().min(1).max(100),
  apiKey: z.string().max(500).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(200_000) }))
    .min(1)
    .max(200),
});

/** Starts an agent job and persists progress independently of the browser connection. */
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

  const { bridge } = await import("@/lib/bridge");
  // Without Studio the chat still works: it can talk, write Luau and build into the Bloxy workspace.
  const studioConnected = !!(await bridge.getSessionStatus(sessionId).catch(() => null))?.connected;
  const jobCreated = await bridge.createChatJob(sessionId, jobId).catch(() => false);
  if (!jobCreated) return Response.json({ error: "Could not start this chat job. Reload Studio and try again." }, { status: 503 });
  const controller = new AbortController();
  let writes = Promise.resolve();
  // Text after a tool step starts a new paragraph, so replies from separate steps don't run together.
  let spoke = false;
  let afterTool = false;
  const emit = (raw: AgentEvent) => {
    let event = raw;
    if (raw.type === "tool_call") afterTool = true;
    if (raw.type === "text" && raw.delta) {
      if (spoke && afterTool) event = { ...raw, delta: `\n\n${raw.delta}` };
      spoke = true;
      afterTool = false;
    }
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
        executeTool: studioConnected ? makeStudioExecutor(sessionId, emit) : makeOfflineExecutor(emit),
        ...(studioConnected ? {} : { tools: OFFLINE_TOOLS, system: OFFLINE_SYSTEM_PROMPT }),
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

function describeError(err: unknown) {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401 || e?.status === 403) return "The API key was rejected. Check it in Settings.";
  if (e?.status === 429) return "Rate limited by the AI provider. Wait a moment and try again.";
  if (e?.status === 404) return "That model isn't available for this API key. Pick another model in Settings.";
  return e?.message ? String(e.message).slice(0, 500) : "Something went wrong.";
}
