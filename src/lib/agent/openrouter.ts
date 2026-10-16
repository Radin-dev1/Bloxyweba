import { OPENROUTER } from "@/lib/openrouter";
import { SYSTEM_PROMPT, TOOL_SPECS } from "@/lib/tools";
import { MAX_STEPS, type AgentParams } from "./types";

// OpenRouter speaks the OpenAI chat-completions format, including tool calls.

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function runOpenRouter({ model, apiKey, history, executeTool, emit, signal, billing, ...run }: AgentParams) {
  const tools = (run.tools ?? TOOL_SPECS).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const messages: Msg[] = [{ role: "system", content: run.system ?? SYSTEM_PROMPT }, ...history.map((m) => ({ ...m }))];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return;
    if (billing && !(await billing.beforeStep())) {
      emit({ type: "error", message: "You're out of bits for today. They refill daily, or add your own OpenRouter key in Settings." });
      return;
    }

    let data: {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
      usage?: { cost?: number };
      error?: { message?: string };
    };
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Bloxy" },
        body: JSON.stringify({ model, messages, tools, max_tokens: 16000 }),
      });
      data = await res.json();
      if (!res.ok) {
        await billing?.afterStep(null, true);
        const err = new Error(data.error?.message ?? `OpenRouter returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
    } catch (err) {
      if ((err as { status?: number }).status === undefined) await billing?.afterStep(null, true);
      throw err;
    }
    await billing?.afterStep(data.usage?.cost);

    const choice = data.choices?.[0];
    const msg = choice?.message ?? {};
    if (msg.content) emit({ type: "text", delta: msg.content });
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return;

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    const results = await Promise.all(
      calls.map(async (call) => {
        let args: unknown = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          return { id: call.id, content: "Your tool arguments weren't valid JSON. Try again." };
        }
        emit({ type: "tool_call", id: call.id, name: call.function.name, args });
        const r = await executeTool(call.id, call.function.name, args, signal);
        return { id: call.id, content: r.ok ? r.content : `Error: ${r.content}` };
      }),
    );
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps. Say "continue" to keep going.` });
}
