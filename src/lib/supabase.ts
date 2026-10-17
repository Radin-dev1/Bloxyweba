import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase handles login (email + password, Google). Bloxy turns a Supabase login
 * into its own session (`/api/auth/supabase`), so accounts, bits, plans and Roblox linking
 * work the same however someone signs in.
 *
 * Env (both are public, safe in the browser):
 *   NEXT_PUBLIC_SUPABASE_URL        https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   the anon / publishable key
 *   NEXT_PUBLIC_SUPABASE_PROVIDERS  OAuth buttons to show, default "google"
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseEnabled() {
  return !!URL_ && !!ANON;
}

export type SupabaseOAuth = "google";

export function supabaseProviders(): SupabaseOAuth[] {
  if (!supabaseEnabled()) return [];
  return (process.env.NEXT_PUBLIC_SUPABASE_PROVIDERS ?? "google")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SupabaseOAuth => s === "google");
}

let browserClient: SupabaseClient | null = null;

/** The browser client (PKCE: OAuth and email links come back with a code we exchange). */
export function supabaseBrowser() {
  browserClient ??= createClient(URL_, ANON, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return browserClient;
}

/** Server-side: checks a Supabase access token and returns its user (null if invalid). */
export async function supabaseUserFromToken(accessToken: string) {
  if (!supabaseEnabled()) return null;
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  return error ? null : data.user;
}
