import { z } from "zod";
import { getAccount, rateLimited, saveAccount, validEmail } from "@/lib/accounts";
import { currentUser, originOf } from "@/lib/auth";
import { billingConfigured, createCheckout } from "@/lib/lava";

const Body = z.object({
  item: z.enum(["pro", "studio", "bits_small", "bits_large"]),
  currency: z.enum(["USD", "EUR", "RUB"]),
  periodicity: z.enum(["MONTHLY", "PERIOD_90_DAYS", "PERIOD_180_DAYS", "PERIOD_YEAR"]).optional(),
  /** Needed when the account has no email yet (e.g. Roblox sign-in). */
  email: z.string().max(254).optional(),
});

/** Starts a lava.top checkout and returns its payment link. */
export async function POST(request: Request) {
  if (!billingConfigured()) return Response.json({ error: "Payments aren't set up on this server yet." }, { status: 503 });
  const user = await currentUser();
  const account = user ? await getAccount(user.id) : null;
  if (!user || !account) return Response.json({ error: "Log in first.", code: "sign_in" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { item, currency, periodicity } = parsed.data;
  const email = (parsed.data.email ?? account.email ?? "").trim();
  if (!validEmail(email)) return Response.json({ error: "Enter the email for your receipt.", code: "need_email" }, { status: 400 });
  if (await rateLimited(`checkout:${account.id}`, 15)) return Response.json({ error: "Too many checkouts. Try again soon." }, { status: 429 });
  if (!account.email) {
    account.email = email.toLowerCase();
    account.emailVerified = false;
    await saveAccount(account);
  }
  try {
    const paymentUrl = await createCheckout(account, item, { email, currency, periodicity, returnUrl: `${originOf(request)}/billing` });
    return Response.json({ paymentUrl });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
