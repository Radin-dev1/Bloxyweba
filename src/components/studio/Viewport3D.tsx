"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, GizmoHelper, GizmoViewcube, OrbitControls, TransformControls, useCubeTexture, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
 * Roblox plastic: plain, slightly glossy, no surface grid (modern Studio parts are smooth).
 * The baseplate's grid comes from its own Texture, drawn by <BaseplateTexture>.
 */
function plasticMaterial(transparent: boolean) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0,
    transparent,
    opacity: transparent ? 0.45 : 1,
    depthWrite: !transparent,
  });
}

/** Studio's default Baseplate is a Block named "Baseplate" with the grid Texture on top. */
export function isBaseplate(p: ScenePart) {
  return p.shape === "Block" && /(^|\.)Baseplate$/.test(p.path);
}

/** How a part is drawn: baseplates get Bloxy's endless grey look, everything else as-is. */
function displayPart(p: ScenePart): ScenePart {
  if (!isBaseplate(p)) return p;
  return {
    ...p,
    color: BASEPLATE_COLOR,
    size: [Math.max(p.size[0], BASEPLATE_DISPLAY_SIZE), p.size[1], Math.max(p.size[2], BASEPLATE_DISPLAY_SIZE)],
  };
}

/**
 * Roblox's baseplate Texture (rbxassetid://6372755229, exported from Studio), tiled every
 * 8 studs on the top face at Transparency 0.8, exactly as in a new Studio place.
 */
const BASEPLATE_TEXTURE_URL = "/roblox/baseplate.png";
// In Bloxy every baseplate is drawn in Studio's default grey and stretched far past the
// camera's reach so nobody sees its edge. Display only: Studio's real part is unchanged,
// and Explorer/Properties still show its true size and color.
const BASEPLATE_COLOR = "5b5b5b";
const BASEPLATE_DISPLAY_SIZE = 60_000;
const FOG_NEAR = 1_500;
const FOG_FAR = 9_000;
const BASEPLATE_STUDS_PER_TILE = 8;
const BASEPLATE_TEXTURE_TRANSPARENCY = 0.8;

function BaseplateTexture({ part }: { part: ScenePart }) {
  const base = useTexture(BASEPLATE_TEXTURE_URL);
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    t.repeat.set(part.size[0] / BASEPLATE_STUDS_PER_TILE, part.size[2] / BASEPLATE_STUDS_PER_TILE);
    t.needsUpdate = true;
    return t;
  }, [base, gl, part.size]);
  useEffect(() => () => texture.dispose(), [texture]);

  // Unit plane on the part's top face, transformed by the part's CFrame and size.
  const matrix = useMemo(() => {
    const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = part.cframe;
    const m = new THREE.Matrix4().set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
    return m
      .multiply(new THREE.Matrix4().makeScale(part.size[0], part.size[1], part.size[2]))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  }, [part]);

  return (
    <mesh matrix={matrix} matrixAutoUpdate={false} receiveShadow raycast={() => null} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={texture}
        transparent
        opacity={1 - BASEPLATE_TEXTURE_TRANSPARENCY}
        roughness={0.6}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

type Group = { key: string; shape: string; neon: boolean; transparent: boolean; indices: number[] };

export function groupParts(parts: ScenePart[]): Group[] {
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

export function PartGroup({ group, parts, onPick }: { group: Group; parts: ScenePart[]; onPick: (index: number) => void }) {
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
        : plasticMaterial(group.transparent),
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

/**
 * Roblox Sky faces (Sky.SkyboxRt/Lf/Up/Dn/Bk/Ft), saved as public/roblox/sky/<face>.png.
 * Set to true once the six images are in place; until then a gradient stands in.
 * three.js cube order is +X, -X, +Y, -Y, +Z, -Z; Roblox's "front" faces -Z.
 */
const HAS_SKYBOX = false;
const SKYBOX_FACES = ["rt.png", "lf.png", "up.png", "dn.png", "bk.png", "ft.png"];

function RobloxSkybox() {
  const loaded = useCubeTexture(SKYBOX_FACES, { path: "/roblox/sky/" });
  const cube = useMemo(() => {
    const c = loaded.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    c.needsUpdate = true;
    return c;
  }, [loaded]);
  return <primitive attach="background" object={cube} />;
}

/** Fallback sky: a screen-space gradient from Studio blue to a pale horizon. */
function GradientSky() {
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

function SkyBackground() {
  if (!HAS_SKYBOX) return <GradientSky />;
  return (
    <Suspense fallback={<GradientSky />}>
      <RobloxSkybox />
    </Suspense>
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
    const framed = scene.parts.filter((p) => Math.max(...p.size) < 512);
    for (const p of framed.length ? framed : scene.parts) {
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
    camera.far = Math.max(20000, box.isEmpty() ? 0 : box.getSize(v).length() * 6);
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
  const drawn = useMemo(() => parts.map(displayPart), [parts]);
  const groups = useMemo(() => groupParts(drawn), [drawn]);
  const baseplates = useMemo(() => drawn.filter(isBaseplate), [drawn]);
  const selectedPart = selected !== null ? parts[selected] : undefined;

  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.5, far: 20000, position: [60, 45, 60] }}
      onPointerMissed={(e) => {
        // A click on empty sky deselects, like Studio. Ignore gizmo drags that end off-part.
        if (e.type === "click" && Date.now() - lastGizmoUse > 400) onSelect(null);
      }}
      gl={{ antialias: true }}
    >
      <SkyBackground />
      <fog attach="fog" args={[SKY_HORIZON, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight args={["#ffffff", "#8a8f99", 1.05]} />
      <directionalLight
        position={[140, 260, 90]}
        color="#ffffff"
        intensity={2.1}
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
        <PartGroup
          key={`${scene?.fetchedAt}-${g.key}`}
          group={g}
          parts={drawn}
          // Like Studio's Locked Baseplate: clicking it deselects instead of grabbing it.
          onPick={(i) => onSelect(isBaseplate(parts[i]) ? null : i)}
        />
      ))}
      <Suspense fallback={null}>
        {baseplates.map((p) => (
          <BaseplateTexture key={p.path} part={p} />
        ))}
      </Suspense>
      {selected !== null && selectedPart && (
        <SelectionGizmo
          key={selected}
          part={selectedPart}
          tool={tool}
          editable={editable}
          onCommit={(edit) => onEdit(selected, edit)}
        />
      )}

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
