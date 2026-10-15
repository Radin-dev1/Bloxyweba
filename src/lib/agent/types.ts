export type ProviderId = "claude" | "gemini";

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
};

/** Upper bound on model round-trips per user message, so a confused model can't loop forever. */
export const MAX_STEPS = 40;
