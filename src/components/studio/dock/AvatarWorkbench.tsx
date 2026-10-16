"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GEN_DEFAULTS, type BuildT } from "@/lib/openrouter";
import { Chip, DoodlePad, ErrorNote, GLYPHS, GenError, Glyph, IDEAS, postGen, randomOf, readImage } from "./shared";

// ── R6 layout in studs (Roblox R6: 2x2x1 torso, 1x2x1 limbs, head on top) ──

type PartKey = "head" | "torso" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

const R6: Record<PartKey, { size: [number, number, number]; pos: [number, number, number]; rect: [number, number, number, number] }> = {
  // rect = front-face region in studs: [x0, x1, y0, y1] (viewer's left = -x)
  head: { size: [1.2, 1.2, 1.2], pos: [0, 4.6, 0], rect: [-0.6, 0.6, 4, 5.2] },
  torso: { size: [2, 2, 1], pos: [0, 3, 0], rect: [-1, 1, 2, 4] },
  rightArm: { size: [1, 2, 1], pos: [-1.5, 3, 0], rect: [-2, -1, 2, 4] },
  leftArm: { size: [1, 2, 1], pos: [1.5, 3, 0], rect: [1, 2, 2, 4] },
  rightLeg: { size: [1, 2, 1], pos: [-0.5, 1, 0], rect: [-1, 0, 0, 2] },
  leftLeg: { size: [1, 2, 1], pos: [0.5, 1, 0], rect: [0, 1, 0, 2] },
};
const KEYS = Object.keys(R6) as PartKey[];
const SKIN = "#c9d0dc";

// The generated image shows the character front-on, filling the frame top to bottom.
// Map a stud rectangle to image pixels (character height 5.2 studs, width 4 studs, centered).
function cropRect(img: HTMLImageElement, rect: [number, number, number, number]) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const charW = (4 / 5.2) * h;
  const left = (w - charW) / 2;
  const toX = (sx: number) => left + ((sx + 2) / 4) * charW;
  const toY = (sy: number) => (1 - sy / 5.2) * h;
  const [x0, x1, y0, y1] = rect;
  return { sx: toX(x0), sy: toY(y1), sw: toX(x1) - toX(x0), sh: toY(y0) - toY(y1) };
}

type Skin = { front: Partial<Record<PartKey, THREE.Texture>>; colors: Partial<Record<PartKey, string>> };

