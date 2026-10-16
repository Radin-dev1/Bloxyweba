"use client";

import { useEffect, useState } from "react";
import { GLYPHS, Glyph } from "./shared";

export type Primitive = "Block" | "Ball" | "Cylinder" | "Wedge";

type Slot = { id: string; label: string; icon: string; run: () => void };

const RADIUS = 78;

const PRIMITIVE_ICONS: Record<Primitive, string> = {
  Block: "M4 8l8-4 8 4v8l-8 4-8-4V8Z M4 8l8 4 8-4 M12 12v8",
  Ball: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z M4.5 10.5c4 2 11 2 15 0",
  Cylinder: "M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3v10c0 1.7-3.1 3-7 3s-7-1.3-7-3V7Z M5 7c0 1.7 3.1 3 7 3s7-1.3 7-3",
  Wedge: "M4 18h16V6L4 18Z M20 6l-2 0",
};

/**
 * Right-click radial menu for the 3D workspace. One ring, big targets, and a second ring for
 * primitives, so it never turns into a long nested menu.
 */
export default function CreateWheel({
  x,
  y,
  onClose,
  onPrimitive,
  onIdeaForge,
  onAvatar,
  onImport,
  onAsk,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onPrimitive: (shape: Primitive) => void;
  onIdeaForge: () => void;
  onAvatar: () => void;
  onImport: () => void;
  onAsk: () => void;
}) {
  const [ring, setRing] = useState<"main" | "parts">("main");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const slots: Slot[] =
    ring === "main"
      ? [
          { id: "parts", label: "Add part", icon: PRIMITIVE_ICONS.Block, run: () => setRing("parts") },
          { id: "text", label: "From text", icon: GLYPHS.sparkle, run: done(onIdeaForge) },
          { id: "image", label: "From image", icon: GLYPHS.image, run: done(onIdeaForge) },
          { id: "avatar", label: "Avatar", icon: "M12 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z M8 10.5h8l1 5.5h-2l-.5 4.5h-5L9 16H7l1-5.5Z", run: done(onAvatar) },
          { id: "import", label: "Import", icon: "M12 15V4 M7 9l5-5 5 5 M5 20h14", run: done(onImport) },
          { id: "ask", label: "Ask Bloxy", icon: "M5 5h14v10H9l-4 4V5Z M9 10h6", run: done(onAsk) },
        ]
      : (["Block", "Ball", "Cylinder", "Wedge"] as Primitive[]).map((shape) => ({
          id: shape,
          label: shape === "Block" ? "Part" : shape,
          icon: PRIMITIVE_ICONS[shape],
          run: done(() => onPrimitive(shape)),
        }));

  // Keep the whole wheel on screen.
  const pad = RADIUS + 44;
  const cx = Math.min(Math.max(x, pad), window.innerWidth - pad);
  const cy = Math.min(Math.max(y, pad), window.innerHeight - pad);

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        className="absolute size-0 animate-[bloxy-wheel_160ms_cubic-bezier(0.32,0.72,0,1)]"
        style={{ left: cx, top: cy }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-[118px] -left-[118px] size-[236px] rounded-full border border-white/10 bg-[#111318]/80 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl" />
        {slots.map((s, i) => {
          const a = (i / slots.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={s.id}
              type="button"
              onClick={s.run}
              className="group absolute flex size-[68px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-2xl text-white/75 transition-colors hover:bg-blox hover:text-white focus-visible:bg-blox focus-visible:outline-none"
              style={{ left: Math.cos(a) * RADIUS, top: Math.sin(a) * RADIUS }}
            >
              <Glyph d={s.icon} className="size-5" />
              <span className="text-[10.5px] leading-tight font-medium">{s.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label={ring === "main" ? "Close" : "Back"}
          onClick={() => (ring === "main" ? onClose() : setRing("main"))}
          className="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/[0.08] text-white/60 hover:bg-white/15 hover:text-white"
        >
          {ring === "main" ? <Glyph d={GLYPHS.x} className="size-4" /> : <Glyph d="M15 6l-6 6 6 6" className="size-4" />}
        </button>
      </div>
    </div>
  );
}
