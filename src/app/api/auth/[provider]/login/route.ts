import { isProvider, originOf, providersEnabled, safeReturn, startFlow } from "@/lib/auth";

/** Starts "Continue with Google / Roblox". */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = originOf(request);
  if (!isProvider(provider) || !providersEnabled().includes(provider)) {
    return Response.redirect(`${origin}/login?error=${encodeURIComponent("That sign-in method isn't set up on this server yet.")}`);
  }
  const returnTo = safeReturn(new URL(request.url).searchParams.get("returnTo"));
  return Response.redirect(await startFlow(provider, `${origin}/api/auth/${provider}/callback`, returnTo));
}
