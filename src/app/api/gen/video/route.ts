import { z } from "zod";
import { BIT_ESTIMATES, jobs, outOfBits, refund, reserve, resolveBilling } from "@/lib/bits";
import { GEN_DEFAULTS, errorResponse, orFetch } from "@/lib/openrouter";

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.video),
  prompt: z.string().min(1).max(8000),
  duration: z.number().int().min(1).max(30).optional(),
  aspectRatio: z.string().max(10).optional(),
  firstFrame: z.string().max(12_000_000).optional(), // image data URL or https URL
});

/**
 * Starts an async video job on OpenRouter. Poll /api/gen/video/status with the returned id.
 * On bits, the hold is kept until the job finishes and then settled to the real cost.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { model, prompt, duration, aspectRatio, firstFrame } = parsed.data;
  const billing = await resolveBilling(parsed.data.apiKey);
  if (!billing.ok) return billing.response;
  const hold = BIT_ESTIMATES.video;
  if (billing.charge && !(await reserve(billing.user.id, hold))) return outOfBits();
  try {
    const res = await orFetch(billing.key, "/videos", {
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
    if (billing.charge) await jobs.put(job.id, billing.user.id, hold);
    return Response.json({ id: job.id, status: job.status });
  } catch (err) {
    if (billing.charge) await refund(billing.user.id, hold);
    return errorResponse(err);
  }
}
