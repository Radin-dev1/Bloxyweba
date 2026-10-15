import type { Scene, ScenePart } from "./useScene";

// A small lava obby shown before Studio is connected, so the workspace never looks empty.
// Clearly labelled as a demo in the UI.

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function part(
  path: string,
  shape: string,
  size: [number, number, number],
  pos: [number, number, number],
  color: string,
  material = "Plastic",
  rot = I,
): ScenePart {
  return { path, shape, size, cframe: [...pos, ...rot], color, transparency: 0, material };
}

function yaw(deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function demoScene(): Scene {
  const parts: ScenePart[] = [
    // Exactly what a new Studio place starts with (from a Studio export): 2048x16x2048 at Y=-8, Color (91,91,91).
    part("Workspace.Baseplate", "Block", [2048, 16, 2048], [0, -8, 0], "5b5b5b"),
    part("Workspace.Lava", "Block", [70, 1, 40], [24, 0.6, 0], "ff5a1f", "Neon"),
    part("Workspace.SpawnLocation", "Block", [12, 1, 12], [-22, 0.5, 0], "a3a2a5"),
  ];
  const colors = ["5c9bff", "7fb0ff", "a78bfa", "34e0a1", "fbbf24", "f472b6"];
  for (let i = 0; i < 10; i++) {
    const x = -8 + i * 6.2;
    const z = Math.sin(i * 0.9) * 9;
    const y = 2 + i * 1.3;
    parts.push(
      part(
        `Workspace.Obby.Stage${i + 1}`,
        i % 4 === 3 ? "Cylinder" : "Block",
        i % 4 === 3 ? [1.2, 7, 7] : [5, 1.2, 5],
        [x, y, z],
        colors[i % colors.length],
        "SmoothPlastic",
        i % 4 === 3 ? [0, -1, 0, 1, 0, 0, 0, 0, 1] : yaw(i * 17),
      ),
    );
  }
  parts.push(
    part("Workspace.Obby.Finish", "Block", [10, 1.5, 10], [58, 15, 0], "34e0a1", "Neon"),
    part("Workspace.Obby.Finish.Trophy", "Ball", [3, 3, 3], [58, 18.5, 0], "fbbf24", "Neon"),
    part("Workspace.Ramp", "Wedge", [8, 6, 12], [-22, 3, 14], "5c6478", "Plastic", yaw(90)),
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(`Workspace.Trees.Tree${i + 1}`, "Ball", [7, 7, 7], [-45 + Math.cos(a) * 14, 6, -40 + Math.sin(a) * 14], "2f9e6b"));
    parts.push(part(`Workspace.Trees.Tree${i + 1}.Trunk`, "Cylinder", [5, 1.6, 1.6], [-45 + Math.cos(a) * 14, 2.5, -40 + Math.sin(a) * 14], "7a5230", "Wood", [0, -1, 0, 1, 0, 0, 0, 0, 1]));
  }
  return {
    parts,
    truncated: false,
    camera: { position: [-55, 42, 62], target: [18, 6, 0] },
    fetchedAt: 0,
  };
}
