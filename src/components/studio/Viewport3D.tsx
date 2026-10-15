"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Grid, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Scene, ScenePart } from "./useScene";

// ── Geometry per Roblox shape, built once at unit size and scaled per instance ──

function wedgeGeometry() {
  // Roblox WedgePart: flat bottom, tall back face at +Z, slope down to the front edge at -Z.
  const g = new THREE.BufferGeometry();
  const L = -0.5, R = 0.5;
  const v = [
    // left side triangle (x = -0.5)
    [L, -0.5, -0.5], [L, -0.5, 0.5], [L, 0.5, 0.5],
    // right side triangle (x = 0.5)
    [R, -0.5, -0.5], [R, 0.5, 0.5], [R, -0.5, 0.5],
    // bottom
    [L, -0.5, -0.5], [R, -0.5, -0.5], [R, -0.5, 0.5], [L, -0.5, -0.5], [R, -0.5, 0.5], [L, -0.5, 0.5],
    // back
    [L, -0.5, 0.5], [R, -0.5, 0.5], [R, 0.5, 0.5], [L, -0.5, 0.5], [R, 0.5, 0.5], [L, 0.5, 0.5],
    // slope
    [L, -0.5, -0.5], [L, 0.5, 0.5], [R, 0.5, 0.5], [L, -0.5, -0.5], [R, 0.5, 0.5], [R, -0.5, -0.5],
  ].flat();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

const GEOMETRY: Record<string, () => THREE.BufferGeometry> = {
  Block: () => new THREE.BoxGeometry(1, 1, 1),
  Ball: () => new THREE.SphereGeometry(0.5, 28, 18),
  Cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateZ(Math.PI / 2), // Roblox cylinders run along X
  Wedge: wedgeGeometry,
};

function shapeKey(shape: string) {
  return shape in GEOMETRY ? shape : "Block"; // Mesh, CornerWedge, Truss… drawn as their bounding box
}

const TRANSPARENT_MATERIALS = new Set(["Glass", "ForceField"]);

function matrixFor(p: ScenePart, out: THREE.Matrix4) {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = p.cframe;
  out.set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
  let [sx, sy, sz] = p.size;
  if (p.shape === "Ball") sx = sy = sz = Math.min(sx, sy, sz);
  if (p.shape === "Cylinder") sy = sz = Math.min(sy, sz);
  return out.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
}

type Group = { key: string; shape: string; neon: boolean; transparent: boolean; indices: number[] };

function groupParts(parts: ScenePart[]): Group[] {
  const groups = new Map<string, Group>();
  parts.forEach((p, i) => {
    const shape = shapeKey(p.shape);
    const neon = p.material === "Neon";
    const transparent = p.transparency > 0.05 || TRANSPARENT_MATERIALS.has(p.material);
    const key = `${shape}|${neon}|${transparent}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, shape, neon, transparent, indices: [] }));
    g.indices.push(i);
  });
  return [...groups.values()];
}

function PartGroup({
  group,
  parts,
  onPick,
}: {
  group: Group;
  parts: ScenePart[];
  onPick: (index: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => GEOMETRY[group.shape](), [group.shape]);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    group.indices.forEach((partIndex, i) => {
      const p = parts[partIndex];
      mesh.setMatrixAt(i, matrixFor(p, m));
      mesh.setColorAt(i, c.set(`#${p.color}`));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [group, parts, invalidate]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, group.indices.length]}
      castShadow={!group.transparent}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onPick(group.indices[e.instanceId]);
      }}
    >
      {group.neon ? (
        <meshBasicMaterial toneMapped={false} transparent={group.transparent} opacity={group.transparent ? 0.6 : 1} />
      ) : (
        <meshStandardMaterial
          roughness={0.72}
          metalness={0.05}
          transparent={group.transparent}
          opacity={group.transparent ? 0.45 : 1}
          depthWrite={!group.transparent}
        />
      )}
    </instancedMesh>
  );
}

