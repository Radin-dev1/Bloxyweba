"use client";

import { useEffect, useRef, useState } from "react";

const SHORTCUTS: [string, string][] = [
  ["Orbit", "Left-drag"],
  ["Pan", "Right-drag"],
  ["Zoom", "Scroll"],
  ["Create menu", "Right-click"],
  ["Select / Move / Scale / Rotate", "Ctrl 1–4"],
  ["Deselect / close", "Esc"],
  ["Idea Forge", "I"],
  ["Avatar", "R"],
  ["Export", "E"],
  ["Send chat", "Enter"],
];

/** The "?" button: every workspace shortcut in one small card. */
export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute right-4 bottom-5 z-20">
      {open && (
        <div className="absolute right-0 bottom-[calc(100%+8px)] w-64 rounded-2xl border border-white/10 bg-[#111318]/95 p-3 shadow-2xl backdrop-blur-xl">
          <p className="px-1 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">Shortcuts</p>
          <dl className="space-y-1">
            {SHORTCUTS.map(([what, keys]) => (
              <div key={what} className="flex items-center justify-between gap-3 px-1 text-[11.5px]">
                <dt className="text-white/65">{what}</dt>
                <dd>
                  <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/75">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full border border-white/12 bg-[#14161c]/85 text-sm font-semibold text-white/70 shadow-lg backdrop-blur-xl hover:text-white"
      >
        ?
      </button>
    </div>
  );
}
