"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { AccountShell, safePath } from "./shared";
import { finishSupabaseLogin } from "./supabaseLogin";

/**
 * Supabase sends people here after Google / Discord, an email confirmation or a password
 * reset link. The code in the URL becomes a Supabase session, then a Bloxy session.
 */
export default function AuthCallbackPage({ mode }: { mode: "callback" | "reset" }) {
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const returnTo = safePath(params.get("returnTo"));
    const problem = params.get("error_description") ?? hash.get("error_description");
    let alive = true;
    void (async () => {
      if (problem) return setError(problem);
      try {
        const sb = supabaseBrowser();
        // The client exchanges the code by itself on load; do it here too if it hasn't yet.
        let { data } = await sb.auth.getSession();
        const code = params.get("code");
        if (!data.session && code) {
          const r = await sb.auth.exchangeCodeForSession(code);
          if (r.error) throw r.error;
          data = { session: r.data.session };
        }
        if (!data.session) throw new Error("This link has expired. Please log in again.");
        if (mode === "reset") {
          if (alive) setNeedsPassword(true);
          return;
        }
        await finishSupabaseLogin();
        window.location.replace(returnTo);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode]);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabaseBrowser().auth.updateUser({ password });
      if (err) throw err;
      await finishSupabaseLogin();
      window.location.replace("/studio");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AccountShell>
      <div className="rounded-[1.6rem] border border-white/10 bg-[#12141a]/90 p-7 text-center">
        {error ? (
          <>
            <p className="text-lg font-semibold">Couldn&apos;t finish logging in</p>
            <p className="mt-2 text-sm text-red-200/90">{error}</p>
            <a href="/login" className="mt-6 inline-flex rounded-full bg-blox px-5 py-2 text-sm font-medium text-white">
              Back to log in
            </a>
          </>
        ) : needsPassword ? (
          <form onSubmit={(e) => void savePassword(e)} className="grid gap-3 text-left">
            <p className="text-center text-lg font-semibold">Choose a new password</p>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-blox/60"
            />
            <button type="submit" disabled={busy} className="rounded-xl bg-blox py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save and log in"}
            </button>
          </form>
        ) : (
          <>
            <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-blox/30 border-t-blox" />
            <p className="mt-4 text-sm text-white/60">Logging you in…</p>
          </>
        )}
      </div>
    </AccountShell>
  );
}
