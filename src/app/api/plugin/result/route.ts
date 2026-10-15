import { bridge, bridgeErrorResponse, type CommandResult } from "@/lib/bridge";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
  };
  if (!body.id) return Response.json({ error: "missing_id" }, { status: 400 });
  const result: CommandResult = body.ok
    ? { ok: true, result: body.result ?? null }
    : { ok: false, error: body.error || "Unknown Studio error" };
  try {
    const accepted = await bridge.submitResult(request.headers.get("x-bloxy-token"), body.id, result);
    return Response.json({ accepted });
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
