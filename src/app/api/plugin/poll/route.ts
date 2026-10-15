import { bridge, bridgeErrorResponse } from "@/lib/bridge";

// Long-poll: the bridge waits up to bridge.longPollMs (20s in memory, 10s on Redis).
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { studio?: Record<string, unknown> };
  try {
    const commands = await bridge.pollCommands(request.headers.get("x-bloxy-token"), body.studio);
    if (!commands) return Response.json({ error: "not_paired" }, { status: 401 });
    return Response.json({ commands });
  } catch (err) {
    return bridgeErrorResponse(err);
  }
}
