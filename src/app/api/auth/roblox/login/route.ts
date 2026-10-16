import { authConfigured, originOf, startFlow } from "@/lib/auth";

/** Starts "Sign in with Roblox". */
export async function GET(request: Request) {
  const origin = originOf(request);
  if (!authConfigured()) {
    return Response.redirect(`${origin}/studio?auth_error=${encodeURIComponent("Roblox sign-in isn't set up on this server yet.")}`);
  }
  const back = new URL(request.url).searchParams.get("returnTo") ?? "/studio";
  const returnTo = back.startsWith("/") && !back.startsWith("//") ? back : "/studio";
  const url = await startFlow(`${origin}/api/auth/roblox/callback`, returnTo);
  return Response.redirect(url);
}
