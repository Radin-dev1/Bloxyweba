import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL_SPECS } from "@/lib/tools";
import { MAX_STEPS, type AgentParams } from "./types";

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export async function runClaude({ model, apiKey, history, executeTool, emit, signal, ...run }: AgentParams) {
  const tools: Anthropic.Beta.BetaTool[] = (run.tools ?? TOOL_SPECS).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
    // Stream big inputs (whole scripts) as they're generated; inputs are validated before running.
    eager_input_streaming: true,
  }));
  const system = run.system ?? SYSTEM_PROMPT;
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const useFallback = FALLBACK_MODELS.has(model);
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return;
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "high" },
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    stream.on("text", (delta) => emit({ type: "text", delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors and aborts bubble up.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "Claude declined this request." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) return;
    if (message.stop_reason === "max_tokens") {
      emit({ type: "error", message: "The reply was cut off while writing a tool call. Ask for a smaller step." });
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    // Run this turn's tool calls in parallel, then return every result in one user message.
    const results = await Promise.all(
      toolUses.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        emit({ type: "tool_call", id: call.id, name: call.name, args: call.input });
        const r = await executeTool(call.id, call.name, call.input, signal);
        return { type: "tool_result", tool_use_id: call.id, content: r.content, is_error: !r.ok };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps. Say "continue" to keep going.` });
}
