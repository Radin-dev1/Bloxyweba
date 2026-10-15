"use client";

import { useCallback, useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import type { ProviderId } from "@/lib/agent/types";

export type Settings = {
  provider: ProviderId;
  models: Record<ProviderId, string>;
  apiKeys: Record<ProviderId, string>;
  /** For the generation nodes (images, video, 3D as code). */
  openrouterKey: string;
};

const KEY = "bloxy.settings";

const DEFAULTS: Settings = {
  provider: "claude",
  models: { claude: PROVIDERS.claude.defaultModel, gemini: PROVIDERS.gemini.defaultModel },
  apiKeys: { claude: "", gemini: "" },
  openrouterKey: "",
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      provider: saved.provider && saved.provider in PROVIDERS ? saved.provider : DEFAULTS.provider,
      models: { ...DEFAULTS.models, ...saved.models },
      apiKeys: { ...DEFAULTS.apiKeys, ...saved.apiKeys },
      openrouterKey: typeof saved.openrouterKey === "string" ? saved.openrouterKey : "",
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Provider, model and API keys. Keys stay in this browser's localStorage only.
 * The app renders client-side only (see ClientApp), so reading storage on first render is safe.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  return [settings, update] as const;
}
