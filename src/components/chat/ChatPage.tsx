"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildT } from "@/lib/openrouter";
import { ArrowUp, BloxyMark, BloxyWordmark, Settings as Gear, Sparkle, Stop } from "../landing/icons";
import AccountPill from "../studio/AccountPill";
import { loadLocalPlace, saveLocalPlace } from "../studio/demoScene";
import ModelPicker from "../studio/ModelPicker";
import { withFreeOnly } from "../studio/freeModels";
import { meshStore, toBytes, type WorkspaceMesh } from "../studio/blenderMesh";
import { buildToParts } from "../studio/nodes/ModelPreview";
import { MessageView, SettingsDialog } from "../studio/parts";
import { useAccount } from "../studio/useAccount";
import { useChat, type SculptedMesh } from "../studio/useChat";
import { usePluginInbox } from "../studio/usePluginInbox";
import { useStudioSession } from "../useStudioSession";
import { useStudioMcp } from "../studio/useStudioMcp";
import { useSettings } from "../useSettings";

const ModelPreview = dynamic(() => import("../studio/nodes/ModelPreview"), { ssr: false });
const GlbPreview = dynamic(() => import("../studio/nodes/GlbPreview"), { ssr: false });

const STARTERS = [
  { title: "Build a cozy cottage", text: "Build a cozy cottage with a steep red roof, a chimney and a little garden fence" },
  { title: "Design an obby", text: "Plan a 10-stage lava obby that gets harder each stage, with checkpoints" },
  { title: "Write a save system", text: "Write a DataStore save system for coins and level, with session locking" },
  { title: "Explain RemoteEvents", text: "Explain RemoteEvents vs RemoteFunctions and how to keep them secure" },
];

const BUILDS_KEY = "bloxy.chat.builds.v1";
/** Which chat tool call sculpted which mesh; the GLBs themselves live in IndexedDB by name. */
const MESHES_KEY = "bloxy.chat.meshes.v1";
type MeshCard = { name: string; tris: number };

function loadMeshCards(): Record<string, MeshCard> {
  try {
    return JSON.parse(localStorage.getItem(MESHES_KEY) || "{}") as Record<string, MeshCard>;
  } catch {
    return {};
  }
}

function loadBuilds(): Record<string, BuildT> {
  try {
    return JSON.parse(localStorage.getItem(BUILDS_KEY) || "{}") as Record<string, BuildT>;
  } catch {
    return {};
  }
}

/** Saves a chat-built model into the local Bloxy workspace too, beside what is already there. */
function addToLocalPlace(build: BuildT) {
  const place = loadLocalPlace();
  const others = place.parts.filter((p) => !p.path.startsWith(`Workspace.${build.name}.`) && !/(^|\.)Baseplate$/.test(p.path));
  const maxX = others.reduce((m, p) => Math.max(m, p.cframe[0] + Math.max(...p.size) / 2), -Infinity);
  const origin: [number, number, number] = maxX === -Infinity ? [0, 0, 0] : [Math.ceil(maxX + 20), 0, 0];
  saveLocalPlace({
    ...place,
    parts: [...place.parts.filter((p) => !p.path.startsWith(`Workspace.${build.name}.`)), ...buildToParts(build, origin)],
  });
}

