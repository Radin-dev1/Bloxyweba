import type { Scene } from "./useScene";

/**
 * The place shown before Studio connects: empty, just the Baseplate a new Studio place
 * starts with (from a Studio export): 2048x16x2048 at Y=-8, Color (91,91,91).
 * Generated models from the Nodes tab can be added to it locally.
 */
export function demoScene(): Scene {
  return {
    parts: [
      {
        path: "Workspace.Baseplate",
        shape: "Block",
        size: [2048, 16, 2048],
        cframe: [0, -8, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
        color: "5b5b5b",
        transparency: 0,
        material: "Plastic",
      },
    ],
    truncated: false,
    camera: { position: [-40, 30, 50], target: [0, 0, 0] },
    fetchedAt: 0,
  };
}
