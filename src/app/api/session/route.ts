import { bridge, bridgeErrorResponse } from "@/lib/bridge";

/** Create a new browser session (or refresh its pair code with `{ sessionId, refresh: true }`). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; refresh?: boolean };
  try {
    if (body.sessionId && body.refresh) {
      const r = await bridge.refreshPairCode(body.sessionId);
      if (r) return Response.json({ sessionId: body.sessionId, ...r });
    }
    return Response.json(await bridge.createSession());
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}

/** Connection status for the browser UI. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  try {
    const status = await bridge.getSessionStatus(sessionId);
    if (!status) return Response.json({ error: "unknown_session" }, { status: 404 });
    return Response.json(status);
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
