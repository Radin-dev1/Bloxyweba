import { fetchRobloxUser, finishFlow, originOf, setSession } from "@/lib/auth";

/** Roblox redirects back here with ?code&state after the user approves. */
export async function GET(request: Request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  const fail = (msg: string) => Response.redirect(`${origin}/studio?auth_error=${encodeURIComponent(msg)}`);

  if (url.searchParams.get("error")) return fail("Roblox sign-in was cancelled.");
  const flow = await finishFlow(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!flow || !code) return fail("Sign-in expired. Please try again.");

  try {
    const user = await fetchRobloxUser(code, flow.verifier, `${origin}/api/auth/roblox/callback`);
    await setSession(user);
    return Response.redirect(`${origin}${flow.returnTo}`);
  } catch (err) {
    console.error("[bloxy] roblox sign-in failed", err);
    return fail("Couldn't sign in with Roblox. Please try again.");
  }
}
