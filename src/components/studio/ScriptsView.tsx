"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const EDITOR_ID = "bloxy-script-editor";

type ScriptRef = { path: string; className: string };
type Match = { path: string; line: number; text: string };

async function studio<T>(sessionId: string, tool: string, args: unknown): Promise<T> {
  const res = await fetch("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, tool, args }),
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Studio request failed (${res.status})`);
  return data.result as T;
}

const KIND: Record<string, { label: string; tone: string }> = {
  Script: { label: "S", tone: "bg-emerald-500/20 text-emerald-200" },
  LocalScript: { label: "L", tone: "bg-sky-500/20 text-sky-200" },
  ModuleScript: { label: "M", tone: "bg-amber-500/20 text-amber-200" },
};

/**
 * The Scripts tab: every script in the open place, a code search, an editor that saves back to
 * Studio (one Ctrl+Z each), and "Ask Bloxy" about the open script. Needs the Bloxy plugin.
 */
export default function ScriptsView({
  sessionId,
  connected,
  onAsk,
}: {
  sessionId: string | null;
  connected: boolean;
  /** Switch to the chat and send this message. */
  onAsk: (text: string) => void;
}) {
  const [scripts, setScripts] = useState<ScriptRef[]>([]);
  const [filter, setFilter] = useState("");
  const [grep, setGrep] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [open, setOpen] = useState<ScriptRef | null>(null);
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");

  const refresh = useCallback(async () => {
    if (!sessionId || !connected) return;
    setBusy("Loading scripts…");
    setError(null);
    try {
      const r = await studio<{ results?: ScriptRef[] }>(sessionId, "search_instances", { className: "LuaSourceContainer", limit: 500 });
      setScripts((r.results ?? []).filter((s) => !s.path.startsWith("CoreGui") && !s.path.startsWith("CorePackages")).sort((a, b) => a.path.localeCompare(b.path)));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }, [sessionId, connected]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const openScript = async (s: ScriptRef, line?: number) => {
    if (!sessionId) return;
    if (source !== saved && !window.confirm("Discard your unsaved changes?")) return;
    setBusy(`Opening ${s.path}…`);
    setError(null);
    try {
      const r = await studio<{ source: string; className: string }>(sessionId, "read_script", { path: s.path });
      setOpen({ path: s.path, className: r.className ?? s.className });
      setSource(r.source);
      setSaved(r.source);
      if (line) {
        // Put the cursor on the matching line.
        requestAnimationFrame(() => {
          const el = document.getElementById(EDITOR_ID) as HTMLTextAreaElement | null;
          if (!el) return;
          const offset = r.source.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
          el.focus();
          el.setSelectionRange(offset, offset);
          el.scrollTop = Math.max(0, (line - 5) * 19);
        });
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };

  const save = useCallback(async () => {
    if (!sessionId || !open || source === saved) return;
    setBusy("Saving to Studio…");
    setError(null);
    try {
      await studio(sessionId, "write_script", { path: open.path, source });
      setSaved(source);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }, [sessionId, open, source, saved]);

  const search = async () => {
    if (!sessionId || !grep.trim()) return setMatches(null);
    setBusy("Searching code…");
    setError(null);
    try {
      const r = await studio<{ matches?: Match[] }>(sessionId, "grep_scripts", { pattern: grep.trim(), limit: 200 });
      setMatches(r.matches ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };

  const shown = useMemo(() => scripts.filter((s) => s.path.toLowerCase().includes(filter.trim().toLowerCase())), [scripts, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, ScriptRef[]>();
    for (const s of shown) {
      const service = s.path.split(".")[0];
      m.set(service, [...(m.get(service) ?? []), s]);
    }
    return [...m];
  }, [shown]);
  const lines = source.split("\n").length;
  const dirty = source !== saved;

  if (!connected) {
    return (
      <div className="grid h-full place-items-center bg-[#0b0c10] px-6 pt-16 text-center text-zinc-100">
        <div className="max-w-md">
          <p className="font-display text-2xl font-bold tracking-tight">Your place&apos;s scripts live here</p>
          <p className="mt-3 text-sm leading-relaxed text-white/50">
            Connect the Bloxy plugin in Roblox Studio to browse, search and edit every script in your place, and ask Bloxy about any of
            them. Every save is one Ctrl+Z in Studio.
          </p>
          <p className="mt-4 text-xs text-white/35">Pair it from the connection button at the top right.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 bg-[#0b0c10] px-4 pt-20 pb-4 text-zinc-100">
      <aside className="flex w-80 shrink-0 flex-col rounded-[1.4rem] border border-white/10 bg-white/[0.02] p-3">
        <div className="flex gap-1.5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter scripts…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-blox/50"
          />
          <button type="button" onClick={() => void refresh()} title="Reload the list" className="rounded-xl bg-white/[0.06] px-3 text-sm text-white/70 hover:bg-white/[0.1]">
            ↻
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          className="mt-2 flex gap-1.5"
        >
          <input
            value={grep}
            onChange={(e) => setGrep(e.target.value)}
            placeholder="Search inside code…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-white/30 focus:border-blox/50"
          />
          {matches && (
            <button type="button" onClick={() => setMatches(null)} className="rounded-xl px-2 text-xs text-white/50 hover:text-white">
              Clear
            </button>
          )}
        </form>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {matches ? (
            <ul className="space-y-1">
              <li className="px-1 pb-1 text-[11px] text-white/40">{matches.length} matches</li>
              {matches.map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => void openScript({ path: m.path, className: "" }, m.line)}
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]"
                  >
                    <span className="block truncate text-[11px] text-white/45">
                      {m.path}:{m.line}
                    </span>
                    <span className="block truncate font-mono text-xs text-white/80">{m.text.trim()}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            groups.map(([service, list]) => (
              <div key={service} className="mb-3">
                <p className="px-1 pb-1 text-[10px] font-medium tracking-[0.16em] text-white/35 uppercase">{service}</p>
                <ul className="space-y-0.5">
                  {list.map((s) => {
                    const k = KIND[s.className] ?? KIND.Script;
                    return (
                      <li key={s.path}>
                        <button
                          type="button"
                          onClick={() => void openScript(s)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${open?.path === s.path ? "bg-blox/15 text-white" : "text-white/75 hover:bg-white/[0.05]"}`}
                        >
                          <span className={`grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold ${k.tone}`}>{k.label}</span>
                          <span className="min-w-0 truncate">{s.path.split(".").slice(1).join(".") || s.path}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {!matches && scripts.length === 0 && !busy && <p className="px-2 py-6 text-center text-sm text-white/40">No scripts in this place yet.</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-white/80">
            {open ? open.path : "No script open"}
            {dirty && <span className="ml-2 text-amber-300">● unsaved</span>}
          </p>
          {busy && <span className="text-xs text-white/45">{busy}</span>}
          <button type="button" onClick={() => setSource(saved)} disabled={!dirty} className="rounded-lg px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] disabled:opacity-30">
            Revert
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || !!busy}
            className="rounded-lg bg-blox px-3 py-1.5 text-xs font-medium text-white hover:bg-blox/90 disabled:opacity-35"
          >
            Save to Studio <kbd className="ml-1 text-[10px] text-white/60">Ctrl+S</kbd>
          </button>
        </div>
        {error && <p className="border-b border-red-400/20 bg-red-500/[0.08] px-4 py-2 text-xs text-red-200">{error}</p>}
        {open ? (
          <div className="flex min-h-0 flex-1 overflow-hidden font-mono text-[13px] leading-[19px]">
            <pre aria-hidden className="shrink-0 overflow-hidden bg-black/20 px-3 py-3 text-right text-white/25 select-none">
              {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
            </pre>
            <textarea
              id={EDITOR_ID}
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
              onScroll={(e) => {
                const gutter = e.currentTarget.previousElementSibling as HTMLElement | null;
                if (gutter) gutter.scrollTop = e.currentTarget.scrollTop;
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  void save();
                }
                if (e.key === "Tab") {
                  // Tabs indent instead of leaving the editor.
                  e.preventDefault();
                  const el = e.currentTarget;
                  const { selectionStart: a, selectionEnd: b } = el;
                  const next = source.slice(0, a) + "\t" + source.slice(b);
                  setSource(next);
                  requestAnimationFrame(() => el.setSelectionRange(a + 1, a + 1));
                }
              }}
              className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-white/90 outline-none [tab-size:4]"
            />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-white/40">Pick a script on the left.</div>
        )}
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = ask.trim() || "Explain what this script does and point out any bugs or exploits.";
              onAsk(`About the script ${open.path} in my place: ${q}`);
              setAsk("");
            }}
            className="flex gap-2 border-t border-white/10 p-3"
          >
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask Bloxy about this script (empty = explain it and find bugs)…"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-blox/50"
            />
            <button type="submit" className="rounded-xl bg-white/[0.08] px-3.5 text-sm font-medium text-white hover:bg-white/[0.14]">
              Ask Bloxy
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
