import { blenderStatus, runBlenderMesh } from "@/lib/blender";
import { QUOTAS, takeQuota, type Tier } from "@/lib/accounts";
import { IMAGE_MODELS, MESH_MODELS, textTo3D, type ImageModelId, type MeshModelId } from "@/lib/hf";
import { sniffImage, type AgentEvent, type AgentToolSpec, type ToolImage } from "./types";

/**
 * generate_3d_model: open-source AI 3D models on Hugging Face (text -> concept image -> mesh).
 * Works everywhere (the models run on Hugging Face); with Blender on this machine the mesh is
 * also cleaned up, painted, cut to the Roblox budget and rendered from four sides for review.
 */

export const GENERATE_3D_TOOL: AgentToolSpec = {
  name: "generate_3d_model",
  description:
    "Generate a detailed 3D mesh with open-source AI 3D models (an image model draws a concept, a 3D model like Hunyuan3D or TRELLIS turns it into a mesh) " +
    "and place it in the user's Bloxy workspace. Best for complex, detailed or realistic single objects that are hard to build or script: characters, creatures, " +
    "weapons, statues, detailed props, vehicles. Takes 20-90 seconds. Describe ONE object visually (shape, colors, materials, style), never a scene. " +
    "Calling again with the same name replaces it.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short model name, e.g. DragonStatue" },
      description: {
        type: "string",
        description: "Visual description of one object: what it is, shape, colors, materials, style (e.g. 'a cartoon green pickle with small bumps and a short stem')",
      },
      size_studs: { type: "number", description: "Longest side in studs (a player is 5 tall)" },
    },
    required: ["name", "description", "size_studs"],
  },
};

export const GENERATE_3D_NOTE = `
You can also GENERATE 3D models with open-source AI (generate_3d_model): best for detailed or realistic single objects (characters, creatures, weapons, statues, detailed props). It is slower (20-90s) than build_model or sculpt_model, so use it when detail matters. Never use it for buildings, maps or scenes.`;

/** account: who's asking, for the plan's daily AI 3D limit (signed-out users can't generate). */
export type Generate3DOptions = { imageModel?: ImageModelId; meshModel?: MeshModelId; account?: { id: string; tier: Tier | null } | null };

export async function runGenerate3D(
  callId: string,
  input: unknown,
  emit: (e: AgentEvent) => void,
  options: Generate3DOptions = {},
  signal?: AbortSignal,
): Promise<{ ok: boolean; content: string; image?: ToolImage }> {
  const args = (input ?? {}) as { name?: unknown; description?: unknown; size_studs?: unknown };
  const name = String(args.name ?? "Model").replace(/[^\w -]/g, "").slice(0, 60) || "Model";
  const description = String(args.description ?? "").slice(0, 600);
  const studs = Math.min(500, Math.max(0.5, Number(args.size_studs) || 6));
  if (!description.trim()) return { ok: false, content: "description is empty." };
  // AI 3D runs on Bloxy's Hugging Face quota, so it's limited per plan per day.
  if (!options.account) {
    return { ok: false, content: "AI 3D generation needs a Bloxy account. Tell the user to log in (top right), or build it with build_model or sculpt_model instead." };
  }
  if (!(await takeQuota(options.account.id, "ai3d", options.account.tier))) {
    const limit = QUOTAS.ai3d[options.account.tier ?? "free"];
    return {
      ok: false,
      content:
        `The user has used today's ${limit} AI 3D generations on their plan. Build it with build_model or sculpt_model instead, and mention ` +
        `${options.account.tier === "studio" ? "the limit resets tomorrow" : "Pro and Studio include many more per day (see Pricing)"}.`,
    };
  }

  const withBlender = blenderStatus().available;
  // Without Blender nothing can paint an untextured mesh, so start with a textured 3D model.
  const meshModel = options.meshModel ?? (withBlender ? undefined : "trellis-2");
  let gen;
  try {
    gen = await textTo3D(description, { imageModel: options.imageModel, meshModel, signal });
  } catch (err) {
    return { ok: false, content: (err as Error).message };
  }
  const label = (id: string) => [...MESH_MODELS, ...IMAGE_MODELS].find((m) => m.id === id)?.label ?? id;
  const used = `${label(gen.imageModel)} drew the concept, ${label(gen.meshModel)} built the mesh`;
  const skipped = gen.tried.length ? `\n(Tried first: ${gen.tried.join("; ")})` : "";

  if (withBlender) {
    const r = await runBlenderMesh(gen.glb, { targetStuds: studs, maxTris: 10000, sheet: true, signal, concept: gen.needsPaint ? gen.concept : undefined });
    if (r.ok) {
      const dims = (r.report.dimensions as number[]) ?? [0, 0, 0];
      const tris = Number(r.report.tris ?? 0);
      emit({ type: "mesh", id: callId, name, glb: r.glb.toString("base64"), tris, dims: [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0] });
      return {
        ok: true,
        content:
          `Generated "${name}" (${used}) and placed it in the user's Bloxy workspace: ${tris.toLocaleString()} triangles, ` +
          `${dims.map((d) => Math.round(d * 10) / 10).join(" x ")} studs (W x D x H).${gen.needsPaint ? " Bloxy painted it from the concept image." : ""}${skipped}\n` +
          (r.sheet
            ? "The attached image shows it from the front, side, top and three-quarter view. If it clearly doesn't match the request, call generate_3d_model again with a clearer description (at most once); otherwise tell the user it's done."
            : ""),
        ...(r.sheet ? { image: { mediaType: "image/jpeg" as const, data: r.sheet.toString("base64") } } : {}),
      };
    }
    // Blender failed: fall through and hand over the raw mesh.
  }
  emit({ type: "mesh", id: callId, name, glb: gen.glb.toString("base64"), tris: 0, dims: [0, 0, 0], fit: studs });
  return {
    ok: true,
    content: `Generated "${name}" (${used}) and placed it in the user's Bloxy workspace, about ${studs} studs long.${skipped}\nThe attached image is the concept it was built from.`,
    image: { mediaType: sniffImage(gen.concept), data: gen.concept.toString("base64") },
  };
}
