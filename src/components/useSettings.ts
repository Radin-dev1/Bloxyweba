"use client";

import { useCallback, useState } from "react";
import { PROVIDERS } from "@/lib/agent/providers";
import type { ProviderId } from "@/lib/agent/types";
import { DEFAULT_IMAGE_MODEL, DEFAULT_MESH_MODEL, IMAGE_MODELS, MESH_MODELS, type ImageModelId, type MeshModelId } from "@/lib/hfModels";

export type Settings = {
  provider: ProviderId;
  models: Record<ProviderId, string>;
  apiKeys: Record<ProviderId, string>;
  /** The user's own OpenRouter key: used free for Bloxy chat and the Nodes tab instead of bits. */
  openrouterKey: string;
  /** Only show and use OpenRouter's free models. */
  freeOnly: boolean;
  /** Open-source models (Hugging Face) for AI 3D generation: concept image, then mesh. */
  imageModel: ImageModelId;
  meshModel: MeshModelId;
};

const KEY = "bloxy.settings";

// New users start on Bloxy (bits), which needs no key of their own.
const DEFAULTS: Settings = {
  provider: "openrouter",
  models: {
    openrouter: PROVIDERS.openrouter.defaultModel,
    claude: PROVIDERS.claude.defaultModel,
    gemini: PROVIDERS.gemini.defaultModel,
  },
  apiKeys: { openrouter: "", claude: "", gemini: "" },
  openrouterKey: "",
  freeOnly: false,
  imageModel: DEFAULT_IMAGE_MODEL,
  meshModel: DEFAULT_MESH_MODEL,
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
      freeOnly: saved.freeOnly === true,
      imageModel: IMAGE_MODELS.some((m) => m.id === saved.imageModel) ? saved.imageModel! : DEFAULT_IMAGE_MODEL,
      meshModel: MESH_MODELS.some((m) => m.id === saved.meshModel) ? saved.meshModel! : DEFAULT_MESH_MODEL,
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
