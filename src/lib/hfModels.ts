/** The open-source Hugging Face models Bloxy can use (shared by the server and the Settings UI). */

export type ImageModelId = "flux-schnell" | "qwen-image-2512" | "hidream-o1";
export type MeshModelId = "hunyuan3d-2.1" | "trellis-2" | "stable-fast-3d" | "uniforge3d" | "hunyuan3d-2";

export const IMAGE_MODELS: { id: ImageModelId; label: string; repo: string; note: string }[] = [
  { id: "flux-schnell", label: "FLUX.1 schnell", repo: "black-forest-labs/FLUX.1-schnell", note: "Fastest (about 5s)" },
  { id: "qwen-image-2512", label: "Qwen-Image 2512", repo: "Qwen/Qwen-Image-2512", note: "Best prompt following" },
  { id: "hidream-o1", label: "HiDream-O1 Image", repo: "HiDream-ai/HiDream-O1-Image", note: "Detailed, refines the prompt" },
];

export const MESH_MODELS: { id: MeshModelId; label: string; repo: string; note: string; textured: boolean }[] = [
  { id: "hunyuan3d-2.1", label: "Hunyuan3D 2.1", repo: "tencent/Hunyuan3D-2.1", note: "Clean shapes, painted by Bloxy", textured: false },
  { id: "trellis-2", label: "TRELLIS.2 4B", repo: "microsoft/TRELLIS.2-4B", note: "Textured, very detailed", textured: true },
  { id: "stable-fast-3d", label: "Stable Fast 3D", repo: "stabilityai/stable-fast-3d", note: "Textured, fast", textured: true },
  { id: "uniforge3d", label: "UniForge3D", repo: "xibushu/UniForge3D", note: "Textured", textured: true },
  { id: "hunyuan3d-2", label: "Hunyuan3D 2", repo: "tencent/Hunyuan3D-2", note: "Fast fallback", textured: false },
];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "flux-schnell";
export const DEFAULT_MESH_MODEL: MeshModelId = "hunyuan3d-2.1";
