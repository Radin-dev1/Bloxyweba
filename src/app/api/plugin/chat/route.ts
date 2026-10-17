import { bridge, bridgeErrorResponse } from "@/lib/bridge";
import { INBOX_TEXT_MAX } from "@/lib/bridge/types";

/**
 * Chat from inside Roblox Studio. The plugin can't hold API keys or bits, so a message typed
 * there is queued for the user's open Bloxy tab, which runs it like any chat message (their
 * model, key or bits, settings). The plugin then reads the newest chat job to show the reply.
 */

async function sessionOf(request: Request) {
  return bridge.pluginSession(request.headers.get("x-bloxy-token"));
}

export async function POST(request: Request) {
  try {
    const sessionId = await sessionOf(request);
    if (!sessionId) return Response.json({ error: "not_paired" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, INBOX_TEXT_MAX) : "";
    if (!text) return Response.json({ error: "empty" }, { status: 400 });
    return Response.json({ queued: await bridge.pushInbox(sessionId, text) });
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}

/** Big tool inputs (scripts, builds) are useless in the small Studio panel: keep a short label. */
function compact(event: unknown) {
  const e = event as { type?: string; name?: string; args?: Record<string, unknown> } & Record<string, unknown>;
  if (e?.type === "tool_call") {
    const a = e.args ?? {};
    const target = a.name ?? a.query ?? a.path ?? a.parent ?? a.pattern ?? "";
    return { type: "tool_call", id: e.id, name: e.name, target: String(target).slice(0, 80) };
  }
  if (e?.type === "tool_result") return { type: "tool_result", id: e.id, ok: e.ok };
  if (e?.type === "build" || e?.type === "mesh") return { type: e.type, name: (e as { name?: string; build?: { name?: string } }).name ?? (e as { build?: { name?: string } }).build?.name };
  return event;
}

export async function GET(request: Request) {
  try {
    const sessionId = await sessionOf(request);
    if (!sessionId) return Response.json({ error: "not_paired" }, { status: 401 });
    const url = new URL(request.url);
    const latest = await bridge.latestChatJob(sessionId);
    if (!latest) return Response.json({ jobId: null, events: [], nextSeq: -1 }, { headers: { "Cache-Control": "no-store" } });
    // A new conversation turn started: send it from the beginning.
    const after = url.searchParams.get("jobId") === latest ? Number(url.searchParams.get("afterSeq") ?? -1) : -1;
    const job = await bridge.getChatJob(sessionId, latest, Number.isInteger(after) ? after : -1);
    if (!job) return Response.json({ jobId: null, events: [], nextSeq: -1 }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(
      { jobId: job.jobId, status: job.status, nextSeq: job.nextSeq, events: job.events.map((x) => ({ seq: x.seq, event: compact(x.event) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
