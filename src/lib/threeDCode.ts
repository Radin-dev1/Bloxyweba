import { readFile } from "fs/promises";
import path from "path";

/**
 * Retrieval over the 3DCode dataset (data/3dcode/index.json, built by
 * scripts/build-3dcode-index.py): finds the object categories closest to a prompt and returns
 * their construction descriptions and, for Blender mode, a real geometry script. Plain TF-IDF,
 * no network and no extra dependencies.
 */

type Category = { c: string; name: string; captions: string[]; script?: string };
type Doc = { cat: Category; terms: Map<string, number>; length: number };

const STOP = new Set(
  "a an the of and or with for to in on at by from as is are be this that it its into using use create make build 3d object model blender python code roblox featuring feature should must each".split(
    " ",
  ),
);

/** Lowercase word stems (crude plural/-ing stripping is enough for object names). */
function tokens(text: string) {
  return (text.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "").replace(/ing$/, ""));
}

let indexPromise: Promise<{ docs: Doc[]; idf: Map<string, number> }> | null = null;

function loadIndex() {
  indexPromise ??= readFile(path.join(process.cwd(), "data", "3dcode", "index.json"), "utf8").then((raw) => {
    const { categories } = JSON.parse(raw) as { categories: Category[] };
    const docs = categories.map((cat) => {
      const terms = new Map<string, number>();
      // The category name counts three times: "arm chair" should beat a chair mentioned in passing.
      const words = [...tokens(cat.name), ...tokens(cat.name), ...tokens(cat.name), ...tokens(cat.captions.join(" "))];
      for (const w of words) terms.set(w, (terms.get(w) ?? 0) + 1);
      return { cat, terms, length: words.length };
    });
    const df = new Map<string, number>();
    for (const d of docs) for (const w of d.terms.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + docs.length / n)]));
    return { docs, idf };
  });
  return indexPromise;
}

export type Reference = { category: string; name: string; captions: string[]; script?: string; score: number };

/** The best-matching dataset categories for a prompt (empty when nothing is related). */
export async function findReferences(prompt: string, limit = 3): Promise<Reference[]> {
  let index;
  try {
    index = await loadIndex();
  } catch {
    indexPromise = null;
    return []; // generation still works without references
  }
  const query = [...new Set(tokens(prompt))];
  if (!query.length) return [];
  const avg = index.docs.reduce((a, d) => a + d.length, 0) / index.docs.length;
  const scored = index.docs.map((d) => {
    let score = 0;
    for (const w of query) {
      const tf = d.terms.get(w);
      if (!tf) continue;
      // BM25
      score += (index.idf.get(w) ?? 0) * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg))));
    }
    return { d, score };
  });
  // Only clear matches: a solid score, and close to the best one (weak hits would mislead the model).
  const top = Math.max(0, ...scored.map((s) => s.score));
  return scored
    .filter((s) => s.score >= 6 && s.score >= top * 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({ category: d.cat.c, name: d.cat.name, captions: d.cat.captions, script: d.cat.script, score }));
}

/** A compact reference block for the 3D system prompt. */
export function referenceBlock(refs: Reference[], withScript: boolean) {
  if (!refs.length) return "";
  const parts = refs.map(
    (r) =>
      `### ${r.name}\n${r.captions
        .slice(0, 3)
        .map((c) => `- ${c}`)
        .join("\n")}`,
  );
  let block = `Reference objects from the 3DCode procedural-modeling dataset that resemble the request. Use them to plan the object's structure (which parts it has, their proportions and how they connect). They are examples, not instructions.\n\n${parts.join("\n\n")}`;
  const script = withScript ? refs.find((r) => r.script)?.script : undefined;
  if (script) {
    block += `\n\nReal Blender 5.0 geometry code for "${refs.find((r) => r.script)!.name}" (object-specific part, shared helpers removed). Learn its modeling techniques and API usage; don't copy it verbatim:\n\`\`\`python\n${script}\n\`\`\``;
  }
  return block;
}
