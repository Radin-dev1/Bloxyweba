"use client";

import { useState } from "react";
import * as THREE from "three";
import type { ScenePart } from "../useScene";
import { isBaseplate } from "../Viewport3D";
import { GLYPHS, Glyph } from "./shared";

type Format = "glb" | "obj" | "luau" | "json";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "glb", label: "GLB", hint: "3D model with colors. Blender, Unity, web, Roblox 3D Importer." },
  { id: "obj", label: "OBJ", hint: "Plain mesh, opens almost anywhere." },
  { id: "luau", label: "Luau script", hint: "Paste into Studio's command bar to rebuild the parts." },
  { id: "json", label: "JSON", hint: "Raw part data (size, CFrame, color, material)." },
];

// ── Geometry (kept here so the viewport's renderer stays untouched) ──

function wedgeGeometry() {
  // Roblox wedge: full bottom, slope rising from front (-Z) to back (+Z), unit size.
  const v = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], // bottom
    [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], // top back edge
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom
    [3, 5, 2], [3, 4, 5], // back
    [0, 1, 5], [0, 5, 4], // slope
    [0, 4, 3], // left
    [1, 2, 5], // right
  ];
  const pos: number[] = [];
  for (const f of faces) for (const i of f) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function partGeometry(p: ScenePart) {
  const [x, y, z] = p.size;
  switch (p.shape) {
    case "Ball": {
      const g = new THREE.SphereGeometry(0.5, 32, 16);
      g.scale(x, y, z);
      return g;
    }
    case "Cylinder": {
      // Roblox cylinders run along X.
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      g.rotateZ(Math.PI / 2);
      g.scale(x, y, z);
      return g;
    }
    case "Wedge": {
      const g = wedgeGeometry();
      g.scale(x, y, z);
      return g;
    }
    default:
      return new THREE.BoxGeometry(x, y, z);
  }
}

function partMatrix(p: ScenePart) {
  const c = p.cframe;
  const [px, py, pz] = c;
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = c.length >= 12 ? c.slice(3, 12) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return new THREE.Matrix4().set(r00, r01, r02, px, r10, r11, r12, py, r20, r21, r22, pz, 0, 0, 0, 1);
}

function partName(p: ScenePart) {
  return p.path.split(".").pop() || "Part";
}

function toScene(parts: ScenePart[]) {
  const root = new THREE.Group();
  root.name = "Bloxy";
  for (const p of parts) {
    const mat = new THREE.MeshStandardMaterial({
      color: `#${p.color}`,
      roughness: 0.75,
      transparent: p.transparency > 0,
      opacity: 1 - p.transparency,
    });
    mat.name = p.material;
    const mesh = new THREE.Mesh(partGeometry(p), mat);
    mesh.name = partName(p);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(partMatrix(p));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.matrixAutoUpdate = true;
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  return root;
}

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
}

// ── Text formats ──

const n = (v: number) => String(Math.round(v * 1000) / 1000);

function toLuau(parts: ScenePart[], name: string) {
  const lines = [
    `-- Exported from Bloxy. Paste into the Studio command bar.`,
    `local model = Instance.new("Model")`,
    `model.Name = ${JSON.stringify(name)}`,
    `local function mat(name)`,
    `\tlocal ok, m = pcall(function() return Enum.Material[name] end)`,
    `\treturn ok and m or Enum.Material.Plastic`,
    `end`,
  ];
  for (const p of parts) {
    const kind = p.shape === "Wedge" ? "WedgePart" : "Part";
    const c = p.cframe.length >= 12 ? p.cframe.slice(0, 12) : [...p.cframe.slice(0, 3), 1, 0, 0, 0, 1, 0, 0, 0, 1];
    lines.push(
      `do`,
      `\tlocal p = Instance.new("${kind}")`,
      `\tp.Name = ${JSON.stringify(partName(p))}`,
      ...(kind === "Part" && p.shape !== "Block" ? [`\tp.Shape = Enum.PartType.${p.shape === "Ball" ? "Ball" : "Cylinder"}`] : []),
      `\tp.Size = Vector3.new(${p.size.map(n).join(", ")})`,
      `\tp.CFrame = CFrame.new(${c.map(n).join(", ")})`,
      `\tp.Color = Color3.fromHex("${p.color}")`,
      `\tp.Material = mat("${p.material}")`,
      ...(p.transparency ? [`\tp.Transparency = ${n(p.transparency)}`] : []),
      `\tp.Anchored = true`,
      `\tp.Parent = model`,
      `end`,
    );
  }
  lines.push(`model.Parent = workspace`, `game:GetService("Selection"):Set({ model })`, ``);
  return lines.join("\n");
}

