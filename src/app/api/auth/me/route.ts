import { getAccount, isPro } from "@/lib/accounts";
import { authConfigured, currentUser, isAdmin, providersEnabled } from "@/lib/auth";
import { BITS_DAILY, BITS_DAILY_PRO, balanceOf, bitsEnabled } from "@/lib/bits";

/** Who's signed in, their plan and how many bits they have, for the header. */
export async function GET() {
  const user = await currentUser();
  const enabled = bitsEnabled();
  const account = user ? await getAccount(user.id).catch(() => null) : null;
  const pro = isPro(account);
  return Response.json(
    {
      user,
      bits: user && enabled ? await balanceOf(user.id) : null,
      daily: pro ? BITS_DAILY_PRO : BITS_DAILY,
      bitsEnabled: enabled,
      signInEnabled: authConfigured(),
      providers: providersEnabled(),
      admin: isAdmin(user),
      account: account
        ? {
            email: account.email ?? null,
            hasPassword: !!account.passwordHash,
            linked: Object.keys(account.providers),
            pro,
            proUntil: account.plan?.proUntil ?? null,
            cancelled: !!account.plan?.cancelled,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
