import { z } from "zod";

const DATASET_API = "https://datasets-server.huggingface.co/search";
const Query = z.object({ prompt: z.string().trim().min(1).max(300) });

type DatasetRow = {
  row?: {
    factory?: string;
    caption_object?: string;
    caption_create_3D_object?: string;
    code_geo?: string;
  };
};

/** Retrieve one relevant Blender procedural-model example from the public 3DCode dataset. */
export async function GET(request: Request) {
  const parsed = Query.safeParse({ prompt: new URL(request.url).searchParams.get("prompt") ?? "" });
  if (!parsed.success) return Response.json({ error: "Describe the object to find a relevant example." }, { status: 400 });

  const url = new URL(DATASET_API);
  url.searchParams.set("dataset", "YipengGao/3DCode");
  url.searchParams.set("config", "3DCodeData");
  url.searchParams.set("split", "train");
  url.searchParams.set("query", parsed.data.prompt);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "1");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), next: { revalidate: 86_400 } });
    if (!response.ok) return Response.json({ error: `Dataset lookup failed (${response.status}).` }, { status: 502 });
    const data = (await response.json()) as { rows?: DatasetRow[] };
    const row = data.rows?.[0]?.row;
    if (!row?.code_geo) return Response.json({ error: "No matching procedural 3D example was found." }, { status: 404 });

    return Response.json(
      {
        example: {
          factory: row.factory ?? "3DCode sample",
          caption: row.caption_create_3D_object ?? row.caption_object ?? "",
          code: row.code_geo.slice(0, 12_000),
          source: "https://huggingface.co/datasets/YipengGao/3DCode",
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "The 3DCode dataset is temporarily unavailable. Try again later." }, { status: 502 });
  }
}
