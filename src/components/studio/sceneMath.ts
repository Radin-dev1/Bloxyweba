import * as THREE from "three";
import type { ScenePart } from "./useScene";

// Roblox and three.js are both right-handed and Y-up, so CFrames map over directly.
// Roblox orientation (CFrame:ToOrientation / CFrame.fromOrientation) is Euler order YXZ.

export type PartEdit = {
  position?: [number, number, number];
  orientationDeg?: [number, number, number];
  size?: [number, number, number];
  color?: string; // hex without '#'
  transparency?: number;
  material?: string;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function rotationMatrix(p: ScenePart) {
  const [, , , r00, r01, r02, r10, r11, r12, r20, r21, r22] = p.cframe;
  return new THREE.Matrix4().set(r00, r01, r02, 0, r10, r11, r12, 0, r20, r21, r22, 0, 0, 0, 0, 1);
}

export function orientationDeg(p: ScenePart): [number, number, number] {
  const e = new THREE.Euler().setFromRotationMatrix(rotationMatrix(p), "YXZ");
  return [e.x, e.y, e.z].map((v) => r3(THREE.MathUtils.radToDeg(v)) || 0) as [number, number, number];
}

/** New CFrame components from a position and a Roblox orientation (degrees). */
export function composeCFrame(position: [number, number, number], deg: [number, number, number]) {
  const rad = THREE.MathUtils.degToRad;
  const e = new THREE.Euler(rad(deg[0]), rad(deg[1]), rad(deg[2]), "YXZ");
  const m = new THREE.Matrix4().makeRotationFromEuler(e).elements; // column-major
  return [...position.map(r3), m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]].map(r3);
}

/** Applies an edit to a part locally (optimistic update / demo mode). */
export function applyEdit(p: ScenePart, edit: PartEdit): ScenePart {
  const position = edit.position ?? ([p.cframe[0], p.cframe[1], p.cframe[2]] as [number, number, number]);
  const deg = edit.orientationDeg ?? orientationDeg(p);
  return {
    ...p,
    cframe: edit.position || edit.orientationDeg ? composeCFrame(position, deg) : p.cframe,
    size: edit.size ? (edit.size.map((v) => Math.max(0.001, r3(Math.abs(v)))) as [number, number, number]) : p.size,
    color: edit.color ?? p.color,
    transparency: edit.transparency ?? p.transparency,
    material: edit.material ?? p.material,
  };
}

/** The same edit as `set_properties` values the plugin understands. */
export function toStudioProperties(p: ScenePart, edit: PartEdit) {
  const props: Record<string, unknown> = {};
  if (edit.position || edit.orientationDeg) {
    props.CFrame = {
      _t: "CFrame",
      position: (edit.position ?? [p.cframe[0], p.cframe[1], p.cframe[2]]).map(r3),
      orientationDeg: (edit.orientationDeg ?? orientationDeg(p)).map(r3),
    };
  }
  if (edit.size) props.Size = { _t: "Vector3", x: r3(edit.size[0]), y: r3(edit.size[1]), z: r3(edit.size[2]) };
  if (edit.color) props.Color = { _t: "Color3", hex: `#${edit.color}` };
  if (edit.transparency !== undefined) props.Transparency = edit.transparency;
  if (edit.material) props.Material = { _t: "Enum", enum: "Material", name: edit.material };
  return props;
}

export const MATERIALS = [
  "Plastic",
  "SmoothPlastic",
  "Neon",
  "Wood",
  "WoodPlanks",
  "Marble",
  "Basalt",
  "Slate",
  "CrackedLava",
  "Concrete",
  "Limestone",
  "Granite",
  "Pavement",
  "Brick",
  "Pebble",
  "Cobblestone",
  "Rock",
  "Sandstone",
  "CorrodedMetal",
  "DiamondPlate",
  "Foil",
  "Metal",
  "Grass",
  "LeafyGrass",
  "Sand",
  "Fabric",
  "Snow",
  "Mud",
  "Ground",
  "Asphalt",
  "Salt",
  "Ice",
  "Glacier",
  "Glass",
  "ForceField",
  "Cardboard",
  "Carpet",
  "CeramicTiles",
  "ClayRoofTiles",
  "RoofShingles",
  "Leather",
  "Plaster",
  "Rubber",
];

// ── Explorer tree built from part paths ──

export type TreeNode = {
  name: string;
  path: string;
  partIndex: number | null;
  children: TreeNode[];
};

export function buildTree(parts: ScenePart[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();
  const ensure = (path: string): TreeNode => {
    const found = byPath.get(path);
    if (found) return found;
    const cut = path.lastIndexOf(".");
    const node: TreeNode = { name: cut === -1 ? path : path.slice(cut + 1), path, partIndex: null, children: [] };
    byPath.set(path, node);
    if (cut === -1) roots.push(node);
    else ensure(path.slice(0, cut)).children.push(node);
    return node;
  };
  parts.forEach((p, i) => {
    ensure(p.path).partIndex = i;
  });
  const sort = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        Number(b.children.length > 0) - Number(a.children.length > 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
