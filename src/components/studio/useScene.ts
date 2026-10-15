"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScenePart = {
  path: string;
  shape: string;
  size: [number, number, number];
  /** x, y, z, then the 3x3 rotation matrix row by row (Roblox CFrame:GetComponents). */
  cframe: number[];
  color: string;
  transparency: number;
  material: string;
};

export type Scene = {
  parts: ScenePart[];
  truncated: boolean;
  camera?: { position: [number, number, number]; target: [number, number, number] };
  fetchedAt: number;
};

type RawScene = {
  parts: [string, string, [number, number, number], number[], string, number, string][];
  truncated: boolean;
  camera?: Scene["camera"];
};

/** Fetches the place's parts from Studio for the 3D workspace. */
export function useScene(sessionId: string | null, connected: boolean) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!sessionId || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, tool: "get_scene", args: {} }),
      });
      const data = (await res.json()) as { result?: RawScene; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? `Scene request failed (${res.status})`);
      const raw = data.result;
      setScene({
        parts: (raw.parts ?? []).map(([path, shape, size, cframe, color, transparency, material]) => ({
          path,
          shape,
          size,
          cframe,
          color,
          transparency,
          material,
        })),
        truncated: raw.truncated,
        camera: raw.camera,
        fetchedAt: Date.now(),
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  // Load once Studio connects.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      wasConnected.current = true;
      const t = setTimeout(() => void refresh(), 0);
      return () => clearTimeout(t);
    }
    if (!connected) wasConnected.current = false;
  }, [connected, refresh]);

  const select = useCallback(
    async (path: string | null) => {
      if (!sessionId) return;
      await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, tool: "set_selection", args: { paths: path ? [path] : [] } }),
      }).catch(() => {});
    },
    [sessionId],
  );

  /** Optimistically replace one part (after a local edit), before Studio confirms it. */
  const patchPart = useCallback((index: number, part: ScenePart) => {
    setScene((s) => (s ? { ...s, parts: s.parts.map((p, i) => (i === index ? part : p)) } : s));
  }, []);

  const setProperties = useCallback(
    async (path: string, properties: Record<string, unknown>) => {
      if (!sessionId) return "No session";
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, tool: "set_properties", args: { path, properties } }),
      }).catch(() => null);
      if (!res) return "Network error";
      const data = (await res.json().catch(() => ({}))) as { result?: { errors?: Record<string, string> }; error?: string };
      if (!res.ok) return data.error ?? `Edit failed (${res.status})`;
      const errs = Object.entries(data.result?.errors ?? {});
      return errs.length ? errs.map(([k, v]) => `${k}: ${v}`).join("; ") : null;
    },
    [sessionId],
  );

  return { scene, loading, error, refresh, select, patchPart, setProperties };
}
