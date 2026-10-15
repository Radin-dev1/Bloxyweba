"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";
import { PROVIDERS } from "@/lib/agent/providers";
import { useStudioSession, type StudioStatus } from "./useStudioSession";
import { useSettings, type Settings } from "./useSettings";

type ToolCall = { id: string; name: string; args: unknown; status: "running" | "ok" | "error"; preview?: string };
type Message = { role: "user" | "assistant"; content: string; tools: ToolCall[]; error?: string };

const SUGGESTIONS = [
  "Look around my place and tell me what's in it",
  "Make a spinning coin that gives +1 Coins on touch, with leaderstats",
  "Build a simple obby with 10 platforms and checkpoints",
  "Find and fix errors in the Output window",
];

export default function BloxyApp() {
  const { sessionId, status, newPairCode } = useStudioSession();
  const [settings, setSettings] = useSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
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
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-indigo-500 font-black text-white">B</div>
          <span className="text-lg font-semibold tracking-tight">Bloxy</span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionPill status={status} />
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            {provider.label} · {settings.models[settings.provider]}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-zinc-800 p-4 md:block">
          <PairPanel status={status} onNewCode={newPairCode} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              <div className="md:hidden">
                <PairPanel status={status} onNewCode={newPairCode} />
              </div>
              {messages.length === 0 && (
                <div className="pt-10 text-center">
                  <h1 className="text-3xl font-bold tracking-tight">What are we building?</h1>
                  <p className="mt-2 text-zinc-400">
                    Bloxy reads and edits your open Roblox Studio place for you.
                  </p>
                  <div className="mt-8 grid gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left text-sm text-zinc-300 hover:border-zinc-600"
                      >
                        {s}
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
            className="border-t border-zinc-800 p-4"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-indigo-500">
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
                placeholder={status?.connected ? "Ask Bloxy to build something…" : "Connect Studio first, then ask…"}
                className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-zinc-500"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-xl bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </div>
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
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        on ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
      }`}
    >
      <span className={`size-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-500"}`} />
      {on ? status?.studioInfo?.placeName || "Studio connected" : "Studio offline"}
    </span>
  );
}

function PairPanel({ status, onNewCode }: { status: StudioStatus | null; onNewCode: () => void }) {
  if (status?.connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="font-medium text-emerald-300">Studio connected</p>
        <p className="mt-1 text-sm text-zinc-400">{status.studioInfo?.placeName ?? "Your place"} is linked to this tab.</p>
        <button onClick={onNewCode} className="mt-3 text-xs text-zinc-500 underline hover:text-zinc-300">
          Pair a different Studio
        </button>
        {status.pairCode && <PairCode code={status.pairCode} />}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="font-medium">Connect Roblox Studio</p>
      <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-zinc-400">
        <li>
          <a href="/api/plugin/download" className="text-indigo-400 underline">
            Download the plugin
          </a>{" "}
          and put it in Studio&apos;s Plugins folder (Plugins tab → Plugins Folder), then restart Studio.
        </li>
        <li>Click the Bloxy button in the Plugins tab and allow HTTP access when Studio asks.</li>
        <li>Enter this website&apos;s URL and the code below.</li>
      </ol>
      {status?.pairCode ? (
        <PairCode code={status.pairCode} />
      ) : (
        <button onClick={onNewCode} className="mt-4 w-full rounded-lg bg-indigo-500 py-2 text-sm font-medium text-white">
          Get a pair code
        </button>
      )}
    </div>
  );
}

function PairCode({ code }: { code: string }) {
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(code)}
      title="Copy"
      className="mt-4 w-full rounded-lg border border-dashed border-zinc-600 py-3 font-mono text-2xl font-bold tracking-[0.3em] hover:border-indigo-400"
    >
      {code}
    </button>
  );
}

function MessageView({ message, streaming }: { message: Message; streaming: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-indigo-500/20 px-4 py-2.5">{message.content}</div>
      </div>
    );
  }
  const empty = !message.content && message.tools.length === 0 && !message.error;
  return (
    <div className="space-y-3">
      {message.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.tools.map((t) => (
            <ToolChip key={t.id} tool={t} />
          ))}
        </div>
      )}
      {message.content && <RichText text={message.content} />}
      {empty && streaming && <div className="h-5 w-16 animate-pulse rounded bg-zinc-800" />}
      {message.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {message.error}
        </div>
      )}
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
  const color =
    tool.status === "running"
      ? "border-zinc-700 text-zinc-300"
      : tool.status === "ok"
        ? "border-zinc-800 text-zinc-400"
        : "border-red-500/40 text-red-300";
  return (
    <div className="max-w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex max-w-full items-center gap-1.5 rounded-md border bg-zinc-900 px-2 py-1 text-xs ${color}`}
      >
        {tool.status === "running" ? (
          <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />
        ) : (
          <span>{tool.status === "ok" ? "✓" : "✗"}</span>
        )}
        <span className="font-medium">{TOOL_LABELS[tool.name] ?? tool.name}</span>
        {target && <span className="truncate font-mono text-zinc-500">{String(target)}</span>}
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-zinc-900 p-2 text-xs text-zinc-400">
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
        <p key={i} className="whitespace-pre-wrap leading-relaxed text-zinc-200">
          {inline(parts[i])}
        </p>,
      );
    }
    if (parts[i + 2] !== undefined) {
      out.push(
        <pre key={i + 2} className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
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
        <code key={i} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.9em] text-indigo-200">
          {seg.slice(1, -1)}
        </code>
      );
    if (seg.startsWith("**") && seg.endsWith("**")) return <strong key={i}>{seg.slice(2, -2)}</strong>;
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">AI settings</h2>

        <label className="mt-4 block text-sm text-zinc-400">Provider</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((id) => (
            <button
              key={id}
              onClick={() => setDraft({ ...draft, provider: id })}
              className={`rounded-lg border py-2 text-sm ${
                draft.provider === id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-700 hover:bg-zinc-900"
              }`}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm text-zinc-400">Model</label>
        <input
          list={`models-${draft.provider}`}
          value={draft.models[draft.provider]}
          onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [draft.provider]: e.target.value } })}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
        />
        <datalist id={`models-${draft.provider}`}>
          {p.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="mt-4 block text-sm text-zinc-400">{p.label} API key</label>
        <input
          type="password"
          autoComplete="off"
          placeholder={`${p.keyPrefix}…`}
          value={draft.apiKeys[draft.provider]}
          onChange={(e) => setDraft({ ...draft, apiKeys: { ...draft.apiKeys, [draft.provider]: e.target.value } })}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Stored only in this browser and sent with each request. Get one at{" "}
          <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
            {new URL(p.keyUrl).host}
          </a>
          . Leave empty to use the server&apos;s key if it has one.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
