"use client";

import { useEffect, useState } from "react";

export type McpState = { available: boolean; studio: { id: string; name: string } | null };

/** Polls whether Roblox Studio is reachable without the plugin (Studio's built-in MCP server). */
export function useStudioMcp(intervalMs = 8000) {
  const [state, setState] = useState<McpState>({ available: false, studio: null });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/studio-mcp", { cache: "no-store" });
        if (res.ok && alive) setState((await res.json()) as McpState);
      } catch {}
    };
    const first = setTimeout(() => void check(), 0);
    const id = setInterval(() => void check(), intervalMs);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return state;
}
