import type { ProviderId } from "./types";

// Shared with the browser, so keep this file free of server-only imports.
export const PROVIDERS: Record<
  ProviderId,
  { label: string; envKey: string; keyUrl: string; keyPrefix: string; models: string[]; defaultModel: string }
> = {
  openrouter: {
    label: "Bloxy",
    envKey: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    models: [
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-opus-5.5",
      "anthropic/claude-haiku-5.5",
      "google/gemini-3.8-flash",
      "openai/gpt-5.6-terra",
    ],
    defaultModel: "anthropic/claude-sonnet-5.5",
  },
  claude: {
    label: "Claude",
    envKey: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
    defaultModel: "claude-opus-5-5",
  },
  gemini: {
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AI",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
  },
};
