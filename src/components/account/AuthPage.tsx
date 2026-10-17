"use client";

import { useState } from "react";
import { supabaseBrowser, supabaseEnabled, supabaseProviders } from "@/lib/supabase";
import { AccountShell, PROVIDER_INFO, safePath, useMe, useQuery, type ProviderId } from "./shared";
import { callbackUrl, finishSupabaseLogin } from "./supabaseLogin";

/**
 * Log in or sign up. With Supabase set up, email + password, Google and Discord go through
 * Supabase; Roblox always uses Bloxy's own login. Without Supabase, Bloxy's own routes do it all.
 */
export default function AuthPage() {
  const returnTo = safePath(useQuery("returnTo"));
  const [mode, setMode] = useState<"login" | "signup">(useQuery("mode") === "signup" ? "signup" : "login");
  const [error, setError] = useState<string | null>(useQuery("error"));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { me, loaded } = useMe();
  const sbOn = supabaseEnabled();
  // Supabase brings Google/Discord; Roblox (and everything, without Supabase) is Bloxy's own.
  const bloxyProviders = ((me?.providers ?? []) as ProviderId[]).filter((p) => !sbOn || p === "roblox");
  const buttons: { id: ProviderId; via: "supabase" | "bloxy" }[] = [
    ...(sbOn ? supabaseProviders().map((id) => ({ id: id as ProviderId, via: "supabase" as const })) : []),
    ...bloxyProviders.map((id) => ({ id, via: "bloxy" as const })),
  ];

  const fail = (err: unknown) => {
    setError((err as Error)?.message ?? "Something went wrong.");
    setBusy(false);
  };

  const oauth = async (id: ProviderId, via: "supabase" | "bloxy") => {
    if (via === "bloxy") {
      // A full page load: the server route redirects on to the provider.
      window.location.assign(`${window.location.origin}/api/auth/${id}/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.signInWithOAuth({
      provider: id as "google" | "discord",
      options: { redirectTo: callbackUrl(returnTo) },
    });
    if (err) fail(err);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (sbOn) {
        const sb = supabaseBrowser();
        if (mode === "login") {
          const { error: err } = await sb.auth.signInWithPassword({ email, password });
          if (err) throw new Error(err.message === "Invalid login credentials" ? "Wrong email or password." : err.message);
        } else {
          const { data, error: err } = await sb.auth.signUp({
            email,
            password,
            options: { data: { full_name: name || undefined }, emailRedirectTo: callbackUrl(returnTo) },
          });
          if (err) throw err;
          if (!data.session) {
            // Supabase is set to confirm emails first.
            setNotice(`Almost there: we sent a link to ${email}. Open it to finish signing up.`);
            setBusy(false);
            return;
          }
        }
        await finishSupabaseLogin();
      } else {
        const res = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "login" ? { email, password } : { email, password, name }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      }
      window.location.assign(returnTo);
    } catch (err) {
      fail(err);
    }
  };

  const forgot = async () => {
    if (!email) return setError("Type your email first, then press Forgot password.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset` });
    setBusy(false);
    if (err) return setError(err.message);
    setNotice(`If ${email} has an account, a reset link is on its way.`);
  };

  if (loaded && me?.user) {
    return (
      <AccountShell>
        <div className="rounded-[1.6rem] border border-white/10 bg-[#12141a]/90 p-7 text-center">
          <p className="text-sm text-white/50">You&apos;re logged in as</p>
          <p className="mt-1 text-lg font-semibold">{me.user.displayName}</p>
          <a href={returnTo} className="mt-6 inline-flex rounded-full bg-blox px-5 py-2 text-sm font-medium text-white">
            Continue
          </a>
          <a href="/account" className="mt-3 block text-xs text-white/45 hover:text-white">
            Account settings
          </a>
        </div>
      </AccountShell>
    );
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-blox/60";

  return (
    <AccountShell>
      <h1 className="text-center font-display text-3xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-center text-sm text-white/45">{mode === "login" ? "Log in to use your bits and plan." : "Free bits every day. No card needed."}</p>

      <div className="mt-8 rounded-[1.6rem] border border-white/10 bg-[#12141a]/90 p-6 shadow-[0_30px_80px_-40px_rgba(47,125,255,0.5)]">
        {buttons.length > 0 && (
          <>
            <div className="grid gap-2">
              {buttons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void oauth(b.id, b.via)}
                  className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {PROVIDER_INFO[b.id].icon}
                  Continue with {PROVIDER_INFO[b.id].label}
                </button>
              ))}
            </div>
            <div className="my-5 flex items-center gap-3 text-[11px] tracking-[0.18em] text-white/30 uppercase">
              <span className="h-px flex-1 bg-white/10" />
              or with email
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={(e) => void submit(e)} className="grid gap-3">
          {mode === "signup" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" autoComplete="name" maxLength={40} className={field} />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Email" autoComplete="email" className={field} />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={mode === "signup" ? 8 : 1}
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={field}
          />
          {mode === "login" && sbOn && (
            <button type="button" onClick={() => void forgot()} className="-mt-1 justify-self-end text-xs text-white/45 hover:text-white">
              Forgot password?
            </button>
          )}
          {error && <p className="rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-xs leading-relaxed text-red-200">{error}</p>}
          {notice && <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-2 text-xs leading-relaxed text-emerald-100">{notice}</p>}
          <button
            type="submit"
            disabled={busy || (loaded && !me?.signInEnabled)}
            className="mt-1 rounded-xl bg-blox py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blox/90 disabled:opacity-50"
          >
            {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
          </button>
          {loaded && !me?.signInEnabled && <p className="text-center text-xs text-amber-200/80">Accounts aren&apos;t set up on this server yet.</p>}
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-white/50">
        {mode === "login" ? "New to Bloxy? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-blox-soft hover:underline"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </AccountShell>
  );
}
