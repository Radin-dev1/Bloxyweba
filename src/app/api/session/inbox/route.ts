import { bridge, bridgeErrorResponse } from "@/lib/bridge";

/** Messages typed in the Studio plugin's chat; the website takes them and runs them. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  if (!sessionId) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    return Response.json({ messages: await bridge.takeInbox(sessionId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
