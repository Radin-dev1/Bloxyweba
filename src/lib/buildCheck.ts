import type { BuildT } from "./openrouter";

/**
 * Checks a part build the way the map/object skills verify a Studio build: is anything
 * floating, sunk into the ground, duplicated on top of itself, or left default grey, and
 * how big is it against a 5-stud player. The agent reads the report and fixes its build.
 */

type Box = { name: string; min: [number, number, number]; max: [number, number, number] };

const rad = (d: number) => (d * Math.PI) / 180;

/** World-space bounding box of a part (rotation applied, Roblox YXZ order). */
function boxOf(p: BuildT["parts"][number]): Box {
  const [rx, ry, rz] = p.rotation.map(rad);
  const [cx, sx] = [Math.cos(rx), Math.sin(rx)];
  const [cy, sy] = [Math.cos(ry), Math.sin(ry)];
  const [cz, sz] = [Math.cos(rz), Math.sin(rz)];
  // R = Ry * Rx * Rz
  const R = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  const h = p.size.map((v) => v / 2);
  const ext = R.map((row) => Math.abs(row[0]) * h[0] + Math.abs(row[1]) * h[1] + Math.abs(row[2]) * h[2]);
  return {
    name: p.name,
    min: [p.position[0] - ext[0], p.position[1] - ext[1], p.position[2] - ext[2]],
    max: [p.position[0] + ext[0], p.position[1] + ext[1], p.position[2] + ext[2]],
  };
}

const GAP = 0.2; // studs: closer than this counts as touching

function touching(a: Box, b: Box) {
  for (let i = 0; i < 3; i++) if (a.min[i] > b.max[i] + GAP || b.min[i] > a.max[i] + GAP) return false;
  return true;
}

/** Moves a build so its lowest point sits exactly on the ground (y = 0). */
export function groundBuild(build: BuildT): BuildT {
  if (!build.parts.length) return build;
  const lowest = Math.min(...build.parts.map((p) => boxOf(p).min[1]));
  if (Math.abs(lowest) < 0.05) return build;
  return {
    ...build,
    parts: build.parts.map((p) => ({ ...p, position: [p.position[0], +(p.position[1] - lowest).toFixed(3), p.position[2]] })),
  };
}

export function checkBuild(build: BuildT) {
  const boxes = build.parts.map(boxOf);
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i])));
  const size = hi.map((v, i) => Math.round((v - lo[i]) * 10) / 10);

  // Everything connected (touching, transitively) to something on the ground is supported.
  const supported = new Set<number>();
  const queue: number[] = [];
  boxes.forEach((b, i) => {
    if (b.min[1] <= 0.25) {
      supported.add(i);
      queue.push(i);
    }
  });
  while (queue.length) {
    const i = queue.pop()!;
    boxes.forEach((b, j) => {
      if (!supported.has(j) && touching(boxes[i], b)) {
        supported.add(j);
        queue.push(j);
      }
    });
  }
  const floating = boxes.filter((_, i) => !supported.has(i)).map((b) => b.name);
  const sunk = boxes.filter((b) => b.min[1] < -0.3).map((b) => b.name);
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const p of build.parts) {
    const key = [p.shape, ...p.position.map((v) => v.toFixed(2)), ...p.size.map((v) => v.toFixed(2))].join("|");
    if (seen.has(key)) duplicates.push(`${p.name} (same spot as ${seen.get(key)})`);
    else seen.set(key, p.name);
  }
  const grey = build.parts.filter((p) => p.color === "a3a2a5" && p.material === "Plastic").map((p) => p.name);

  const list = (names: string[]) => names.slice(0, 6).join(", ") + (names.length > 6 ? ` and ${names.length - 6} more` : "");
  const problems: string[] = [];
  if (floating.length)
    problems.push(`${floating.length} part(s) float with nothing under or beside them: ${list(floating)}. Rest them on something (fine only if they are intentional obby platforms).`);
  if (sunk.length) problems.push(`${sunk.length} part(s) go below the ground: ${list(sunk)}.`);
  if (duplicates.length) problems.push(`Duplicate parts in exactly the same place (they flicker): ${list(duplicates)}.`);
  if (grey.length) problems.push(`${grey.length} part(s) are default grey Plastic: ${list(grey)}. Give them real colors/materials.`);

  return {
    size,
    parts: build.parts.length,
    problems,
    summary:
      `Size ${size[0]} x ${size[1]} x ${size[2]} studs (W x H x D; a player is 5 tall), ${build.parts.length} parts.` +
      (problems.length ? `\nProblems:\n- ${problems.join("\n- ")}` : "\nNo structural problems found."),
  };
}
