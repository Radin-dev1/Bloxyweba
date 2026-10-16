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
    camera: { position: [-18, 22, 58], target: [0, 3, 0] },
    fetchedAt: 0,
  };
}

// The local workspace (everything built while Studio isn't connected) is kept in this browser,
// so a reload or leaving the page doesn't wipe it.
const LOCAL_PLACE_KEY = "bloxy.localPlace.v1";

export function loadLocalPlace(): Scene {
  const base = demoScene();
  try {
    const raw = localStorage.getItem(LOCAL_PLACE_KEY);
    const parts = raw ? (JSON.parse(raw) as Scene["parts"]) : null;
    if (Array.isArray(parts) && parts.length > 0) return { ...base, parts };
  } catch {}
  return base;
}

export function saveLocalPlace(scene: Scene) {
  try {
    if (scene.parts.length <= 1) localStorage.removeItem(LOCAL_PLACE_KEY);
    else localStorage.setItem(LOCAL_PLACE_KEY, JSON.stringify(scene.parts.slice(0, 5000)));
  } catch {}
}
