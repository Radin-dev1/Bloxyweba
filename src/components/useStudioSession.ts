"use client";

import { useCallback, useEffect, useState } from "react";

export type StudioStatus = {
  connected: boolean;
  pairCode: string | null;
  pairCodeExpires: number | null;
  studioInfo: { placeName?: string; placeId?: number } | null;
};

const SESSION_KEY = "bloxy.sessionId";

function readStored() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function store(id: string) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {}
}

/** Owns this browser's bridge session and polls whether Studio is connected. */
export function useStudioSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<StudioStatus | null>(null);

  const createSession = useCallback(async (refreshFor?: string) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshFor ? { sessionId: refreshFor, refresh: true } : {}),
    });
    const data = (await res.json()) as { sessionId: string; pairCode: string; pairCodeExpires: number };
    store(data.sessionId);
    setSessionId(data.sessionId);
    setStatus((s) => ({
      connected: refreshFor ? (s?.connected ?? false) : false,
      studioInfo: refreshFor ? (s?.studioInfo ?? null) : null,
      pairCode: data.pairCode,
      pairCodeExpires: data.pairCodeExpires,
    }));
  }, []);

  // Restore the saved session, or create one if the server doesn't know it.
  useEffect(() => {
    const init = async () => {
      const existing = readStored();
      if (existing) {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(existing)}`).catch(() => null);
        if (res?.ok) {
          const data = (await res.json()) as StudioStatus;
          setSessionId(existing);
          setStatus(data);
          return;
        }
      }
      await createSession();
    };
    void init();
  }, [createSession]);

  // Poll connection status.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        if (res.status === 404) {
          // Server restarted and forgot us: start over.
          await createSession();
          return;
        }
        setStatus((await res.json()) as StudioStatus);
      } catch {}
    };
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, createSession]);

  const newPairCode = useCallback(() => {
    if (sessionId) void createSession(sessionId);
  }, [sessionId, createSession]);

  return { sessionId, status, newPairCode };
}
