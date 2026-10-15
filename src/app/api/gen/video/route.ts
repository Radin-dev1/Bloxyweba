import { z } from "zod";
import { GEN_DEFAULTS, NO_KEY, errorResponse, openrouterKey, orFetch } from "@/lib/openrouter";

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.video),
  prompt: z.string().min(1).max(8000),
  duration: z.number().int().min(1).max(30).optional(),
  aspectRatio: z.string().max(10).optional(),
  firstFrame: z.string().max(12_000_000).optional(), // image data URL or https URL
});

/** Starts an async video job on OpenRouter. Poll /api/gen/video/status with the returned id. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { model, prompt, duration, aspectRatio, firstFrame } = parsed.data;
  const key = openrouterKey(parsed.data.apiKey);
  if (!key) return NO_KEY();
  try {
    const res = await orFetch(key, "/videos", {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt,
        ...(duration ? { duration } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(firstFrame
          ? { frame_images: [{ type: "image_url", image_url: { url: firstFrame }, frame_type: "first_frame" }] }
          : {}),
      }),
    });
    const job = (await res.json()) as { id: string; status: string };
    return Response.json({ id: job.id, status: job.status });
  } catch (err) {
    return errorResponse(err);
  }
}
