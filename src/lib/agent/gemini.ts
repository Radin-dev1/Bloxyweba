import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { SYSTEM_PROMPT, TOOL_SPECS } from "@/lib/tools";
import { MAX_STEPS, type AgentParams } from "./types";

const functionDeclarations = TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.parameters,
}));

export async function runGemini({ model, apiKey, history, executeTool, emit, signal }: AgentParams) {
  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations }],
        abortSignal: signal,
      },
    });

    // Keep the raw parts: Gemini needs its thought signatures sent back unchanged.
    const parts: Part[] = [];
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) emit({ type: "text", delta: part.text });
      }
    }
    if (parts.length === 0) return;
    contents.push({ role: "model", parts });

    const calls = parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
    if (calls.length === 0) return;

    const responses = await Promise.all(
      calls.map(async (call, i): Promise<Part> => {
        const id = call.id ?? `gemini-${step}-${i}`;
        const name = call.name ?? "";
        emit({ type: "tool_call", id, name, args: call.args ?? {} });
        const r = await executeTool(id, name, call.args ?? {});
        return {
          functionResponse: {
            id: call.id,
            name,
            response: r.ok ? { output: r.content } : { error: r.content },
          },
        };
      }),
    );
    contents.push({ role: "user", parts: responses });
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps. Say "continue" to keep going.` });
}
