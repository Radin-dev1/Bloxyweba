"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import { useStudioSession } from "../useStudioSession";
import { useSettings } from "../useSettings";
import { ArrowUp, BloxyMark, ChevronDown, Settings as Gear, Sparkle, Stop } from "../landing/icons";
import { demoScene } from "./demoScene";
import Explorer from "./Explorer";
import { ConnectionPill, MessageView, PairPanel, SettingsDialog } from "./parts";
import Properties from "./Properties";
import { applyEdit, toStudioProperties, type PartEdit } from "./sceneMath";
import { useChat } from "./useChat";
import { useScene, type Scene } from "./useScene";
import type { Tool } from "./Viewport3D";

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

// Panels: dark glass over the bright Studio sky (Nilo-style), Studio-style contents.
const PANEL =
  "rounded-[1.25rem] border border-white/10 bg-[#111318]/90 shadow-[0_24px_60px_-24px_rgba(10,20,40,0.55)] backdrop-blur-xl";

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

  // Before Studio connects, a demo place you can click around and edit locally.
  const [demo, setDemo] = useState<Scene>(() => demoScene());
  const scene = connected ? sceneApi.scene : demo;
  const parts = useMemo(() => scene?.parts ?? [], [scene]);

  // Selection is kept by path, so it survives refreshes after edits.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (!selectedPath) return null;
    const i = parts.findIndex((p) => p.path === selectedPath);
    return i === -1 ? null : i;
  }, [parts, selectedPath]);
  const selectedPart = selected !== null ? parts[selected] : undefined;

  const [fitKey, setFitKey] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const onSelect = (i: number | null) => {
    const path = i !== null ? (parts[i]?.path ?? null) : null;
    setSelectedPath(path);
    if (connected) void sceneApi.select(path);
  };

  const onEdit = async (index: number, edit: PartEdit) => {
    const part = parts[index];
    if (!part) return;
    const next = applyEdit(part, edit);
    if (!connected) {
      setDemo((d) => ({ ...d, parts: d.parts.map((p, i) => (i === index ? next : p)) }));
      return;
    }
    sceneApi.patchPart(index, next);
    const err = await sceneApi.setProperties(part.path, toStudioProperties(part, edit));
    if (err) {
      flash(`Studio rejected the edit: ${err}`);
      void sceneApi.refresh();
    }
  };

  // Studio shortcuts: Ctrl+1..4 for Select/Move/Scale/Rotate, Esc to deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.ctrlKey || e.metaKey) && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        setTool((["select", "move", "scale", "rotate"] as const)[Number(e.key) - 1]);
      }
      if (e.key === "Escape") setSelectedPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [input, setInput] = useState(initialPrompt);
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/studio");
  }, []);

  const outdated = connected && status?.studioInfo?.pluginVersion !== PLUGIN_VERSION;
  const editable = !connected || !outdated;

  return (
    <div className="relative h-dvh overflow-hidden bg-[#dfe9f8] text-zinc-100">
      {/* ── Stage ── */}
      <div className="absolute inset-0">
        {tab === "workspace" ? (
          <Viewport3D
            scene={scene}
            selected={selected}
            onSelect={onSelect}
            fitKey={fitKey}
            tool={tool}
            editable={editable}
            onEdit={onEdit}
          />
        ) : (
          <div className="h-full bg-ink">
            <NodeEditor send={chat.send} stop={chat.stop} busy={chat.busy} connected={connected} />
          </div>
        )}
      </div>

      {/* ── Top bar ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-4">
        <Link
          href="/"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#111318]/85 py-1 pr-3.5 pl-1 backdrop-blur-xl"
        >
          <BloxyMark className="size-7" />
          <span className="hidden font-display text-[15px] font-bold tracking-tight sm:inline">Bloxy</span>
        </Link>

        <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#111318]/85 p-1 backdrop-blur-xl">
          {(["workspace", "nodes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm transition-all duration-500 ${EASE} ${
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
          <span className="rounded-full bg-[#111318]/85 backdrop-blur-xl">
            <ConnectionPill status={status} />
          </span>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="AI settings"
            className={`flex items-center gap-2 rounded-full border border-white/10 bg-[#111318]/85 py-1.5 pr-1.5 pl-3.5 text-sm backdrop-blur-xl transition-colors duration-500 ${EASE} hover:bg-[#1b1e26]`}
          >
            <span className="hidden text-white/60 lg:inline">{PROVIDERS[settings.provider].label}</span>
            <span className="grid size-6 place-items-center rounded-full bg-white/[0.08]">
              <Gear className="size-3.5" />
            </span>
          </button>
        </div>
      </header>

      {tab === "workspace" && (
        <>
          {/* ── Studio toolbar ── */}
          <ToolBar
            tool={tool}
            setTool={setTool}
            onFrame={() => setFitKey((k) => k + 1)}
            onRefresh={connected ? () => void sceneApi.refresh() : undefined}
            refreshing={sceneApi.loading}
          />

          {/* ── Left: place + Explorer ── */}
          <aside className="absolute top-[4.5rem] bottom-[10.5rem] left-4 z-10 hidden w-[272px] flex-col gap-3 md:flex xl:bottom-4">
            {connected ? (
              <PlaceCard
                placeName={status?.studioInfo?.placeName ?? "Your place"}
                count={sceneApi.scene?.parts.length ?? 0}
                truncated={!!sceneApi.scene?.truncated}
                loading={sceneApi.loading}
                error={sceneApi.error}
                outdated={outdated}
                onNewCode={newPairCode}
              />
            ) : (
              <div className="max-h-[55%] shrink-0 overflow-y-auto rounded-[1.6rem] [scrollbar-width:none]">
                <PairPanel status={status} onNewCode={newPairCode} error={sessionError} />
              </div>
            )}
            <div className={`${PANEL} flex min-h-[180px] flex-1 flex-col overflow-hidden`}>
              {!connected && (
                <p className="mx-3 mt-3 -mb-1 w-max rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-medium tracking-[0.15em] text-amber-200 uppercase">
                  Demo scene
                </p>
              )}
              <Explorer parts={parts} selected={selected} onSelect={onSelect} />
            </div>
          </aside>

          {/* ── Right: Properties ── */}
          <aside className="absolute top-[4.5rem] right-4 bottom-[10.5rem] z-10 hidden w-[264px] flex-col md:flex">
            <div className={`${PANEL} flex max-h-full min-h-0 flex-col overflow-hidden`}>
              {selectedPart && selected !== null ? (
                <Properties
                  part={selectedPart}
                  editable={editable}
                  onEdit={(edit) => void onEdit(selected, edit)}
                  onAsk={() => setInput((v) => `${v ? v.trimEnd() + " " : ""}\`${selectedPart.path}\` `)}
                />
              ) : (
                <div className="p-4">
                  <p className="text-[10px] font-medium tracking-[0.2em] text-white/45 uppercase">Properties</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
                    Select a part in the viewport or the Explorer to see and edit its properties.
                  </p>
                  <div className="mt-3 space-y-1.5 text-[11px] text-white/35">
                    {[
                      ["Ctrl+1–4", "Select · Move · Scale · Rotate"],
                      ["Drag", "Orbit · right-drag to pan"],
                      ["Esc", "Deselect"],
                    ].map(([k, v]) => (
                      <p key={k} className="flex justify-between gap-2">
                        <span className="font-mono text-white/55">{k}</span>
                        <span className="text-right">{v}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Mobile pairing sheet */}
          {!connected && (
            <div className="absolute inset-x-4 top-[8.5rem] z-10 md:hidden">
              <PairPanel status={status} onNewCode={newPairCode} error={sessionError} />
            </div>
          )}

          {toast && (
            <div className="absolute top-[8.5rem] left-1/2 z-30 max-w-md -translate-x-1/2 rounded-2xl border border-red-400/25 bg-[#1a1215]/95 px-4 py-2.5 text-sm text-red-200 shadow-xl backdrop-blur-xl">
              {toast}
            </div>
          )}
        </>
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

const TOOL_ICONS: Record<Tool, React.ReactNode> = {
  select: <path d="M5 3l14 8-6 1.5L10 19 5 3Z" />,
  move: <path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  scale: <path d="M4 20 20 4M14 4h6v6M10 20H4v-6" />,
  rotate: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
};

function ToolButton({
  active,
  title,
  label,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  title: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex w-14 flex-col items-center gap-0.5 rounded-xl pt-1.5 pb-1 text-[10px] transition-colors duration-300 disabled:opacity-40 ${
        active ? "bg-[#1aa3ff]/20 text-[#7cc8ff]" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
      {label}
    </button>
  );
}

function ToolBar({
  tool,
  setTool,
  onFrame,
  onRefresh,
  refreshing,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  onFrame: () => void;
  onRefresh?: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="absolute top-[4.5rem] left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-white/10 bg-[#111318]/90 p-1 shadow-[0_20px_50px_-20px_rgba(10,20,40,0.6)] backdrop-blur-xl">
      {(["select", "move", "scale", "rotate"] as const).map((t, i) => (
        <ToolButton
          key={t}
          active={tool === t}
          title={`${t[0].toUpperCase() + t.slice(1)} (Ctrl+${i + 1})`}
          label={t[0].toUpperCase() + t.slice(1)}
          onClick={() => setTool(t)}
        >
          {TOOL_ICONS[t]}
        </ToolButton>
      ))}
      <span className="mx-1 h-8 w-px bg-white/10" />
      <ToolButton title="Frame all" label="Frame" onClick={onFrame}>
        <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
        <circle cx="12" cy="12" r="2.5" />
      </ToolButton>
      {onRefresh && (
        <ToolButton title="Reload the place from Studio" label="Sync" onClick={onRefresh} disabled={refreshing}>
          <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M4 20v-4.5h4.5" />
        </ToolButton>
      )}
    </div>
  );
}

function PlaceCard({
  placeName,
  count,
  truncated,
  loading,
  error,
  outdated,
  onNewCode,
}: {
  placeName: string;
  count: number;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  outdated: boolean;
  onNewCode: () => void;
}) {
  return (
    <div className={`${PANEL} shrink-0 p-4`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.2em] text-signal uppercase">
          <span className="size-1.5 rounded-full bg-signal" /> Live place
        </p>
        <button onClick={onNewCode} className="text-[11px] text-white/35 hover:text-white/75">
          Re-pair
        </button>
      </div>
      <p className="mt-1.5 truncate font-display text-lg font-bold tracking-tight">{placeName}</p>
      <p className="mt-0.5 text-xs text-white/45">
        {loading ? "Syncing with Studio…" : `${count.toLocaleString()} parts${truncated ? " (first 3,000)" : ""}`}
      </p>
      {outdated && (
        <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-200">
          Your plugin is out of date.{" "}
          <a href="/api/plugin/download" className="underline">
            Download the new one
          </a>{" "}
          and restart Studio to see and edit your place in 3D.
        </p>
      )}
      {error && !outdated && <p className="mt-3 text-xs leading-relaxed text-red-300">{error}</p>}
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
