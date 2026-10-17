import { bridge } from "@/lib/bridge";
import { validateToolInput } from "@/lib/tools";
import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import { runOpenRouter } from "./openrouter";
import type { AgentEvent, AgentParams, ProviderId, ToolExecutor } from "./types";

export * from "./types";
export { PROVIDERS } from "./providers";
export { OFFLINE_SYSTEM_PROMPT, OFFLINE_TOOLS, makeOfflineExecutor } from "./offline";
export { SCULPT_NOTE, SCULPT_TOOL, sculptAvailable } from "./sculpt";
export { GENERATE_3D_NOTE, GENERATE_3D_TOOL } from "./generate3d";

const MAX_TOOL_RESULT_CHARS = 60_000;

/** Executor that validates the model's arguments, runs them in Studio, and reports progress. */
export function makeStudioExecutor(sessionId: string, emit: (e: AgentEvent) => void): ToolExecutor {
  return async (callId, name, input, signal) => {
    const valid = validateToolInput(name, input);
    let ok: boolean;
    let content: string;
    if (!valid.ok) {
      ok = false;
      content = valid.error;
    } else {
      const r = await bridge.runInStudio(sessionId, name, valid.data, name === "run_luau" ? 120_000 : 60_000, signal);
      ok = r.ok;
      content = r.ok ? JSON.stringify(r.result) : r.error;
    }
    if (content.length > MAX_TOOL_RESULT_CHARS) {
      content = content.slice(0, MAX_TOOL_RESULT_CHARS) + "\n…[truncated, ask for a smaller range or limit]";
    }
    emit({ type: "tool_result", id: callId, ok, preview: content.slice(0, 2000) });
    return { ok, content };
  };
}

export function runAgent(provider: ProviderId, params: AgentParams) {
  if (provider === "openrouter") return runOpenRouter(params);
  return provider === "claude" ? runClaude(params) : runGemini(params);
}
