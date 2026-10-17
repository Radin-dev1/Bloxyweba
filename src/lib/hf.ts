import { Client, handle_file } from "@gradio/client";

/**
 * Open-source image and 3D models on Hugging Face, called through their public Spaces with
 * Bloxy's own token (HF_TOKEN on the server; never sent to the browser). The token raises the
 * free ZeroGPU quota; without it the anonymous quota still works for a few runs a day.
 *
 * Pipeline for "make me a 3D model": text -> concept image (2D model) -> mesh (3D model).
 * Every 3D model is asked for a low-poly result (Roblox: ~10,000 triangles per MeshPart).
 */

import { DEFAULT_IMAGE_MODEL, DEFAULT_MESH_MODEL, IMAGE_MODELS, MESH_MODELS, type ImageModelId, type MeshModelId } from "./hfModels";

export { DEFAULT_IMAGE_MODEL, DEFAULT_MESH_MODEL, IMAGE_MODELS, MESH_MODELS, type ImageModelId, type MeshModelId };

const token = () => (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "").trim() || undefined;

export function hfStatus() {
  return { configured: !!token() };
}

const connect = (space: string) => {
  const hf_token = token() as `hf_${string}` | undefined;
  return Client.connect(space, hf_token ? { hf_token } : {});
};

/** The first file URL (or path) in a Gradio result, optionally with a given extension. */
function fileUrl(data: unknown, ext?: RegExp): string | null {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") found.push(o.url);
    for (const x of Array.isArray(v) ? v : Object.values(o)) walk(x);
  };
  walk(data);
  return found.find((u) => !ext || ext.test(u.split("?")[0])) ?? null;
}

