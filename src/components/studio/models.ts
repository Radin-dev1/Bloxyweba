"use client";

import type { ModelInfo } from "@/app/api/gen/models/route";
import { PROVIDERS } from "@/lib/agent/providers";

export type { ModelInfo };

// OpenRouter's full text-model list, fetched once per page load (public, no key needed).
let modelsPromise: Promise<ModelInfo[]> | null = null;

export function loadTextModels() {
  modelsPromise ??= fetch("/api/gen/models?kind=text")
    .then((r) => r.json())
    .then((d: { models?: (ModelInfo | string)[] }) =>
      (d.models ?? []).map((m) => (typeof m === "string" ? { id: m, name: m } : m)),
    )
    .catch(() => {
      modelsPromise = null; // let the next open retry
      return [];
    });
  return modelsPromise;
}

export const RECOMMENDED = PROVIDERS.openrouter.models;

/** "Anthropic: Claude Sonnet 5.5" → "Claude Sonnet 5.5". */
export function shortName(m: Pick<ModelInfo, "id" | "name">) {
  const n = m.name.includes(": ") ? m.name.split(": ").slice(1).join(": ") : m.name;
  return n || m.id;
}

export function formatPrice(usd?: number) {
  if (usd === undefined) return "—";
  if (usd === 0) return "Free";
  return `$${usd < 1 ? usd.toFixed(2) : usd.toFixed(usd < 10 ? 2 : 0)}`;
}

export function formatContext(n?: number) {
  if (!n) return "—";
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;
}