function Selection({ part }: { part: ScenePart }) {
  const matrix = useMemo(() => matrixFor(part, new THREE.Matrix4()), [part]);
  const invalidate = useThree((s) => s.invalidate);
  // frameloop="demand": draw a frame when the highlight appears or moves.
  useEffect(() => {
    invalidate();
    return () => invalidate();
  }, [matrix, invalidate]);
  return (
    <mesh matrix={matrix} matrixAutoUpdate={false} raycast={() => null} renderOrder={10}>
      <boxGeometry args={[1.08, 1.08, 1.08]} />
      <meshBasicMaterial color="#2f7dff" transparent opacity={0.22} depthWrite={false} depthTest={false} />
      <Edges color="#a9c9ff" threshold={15} renderOrder={11} />
    </mesh>
  );
}

/**
 * Frames the camera on the scene: Studio's own camera on first load, the bounding box
 * when the user asks to re-frame (fitKey > 0). Refreshes after edits keep the view.
 */
function CameraRig({ scene, fitKey }: { scene: Scene | null; fitKey: number }) {
  // three.js objects are mutable by design; read them from the store inside the effect.
  const get = useThree((s) => s.get);
  const controlsReady = useThree((s) => !!s.controls);
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    const { camera, controls, invalidate } = get();
    const orbit = controls as OrbitControlsImpl | null;
    // Demo and live scenes are framed separately, so connecting Studio re-frames once.
    const key = scene ? `${fitKey}|${scene.fetchedAt === 0 ? "demo" : "live"}` : null;
    if (!scene || !orbit || fittedFor.current === key) return;
    fittedFor.current = key;

    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const p of scene.parts) {
      const half = Math.max(...p.size) / 2;
      v.set(p.cframe[0], p.cframe[1], p.cframe[2]);
      box.expandByPoint(v.clone().addScalar(half));
      box.expandByPoint(v.clone().addScalar(-half));
    }
    if (scene.camera && fitKey === 0) {
      camera.position.set(...scene.camera.position);
      orbit.target.set(...scene.camera.target);
    } else if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 8);
      camera.position.copy(center).add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(radius * 1.8));
      orbit.target.copy(center);
    }
    camera.far = Math.max(5000, box.isEmpty() ? 0 : box.getSize(v).length() * 6);
    camera.updateProjectionMatrix();
    orbit.update();
    invalidate();
  }, [scene, fitKey, get, controlsReady]);

  return null;
}

export default function Viewport3D({
  scene,
  selected,
  onSelect,
  fitKey,
}: {
  scene: Scene | null;
  selected: number | null;
  onSelect: (index: number | null) => void;
  fitKey: number;
}) {
  const parts = useMemo(() => scene?.parts ?? [], [scene]);
  const groups = useMemo(() => groupParts(parts), [parts]);
  const floorY = useMemo(() => {
    let min = Infinity;
    for (const p of parts) min = Math.min(min, p.cframe[1] - p.size[1] / 2);
    return Number.isFinite(min) ? min - 0.02 : 0;
  }, [parts]);

  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 5000, position: [60, 45, 60] }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0a0c12"]} />
      <fog attach="fog" args={["#0a0c12", 400, 2200]} />
      <hemisphereLight args={["#cfe0ff", "#20222c", 1.1]} />
      <directionalLight
        position={[120, 200, 80]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-far={800}
      />
      <ambientLight intensity={0.25} />

      {groups.map((g) => (
        <PartGroup key={`${scene?.fetchedAt}-${g.key}`} group={g} parts={parts} onPick={(i) => onSelect(i)} />
      ))}
      {selected !== null && parts[selected] && <Selection part={parts[selected]} />}

      <Grid
        position={[0, floorY, 0]}
        args={[10, 10]}
        cellSize={4}
        cellThickness={0.6}
        cellColor="#1d2333"
        sectionSize={32}
        sectionThickness={1}
        sectionColor="#2f4f8f"
        fadeDistance={900}
        fadeStrength={1.2}
        infiniteGrid
        followCamera={false}
      />

      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI * 0.495} />
      <CameraRig scene={scene} fitKey={fitKey} />
    </Canvas>
  );
}
