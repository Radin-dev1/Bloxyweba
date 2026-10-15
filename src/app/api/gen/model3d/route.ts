import { z } from "zod";
import {
  BUILD_SYSTEM_PROMPT,
  Build,
  GEN_DEFAULTS,
  NO_KEY,
  errorResponse,
  extractJson,
  openrouterKey,
  orFetch,
} from "@/lib/openrouter";

export const maxDuration = 300;

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.model3d),
  prompt: z.string().min(1).max(8000),
  image: z.string().max(12_000_000).optional(), // optional reference image (data URL)
});

/** "3D as code": an LLM writes the object as a validated list of Roblox parts. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { model, prompt, image } = parsed.data;
  const key = openrouterKey(parsed.data.apiKey);
  if (!key) return NO_KEY();
  try {
    const ask = `Build this as a Roblox model: ${prompt}`;
    const res = await orFetch(key, "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        messages: [
          { role: "system", content: BUILD_SYSTEM_PROMPT },
          {
            role: "user",
            content: image
              ? [
                  { type: "image_url", image_url: { url: image } },
                  { type: "text", text: ask },
                ]
              : ask,
          },
        ],
      }),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const build = Build.parse(extractJson(text));
    return Response.json({ build });
  } catch (err) {
    return errorResponse(err);
  }
}
