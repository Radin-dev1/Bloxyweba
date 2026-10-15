import { z } from "zod";
import { GEN_DEFAULTS, NO_KEY, errorResponse, openrouterKey, orFetch } from "@/lib/openrouter";

export const maxDuration = 300;

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.image),
  prompt: z.string().min(1).max(8000),
});

/** Text-to-image through OpenRouter's Images API. Returns data URLs. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const key = openrouterKey(parsed.data.apiKey);
  if (!key) return NO_KEY();
  try {
    const res = await orFetch(key, "/images", {
      method: "POST",
      body: JSON.stringify({ model: parsed.data.model, prompt: parsed.data.prompt }),
    });
    const data = (await res.json()) as { data?: { b64_json?: string; media_type?: string }[] };
    const images = (data.data ?? [])
      .filter((d) => d.b64_json)
      .map((d) => `data:${d.media_type ?? "image/png"};base64,${d.b64_json}`);
    if (images.length === 0) return Response.json({ error: "The model returned no image." }, { status: 502 });
    return Response.json({ images });
  } catch (err) {
    return errorResponse(err);
  }
}
