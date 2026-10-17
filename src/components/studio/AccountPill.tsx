"use client";

import { useState } from "react";
import type { Account } from "./useAccount";

function Bolt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </svg>
  );
}

/** Header pill: "Log in", or avatar + bits with a small account menu. */
export default function AccountPill({
  account,
  onSignOut,
  onChanged,
}: {
  account: Account | null;
  onSignOut: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The OAuth callback reports problems as ?auth_error=… (read once, before the URL is cleaned).
  const [authError, setAuthError] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get("auth_error");
    } catch {
      return null;
    }
  });
  const [grantId, setGrantId] = useState("");
  const [grantAmount, setGrantAmount] = useState("500");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  if (!account || (!account.bitsEnabled && !account.signInEnabled)) return null;
  const { user } = account;
  const pro = !!account.account?.pro;
  const tierName = account.account?.tier === "studio" ? "Studio" : "Pro";

  const errorBubble = authError && (
    <div className="absolute top-full right-0 z-40 mt-2 w-64 rounded-xl border border-red-400/25 bg-[#1a1215]/95 px-3 py-2 text-xs leading-relaxed text-red-200 shadow-xl">
      {authError}
      <button onClick={() => setAuthError(null)} className="ml-2 text-red-300/70 underline">
        Dismiss
      </button>
    </div>
  );

  if (!user) {
    if (!account.signInEnabled) return null;
    return (
      <span className="relative">
        <a
          href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-[#111318]/85 py-1.5 pr-3.5 pl-2 text-sm text-white/85 backdrop-blur-xl transition-colors hover:bg-[#1b1e26]"
        >
          <span className="grid size-6 place-items-center rounded-full bg-blox/20 text-blox-soft">
            <Bolt className="size-3.5" />
          </span>
          <span>Log in</span>
        </a>
        {errorBubble}
      </span>
    );
  }

  const grant = async () => {
    setGrantMsg(null);
    const res = await fetch("/api/bits/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: grantId.trim(), amount: Number(grantAmount) }),
    });
    const data = (await res.json().catch(() => ({}))) as { balance?: number; error?: string };
    setGrantMsg(res.ok ? `Done. User ${grantId} now has ${data.balance?.toLocaleString()} bits.` : (data.error ?? "Failed"));
    if (res.ok) onChanged();
  };

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-[#111318]/85 py-1 pr-3 pl-1 text-sm backdrop-blur-xl transition-colors hover:bg-[#1b1e26]"
        title={`${user.displayName} (@${user.username})`}
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="size-7 rounded-full bg-white/10" />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs font-semibold">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        {pro && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tierName === "Studio" ? "bg-violet-500/25 text-violet-200" : "bg-blox/25 text-blox-soft"}`}>
            {tierName.toUpperCase()}
          </span>
        )}
        {account.bitsEnabled && (
          <span className="flex items-center gap-1 font-medium text-amber-200">
            <Bolt className="size-3.5" />
            <span className="tabular-nums">{(account.bits ?? 0).toLocaleString()}</span>
          </span>
        )}
      </button>
      {errorBubble}
      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-72 rounded-2xl border border-white/10 bg-[#111318]/95 p-3 shadow-2xl backdrop-blur-xl">
          <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
          <p className="truncate text-xs text-white/40">{account.account?.email ?? `@${user.username}`}</p>
          <div className="mt-3 flex gap-1.5">
            <a href="/account" className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-center text-xs text-white/80 hover:bg-white/[0.1]">
              Account
            </a>
            <a
              href="/pricing"
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium ${pro ? "bg-white/[0.06] text-white/80 hover:bg-white/[0.1]" : "bg-blox text-white hover:bg-blox/90"}`}
            >
              {pro ? "Buy bits" : "Get Pro"}
            </a>
          </div>
          {account.bitsEnabled && (
          <div className="mt-3 rounded-xl bg-white/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-lg font-semibold text-amber-200">
              <Bolt className="size-4" />
              <span className="tabular-nums">{(account.bits ?? 0).toLocaleString()}</span>
              <span className="text-xs font-normal text-white/45">bits</span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              Tops up to {account.daily.toLocaleString()} {pro ? tierName : "free"} bits every day. Each request costs what the
              AI model really costs.
            </p>
          </div>
          )}
          {account.admin && (
            <div className="mt-3 border-t border-white/[0.07] pt-3">
              <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">Admin · grant bits</p>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={grantId}
                  onChange={(e) => setGrantId(e.target.value)}
                  placeholder="Account id, Roblox id or email"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs outline-none focus:border-blox/50"
                />
                <input
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-right font-mono text-xs outline-none focus:border-blox/50"
                />
              </div>
              <button
                onClick={() => void grant()}
                disabled={!grantId.trim() || !Number(grantAmount)}
                className="mt-2 w-full rounded-lg bg-blox py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Grant
              </button>
              {grantMsg && <p className="mt-1.5 text-[11px] text-white/55">{grantMsg}</p>}
            </div>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="mt-3 w-full rounded-lg border border-white/10 py-1.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </span>
  );
}
