"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildT } from "@/lib/openrouter";
import type { Settings } from "../useSettings";
import { ArrowUp, BloxyMark, Sparkle, Stop } from "../landing/icons";
import type { WorkspaceMesh } from "./blenderMesh";
import { withFreeOnly } from "./freeModels";
import ModelPicker from "./ModelPicker";
import { MessageView } from "./parts";
import type { useChat } from "./useChat";

const ModelPreview = dynamic(() => import("./nodes/ModelPreview"), { ssr: false });
const GlbPreview = dynamic(() => import("./nodes/GlbPreview"), { ssr: false });

type Preview = { kind: "build"; key: string; build: BuildT } | { kind: "mesh"; key: string; mesh: WorkspaceMesh };

const STARTERS = [
  { title: "Build a cozy cottage", text: "Build a cozy cottage with a steep red roof, a chimney and a little garden fence" },
  { title: "Make a lava obby", text: "Make a 10-stage lava obby that gets harder each stage, with checkpoints" },
  { title: "Sculpt a mushroom", text: "Sculpt a cute red mushroom with white spots, about 4 studs tall" },
  { title: "Generate a dragon statue", text: "Generate a detailed 3D model of a stone dragon statue, about 12 studs tall" },
  { title: "Write a save system", text: "Write a DataStore save system for coins and level, with session locking" },
  { title: "Add a shop UI", text: "Add a mobile-friendly shop UI that sells speed coils for 50 coins" },
];

/**
 * The Chat tab: the same conversation as the floating chat bar, full height, with every
 * model Bloxy builds or sculpts shown inline and one click away in the 3D workspace.
 */
export default function ChatView({
  chat,
  settings,
  setSettings,
  bits,
  builds,
  meshIds,
  meshModels,
  studioLabel,
  onShow,
}: {
  chat: ReturnType<typeof useChat>;
  settings: Settings;
  setSettings: (s: Settings) => void;
  bits: number | null;
  /** Builds by the tool call that made them. */
  builds: Record<string, BuildT>;
  /** Mesh names by the tool call that made them. */
  meshIds: Record<string, string>;
  meshModels: WorkspaceMesh[];
  studioLabel: string;
  /** Switch to the 3D workspace and frame this model. */
  onShow: (name: string) => void;
}) {
  const { messages, busy } = chat;
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text = input) => {
    if (!text.trim() || busy) return;
    void chat.send(text);
    setInput("");
  };

  const previews = useMemo(
    () =>
      messages.map((m) =>
        m.tools.flatMap((t): Preview[] => {
          const build = builds[t.id];
          if (build) return [{ kind: "build", key: t.id, build }];
          const mesh = meshIds[t.id] ? meshModels.find((x) => x.name === meshIds[t.id]) : undefined;
          return mesh ? [{ kind: "mesh", key: t.id, mesh }] : [];
        }),
      ),
    [messages, builds, meshIds, meshModels],
  );

  return (
    <div className="flex h-full flex-col bg-[#0b0c10] pt-20 text-zinc-100">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[50dvh] flex-col items-center justify-center text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-blox/15">
                <BloxyMark className="size-9" />
              </span>
              <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">What are we building?</h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/45">
                Same chat as the 3D workspace. Ask for a model, a map, a system or a fix. {studioLabel}
              </p>
              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  {previews[i]?.map((p) => {
                    const name = p.kind === "build" ? p.build.name : p.mesh.name;
                    return (
                      <div key={p.key} className="mt-3 ml-10 overflow-hidden rounded-2xl border border-white/10 bg-[#dfe9f8]">
                        <div className="h-72">{p.kind === "build" ? <ModelPreview build={p.build} /> : <GlbPreview url={p.mesh.url} />}</div>
                        <div className="flex items-center justify-between gap-3 bg-[#111318] px-3 py-2 text-xs text-white/60">
                          <span className="truncate">
                            {name} · {p.kind === "build" ? `${p.build.parts.length} parts` : `3D mesh${p.mesh.tris ? ` · ${p.mesh.tris.toLocaleString()} triangles` : ""}`}
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            {p.kind === "mesh" && (
                              <a href={p.mesh.url} download={`${name}.glb`} title="In Roblox Studio: File > Import 3D" className="hover:text-white">
                                Download .glb
                              </a>
                            )}
                            <button type="button" onClick={() => onShow(name)} className="text-blox-soft hover:underline">
                              Show in workspace
                            </button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
              value={settings.models[settings.provider]}
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
      </div>
    </div>
  );
}
