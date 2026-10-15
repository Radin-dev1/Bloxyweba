import { OPENROUTER } from "@/lib/openrouter";

const SOURCES = {
  text: "/models?output_modalities=text",
  image: "/models?output_modalities=image",
  video: "/videos/models",
} as const;

/** Public OpenRouter model ids for the node model pickers (no key needed). */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "text" && kind !== "image" && kind !== "video") {
    return Response.json({ error: "bad_kind" }, { status: 400 });
  }
  const res = await fetch(`${OPENROUTER}${SOURCES[kind]}`).catch(() => null);
  if (!res?.ok) return Response.json({ models: [] });
  const data = (await res.json()) as { data?: { id: string }[] };
  const models = (data.data ?? []).map((m) => m.id).filter((id) => !id.endsWith(":batch"));
  return Response.json({ models });
}
