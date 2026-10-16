"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";
import type { BuildT } from "@/lib/openrouter";
import type { Settings } from "../useSettings";

export type ToolCall = { id: string; name: string; args: unknown; status: "running" | "ok" | "error"; preview?: string };
export type Message = { role: "user" | "assistant"; content: string; tools: ToolCall[]; error?: string; jobId?: string };

export type TurnResult = { ok: boolean; text: string; tools: number; mutated: boolean; error?: string };
type ActiveJob = { jobId: string; nextSeq: number; status: string };

/** Tools that change the place; after any of these the 3D view should refresh. */
export const MUTATING_TOOLS = new Set([
  "set_properties",
  "create_instance",
  "clone_instance",
  "delete_instance",
  "write_script",
  "edit_script",
  "run_luau",
  "insert_asset",
]);

// The conversation is kept in this browser, so leaving the page, switching tabs or reloading
// never loses it. Big tool payloads are trimmed before saving.
const HISTORY_KEY = "bloxy.chat.v1";
const MAX_SAVED_MESSAGES = 80;

/** Readable error text for the chat ("Stopped." when the user pressed Stop). */
function describe(err: unknown) {
  if ((err as Error)?.name === "AbortError") return "Stopped.";
  if (err instanceof TypeError) return "Couldn't reach Bloxy. Check your connection and try again.";
  return err instanceof Error ? err.message : String(err);
}

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const saved = raw ? (JSON.parse(raw) as Message[]) : [];
    return Array.isArray(saved) ? saved.filter((m) => m && (m.role === "user" || m.role === "assistant")) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    const slim = messages.slice(-MAX_SAVED_MESSAGES).map((m) => ({
      ...m,
      tools: m.tools.map((t) => ({
        ...t,
        args: JSON.stringify(t.args ?? null).length > 1500 ? { note: "(large input not saved)" } : t.args,
        preview: t.preview?.slice(0, 400),
      })),
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
  } catch {}
}

/**
 * One conversation with the agent. `send` resolves when the turn ends, so the
 * node editor can run steps one after another through the same history.
 */
export function useChat({
  sessionId,
  settings,
  onTurnEnd,
  onNeedsKey,
  onBuild,
}: {
  sessionId: string | null;
  settings: Settings;
  onTurnEnd?: (r: TurnResult) => void;
  onNeedsKey?: () => void;
  /** A model the agent built while Studio was offline: place it in the 3D workspace. */
  onBuild?: (build: BuildT) => void;
}) {
  // The app renders client-side only, so reading storage on first render is safe.
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  const onBuildRef = useRef(onBuild);
  useEffect(() => {
    onBuildRef.current = onBuild;
  }, [onBuild]);
  const busyRef = useRef(false);
  const jobRef = useRef<ActiveJob | null>(null);
  const messagesByJob = useRef(new Map<string, number>());
  const streamAbort = useRef<AbortController | null>(null);

  const commit = useCallback((next: Message[]) => {
    messagesRef.current = next;
    setMessages(next);
    saveHistory(next);
  }, []);

  const updateAt = useCallback((index: number, fn: (message: Message) => Message) => {
    const current = messagesRef.current;
    if (!current[index]) return;
    const next = [...current];
    next[index] = fn(next[index]);
    commit(next);
  }, [commit]);

  const updateJob = useCallback((job: ActiveJob | null) => {
    jobRef.current = job;
    setActiveJob(job);
  }, []);

  const applyEvent = useCallback((jobId: string, event: AgentEvent) => {
    if (event.type === "user") {
      if (messagesByJob.current.has(jobId)) return;
      commit([...messagesRef.current, { role: "user", content: event.content, tools: [] }, { role: "assistant", content: "", tools: [], jobId }]);
      messagesByJob.current.set(jobId, messagesRef.current.length - 1);
      return;
    }
    if (event.type === "build") {
      onBuildRef.current?.(event.build);
      return;
    }
    const index = messagesByJob.current.get(jobId);
    if (index === undefined) return;
    updateAt(index, (message) => {
      switch (event.type) {
        case "text": return { ...message, content: message.content + event.delta };
        case "tool_call": return { ...message, tools: [...message.tools, { id: event.id, name: event.name, args: event.args, status: "running" }] };
        case "tool_result": return { ...message, tools: message.tools.map((tool) => tool.id === event.id ? { ...tool, status: event.ok ? "ok" : "error", preview: event.preview } : tool) };
        case "error": return { ...message, error: event.message };
        case "done": return message;
        default: return message;
      }
    });
  }, [commit, updateAt]);

  const pollJob = useCallback(async (job: ActiveJob, signal?: AbortSignal) => {
    let current = job;
    while (!signal?.aborted) {
      let response: Response;
      try {
        response = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId ?? "")}&jobId=${encodeURIComponent(current.jobId)}&afterSeq=${current.nextSeq}`, { cache: "no-store" });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      if (response.status === 404) throw new Error("This reply was interrupted (the server restarted). Send your message again.");
      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      const result = await response.json() as { status: string; events: { seq: number; event: AgentEvent }[]; nextSeq: number };
      for (const entry of result.events) applyEvent(current.jobId, entry.event);
      current = { ...current, nextSeq: Math.max(current.nextSeq, result.nextSeq), status: result.status };
      updateJob(["completed", "stopped", "error"].includes(result.status) ? null : current);
      if (["completed", "stopped", "error"].includes(result.status)) {
        const index = messagesByJob.current.get(current.jobId);
        if (result.status === "stopped" && index !== undefined) {
          updateAt(index, (message) => ({ ...message, error: message.error ?? "Stopped." }));
        }
        messagesByJob.current.delete(current.jobId);
        return result.status;
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    return "stopped";
  }, [sessionId, applyEvent, updateJob, updateAt]);

  const send = useCallback(
    async (text: string): Promise<TurnResult> => {
      const content = text.trim();
      if (!content) return { ok: false, text: "", tools: 0, mutated: false, error: "Empty message" };
      if (busyRef.current) return { ok: false, text: "", tools: 0, mutated: false, error: "Bloxy is busy" };
      // No session (e.g. no Redis on Vercel) is fine: the server streams the reply back directly.

      const history = [...messagesRef.current, { role: "user" as const, content, tools: [] }];
      const jobId = crypto.randomUUID();
      busyRef.current = true;
      setBusy(true);

      const finish = (): TurnResult => {
        const last = messagesRef.current[messagesRef.current.length - 1];
        const result: TurnResult = {
          ok: !last.error,
          text: last.content,
          tools: last.tools.length,
          mutated: last.tools.some((t) => t.status === "ok" && MUTATING_TOOLS.has(t.name)),
          error: last.error,
        };
        onTurnEnd?.(result);
        return result;
      };

      updateJob({ jobId, nextSeq: -1, status: "starting" });
      try {
        streamAbort.current = new AbortController();
        const res = await fetch("/api/chat", {
          method: "POST",
          signal: streamAbort.current.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            jobId,
            provider: settings.provider,
            model: settings.models[settings.provider],
            // Bloxy uses the user's own OpenRouter key if they set one, otherwise bits.
            apiKey:
              (settings.provider === "openrouter" ? settings.openrouterKey : settings.apiKeys[settings.provider]) ||
              undefined,
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          commit([...messagesRef.current, { role: "user", content, tools: [] }, { role: "assistant", content: "", tools: [], error: data.error ?? `Request failed (${res.status})` }]);
          messagesByJob.current.delete(jobId);
          updateJob(null);
          if (res.status === 400 && data.error?.includes("API key")) onNeedsKey?.();
          return finish();
        }
        if (res.headers.get("content-type")?.includes("ndjson")) {
          // Direct stream (no background job store): read events as they arrive.
          commit([...messagesRef.current, { role: "user", content, tools: [] }, { role: "assistant", content: "", tools: [] }]);
          messagesByJob.current.set(jobId, messagesRef.current.length - 1);
          updateJob(null);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                applyEvent(jobId, JSON.parse(line) as AgentEvent);
              } catch {}
            }
          }
          messagesByJob.current.delete(jobId);
          return finish();
        }
        const created = await res.json() as { jobId: string };
      const job = { jobId: created.jobId, nextSeq: -1, status: "running" };
      commit([...messagesRef.current, { role: "user", content, tools: [] }, { role: "assistant", content: "", tools: [], jobId: created.jobId }]);
      messagesByJob.current.set(created.jobId, messagesRef.current.length - 1);
      updateJob(job);
        await pollJob(job);
      } catch (err) {
        if (messagesByJob.current.has(jobId)) {
          const index = messagesByJob.current.get(jobId)!;
          updateAt(index, (message) => ({ ...message, error: describe(err) }));
        } else {
          commit([...messagesRef.current, { role: "user", content, tools: [] }, { role: "assistant", content: "", tools: [], error: describe(err) }]);
        }
        updateJob(null);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return finish();
    },
    [sessionId, settings, commit, pollJob, updateJob, updateAt, applyEvent, onTurnEnd, onNeedsKey],
  );

  const stop = useCallback(async () => {
    streamAbort.current?.abort();
    const job = jobRef.current;
    if (!job || !sessionId) return;
    await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}&jobId=${encodeURIComponent(job.jobId)}`, { method: "DELETE" });
  }, [sessionId]);
  const clear = useCallback(() => {
    if (jobRef.current) return;
    messagesByJob.current.clear();
    commit([]);
  }, [commit]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    try {
      const saved = localStorage.getItem(`bloxy.activeChat.${sessionId}`);
      if (!saved) return;
      const savedJob = JSON.parse(saved) as ActiveJob;
      // Replay the job's event log from the start into its saved message (or a new one).
      const job = { ...savedJob, nextSeq: -1 };
      const resume = setTimeout(() => {
        if (!active) return;
        const index = messagesRef.current.findIndex((m) => m.role === "assistant" && m.jobId === job.jobId);
        if (index !== -1) {
          messagesByJob.current.set(job.jobId, index);
          updateAt(index, (m) => ({ ...m, content: "", tools: [], error: undefined }));
        }
        updateJob(job);
        busyRef.current = true;
        setBusy(true);
        void pollJob(job).finally(() => { if (active) { busyRef.current = false; setBusy(false); } });
      }, 0);
      return () => { active = false; clearTimeout(resume); };
    } catch {}
    return () => { active = false; };
  }, [sessionId, pollJob, updateJob, updateAt]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      if (activeJob) localStorage.setItem(`bloxy.activeChat.${sessionId}`, JSON.stringify(activeJob));
      else localStorage.removeItem(`bloxy.activeChat.${sessionId}`);
    } catch {}
  }, [sessionId, activeJob]);

  return { messages, busy, send, stop, clear, activeJob };
}
