// Builds Bloxy's knowledge base (data/knowledge/chunks.json) from MIT-licensed skill repos.
//
//   git clone --depth 1 https://github.com/TabooHarmony/roblox-brain   <dir>/roblox-brain
//   git clone --depth 1 https://github.com/AshExplained/roblox-skills  <dir>/roblox-skills
//   git clone --depth 1 https://github.com/EL4CTEO/blender-skills      <dir>/blender-skills
//   node scripts/build-knowledge.mjs <dir>
//
// Every markdown doc is split at its headings into chunks of about 600-2400 characters, each
// tagged with its source, so the agent can retrieve just the parts a request needs.
import fs from "node:fs";
import path from "node:path";

const SOURCES = [
  { dir: "roblox-brain", repo: "TabooHarmony/roblox-brain", area: "roblox" },
  { dir: "roblox-skills", repo: "AshExplained/roblox-skills", area: "roblox" },
  { dir: "blender-skills", repo: "EL4CTEO/blender-skills", area: "blender" },
];
const SKIP = /(^|\/)(\.git|\.github|docs|scripts|assets)\/|README|CHANGELOG|CONTRIBUTING|AGENTS\.md|CLAUDE\.md|LICENSE/i;
// Routing notes written for other agent tools (which skill to load, catalogs) are noise here.
const META = /^(when to load|skill catalog|next|goal|related|see also|community ecosystem|route to the specialized skill|execute|output|review output)\b/i;
const SKIP_FILES = /(^|\/)(setup-|handoff|roblox-to-|roblox-triage)/;
const MIN = 600;
const MAX = 2400;

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/build-knowledge.mjs <dir with the cloned repos>");
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".md") ? [p] : [];
  });
}

/** Splits a long section at blank lines (never inside a code fence). */
function splitLong(text) {
  if (text.length <= MAX) return [text];
  const out = [];
  let cur = "";
  let fence = false;
  for (const para of text.split(/\n\n/)) {
    const fences = (para.match(/```/g) ?? []).length;
    if (cur && !fence && cur.length + para.length > MAX) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + para;
    if (fences % 2) fence = !fence;
  }
  if (cur) out.push(cur);
  return out;
}

const chunks = [];
for (const src of SOURCES) {
  const base = path.join(root, src.dir);
  for (const file of walk(base)) {
    const rel = path.relative(base, file).replace(/\\/g, "/");
    if (SKIP.test(rel) || SKIP_FILES.test(rel)) continue;
    let md = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    md = md.replace(/^---\n[\s\S]*?\n---\n/, ""); // front matter
    const doc = (md.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(path.dirname(file))).trim();
    // Sections at ## / ### headings, merged up to MIN so tiny ones travel with a neighbour.
    const sections = [];
    let cur = { heading: "", text: "" };
    let fence = false;
    for (const line of md.split("\n")) {
      if (line.startsWith("```")) fence = !fence;
      const h = !fence && /^#{2,3}\s+(.+)/.exec(line);
      if (h && cur.text.trim().length >= MIN) {
        sections.push(cur);
        cur = { heading: h[1].trim(), text: line + "\n" };
      } else {
        if (h && !cur.heading) cur.heading = h[1].trim();
        cur.text += line + "\n";
      }
    }
    if (cur.text.trim()) sections.push(cur);
    for (const s of sections) {
      if (META.test(s.heading.replace(/[#*`]/g, "").trim())) continue;
      for (const part of splitLong(s.text.trim())) {
        if (part.replace(/\s/g, "").length < 80) continue;
        chunks.push({
          id: chunks.length,
          area: src.area,
          source: `${src.repo}/${rel}`,
          title: s.heading && s.heading !== doc ? `${doc}: ${s.heading}` : doc,
          text: part,
        });
      }
    }
  }
}

const out = path.join(process.cwd(), "data", "knowledge");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "chunks.json"), JSON.stringify(chunks));
// MIT requires the copyright and permission notice to travel with the text.
const notices = SOURCES.map((s) => `## ${s.repo}\n\n${fs.readFileSync(path.join(root, s.dir, "LICENSE"), "utf8").trim()}`).join("\n\n");
fs.writeFileSync(
  path.join(out, "LICENSES.md"),
  `# Licences for data/knowledge/chunks.json\n\nThe knowledge base contains text from these MIT-licensed projects, split into chunks.\n\n${notices}\n`,
);
const chars = chunks.reduce((n, c) => n + c.text.length, 0);
console.log(`${chunks.length} chunks, ${(chars / 1024).toFixed(0)} KB of text -> data/knowledge/chunks.json`);
