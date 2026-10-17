"use client";

import { useEffect, useState } from "react";
import { AccountShell, PROVIDER_INFO, useMe, useQuery, type ProviderId } from "./shared";

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

/** Account and billing. lava.top sends people back here (?status=success|failed|cancelled). */
export default function AccountPage() {
  const { me, loaded, refresh } = useMe();
  const status = useQuery("status");
  const [waiting, setWaiting] = useState(status === "success");
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The webhook can land a few seconds after the redirect: refresh until the change shows.
  useEffect(() => {
    if (status !== "success") return;
    let n = 0;
    const id = setInterval(() => {
      n++;
      void refresh();
      if (n >= 20) {
        clearInterval(id);
        setWaiting(false);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [status, refresh]);

  if (loaded && !me?.user) {
    if (typeof window !== "undefined") window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return <AccountShell>{null}</AccountShell>;
  }
  if (!me?.user) return <AccountShell>{null}</AccountShell>;

  const acct = me.account;
  const linked = new Set(acct?.linked ?? []);
  const available = (me.providers ?? []) as ProviderId[];

  const cancel = async () => {
    if (!window.confirm("Cancel renewal? You keep your plan until the end of the period you paid for.")) return;
    setCancelling(true);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(res.ok ? "Renewal cancelled. Your plan stays on until the period ends." : (data.error ?? "Couldn't cancel."));
    setCancelling(false);
    void refresh();
  };

  return (
    <AccountShell>
      {status === "success" && (
        <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">
          Payment received, thank you!{" "}
          {waiting ? "Confirming it with lava.top…" : "If it doesn't show yet, refresh in a minute."}
        </div>
      )}
      {(status === "failed" || status === "cancelled") && (
        <div className="mb-5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
          {status === "failed" ? "The payment didn't go through. You weren't charged." : "Checkout was cancelled."}{" "}
          <a href="/pricing" className="underline">
            Try again
          </a>
        </div>
      )}
      {message && <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75">{message}</div>}

      <div className="flex items-center gap-4">
        {me.user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.user.picture} alt="" className="size-14 rounded-full bg-white/10" />
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-white/10 text-xl font-semibold">{me.user.displayName.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{me.user.displayName}</p>
          <p className="truncate text-sm text-white/45">{acct?.email ?? `@${me.user.username}`}</p>
        </div>
      </div>

      {/* Plan */}
      <section className="mt-8 rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-white/40 uppercase">Plan</p>
        {acct?.pro ? (
          <>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide text-white ${acct.tier === "studio" ? "bg-violet-500" : "bg-blox"}`}>
                {acct.tier === "studio" ? "STUDIO" : "PRO"}
              </span>
              {me.daily.toLocaleString()} bits every day
            </p>
            <p className="mt-1 text-sm text-white/50">
              {acct.cancelled ? `Ends on ${date(acct.proUntil!)}. It won't renew.` : `Renews around ${date(acct.proUntil!)}.`}
            </p>
            {!acct.cancelled && (
              <button type="button" onClick={() => void cancel()} disabled={cancelling} className="mt-4 rounded-xl border border-white/10 px-3.5 py-2 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-50">
                {cancelling ? "Cancelling…" : "Cancel renewal"}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-lg font-semibold">Free · {me.daily.toLocaleString()} bits every day</p>
            <a href="/pricing" className="mt-4 inline-flex rounded-xl bg-blox px-4 py-2 text-sm font-semibold text-white hover:bg-blox/90">
              See plans
            </a>
          </>
        )}
        {me.bitsEnabled && (
          <p className="mt-5 border-t border-white/[0.07] pt-4 text-sm text-white/60">
            Balance: <span className="font-semibold text-amber-200">⚡ {(me.bits ?? 0).toLocaleString()} bits</span>
            <a href="/pricing" className="ml-3 text-blox-soft hover:underline">
              Buy more
            </a>
          </p>
        )}
      </section>

      {/* Sign-in methods */}
      <section className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-white/40 uppercase">Sign-in methods</p>
        <ul className="mt-3 grid gap-2 text-sm">
          <li className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5">
            <span>Email + password</span>
            <span className="text-white/45">{acct?.hasPassword ? "On" : "Not set"}</span>
          </li>
          {available.map((p) => (
            <li key={p} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5">
              <span className="flex items-center gap-2.5">
                {PROVIDER_INFO[p].icon}
                {PROVIDER_INFO[p].label}
              </span>
              {linked.has(p) ? (
                <span className="text-emerald-300/80">Linked</span>
              ) : (
                <a href={`/api/auth/${p}/login?returnTo=/account`} className="text-blox-soft hover:underline">
                  Link
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          // A full reload on purpose: every part of the app re-reads the (now empty) session.
          window.location.assign(window.location.origin + "/");
        }}
        className="mt-6 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white"
      >
        Log out
      </button>
    </AccountShell>
  );
}
