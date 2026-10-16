"use client";

import { useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import type { StudioStatus } from "../useStudioSession";
import type { Settings } from "../useSettings";
import type { Message, ToolCall } from "./useChat";
import {
  ArrowUpRight,
  BloxyMark,
  ChevronDown,
  Download,
} from "../landing/icons";
import FreeToggle from "./FreeToggle";
import { withFreeOnly } from "./freeModels";
import ModelBrowser from "./ModelBrowser";
import ProviderLogo from "./ProviderLogo";

const EASE = "ease-[var(--ease-spring)]";

export function ConnectionPill({ status }: { status: StudioStatus | null }) {
  const on = !!status?.connected;
  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-xl ${
        on
          ? "border-signal/20 bg-signal/10 text-signal"
          : "border-white/10 bg-white/[0.04] text-white/45"
      }`}
    >
      <span className="relative flex size-1.5">
        {on && (
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-signal" />
        )}
        <span
          className={`relative size-1.5 rounded-full ${on ? "bg-signal" : "bg-white/35"}`}
        />
      </span>
      <span className="max-w-[9rem] truncate">
        {on
          ? status?.studioInfo?.placeName || "Studio connected"
          : "Studio offline"}
      </span>
    </span>
  );
}

export function Bezel({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "live";
}) {
  return (
    <div
      className={`rounded-[1.6rem] border p-1.5 ${
        tone === "live"
          ? "border-signal/20 bg-signal/[0.04]"
          : "border-white/[0.08] bg-white/[0.025]"
      }`}
    >
      <div className="rounded-[calc(1.6rem-0.375rem)] bg-panel p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        {children}
      </div>
    </div>
  );
}

export function PairPanel({
  status,
  onNewCode,
  error,
}: {
  status: StudioStatus | null;
  onNewCode: () => void;
  error?: string | null;
}) {
  if (status?.connected) {
    return (
      <Bezel tone="live">
        <p className="text-[10px] font-medium tracking-[0.2em] text-signal uppercase">
          Live
        </p>
        <p className="mt-2 font-display text-xl font-bold tracking-tight">
          {status.studioInfo?.placeName ?? "Your place"}
        </p>
        <p className="mt-1 text-sm text-white/45">
          is linked to this tab. Bloxy can read and edit it.
        </p>
        <button
          onClick={onNewCode}
          className="mt-4 text-xs text-white/40 underline-offset-4 hover:text-white/80 hover:underline"
        >
          Pair a different Studio
        </button>
        {status.pairCode && <PairCode code={status.pairCode} />}
      </Bezel>
    );
  }
  return (
    <Bezel>
      <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">
        Connect
      </p>
      <p className="mt-2 font-display text-xl font-bold tracking-tight">
        Link Roblox Studio
      </p>
      <ol className="mt-5 space-y-4 text-sm text-white/55">
        {[
          <>
            Put the plugin in Studio&apos;s Plugins folder (
            <span className="text-white/75">Plugins → Plugins Folder</span>) and
            restart Studio.
          </>,
          <>
            Open the Bloxy button in the Plugins tab. Allow HTTP when Studio
            asks.
          </>,
          <>
            Enter this site&apos;s URL and the code below, then press Connect.
          </>,
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
        <span
          className={`grid size-7 place-items-center rounded-full bg-white/[0.08] transition-transform duration-500 ${EASE} group-hover:translate-y-0.5`}
        >
          <Download className="size-3.5" />
        </span>
      </a>
      {error ? (
        <p className="mt-5 rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-200">
          {error}
        </p>
      ) : status?.pairCode ? (
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

export function PairCode({ code }: { code: string }) {
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
      <span className="mt-2 block text-center text-[11px] text-white/35">
        {copied ? "Copied" : "Click to copy"}
      </span>
    </button>
  );
}

export function MessageView({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[1.4rem] rounded-br-md border border-blox/25 bg-blox/15 px-4 py-2.5 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  const empty =
    !message.content && message.tools.length === 0 && !message.error;
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
  build_model: "Built",
  sculpt_model: "Sculpted",
};

/** What a running tool is doing, in words (Blender can take a few seconds). */
const RUNNING_LABELS: Record<string, string> = {
  build_model: "Building",
  sculpt_model: "Sculpting in Blender",
};

export function ToolChip({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const args = tool.args as Record<string, unknown>;
  const target = (args?.path ??
    args?.parent ??
    args?.pattern ??
    args?.root ??
    args?.name ??
    "") as string;
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
          <span className={tool.status === "ok" ? "text-signal" : ""}>
            {tool.status === "ok" ? "✓" : "✗"}
          </span>
        )}
        <span className="font-medium">
          {(tool.status === "running" && RUNNING_LABELS[tool.name]) || TOOL_LABELS[tool.name] || tool.name}
        </span>
        {target && (
          <span className="truncate font-mono text-white/35">
            {String(target)}
          </span>
        )}
        <ChevronDown
          className={`size-3 shrink-0 opacity-40 transition-transform duration-500 ${EASE} ${open ? "rotate-180" : ""}`}
        />
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
export function RichText({ text }: { text: string }) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) {
      out.push(
        <p
          key={i}
          className="leading-relaxed whitespace-pre-wrap text-white/85"
        >
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
        <code
          key={i}
          className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.88em] text-blox-soft"
        >
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

export function SettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [browsing, setBrowsing] = useState(false);
  // Own keys are tucked away; open the section only when they're already in use.
  const [advanced, setAdvanced] = useState(settings.provider !== "openrouter");
  const p = PROVIDERS[draft.provider];
  const ownKeyCount = [
    draft.openrouterKey,
    draft.apiKeys.claude,
    draft.apiKeys.gemini,
  ].filter(Boolean).length;
  const field =
    "mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm outline-none transition-colors duration-500 focus:border-blox/60";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/10 bg-white/[0.03] p-1.5 [scrollbar-width:none]"
      >
        <div className="rounded-[calc(2rem-0.375rem)] bg-[#0d0d10] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.07)]">
          <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">
            Settings
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            AI model
          </h2>

          {/* The model Bloxy chats with: one card, changed in the model browser. */}
          <button
            type="button"
            onClick={() =>
              draft.provider === "openrouter"
                ? setBrowsing(true)
                : setAdvanced(true)
            }
            className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <ProviderLogo
              model={draft.models[draft.provider]}
              className="size-10"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {draft.models[draft.provider]}
              </span>
              <span className="block text-xs text-white/45">
                {draft.provider === "openrouter"
                  ? "Runs on Bloxy"
                  : `Direct with your ${p.label} key`}
              </span>
            </span>
            <span className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-xs text-white/75">
              Change
            </span>
          </button>

          <div className="mt-3 rounded-xl border border-white/[0.07] px-2 py-2">
            <FreeToggle on={draft.freeOnly} onChange={(on) => setDraft(withFreeOnly(draft, on))} />
            <p className="mt-1 px-1 text-xs leading-relaxed text-white/40">
              Only OpenRouter&apos;s free models. They cost no bits, but they&apos;re slower and rate-limited.
            </p>
          </div>

          <p className="mt-4 rounded-xl border border-blox/20 bg-blox/[0.07] px-3.5 py-3 text-xs leading-relaxed text-white/60">
            <span className="font-medium text-white/85">
              Bloxy runs on bits.
            </span>{" "}
            Sign in with Roblox to get free bits every day. Each message and
            generation costs what the model really costs.
          </p>

          {/* Own API keys: hidden unless asked for. */}
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <button
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced((a) => !a)}
              className="flex w-full items-center justify-between text-left text-sm text-white/60 hover:text-white"
            >
              <span>
                Use your own API keys
                {ownKeyCount > 0 && (
                  <span className="ml-2 rounded-md bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal">
                    {ownKeyCount} set
                  </span>
                )}
              </span>
              <ChevronDown
                className={`size-4 transition-transform duration-300 ${advanced ? "rotate-180" : ""}`}
              />
            </button>

            {advanced && (
              <div className="mt-4">
                <p className="text-xs leading-relaxed text-white/40">
                  Optional. Keys are saved only in this browser and used instead
                  of your bits.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/[0.04] p-1">
                  {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map(
                    (id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDraft({ ...draft, provider: id })}
                        className={`rounded-full py-2 text-sm transition-all duration-500 ${EASE} ${
                          draft.provider === id
                            ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
                            : "text-white/45 hover:text-white/80"
                        }`}
                      >
                        {PROVIDERS[id].label}
                      </button>
                    ),
                  )}
                </div>

                {draft.provider !== "openrouter" && (
                  <>
                    <label className="mt-4 block text-sm text-white/55">
                      Model
                    </label>
                    <input
                      list={`models-${draft.provider}`}
                      value={draft.models[draft.provider]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          models: {
                            ...draft.models,
                            [draft.provider]: e.target.value,
                          },
                        })
                      }
                      className={field}
                    />
                    <datalist id={`models-${draft.provider}`}>
                      {p.models.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <label className="mt-4 block text-sm text-white/55">
                      {p.label} API key
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={`${p.keyPrefix}…`}
                      value={draft.apiKeys[draft.provider]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          apiKeys: {
                            ...draft.apiKeys,
                            [draft.provider]: e.target.value,
                          },
                        })
                      }
                      className={field}
                    />
                    <p className="mt-2 text-xs leading-relaxed text-white/35">
                      Get one at{" "}
                      <a
                        href={p.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blox-soft hover:underline"
                      >
                        {new URL(p.keyUrl).host}
                      </a>
                      . Leave empty to use the server&apos;s key, if it has one.
                    </p>
                  </>
                )}

                <label className="mt-4 block text-sm text-white/55">
                  OpenRouter API key
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-or-…"
                  value={draft.openrouterKey}
                  onChange={(e) =>
                    setDraft({ ...draft, openrouterKey: e.target.value })
                  }
                  className={field}
                />
                <p className="mt-2 text-xs leading-relaxed text-white/35">
                  Used for Bloxy chat, Idea Forge and the Nodes tab instead of
                  bits. Get one at{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blox-soft hover:underline"
                  >
                    openrouter.ai
                  </a>
                  .
                </p>
              </div>
            )}
          </div>

          <div className="mt-7 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm text-white/50 hover:text-white"
            >
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
              <span
                className={`grid size-7 place-items-center rounded-full bg-white/15 transition-transform duration-500 ${EASE} group-hover:translate-x-0.5`}
              >
                <ArrowUpRight className="size-3.5" />
              </span>
            </button>
          </div>
        </div>
      </div>
      {/* Portaled, but React events still bubble here: keep them from closing Settings. */}
      {browsing && (
        <div onClick={(e) => e.stopPropagation()}>
          <ModelBrowser
            value={draft.models.openrouter}
            freeOnly={draft.freeOnly}
            onFreeOnly={(on) => setDraft(withFreeOnly(draft, on))}
            onPick={(id) =>
              setDraft({
                ...draft,
                provider: "openrouter",
                models: { ...draft.models, openrouter: id },
              })
            }
            onClose={() => setBrowsing(false)}
          />
        </div>
      )}
    </div>
  );
}
