"use client";

import { useEffect, useRef } from "react";

/**
 * Messages typed in the Bloxy plugin's chat inside Roblox Studio reach this tab, which runs
 * them like any chat message (the user's model, key or bits). One at a time, in order.
 */
export function usePluginInbox(sessionId: string | null, pluginConnected: boolean, send: (text: string) => Promise<unknown>) {
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!sessionId || !pluginConnected) return;
    let alive = true;
    let running = false;
    const queue: string[] = [];
    const drain = async () => {
      if (running) return;
      running = true;
      while (alive && queue.length) await sendRef.current(queue.shift()!).catch(() => undefined);
      running = false;
    };
    const tick = async () => {
      const res = await fetch(`/api/session/inbox?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { messages?: string[] } | null;
      if (!alive || !data?.messages?.length) return;
      queue.push(...data.messages);
      void drain();
    };
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId, pluginConnected]);
}