async function download(url: string, signal?: AbortSignal) {
  const t = token();
  const res = await fetch(url, { signal, headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Gradio errors arrive as status objects; turn them into a readable message. */
function reason(err: unknown) {
  const e = err as { message?: string; title?: string } | undefined;
  const msg = e?.message || e?.title || String(err);
  if (/quota|runs limit/i.test(msg))
    return token() ? "out of free GPU time on Hugging Face for now" : "out of anonymous GPU time (set HF_TOKEN on the server for more)";
  return msg.slice(0, 300);
}

/** Prompt wording that gives image-to-3D models what they need: one whole object, plain background. */
export function conceptPrompt(description: string) {
  return (
    `${description}. A single 3D game asset, the whole object visible and centered, three-quarter view, ` +
    `plain pure white background, soft even studio lighting, no shadow on the ground, no text, stylized, clean shapes`
  );
}

export async function generateImage(model: ImageModelId, prompt: string, signal?: AbortSignal): Promise<Buffer> {
  try {
    let data: unknown;
    if (model === "qwen-image-2512") {
      const c = await connect("Qwen/Qwen-Image-2512");
      data = (await c.predict("/infer", { prompt, seed: 0, randomize_seed: true, aspect_ratio: "1:1", guidance_scale: 4, num_inference_steps: 30, prompt_enhance: false })).data;
    } else if (model === "hidream-o1") {
      const c = await connect("HiDream-ai/HiDream-O1-Image");
      data = (await c.predict("/_generate_wrapped", { prompt_value: prompt, wh_ratio_value: "1:1", negative_prompt_value: "text, watermark, cropped, multiple objects, busy background", enable_prompt_refine_value: false, seed_value: -1, guidance_scale_value: 5 })).data;
    } else {
      const c = await connect("black-forest-labs/FLUX.1-schnell");
      data = (await c.predict("/infer", { prompt, seed: 0, randomize_seed: true, width: 1024, height: 1024, num_inference_steps: 4 })).data;
    }
    const url = fileUrl(data);
    if (!url) throw new Error("The image model returned no image.");
    return await download(url, signal);
  } catch (err) {
    throw new Error(`${IMAGE_MODELS.find((m) => m.id === model)?.label ?? model}: ${reason(err)}`);
  }
}

/** One image-to-3D model; returns a GLB, already reduced on the Space where it can be. */
async function meshFrom(model: MeshModelId, image: Buffer): Promise<Buffer> {
  const file = () => handle_file(new Blob([new Uint8Array(image)], { type: "image/png" }));
  const glb = /\.glb$/i;
  if (model === "hunyuan3d-2.1" || model === "hunyuan3d-2") {
    const c = await connect(model === "hunyuan3d-2.1" ? "tencent/Hunyuan3D-2.1" : "tencent/Hunyuan3D-2");
    const shape = await c.predict("/shape_generation", {
      ...(model === "hunyuan3d-2" ? { caption: null } : {}),
      image: file(),
      mv_image_front: null,
      mv_image_back: null,
      mv_image_left: null,
      mv_image_right: null,
      steps: 30,
      guidance_scale: 5,
      seed: 1234,
      octree_resolution: 256,
      check_box_rembg: true,
      num_chunks: 8000,
      randomize_seed: true,
    });
    const out = (shape.data as { value?: unknown }[])[0];
    const mesh = out?.value ?? out;
    // Ask the Space to cut it to the Roblox budget; the raw mesh is ~400k faces.
    const reduced = await c
      .predict("/on_export_click", { file_out: mesh, file_out2: mesh, file_type: "glb", reduce_face: true, export_texture: false, target_face_num: 10000 })
      .catch(() => null);
    const url = fileUrl(reduced?.data, glb) ?? fileUrl(shape.data, glb);
    if (!url) throw new Error("no mesh in the result");
    return download(url);
  }
  if (model === "trellis-2") {
    const c = await connect("microsoft/TRELLIS.2");
    await c.predict("/start_session", {}).catch(() => null);
    const pre = await c.predict("/preprocess_image", { input: file() });
    await c.predict("/image_to_3d", { image: (pre.data as unknown[])[0], seed: 0, resolution: "512" });
    const out = await c.predict("/extract_glb", { decimation_target: 10000, texture_size: 1024 });
    const url = fileUrl(out.data, glb);
    if (!url) throw new Error("no mesh in the result");
    return download(url);
  }
  if (model === "stable-fast-3d") {
    const c = await connect("stabilityai/stable-fast-3d");
    const out = await c.predict("/run_button", [file(), 0.85, null, "Triangle", 5000, 1024]);
    const url = fileUrl(out.data, glb);
    if (!url) throw new Error("no mesh in the result");
    return download(url);
  }
  // uniforge3d
  const c = await connect("mrfakename/uniforge3d");
  const out = await c.predict("/generate", { images: [file()], seed: 42, randomize: true, faces: 20000, texture_size: 1024 });
  const url = fileUrl(out.data, glb);
  if (!url) throw new Error("no mesh in the result");
  return download(url);
}

export type Generated3D = {
  glb: Buffer;
  concept: Buffer;
  meshModel: MeshModelId;
  imageModel: ImageModelId;
  /** True when the mesh came back without colour (Bloxy paints it from the concept). */
  needsPaint: boolean;
  /** Models that failed before one worked, with why. */
  tried: string[];
};

/**
 * Text -> concept image -> 3D mesh. If the chosen 3D model is busy or out of quota, the next
 * one is tried, so a request almost always ends with a model.
 */
export async function textTo3D(
  description: string,
  opts: { imageModel?: ImageModelId; meshModel?: MeshModelId; image?: Buffer; onStatus?: (s: string) => void; signal?: AbortSignal } = {},
): Promise<Generated3D> {
  const imageModel = opts.imageModel ?? DEFAULT_IMAGE_MODEL;
  const tried: string[] = [];
  let concept = opts.image;
  let usedImage = imageModel;
  // The chosen image model first, then the others: a busy Space shouldn't stop the whole job.
  for (const id of opts.image ? [] : [imageModel, ...IMAGE_MODELS.map((m) => m.id).filter((m) => m !== imageModel)]) {
    if (opts.signal?.aborted) throw new Error("Stopped.");
    opts.onStatus?.(`Drawing a concept with ${IMAGE_MODELS.find((m) => m.id === id)?.label}`);
    try {
      concept = await generateImage(id, conceptPrompt(description), opts.signal);
      usedImage = id;
      break;
    } catch (err) {
      tried.push((err as Error).message);
    }
  }
  if (!concept) throw new Error(`No image model could draw the concept right now.\n${tried.join("\n")}`);
  const first = opts.meshModel ?? DEFAULT_MESH_MODEL;
  const order = [first, ...(["hunyuan3d-2.1", "hunyuan3d-2", "trellis-2", "stable-fast-3d"] as MeshModelId[]).filter((m) => m !== first)];
  for (const id of order) {
    if (opts.signal?.aborted) throw new Error("Stopped.");
    const info = MESH_MODELS.find((m) => m.id === id)!;
    opts.onStatus?.(`Building the 3D model with ${info.label}`);
    try {
      const glb = await meshFrom(id, concept);
      return { glb, concept, meshModel: id, imageModel: usedImage, needsPaint: !info.textured, tried };
    } catch (err) {
      tried.push(`${info.label}: ${reason(err)}`);
    }
  }
  throw new Error(`No 3D model could build it right now.\n${tried.join("\n")}`);
}
