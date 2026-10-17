import { accountForOAuth } from "@/lib/accounts";
import { currentUser, fetchProfile, finishFlow, isProvider, originOf, PROVIDERS, setSession, userOf } from "@/lib/auth";

/** The provider redirects back here with ?code&state after the user approves. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = originOf(request);
  const url = new URL(request.url);
  const fail = (msg: string) => Response.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  if (!isProvider(provider)) return fail("Unknown sign-in method.");
  const label = PROVIDERS[provider].label;

  if (url.searchParams.get("error")) return fail(`${label} sign-in was cancelled.`);
  const flow = await finishFlow(provider, url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!flow || !code) return fail("Sign-in expired. Please try again.");

  try {
    const profile = await fetchProfile(provider, code, flow.verifier, `${origin}/api/auth/${provider}/callback`);
    // Signed in already? Then this links the new method to the same account.
    const signedIn = await currentUser();
    const account = await accountForOAuth(provider, profile, signedIn?.id ?? null);
    await setSession(userOf(account));
    return Response.redirect(`${origin}${flow.returnTo}`);
  } catch (err) {
    console.error(`[bloxy] ${provider} sign-in failed`, err);
    return fail(`Couldn't sign in with ${label}. Please try again.`);
  }
}
