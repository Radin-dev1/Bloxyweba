"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";
import { PROVIDERS } from "@/lib/agent/providers";
import { useStudioSession, type StudioStatus } from "./useStudioSession";
import { useSettings, type Settings } from "./useSettings";
import { ArrowUp, ArrowUpRight, BloxyMark, ChevronDown, Download, Settings as Gear, Stop } from "./landing/icons";

type ToolCall = { id: string; name: string; args: unknown; status: "running" | "ok" | "error"; preview?: string };
type Message = { role: "user" | "assistant"; content: string; tools: ToolCall[]; error?: string };

const SUGGESTIONS = [
  { title: "Tour my place", prompt: "Look around my place and tell me what's in it" },
  { title: "Spinning coins", prompt: "Make a spinning coin that gives +1 Coins on touch, with leaderstats" },
  { title: "Quick obby", prompt: "Build a simple obby with 10 platforms and checkpoints" },
  { title: "Fix errors", prompt: "Find and fix the errors in the Output window" },
];

const EASE = "ease-[var(--ease-spring)]";

/** Prompt handed over from the landing page (/studio?prompt=…). */
function initialPrompt() {
  try {
    return new URLSearchParams(window.location.search).get("prompt") ?? "";
  } catch {
    return "";
  }
}

export default function BloxyApp() {
  const { sessionId, status, newPairCode } = useStudioSession();
  const [settings, setSettings] = useSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Drop ?prompt from the URL once it's in the composer.
    if (window.location.search) window.history.replaceState(null, "", "/studio");
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const updateLast = (fn: (m: Message) => Message) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !sessionId) return;
    const history = [...messages, { role: "user" as const, content, tools: [] }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          provider: settings.provider,
          model: settings.models[settings.provider],
          apiKey: settings.apiKeys[settings.provider] || undefined,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        updateLast((m) => ({ ...m, error: data.error ?? `Request failed (${res.status})` }));
        if (res.status === 400 && data.error?.includes("API key")) setShowSettings(true);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as AgentEvent);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") updateLast((m) => ({ ...m, error: String(err) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function applyEvent(e: AgentEvent) {
    switch (e.type) {
      case "text":
        updateLast((m) => ({ ...m, content: m.content + e.delta }));
        break;
      case "tool_call":
        updateLast((m) => ({ ...m, tools: [...m.tools, { id: e.id, name: e.name, args: e.args, status: "running" }] }));
        break;
      case "tool_result":
        updateLast((m) => ({
          ...m,
          tools: m.tools.map((t) => (t.id === e.id ? { ...t, status: e.ok ? "ok" : "error", preview: e.preview } : t)),
        }));
        break;
      case "error":
        updateLast((m) => ({ ...m, error: e.message }));
        break;
    }
  }

  const provider = PROVIDERS[settings.provider];

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-ink text-zinc-100">
      {/* Ambient glow behind the workspace */}
      <div className="pointer-events-none absolute top-[-40%] left-1/2 h-[70vh] w-[90vw] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(47,125,255,0.16),transparent)]" />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-4 pb-3 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BloxyMark className="size-8" />
          <span className="font-display text-lg font-bold tracking-tight">Bloxy</span>
          <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-[0.2em] text-white/40 uppercase sm:inline">
            Studio
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ConnectionPill status={status} />
          <button
            onClick={() => setShowSettings(true)}
            className={`flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pr-2 pl-3.5 text-sm backdrop-blur-xl transition-colors duration-500 ${EASE} hover:bg-white/[0.08]`}
          >
            <span className="text-white/50">{provider.label}</span>
            <span className="hidden max-w-[10rem] truncate font-mono text-xs sm:inline">
              {settings.models[settings.provider]}
            </span>
            <span className="grid size-6 place-items-center rounded-full bg-white/[0.06]">
              <Gear className="size-3.5" />
            </span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-[340px] shrink-0 overflow-y-auto px-4 pb-4 md:block md:pl-6">
          <PairPanel status={status} onNewCode={newPairCode} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:py-10">
              <div className="md:hidden">
                <PairPanel status={status} onNewCode={newPairCode} />
              </div>
              {messages.length === 0 && (
                <div className="pt-6 md:pt-16">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-[0.2em] text-white/55 uppercase">
                    <span className={`size-1.5 rounded-full ${status?.connected ? "bg-signal" : "bg-white/30"}`} />
                    {status?.connected ? "Ready to build" : "Waiting for Studio"}
                  </span>
                  <h1 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.75rem)] leading-[0.95] font-extrabold tracking-[-0.04em] uppercase">
                    What are we
                    <br />
                    <span className="text-blox-soft">building</span> today?
                  </h1>
                  <div className="mt-10 grid gap-3 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.title}
                        onClick={() => send(s.prompt)}
                        className={`group rounded-[1.25rem] border border-white/[0.07] bg-white/[0.02] p-1 text-left transition-colors duration-500 ${EASE} hover:border-white/15`}
                      >
                        <div className="flex h-full items-start justify-between gap-3 rounded-[calc(1.25rem-0.25rem)] bg-panel p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          <div>
                            <p className="font-medium">{s.title}</p>
                            <p className="mt-1 text-sm leading-snug text-white/45">{s.prompt}</p>
                          </div>
                          <ArrowUpRight
                            className={`size-4 shrink-0 text-white/25 transition-transform duration-500 ${EASE} group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/70`}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <MessageView key={i} message={m} streaming={busy && i === messages.length - 1} />
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="px-4 pt-2 pb-4 md:pb-6"
          >
            <div className="mx-auto max-w-3xl rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_30px_80px_-40px_rgba(47,125,255,0.5)]">
              <div className="flex items-end gap-2 rounded-[calc(1.6rem-0.375rem)] bg-[#0b0b0e] p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.07)]">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  autoFocus
                  placeholder={status?.connected ? "Ask Bloxy to build something…" : "Connect Studio first, then ask…"}
                  className="max-h-48 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-white/30"
                />
                {busy ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Stop"
                    className={`grid size-11 place-items-center rounded-full bg-white/10 transition-transform duration-500 ${EASE} hover:bg-white/15 active:scale-95`}
                  >
                    <Stop className="size-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="Send"
                    className={`grid size-11 place-items-center rounded-full bg-blox text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_10px_30px_-10px_rgba(47,125,255,0.9)] transition-all duration-500 ${EASE} hover:-translate-y-0.5 active:scale-95 disabled:translate-y-0 disabled:opacity-30 disabled:shadow-none`}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="mx-auto mt-2 max-w-3xl px-2 text-center text-[11px] text-white/25">
              Changes happen in your open place. Ctrl+Z in Studio undoes any step.
            </p>
          </form>
        </main>
      </div>

      {showSettings && (
        <SettingsDialog settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ConnectionPill({ status }: { status: StudioStatus | null }) {
  const on = !!status?.connected;
  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-xl ${
        on ? "border-signal/20 bg-signal/10 text-signal" : "border-white/10 bg-white/[0.04] text-white/45"
      }`}
    >
      <span className="relative flex size-1.5">
        {on && <span className="animate-pulse-ring absolute inset-0 rounded-full bg-signal" />}
        <span className={`relative size-1.5 rounded-full ${on ? "bg-signal" : "bg-white/35"}`} />
      </span>
      <span className="max-w-[9rem] truncate">
        {on ? status?.studioInfo?.placeName || "Studio connected" : "Studio offline"}
      </span>
    </span>
  );
}

function Bezel({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "live" }) {
  return (
    <div
      className={`rounded-[1.6rem] border p-1.5 ${
        tone === "live" ? "border-signal/20 bg-signal/[0.04]" : "border-white/[0.08] bg-white/[0.025]"
      }`}
    >
      <div className="rounded-[calc(1.6rem-0.375rem)] bg-panel p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        {children}
      </div>
    </div>
  );
}

function PairPanel({ status, onNewCode }: { status: StudioStatus | null; onNewCode: () => void }) {
  if (status?.connected) {
    return (
      <Bezel tone="live">
        <p className="text-[10px] font-medium tracking-[0.2em] text-signal uppercase">Live</p>
        <p className="mt-2 font-display text-xl font-bold tracking-tight">
          {status.studioInfo?.placeName ?? "Your place"}
        </p>
        <p className="mt-1 text-sm text-white/45">is linked to this tab. Bloxy can read and edit it.</p>
        <button onClick={onNewCode} className="mt-4 text-xs text-white/40 underline-offset-4 hover:text-white/80 hover:underline">
          Pair a different Studio
        </button>
        {status.pairCode && <PairCode code={status.pairCode} />}
      </Bezel>
    );
  }
  return (
    <Bezel>
      <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">Connect</p>
      <p className="mt-2 font-display text-xl font-bold tracking-tight">Link Roblox Studio</p>
      <ol className="mt-5 space-y-4 text-sm text-white/55">
        {[
          <>
            Put the plugin in Studio&apos;s Plugins folder (<span className="text-white/75">Plugins → Plugins Folder</span>
            ) and restart Studio.
          </>,
          <>Open the Bloxy button in the Plugins tab. Allow HTTP when Studio asks.</>,
          <>Enter this site&apos;s URL and the code below, then press Connect.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/10 font-mono text-[11px] text-blox-soft">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <a
        href="/api/plugin/download"
        className={`group mt-5 flex items-center justify-between rounded-full border border-white/10 py-1.5 pr-1.5 pl-4 text-sm transition-colors duration-500 ${EASE} hover:bg-white/[0.05]`}
      >
        Download plugin
        <span className={`grid size-7 place-items-center rounded-full bg-white/[0.08] transition-transform duration-500 ${EASE} group-hover:translate-y-0.5`}>
          <Download className="size-3.5" />
        </span>
      </a>
      {status?.pairCode ? (
        <PairCode code={status.pairCode} />
      ) : (
        <button
          onClick={onNewCode}
          className="mt-4 w-full rounded-full bg-blox py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
        >
          Get a pair code
        </button>
      )}
    </Bezel>
  );
}

function PairCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      title="Copy code"
      className="group mt-5 w-full"
    >
      <div className="flex gap-1.5">
        {code.split("").map((c, i) => (
          <span
            key={i}
            className={`grid h-12 flex-1 place-items-center rounded-xl border border-white/10 bg-black/40 font-mono text-xl font-semibold transition-colors duration-500 ${EASE} group-hover:border-blox/50`}
          >
            {c}
          </span>
        ))}
      </div>
      <span className="mt-2 block text-center text-[11px] text-white/35">{copied ? "Copied" : "Click to copy"}</span>
    </button>
  );
}

function MessageView({ message, streaming }: { message: Message; streaming: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[1.4rem] rounded-br-md border border-blox/25 bg-blox/15 px-4 py-2.5 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  const empty = !message.content && message.tools.length === 0 && !message.error;
  return (
    <div className="flex gap-3">
      <BloxyMark className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.tools.map((t) => (
              <ToolChip key={t.id} tool={t} />
            ))}
          </div>
        )}
        {message.content && <RichText text={message.content} />}
        {empty && streaming && (
          <div className="flex items-center gap-1.5 pt-2">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="size-1.5 animate-pulse rounded-full bg-blox-soft"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
        {message.error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
            {message.error}
          </div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_studio_state: "Checked Studio",
  list_children: "Explored",
  search_instances: "Searched",
  get_properties: "Inspected",
  set_properties: "Edited",
  create_instance: "Created",
  clone_instance: "Cloned",
  delete_instance: "Deleted",
  read_script: "Read",
  write_script: "Wrote",
  edit_script: "Edited",
  grep_scripts: "Searched code",
  run_luau: "Ran Luau",
  get_output: "Read Output",
  insert_asset: "Inserted asset",
  set_selection: "Selected",
};

function ToolChip({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const args = tool.args as Record<string, unknown>;
  const target = (args?.path ?? args?.parent ?? args?.pattern ?? args?.root ?? "") as string;
  const tone =
    tool.status === "running"
      ? "border-blox/30 bg-blox/10 text-white"
      : tool.status === "ok"
        ? "border-white/[0.07] bg-white/[0.03] text-white/60"
        : "border-red-400/25 bg-red-500/[0.07] text-red-200";
  return (
    <div className="max-w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-500 ${EASE} ${tone}`}
      >
        {tool.status === "running" ? (
          <span className="relative flex size-1.5">
            <span className="animate-pulse-ring absolute inset-0 rounded-full bg-blox-soft" />
            <span className="relative size-1.5 rounded-full bg-blox-soft" />
          </span>
        ) : (
          <span className={tool.status === "ok" ? "text-signal" : ""}>{tool.status === "ok" ? "✓" : "✗"}</span>
        )}
        <span className="font-medium">{TOOL_LABELS[tool.name] ?? tool.name}</span>
        {target && <span className="truncate font-mono text-white/35">{String(target)}</span>}
        <ChevronDown className={`size-3 shrink-0 opacity-40 transition-transform duration-500 ${EASE} ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-xl border border-white/[0.06] bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-white/50">
          {JSON.stringify(tool.args, null, 2)}
          {tool.preview ? `\n\n→ ${tool.preview}` : ""}
        </pre>
      )}
    </div>
  );
}

/** Minimal markdown: fenced code blocks, inline code and bold. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) {
      out.push(
        <p key={i} className="leading-relaxed whitespace-pre-wrap text-white/85">
          {inline(parts[i])}
        </p>,
      );
    }
    if (parts[i + 2] !== undefined) {
      out.push(
        <pre
          key={i + 2}
          className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/50 p-4 font-mono text-[13px] leading-relaxed text-white/80"
        >
          <code>{parts[i + 2]}</code>
        </pre>,
      );
    }
  }
  return <div className="space-y-3">{out}</div>;
}

function inline(text: string) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((seg, i) => {
    if (seg.startsWith("`") && seg.endsWith("`"))
      return (
        <code key={i} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.88em] text-blox-soft">
          {seg.slice(1, -1)}
        </code>
      );
    if (seg.startsWith("**") && seg.endsWith("**"))
      return (
        <strong key={i} className="font-semibold text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    return seg;
  });
}

function SettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const p = PROVIDERS[draft.provider];
  const field =
    "mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm outline-none transition-colors duration-500 focus:border-blox/60";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.03] p-1.5">
        <div className="rounded-[calc(2rem-0.375rem)] bg-[#0d0d10] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.07)]">
          <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">Settings</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">AI model</h2>

          <div className="mt-6 grid grid-cols-3 gap-1 rounded-full bg-white/[0.04] p-1">
            {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((id) => (
              <button
                key={id}
                onClick={() => setDraft({ ...draft, provider: id })}
                className={`rounded-full py-2 text-sm transition-all duration-500 ${EASE} ${
                  draft.provider === id ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]" : "text-white/45 hover:text-white/80"
                }`}
              >
                {PROVIDERS[id].label}
              </button>
            ))}
            <span className="grid place-items-center rounded-full py-2 text-sm text-white/20" title="Coming soon">
              ChatGPT
            </span>
          </div>

          <label className="mt-6 block text-sm text-white/55">Model</label>
          <input
            list={`models-${draft.provider}`}
            value={draft.models[draft.provider]}
            onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [draft.provider]: e.target.value } })}
            className={field}
          />
          <datalist id={`models-${draft.provider}`}>
            {p.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <label className="mt-5 block text-sm text-white/55">{p.label} API key</label>
          <input
            type="password"
            autoComplete="off"
            placeholder={`${p.keyPrefix}…`}
            value={draft.apiKeys[draft.provider]}
            onChange={(e) => setDraft({ ...draft, apiKeys: { ...draft.apiKeys, [draft.provider]: e.target.value } })}
            className={field}
          />
          <p className="mt-2 text-xs leading-relaxed text-white/35">
            Saved only in this browser. Get one at{" "}
            <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-blox-soft hover:underline">
              {new URL(p.keyUrl).host}
            </a>
            . Leave empty to use the server&apos;s key, if it has one.
          </p>

          <div className="mt-7 flex items-center justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-sm text-white/50 hover:text-white">
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className={`group flex items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-4 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] transition-transform duration-500 ${EASE} active:scale-[0.97]`}
            >
              Save
              <span className={`grid size-7 place-items-center rounded-full bg-white/15 transition-transform duration-500 ${EASE} group-hover:translate-x-0.5`}>
                <ArrowUpRight className="size-3.5" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
