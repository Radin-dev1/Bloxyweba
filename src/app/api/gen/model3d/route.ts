import { z } from "zod";
import {
  BLENDER_3D_SYSTEM_PROMPT,
  ROBLOX_3D_SYSTEM_PROMPT,
  Build,
  GEN_DEFAULTS,
  THREE_D_CODE_GUIDANCE,
  proceduralModelToBuild,
  ProceduralModel,
  errorResponse,
  extractJson,
  orFetch,
} from "@/lib/openrouter";
import { findReferences, referenceBlock } from "@/lib/threeDCode";
import { BIT_ESTIMATES, outOfBits, refund, reserve, resolveBilling, settle } from "@/lib/bits";

export const maxDuration = 300;

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.model3d),
  prompt: z.string().min(1).max(8000),
  image: z.string().max(12_000_000).optional(), // optional reference image (data URL)
  codeFormat: z.enum(["roblox", "blender"]).default("roblox"),
});

/** Create Blender Python procedural-model code plus a part preview via an OpenRouter coding model. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { model, prompt, image, codeFormat } = parsed.data;
  // Own key = free; otherwise the server key on bits (needs Roblox sign-in).
  const billing = await resolveBilling(parsed.data.apiKey);
  if (!billing.ok) return billing.response;
  const hold = BIT_ESTIMATES.model3d;
  if (billing.charge && !(await reserve(billing.user.id, hold))) return outOfBits();
  let paid = false; // once OpenRouter has answered, the call is paid for even if the reply doesn't parse
  try {
    // Closest objects from the 3DCode dataset (local index): structure references for both
    // modes, plus a real geometry script in Blender mode.
    const refs = await findReferences(prompt, 3);
    const datasetHint = refs.length
      ? `${codeFormat === "blender" ? THREE_D_CODE_GUIDANCE + "\n\n" : ""}${referenceBlock(refs, codeFormat === "blender")}`
      : "";

    const ask = codeFormat === "blender"
      ? `Create a high-quality Blender 5.0 Python procedural model for: ${prompt}`
      : `Build this as a Roblox model: ${prompt}`;
    const res = await orFetch(billing.key, "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        messages: [
          { role: "system", content: codeFormat === "blender" ? BLENDER_3D_SYSTEM_PROMPT : ROBLOX_3D_SYSTEM_PROMPT },
          ...(datasetHint ? [{ role: "system" as const, content: datasetHint }] : []),
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
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
    const bits = billing.charge ? await settle(billing.user.id, hold, data.usage?.cost) : 0;
    paid = true;
    const text = data.choices?.[0]?.message?.content ?? "";
    const build = codeFormat === "blender"
      ? Build.parse(proceduralModelToBuild(ProceduralModel.parse(extractJson(text))))
      : Build.parse(extractJson(text));
    return Response.json({ build, bits, references: refs.map((r) => r.name) });
  } catch (err) {
    if (billing.charge && !paid) await refund(billing.user.id, hold);
    return errorResponse(err);
  }
}
