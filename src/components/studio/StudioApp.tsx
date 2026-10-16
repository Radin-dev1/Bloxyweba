"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import { useStudioSession } from "../useStudioSession";
import { useSettings } from "../useSettings";
import { ArrowUp, BloxyMark, BloxyWordmark, ChevronDown, Settings as Gear, Sparkle, Stop } from "../landing/icons";
import { demoScene, loadLocalPlace, saveLocalPlace } from "./demoScene";
import Explorer from "./Explorer";
import { ConnectionPill, MessageView, PairPanel, SettingsDialog } from "./parts";
import Properties from "./Properties";
import type { BuildT } from "@/lib/openrouter";
import { buildToParts } from "./nodes/ModelPreview";
import { applyEdit, toStudioProperties, type PartEdit } from "./sceneMath";
import { useChat } from "./useChat";
import AccountPill from "./AccountPill";
import ModelPicker from "./ModelPicker";
import { FREE_DEFAULT, withFreeOnly } from "./freeModels";
import { useAccount } from "./useAccount";
import { useScene, type Scene } from "./useScene";
import { DEFAULT_VIEWPORT_OPTIONS, type Tool, type ViewportOptions } from "./Viewport3D";
import WorkspaceDock, { type DockPanel } from "./dock/WorkspaceDock";
import CreateWheel, { type Primitive } from "./dock/CreateWheel";
import ShortcutsHelp from "./dock/ShortcutsHelp";
import { DEFAULT_ENVIRONMENT, loadEnvironment, saveEnvironment, type Environment } from "./environment";
import { orientationDeg } from "./sceneMath";
import type { ScenePart } from "./useScene";

const Viewport3D = dynamic(() => import("./Viewport3D"), { ssr: false });
const NodeEditor = dynamic(() => import("./NodeEditor"), { ssr: false });
const IdeaForge = dynamic(() => import("./dock/IdeaForge"), { ssr: false });
const AvatarWorkbench = dynamic(() => import("./dock/AvatarWorkbench"), { ssr: false });
const ExportPanel = dynamic(() => import("./dock/ExportPanel"), { ssr: false });
const EnvironmentPanel = dynamic(() => import("./dock/EnvironmentPanel"), { ssr: false });

const EASE = "ease-[var(--ease-spring)]";
const PLUGIN_VERSION = "0.3.0";

type Tab = "workspace" | "nodes";
type WorkspacePanel = "explorer" | "properties" | "view" | "environment" | "connect" | null;

