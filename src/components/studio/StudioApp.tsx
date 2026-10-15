"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import { useStudioSession } from "../useStudioSession";
import { useSettings } from "../useSettings";
import { ArrowUp, BloxyMark, ChevronDown, Settings as Gear, Sparkle, Stop } from "../landing/icons";
import { demoScene } from "./demoScene";
import { ConnectionPill, MessageView, PairPanel, SettingsDialog } from "./parts";
import { useChat } from "./useChat";
import { useScene, type ScenePart } from "./useScene";

const Viewport3D = dynamic(() => import("./Viewport3D"), { ssr: false });
const NodeEditor = dynamic(() => import("./NodeEditor"), { ssr: false });

const EASE = "ease-[var(--ease-spring)]";
const PLUGIN_VERSION = "0.2.0";

type Tab = "workspace" | "nodes";

/** Prompt handed over from the landing page (/studio?prompt=…). */
function initialPrompt() {
  try {
    return new URLSearchParams(window.location.search).get("prompt") ?? "";
  } catch {
    return "";
  }
}

export default function StudioApp() {
  const { sessionId, status, newPairCode, error: sessionError } = useStudioSession();
  const [settings, setSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("workspace");
  const connected = !!status?.connected;

  const sceneApi = useScene(sessionId, connected);
  const { refresh: refreshScene } = sceneApi;
  const onTurnEnd = useCallback(
    (r: { mutated: boolean }) => {
      if (r.mutated) void refreshScene();
    },
    [refreshScene],
  );
  const chat = useChat({ sessionId, settings, onTurnEnd, onNeedsKey: () => setShowSettings(true) });

  const demo = useMemo(() => demoScene(), []);
  const scene = connected ? sceneApi.scene : demo;
  const [selected, setSelected] = useState<number | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const selectedPart = selected !== null ? scene?.parts[selected] : undefined;

  // Selection is per scene snapshot; reset when a new snapshot arrives.
  const sceneStamp = scene?.fetchedAt;
  const [lastStamp, setLastStamp] = useState(sceneStamp);
  if (sceneStamp !== lastStamp) {
    setLastStamp(sceneStamp);
    setSelected(null);
  }

  const onSelect = (i: number | null) => {
    setSelected(i);
    if (connected) void sceneApi.select(i !== null ? (scene?.parts[i]?.path ?? null) : null);
  };

  const [input, setInput] = useState(initialPrompt);
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/studio");
  }, []);

  const outdated = connected && status?.studioInfo?.pluginVersion !== PLUGIN_VERSION;

  return (
    <div className="relative h-dvh overflow-hidden bg-ink text-zinc-100">
      {/* ── Stage ── */}
      <div className="absolute inset-0">
        {tab === "workspace" ? (
          <Viewport3D scene={scene} selected={selected} onSelect={onSelect} fitKey={fitKey} />
        ) : (
          <NodeEditor send={chat.send} stop={chat.stop} busy={chat.busy} connected={connected} />
        )}
      </div>
      {/* Soft vignette so floating UI reads over bright scenes */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />

      {/* ── Top bar ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <Link href="/" className="pointer-events-auto flex items-center gap-2.5">
          <BloxyMark className="size-8" />
          <span className="hidden font-display text-lg font-bold tracking-tight sm:inline">Bloxy</span>
        </Link>

        <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/50 p-1 backdrop-blur-xl">
          {(["workspace", "nodes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize transition-all duration-500 ${EASE} ${
                tab === t
                  ? "bg-white/[0.12] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  : "text-white/50 hover:text-white/85"
              }`}
            >
              {t === "workspace" ? "3D Workspace" : "Nodes"}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <ConnectionPill status={status} />
          <button
            onClick={() => setShowSettings(true)}
            aria-label="AI settings"
            className={`flex items-center gap-2 rounded-full border border-white/10 bg-black/50 py-1.5 pr-1.5 pl-3.5 text-sm backdrop-blur-xl transition-colors duration-500 ${EASE} hover:bg-white/[0.08]`}
          >
            <span className="hidden text-white/60 lg:inline">{PROVIDERS[settings.provider].label}</span>
            <span className="grid size-6 place-items-center rounded-full bg-white/[0.08]">
              <Gear className="size-3.5" />
            </span>
          </button>
        </div>
      </header>

      {/* ── Left panel: pairing or scene info (3D tab only; nodes need the room) ── */}
      {tab === "workspace" && (
        <aside className="pointer-events-auto absolute top-20 left-4 z-10 hidden max-h-[calc(100dvh-15rem)] w-[320px] flex-col gap-3 overflow-y-auto overscroll-contain [scrollbar-width:none] md:left-5 md:flex">
          <div className="pointer-events-auto">
            {connected ? (
              <ScenePanel
                placeName={status?.studioInfo?.placeName ?? "Your place"}
                count={sceneApi.scene?.parts.length ?? 0}
                truncated={!!sceneApi.scene?.truncated}
                loading={sceneApi.loading}
                error={sceneApi.error}
                outdated={outdated}
                onRefresh={() => void sceneApi.refresh()}
                onFrame={() => setFitKey((k) => k + 1)}
                onNewCode={newPairCode}
              />
            ) : (
              <PairPanel status={status} onNewCode={newPairCode} error={sessionError} />
            )}
          </div>
          {tab === "workspace" && selectedPart && (
            <div className="pointer-events-auto">
              <Inspector
                part={selectedPart}
                onAsk={() => setInput((v) => `${v ? v.trimEnd() + " " : ""}\`${selectedPart.path}\` `)}
                onClose={() => onSelect(null)}
              />
            </div>
          )}
        </aside>
      )}

      {/* Mobile pairing sheet */}
      {!connected && tab === "workspace" && (
        <div className="absolute inset-x-4 top-20 z-10 md:hidden">
          <PairPanel status={status} onNewCode={newPairCode} error={sessionError} />
        </div>
      )}

      {/* Demo label */}
      {tab === "workspace" && !connected && (
        <div className="pointer-events-none absolute top-20 right-5 z-10 hidden rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-medium tracking-[0.2em] text-white/50 uppercase backdrop-blur-xl md:block">
          Demo scene · connect Studio to see your place
        </div>
      )}

      {/* ── ForgeGUI-style chat dock ── */}
      <ChatDock
        chat={chat}
        input={input}
        setInput={setInput}
        connected={connected}
        modelLabel={settings.models[settings.provider]}
      />

      {showSettings && (
        <SettingsDialog settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ScenePanel({
  placeName,
  count,
  truncated,
  loading,
  error,
  outdated,
  onRefresh,
  onFrame,
  onNewCode,
}: {
  placeName: string;
  count: number;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  outdated: boolean;
  onRefresh: () => void;
  onFrame: () => void;
  onNewCode: () => void;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-black/45 p-1 backdrop-blur-xl">
      <div className="rounded-[calc(1.4rem-0.25rem)] bg-white/[0.03] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium tracking-[0.2em] text-signal uppercase">Live place</p>
          <button onClick={onNewCode} className="text-[11px] text-white/35 hover:text-white/75">
            Re-pair
          </button>
        </div>
        <p className="mt-1.5 truncate font-display text-lg font-bold tracking-tight">{placeName}</p>
        <p className="mt-0.5 text-xs text-white/45">
          {loading ? "Loading parts…" : `${count.toLocaleString()} parts${truncated ? " (first 3,000)" : ""}`}
        </p>
        {outdated && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-200">
            Your plugin is out of date.{" "}
            <a href="/api/plugin/download" className="underline">
              Download the new one
            </a>{" "}
            and restart Studio to see your place in 3D.
          </p>
        )}
        {error && !outdated && <p className="mt-3 text-xs leading-relaxed text-red-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className={`flex-1 rounded-full border border-white/10 py-1.5 text-xs text-white/75 transition-colors duration-500 ${EASE} hover:bg-white/[0.06] disabled:opacity-40`}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={onFrame}
            className={`flex-1 rounded-full border border-white/10 py-1.5 text-xs text-white/75 transition-colors duration-500 ${EASE} hover:bg-white/[0.06]`}
          >
            Frame all
          </button>
        </div>
      </div>
    </div>
  );
}

function Inspector({ part, onAsk, onClose }: { part: ScenePart; onAsk: () => void; onClose: () => void }) {
  const [x, y, z] = part.cframe;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  return (
    <div className="rounded-[1.4rem] border border-blox/25 bg-black/45 p-1 backdrop-blur-xl">
      <div className="rounded-[calc(1.4rem-0.25rem)] bg-white/[0.03] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium tracking-[0.2em] text-blox-soft uppercase">Selected</p>
          <button onClick={onClose} className="text-[11px] text-white/35 hover:text-white/75">
            Clear
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[12px] break-all text-white/85">{part.path}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-white/35">Shape</dt>
          <dd className="text-right text-white/75">{part.shape}</dd>
          <dt className="text-white/35">Material</dt>
          <dd className="text-right text-white/75">{part.material}</dd>
          <dt className="text-white/35">Color</dt>
          <dd className="flex items-center justify-end gap-1.5 font-mono text-white/75">
            <span className="size-3 rounded-sm ring-1 ring-white/20" style={{ background: `#${part.color}` }} />#
            {part.color}
          </dd>
          <dt className="text-white/35">Size</dt>
          <dd className="text-right font-mono text-white/75">{part.size.map(fmt).join(", ")}</dd>
          <dt className="text-white/35">Position</dt>
          <dd className="text-right font-mono text-white/75">{[x, y, z].map(fmt).join(", ")}</dd>
        </dl>
        <button
          onClick={onAsk}
          className={`group mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-blox/15 py-2 text-xs font-medium text-blox-soft transition-colors duration-500 ${EASE} hover:bg-blox/25`}
        >
          <Sparkle className="size-3.5" /> Ask Bloxy about this part
        </button>
      </div>
    </div>
  );
}

function ChatDock({
  chat,
  input,
  setInput,
  connected,
  modelLabel,
}: {
  chat: ReturnType<typeof useChat>;
  input: string;
  setInput: (v: string) => void;
  connected: boolean;
  modelLabel: string;
}) {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, busy } = chat;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    if (!input.trim() || busy) return;
    setOpen(true);
    void chat.send(input);
    setInput("");
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-3 md:px-5 md:pb-5">
      <div className="pointer-events-auto flex w-full max-w-[720px] flex-col gap-2">
        {/* Thread */}
        {open && messages.length > 0 && (
          <div className="rounded-[1.4rem] border border-white/10 bg-[#0c0d11]/80 p-1 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div
              ref={scrollRef}
              className="max-h-[38dvh] space-y-5 overflow-y-auto rounded-[calc(1.4rem-0.25rem)] px-4 py-4 text-[14px]"
            >
              {messages.map((m, i) => (
                <MessageView key={i} message={m} streaming={busy && i === messages.length - 1} />
              ))}
            </div>
          </div>
        )}

        {/* Prompt bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-[1.4rem] border border-white/[0.12] bg-[#0e1014]/85 p-2.5 shadow-[0_30px_80px_-30px_rgba(47,125,255,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-blox/30 bg-blox/15 py-1 pr-2 pl-1.5 text-xs font-semibold text-blox-soft">
              <BloxyMark className="size-4" />
              Bloxy
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              autoFocus
              placeholder={
                connected
                  ? "Make a team FPS map with spawns on both sides…"
                  : "Connect Studio, then tell Bloxy what to build…"
              }
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 pl-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/40">
              <span className="truncate rounded-full bg-white/[0.05] px-2.5 py-1 font-mono">{modelLabel}</span>
              {messages.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 hover:bg-white/[0.06] hover:text-white/75"
                  >
                    {open ? "Hide chat" : `Show chat (${messages.length})`}
                    <ChevronDown
                      className={`size-3 transition-transform duration-500 ${EASE} ${open ? "" : "rotate-180"}`}
                    />
                  </button>
                  {!busy && (
                    <button
                      type="button"
                      onClick={chat.clear}
                      className="hidden shrink-0 rounded-full px-2 py-1 hover:bg-white/[0.06] hover:text-white/75 sm:block"
                    >
                      New chat
                    </button>
                  )}
                </>
              )}
            </div>
            {busy ? (
              <button
                type="button"
                onClick={chat.stop}
                className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 py-1.5 pr-3.5 pl-1.5 text-sm hover:bg-white/15"
              >
                <span className="grid size-6 place-items-center rounded-full bg-white/10">
                  <Stop className="size-3" />
                </span>
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={`group flex shrink-0 items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-3.5 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_10px_30px_-10px_rgba(47,125,255,0.9)] transition-all duration-500 ${EASE} active:scale-[0.97] disabled:opacity-35 disabled:shadow-none`}
              >
                <Sparkle className="size-3.5" />
                Use Bloxy
                <span
                  className={`grid size-6 place-items-center rounded-full bg-white/15 transition-transform duration-500 ${EASE} group-hover:-translate-y-0.5`}
                >
                  <ArrowUp className="size-3" />
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