/** Cuts the outfit image into per-part front textures and average colors. */
function useOutfit(image: string | null, torsoOn: boolean, legsOn: boolean): Skin {
  const [skin, setSkin] = useState<Skin>({ front: {}, colors: {} });
  useEffect(() => {
    if (!image) {
      const t = setTimeout(() => setSkin({ front: {}, colors: {} }), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const front: Skin["front"] = {};
      const colors: Skin["colors"] = {};
      for (const k of KEYS) {
        const shirt = k === "torso" || k === "rightArm" || k === "leftArm";
        const pants = k === "rightLeg" || k === "leftLeg";
        if ((shirt && !torsoOn) || (pants && !legsOn)) continue;
        const r = cropRect(img, R6[k].rect);
        const c = document.createElement("canvas");
        c.width = 128;
        c.height = Math.round((128 * R6[k].size[1]) / R6[k].size[0]);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        front[k] = tex;
        const one = document.createElement("canvas");
        one.width = one.height = 1;
        const o = one.getContext("2d")!;
        o.drawImage(c, 0, 0, 1, 1);
        const [rr, gg, bb] = o.getImageData(0, 0, 1, 1).data;
        colors[k] = `#${[rr, gg, bb].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      }
      setSkin({ front, colors });
    };
    img.src = image;
    return () => {
      alive = false;
    };
  }, [image, torsoOn, legsOn]);
  return skin;
}

function Limb({ k, skin, swing }: { k: PartKey; skin: Skin; swing: number }) {
  const ref = useRef<THREE.Group>(null);
  const { size, pos } = R6[k];
  const color = skin.colors[k] ?? SKIN;
  const front = skin.front[k];
  // Limbs swing from the shoulder/hip (top of the part).
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.x = swing ? Math.sin(clock.elapsedTime * 5) * 0.6 * swing : 0;
  });
  const materials = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map(
        (i) =>
          new THREE.MeshStandardMaterial({
            color: i === 4 && front ? "#ffffff" : color,
            map: i === 4 ? (front ?? null) : null,
            roughness: 0.7,
          }),
      ),
    [color, front],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group ref={ref} position={[pos[0], pos[1] + size[1] / 2, pos[2]]}>
      <mesh position={[0, -size[1] / 2, 0]} material={materials} castShadow>
        <boxGeometry args={size} />
      </mesh>
    </group>
  );
}

function Avatar({ skin, animate }: { skin: Skin; animate: boolean }) {
  return (
    <group position={[0, -2.6, 0]}>
      {/* The rounded head takes the average color of its region (its UVs don't suit a face crop). */}
      <RoundedBox args={R6.head.size} radius={0.28} position={R6.head.pos} castShadow>
        <meshStandardMaterial color={skin.colors.head ?? SKIN} roughness={0.7} />
      </RoundedBox>
      <Limb k="torso" skin={skin} swing={0} />
      <Limb k="rightArm" skin={skin} swing={animate ? 1 : 0} />
      <Limb k="leftArm" skin={skin} swing={animate ? -1 : 0} />
      <Limb k="rightLeg" skin={skin} swing={animate ? -0.8 : 0} />
      <Limb k="leftLeg" skin={skin} swing={animate ? 0.8 : 0} />
    </group>
  );
}

/** The avatar as a Roblox model (anchored parts colored from the outfit) for the place. */
function avatarBuild(skin: Skin): BuildT {
  const names: Record<PartKey, string> = {
    head: "Head",
    torso: "Torso",
    rightArm: "Right Arm",
    leftArm: "Left Arm",
    rightLeg: "Right Leg",
    leftLeg: "Left Leg",
  };
  return {
    name: "BloxyAvatar",
    parts: KEYS.map((k) => ({
      name: names[k],
      shape: "Block" as const,
      size: k === "head" ? ([2, 1, 1] as [number, number, number]) : R6[k].size,
      position: k === "head" ? ([0, 4.5, 0] as [number, number, number]) : R6[k].pos,
      rotation: [0, 0, 0] as [number, number, number],
      color: (skin.colors[k] ?? SKIN).replace("#", ""),
      material: "SmoothPlastic",
      transparency: 0,
    })),
  };
}

export default function AvatarWorkbench({
  openrouterKey,
  connected,
  onInsertBuild,
  onSpent,
  onNeedsKey,
  onClose,
}: {
  openrouterKey: string;
  connected: boolean;
  onInsertBuild: (build: BuildT) => Promise<string>;
  onSpent: () => void;
  onNeedsKey: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [torsoOn, setTorsoOn] = useState(true);
  const [legsOn, setLegsOn] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState<"gen" | "insert" | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [inserted, setInserted] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const skin = useOutfit(image, torsoOn, legsOn);

  const fail = (err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e instanceof GenError && e.status === 400 && e.message.includes("OpenRouter")) onNeedsKey();
    setError(e);
  };

  const generate = async (desc = prompt) => {
    const text = desc.trim();
    if (!text || busy) return;
    setError(null);
    setBusy("gen");
    try {
      const r = await postGen<{ images: string[] }>("/api/gen/image", {
        apiKey: openrouterKey,
        model: GEN_DEFAULTS.image,
        prompt: `Front view of a blocky Roblox R6 avatar wearing: ${text}. Orthographic, flat even lighting, standing straight, arms straight down at the sides, legs together, the whole body fills the image from the top of the head to the feet, plain light grey background, no text.`,
      });
      setImage(r.images[0]);
      setInserted(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
      onSpent();
    }
  };

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImage(await readImage(f));
      setError(null);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <>
      {/* Avatar stage over the workspace (left of the panel) */}
      <div className="pointer-events-auto absolute inset-y-16 left-16 right-[420px] z-10 hidden md:block">
        <Canvas camera={{ fov: 35, position: [-5, 2.2, 11.5] }} gl={{ alpha: true, antialias: true }} shadows>
          <hemisphereLight args={["#ffffff", "#8a8f99", 1.1]} />
          <directionalLight position={[4, 8, 6]} intensity={2} castShadow />
          <Avatar skin={skin} animate={animate} />
          <OrbitControls enablePan={false} minDistance={6} maxDistance={20} target={[0, 0, 0]} />
        </Canvas>
      </div>

      {/* Workbench panel */}
      <aside
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void loadFile(e.dataTransfer.files?.[0]);
        }}
        className={`absolute top-20 right-4 bottom-28 z-20 flex w-[min(400px,calc(100vw-2rem))] flex-col rounded-[1.4rem] border bg-[#1a1d23]/96 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl ${dragOver ? "border-signal" : "border-white/10"}`}
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="grid size-8 place-items-center rounded-full bg-white/10">
            <Glyph d="M12 4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z M6 21v-5l-2-6h16l-2 6v5 M9 10v11 M15 10v11" className="size-4" />
          </span>
          <h2 className="flex-1 text-center font-display text-lg font-bold tracking-tight text-white">Workbench</h2>
          <button type="button" aria-label="Close workbench" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            <Glyph d={GLYPHS.x} className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-4">
          {drawing ? (
            <div className="w-full">
              <p className="mb-2 text-center text-xs text-white/45">Draw the outfit front-on: head at the top, feet at the bottom.</p>
              <DoodlePad
                onCancel={() => setDrawing(false)}
                onUse={(url) => {
                  setImage(url);
                  setDrawing(false);
                }}
              />
            </div>
          ) : busy === "gen" ? (
            <div className="text-center">
              <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-signal/30 border-t-signal" />
              <p className="mt-3 text-sm text-white/55">Dressing your avatar…</p>
            </div>
          ) : image ? (
            <div className="flex w-full flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Outfit texture" className="max-h-56 rounded-xl bg-white/5 object-contain" />
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setBusy("insert");
                    try {
                      setInserted(await onInsertBuild(avatarBuild(skin)));
                    } catch (err) {
                      fail(err);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="rounded-full bg-blox px-3.5 py-1.5 text-xs font-medium text-white"
                >
                  {connected ? "Insert into Studio" : "Add to workspace"}
                </button>
                <a href={image} download="bloxy-outfit.png" className="rounded-full bg-white/[0.08] px-3.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.14]">
                  Download texture
                </a>
              </div>
              {inserted && <p className="text-xs text-signal">Added as {inserted} (colored parts)</p>}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-lg font-semibold text-white/50">Try out a</p>
              <button
                type="button"
                onClick={() => {
                  const idea = randomOf(IDEAS.outfit);
                  setPrompt(idea);
                  void generate(idea);
                }}
                className="mt-2 flex items-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(47,125,255,0.8)] hover:brightness-105"
              >
                <Glyph d={GLYPHS.sparkle} /> Random Idea
              </button>
              <p className="mt-6 text-base font-semibold text-white/40">You can also</p>
              <div className="mt-2 flex justify-center gap-1.5">
                <Chip onClick={() => setDrawing(true)}>
                  <Glyph d={GLYPHS.pencil} /> Draw
                </Chip>
                <Chip onClick={() => textRef.current?.focus()}>
                  <Glyph d={GLYPHS.keyboard} /> Type
                </Chip>
                <Chip onClick={() => fileInput.current?.click()}>
                  <Glyph d={GLYPHS.image} /> Drag &amp; drop
                </Chip>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <ErrorNote error={error} onSettings={onNeedsKey} />
          <div className="mt-2 rounded-2xl border border-white/10 bg-[#24272f] p-2.5">
            <div className="flex items-start gap-2">
              <textarea
                ref={textRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void generate();
                  }
                }}
                rows={1}
                placeholder="Describe full body texture…"
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-white outline-none placeholder:text-white/35"
              />
              <button
                type="button"
                aria-label="Generate outfit"
                onClick={() => void generate()}
                disabled={!prompt.trim() || !!busy}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white disabled:text-white/30"
              >
                <Glyph d={GLYPHS.up} className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip title="Reset avatar" onClick={() => { setImage(null); setInserted(null); setError(null); }}>
                <Glyph d="M12 4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z M6 21v-5l-2-6h16l-2 6v5" />
              </Chip>
              {image && (
                <a href={image} download="bloxy-outfit.png" title="Download texture" className="flex items-center rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white/75 hover:bg-white/[0.1]">
                  <Glyph d={GLYPHS.download} />
                </a>
              )}
              <Chip onClick={() => fileInput.current?.click()}>
                <Glyph d={GLYPHS.image} /> Add Image
              </Chip>
              <Chip onClick={() => setDrawing(true)}>
                <Glyph d={GLYPHS.pencil} /> Draw
              </Chip>
              <Chip active={torsoOn} onClick={() => setTorsoOn((v) => !v)}>
                {torsoOn && <Glyph d={GLYPHS.x} className="size-3" />} Torso
              </Chip>
              <Chip active={legsOn} onClick={() => setLegsOn((v) => !v)}>
                {legsOn && <Glyph d={GLYPHS.x} className="size-3" />} Legs
              </Chip>
              <Chip active={animate} onClick={() => setAnimate((v) => !v)}>
                <Glyph d={GLYPHS.play} /> Animations
              </Chip>
              <span title="Coming soon" className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/30">
                <Glyph d={GLYPHS.plug} /> Attachments
              </span>
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      </aside>
    </>
  );
}
