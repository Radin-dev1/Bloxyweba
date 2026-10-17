"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { BuildT } from "@/lib/openrouter";
import type { WorkspaceMesh } from "./blenderMesh";
import { orientationDeg } from "./sceneMath";
import type { ScenePart } from "./useScene";
import { isBaseplate } from "./Viewport3D";

const ModelPreview = dynamic(() => import("./nodes/ModelPreview"), { ssr: false });
const GlbPreview = dynamic(() => import("./nodes/GlbPreview"), { ssr: false });

type Item =
  | { kind: "parts"; name: string; path: string; build: BuildT; count: number }
  | { kind: "mesh"; name: string; mesh: WorkspaceMesh };

/** Groups the place's parts into its top-level models, as builds centred on their own origin. */
function modelsOf(parts: ScenePart[]): Item[] {
  const groups = new Map<string, ScenePart[]>();
  for (const p of parts) {
    if (isBaseplate(p)) continue;
    const segs = p.path.split(".");
    if (segs[0] !== "Workspace" || segs.length < 3) continue; // loose parts aren't a model
    const key = `${segs[0]}.${segs[1]}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].map(([path, list]) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of list) for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.cframe[i] - p.size[i] / 2);
      max[i] = Math.max(max[i], p.cframe[i] + p.size[i] / 2);
    }
    const cx = (min[0] + max[0]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const name = path.split(".")[1];
    const build: BuildT = {
      name,
      parts: list.map((p) => ({
        name: p.path.split(".").pop() ?? "Part",
        shape: (["Block", "Ball", "Cylinder", "Wedge"].includes(p.shape) ? p.shape : "Block") as BuildT["parts"][number]["shape"],
        size: p.size,
        position: [p.cframe[0] - cx, p.cframe[1] - min[1], p.cframe[2] - cz],
        rotation: orientationDeg(p),
        color: p.color.replace("#", ""),
        material: p.material,
        transparency: p.transparency,
      })),
    };
    return { kind: "parts" as const, name, path, build, count: list.length };
  });
}

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

/**
 * The Library tab: everything in the workspace in one list (part-built models and meshes from
 * Blender or 3D AI), with a big preview and the useful actions.
 */
export default function LibraryView({
  parts,
  meshes,
  connected,
  onShow,
  onDeleteModel,
  onDeleteMesh,
}: {
  parts: ScenePart[];
  meshes: WorkspaceMesh[];
  connected: boolean;
  onShow: (name: string) => void;
  onDeleteModel: (path: string) => void;
  onDeleteMesh: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "parts" | "mesh">("all");
  const items = useMemo<Item[]>(
    () => [...meshes.map((mesh) => ({ kind: "mesh" as const, name: mesh.name, mesh })), ...modelsOf(parts)],
    [parts, meshes],
  );
  const shown = items.filter((i) => (filter === "all" || i.kind === filter) && i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const selected = shown.find((i) => i.name === selectedName) ?? shown[0] ?? null;

  return (
    <div className="flex h-full gap-4 bg-[#0b0c10] px-4 pt-20 pb-4 text-zinc-100">
      {/* List */}
      <aside className="flex w-72 shrink-0 flex-col rounded-[1.4rem] border border-white/10 bg-white/[0.02] p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your models…"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-blox/50"
        />
        <div className="mt-2 flex gap-1 text-xs">
          {(
            [
              ["all", "All"],
              ["parts", "Parts"],
              ["mesh", "Meshes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 ${filter === id ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {shown.map((i) => (
            <li key={`${i.kind}:${i.name}`}>
              <button
                type="button"
                onClick={() => setSelectedName(i.name)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${selected?.name === i.name ? "bg-blox/15 text-white" : "text-white/75 hover:bg-white/[0.05]"}`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${i.kind === "mesh" ? "bg-violet-500/20 text-violet-200" : "bg-blox/20 text-blox-soft"}`}>
                  {i.kind === "mesh" ? "3D" : "P"}
                </span>
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <span className="shrink-0 text-[11px] text-white/35">{i.kind === "mesh" ? (i.mesh.tris ? `${(i.mesh.tris / 1000).toFixed(1)}k tris` : "mesh") : `${i.count} parts`}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-2 py-6 text-center text-sm leading-relaxed text-white/40">
              {items.length === 0 ? "Nothing built yet. Ask Bloxy for a model in Chat or the 3D workspace." : "No matches."}
            </li>
          )}
        </ul>
      </aside>

      {/* Preview */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.02]">
        {selected ? (
          <>
            <div className="min-h-0 flex-1 bg-[#dfe9f8]">
              {selected.kind === "mesh" ? <GlbPreview key={selected.mesh.url} url={selected.mesh.url} /> : <ModelPreview key={selected.name} build={selected.build} />}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-4">
              <div className="mr-auto min-w-0">
                <p className="truncate text-lg font-semibold">{selected.name}</p>
                <p className="text-xs text-white/45">
                  {selected.kind === "mesh"
                    ? `3D mesh${selected.mesh.tris ? ` · ${selected.mesh.tris.toLocaleString()} triangles` : ""}${selected.mesh.dims[0] ? ` · ${selected.mesh.dims.map((d) => Math.round(d * 10) / 10).join(" x ")} studs` : ""}`
                    : `${selected.count} Roblox parts${connected ? " · in your Studio place" : " · in your Bloxy workspace"}`}
                </p>
              </div>
              <button type="button" onClick={() => onShow(selected.name)} className="rounded-xl bg-blox px-3.5 py-2 text-sm font-medium text-white hover:bg-blox/90">
                Show in workspace
              </button>
              {selected.kind === "mesh" ? (
                <a href={selected.mesh.url} download={`${selected.name}.glb`} title="In Roblox Studio: File > Import 3D" className="rounded-xl bg-white/[0.08] px-3.5 py-2 text-sm text-white/85 hover:bg-white/[0.14]">
                  Download .glb
                </a>
              ) : (
                <button
                  type="button"
                  title="A Bloxy build file: import it from the create wheel (right-click the 3D view)"
                  onClick={() =>
                    download(`${selected.name}.bloxy.json`, URL.createObjectURL(new Blob([JSON.stringify(selected.build, null, 2)], { type: "application/json" })))
                  }
                  className="rounded-xl bg-white/[0.08] px-3.5 py-2 text-sm text-white/85 hover:bg-white/[0.14]"
                >
                  Download .json
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete ${selected.name}?${selected.kind === "parts" && connected ? " It's removed from your Studio place (Ctrl+Z in Studio brings it back)." : ""}`)) return;
                  if (selected.kind === "mesh") onDeleteMesh(selected.name);
                  else onDeleteModel(selected.path);
                  setSelectedName(null);
                }}
                className="rounded-xl px-3.5 py-2 text-sm text-red-300 hover:bg-red-500/15"
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-white/40">Select a model to preview it.</div>
        )}
      </section>
    </div>
  );
}
