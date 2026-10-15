import { disconnectPlugin } from "@/lib/bridge";

export async function POST(request: Request) {
  return Response.json({ ok: disconnectPlugin(request.headers.get("x-bloxy-token")) });
}
