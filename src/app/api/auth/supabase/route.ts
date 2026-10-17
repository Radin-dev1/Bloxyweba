import { z } from "zod";
import { accountForOAuth, rateLimited } from "@/lib/accounts";
import { authConfigured, currentUser, setSession, userOf } from "@/lib/auth";
import { supabaseUserFromToken } from "@/lib/supabase";

const Body = z.object({ accessToken: z.string().min(20).max(8000) });

/**
 * Turns a Supabase login into a Bloxy session. The token is checked with Supabase itself;
 * a confirmed email counts as verified (so it can link to an existing account). Signed in
 * already? Then the Supabase login is linked to that account.
 */
export async function POST(request: Request) {
  if (!authConfigured()) return Response.json({ error: "Accounts aren't set up on this server yet." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (await rateLimited(`supabase:${ip}`, 30)) return Response.json({ error: "Too many attempts. Try again soon." }, { status: 429 });

  const user = await supabaseUserFromToken(parsed.data.accessToken);
  if (!user) return Response.json({ error: "That login expired. Please try again." }, { status: 401 });

  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; user_name?: string; avatar_url?: string; picture?: string };
  const signedIn = await currentUser();
  const account = await accountForOAuth(
    "supabase",
    {
      id: user.id,
      name: meta.full_name || meta.name || meta.user_name || user.email?.split("@")[0] || "Bloxy user",
      picture: meta.avatar_url || meta.picture || null,
      email: user.email ?? undefined,
      emailVerified: !!user.email_confirmed_at,
    },
    signedIn?.id ?? null,
  );
  await setSession(userOf(account));
  return Response.json({ ok: true });
}
