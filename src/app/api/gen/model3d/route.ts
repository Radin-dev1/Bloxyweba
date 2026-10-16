import { z } from "zod";
import {
  BLENDER_3D_SYSTEM_PROMPT,
  ROBLOX_3D_SYSTEM_PROMPT,
  Build,
  BuildPart,
  GEN_DEFAULTS,
  THREE_D_CODE_GUIDANCE,
  proceduralModelToBuild,
  ProceduralModel,
  errorResponse,
  extractJson,
  orFetch,
} from "@/lib/openrouter";
import { createPartScanner } from "@/lib/partStream";
import { findReferences, referenceBlock } from "@/lib/threeDCode";
import { BIT_ESTIMATES, outOfBits, refund, reserve, resolveBilling, settle } from "@/lib/bits";

export const maxDuration = 300;

const Body = z.object({
  apiKey: z.string().max(500).optional(),
  model: z.string().min(1).max(120).default(GEN_DEFAULTS.model3d),
  prompt: z.string().min(1).max(8000),
  image: z.string().max(12_000_000).optional(), // optional reference image (data URL)
  codeFormat: z.enum(["roblox", "blender"]).default("roblox"),
  /** Stream progress as NDJSON (status, name, each finished part, then the build) instead of one JSON reply. */
  stream: z.boolean().optional(),
});

/** Events of a streamed generation, one JSON object per line. */
export type Model3DEvent =
  | { type: "status"; text: string }
  | { type: "name"; name: string }
  | { type: "part"; part: z.infer<typeof BuildPart> }
  | { type: "build"; build: z.infer<typeof Build>; bits: number; references: string[] }
  | { type: "error"; message: string };

/** Build a Roblox model (or Blender procedural code plus a part preview) with an OpenRouter model. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { model, prompt, image, codeFormat } = parsed.data;
  // Own key = free; otherwise the server key on bits (needs Roblox sign-in).
  const billing = await resolveBilling(parsed.data.apiKey);
  if (!billing.ok) return billing.response;
  const hold = BIT_ESTIMATES.model3d;
  if (billing.charge && !(await reserve(billing.user.id, hold))) return outOfBits();

  // Closest objects from the 3DCode dataset (local index): structure references for both
  // modes, plus a real geometry script in Blender mode.
  const refs = await findReferences(prompt, 3);
  const datasetHint = refs.length
    ? `${codeFormat === "blender" ? THREE_D_CODE_GUIDANCE + "\n\n" : ""}${referenceBlock(refs, codeFormat === "blender")}`
    : "";
  const ask = codeFormat === "blender"
    ? `Create a high-quality Blender 5.0 Python procedural model for: ${prompt}`
    : `Build this as a Roblox model: ${prompt}`;
  const payload = {
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
  };
  const toBuild = (text: string) =>
    codeFormat === "blender"
      ? Build.parse(proceduralModelToBuild(ProceduralModel.parse(extractJson(text))))
      : Build.parse(extractJson(text));
  const settleBits = async (cost?: number) => (billing.charge ? await settle(billing.user.id, hold, cost) : 0);
  const refundBits = async () => {
    if (billing.charge) await refund(billing.user.id, hold);
  };
  const references = refs.map((r) => r.name);

  if (parsed.data.stream) {
    return streamGeneration(request, { key: billing.key, payload, toBuild, settleBits, refundBits, references });
  }

  let paid = false; // once OpenRouter has answered, the call is paid for even if the reply doesn't parse
  try {
    const res = await orFetch(billing.key, "/chat/completions", { method: "POST", body: JSON.stringify(payload) });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
    const bits = await settleBits(data.usage?.cost);
    paid = true;
    const build = toBuild(data.choices?.[0]?.message?.content ?? "");
    return Response.json({ build, bits, references });
  } catch (err) {
    if (!paid) await refundBits();
    return errorResponse(err);
  }
}

/**
 * Streams the model's reply and forwards each part as soon as it's complete, so the browser
 * can show the model being built. The final event is the validated build (or an error).
 */
function streamGeneration(
  request: Request,
  run: {
    key: string;
    payload: object;
    toBuild: (text: string) => z.infer<typeof Build>;
    settleBits: (cost?: number) => Promise<number>;
    refundBits: () => Promise<void>;
    references: string[];
  },
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Model3DEvent) => {
        if (open) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      let paid = false;
      try {
        send({
          type: "status",
          text: run.references.length ? `Planning with references: ${run.references.join(", ")}` : "Planning the model",
        });
        const res = await orFetch(run.key, "/chat/completions", {
          method: "POST",
          signal: request.signal,
          body: JSON.stringify({ ...run.payload, stream: true, usage: { include: true } }),
        });
        send({ type: "status", text: "Building" });
        let text = "";
        let cost: number | undefined;
        let partCount = 0;
        const scan = createPartScanner(
          (raw) => {
            const part = BuildPart.safeParse(raw);
            if (!part.success) return;
            partCount++;
            send({ type: "part", part: part.data });
          },
          (name) => send({ type: "name", name }),
        );
        // OpenRouter streams Server-Sent Events: "data: {json}" lines, ending with "data: [DONE]".
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let chunk: { choices?: { delta?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
            try {
              chunk = JSON.parse(data);
            } catch {
              continue;
            }
            if (chunk.error) throw new Error(chunk.error.message ?? "The model stopped with an error.");
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              text += delta;
              scan(delta);
            }
            if (chunk.usage?.cost !== undefined) cost = chunk.usage.cost;
          }
        }
        const bits = await run.settleBits(cost);
        paid = true;
        if (partCount === 0) send({ type: "status", text: "Finishing" });
        send({ type: "build", build: run.toBuild(text), bits, references: run.references });
      } catch (err) {
        if (!paid) await run.refundBits();
        if (!request.signal.aborted) {
          send({ type: "error", message: err instanceof Error ? err.message : "Generation failed." });
        }
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
