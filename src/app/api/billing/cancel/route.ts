import { getAccount } from "@/lib/accounts";
import { currentUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/lava";

/** Cancels Pro renewal; Pro stays on until the paid period ends. */
export async function POST() {
  const user = await currentUser();
  const account = user ? await getAccount(user.id) : null;
  if (!account) return Response.json({ error: "Log in first." }, { status: 401 });
  try {
    await cancelSubscription(account);
    return Response.json({ ok: true, proUntil: account.plan?.proUntil ?? null });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
