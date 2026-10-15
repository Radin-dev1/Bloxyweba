"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BuildT } from "@/lib/openrouter";
import { composeCFrame } from "../sceneMath";
import type { ScenePart } from "../useScene";
import { PartGroup, groupParts } from "../Viewport3D";

/** A generated build as scene parts (so it renders exactly like the workspace). */
export function buildToParts(build: BuildT, origin: [number, number, number] = [0, 0, 0]): ScenePart[] {
  return build.parts.map((p, i) => ({
    path: `Workspace.${build.name}.${p.name || `Part${i + 1}`}`,
    shape: p.shape,
    size: p.size,
    cframe: composeCFrame(
      [p.position[0] + origin[0], p.position[1] + origin[1], p.position[2] + origin[2]],
      p.rotation,
    ),
    color: p.color,
    transparency: p.transparency,
    material: p.material,
  }));
}

function Fit({ parts }: { parts: ScenePart[] }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { camera, controls, invalidate } = get();
    const box = new THREE.Box3();
    for (const p of parts) {
      const h = Math.max(...p.size) / 2;
      const c = new THREE.Vector3(p.cframe[0], p.cframe[1], p.cframe[2]);
      box.expandByPoint(c.clone().addScalar(h)).expandByPoint(c.clone().addScalar(-h));
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 2);
    camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1.2).normalize().multiplyScalar(r * 2.1));
    camera.lookAt(center);
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    orbit?.target.copy(center);
    orbit?.update();
    invalidate();
  }, [parts, get]);
  return null;
}

export default function ModelPreview({ build }: { build: BuildT }) {
  const parts = useMemo(() => buildToParts(build), [build]);
  const groups = useMemo(() => groupParts(parts), [parts]);
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.1, far: 4000, position: [20, 15, 20] }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#cfdcf0"]} />
      <hemisphereLight args={["#ffffff", "#8a8f99", 1.1]} />
      <directionalLight position={[40, 80, 30]} intensity={2} />
      {groups.map((g) => (
        <PartGroup key={g.key} group={g} parts={parts} onPick={() => {}} />
      ))}
      <OrbitControls makeDefault enableDamping={false} />
      <Fit parts={parts} />
    </Canvas>
  );
}
