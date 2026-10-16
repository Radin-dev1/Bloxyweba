"use client";

import { useMemo, useState } from "react";
import { KindIcon } from "./icons";
import { KIND_STYLE, type NodeKind } from "./types";

const GROUPS: { label: string; items: { kind: NodeKind; hint: string }[] }[] = [
  {
    label: "Inputs",
    items: [
      { kind: "text", hint: "A prompt that feeds the next nodes" },
      { kind: "upload", hint: "A reference image from your computer" },
      { kind: "note", hint: "A sticky note for yourself" },
    ],
  },
  {
    label: "Generate",
    items: [
      { kind: "image", hint: "Concept art, icons, thumbnails" },
      { kind: "video", hint: "Short clips and trailers" },
      { kind: "model3d", hint: "A Roblox model built from parts" },
    ],
  },
  {
    label: "Studio",
    items: [
      { kind: "studio", hint: "Ask Bloxy to build or script in Studio" },
      { kind: "check", hint: "Fix errors, review scripts, tidy up" },
    ],
  },
];

/** Searchable, grouped node list used by the toolbar "+" and the canvas right-click menu. */
export default function AddNodeMenu({ title, onPick }: { title?: string; onPick: (kind: NodeKind) => void }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => !q || `${KIND_STYLE[it.kind].label} ${it.hint} ${g.label}`.toLowerCase().includes(q)),
    })).filter((g) => g.items.length);
  }, [query]);
  const first = groups[0]?.items[0]?.kind;

  return (
    <div className="w-64 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-2xl backdrop-blur-xl" onContextMenu={(e) => e.preventDefault()}>
      {title && <p className="px-2.5 pt-1.5 pb-1 text-[10px] tracking-[0.18em] text-white/35 uppercase">{title}</p>}
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && first) onPick(first);
        }}
        placeholder="Search nodes…"
        className="mb-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-blox/45"
      />
      <div className="max-h-[320px] overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold text-white/35">{g.label}</p>
            {g.items.map((it) => (
              <button
                key={it.kind}
                type="button"
                onClick={() => onPick(it.kind)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left hover:bg-white/[0.07]"
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.05]"
                  style={{ color: KIND_STYLE[it.kind].color }}
                >
                  <KindIcon kind={it.kind} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-white/85">{KIND_STYLE[it.kind].label}</span>
                  <span className="block truncate text-[10.5px] text-white/40">{it.hint}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="px-3 py-4 text-center text-xs text-white/35">No nodes match.</p>}
      </div>
    </div>
  );
}
