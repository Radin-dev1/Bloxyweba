"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={object} />;
}

/** Interactive preview of a real mesh (GLB), framed automatically. */
export default function GlbPreview({ url }: { url: string }) {
  return (
    <Canvas camera={{ fov: 35, position: [6, 4, 8] }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#dfe9f8"]} />
      <hemisphereLight args={["#ffffff", "#8a8f99", 1.2]} />
      <directionalLight position={[6, 10, 6]} intensity={2.2} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.25}>
          <Model url={url} />
        </Bounds>
      </Suspense>
      <OrbitControls makeDefault enablePan={false} />
    </Canvas>
  );
}
