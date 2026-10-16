"use client";

import { GLYPHS, Glyph } from "./shared";

export type DockPanel = "forge" | "avatar" | "export" | null;

const ITEMS: { id: Exclude<DockPanel, null>; label: string; icon: string; tint: string }[] = [
  { id: "forge", label: "Idea Forge", icon: GLYPHS.sparkle, tint: "from-[#ffb547] to-[#ff7a3d]" },
  { id: "avatar", label: "Roblox Avatar", icon: "M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z M7 21v-6l-2-5h14l-2 5v6 M10 10v11 M14 10v11", tint: "from-[#5aa8ff] to-[#2f7dff]" },
  { id: "export", label: "Export", icon: GLYPHS.download, tint: "from-[#4ce6b0] to-[#22b07d]" },
];

/** Nilo-style bottom-left dock on the 3D workspace (an icon column until there is room beside the chat). */
export default function WorkspaceDock({ open, onOpen }: { open: DockPanel; onOpen: (p: DockPanel) => void }) {
  return (
    <nav
      aria-label="Workspace tools"
      className="absolute bottom-5 left-3 z-20 flex flex-col gap-1 rounded-[1.25rem] border border-white/10 bg-[#16181d]/90 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl xl:flex-row"
    >
      {ITEMS.map((it) => {
        const active = open === it.id;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={active}
            aria-label={it.label}
            title={it.label}
            onClick={() => onOpen(active ? null : it.id)}
            className={`group flex flex-col items-center gap-1 rounded-xl p-1 transition-colors xl:w-[4.75rem] xl:px-1.5 xl:py-2 ${
              active ? "bg-white/[0.1]" : "hover:bg-white/[0.06]"
            }`}
          >
            <span className={`grid size-9 place-items-center rounded-xl bg-gradient-to-br ${it.tint} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform group-active:scale-95`}>
              <Glyph d={it.icon} className="size-[18px]" />
            </span>
            <span className={`hidden text-[10.5px] leading-tight font-medium xl:block ${active ? "text-white" : "text-white/60"}`}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
