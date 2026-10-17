import { z } from "zod";
import { bridge } from "@/lib/bridge";
import { Build } from "@/lib/openrouter";

export const maxDuration = 60;

// Tools the website itself may call without going through the AI: reads, selection,
// the Properties panel / transform gizmo edits the user makes by hand, and inserting a
// generated model from the node editor, and deleting Workspace objects. All edits are undoable in Studio.
const Body = z.discriminatedUnion("tool", [
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("get_scene"),
    args: z.object({ root: z.string().optional(), limit: z.number().int().min(1).max(8000).optional() }).default({}),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("set_selection"),
    args: z.object({ paths: z.array(z.string()).max(200) }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("set_properties"),
    args: z.object({ path: z.string().min(1), properties: z.record(z.string(), z.unknown()) }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("insert_parts"),
    args: Build.extend({ at: z.tuple([z.number(), z.number(), z.number()]).optional() }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("delete_instance"),
    args: z.object({ path: z.string().min(1).refine((p) => p.startsWith("Workspace."), "Only Workspace objects can be deleted here") }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("get_studio_state"),
    args: z.object({}).default({}),
  }),
  // The Scripts tab: list, search, read and save scripts (each save is one undo step in Studio).
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("search_instances"),
    args: z.object({ className: z.literal("LuaSourceContainer"), name: z.string().max(100).optional(), limit: z.number().int().min(1).max(500).optional() }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("grep_scripts"),
    args: z.object({ pattern: z.string().min(1).max(200), limit: z.number().int().min(1).max(200).optional() }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("read_script"),
    args: z.object({ path: z.string().min(1).max(500) }),
  }),
  z.object({
    sessionId: z.string().min(1),
    tool: z.literal("write_script"),
    args: z.object({ path: z.string().min(1).max(500), source: z.string().max(400_000) }),
  }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { sessionId, tool, args } = parsed.data;
  const r = await bridge.runInStudio(sessionId, tool, args, 30_000);
  if (!r.ok) {
    const outdated = r.error.startsWith("Unknown tool");
    return Response.json(
      { error: outdated ? "Your Bloxy plugin is out of date. Download it again and restart Studio." : r.error },
      { status: outdated ? 426 : 409 },
    );
  }
  return Response.json({ result: r.result });
}
