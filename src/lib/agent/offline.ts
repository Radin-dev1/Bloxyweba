import { z } from "zod";
import { checkBuild, groundBuild } from "@/lib/buildCheck";
import { Build } from "@/lib/openrouter";
import { SYSTEM_PROMPT } from "@/lib/tools";
import type { AgentEvent, AgentToolSpec, ToolExecutor } from "./types";

/**
 * Chat while Roblox Studio isn't connected: the model can still talk, plan and write Luau,
 * and it builds models straight into the user's Bloxy 3D workspace with `build_model`.
 */

const buildSchema = z.toJSONSchema(Build, { io: "input" }) as Record<string, unknown>;
delete buildSchema.$schema;

export const OFFLINE_TOOLS: AgentToolSpec[] = [
  {
    name: "build_model",
    description:
      "Place a model in the user's Bloxy 3D workspace (the preview in the website). Build it from Roblox parts: " +
      "shape Block | Ball | Cylinder | Wedge, size in studs [x, y, z], position = part centre in studs (Y is up, the ground's top is y = 0), " +
      "rotation in degrees [x, y, z], color as hex, a Roblox Material name, transparency 0-1. Up to 400 parts. " +
      "Calling it again with the same model name replaces that model.",
    parameters: buildSchema,
  },
];

export const OFFLINE_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

IMPORTANT, right now: Roblox Studio is NOT connected, so the Studio tools above are unavailable.
You can still:
- answer questions, explain, plan games and systems, and write Luau the user can paste into Studio;
- build models in the user's Bloxy 3D workspace with the build_model tool. When the user asks for something
  physical (a house, a car, an obby section, a prop), build it with build_model instead of only describing it.
  Make models detailed and well proportioned (Roblox characters are about 5 studs tall), use several parts with
  sensible colors and materials, and keep everything resting on the ground (y >= 0).
Mention once, briefly, that connecting the Bloxy Studio plugin lets you build directly in their place.`;

/** Runs build_model by sending the build to the browser; every other tool explains Studio isn't connected. */
export function makeOfflineExecutor(emit: (e: AgentEvent) => void): ToolExecutor {
  return async (callId, name, input) => {
    let ok = false;
    let content: string;
    if (name !== "build_model") {
      content = "Roblox Studio is not connected, so this tool can't run. Use build_model, or ask the user to connect the Bloxy plugin.";
    } else {
      const parsed = Build.safeParse(input);
      if (!parsed.success) {
        content = `Invalid build: ${parsed.error.message.slice(0, 1200)}`;
      } else {
        // Sit it on the ground, place it, then report what a careful builder would check.
        const build = groundBuild(parsed.data);
        emit({ type: "build", id: callId, build });
        ok = true;
        const check = checkBuild(build);
        content =
          `Placed "${build.name}" in the user's Bloxy workspace. ${check.summary}` +
          (check.problems.length ? "\nFix these by calling build_model again with the same name." : "");
      }
    }
    emit({ type: "tool_result", id: callId, ok, preview: content.slice(0, 2000) });
    return { ok, content };
  };
}
