import type { Settings } from "../useSettings";
import { FREE_DEFAULT, isFreeModel } from "./models";

export { FREE_DEFAULT };

/**
 * Turns "Free models only" on or off. Turning it on also moves the chat to a free model
 * (on Bloxy/OpenRouter) when the current one isn't free.
 */
export function withFreeOnly(settings: Settings, on: boolean): Settings {
  if (!on) return { ...settings, freeOnly: false };
  const current = settings.models.openrouter;
  const free = settings.provider === "openrouter" && isFreeModel({ id: current });
  return {
    ...settings,
    freeOnly: true,
    provider: "openrouter",
    models: { ...settings.models, openrouter: free ? current : FREE_DEFAULT },
  };
}
