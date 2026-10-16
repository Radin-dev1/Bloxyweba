import { blenderStatus, runBlenderScript } from "@/lib/blender";
import type { AgentEvent, AgentToolSpec } from "./types";

/**
 * Sculpting: the agent writes a Blender script for a smooth, organic mesh (food, creatures,
 * plants, rocks, characters, statues) and real headless Blender builds it. Roblox parts can't
 * make these shapes; a mesh can. Local only (needs Blender on this machine).
 */

export const SCULPT_TOOL: AgentToolSpec = {
  name: "sculpt_model",
  description:
    "Sculpt a smooth, organic 3D mesh in real Blender and place it in the user's Bloxy workspace. Use it for anything curvy or natural " +
    "(food, fruit, vegetables, animals, creatures, characters, plants, trees, rocks, shells, statues, blobs), where Roblox parts would look blocky. " +
    "blender_script is Blender 5.2 Python that runs in an EMPTY scene and builds mesh objects: bpy.ops.mesh.primitive_* / bmesh / metaballs (convert to mesh), " +
    "modifiers (SUBSURF, DISPLACE with bpy.data.textures, SIMPLE_DEFORM bend/twist/taper, SKIN, SOLIDIFY, MIRROR, ARRAY, SCREW, BOOLEAN; they are applied for you), " +
    "object scale (meshes CAN be stretched, unlike Roblox balls), bpy.ops.object.shade_smooth(). Materials: use_nodes, set Principled BSDF Base Color + Roughness AND material.diffuse_color. " +
    "Model at real size in meters, Z up; it is scaled so its longest side is size_studs and set on the ground. Allowed imports: bpy, bmesh, math, mathutils, random, numpy, colorsys. " +
    "No open(), exec, eval, getattr, file paths, sys/subprocess, bpy.ops.wm/export/import/render. Keep it under ~10,000 triangles. Calling again with the same name replaces it.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short model name, e.g. Pickle" },
      size_studs: { type: "number", description: "Longest side in studs (a player is 5 tall; a pickle prop ~4, a tree ~25)" },
      blender_script: { type: "string", description: "The Blender Python that builds the mesh" },
    },
    required: ["name", "size_studs", "blender_script"],
  },
};

export const SCULPT_NOTE = `
You can SCULPT: sculpt_model builds a smooth mesh in real Blender. Choose the right tool:
- sculpt_model for organic, curvy or natural things: food, fruit, vegetables, animals, creatures, characters, plants, trees, rocks, statues.
- build_model (Roblox parts) for blocky, hard-surface or game-structure things: buildings, furniture, vehicles, obbies, platforms, walls.
Combining is fine (a sculpted tree next to a parts-built house). After each sculpt you get a report and, if you can see images, renders from four sides: look at them and fix what is clearly wrong.`;

export function sculptAvailable() {
  return blenderStatus().available;
}

type SculptReport = {
  tris?: number;
  objects?: number;
  decimated?: boolean;
  dimensions?: number[];
  materials?: string[];
  unpainted?: string[];
  parts?: { name: string; size: number[]; bottom: number }[];
  floating?: string[];
  loose?: Record<string, number>;
};

const round = (n: number) => Math.round(n * 10) / 10;

/** Turns Blender's report into what a careful modeller would check, for the AI to act on. */
function describe(name: string, r: SculptReport, hasSheet: boolean) {
  const [w = 0, d = 0, h = 0] = r.dimensions ?? [];
  const tris = Number(r.tris ?? 0);
  const lines = [
    `Sculpted "${name}" and placed it in the user's Bloxy workspace: ${tris.toLocaleString()} triangles, ` +
      `${round(w)} wide x ${round(d)} deep x ${round(h)} tall (studs; a player is 5 tall), ${r.objects ?? 1} object(s).`,
  ];
  const sides = [w, d, h].filter((v) => v > 0);
  if (sides.length === 3) lines.push(`Proportions: the longest side is ${round(Math.max(...sides) / Math.min(...sides))}x the shortest.`);
  if (r.parts && r.parts.length > 1 && r.parts.length <= 12)
    lines.push(`Objects: ${r.parts.map((p) => `${p.name} ${p.size.map(round).join("x")}`).join(", ")}.`);
  lines.push(`Materials: ${r.materials?.length ? r.materials.join(", ") : "none"}.`);

  const problems: string[] = [];
  if (r.unpainted?.length) problems.push(`No material on ${r.unpainted.join(", ")}: it renders grey. Give every object a material.`);
  if (r.floating?.length) problems.push(`Floating in the air, touching nothing: ${r.floating.join(", ")}. Move it onto the body or the ground.`);
  for (const [obj, n] of Object.entries(r.loose ?? {}))
    if (n > 1) problems.push(`${obj} is ${n} separate pieces. Fine if intended; if they are details meant to sit on the surface, make sure they overlap it.`);
  if (r.decimated) problems.push("It was over the triangle budget and got simplified, which can look rough. Use fewer subdivisions or segments.");
  lines.push(problems.length ? `Check:\n- ${problems.join("\n- ")}` : "No structural problems found.");

  if (hasSheet)
    lines.push(
      `The attached image shows it from the front (top-left), side (top-right), top (bottom-left) and three-quarter view (bottom-right). ` +
        `Compare it honestly with a real ${name}: silhouette, proportions, colors and the details that make it recognisable. ` +
        `If something is clearly wrong, fix the script and call sculpt_model again with the same name (at most two fix-ups); otherwise tell the user it's done.`,
    );
  return lines.join("\n");
}

/** Runs sculpt_model: Blender builds the mesh, the browser receives it as a "mesh" event, the AI sees renders. */
export async function runSculpt(callId: string, input: unknown, emit: (e: AgentEvent) => void, signal?: AbortSignal) {
  const args = (input ?? {}) as { name?: unknown; size_studs?: unknown; blender_script?: unknown };
  const name = String(args.name ?? "Sculpture").replace(/[^\w -]/g, "").slice(0, 60) || "Sculpture";
  const studs = Math.min(500, Math.max(0.5, Number(args.size_studs) || 6));
  const script = typeof args.blender_script === "string" ? args.blender_script : "";
  if (!script.trim()) return { ok: false, content: "blender_script is empty." };
  const r = await runBlenderScript(script, { targetStuds: studs, maxTris: 12000, signal, sheet: true });
  if (!r.ok) return { ok: false, content: `${r.error}
Fix the script and call sculpt_model again.` };
  const report = r.report as SculptReport;
  const dims = report.dimensions ?? [0, 0, 0];
  emit({
    type: "mesh",
    id: callId,
    name,
    glb: r.glb.toString("base64"),
    tris: Number(report.tris ?? 0),
    dims: [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0],
  });
  return {
    ok: true,
    content: describe(name, report, !!r.sheet),
    ...(r.sheet ? { image: { mediaType: "image/jpeg" as const, data: r.sheet.toString("base64") } } : {}),
  };
}
