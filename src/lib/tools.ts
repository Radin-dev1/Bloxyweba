import { z } from "zod";

/**
 * Tools the AI can call. Each one is executed by the Studio plugin
 * (plugin/Bloxy.server.lua -> `tools.<name>`), so names and arguments must match.
 */

const path = z
  .string()
  .describe('Dot path from the DataModel, e.g. "Workspace.Map.Door" or "ServerScriptService.Main".');

const VALUE_FORMAT = `Values: plain JSON is coerced to the property's type ("Neon" for Material, "#ff0000" for Color3, [x,y,z] for Vector3, [xs,xo,ys,yo] for UDim2). Or use tagged objects: {"_t":"Vector3","x":0,"y":5,"z":0}, {"_t":"Color3","hex":"#ff8800"}, {"_t":"CFrame","position":[0,5,0],"orientationDeg":[0,90,0]}, {"_t":"UDim2","xs":0.5,"xo":0,"ys":0,"yo":40}, {"_t":"Enum","enum":"Material","name":"Neon"}, {"_t":"Instance","path":"Workspace.Part"}.`;

export const STUDIO_TOOLS = {
  get_studio_state: {
    description: "Get the open place's name, ids, current selection, camera and top-level services. Call this first.",
    schema: z.object({}),
  },
  list_children: {
    description: "List an instance's children as a tree, to explore the game hierarchy.",
    schema: z.object({
      path: path.optional().describe('Root to list. Defaults to "game".'),
      depth: z.number().int().min(1).max(5).optional().describe("How many levels deep (default 1)."),
      limit: z.number().int().min(1).max(1000).optional().describe("Max nodes returned (default 200)."),
    }),
  },
  search_instances: {
    description: "Find instances by partial name, class (IsA), and/or CollectionService tag.",
    schema: z.object({
      root: path.optional().describe('Where to search. Defaults to "game".'),
      name: z.string().optional().describe("Case-insensitive substring of the Name."),
      className: z.string().optional().describe('Class to match with IsA, e.g. "BasePart" or "Script".'),
      tag: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  },
  get_properties: {
    description: "Read an instance's properties, attributes and tags. Omit `properties` for a useful default set.",
    schema: z.object({
      path,
      properties: z.array(z.string()).optional(),
    }),
  },
  set_properties: {
    description: `Set properties and/or attributes on an instance (undoable). ${VALUE_FORMAT}`,
    schema: z.object({
      path,
      properties: z.record(z.string(), z.unknown()).optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    }),
  },
  create_instance: {
    description: `Create a new instance under a parent (undoable). For scripts you can pass \`source\`. ${VALUE_FORMAT}`,
    schema: z.object({
      className: z.string().describe('e.g. "Part", "Model", "RemoteEvent", "ScreenGui".'),
      parent: path,
      name: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      source: z.string().optional().describe("Initial source when className is a script."),
    }),
  },
  clone_instance: {
    description: "Clone an instance, optionally to a new parent and name.",
    schema: z.object({ path, parent: path.optional(), name: z.string().optional() }),
  },
  delete_instance: {
    description: "Destroy an instance (undoable with Ctrl+Z). Services cannot be deleted.",
    schema: z.object({ path }),
  },
  read_script: {
    description: "Read a Script/LocalScript/ModuleScript's source, optionally a line range.",
    schema: z.object({
      path,
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
    }),
  },
  write_script: {
    description:
      "Replace a script's whole source, or create the script if the path doesn't exist yet (the last path segment becomes its name). Prefer edit_script for small changes.",
    schema: z.object({
      path,
      source: z.string(),
      className: z
        .enum(["Script", "LocalScript", "ModuleScript"])
        .optional()
        .describe("Only used when creating. Default Script."),
    }),
  },
  edit_script: {
    description:
      "Replace an exact snippet in a script. `oldText` must match the current source exactly and be unique unless replaceAll is true.",
    schema: z.object({
      path,
      oldText: z.string(),
      newText: z.string(),
      replaceAll: z.boolean().optional(),
    }),
  },
  grep_scripts: {
    description: "Search every script's source for text (or a Lua pattern if regex is true). Returns path, line and text.",
    schema: z.object({
      pattern: z.string(),
      root: path.optional(),
      regex: z.boolean().optional().describe("Treat pattern as a Lua pattern."),
      caseSensitive: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  },
  run_luau: {
    description:
      "Run Luau in Studio edit mode with plugin permissions (undoable as one step). Use for bulk or procedural edits. print/warn output and return values are captured.",
    schema: z.object({ code: z.string() }),
  },
  get_output: {
    description: "Read the latest Output window entries (errors, warnings, prints).",
    schema: z.object({ limit: z.number().int().min(1).max(500).optional() }),
  },
  insert_asset: {
    description: "Insert a Creator Store asset by id into the place.",
    schema: z.object({
      assetId: z.number().int().positive(),
      parent: path.optional().describe("Defaults to Workspace."),
    }),
  },
  set_selection: {
    description: "Select instances in Studio so the user can see them.",
    schema: z.object({ paths: z.array(z.string()) }),
  },
} satisfies Record<string, { description: string; schema: z.ZodObject }>;

export type StudioToolName = keyof typeof STUDIO_TOOLS;

export type ToolSpec = {
  name: StudioToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export const TOOL_SPECS: ToolSpec[] = (Object.keys(STUDIO_TOOLS) as StudioToolName[]).map((name) => {
  const parameters = z.toJSONSchema(STUDIO_TOOLS[name].schema) as Record<string, unknown>;
  delete parameters.$schema;
  return { name, description: STUDIO_TOOLS[name].description, parameters };
});

export function validateToolInput(name: string, input: unknown) {
  const tool = STUDIO_TOOLS[name as StudioToolName];
  if (!tool) return { ok: false as const, error: `Unknown tool "${name}"` };
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false as const, error: `Invalid arguments: ${parsed.error.message}` };
  return { ok: true as const, data: parsed.data };
}

export const SYSTEM_PROMPT = `You are Bloxy, an expert Roblox game developer working directly inside the user's open Roblox Studio place through tools.

How to work (this is what separates a senior developer from a code generator):
1. Understand. Work out what the user actually wants and what "done" looks like. If a big choice is genuinely missing (map size, genre, which system to change), ask ONE short question with 2-3 concrete options; otherwise pick sensible defaults, say which in one line, and go.
2. Look first. Before changing anything: get_studio_state, list_children, search_instances, read_script, grep_scripts. Read existing code and follow the project's structure, naming and style. Never assume an instance or script exists: check.
3. Plan. For anything bigger than one edit, write a short numbered plan (3-6 steps) in one or two lines each, then follow it.
4. Know before you write. If you are not certain how an API or pattern works (DataStores, MarketplaceService, pathfinding, physics, UI scaling...), call search_knowledge first. Use only real Roblox APIs; never invent properties or methods.
5. Build in small, checked steps. Make real changes with the tools, not code pasted in chat. edit_script for small changes, write_script for new or rewritten scripts, run_luau for bulk or procedural edits (keep it idempotent). After each meaningful step, verify: read back what you created (positions, children, properties) and check get_output for errors.
6. Fix until it works. If Output shows an error or a read-back doesn't match the plan, find the cause, fix it and check again (up to 3 rounds) before reporting. Never report success you haven't verified.
7. Finish completely. No placeholders, TODOs or "add your logic here": write the whole system, wired up end to end (server script, client script, remotes, UI) so it works when the user presses Play.
- Every change is undoable with Ctrl+Z in Studio; still, never delete things the user didn't ask you to remove.

Roblox rules:
- Write modern, typed Luau. Use task.wait/task.spawn/task.delay, never wait/spawn/delay.
- Server-authoritative: validate every RemoteEvent/RemoteFunction argument on the server; never trust the client.
- Use GetService for services, WaitForChild on the client for replicated instances, and pcall around DataStore calls.
- Scripts in ServerScriptService, LocalScripts in StarterPlayerScripts/StarterGui/StarterCharacterScripts, shared ModuleScripts in ReplicatedStorage.

Code quality:
- Each script starts with its services (local Players = game:GetService("Players")), then constants/config, then functions, then connections. Name things clearly; add a one-line comment only where the why isn't obvious.
- Clean up what you create: disconnect connections and destroy instances you own when a player leaves or a round ends.
- Keep tunable numbers (prices, damage, cooldowns, speeds) in one config table or ModuleScript, not scattered literals.

Reply style: short. Say what you built or changed and where (paths), how to test it (e.g. "Press Play and step on the green pad"), and at most one useful next step.`;
