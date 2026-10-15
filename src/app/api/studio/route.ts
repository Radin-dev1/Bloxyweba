import { z } from "zod";
import { bridge } from "@/lib/bridge";

export const maxDuration = 60;

// Tools the website itself may call without going through the AI.
// Kept to reads plus selection so the browser can't make silent edits.
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
    tool: z.literal("get_studio_state"),
    args: z.object({}).default({}),
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
