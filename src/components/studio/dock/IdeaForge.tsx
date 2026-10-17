"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { GEN_DEFAULTS, type BuildT } from "@/lib/openrouter";
import { Chip, DoodlePad, ErrorNote, GLYPHS, GenError, Glyph, IDEAS, postGen, randomOf, readImage } from "./shared";

const ModelPreview = dynamic(() => import("../nodes/ModelPreview"), { ssr: false });
const GlbPreview = dynamic(() => import("../nodes/GlbPreview"), { ssr: false });

const STYLES = ["None", "Roblox", "Low poly", "Cartoon", "Anime", "Realistic", "Voxel", "Pixel art"] as const;
const RANDOM: { key: keyof typeof IDEAS; label: string }[] = [
  { key: "scene", label: "Random Scene" },
  { key: "character", label: "Random Character" },
  { key: "creature", label: "Random Creature" },
  { key: "item", label: "Random Item" },
];

import type { Generate3D } from "../model3dStream";
import { blenderAvailable, toBytes, type BlenderMesh } from "../blenderMesh";
import { MESH_MODELS } from "@/lib/hfModels";

/** aiModel: the open-source 3D model that made this mesh (AI mesh mode). */
type Idea = { id: string; prompt: string; image: string; build?: BuildT; inserted?: string; mesh?: BlenderMesh & { glb?: Uint8Array }; aiModel?: string };

/** A short model name from the idea's words ("a cute red dragon" -> "CuteRedDragon"). */
function nameFrom(prompt: string) {
  const words = prompt.replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|with|for|of)$/i.test(w));
  return words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("") || "Model";
}

/** The concept image as a data URL (generated images may be remote URLs). */
async function asDataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Convert a generated GLB to a self-contained glTF, supported by Roblox Studio's Importer. */
async function toRobloxGltf(glb: Uint8Array) {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const model = await new GLTFLoader().parseAsync(glb.slice().buffer, "");
  model.scene.updateMatrixWorld(true);
  const exported = await new GLTFExporter().parseAsync(model.scene, { binary: false });
  const parsed = (typeof exported === "string" ? JSON.parse(exported) : exported) as {
    asset?: { version?: string };
    images?: { uri?: string }[];
    buffers?: { uri?: string }[];
  };
  if (parsed.asset?.version !== "2.0") throw new Error("Roblox export didn't produce a valid glTF 2.0 document.");
  if ([...(parsed.images ?? []), ...(parsed.buffers ?? [])].some((asset) => asset.uri && !asset.uri.startsWith("data:"))) {
    throw new Error("The Studio export includes a separate file. Please keep the exported .gltf together with its assets.");
  }
  return JSON.stringify(parsed);
}

async function downloadRobloxMesh(mesh: BlenderMesh & { glb: Uint8Array }, name: string) {
  const gltf = await toRobloxGltf(mesh.glb);
  const safeName = name.replace(/[^\w-]+/g, "-").toLowerCase() || "bloxy-model";
  downloadFile(gltf, "model/gltf+json", `${safeName}.gltf`);
}

