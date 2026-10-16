"use client";

import { useEffect } from "react";
import { GLYPHS, Glyph } from "./shared";

export type DockPanel = "forge" | "avatar" | "export" | null;

const ITEMS: { id: Exclude<DockPanel, null>; label: string; hint: string; key: string; icon: string }[] = [
  { id: "forge", label: "Idea Forge", hint: "Turn an idea, sketch or photo into a model", key: "I", icon: GLYPHS.sparkle },
  {
    id: "avatar",
    label: "Avatar",
    hint: "Dress an R6 avatar from a prompt or drawing",
    key: "R",
    icon: "M12 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z M8 10.5h8l1 5.5h-2l-.5 4.5h-5L9 16H7l1-5.5Z",
  },
  { id: "export", label: "Export", hint: "GLB, OBJ, Luau script or JSON", key: "E", icon: GLYPHS.download },
];

/**
 * Bloxy's creation dock: a slim bar in the workspace corner. Each tool has a tooltip and a
 * one-key shortcut, and clicking an open tool closes it again.
 */
export default function WorkspaceDock({ open, onOpen }: { open: DockPanel; onOpen: (p: DockPanel) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const item = ITEMS.find((it) => it.key === e.key.toUpperCase());
      if (item) onOpen(open === item.id ? null : item.id);
      if (e.key === "Escape" && open) onOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen]);

  return (
    <nav
      aria-label="Create tools"
      className="absolute bottom-5 left-3 z-30 flex flex-col gap-1 rounded-2xl border border-white/12 bg-[#14161c]/85 p-1 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl xl:flex-row"
    >
      {ITEMS.map((it) => {
        const active = open === it.id;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={active}
            aria-label={it.label}
            aria-keyshortcuts={it.key}
            onClick={() => onOpen(active ? null : it.id)}
            className={`group relative flex h-10 items-center gap-2 rounded-xl px-2.5 text-[12.5px] font-medium transition-all duration-200 active:scale-[0.97] xl:pr-3.5 ${
              active
                ? "bg-blox text-white shadow-[0_8px_22px_-10px_rgba(47,125,255,0.95),inset_0_1px_0_rgba(255,255,255,0.25)]"
                : "text-white/70 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Glyph d={it.icon} className="size-[18px] shrink-0" />
            <span className="hidden xl:inline">{it.label}</span>
            {/* Tooltip: what it does + its shortcut */}
            <span className="pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-50 w-max max-w-[220px] -translate-y-1/2 rounded-xl border border-white/10 bg-[#0f1116]/95 px-3 py-2 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 xl:top-auto xl:bottom-[calc(100%+10px)] xl:left-0 xl:translate-y-0">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
                {it.label}
                <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[10px] text-white/60">{it.key}</kbd>
              </span>
              <span className="mt-0.5 block text-[11px] font-normal text-white/50">{it.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
