/** "openrouter" = Bloxy: the owner's OpenRouter key paid with bits (or the user's own OpenRouter key). */
export type ProviderId = "openrouter" | "claude" | "gemini";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Runs one tool call in Studio and returns the text the model should see. */
export type ToolExecutor = (callId: string, name: string, input: unknown) => Promise<{ ok: boolean; content: string }>;

export type AgentParams = {
  model: string;
  apiKey: string;
  history: ChatMessage[];
  executeTool: ToolExecutor;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  /** Bits accounting per model step (only when running on the owner's key). */
  billing?: StepBilling;
};

export type StepBilling = {
  /** Holds bits for the next step; false = out of bits. */
  beforeStep: () => Promise<boolean>;
  /** Settles the held bits to the step's real cost (USD), or refunds on failure (null). */
  afterStep: (costUsd: number | null | undefined, failed?: boolean) => Promise<void>;
};

/** Upper bound on model round-trips per user message, so a confused model can't loop forever. */
export const MAX_STEPS = 40;
