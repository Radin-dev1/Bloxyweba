import { z } from "zod";
import { accountByEmail, accountByProvider, getAccount } from "@/lib/accounts";
import { currentUser, isAdmin } from "@/lib/auth";
import { grant } from "@/lib/bits";

const Body = z.object({
  userId: z.string().trim().min(1).max(254),
  amount: z.number().int().min(-1_000_000).max(1_000_000),
});

/** Admins give or take bits by account id, Roblox user id or email. */
export async function POST(request: Request) {
  if (!isAdmin(await currentUser())) return Response.json({ error: "forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad_request" }, { status: 400 });
  const who = parsed.data.userId;
  const numeric = /^\d+$/.test(who);
  const account = who.includes("@")
    ? await accountByEmail(who)
    : ((await getAccount(who)) ?? (numeric ? await accountByProvider("roblox", who) : null));
  // Unknown numeric ids still work: Roblox users who haven't signed in since accounts arrived.
  const id = account?.id ?? (numeric ? who : null);
  if (!id) return Response.json({ error: "No account with that id or email." }, { status: 404 });
  const balance = await grant(id, parsed.data.amount);
  return Response.json({ userId: id, balance });
}