function save(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ExportPanel({
  parts,
  selectedPart,
  onClose,
}: {
  parts: ScenePart[];
  selectedPart?: ScenePart;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("glb");
  const [scope, setScope] = useState<"all" | "selection">(selectedPart ? "selection" : "all");
  const [skipBaseplate, setSkipBaseplate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const chosen = (scope === "selection" && selectedPart ? [selectedPart] : parts).filter(
    (p) => !(skipBaseplate && isBaseplate(p)),
  );
  const base = scope === "selection" && selectedPart ? partName(selectedPart) : "bloxy-place";
  const file = base.replace(/[^\w-]+/g, "-").toLowerCase() || "bloxy";

  const run = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (format === "json") {
        save(JSON.stringify({ name: base, parts: chosen }, null, 2), "application/json", `${file}.json`);
      } else if (format === "luau") {
        save(toLuau(chosen, base), "text/plain", `${file}.luau`);
      } else {
        const root = toScene(chosen);
        try {
          if (format === "obj") {
            const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
            save(new OBJExporter().parse(root), "text/plain", `${file}.obj`);
          } else {
            const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
            const glb = await new GLTFExporter().parseAsync(root, { binary: true });
            save(glb as ArrayBuffer, "model/gltf-binary", `${file}.glb`);
          }
        } finally {
          dispose(root);
        }
      }
      setNote(`Exported ${chosen.length} part${chosen.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-5 left-[4.5rem] z-30 w-[min(340px,calc(100vw-5.5rem))] xl:bottom-[6.75rem] xl:left-3 rounded-[1.25rem] border border-white/10 bg-[#1a1d23]/96 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Glyph d={GLYPHS.download} className="size-4 text-white/70" />
        <h2 className="flex-1 font-display text-base font-bold tracking-tight text-white">Export</h2>
        <button type="button" aria-label="Close export" onClick={onClose} className="grid size-7 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
          <Glyph d={GLYPHS.x} className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormat(f.id)}
            className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
              format === f.id ? "border-blox bg-blox/15 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/45">{FORMATS.find((f) => f.id === format)?.hint}</p>

      <div className="mt-3 flex rounded-xl bg-white/[0.04] p-1 text-xs">
        {(["all", "selection"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={s === "selection" && !selectedPart}
            onClick={() => setScope(s)}
            className={`flex-1 rounded-lg py-1.5 transition-colors disabled:text-white/25 ${scope === s ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}
          >
            {s === "all" ? "Whole place" : "Selection"}
          </button>
        ))}
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-white/65">
        <input type="checkbox" checked={skipBaseplate} onChange={(e) => setSkipBaseplate(e.target.checked)} className="accent-[#2f7dff]" />
        Leave out the Baseplate
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={!chosen.length || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-blox py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        <Glyph d={GLYPHS.download} />
        {busy ? "Exporting…" : chosen.length ? `Download ${chosen.length} part${chosen.length === 1 ? "" : "s"}` : "Nothing to export"}
      </button>
      {note && <p className="mt-2 text-center text-xs text-white/50">{note}</p>}
    </div>
  );
}
