import { z } from "zod";
import { currentUser, isAdmin } from "@/lib/auth";
import { grant } from "@/lib/bits";

const Body = z.object({
  userId: z.string().regex(/^\d+$/, "Roblox user id (numbers only)"),
  amount: z.number().int().min(-1_000_000).max(1_000_000),
});

/** Admins (ADMIN_ROBLOX_IDS) give or take bits by Roblox user id. */
export async function POST(request: Request) {
  if (!isAdmin(await currentUser())) return Response.json({ error: "forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad_request" }, { status: 400 });
  const balance = await grant(parsed.data.userId, parsed.data.amount);
  return Response.json({ userId: parsed.data.userId, balance });
}
