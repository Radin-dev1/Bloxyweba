"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";
import type { Settings } from "../useSettings";

export type ToolCall = { id: string; name: string; args: unknown; status: "running" | "ok" | "error"; preview?: string };
export type Message = { role: "user" | "assistant"; content: string; tools: ToolCall[]; error?: string };

export type TurnResult = { ok: boolean; text: string; tools: number; mutated: boolean; error?: string };

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

/**
 * One conversation with the agent. `send` resolves when the turn ends, so the
 * node editor can run steps one after another through the same history.
 */
export function useChat({
  sessionId,
  settings,
  onTurnEnd,
  onNeedsKey,
}: {
  sessionId: string | null;
  settings: Settings;
  onTurnEnd?: (r: TurnResult) => void;
  onNeedsKey?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: Message[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const updateLast = useCallback(
    (fn: (m: Message) => Message) => {
      const ms = messagesRef.current;
      commit([...ms.slice(0, -1), fn(ms[ms.length - 1])]);
    },
    [commit],
  );

  const send = useCallback(
    async (text: string): Promise<TurnResult> => {
      const content = text.trim();
      if (!content) return { ok: false, text: "", tools: 0, mutated: false, error: "Empty message" };
      if (busyRef.current) return { ok: false, text: "", tools: 0, mutated: false, error: "Bloxy is busy" };
      if (!sessionId) return { ok: false, text: "", tools: 0, mutated: false, error: "No session yet" };

      const history = [...messagesRef.current, { role: "user" as const, content, tools: [] }];
      commit([...history, { role: "assistant", content: "", tools: [] }]);
      busyRef.current = true;
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

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

      const apply = (e: AgentEvent) => {
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
              tools: m.tools.map((t) =>
                t.id === e.id ? { ...t, status: e.ok ? "ok" : "error", preview: e.preview } : t,
              ),
            }));
            break;
          case "error":
            updateLast((m) => ({ ...m, error: e.message }));
            break;
        }
      };

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
          if (res.status === 400 && data.error?.includes("API key")) onNeedsKey?.();
          return finish();
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) apply(JSON.parse(line) as AgentEvent);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") updateLast((m) => ({ ...m, error: m.error ?? "Stopped." }));
        else updateLast((m) => ({ ...m, error: String(err) }));
      } finally {
        busyRef.current = false;
        setBusy(false);
        abortRef.current = null;
      }
      return finish();
    },
    [sessionId, settings, commit, updateLast, onTurnEnd, onNeedsKey],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => commit([]), [commit]);

  return { messages, busy, send, stop, clear };
}
