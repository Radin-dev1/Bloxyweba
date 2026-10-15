import { bridge, bridgeErrorResponse } from "@/lib/bridge";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    studio?: Record<string, unknown>;
  };
  if (!body.code) return Response.json({ error: "missing_code" }, { status: 400 });
  try {
    const r = await bridge.connectPlugin(body.code, body.studio ?? null);
    if (!r) return Response.json({ error: "invalid_or_expired_code" }, { status: 404 });
    return Response.json(r);
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
