"use client";

import { useState } from "react";
import { MATERIALS, orientationDeg, type PartEdit } from "./sceneMath";
import type { ScenePart } from "./useScene";
import { ChevronDown, Sparkle } from "../landing/icons";

/** A number field that edits locally and commits on Enter or blur, like Studio's Properties. */
function NumField({ value, onCommit, step = 1 }: { value: number; onCommit: (v: number) => void; step?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 1000) / 1000);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (Number.isFinite(v) && v !== value) onCommit(v);
  };
  return (
    <input
      value={shown}
      inputMode="decimal"
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(null);
      }}
      className="w-full min-w-0 rounded-md border border-transparent bg-black/30 px-1.5 py-1 text-right font-mono text-[11.5px] text-white/85 outline-none hover:border-white/10 focus:border-blox/60"
    />
  );
}

function Vec3({
  value,
  onCommit,
}: {
  value: [number, number, number];
  onCommit: (v: [number, number, number]) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <label key={axis} className="relative">
          <span
            className={`pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-[9px] font-semibold ${
              ["text-red-400", "text-blox", "text-blox-soft"][i]
            }`}
          >
            {axis}
          </span>
          <NumField
            value={value[i]}
            onCommit={(v) => {
              const next = [...value] as [number, number, number];
              next[i] = v;
              onCommit(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2 py-1">
      <span className="truncate text-[11.5px] text-white/45">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/[0.06] px-3 py-2">
      <p className="mb-1 text-[10px] font-medium tracking-[0.18em] text-white/30 uppercase">{title}</p>
      {children}
    </div>
  );
}

/** Studio-style Properties for the selected part. Edits go to Studio (undoable there). */
export default function Properties({
  part,
  editable,
  onEdit,
  onAsk,
}: {
  part: ScenePart;
  editable: boolean;
  onEdit: (edit: PartEdit) => void;
  onAsk: () => void;
}) {
  const position: [number, number, number] = [part.cframe[0], part.cframe[1], part.cframe[2]];
  const name = part.path.slice(part.path.lastIndexOf(".") + 1);
  return (
    <div className={`flex min-h-0 flex-col ${editable ? "" : "pointer-events-none opacity-60"}`}>
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] font-medium tracking-[0.2em] text-white/45 uppercase">Properties</p>
        <p className="mt-1.5 truncate font-display text-[15px] font-bold tracking-tight">{name}</p>
        <p className="truncate font-mono text-[10.5px] text-white/35">{part.path}</p>
      </div>
      <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
        <Section title="Appearance">
          <Row label="Color">
            <label className="flex cursor-pointer items-center gap-2 rounded-md bg-black/30 px-1.5 py-1">
              <span className="size-4 shrink-0 rounded ring-1 ring-white/20" style={{ background: `#${part.color}` }} />
              <span className="font-mono text-[11.5px] text-white/80">#{part.color}</span>
              <input
                type="color"
                value={`#${part.color}`}
                onChange={(e) => onEdit({ color: e.target.value.slice(1) })}
                className="sr-only"
              />
            </label>
          </Row>
          <Row label="Material">
            <div className="relative">
              <select
                value={part.material}
                onChange={(e) => onEdit({ material: e.target.value })}
                className="w-full appearance-none rounded-md border border-transparent bg-black/30 px-1.5 py-1 pr-6 text-[11.5px] text-white/85 outline-none hover:border-white/10 focus:border-blox/60"
              >
                {(MATERIALS.includes(part.material) ? MATERIALS : [part.material, ...MATERIALS]).map((m) => (
                  <option key={m} value={m} className="bg-[#101116]">
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-white/40" />
            </div>
          </Row>
          <Row label="Transparency">
            <NumField
              value={part.transparency}
              step={0.1}
              onCommit={(v) => onEdit({ transparency: Math.min(1, Math.max(0, v)) })}
            />
          </Row>
        </Section>
        <Section title="Transform">
          <Row label="Position">
            <Vec3 value={position} onCommit={(v) => onEdit({ position: v })} />
          </Row>
          <Row label="Orientation">
            <Vec3 value={orientationDeg(part)} onCommit={(v) => onEdit({ orientationDeg: v })} />
          </Row>
          <Row label="Size">
            <Vec3 value={part.size} onCommit={(v) => onEdit({ size: v })} />
          </Row>
        </Section>
        <Section title="Part">
          <Row label="Shape">
            <span className="block px-1.5 text-right text-[11.5px] text-white/70">{part.shape}</span>
          </Row>
        </Section>
      </div>
      <div className="border-t border-white/[0.06] p-2.5">
        <button
          onClick={onAsk}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-full bg-blox/15 py-2 text-xs font-medium text-blox-soft transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-blox/25"
        >
          <Sparkle className="size-3.5" /> Ask Bloxy about this part
        </button>
      </div>
    </div>
  );
}
