import { pollCommands } from "@/lib/bridge";

// Roblox HttpService gives up after ~30s, so stay well under that.
const LONG_POLL_MS = 20_000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { studio?: Record<string, unknown> };
  const commands = await pollCommands(request.headers.get("x-bloxy-token"), LONG_POLL_MS, body.studio);
  if (!commands) return Response.json({ error: "not_paired" }, { status: 401 });
  return Response.json({ commands });
}
