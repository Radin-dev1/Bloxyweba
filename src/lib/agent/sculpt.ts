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
Combining is fine (a sculpted tree next to a parts-built house). Read the report after each call and fix problems.`;

export function sculptAvailable() {
  return blenderStatus().available;
}

/** Runs sculpt_model: Blender builds the mesh, the browser receives it as a "mesh" event. */
export async function runSculpt(callId: string, input: unknown, emit: (e: AgentEvent) => void, signal?: AbortSignal) {
  const args = (input ?? {}) as { name?: unknown; size_studs?: unknown; blender_script?: unknown };
  const name = String(args.name ?? "Sculpture").replace(/[^\w -]/g, "").slice(0, 60) || "Sculpture";
  const studs = Math.min(500, Math.max(0.5, Number(args.size_studs) || 6));
  const script = typeof args.blender_script === "string" ? args.blender_script : "";
  if (!script.trim()) return { ok: false, content: "blender_script is empty." };
  const r = await runBlenderScript(script, { targetStuds: studs, maxTris: 12000, signal });
  if (!r.ok) return { ok: false, content: `${r.error}\nFix the script and call sculpt_model again.` };
  const dims = (r.report.dimensions as number[]) ?? [0, 0, 0];
  const tris = Number(r.report.tris ?? 0);
  emit({ type: "mesh", id: callId, name, glb: r.glb.toString("base64"), tris, dims: [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0] });
  const materials = (r.report.materials as string[] | undefined)?.join(", ") || "none (it will look grey: add materials)";
  return {
    ok: true,
    content:
      `Sculpted "${name}" and placed it in the user's Bloxy workspace: ${tris.toLocaleString()} triangles, ` +
      `${dims.map((d) => Math.round(d * 10) / 10).join(" x ")} studs (W x D x H; a player is 5 tall), ` +
      `${r.report.objects} object(s), materials: ${materials}.` +
      (r.report.decimated ? " It was over the triangle budget and got simplified; use fewer subdivisions next time." : ""),
  };
}
