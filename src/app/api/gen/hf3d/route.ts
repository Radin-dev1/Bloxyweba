import { z } from "zod";
import { blenderStatus, runBlenderMesh } from "@/lib/blender";
import { hfStatus, MESH_MODELS, textTo3D } from "@/lib/hf";

/**
 * Open-source AI 3D (Hugging Face): a concept image (given, or drawn from the prompt) becomes a
 * real mesh. With Blender on this machine the mesh is cleaned, painted and sized to studs;
 * otherwise the browser sizes it. Runs on Bloxy's own Hugging Face token.
 */

export const maxDuration = 300;

const Body = z.object({
  prompt: z.string().max(1000).default(""),
  /** A concept image as a data URL (PNG/JPEG/WebP), e.g. from Idea Forge. */
  image: z.string().max(12_000_000).optional(),
  sizeStuds: z.number().min(0.5).max(500).default(6),
  imageModel: z.enum(["flux-schnell", "qwen-image-2512", "hidream-o1"]).optional(),
  meshModel: z.enum(["hunyuan3d-2.1", "trellis-2", "stable-fast-3d", "uniforge3d", "hunyuan3d-2"]).optional(),
});

export async function GET() {
  return Response.json({ ...hfStatus(), blender: blenderStatus().available, models: MESH_MODELS.map((m) => m.id) });
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { prompt, image, sizeStuds, imageModel, meshModel } = parsed.data;
  let concept: Buffer | undefined;
  if (image) {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(image);
    if (!m) return Response.json({ error: "The image must be a PNG, JPEG or WebP data URL." }, { status: 400 });
    concept = Buffer.from(m[2], "base64");
  }
  if (!concept && !prompt.trim()) return Response.json({ error: "Describe the object or give an image." }, { status: 400 });

  const withBlender = blenderStatus().available;
  try {
    const gen = await textTo3D(prompt || "the object in the image", {
      image: concept,
      imageModel,
      meshModel: meshModel ?? (withBlender ? undefined : "trellis-2"),
      signal: request.signal,
    });
    const used = { meshModel: gen.meshModel, imageModel: concept ? null : gen.imageModel, tried: gen.tried };
    if (withBlender) {
      const r = await runBlenderMesh(gen.glb, { targetStuds: sizeStuds, maxTris: 10000, signal: request.signal, concept: gen.needsPaint ? gen.concept : undefined });
      if (r.ok) {
        const d = (r.report.dimensions as number[]) ?? [0, 0, 0];
        return Response.json({ glb: r.glb.toString("base64"), dims: [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0], tris: Number(r.report.tris ?? 0), ...used });
      }
    }
    return Response.json({ glb: gen.glb.toString("base64"), dims: [0, 0, 0], tris: 0, fit: sizeStuds, ...used });
  } catch (err) {
    return Response.json({ error: (err as Error).message.slice(0, 1500) }, { status: 502 });
  }
}
