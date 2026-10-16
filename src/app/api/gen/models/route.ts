import { OPENROUTER } from "@/lib/openrouter";

const SOURCES = {
  text: "/models?output_modalities=text",
  image: "/models?output_modalities=image",
  video: "/videos/models",
  model3d: "/models?output_modalities=text&category=programming&sort=coding-high-to-low",
  model3dAll: "/models?output_modalities=text",
} as const;

const ALLOWED_KINDS = new Set(Object.keys(SOURCES));

type RawModel = {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[] };
};

export type ModelInfo = {
  id: string;
  name: string;
  description?: string;
  context?: number;
  /** USD per million tokens. */
  inputPrice?: number;
  outputPrice?: number;
  reasoning?: boolean;
  vision?: boolean;
  tools?: boolean;
  created?: number;
};

/** OpenRouter descriptions are Markdown; the pickers show plain text. */
const plain = (md?: string) =>
  md
    ?.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

const perMillion = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1000) / 1000 : undefined;
};

/** Public OpenRouter models for the model pickers (no key needed), with what the browser shows. */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }
  const cacheHeaders = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
  const path = SOURCES[kind as keyof typeof SOURCES];
  const fetchModels = async (url: string): Promise<ModelInfo[]> => {
    const response = await fetch(`${OPENROUTER}${url}`).catch(() => null);
    if (!response?.ok) return [];
    const payload = (await response.json().catch(() => ({}))) as { data?: RawModel[] };
    return (payload.data ?? [])
      .filter((m): m is RawModel & { id: string } => !!m.id && !m.id.endsWith(":batch"))
      .map((m) => {
        const params = m.supported_parameters ?? [];
        return {
          id: m.id,
          name: m.name || m.id,
          description: plain(m.description),
          context: m.context_length,
          inputPrice: perMillion(m.pricing?.prompt),
          outputPrice: perMillion(m.pricing?.completion),
          reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
          vision: m.architecture?.input_modalities?.includes("image") ?? false,
          tools: params.includes("tools"),
          created: m.created,
        };
      });
  };
  let models = await fetchModels(path);
  if (kind === "model3d" && models.length === 0) models = await fetchModels(SOURCES.model3dAll);
  return Response.json({ models }, { headers: cacheHeaders });
}
