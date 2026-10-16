"use client";

import type { Model3DEvent } from "@/app/api/gen/model3d/route";
import type { BuildT } from "@/lib/openrouter";
import { GenError } from "./dock/shared";

export type BuildPartT = BuildT["parts"][number];

export type Model3DHandlers = {
  onStatus?: (text: string) => void;
  onName?: (name: string) => void;
  onPart?: (part: BuildPartT) => void;
};

/**
 * Generates a 3D model and reports it part by part while the AI writes it. Resolves with the
 * final, validated build. Works with the route's streamed (NDJSON) reply and its plain JSON
 * replies (errors, or older servers).
 */
export async function streamModel3d(
  body: Record<string, unknown>,
  handlers: Model3DHandlers = {},
  signal?: AbortSignal,
): Promise<{ build: BuildT; bits: number; references: string[] }> {
  const res = await fetch("/api/gen/model3d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.headers.get("content-type")?.includes("ndjson")) {
    const data = (await res.json().catch(() => ({}))) as {
      build?: BuildT;
      bits?: number;
      references?: string[];
      error?: string;
      code?: string;
    };
    if (!res.ok || !data.build) throw new GenError(data.error ?? `Request failed (${res.status})`, data.code, res.status);
    for (const part of data.build.parts) handlers.onPart?.(part);
    return { build: data.build, bits: data.bits ?? 0, references: data.references ?? [] };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { build: BuildT; bits: number; references: string[] } | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: Model3DEvent;
      try {
        event = JSON.parse(line) as Model3DEvent;
      } catch {
        continue;
      }
      if (event.type === "status") handlers.onStatus?.(event.text);
      else if (event.type === "name") handlers.onName?.(event.name);
      else if (event.type === "part") handlers.onPart?.(event.part);
      else if (event.type === "error") throw new GenError(event.message);
      else if (event.type === "build") result = { build: event.build, bits: event.bits, references: event.references };
    }
  }
  if (!result) throw new GenError("The generation stopped before the model was finished. Try again.");
  return result;
}

/** StudioApp's generator: streams a model and builds it live in the workspace. */
export type Generate3D = (
  body: Record<string, unknown>,
  handlers?: Model3DHandlers,
  options?: { autoAdd?: boolean },
) => Promise<{ build: BuildT; bits: number; references: string[]; path?: string }>;
