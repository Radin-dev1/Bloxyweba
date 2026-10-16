import { z } from "zod";
import { blenderStatus, runBlenderScript } from "@/lib/blender";

export const maxDuration = 300;

/** Is real Blender available on this server? */
export async function GET() {
  const s = blenderStatus();
  return Response.json({ available: s.available, reason: s.available ? undefined : s.reason });
}

const Body = z.object({
  script: z.string().min(1).max(100_000),
  maxTris: z.number().int().min(500).max(20_000).optional(),
  targetStuds: z.number().min(0).max(500).optional(),
});

/** Runs a model's Blender script headless and returns the real mesh (GLB) and a preview render. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const result = await runBlenderScript(parsed.data.script, {
    maxTris: parsed.data.maxTris,
    targetStuds: parsed.data.targetStuds,
    signal: request.signal,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json({
    glb: result.glb.toString("base64"),
    preview: result.preview ? `data:image/png;base64,${result.preview.toString("base64")}` : null,
    report: result.report,
  });
}