const RAIL_ITEMS: { id: Exclude<WorkspacePanel, null>; label: string; icon: React.ReactNode }[] = [
  { id: "explorer", label: "Explorer", icon: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" /> },
  { id: "properties", label: "Properties", icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></> },
  { id: "view", label: "Viewport settings", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" /></> },
  { id: "environment", label: "Environment", icon: <><path d="M7 17.5a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.6 1.6A3.3 3.3 0 0 1 17.5 17.5Z" /><path d="M3 21h18" /></> },
  { id: "connect", label: "Connect Studio", icon: <><path d="M8 12h8M12 8v8" /><circle cx="12" cy="12" r="9" /></> },
];

function RailIcon({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function OptionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.035]">
      <div className="min-w-0"><p className="text-xs font-medium text-white/85">{label}</p><p className="mt-0.5 text-[10px] leading-snug text-white/40">{description}</p></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-[22px] w-10 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blox-soft ${checked ? "border-blox/50 bg-blox/75" : "border-white/10 bg-white/[0.08]"}`}><span className={`absolute top-[3px] left-0 size-3.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[21px]" : "translate-x-[3px]"}`} /></button>
    </div>
  );
}

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
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(null);
  const [viewportOptions, setViewportOptions] = useState<ViewportOptions>(DEFAULT_VIEWPORT_OPTIONS);
  const [dockPanel, setDockPanel] = useState<DockPanel>(null);
  const [environment, setEnvironmentState] = useState<Environment>(DEFAULT_ENVIRONMENT);
  useEffect(() => {
    const t = setTimeout(() => setEnvironmentState(loadEnvironment()), 0); // browser-only setting
    return () => clearTimeout(t);
  }, []);
  const setEnvironment = (env: Environment) => {
    setEnvironmentState(env);
    saveEnvironment(env);
  };
  // Right-click (without dragging) on the 3D view opens the create wheel.
  const [wheel, setWheel] = useState<{ x: number; y: number } | null>(null);
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const primitiveCount = useRef(0);
  const connected = !!status?.connected;

  const sceneApi = useScene(sessionId, connected);
  const { refresh: refreshScene } = sceneApi;
  const { account, refresh: refreshAccount, signOut } = useAccount();
  const onTurnEnd = useCallback(
    (r: { mutated: boolean }) => {
      if (r.mutated) void refreshScene();
      void refreshAccount(); // the turn may have spent bits
    },
    [refreshScene, refreshAccount],
  );
  const chat = useChat({
    sessionId,
    settings,
    onTurnEnd,
    onNeedsKey: () => setShowSettings(true),
    // Offline, the agent builds into the local workspace (insertBuild is declared below; this runs later).
    onBuild: (build) => void insertBuild(build).catch(() => {}),
  });

  // Before Studio connects, a demo place you can click around and edit locally.
  const [demo, setDemo] = useState<Scene>(loadLocalPlace);
  useEffect(() => saveLocalPlace(demo), [demo]);
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

  /** Puts a generated build into Studio (as a Model) or, offline, into the local place. */
  const insertBuild = async (build: BuildT): Promise<string> => {
    if (!connected) {
      const added = buildToParts(build);
      setDemo((d) => ({
        ...d,
        parts: [...d.parts.filter((p) => !p.path.startsWith(`Workspace.${build.name}.`)), ...added],
      }));
      return `Workspace.${build.name}`;
    }
    const res = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, tool: "insert_parts", args: build }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: { path?: string }; error?: string };
    if (!res.ok || !data.result?.path) throw new Error(data.error ?? `Insert failed (${res.status})`);
    void sceneApi.refresh();
    return data.result.path;
  };

  /** Adds one Roblox primitive, spread out so repeated adds don't stack. */
  const addPrimitive = async (shape: Primitive) => {
    const n = ++primitiveCount.current;
    const size: [number, number, number] =
      shape === "Block" ? [4, 1, 2] : shape === "Wedge" ? [4, 2, 4] : [4, 4, 4];
    const name = `${shape === "Block" ? "Part" : shape}${n}`;
    const spot = connected ? [0, 0, 0] : [[0, 8, -8, 16, -16][(n - 1) % 5], 0, -Math.floor((n - 1) / 5) * 8];
    try {
      const path = await insertBuild({
        name,
        parts: [
          {
            name: shape === "Block" ? "Part" : shape,
            shape,
            size,
            position: [spot[0], size[1] / 2, spot[2]],
            rotation: [0, 0, 0],
            color: "a3a2a5",
            material: "Plastic",
            transparency: 0,
          },
        ],
      });
      if (!connected) setSelectedPath(`${path}.${shape === "Block" ? "Part" : shape}`);
    } catch (err) {
      flash((err as Error).message);
    }
  };

  /** Imports a Bloxy Export JSON (or a raw build) back into the place. */
  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { name?: string; parts?: (ScenePart & Partial<BuildT["parts"][number]>)[] };
      if (!Array.isArray(data.parts) || data.parts.length === 0) throw new Error("That file has no parts.");
      const parts = data.parts.slice(0, 400).map((p, i) => ({
        name: p.name ?? p.path?.split(".").pop() ?? `Part${i + 1}`,
        shape: (["Block", "Ball", "Cylinder", "Wedge"].includes(p.shape) ? p.shape : "Block") as BuildT["parts"][number]["shape"],
        size: p.size,
        position: (p.position ?? [p.cframe[0], p.cframe[1], p.cframe[2]]) as [number, number, number],
        rotation: (p.rotation ?? (p.cframe?.length >= 12 ? orientationDeg(p as ScenePart) : [0, 0, 0])) as [number, number, number],
        color: String(p.color ?? "a3a2a5").replace("#", ""),
        material: p.material ?? "Plastic",
        transparency: p.transparency ?? 0,
      }));
      const name = (data.name || file.name.replace(/\.json$/i, "")).replace(/[^\w -]/g, "").slice(0, 60) || "Imported";
      await insertBuild({ name, parts });
    } catch (err) {
      flash(err instanceof SyntaxError ? "That isn't a Bloxy export (JSON)." : (err as Error).message);
    }
  };

  const outdated = connected && status?.studioInfo?.pluginVersion !== PLUGIN_VERSION;
  const editable = !connected || !outdated;

  return (
    <div className="relative h-dvh overflow-hidden bg-[#dfe9f8] text-zinc-100">
      {/* ── Stage ── */}
      <div
        className="absolute inset-0"
        onPointerDown={(e) => {
          if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
        }}
        onContextMenu={(e) => {
          if (tab !== "workspace") return;
          e.preventDefault();
          const start = rightDown.current;
          // A right-drag pans the camera; only a still right-click opens the wheel.
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
          setWheel({ x: e.clientX, y: e.clientY });
        }}
      >
        {tab === "workspace" ? (
          <Viewport3D
            scene={scene}
            selected={selected}
            onSelect={onSelect}
            fitKey={fitKey}
            tool={tool}
            editable={editable}
            options={viewportOptions}
            environment={environment}
            onEdit={onEdit}
          />
        ) : (
          <div className="h-full bg-ink">
            <NodeEditor
              send={chat.send}
              stop={chat.stop}
              busy={chat.busy}
              connected={connected}
              openrouterKey={settings.openrouterKey}
              onInsertBuild={insertBuild}
              onNeedsKey={() => setShowSettings(true)}
              onBackToWorkspace={() => setTab("workspace")}
            />
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
          <BloxyWordmark className="hidden h-[15px] w-auto text-white sm:block" />
        </Link>

        <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#111318]/85 p-1 backdrop-blur-xl">
          {(["workspace", "nodes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setWorkspacePanel(null);
              }}
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
          <AccountPill account={account} onSignOut={() => void signOut()} onChanged={() => void refreshAccount()} />
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

          <nav aria-label="Workspace tools" className="absolute top-1/2 left-3 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-[1.35rem] border border-white/15 bg-[#171a21]/78 p-1.5 shadow-[0_18px_50px_-24px_rgba(10,18,34,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
            {RAIL_ITEMS.map((item) => (
              <button key={item.id} type="button" title={item.label} aria-label={item.label} aria-pressed={workspacePanel === item.id} onClick={() => setWorkspacePanel((current) => current === item.id ? null : item.id)} className={`group relative grid size-10 place-items-center rounded-xl outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blox-soft active:scale-95 ${workspacePanel === item.id ? "bg-blox text-white shadow-[0_6px_18px_-8px_rgba(47,125,255,0.9)]" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                <RailIcon>{item.icon}</RailIcon>
                <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-lg border border-white/10 bg-[#101217]/95 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{item.label}</span>
              </button>
            ))}
          </nav>

          {workspacePanel && (
            <aside className="absolute top-[5.1rem] bottom-[7.2rem] left-[4.4rem] z-20 flex w-[min(320px,calc(100vw-5.5rem))] flex-col overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#101217]/90 shadow-[0_28px_70px_-28px_rgba(4,9,20,0.9)] backdrop-blur-2xl">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
                <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 place-items-center rounded-lg bg-white/[0.07] text-blox-soft"><RailIcon>{RAIL_ITEMS.find((item) => item.id === workspacePanel)?.icon}</RailIcon></span><div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-white">{workspacePanel === "connect" ? "Studio connection" : workspacePanel === "view" ? "Viewport settings" : workspacePanel[0].toUpperCase() + workspacePanel.slice(1)}</h2>{workspacePanel === "connect" && <p className="text-[10px] text-white/40">{connected ? "Connected to Roblox Studio" : "Local demo workspace"}</p>}</div></div>
                <button type="button" aria-label="Close panel" onClick={() => setWorkspacePanel(null)} className="grid size-8 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-blox-soft">×</button>
              </div>
              {workspacePanel === "environment" && <EnvironmentPanel env={environment} onChange={setEnvironment} />}
              {workspacePanel === "explorer" && <Explorer parts={parts} selected={selected} onSelect={onSelect} />}
              {workspacePanel === "properties" && (selectedPart && selected !== null ? <Properties part={selectedPart} editable={editable} onEdit={(edit) => void onEdit(selected, edit)} onAsk={() => setInput((v) => `${v ? v.trimEnd() + " " : ""}\`${selectedPart.path}\` `)} /> : <div className="grid flex-1 place-items-center px-7 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/45"><RailIcon>{RAIL_ITEMS[1].icon}</RailIcon></span><p className="mt-3 text-sm font-medium text-white/80">Nothing selected</p><p className="mt-1 text-xs leading-relaxed text-white/40">Pick a part in the viewport or Explorer to inspect and edit its properties.</p><button type="button" onClick={() => setWorkspacePanel("explorer")} className="mt-4 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/10">Open Explorer</button></div></div>)}
              {workspacePanel === "connect" && (connected ? <div className="flex-1 overflow-y-auto p-4"><PlaceCard placeName={status?.studioInfo?.placeName ?? "Your place"} count={sceneApi.scene?.parts.length ?? 0} truncated={!!sceneApi.scene?.truncated} loading={sceneApi.loading} error={sceneApi.error} outdated={outdated} onNewCode={newPairCode} /></div> : <div className="flex-1 overflow-y-auto p-3"><PairPanel status={status} onNewCode={newPairCode} error={sessionError} /></div>)}
              {workspacePanel === "view" && <div className="min-h-0 flex-1 overflow-y-auto p-3"><p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Viewport</p><div className="space-y-1"><OptionToggle label="Baseplate grid" description="Show the repeating Studio tile texture" checked={viewportOptions.showGrid} onChange={(checked) => setViewportOptions((o) => ({ ...o, showGrid: checked }))} /><OptionToggle label="View cube" description="Show the orientation helper" checked={viewportOptions.showViewcube} onChange={(checked) => setViewportOptions((o) => ({ ...o, showViewcube: checked }))} /><OptionToggle label="Grid snap" description="Move by 1 stud and scale by 0.1" checked={viewportOptions.gridSnap} onChange={(checked) => setViewportOptions((o) => ({ ...o, gridSnap: checked }))} /><OptionToggle label="Angle snap" description="Rotate in 15° increments" checked={viewportOptions.angleSnap} onChange={(checked) => setViewportOptions((o) => ({ ...o, angleSnap: checked }))} /></div>
                <div className="mt-4 border-t border-white/[0.08] pt-3"><p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Gizmo space</p><div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">{(["auto", "world", "local"] as const).map((space) => <button key={space} type="button" aria-pressed={viewportOptions.gizmoSpace === space} onClick={() => setViewportOptions((o) => ({ ...o, gizmoSpace: space }))} className={`rounded-lg px-2 py-2 text-[11px] capitalize transition-colors ${viewportOptions.gizmoSpace === space ? "bg-blox/25 text-blox-soft" : "text-white/50 hover:bg-white/[0.06] hover:text-white"}`}>{space}</button>)}</div></div>
                {!connected && demo.parts.length > 1 && <div className="mt-4 border-t border-white/[0.08] pt-3"><p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Local workspace</p><button type="button" onClick={() => { setSelectedPath(null); setDemo(demoScene()); }} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs text-white/70 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200">Clear everything built here ({demo.parts.length - 1} parts)</button></div>}
                <div className="mt-4 border-t border-white/[0.08] pt-3"><p className="px-2 text-xs font-medium text-white/80">Shadows</p><p className="px-2 mt-0.5 text-[10px] text-white/40">Rendering quality</p><div className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">{(["none", "low", "medium", "high"] as const).map((quality) => { const active = quality === "none" ? viewportOptions.shadows === "none" : viewportOptions.shadows !== "none" && viewportOptions.shadowQuality === quality; return <button key={quality} type="button" aria-pressed={active} onClick={() => setViewportOptions((o) => quality === "none" ? { ...o, shadows: "none" } : { ...o, shadows: "soft", shadowQuality: quality })} className={`rounded-lg px-1 py-2 text-[10px] capitalize transition-colors ${active ? "bg-blox/25 text-blox-soft" : "text-white/50 hover:bg-white/[0.06] hover:text-white"}`}>{quality}</button>; })}</div></div>
                <button type="button" onClick={() => setViewportOptions(DEFAULT_VIEWPORT_OPTIONS)} className="mt-4 w-full rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-white/55 transition hover:bg-white/[0.05] hover:text-white">Reset viewport options</button></div>}
            </aside>
          )}

          {toast && (
            <div className="absolute top-[8.5rem] left-1/2 z-30 max-w-md -translate-x-1/2 rounded-2xl border border-red-400/25 bg-[#1a1215]/95 px-4 py-2.5 text-sm text-red-200 shadow-xl backdrop-blur-xl">
              {toast}
            </div>
          )}
        </>
      )}

      {/* ── Nilo-style tool dock: Idea Forge, Roblox Avatar, Export ── */}
      {tab === "workspace" && (
        <>
          <WorkspaceDock open={dockPanel} onOpen={setDockPanel} />
          {dockPanel === "forge" && (
            <IdeaForge
              openrouterKey={settings.openrouterKey}
              model3d={settings.freeOnly ? FREE_DEFAULT : undefined}
              connected={connected}
              onInsertBuild={insertBuild}
              onSpent={() => void refreshAccount()}
              onNeedsKey={() => setShowSettings(true)}
              onClose={() => setDockPanel(null)}
            />
          )}
          {dockPanel === "avatar" && (
            <AvatarWorkbench
              openrouterKey={settings.openrouterKey}
              connected={connected}
              onInsertBuild={insertBuild}
              onSpent={() => void refreshAccount()}
              onNeedsKey={() => setShowSettings(true)}
              onClose={() => setDockPanel(null)}
            />
          )}
          {dockPanel === "export" && (
            <ExportPanel parts={parts} selectedPart={selectedPart} onClose={() => setDockPanel(null)} />
          )}
          <ShortcutsHelp />
          {wheel && (
            <CreateWheel
              x={wheel.x}
              y={wheel.y}
              onClose={() => setWheel(null)}
              onPrimitive={(shape) => void addPrimitive(shape)}
              onIdeaForge={() => setDockPanel("forge")}
              onAvatar={() => setDockPanel("avatar")}
              onImport={() => importInput.current?.click()}
              onAsk={() => {
                setInput((v) => v || "Build ");
                document.querySelector<HTMLTextAreaElement>("form textarea")?.focus();
              }}
            />
          )}
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f);
            }}
          />
        </>
      )}

      {/* ── Floating assistant dock ── */}
      {tab === "workspace" && (
        <ChatDock
          chat={chat}
          input={input}
          setInput={setInput}
          connected={connected}
          modelLabel={settings.models[settings.provider]}
          // Any OpenRouter model runs through Bloxy, so picking one switches the provider too.
          onPickModel={(id) =>
            setSettings({ ...settings, provider: "openrouter", models: { ...settings.models, openrouter: id } })
          }
          freeOnly={settings.freeOnly}
          onFreeOnly={(on) => setSettings(withFreeOnly(settings, on))}
          onClearChat={() => {
            chat.clear();
            setInput("");
          }}
          bits={settings.provider === "openrouter" && !settings.openrouterKey && account?.bitsEnabled ? account.bits : null}
        />
      )}

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
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[1.35rem] border border-white/15 bg-[#171a21]/80 p-1.5 shadow-[0_18px_50px_-22px_rgba(10,18,34,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
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

const CHAT_STARTERS = [
  "Build a cozy fishing village",
  "Make a lava obby with 10 stages",
  "Create a pizza shop tycoon",
  "Add a day/night cycle",
];

function ChatDock({
  chat,
  input,
  setInput,
  connected,
  modelLabel,
  onPickModel,
  freeOnly,
  onFreeOnly,
  onClearChat,
  bits,
}: {
  chat: ReturnType<typeof useChat>;
  input: string;
  setInput: (v: string) => void;
  connected: boolean;
  modelLabel: string;
  onPickModel: (id: string) => void;
  freeOnly: boolean;
  onFreeOnly: (on: boolean) => void;
  onClearChat: () => void;
  /** Bits left when chatting on bits (null hides the counter). */
  bits: number | null;
}) {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, busy, activeJob } = chat;

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
                  : "Ask Bloxy anything, or describe something to build…"
              }
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
            />
          </div>
          {/* Starter ideas inside the prompt box while the chat is empty */}
          {messages.length === 0 && !input && (
            <div className="mt-1 flex gap-1.5 overflow-x-auto pb-0.5 pl-1 [scrollbar-width:none]">
              {CHAT_STARTERS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setInput(idea)}
                  className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/60 transition-colors hover:border-blox/40 hover:text-white"
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2 pl-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/40">
              <ModelPicker value={modelLabel} onPick={onPickModel} freeOnly={freeOnly} onFreeOnly={onFreeOnly} />
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
                      onClick={onClearChat}
                      className="hidden shrink-0 rounded-full px-2 py-1 hover:bg-white/[0.06] hover:text-white/75 sm:block"
                    >
                      New chat
                    </button>
                  )}
                </>
              )}
            </div>
            {activeJob && (
              <span className="ml-auto shrink-0 text-[10px] text-blox-soft">Running in background</span>
            )}
            {bits !== null && !busy && (
              <span className="ml-auto hidden shrink-0 text-[11px] tabular-nums text-white/40 sm:block" title="Bits left today">
                {bits.toLocaleString()} bits left
              </span>
            )}
            {busy ? (
              <button
                type="button"
                onClick={() => void chat.stop()}
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
