import { z } from "zod";
import { makeStudioExecutor, PROVIDERS, runAgent, type AgentEvent } from "@/lib/agent";

// Vercel Hobby allows at most 300s per function; long agent runs continue in the next message.
export const maxDuration = 300;

const Body = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(["claude", "gemini"]),
  model: z.string().min(1).max(100),
  apiKey: z.string().max(500).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(200_000) }))
    .min(1)
    .max(200),
});

/** Streams agent events to the browser as newline-delimited JSON. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { sessionId, provider, model, messages } = parsed.data;

  // A key typed by the user wins; the server's own key (if configured) is the fallback.
  const apiKey = parsed.data.apiKey?.trim() || process.env[PROVIDERS[provider].envKey] || "";
  if (!apiKey) {
    return Response.json(
      { error: `No ${PROVIDERS[provider].label} API key. Add yours in Settings.` },
      { status: 400 },
    );
  }

  // Drop empty turns (e.g. an assistant reply that was only tool calls) so providers don't reject them.
  const history = messages.filter((m) => m.content.trim() !== "");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await runAgent(provider, {
          model,
          apiKey,
          history,
          emit,
          signal: request.signal,
          executeTool: makeStudioExecutor(sessionId, emit),
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
  if (e?.status === 429) return "Rate limited by the AI provider. Wait a moment and try again.";
  if (e?.status === 404) return "That model isn't available for this API key. Pick another model in Settings.";
  return e?.message ? String(e.message).slice(0, 500) : "Something went wrong.";
}
