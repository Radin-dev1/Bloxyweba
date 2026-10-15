import { createSession, getSessionStatus, refreshPairCode } from "@/lib/bridge";

/** Create a new browser session (or refresh its pair code with `{ sessionId, refresh: true }`). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; refresh?: boolean };
  if (body.sessionId && body.refresh) {
    const r = refreshPairCode(body.sessionId);
    if (r) return Response.json({ sessionId: body.sessionId, ...r });
  }
  return Response.json(createSession());
}

/** Connection status for the browser UI. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  const status = getSessionStatus(sessionId);
  if (!status) return Response.json({ error: "unknown_session" }, { status: 404 });
  return Response.json(status);
}