function downloadFile(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ForgeMesh = { name: string; glb: Uint8Array; dims: [number, number, number]; tris: number; fit?: number };

export default function IdeaForge({
  generate3D,
  openrouterKey,
  model3d,
  connected,
  onInsertBuild,
  onSpent,
  onNeedsKey,
  onClose,
  meshModel,
  onAddMesh,
}: {
  /** Streams the model and builds it live in the workspace (adds it there when done). */
  generate3D?: Generate3D;
  openrouterKey: string;
  /** Model for "Make 3D" (free-only mode passes a free one); default is the server's. */
  model3d?: string;
  connected: boolean;
  onInsertBuild: (build: BuildT) => Promise<string>;
  onSpent: () => void;
  onNeedsKey: () => void;
  onClose: () => void;
  /** Open-source 3D model (Settings) used by "AI mesh". */
  meshModel?: string;
  /** Puts an AI mesh into the workspace. */
  onAddMesh?: (mesh: ForgeMesh) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Roblox");
  const [menu, setMenu] = useState<"none" | "style" | "settings">("none");
  const [imageModel, setImageModel] = useState<string>(GEN_DEFAULTS.image);
  const [reference, setReference] = useState<string | null>(null);
  const [assetPack, setAssetPack] = useState(false);
  // "Real mesh": the model is written as a Blender script and built in real Blender.
  const [hasBlender, setHasBlender] = useState(false);
  const [realMesh, setRealMesh] = useState(false);
  useEffect(() => {
    let alive = true;
    void blenderAvailable().then((ok) => {
      if (!alive) return;
      setHasBlender(ok);
      setRealMesh(ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  // "AI mesh": open-source 3D AI (Hunyuan3D, TRELLIS...) turns the concept image into a mesh.
  const [aiMesh, setAiMesh] = useState(false);
  const [cleanBg, setCleanBg] = useState(true);
  const [doodling, setDoodling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Idea[]>([]);
  const [current, setCurrent] = useState<Idea | null>(null);
  const [view, setView] = useState<"image" | "3d">("image");
  const [busy, setBusy] = useState<"image" | "3d" | "insert" | "export" | null>(null);
  /** The model while it's being generated, growing part by part. */
  const [building, setBuilding] = useState<BuildT | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (idea: Idea) => {
    setCurrent(idea);
    setHistory((h) => [idea, ...h.filter((x) => x.id !== idea.id)].slice(0, 30));
  };

  const fail = (err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e instanceof GenError && e.status === 400 && e.message.includes("OpenRouter")) onNeedsKey();
    setError(e);
  };

  const generate = async () => {
    const text = prompt.trim();
    if (busy) return;
    setError(null);
    // A reference with no prompt is used as the result directly (ready for Make 3D).
    if (!text && reference) {
      update({ id: crypto.randomUUID(), prompt: "Uploaded reference", image: reference });
      setView("image");
      return;
    }
    if (!text) return setError(new Error("Describe what you want, or pick a random idea."));
    const full = [
      text,
      style !== "None" ? `Style: ${style}${style === "Roblox" ? " (blocky, colorful Roblox game art)" : ""}.` : "",
      assetPack ? "Show it as an asset pack: a tidy grid of 6 matching variations." : "",
      cleanBg ? "Single subject, centered, full view, plain white background, no text, no watermark." : "",
    ]
      .filter(Boolean)
      .join(" ");
    setBusy("image");
    try {
      const r = await postGen<{ images: string[] }>("/api/gen/image", { apiKey: openrouterKey, model: imageModel, prompt: full });
      update({ id: crypto.randomUUID(), prompt: text, image: r.images[0] });
      setView("image");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
      onSpent();
    }
  };

  const makeAiMesh = async () => {
    if (!current) return;
    setView("3d");
    const res = await fetch("/api/gen/hf3d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: await asDataUrl(current.image), prompt: current.prompt, sizeStuds: 6, ...(meshModel ? { meshModel } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { glb?: string; dims?: [number, number, number]; tris?: number; fit?: number; meshModel?: string; error?: string };
    if (!res.ok || !data.glb) throw new Error(data.error ?? `3D generation failed (${res.status})`);
    const glb = toBytes(data.glb);
    const name = nameFrom(current.prompt === "Uploaded reference" ? "Model" : current.prompt);
    const mesh: BlenderMesh & { glb: Uint8Array } = {
      glb,
      url: URL.createObjectURL(new Blob([glb as BlobPart], { type: "model/gltf-binary" })),
      preview: null,
      tris: data.tris ?? 0,
      dims: data.dims ?? [0, 0, 0],
    };
    onAddMesh?.({ name, glb, dims: mesh.dims, tris: mesh.tris, fit: data.fit });
    const label = MESH_MODELS.find((m) => m.id === data.meshModel)?.label ?? "AI";
    update({ ...current, build: { name, parts: [] }, mesh, aiModel: label, inserted: `Workspace.${name}` });
  };

  const make3d = async () => {
    if (!current || busy) return;
    setError(null);
    setBusy("3d");
    if (aiMesh) {
      try {
        await makeAiMesh();
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
      return;
    }
    const body = {
      apiKey: openrouterKey,
      prompt: current.prompt === "Uploaded reference" ? "the object in the image" : current.prompt,
      image: current.image,
      codeFormat: realMesh && hasBlender ? "blender" : "roblox",
      ...(model3d ? { model: model3d } : {}),
    };
    try {
      if (generate3D) {
        // Watch it being built here and in the workspace; it's added to the workspace when done.
        setView("3d");
        setBuilding({ name: "Building", parts: [] });
        const r = await generate3D(
          body,
          {
            onName: (name) => setBuilding((b) => (b ? { ...b, name } : b)),
            onPart: (part) => setBuilding((b) => (b ? { ...b, parts: [...b.parts, part] } : b)),
          },
          { autoAdd: true },
        );
        update({ ...current, build: r.build, inserted: r.path, mesh: r.mesh });
      } else {
        const r = await postGen<{ build: BuildT }>("/api/gen/model3d", body);
        update({ ...current, build: r.build, inserted: undefined });
        setView("3d");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBuilding(null);
      setBusy(null);
      onSpent();
    }
  };

  const downloadForRoblox = async () => {
    if (!current?.mesh || busy) return;
    setBusy("export");
    setError(null);
    try {
      let mesh = current.mesh;
      if (!mesh.glb) {
        const response = await fetch(mesh.url);
        if (!response.ok) throw new Error(`Couldn't read the generated mesh (${response.status}).`);
        mesh = { ...mesh, glb: new Uint8Array(await response.arrayBuffer()) };
      }
      await downloadRobloxMesh(mesh as BlenderMesh & { glb: Uint8Array }, current.build?.name ?? nameFrom(current.prompt));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const insert = async () => {
    if (!current?.build || busy) return;
    setBusy("insert");
    try {
      const path = await onInsertBuild(current.build);
      update({ ...current, inserted: path });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-3 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[min(680px,90dvh)] w-[min(880px,96vw)] flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#16181d]/97 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">
            <button
              type="button"
              title="History"
              aria-pressed={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className={`grid size-7 place-items-center rounded-lg ${showHistory ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              <Glyph d="M4 5h16v11H8l-4 4V5Z" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrent(null);
                setPrompt("");
                setReference(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white"
            >
              <Glyph d={GLYPHS.pencil} /> New Idea
            </button>
          </div>
          <h2 className="flex-1 text-center font-display text-lg font-bold tracking-tight text-white">Idea Forge</h2>
          <button type="button" aria-label="Close Idea Forge" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            <Glyph d={GLYPHS.x} className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-5 pt-4 pb-3 md:grid-cols-[1fr_minmax(0,380px)]">
          <div className="flex min-h-0 flex-col items-center justify-center gap-2.5 overflow-y-auto">
            {showHistory ? (
              history.length === 0 ? (
                <p className="text-sm text-white/40">Your ideas this session show up here.</p>
              ) : (
                <div className="grid w-full grid-cols-3 gap-2 self-start">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setCurrent(h);
                        setView(h.build ? "3d" : "image");
                      }}
                      className={`overflow-hidden rounded-xl border ${current?.id === h.id ? "border-blox" : "border-white/10"}`}
                      title={h.prompt}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.image} alt={h.prompt} className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
              )
            ) : (
              RANDOM.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setPrompt(randomOf(IDEAS[r.key]))}
                  className="flex w-44 items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/[0.12] hover:text-white"
                >
                  <Glyph d={GLYPHS.sparkle} /> {r.label}
                </button>
              ))
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white">
              {busy === "3d" && building && building.parts.length > 0 ? (
                <div className="relative h-full">
                  <ModelPreview build={building} />
                  <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
                    <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Building {building.name} · {building.parts.length} {building.parts.length === 1 ? "part" : "parts"}
                  </div>
                </div>
              ) : busy ? (
                <div className="grid h-full place-items-center bg-[#eef2f8]">
                  <div className="text-center">
                    <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-blox/30 border-t-blox" />
                    <p className="mt-3 text-sm text-black/55">
                      {busy === "3d" ? (aiMesh ? "Open-source 3D AI is building the mesh (20-90s)…" : "Building it out of Roblox parts…") : busy === "export" ? "Preparing a glTF for Roblox Studio…" : busy === "image" ? "Forging your idea…" : "Working…"}
                    </p>
                  </div>
                </div>
              ) : current ? (
                view === "3d" && current.build ? (
                  <div className="relative h-full">
                    {current.mesh ? <GlbPreview url={current.mesh.url} /> : <ModelPreview build={current.build} />}
                    {current.mesh && (
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur">
                          {current.aiModel ? `${current.aiModel} mesh` : "Blender mesh"}
                          {current.mesh.tris ? ` · ${current.mesh.tris.toLocaleString()} tris` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => void downloadForRoblox()}
                          disabled={!!busy}
                          title="Then use Roblox Studio's Importer with Upload to Roblox off and Add to Workspace on."
                          className="rounded-full bg-blox px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                        >
                          {busy === "export" ? "Preparing glTF…" : "Export for Studio (.gltf)"}
                        </button>
                        <a
                          href={current.mesh.url}
                          download={`${current.build.name}.glb`}
                          className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white"
                        >
                          Download .glb
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.image} alt={current.prompt} className="h-full w-full object-contain" />
                )
              ) : doodling ? null : (
                <div className="grid h-full place-items-center text-sm text-black/50">Your result will appear here</div>
              )}
              {doodling && (
                <div className="absolute inset-0 bg-[#16181d] p-2">
                  <DoodlePad
                    onCancel={() => setDoodling(false)}
                    onUse={(url) => {
                      setReference(url);
                      setDoodling(false);
                    }}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {current?.build && (
                <div className="flex rounded-full bg-white/[0.06] p-0.5 text-xs">
                  {(["image", "3d"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-white/15 text-white" : "text-white/50"}`}>
                      {v === "image" ? "Image" : "3D"}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => void make3d()}
                disabled={!current || !!busy}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/[0.14] disabled:opacity-35"
              >
                <Glyph d={GLYPHS.cube} /> {current?.build ? "Remake 3D" : "Make 3D"}
              </button>
              {current?.mesh && (
                <>
                  <button
                    type="button"
                    onClick={() => void downloadForRoblox()}
                    disabled={!!busy}
                    title="Export a self-contained glTF, then in Studio's Importer turn Upload to Roblox off and Add to Workspace on."
                    className="rounded-full border border-blox/40 bg-blox/15 px-3.5 py-1.5 text-xs font-medium text-blox-soft disabled:opacity-40"
                  >
                    {busy === "export" ? "Preparing glTF…" : "Export for Studio (.gltf)"}
                  </button>
                  <p className="basis-full text-center text-[10px] text-white/40">In Studio: Import 3D → choose the .gltf → Upload to Roblox off → Add to Workspace on.</p>
                </>
              )}
              {current?.build && !current.aiModel && (
                <button
                  type="button"
                  onClick={() => void insert()}
                  disabled={!!busy}
                  className="rounded-full bg-blox px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  {connected ? "Insert into Studio" : "Add to workspace"}
                </button>
              )}
              {current && (
                <a href={current.image} download="bloxy-idea.png" className="rounded-full px-2.5 py-1.5 text-xs text-white/50 hover:text-white">
                  Download
                </a>
              )}
            </div>
            {current?.inserted && (
              <p className="flex items-center gap-2 text-xs text-blox-soft">
                {connected ? "Inserted into Studio" : "Added to your workspace"} as {current.inserted}
                <button type="button" onClick={onClose} className="rounded-full bg-blox px-2.5 py-1 font-medium text-white">
                  See it in the workspace
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Prompt bar */}
        <div className="px-4 pb-4">
          <div className="mx-auto max-w-[560px]">
            <ErrorNote error={error} onSettings={onNeedsKey} />
            <div className="mt-2 rounded-2xl border border-white/10 bg-[#22252c] p-2.5">
              {reference && (
                <div className="mb-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={reference} alt="Reference" className="size-10 rounded-lg object-cover" />
                  <span className="text-[11px] text-white/45">Reference added. Send with no text to use it as the result.</span>
                  <button type="button" onClick={() => setReference(null)} className="ml-auto text-[11px] text-white/45 hover:text-white">
                    Remove
                  </button>
                </div>
              )}
              <div className="flex items-start gap-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void generate();
                    }
                  }}
                  rows={1}
                  placeholder="Describe what you want to generate…"
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] text-white outline-none placeholder:text-white/35"
                />
                <button
                  type="button"
                  aria-label="Generate"
                  onClick={() => void generate()}
                  disabled={!!busy || (!prompt.trim() && !reference)}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-blox text-white disabled:bg-white/10 disabled:text-white/35"
                >
                  <Glyph d={GLYPHS.up} className="size-4" />
                </button>
              </div>
              <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
                <Chip title="Image model" active={false} onClick={() => setMenu((m) => (m === "settings" ? "none" : "settings"))}>
                  <Glyph d={GLYPHS.gear} />
                </Chip>
                <Chip onClick={() => setMenu((m) => (m === "style" ? "none" : "style"))}>
                  <Glyph d={GLYPHS.sparkle} /> {style === "None" ? "Style" : style}
                </Chip>
                <Chip onClick={() => fileInput.current?.click()}>
                  <Glyph d={GLYPHS.image} /> Add Image
                </Chip>
                <Chip onClick={() => setDoodling((d) => !d)}>
                  <Glyph d={GLYPHS.pencil} /> Doodle
                </Chip>
                {hasBlender && (
                  <Chip
                    active={realMesh}
                    onClick={() => {
                      setRealMesh((v) => !v);
                      setAiMesh(false);
                    }}
                    title="Make 3D builds a real mesh in Blender (beveled, smooth, exportable) instead of Roblox parts">
                    <Glyph d={GLYPHS.cube} /> Real mesh
                  </Chip>
                )}
                <Chip
                  active={aiMesh}
                  onClick={() => {
                    setAiMesh((v) => !v);
                    setRealMesh(false);
                  }}
                  title="Make 3D turns the image into a detailed mesh with open-source 3D AI (Hunyuan3D, TRELLIS, ...), picked in Settings"
                >
                  <Glyph d={GLYPHS.sparkle} /> AI mesh
                </Chip>
                <Chip active={assetPack} onClick={() => setAssetPack((v) => !v)} title="Generate a sheet of matching variations">
                  <Glyph d={GLYPHS.grid} /> Asset Pack
                </Chip>
                <Chip active={cleanBg} onClick={() => setCleanBg((v) => !v)} title="Plain white background (best for Make 3D)">
                  <Glyph d={GLYPHS.noBg} />
                </Chip>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      setReference(await readImage(f));
                    } catch (err) {
                      fail(err);
                    }
                  }}
                />
                {menu === "style" && (
                  <div className="absolute bottom-full left-10 z-10 mb-2 w-40 rounded-xl border border-white/10 bg-[#111318] p-1 shadow-2xl">
                    {STYLES.map((s) => (
                      <button key={s} type="button" onClick={() => { setStyle(s); setMenu("none"); }} className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs ${style === s ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/[0.06]"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {menu === "settings" && (
                  <div className="absolute bottom-full left-0 z-10 mb-2 w-72 rounded-xl border border-white/10 bg-[#111318] p-3 shadow-2xl">
                    <label className="text-[11px] text-white/50">Image model (OpenRouter)</label>
                    <input
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-blox/50"
                    />
                    <p className="mt-1.5 text-[10px] text-white/35">Make 3D uses the 3D model from the Nodes defaults.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
