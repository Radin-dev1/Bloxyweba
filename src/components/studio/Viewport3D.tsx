"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, GizmoHelper, GizmoViewcube, OrbitControls, TransformControls, useCubeTexture, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DEFAULT_ENVIRONMENT, GROUND_PRESETS, SKY_PRESETS, type Environment } from "./environment";
import type { PartEdit } from "./sceneMath";
import type { Scene, ScenePart } from "./useScene";

export type Tool = "select" | "move" | "scale" | "rotate";

export type ViewportOptions = {
  shadows: "none" | "soft";
  shadowQuality: "low" | "medium" | "high";
  showGrid: boolean;
  showViewcube: boolean;
  gridSnap: boolean;
  angleSnap: boolean;
  gizmoSpace: "auto" | "world" | "local";
};

export const DEFAULT_VIEWPORT_OPTIONS: ViewportOptions = {
  shadows: "soft",
  shadowQuality: "high",
  showGrid: true,
  showViewcube: true,
  gridSnap: true,
  angleSnap: true,
  gizmoSpace: "auto",
};

// Roblox Studio's selection blue and default Sky / Atmosphere palette.
const SELECT_BLUE = "#1aa3ff";
const SKY_TOP = "#9ac8db";
const SKY_MID = "#bbd2db";
const SKY_HORIZON = "#d6dbdb";
const ATMOSPHERE_DECAY = "#92a2b0";

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
 * The baseplate grid is composited into the top-face material on the baseplate itself.
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
 * 8 studs on the top face with Color3 (0, 0, 0) at Transparency 0.8, exactly as in a new Studio place.
 */
const BASEPLATE_TEXTURE_URL = "/roblox/baseplate.png";
// In Bloxy every baseplate is drawn in Studio's cool slate-grey (Color 91,91,91 under
// Studio's Sky + Atmosphere IBL) and stretched far past the camera's reach so nobody sees
// its edge. Display only: Studio's real part is unchanged, and Explorer/Properties still
// show its true size and color.
const BASEPLATE_COLOR = "6b778d";
const BASEPLATE_DISPLAY_SIZE = 60_000;
const FOG_NEAR = 90;
const FOG_FAR = 750;
const BASEPLATE_STUDS_PER_TILE = 8;
const BASEPLATE_TEXTURE_TRANSPARENCY = 0.8;

/**
 * Hides the repeat in photo grounds: the photo is blended with a slower, offset copy of
 * itself and gently brightened/darkened by large-scale noise, so no grid of tiles shows.
 */
function breakUpTiling(material: THREE.MeshStandardMaterial) {
  material.customProgramCacheKey = () => "bloxy-natural-ground";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        float bloxyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float bloxyNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(bloxyHash(i), bloxyHash(i + vec2(1.0, 0.0)), u.x),
                     mix(bloxyHash(i + vec2(0.0, 1.0)), bloxyHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec2 bloxyUv = vMapUv;
          // Noise in rotated domains, two octaves each, so the variation never lines up with the tiles.
          mat2 bloxyR1 = mat2(0.83, -0.56, 0.56, 0.83);
          mat2 bloxyR2 = mat2(0.36, 0.93, -0.93, 0.36);
          vec4 bloxyA = texture2D(map, bloxyUv);
          vec4 bloxyB = texture2D(map, bloxyR1 * bloxyUv * 0.37 + vec2(0.17, 0.43));
          float bloxyN = 0.6 * bloxyNoise(bloxyR1 * bloxyUv * 0.07) + 0.4 * bloxyNoise(bloxyR2 * bloxyUv * 0.19 + 3.1);
          vec4 bloxyTex = mix(bloxyA, bloxyB, smoothstep(0.25, 0.75, bloxyN));
          float bloxyShade = 0.88 + 0.24 * (0.65 * bloxyNoise(bloxyR2 * bloxyUv * 0.017 + 7.0) + 0.35 * bloxyNoise(bloxyR1 * bloxyUv * 0.05 + 1.7));
          diffuseColor *= vec4(bloxyTex.rgb * bloxyShade, bloxyTex.a);
        #endif`,
      );
  };
}

