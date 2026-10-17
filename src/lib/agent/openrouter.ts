import { fetchRetry, OPENROUTER } from "@/lib/openrouter";
import { SYSTEM_PROMPT, TOOL_SPECS } from "@/lib/tools";
import { MAX_STEPS, type AgentParams } from "./types";

// OpenRouter speaks the OpenAI chat-completions format, including tool calls.

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Msg =
  | { role: "system" | "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function runOpenRouter({ model, apiKey, history, executeTool, emit, signal, billing, ...run }: AgentParams) {
  const tools = (run.tools ?? TOOL_SPECS).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const messages: Msg[] = [{ role: "system", content: run.system ?? SYSTEM_PROMPT }, ...history.map((m) => ({ ...m }))];
  // Tool renders go to the model as images. Text-only models reject them, so the first such
  // rejection swaps every image for a note and the step is retried.
  let images = true;
  const hasImages = () => messages.some((m) => Array.isArray(m.content));
  const dropImages = () => {
    images = false;
    for (const m of messages)
      if (Array.isArray(m.content))
        m.content = m.content.map((p) => (p.type === "text" ? p.text : "(The render was left out: this model can't see images.)")).join("\n");
  };

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
      // Free models are rate-limited hard: let OpenRouter fall back to any free model, and retry
      // briefly on rate limits / busy providers before giving up.
      const free = model.endsWith(":free") || model === "openrouter/free";
      const body = JSON.stringify({
        model,
        ...(free && model !== "openrouter/free" ? { models: [model, "openrouter/free"] } : {}),
        messages,
        tools,
        max_tokens: 16000,
      });
      let res: Response | null = null;
      for (const wait of [0, 2000, 6000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (signal.aborted) return;
        res = await fetchRetry(`${OPENROUTER}/chat/completions`, {
          method: "POST",
          signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Bloxy" },
          body,
        });
        if (![429, 502, 503].includes(res.status)) break;
      }
      data = await res!.json().catch(() => ({}));
      if (!res!.ok && images && hasImages() && [400, 404, 415, 422].includes(res!.status)) {
        await billing?.afterStep(null, true);
        dropImages();
        step--;
        continue;
      }
      if (!res!.ok) {
        await billing?.afterStep(null, true);
        const err = new Error(data.error?.message ?? `OpenRouter returned ${res!.status}`) as Error & { status: number };
        err.status = res!.status;
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
        return { id: call.id, content: r.ok ? r.content : `Error: ${r.content}`, image: r.image };
      }),
    );
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    // Tool messages are text only in this format, so renders follow as one user message.
    const renders = results.filter((r) => r.image);
    if (renders.length) {
      const parts: Part[] = renders.flatMap((r) => [
        { type: "text" as const, text: `Render for tool call ${r.id}:` },
        { type: "image_url" as const, image_url: { url: `data:${r.image!.mediaType};base64,${r.image!.data}` } },
      ]);
      messages.push({ role: "user", content: images ? parts : "(Renders left out: this model can't see images.)" });
    }
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps. Say "continue" to keep going.` });
}
