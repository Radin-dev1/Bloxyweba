"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "../landing/icons";
import { RECOMMENDED, formatContext, formatPrice, loadTextModels, shortName, type ModelInfo } from "./models";
import ProviderLogo, { vendorName, vendorOf } from "./ProviderLogo";

type Feature = "all" | "reasoning" | "vision" | "tools" | "free";
const FEATURES: { id: Feature; label: string }[] = [
  { id: "all", label: "All features" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "tools", label: "Tool use" },
  { id: "free", label: "Free" },
];

function Tags({ m }: { m: ModelInfo }) {
  return (
    <>
      {m.reasoning && <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/60">Reasoning</span>}
      {m.vision && <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/60">Vision</span>}
      {m.tools && <span className="rounded-md bg-blox/15 px-1.5 py-0.5 text-[10px] text-blox-soft">Builds in Studio</span>}
      {m.inputPrice === 0 && m.outputPrice === 0 && (
        <span className="rounded-md bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal">Free</span>
      )}
    </>
  );
}

/**
 * ForgeGUI-style "Select Model" window: recommended cards, every OpenRouter model grouped
 * by lab with provider/feature filters and search, and a details panel.
 */
export default function ModelBrowser({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("all");
  const [feature, setFeature] = useState<Feature>("all");
  const [focused, setFocused] = useState(value);
  const recRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void loadTextModels().then((m) => alive && setModels(m));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const all = useMemo(() => models ?? [], [models]);
  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const info = (id: string): ModelInfo => byId.get(id) ?? { id, name: id };

  const vendors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of all) counts.set(vendorOf(m.id), (counts.get(vendorOf(m.id)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const groups = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = all.filter((m) => {
      if (vendor !== "all" && vendorOf(m.id) !== vendor) return false;
      if (feature === "reasoning" && !m.reasoning) return false;
      if (feature === "vision" && !m.vision) return false;
      if (feature === "tools" && !m.tools) return false;
      if (feature === "free" && !(m.inputPrice === 0 && m.outputPrice === 0)) return false;
      const hay = `${m.id} ${m.name} ${vendorName(vendorOf(m.id))}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const map = new Map<string, ModelInfo[]>();
    for (const m of list) {
      const v = vendorOf(m.id);
      if (!map.has(v)) map.set(v, []);
      map.get(v)!.push(m);
    }
    // Labs in the order the recommended list names them, then by size.
    const rank = (v: string) => {
      const i = RECOMMENDED.findIndex((r) => vendorOf(r) === v);
      return i < 0 ? RECOMMENDED.length : i;
    };
    return {
      count: list.length,
      groups: [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length),
    };
  }, [all, query, vendor, feature]);

  const typed = query.trim();
  const custom = typed.includes("/") && !byId.has(typed) ? typed : null;
  const current = info(focused);
  const pick = (id: string) => {
    onPick(id);
    onClose();
  };
  // Phones have no details panel, so a tap picks straight away.
  const choose = (id: string) => (window.matchMedia("(max-width: 767px)").matches ? pick(id) : setFocused(id));

  const select = "rounded-lg border border-white/10 bg-[#16181e] px-2.5 py-1.5 text-xs text-white/75 outline-none focus:border-blox/50";

  // Portaled to <body>: the chat bar's backdrop blur would otherwise trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Select model"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[min(760px,94dvh)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#0f1115]/97 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
          <h2 className="font-display text-base font-bold tracking-tight text-white">Select Model</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col p-4">
            {/* Recommended */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/80">Recommended for Bloxy</p>
                <div className="flex gap-1">
                  {[-1, 1].map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-label={d < 0 ? "Scroll left" : "Scroll right"}
                      onClick={() => recRef.current?.scrollBy({ left: d * 220, behavior: "smooth" })}
                      className="grid size-6 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                    >
                      {d < 0 ? "‹" : "›"}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={recRef} className="mt-2.5 flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {RECOMMENDED.map((id) => {
                  const m = info(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => choose(id)}
                      onDoubleClick={() => pick(id)}
                      className={`flex w-[150px] shrink-0 flex-col items-center gap-2 rounded-xl border px-3 pt-4 pb-3 text-left transition-colors ${
                        focused === id ? "border-blox/60 bg-blox/10" : "border-white/[0.06] bg-[#15171c] hover:border-white/15"
                      }`}
                    >
                      <ProviderLogo model={id} className="size-10" />
                      <span className="w-full truncate text-center text-[12.5px] font-semibold text-white/90">{shortName(m)}</span>
                      <span className="-mt-1.5 text-[10.5px] text-white/40">{vendorName(vendorOf(id))}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* All models */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="mr-auto text-xs font-semibold text-white/80">
                All Models{" "}
                <span className="font-normal text-white/35">
                  {models ? `${groups.count} of ${all.length} models` : "loading…"}
                </span>
              </p>
              <select aria-label="Provider" value={vendor} onChange={(e) => setVendor(e.target.value)} className={select}>
                <option value="all">All providers</option>
                {vendors.map(([v, n]) => (
                  <option key={v} value={v}>
                    {vendorName(v)} ({n})
                  </option>
                ))}
              </select>
              <select aria-label="Feature" value={feature} onChange={(e) => setFeature(e.target.value as Feature)} className={select}>
                {FEATURES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <label className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#16181e] px-2.5 py-1.5 sm:w-56">
                <Search className="size-3.5 shrink-0 text-white/35" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search, or paste a model id…"
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                />
              </label>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {custom && (
                <button
                  type="button"
                  onClick={() => pick(custom)}
                  className="mb-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-blox/40 bg-blox/[0.06] px-3 py-2.5 text-left"
                >
                  <ProviderLogo model={custom} className="size-8" />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-white">{custom}</span>
                    <span className="text-[11px] text-white/45">Use this model id (any OpenRouter model works)</span>
                  </span>
                </button>
              )}
              {models === null && <p className="px-2 py-6 text-center text-xs text-white/40">Loading the live catalog…</p>}
              {models !== null && groups.count === 0 && !custom && (
                <p className="px-2 py-6 text-center text-xs text-white/40">No models match. Try another filter.</p>
              )}
              {groups.groups.map(([v, list]) => (
                <section key={v} className="mb-3">
                  <p className="sticky top-0 z-[1] bg-[#0f1115] px-1 py-1.5 text-[11px] font-semibold text-white/70">
                    {vendorName(v)} <span className="font-normal text-white/30">{list.length}</span>
                  </p>
                  <div className="space-y-1">
                    {list.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => choose(m.id)}
                        onDoubleClick={() => pick(m.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          focused === m.id ? "border-blox/50 bg-blox/[0.08]" : "border-transparent bg-white/[0.025] hover:bg-white/[0.05]"
                        }`}
                      >
                        <ProviderLogo model={m.id} className="mt-0.5 size-8" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-white/90">{shortName(m)}</span>
                            <span className="shrink-0 text-[10.5px] text-white/35">{vendorName(v)}</span>
                            {m.id === value && <span className="ml-auto shrink-0 text-[10px] text-signal">current</span>}
                          </span>
                          {m.description && (
                            <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-white/45">{m.description}</span>
                          )}
                        </span>
                        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          <Tags m={m} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          {/* Details */}
          <aside className="hidden w-[280px] shrink-0 flex-col border-l border-white/[0.07] p-4 md:flex">
            <div className="grid aspect-[16/10] place-items-center rounded-2xl border border-white/[0.06] bg-[#15171c]">
              <ProviderLogo model={current.id} className="size-16" />
            </div>
            <p className="mt-3 text-base font-semibold text-white">{shortName(current)}</p>
            <p className="text-xs text-white/45">{vendorName(vendorOf(current.id))}</p>
            <p className="mt-1 truncate font-mono text-[10.5px] text-white/30">{current.id}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Tags m={current} />
            </div>
            <p className="mt-3 line-clamp-6 text-xs leading-relaxed text-white/55">
              {current.description ?? "Runs on Bloxy through OpenRouter."}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <dt className="text-[10px] text-white/40">Context</dt>
                <dd className="mt-0.5 font-medium text-white/85">{formatContext(current.context)}</dd>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <dt className="text-[10px] text-white/40">Price / 1M tokens</dt>
                <dd className="mt-0.5 font-medium text-white/85">
                  {formatPrice(current.inputPrice)} <span className="text-white/35">in</span> · {formatPrice(current.outputPrice)}{" "}
                  <span className="text-white/35">out</span>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10.5px] leading-relaxed text-white/35">
              Bits are charged at the model&apos;s real cost. Models with “Builds in Studio” can use Bloxy&apos;s Studio tools.
            </p>
            <button
              type="button"
              onClick={() => pick(current.id)}
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-blox py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(47,125,255,0.9)] hover:brightness-110"
            >
              Select Model
            </button>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