function BaseplateMesh({
  part,
  showGrid,
  env,
  onPick,
}: {
  part: ScenePart;
  showGrid: boolean;
  env: Environment;
  onPick: () => void;
}) {
  // The Environment panel can swap the ground: "roblox" keeps Studio's own texture, "plain" is a
  // flat color, the rest are real photo textures (a chosen color tints the photo).
  const preset = GROUND_PRESETS[env.ground];
  const photoUrl = preset.image;
  const groundColor = env.groundColor ?? (photoUrl ? preset.color : env.ground === "roblox" ? `#${part.color}` : preset.color);
  const tint = photoUrl ? (env.groundColor ?? "#ffffff") : "#ffffff";
  const [base, normalBase] = useTexture([photoUrl ?? BASEPLATE_TEXTURE_URL, preset.normal ?? BASEPLATE_TEXTURE_URL]);
  const gl = useThree((s) => s.gl);
  const normalTexture = useMemo(() => {
    if (!photoUrl || !preset.normal) return null;
    const t = normalBase.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    t.repeat.set(part.size[0] / env.tile, part.size[2] / env.tile);
    t.needsUpdate = true;
    return t;
  }, [normalBase, photoUrl, preset.normal, gl, part.size, env.tile]);
  const topTexture = useMemo(() => {
    if (photoUrl) {
      const t = base.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = gl.capabilities.getMaxAnisotropy();
      t.repeat.set(part.size[0] / env.tile, part.size[2] / env.tile);
      t.needsUpdate = true;
      return t;
    }
    const img = base.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
    const w = img?.width || 400;
    const h = img?.height || 400;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    // Paint the baseplate colour first, then composite Studio's black grid Texture at 20% opacity
    // into a single opaque texture so there is never a second coplanar surface to z-fight.
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, w, h);
    if (img && showGrid && env.ground === "roblox") {
      const mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
      const mctx = mask.getContext("2d")!;
      mctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
      mctx.globalCompositeOperation = "source-in";
      mctx.fillStyle = "#000000";
      mctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1 - BASEPLATE_TEXTURE_TRANSPARENCY;
      ctx.drawImage(mask, 0, 0);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    t.repeat.set(part.size[0] / (env.tile || BASEPLATE_STUDS_PER_TILE), part.size[2] / (env.tile || BASEPLATE_STUDS_PER_TILE));
    t.needsUpdate = true;
    return t;
  }, [base, gl, groundColor, part.size, showGrid, env.ground, env.tile, photoUrl]);

  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({
      color: groundColor,
      roughness: 0.6,
      metalness: 0,
    });
    const top = new THREE.MeshStandardMaterial({
      map: topTexture,
      color: tint,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: photoUrl ? 0.92 : 0.6,
      metalness: 0,
    });
    if (photoUrl) breakUpTiling(top);
    // BoxGeometry material groups: 0=+X, 1=-X, 2=+Y (top), 3=-Y (bottom), 4=+Z, 5=-Z
    return [side, side, top, side, side, side];
  }, [groundColor, topTexture, tint, photoUrl, normalTexture]);

  useEffect(
    () => () => {
      topTexture.dispose();
      normalTexture?.dispose();
      materials[0].dispose();
      materials[2].dispose();
    },
    [topTexture, normalTexture, materials],
  );

  const matrix = useMemo(() => matrixFor(part, new THREE.Matrix4()), [part]);

  return (
    <mesh
      matrix={matrix}
      matrixAutoUpdate={false}
      material={materials}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (Date.now() - lastGizmoUse < 400) return;
        onPick();
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

type Group = { key: string; shape: string; neon: boolean; transparent: boolean; indices: number[] };

export function groupParts(parts: ScenePart[], skip?: (p: ScenePart) => boolean): Group[] {
  const groups = new Map<string, Group>();
  parts.forEach((p, i) => {
    if (skip?.(p)) return;
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
  options,
  onCommit,
}: {
  part: ScenePart;
  tool: Tool;
  editable: boolean;
  options: ViewportOptions;
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
  const space = options.gizmoSpace === "auto" ? (tool === "move" ? "world" : "local") : options.gizmoSpace;

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
          space={space}
          translationSnap={options.gridSnap ? 1 : null}
          rotationSnap={options.angleSnap ? THREE.MathUtils.degToRad(15) : null}
          scaleSnap={options.gridSnap ? 0.1 : null}
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

/** Fallback sky: a screen-space gradient from Studio's sky blue to a pale misty horizon. */
function GradientSky() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.16, SKY_MID);
    g.addColorStop(0.32, SKY_HORIZON);
    g.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="background" object={texture} />;
}

/** Environment-panel skies: a real 360° panorama that turns with the camera. */
function PhotoSky({ url }: { url: string }) {
  const loaded = useTexture(url);
  const texture = useMemo(() => {
    const t = loaded.clone();
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [loaded]);
  // The sky also lights the scene (image-based lighting), like a real outdoor photo.
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { scene, invalidate } = get();
    scene.environment = texture;
    scene.environmentIntensity = 0.85;
    invalidate();
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [texture, get]);
  return <primitive attach="background" object={texture} />;
}

function SkyBackground({ sky = "studio" }: { sky?: Environment["sky"] }) {
  const image = SKY_PRESETS[sky].image;
  if (image) {
    return (
      <Suspense fallback={<GradientSky />}>
        <PhotoSky url={image} />
      </Suspense>
    );
  }
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
/** A spot the camera should swing to (e.g. where a model is being generated); key changes trigger it. */
export type ViewportFocus = { key: number; center: [number, number, number]; radius: number };

/** Glides the camera to look at `focus`, keeping the current viewing angle. */
function FocusRig({ focus }: { focus?: ViewportFocus }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!focus) return;
    const { camera, controls, invalidate } = get();
    const orbit = controls as OrbitControlsImpl | null;
    if (!orbit) return;
    const target = new THREE.Vector3(...focus.center);
    const dir = camera.position.clone().sub(orbit.target).normalize();
    const goal = target.clone().add(dir.multiplyScalar(Math.max(focus.radius * 2.2, 24)));
    const fromPos = camera.position.clone();
    const fromTarget = orbit.target.clone();
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fromPos, goal, e);
      orbit.target.lerpVectors(fromTarget, target, e);
      orbit.update();
      invalidate();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Only a new focus key moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, get]);
  return null;
}

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
  focus,
  tool,
  editable,
  options = DEFAULT_VIEWPORT_OPTIONS,
  environment = DEFAULT_ENVIRONMENT,
  onEdit,
}: {
  scene: Scene | null;
  selected: number | null;
  onSelect: (index: number | null) => void;
  fitKey: number;
  /** Swing the camera here when its key changes. */
  focus?: ViewportFocus;
  tool: Tool;
  editable: boolean;
  options?: ViewportOptions;
  environment?: Environment;
  onEdit: (index: number, edit: PartEdit) => void;
}) {
  const skyInfo = SKY_PRESETS[environment.sky];
  const parts = useMemo(() => scene?.parts ?? [], [scene]);
  const drawn = useMemo(() => parts.map(displayPart), [parts]);
  const groups = useMemo(() => groupParts(drawn, isBaseplate), [drawn]);
  const baseplates = useMemo(() => drawn.filter(isBaseplate), [drawn]);
  const selectedPart = selected !== null ? parts[selected] : undefined;
  const shadowSize = options.shadowQuality === "low" ? 512 : options.shadowQuality === "medium" ? 1024 : 2048;

  return (
    <Canvas
      frameloop="demand"
      shadows={options.shadows !== "none"}
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.5, far: 20000, position: [60, 45, 60] }}
      onPointerMissed={(e) => {
        // A click on empty sky deselects, like Studio. Ignore gizmo drags that end off-part.
        if (e.type === "click" && Date.now() - lastGizmoUse > 400) onSelect(null);
      }}
      gl={{ antialias: true }}
    >
      <SkyBackground sky={environment.sky} />
      {environment.fog.enabled && (
        <fog
          key={`${environment.fog.color}-${environment.sky}`}
          attach="fog"
          args={[
            environment.fog.color ?? (environment.sky === "studio" ? ATMOSPHERE_DECAY : skyInfo.fog),
            environment.fog.near ?? FOG_NEAR,
            Math.max((environment.fog.near ?? FOG_NEAR) + 10, environment.fog.far ?? FOG_FAR),
          ]}
        />
      )}
      <hemisphereLight args={[skyInfo.hemiSky, skyInfo.hemiGround, skyInfo.hemi]} key={environment.sky} />
      <directionalLight
        position={[140, 260, 90]}
        color={skyInfo.sun}
        intensity={skyInfo.sunIntensity}
        castShadow={options.shadows !== "none"}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-mapSize={[shadowSize, shadowSize]}
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
          // Like Studio's Locked Baseplate: clicking it deselects instead of grabbing it.
          <BaseplateMesh key={p.path} part={p} showGrid={options.showGrid} env={environment} onPick={() => onSelect(null)} />
        ))}
      </Suspense>
      {selected !== null && selectedPart && (
        <SelectionGizmo
          key={selected}
          part={selectedPart}
          tool={tool}
          editable={editable}
          options={options}
          onCommit={(edit) => onEdit(selected, edit)}
        />
      )}

      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI * 0.495} />
      <CameraRig scene={scene} fitKey={fitKey} />
      <FocusRig focus={focus} />

      {options.showViewcube && (
        <GizmoHelper alignment="bottom-right" margin={[78, 126]}>
          <GizmoViewcube
            color="#1c1f27"
            textColor="#e8ecf4"
            strokeColor="#3b4252"
            hoverColor={SELECT_BLUE}
            opacity={0.92}
            font="600 18px system-ui, sans-serif"
          />
        </GizmoHelper>
      )}
    </Canvas>
  );
}
