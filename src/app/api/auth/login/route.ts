import { z } from "zod";
import { accountByEmail, checkPassword, normEmail, rateLimited } from "@/lib/accounts";
import { authConfigured, setSession, userOf } from "@/lib/auth";

const Body = z.object({ email: z.string().max(254), password: z.string().max(200) });

/** Email + password login. The same message for a wrong email or password, on purpose. */
export async function POST(request: Request) {
  if (!authConfigured()) return Response.json({ error: "Accounts aren't set up on this server yet (AUTH_SECRET)." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter your email and password." }, { status: 400 });
  const { email, password } = parsed.data;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if ((await rateLimited(`login:${ip}`, 20)) || (await rateLimited(`login:${normEmail(email)}`, 10))) {
    return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const account = await accountByEmail(email);
  if (!account || !(await checkPassword(password, account.passwordHash))) {
    return Response.json({ error: "Wrong email or password." }, { status: 401 });
  }
  await setSession(userOf(account));
  return Response.json({ ok: true });
}
