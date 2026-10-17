"use client";

import { supabaseBrowser } from "@/lib/supabase";

/** Hands the current Supabase login to Bloxy, which starts its own session. */
export async function finishSupabaseLogin() {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No login found. Please try again.");
  const res = await fetch("/api/auth/supabase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: token }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn't log in.");
}

/** Where Supabase sends people back to after OAuth or an email link. */
export function callbackUrl(returnTo: string) {
  return `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Ends the Supabase login too when someone logs out of Bloxy. */
export async function supabaseSignOut() {
  try {
    await supabaseBrowser().auth.signOut();
  } catch {}
}
