/** "openrouter" = Bloxy: the owner's OpenRouter key paid with bits (or the user's own OpenRouter key). */
import type { BuildT } from "@/lib/openrouter";

export type ProviderId = "openrouter" | "claude" | "gemini";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "user"; content: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  /** A model built while Studio is offline, for the browser to place in the 3D workspace. */
  | { type: "build"; id: string; build: BuildT }
  | { type: "error"; message: string }
  | { type: "done" };

/** Runs one tool call in Studio and returns the text the model should see. */
export type ToolExecutor = (callId: string, name: string, input: unknown, signal?: AbortSignal) => Promise<{ ok: boolean; content: string }>;

export type AgentParams = {
  model: string;
  apiKey: string;
  history: ChatMessage[];
  executeTool: ToolExecutor;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  /** Tools and system prompt for this run (default: the Studio tools and prompt). */
  tools?: AgentToolSpec[];
  system?: string;
  /** Bits accounting per model step (only when running on the owner's key). */
  billing?: StepBilling;
};

export type AgentToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export type StepBilling = {
  /** Holds bits for the next step; false = out of bits. */
  beforeStep: () => Promise<boolean>;
  /** Settles the held bits to the step's real cost (USD), or refunds on failure (null). */
  afterStep: (costUsd: number | null | undefined, failed?: boolean) => Promise<void>;
};

/** Upper bound on model round-trips per user message, so a confused model can't loop forever. */
export const MAX_STEPS = 40;
