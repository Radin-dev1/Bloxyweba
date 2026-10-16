"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "../landing/icons";
import ModelBrowser from "./ModelBrowser";
import { FREE_RECOMMENDED, RECOMMENDED, isFreeChatModel, loadTextModels, shortName, type ModelInfo } from "./models";
import ProviderLogo, { vendorName, vendorOf } from "./ProviderLogo";

type ModelOption = { id: string; name: string };

export function FreeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title="Only show OpenRouter's free models (rate-limited, but they cost nothing)"
      className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] transition-colors ${on ? "bg-blox/20 text-blox-soft" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
    >
      <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-blox" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 left-0 size-3 rounded-full bg-white transition-transform ${on ? "translate-x-[14px]" : "translate-x-0.5"}`} />
      </span>
      Free models only
    </button>
  );
}


const MAX_SHOWN = 200;

/**
 * The chat dock's model chip: click to search every model OpenRouter offers (or type any
 * model id) and run Bloxy on it.
 */
export default function ModelPicker({
  value,
  onPick,
  freeOnly = false,
  onFreeOnly,
}: {
  value: string;
  onPick: (id: string) => void;
  /** Only list free models. */
  freeOnly?: boolean;
  onFreeOnly?: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [active, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadTextModels().then((m) => alive && setModels(m));
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const results = useMemo(() => {
    const all = (models ?? []).filter((m) => !freeOnly || isFreeChatModel(m));
    const recIds = freeOnly ? FREE_RECOMMENDED : RECOMMENDED;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (m: ModelOption) => terms.every((t) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t));
    const recommended = recIds.map((id) => all.find((m) => m.id === id) ?? { id, name: id }).filter(match);
    const rest = all.filter((m) => !recIds.includes(m.id) && match(m)).slice(0, MAX_SHOWN);
    const typed = query.trim();
    // Any OpenRouter id can be used, even if it's not in the list (new or hidden models).
    const custom =
      typed.includes("/") && !all.some((m) => m.id === typed) && !recIds.includes(typed)
        ? [{ id: typed, name: "Use this model id" }]
        : [];
    return { recommended, rest, custom, flat: [...custom, ...recommended, ...rest] };
  }, [models, query, freeOnly]);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQuery("");
  };

  // Keep the highlighted row visible while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const row = (m: ModelOption, index: number) => (
    <button
      key={`${m.id}-${index}`}
      type="button"
      data-index={index}
      onMouseEnter={() => setActive(index)}
      onClick={() => pick(m.id)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left ${active === index ? "bg-white/[0.08]" : ""}`}
    >
      <ProviderLogo model={m.id} className="size-6" />
      <span className="min-w-0 flex-1">
        <span className="flex w-full items-center gap-2">
          <span className="truncate text-[12.5px] text-white/90">{m.name === "Use this model id" ? m.name : shortName(m)}</span>
          {m.id === value && <span className="ml-auto shrink-0 text-[10px] text-signal">current</span>}
        </span>
        <span className="block truncate text-[10.5px] text-white/40">
          {m.name === "Use this model id" ? m.id : vendorName(vendorOf(m.id))}
        </span>
      </span>
    </button>
  );

  let i = 0;
  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
        title="Change model"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[260px] items-center gap-1 truncate rounded-full bg-white/[0.05] px-2.5 py-1 font-mono transition-colors hover:bg-white/[0.1] hover:text-white/80"
      >
        <ProviderLogo model={value} className="size-4" />
        <span className="truncate">{value}</span>
        <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#111318]/97 p-1.5 font-sans shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-white/35" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.flat.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const chosen = results.flat[active];
                  if (chosen) pick(chosen.id);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search OpenRouter models, or paste a model id…"
              className="w-full bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/30"
            />
          </div>

          {onFreeOnly && (
            <div className="mt-1.5 flex items-center justify-between px-1">
              <FreeToggle on={freeOnly} onChange={onFreeOnly} />
              {freeOnly && <span className="text-[10px] text-white/35">Free models are rate-limited</span>}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setBrowsing(true);
            }}
            className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]"
          >
            <span className="grid size-6 place-items-center rounded-md bg-white/[0.08] text-white/70">⋯</span>
            <span>
              <span className="block text-[12.5px] text-white/90">More models</span>
              <span className="block text-[10.5px] text-white/40">Search and compare the full live catalog</span>
            </span>
          </button>
          <div ref={listRef} role="listbox" className="mt-1.5 max-h-[300px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {results.custom.map((m) => row(m, i++))}
            {results.recommended.length > 0 && (
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] tracking-[0.16em] text-white/35 uppercase">
                {freeOnly ? "Best free models" : "Recommended for Bloxy"}
              </p>
            )}
            {results.recommended.map((m) => row(m, i++))}
            {results.rest.length > 0 && (
              <p className="px-2.5 pt-2.5 pb-1 text-[10px] tracking-[0.16em] text-white/35 uppercase">
                {freeOnly ? "All free models" : "All OpenRouter models"}{models ? ` (${results.recommended.length + results.rest.length})` : ""}
              </p>
            )}
            {results.rest.map((m) => row(m, i++))}
            {models === null && <p className="px-2.5 py-3 text-xs text-white/40">Loading models…</p>}
            {models !== null && results.flat.length === 0 && (
              <p className="px-2.5 py-3 text-xs leading-relaxed text-white/40">
                No match. Paste a full model id like <span className="font-mono text-white/60">provider/model</span> to
                use it anyway.
              </p>
            )}
          </div>
          <p className="border-t border-white/[0.06] px-2.5 pt-1.5 pb-0.5 text-[10px] text-white/30">
            Runs on Bloxy (bits, or your own OpenRouter key).
          </p>
        </div>
      )}
      {browsing && (
        <ModelBrowser value={value} onPick={onPick} freeOnly={freeOnly} onFreeOnly={onFreeOnly} onClose={() => setBrowsing(false)} />
      )}
    </div>
  );
}
