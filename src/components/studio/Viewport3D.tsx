"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PartEdit } from "./sceneMath";
import type { Scene, ScenePart } from "./useScene";

export type Tool = "select" | "move" | "scale" | "rotate";

// Roblox Studio's selection blue.
const SELECT_BLUE = "#1aa3ff";
const SKY_TOP = "#76a9ee";
const SKY_HORIZON = "#e4eefc";

// ── Geometry per Roblox shape, built once at unit size and scaled per instance ──

function wedgeGeometry() {
  // Roblox WedgePart: flat bottom, tall back face at +Z, slope down to the front edge at -Z.
  const g = new THREE.BufferGeometry();
  const L = -0.5,
    R = 0.5;
  const v = [
    [L, -0.5, -0.5],
    [L, -0.5, 0.5],
    [L, 0.5, 0.5], // left side (x = -0.5)
    [R, -0.5, -0.5],
    [R, 0.5, 0.5],
    [R, -0.5, 0.5], // right side (x = 0.5)
    [L, -0.5, -0.5],
    [R, -0.5, -0.5],
    [R, -0.5, 0.5],
    [L, -0.5, -0.5],
    [R, -0.5, 0.5],
    [L, -0.5, 0.5], // bottom
    [L, -0.5, 0.5],
    [R, -0.5, 0.5],
    [R, 0.5, 0.5],
    [L, -0.5, 0.5],
    [R, 0.5, 0.5],
    [L, 0.5, 0.5], // back
    [L, -0.5, -0.5],
    [L, 0.5, 0.5],
    [R, 0.5, 0.5],
    [L, -0.5, -0.5],
    [R, 0.5, 0.5],
    [R, -0.5, -0.5], // slope
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

// A gizmo drag that ends over empty sky still fires a "missed" click; ignore those.
let lastGizmoUse = 0;

function matrixFor(p: ScenePart, out: THREE.Matrix4) {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = p.cframe;
  out.set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
  let [sx, sy, sz] = p.size;
  if (p.shape === "Ball") sx = sy = sz = Math.min(sx, sy, sz);
  if (p.shape === "Cylinder") sy = sz = Math.min(sy, sz);
  return out.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
}

/**
 * Standard material with Studio's look: a faint world-aligned grid every 4 studs on
 * every surface, like the default baseplate texture, so scale reads at a glance.
 */
function studioMaterial(transparent: boolean) {
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.78,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.45 : 1,
    depthWrite: !transparent,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;\nvarying vec3 vGridNormal;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          mat4 gridModel = modelMatrix * instanceMatrix;
        #else
          mat4 gridModel = modelMatrix;
        #endif
        vGridPos = (gridModel * vec4(transformed, 1.0)).xyz;
        vGridNormal = normalize(mat3(gridModel) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGridPos;
        varying vec3 vGridNormal;
        float bloxyLine(float c) {
          float g = c / 4.0;
          float w = max(fwidth(g), 1e-4);
          return 1.0 - smoothstep(0.0, w * 1.25, abs(fract(g - 0.5) - 0.5));
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 an = abs(vGridNormal);
        vec2 gp = (an.x > an.y && an.x > an.z) ? vGridPos.yz : ((an.y > an.z) ? vGridPos.xz : vGridPos.xy);
        float gl = max(bloxyLine(gp.x), bloxyLine(gp.y));
        diffuseColor.rgb *= 1.0 - 0.14 * gl;`,
      );
  };
  m.customProgramCacheKey = () => `bloxy-grid-${transparent}`;
  return m;
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

function PartGroup({ group, parts, onPick }: { group: Group; parts: ScenePart[]; onPick: (index: number) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => GEOMETRY[group.shape](), [group.shape]);
  const material = useMemo(
    () =>
      group.neon
        ? new THREE.MeshBasicMaterial({
            toneMapped: false,
            transparent: group.transparent,
            opacity: group.transparent ? 0.6 : 1,
          })
        : studioMaterial(group.transparent),
    [group.neon, group.transparent],
  );
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

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, group.indices.length]}
      castShadow={!group.transparent}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // The click that ends a gizmo drag lands on whatever is under the cursor; ignore it.
        if (Date.now() - lastGizmoUse < 400) return;
        if (e.instanceId !== undefined) onPick(group.indices[e.instanceId]);
      }}
    />
  );
}

/**
 * The selected part: a blue Studio-style selection box on a proxy object that the
 * Move/Scale/Rotate gizmo drives. The edit is committed when the drag ends.
 */
function SelectionGizmo({
  part,
  tool,
  editable,
  onCommit,
}: {
  part: ScenePart;
  tool: Tool;
  editable: boolean;
  onCommit: (edit: PartEdit) => void;
}) {
  const proxy = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  // Snap the proxy to the part whenever the part changes (not while dragging).
  useLayoutEffect(() => {
    const g = proxy.current;
    if (!g) return;
    const m = new THREE.Matrix4();
    const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = part.cframe;
    m.set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
    m.decompose(g.position, g.quaternion, new THREE.Vector3());
    g.scale.set(...part.size);
    invalidate();
    return () => invalidate();
  }, [part, invalidate]);

  const commit = () => {
    const g = proxy.current;
    if (!g) return;
    const e = new THREE.Euler().setFromQuaternion(g.quaternion, "YXZ");
    const deg = (r: number) => Math.round(THREE.MathUtils.radToDeg(r) * 1000) / 1000 || 0;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    if (tool === "move") onCommit({ position: [r(g.position.x), r(g.position.y), r(g.position.z)] });
    if (tool === "rotate") onCommit({ orientationDeg: [deg(e.x), deg(e.y), deg(e.z)] });
    if (tool === "scale") {
      onCommit({
        size: [
          Math.max(0.05, r(Math.abs(g.scale.x))),
          Math.max(0.05, r(Math.abs(g.scale.y))),
          Math.max(0.05, r(Math.abs(g.scale.z))),
        ],
      });
    }
  };

  const mode = tool === "move" ? "translate" : tool === "rotate" ? "rotate" : "scale";

  return (
    <>
      <group ref={proxy}>
        <mesh raycast={() => null} renderOrder={10}>
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial color={SELECT_BLUE} transparent opacity={0.1} depthWrite={false} depthTest={false} />
          <Edges color={SELECT_BLUE} threshold={15} renderOrder={11} />
        </mesh>
      </group>
      {editable && tool !== "select" && (
        <TransformControls
          object={proxy as React.RefObject<THREE.Object3D>}
          mode={mode}
          space={tool === "move" ? "world" : "local"}
          translationSnap={1}
          rotationSnap={THREE.MathUtils.degToRad(15)}
          scaleSnap={0.1}
          size={0.85}
          onObjectChange={() => invalidate()}
          onMouseDown={() => (lastGizmoUse = Date.now())}
          onMouseUp={() => {
            lastGizmoUse = Date.now();
            commit();
          }}
        />
      )}
    </>
  );
}

/** Roblox's default sky: a screen-space gradient from blue to a pale horizon. */
function SkyBackground() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.62, SKY_HORIZON);
    g.addColorStop(1, "#f3f6fb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="background" object={texture} />;
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
  tool,
  editable,
  onEdit,
}: {
  scene: Scene | null;
  selected: number | null;
  onSelect: (index: number | null) => void;
  fitKey: number;
  tool: Tool;
  editable: boolean;
  onEdit: (index: number, edit: PartEdit) => void;
}) {
  const parts = useMemo(() => scene?.parts ?? [], [scene]);
  const groups = useMemo(() => groupParts(parts), [parts]);
  const floorY = useMemo(() => {
    let min = Infinity;
    for (const p of parts) min = Math.min(min, p.cframe[1] - p.size[1] / 2);
    return Number.isFinite(min) ? min - 0.02 : 0;
  }, [parts]);
  const selectedPart = selected !== null ? parts[selected] : undefined;

  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 5000, position: [60, 45, 60] }}
      onPointerMissed={(e) => {
        // A click on empty sky deselects, like Studio. Ignore gizmo drags that end off-part.
        if (e.type === "click" && Date.now() - lastGizmoUse > 400) onSelect(null);
      }}
      gl={{ antialias: true }}
    >
      <SkyBackground />
      <fog attach="fog" args={[SKY_HORIZON, 700, 2800]} />
      <hemisphereLight args={["#ffffff", "#9aa6b8", 1.15]} />
      <directionalLight
        position={[140, 260, 90]}
        color="#fff3df"
        intensity={2.3}
        castShadow
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-far={900}
      />
      <ambientLight intensity={0.18} />

      {groups.map((g) => (
        <PartGroup key={`${scene?.fetchedAt}-${g.key}`} group={g} parts={parts} onPick={(i) => onSelect(i)} />
      ))}
      {selected !== null && selectedPart && (
        <SelectionGizmo
          key={selected}
          part={selectedPart}
          tool={tool}
          editable={editable}
          onCommit={(edit) => onEdit(selected, edit)}
        />
      )}

      <Grid
        position={[0, floorY, 0]}
        args={[10, 10]}
        cellSize={4}
        cellThickness={0.7}
        cellColor="#aab6c8"
        sectionSize={32}
        sectionThickness={1.1}
        sectionColor="#8193b0"
        fadeDistance={1100}
        fadeStrength={1.4}
        infiniteGrid
        followCamera={false}
      />

      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI * 0.495} />
      <CameraRig scene={scene} fitKey={fitKey} />

      <GizmoHelper alignment="bottom-right" margin={[84, 150]}>
        <GizmoViewcube
          color="#1c1f27"
          textColor="#e8ecf4"
          strokeColor="#3b4252"
          hoverColor={SELECT_BLUE}
          opacity={0.92}
          font="600 18px system-ui, sans-serif"
        />
      </GizmoHelper>
    </Canvas>
  );
}
