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

// ── Free models ──

/** The best free OpenRouter models that can use Bloxy's tools (checked against the live catalog). */
export const FREE_RECOMMENDED = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "thinkingmachines/inkling:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "poolside/laguna-s-2.1:free",
  "dots-studio/dots-3-note-preview:free",
  "openrouter/free",
];

/** Used when "Free models only" is turned on and the current model isn't free. */
export const FREE_DEFAULT = FREE_RECOMMENDED[0];

/** Free = costs nothing on OpenRouter (":free" variants, the free router, or $0 pricing). */
export function isFreeModel(m: Pick<ModelInfo, "id"> & Partial<ModelInfo>) {
  return m.id.endsWith(":free") || m.id === "openrouter/free" || (m.inputPrice === 0 && m.outputPrice === 0);
}

/** Free models that work as Bloxy's chat (they need tool calling). */
export function isFreeChatModel(m: ModelInfo) {
  return isFreeModel(m) && m.tools !== false;
}