/** Bloxy as a plain chat: no 3D workspace, no node editor. Models it builds show inline. */
export default function ChatPage() {
  const { sessionId, status } = useStudioSession();
  const [settings, setSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const { account, refresh: refreshAccount, signOut } = useAccount();
  const [builds, setBuilds] = useState<Record<string, BuildT>>(loadBuilds);
  const [meshCards, setMeshCards] = useState<Record<string, MeshCard>>(loadMeshCards);
  // Sculpted meshes saved in this browser, by name (shared with the Studio workspace).
  const [stored, setStored] = useState<WorkspaceMesh[]>([]);
  useEffect(() => {
    let alive = true;
    void meshStore.all().then((m) => alive && setStored(m));
    return () => {
      alive = false;
    };
  }, []);
  /** Saves a sculpted mesh into the local workspace (beside everything else) and shows it inline. */
  const placeMesh = (m: SculptedMesh) => {
    const glb = toBytes(m.glb);
    const url = URL.createObjectURL(new Blob([glb as BlobPart], { type: "model/gltf-binary" }));
    const place = loadLocalPlace().parts.filter((p) => !/(^|\.)Baseplate$/.test(p.path));
    let maxX = place.reduce((x, p) => Math.max(x, p.cframe[0] + Math.max(...p.size) / 2), -Infinity);
    for (const s of stored) if (s.name !== m.name) maxX = Math.max(maxX, s.origin[0] + Math.max(s.dims[0], s.dims[1]) / 2);
    const origin = stored.find((s) => s.name === m.name)?.origin ?? (maxX === -Infinity ? [0, 0, 0] : [Math.ceil(maxX + 20), 0, 0]);
    const dims: [number, number, number] = m.fit && !m.dims[0] ? [m.fit, m.fit, m.fit] : m.dims;
    void meshStore.put({ name: m.name, glb, origin, dims, tris: m.tris, fit: m.fit });
    setStored((all) => [...all.filter((s) => s.name !== m.name), { name: m.name, url, origin, dims, tris: m.tris, fit: m.fit }]);
    setMeshCards((c) => {
      const next = { ...c, [m.id]: { name: m.name, tris: m.tris } };
      try {
        localStorage.setItem(MESHES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const chat = useChat({
    sessionId,
    settings,
    onTurnEnd: () => void refreshAccount(),
    onNeedsKey: () => setShowSettings(true),
    onBuild: (build, id) => {
      addToLocalPlace(build);
      setBuilds((b) => {
        const next = { ...b, [id]: build };
        const keys = Object.keys(next);
        for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete next[k];
        try {
          localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    onMesh: (mesh) => placeMesh(mesh),
  });
  // Messages typed in the Bloxy plugin inside Roblox Studio run here too.
  usePluginInbox(sessionId, !!status?.connected, chat.send);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mcp = useStudioMcp();
  // Plugin or Roblox Studio's built-in MCP server: either way Bloxy builds straight into Studio.
  const connected = !!status?.connected || !!mcp.studio;
  const { messages, busy } = chat;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text = input) => {
    if (!text.trim() || busy) return;
    void chat.send(text);
    setInput("");
  };

  const bits = settings.provider === "openrouter" && !settings.openrouterKey && account?.bitsEnabled ? account.bits : null;
  const modelLabel = settings.models[settings.provider];
  const previews = useMemo(
    () => messages.map((m) => m.tools.map((t) => builds[t.id]).filter(Boolean) as BuildT[]),
    [messages, builds],
  );
  const meshPreviews = useMemo(
    () =>
      messages.map((m) =>
        m.tools.flatMap((t) => {
          const card = meshCards[t.id];
          const url = card && stored.find((s) => s.name === card.name)?.url;
          return card && url ? [{ ...card, url }] : [];
        }),
      ),
    [messages, meshCards, stored],
  );

  return (
    <div className="flex h-dvh flex-col bg-[#0b0c10] text-zinc-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <BloxyMark className="size-7" />
            <BloxyWordmark className="hidden h-[15px] w-auto text-white sm:block" />
          </Link>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/60">Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            title={connected ? "Bloxy builds directly in your Studio place" : "Models Bloxy builds show here and in your Bloxy workspace"}
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] sm:flex ${connected ? "bg-blox/15 text-blox-soft" : "bg-white/[0.05] text-white/45"}`}
          >
            <span className={`size-1.5 rounded-full ${connected ? "bg-blox" : "bg-white/30"}`} />
            {status?.connected ? "Studio connected" : mcp.studio ? "Studio connected (MCP)" : "Studio offline"}
          </span>
          <Link href="/studio" className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
            Open Studio
          </Link>
          <AccountPill account={account} onSignOut={() => void signOut()} onChanged={() => void refreshAccount()} />
          <button type="button" aria-label="Settings" onClick={() => setShowSettings(true)} className="grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white">
            <Gear className="size-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-blox/15">
                <BloxyMark className="size-9" />
              </span>
              <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">What are we building?</h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/45">
                Ask anything about Roblox: scripts, systems, game design. Ask for a model and Bloxy builds it right here.
              </p>
              <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => submit(s.text)}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition hover:border-blox/40 hover:bg-blox/[0.06]"
                  >
                    <span className="block text-sm font-medium text-white/90">{s.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-white/45">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-[15px]">
              {messages.map((m, i) => (
                <div key={i}>
                  <MessageView message={m} streaming={busy && i === messages.length - 1} />
                  {previews[i]?.map((b, j) => (
                    <div key={j} className="mt-3 ml-10 overflow-hidden rounded-2xl border border-white/10 bg-[#dfe9f8]">
                      <div className="h-72">
                        <ModelPreview build={b} />
                      </div>
                      <div className="flex items-center justify-between bg-[#111318] px-3 py-2 text-xs text-white/60">
                        <span>
                          {b.name} · {b.parts.length} parts
                        </span>
                        <Link href="/studio" className="text-blox-soft hover:underline">
                          Open in workspace
                        </Link>
                      </div>
                    </div>
                  ))}
                  {meshPreviews[i]?.map((mesh, j) => (
                    <div key={`m${j}`} className="mt-3 ml-10 overflow-hidden rounded-2xl border border-white/10 bg-[#dfe9f8]">
                      <div className="h-72">
                        <GlbPreview url={mesh.url} />
                      </div>
                      <div className="flex items-center justify-between bg-[#111318] px-3 py-2 text-xs text-white/60">
                        <span>
                          {mesh.name} · 3D mesh{mesh.tris ? ` · ${mesh.tris.toLocaleString()} triangles` : ""}
                        </span>
                        <span className="flex items-center gap-3">
                          <a href={mesh.url} download={`${mesh.name}.glb`} title="In Roblox Studio: File > Import 3D" className="hover:text-white">
                            Download .glb
                          </a>
                          <Link href="/studio" className="text-blox-soft hover:underline">
                            Open in workspace
                          </Link>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mx-auto w-full max-w-3xl rounded-[1.4rem] border border-white/[0.12] bg-[#12141a] p-2.5 shadow-[0_30px_80px_-40px_rgba(47,125,255,0.55)]"
        >
          <textarea
            ref={textRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            autoFocus
            placeholder="Message Bloxy…"
            className="max-h-48 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
          />
          <div className="mt-1 flex items-center gap-2 pl-1 text-[11px] text-white/40">
            <ModelPicker
              value={modelLabel}
              onPick={(id) => setSettings({ ...settings, provider: "openrouter", models: { ...settings.models, openrouter: id } })}
              freeOnly={settings.freeOnly}
              onFreeOnly={(on) => setSettings(withFreeOnly(settings, on))}
            />
            {messages.length > 0 && !busy && (
              <button type="button" onClick={() => chat.clear()} className="rounded-full px-2 py-1 hover:bg-white/[0.06] hover:text-white/75">
                New chat
              </button>
            )}
            {bits !== null && !busy && <span className="ml-auto tabular-nums">{bits.toLocaleString()} bits left</span>}
            {busy ? (
              <button
                type="button"
                onClick={() => void chat.stop()}
                className="ml-auto flex items-center gap-2 rounded-full bg-white/10 py-1.5 pr-3.5 pl-1.5 text-sm text-white hover:bg-white/15"
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
                className={`flex items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-3.5 text-sm font-medium text-white disabled:opacity-35 ${bits === null ? "ml-auto" : ""}`}
              >
                <Sparkle className="size-3.5" />
                Send
                <span className="grid size-6 place-items-center rounded-full bg-white/15">
                  <ArrowUp className="size-3" />
                </span>
              </button>
            )}
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10.5px] text-white/25">
          Same conversation as Studio. Connect the Bloxy plugin and Bloxy builds straight into your place.
        </p>
      </div>

      {showSettings && <SettingsDialog settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
