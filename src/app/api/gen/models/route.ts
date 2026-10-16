import { OPENROUTER } from "@/lib/openrouter";

const SOURCES = {
  text: "/models?output_modalities=text",
  image: "/models?output_modalities=image",
  video: "/videos/models",
  model3d: "/models?output_modalities=text&category=programming&sort=coding-high-to-low",
  model3dAll: "/models?output_modalities=text",
} as const;

const ALLOWED_KINDS = new Set(Object.keys(SOURCES));

/** Public OpenRouter model ids for the node model pickers (no key needed). */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }
  const cacheHeaders = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
  const path = SOURCES[kind as keyof typeof SOURCES];
  const fetchModels = async (url: string) => {
    const response = await fetch(`${OPENROUTER}${url}`).catch(() => null);
    if (!response?.ok) return [];
    const payload = (await response.json().catch(() => ({}))) as { data?: { id?: string; name?: string }[] };
    return (payload.data ?? [])
      .filter((model): model is { id: string; name?: string } => !!model.id && !model.id.endsWith(":batch"))
      .map((model) => ({ id: model.id, name: model.name || model.id }));
  };
  let models = await fetchModels(path);
  if (kind === "model3d" && models.length === 0) models = await fetchModels(SOURCES.model3dAll);
  return Response.json({ models }, { headers: cacheHeaders });
}
