import { z } from "zod";
import { createEmailAccount, rateLimited, validEmail } from "@/lib/accounts";
import { authConfigured, setSession, userOf } from "@/lib/auth";

const Body = z.object({
  email: z.string().max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  name: z.string().max(40).optional(),
});

/** Creates an email + password account and signs it in. */
export async function POST(request: Request) {
  if (!authConfigured()) return Response.json({ error: "Accounts aren't set up on this server yet (AUTH_SECRET)." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const { email, password, name } = parsed.data;
  if (!validEmail(email)) return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (await rateLimited(`signup:${ip}`, 5)) return Response.json({ error: "Too many sign-ups. Try again in a few minutes." }, { status: 429 });
  const account = await createEmailAccount(email, password, name ?? "");
  if (!account) return Response.json({ error: "There's already an account with that email. Log in instead." }, { status: 409 });
  await setSession(userOf(account));
  return Response.json({ ok: true });
}
