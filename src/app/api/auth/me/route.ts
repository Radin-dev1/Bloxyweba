import { getAccount, isPro, tierOf } from "@/lib/accounts";
import { authConfigured, currentUser, isAdmin, providersEnabled } from "@/lib/auth";
import { supabaseEnabled, supabaseProviders } from "@/lib/supabase";
import { balanceOf, bitsEnabled, dailyForTier } from "@/lib/bits";

/** Who's signed in, their plan and how many bits they have, for the header. */
export async function GET() {
  const user = await currentUser();
  const enabled = bitsEnabled();
  const account = user ? await getAccount(user.id).catch(() => null) : null;
  const pro = isPro(account);
  const tier = tierOf(account);
  return Response.json(
    {
      user,
      bits: user && enabled ? await balanceOf(user.id) : null,
      daily: dailyForTier(tier),
      bitsEnabled: enabled,
      signInEnabled: authConfigured(),
      providers: providersEnabled(),
      // Login through Supabase (email, Google): whether this deployment has its URL and key.
      supabase: supabaseEnabled() ? supabaseProviders() : null,
      admin: isAdmin(user),
      account: account
        ? {
            email: account.email ?? null,
            hasPassword: !!account.passwordHash,
            linked: Object.keys(account.providers),
            pro,
            tier,
            proUntil: account.plan?.proUntil ?? null,
            cancelled: !!account.plan?.cancelled,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
