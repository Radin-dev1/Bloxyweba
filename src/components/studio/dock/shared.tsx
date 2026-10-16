"use client";

import { useEffect, useRef, useState } from "react";

// ── Random ideas (Idea Forge + Avatar workbench) ──

export const IDEAS = {
  scene: [
    "A floating sky island village with rope bridges and waterfalls",
    "A neon cyberpunk alley with food stalls and hanging signs",
    "A cozy autumn campsite with a tent, campfire and pumpkins",
    "An underwater coral temple with glowing crystals",
    "A volcano obby with lava rivers and stone platforms",
    "A haunted Victorian mansion foyer with candles and cobwebs",
    "A desert oasis market with colorful tents and palm trees",
    "A snowy mountain cabin with a frozen lake and pine trees",
  ],
  character: [
    "A brave knight with blue armor and a golden crest",
    "A space explorer in a white suit with an orange visor",
    "A street-food chef with a tall hat and a giant spatula",
    "A ninja in purple with a scarf and twin daggers",
    "A pirate captain with a red coat and a parrot",
    "A cheerful robot mechanic with tool belt and goggles",
  ],
  creature: [
    "A fluffy cloud dragon with rainbow wings",
    "A tiny mushroom golem with a mossy back",
    "A crystal fox with glowing blue tails",
    "A lava slime with a smug face",
    "A mechanical owl made of brass gears",
    "A friendly sea turtle carrying a tiny island",
  ],
  item: [
    "A legendary golden sword with a ruby hilt",
    "A cute pet backpack shaped like a cat",
    "A magic potion bottle with swirling purple liquid",
    "A wooden treasure chest with iron trim",
    "A hoverboard with neon underglow",
    "A retro arcade cabinet",
    "A low-poly pickup truck",
  ],
  outfit: [
    "Classic hero outfit: blue hoodie with a lightning bolt, black jeans, red sneakers",
    "Samurai armor in red and black lacquer with gold trim",
    "Astronaut suit with NASA-style patches and a utility belt",
    "Cozy winter outfit: knit sweater with reindeer, plaid pants, boots",
    "Cyberpunk jacket with neon stripes and cargo pants",
    "Royal king outfit: purple robe with gold embroidery and white fur trim",
    "Pirate outfit: striped shirt, red sash, brown boots",
  ],
} as const;

export function randomOf<T>(list: readonly T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

// ── Calling the generation API with bits-aware errors ──

export class GenError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function postGen<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new GenError(data.error ?? `Request failed (${res.status})`, data.code, res.status);
  return data;
}

export function ErrorNote({ error, onSettings }: { error: GenError | Error | null; onSettings?: () => void }) {
  if (!error) return null;
  const code = (error as GenError).code;
  return (
    <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-xs leading-relaxed text-red-200">
      {error.message}
      {code === "sign_in" && (
        <a href="/api/auth/roblox/login?returnTo=/studio" className="ml-1.5 font-medium text-white underline">
          Sign in
        </a>
      )}
      {!code && error.message.includes("OpenRouter") && onSettings && (
        <button onClick={onSettings} className="ml-1.5 font-medium text-white underline">
          Open Settings
        </button>
      )}
    </div>
  );
}

/** Reads a dropped/picked image file as a data URL (max 8 MB). */
export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("That isn't an image."));
    if (file.size > 8_000_000) return reject(new Error("Images up to 8 MB."));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

// ── Doodle canvas ──

const COLORS = ["#111111", "#ffffff", "#e5484d", "#f5a524", "#2f7dff", "#7fb0ff", "#8e4ec6", "#8d6e63"];

/** A small drawing pad; "Use doodle" returns a PNG data URL. */
export function DoodlePad({ onUse, onCancel }: { onUse: (dataUrl: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 512, y: ((e.clientY - r.top) / r.height) * 512 };
  };
  const stroke = (to: { x: number; y: number }) => {
    const ctx = canvas.current!.getContext("2d")!;
    const from = last.current ?? to;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        width={512}
        height={512}
        className="aspect-square w-full cursor-crosshair touch-none rounded-xl bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          last.current = null;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          stroke(point(e));
        }}
        onPointerMove={(e) => drawing.current && stroke(point(e))}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => setColor(c)}
            className={`size-6 rounded-full border ${color === c ? "border-white ring-2 ring-blox-soft" : "border-white/20"}`}
            style={{ background: c }}
          />
        ))}
        <input
          type="range"
          min={2}
          max={40}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          aria-label="Brush size"
          className="ml-1 w-24 accent-[#2f7dff]"
        />
        <button
          type="button"
          onClick={() => {
            const ctx = canvas.current!.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, 512, 512);
          }}
          className="ml-auto rounded-lg px-2 py-1 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white"
        >
          Clear
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-xs text-white/55 hover:text-white">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onUse(canvas.current!.toDataURL("image/png"))}
          className="rounded-full bg-blox px-3.5 py-1.5 text-xs font-medium text-white"
        >
          Use doodle
        </button>
      </div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-signal/90 text-white" : "bg-white/[0.06] text-white/75 hover:bg-white/[0.1] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function Glyph({ d, className = "size-3.5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const GLYPHS = {
  sparkle: "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z",
  image: "M3 5h18v14H3V5Z M3 16l5-5 4 4 3-3 6 6",
  pencil: "M4 20l4-1 11-11-3-3L5 16l-1 4Z M14 6l3 3",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 7.5 4 7 3 10l2 1v2l-2 1 1 3 2-.5L7.5 18 7 20l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1Z",
  cube: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5l8 4.5 8-4.5 M12 12v9",
  up: "M12 19V5 M6 11l6-6 6 6",
  x: "M6 6l12 12M18 6 6 18",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  keyboard: "M3 7h18v10H3z M7 11h.01 M11 11h.01 M15 11h.01 M8 14h8",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4",
  noBg: "M3 5h18v14H3z M4 4l16 16",
};
