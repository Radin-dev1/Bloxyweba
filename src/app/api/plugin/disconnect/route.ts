import { bridge, bridgeErrorResponse } from "@/lib/bridge";

export async function POST(request: Request) {
  try {
    return Response.json({ ok: await bridge.disconnectPlugin(request.headers.get("x-bloxy-token")) });
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
