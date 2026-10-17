"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountShell, useMe } from "./shared";

type Currency = "USD" | "EUR" | "RUB";
type Price = { amount: number; currency: Currency; periodicity: string | null };
type ItemId = "pro" | "bits_small" | "bits_large";
type Catalog = {
  configured: boolean;
  items: { id: ItemId; label: string; subscription: boolean; bits?: number; onSale: boolean }[];
  prices: Partial<Record<ItemId, Price[]>>;
  daily: number;
  dailyPro: number;
  error: string | null;
};

/** A sensible default currency from the visitor's language and time zone. */
function guessCurrency(): Currency {
  const lang = navigator.language.toLowerCase();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  if (lang.startsWith("ru") || /Moscow|Minsk|Almaty|Yekaterinburg|Novosibirsk/.test(tz)) return "RUB";
  if (tz.startsWith("Europe/")) return "EUR";
  return "USD";
}

const money = (amount: number, currency: Currency) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

const PERIODS = [
  { id: "MONTHLY", label: "Monthly", per: "/ month" },
  { id: "PERIOD_YEAR", label: "Yearly", per: "/ year" },
] as const;

export default function PricingPage() {
  const { me, loaded } = useMe();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [currency, setCurrency] = useState<Currency>(guessCurrency);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("MONTHLY");
  const [busy, setBusy] = useState<ItemId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askEmail, setAskEmail] = useState<ItemId | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    void fetch("/api/billing/prices", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Catalog) => setCatalog(d))
      .catch(() => setError("Couldn't load prices."));
  }, []);

  const priceOf = (item: ItemId, periodicity?: string) =>
    catalog?.prices[item]?.find((p) => p.currency === currency && (!periodicity || !p.periodicity || p.periodicity === periodicity)) ?? null;
  const hasYearly = !!catalog?.prices.pro?.some((p) => p.periodicity === "PERIOD_YEAR");
  const pro = !!me?.account?.pro;

  const buy = async (item: ItemId, withEmail?: string) => {
    if (!me?.user) {
      router.push(`/login?mode=signup&returnTo=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(item);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, currency, ...(item === "pro" ? { periodicity: period } : {}), ...(withEmail ? { email: withEmail } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { paymentUrl?: string; error?: string; code?: string };
      if (data.code === "need_email") {
        setAskEmail(item);
        setBusy(null);
        return;
      }
      if (!res.ok || !data.paymentUrl) throw new Error(data.error ?? "Checkout failed.");
      window.location.href = data.paymentUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const onSale = (item: ItemId) => !!catalog?.configured && !!catalog.items.find((i) => i.id === item)?.onSale && !!priceOf(item, item === "pro" ? period : undefined);
  const bitsOf = (item: ItemId) => catalog?.items.find((i) => i.id === item)?.bits ?? 0;
  const proPrice = priceOf("pro", period);

  return (
    <AccountShell wide>
      <div className="text-center">
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.95] font-bold tracking-[-0.03em]">Build more with Pro</h1>
        <p className="mx-auto mt-4 max-w-lg text-white/50">
          Start free with daily bits. Go Pro for {catalog ? catalog.dailyPro.toLocaleString() : "5,000"} bits every day, or top up with a bit pack whenever you need.
        </p>
        <div className="mt-7 inline-flex flex-wrap items-center justify-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
            {(["USD", "EUR", "RUB"] as Currency[]).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={`rounded-full px-3.5 py-1 ${currency === c ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}>
                {c}
              </button>
            ))}
          </div>
          {hasYearly && (
            <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={`rounded-full px-3.5 py-1 ${period === p.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(error || catalog?.error) && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl border border-red-400/25 bg-red-500/[0.08] px-4 py-2.5 text-center text-sm text-red-200">{error ?? catalog?.error}</p>
      )}
      {catalog && !catalog.configured && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-center text-sm text-amber-100/80">
          Payments are coming soon. Everything free works today.
        </p>
      )}

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-[1.8rem] border border-white/10 bg-white/[0.025] p-7">
          <p className="text-sm font-medium text-white/60">Free</p>
          <p className="mt-2 font-display text-4xl font-bold">{money(0, currency)}</p>
          <ul className="mt-6 grid gap-2.5 text-sm text-white/65">
            <li>✓ {catalog ? catalog.daily.toLocaleString() : "300"} bits every day</li>
            <li>✓ Every AI model, Studio plugin and chat</li>
            <li>✓ Free models cost nothing at all</li>
            <li>✓ 3D: parts, Blender sculpting, open-source 3D AI</li>
          </ul>
          <a href={me?.user ? "/studio" : "/login?mode=signup"} className="mt-auto pt-8">
            <span className="block rounded-xl border border-white/15 py-2.5 text-center text-sm font-medium text-white/85 hover:bg-white/[0.06]">
              {me?.user ? "Open Studio" : "Start free"}
            </span>
          </a>
        </div>

        {/* Pro */}
        <div className="relative flex flex-col overflow-hidden rounded-[1.8rem] border border-blox/40 bg-gradient-to-b from-blox/[0.14] to-white/[0.02] p-7 shadow-[0_40px_100px_-50px_rgba(47,125,255,0.8)]">
          <span className="absolute top-6 right-6 rounded-full bg-blox px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white uppercase">Best value</span>
          <p className="text-sm font-medium text-blox-soft">Pro</p>
          <p className="mt-2 font-display text-4xl font-bold">
            {proPrice ? money(proPrice.amount, currency) : "—"}
            <span className="ml-1 text-base font-normal text-white/45">{PERIODS.find((p) => p.id === period)?.per}</span>
          </p>
          <ul className="mt-6 grid gap-2.5 text-sm text-white/80">
            <li>✓ {catalog ? catalog.dailyPro.toLocaleString() : "5,000"} bits every day</li>
            <li>✓ Room for top models like Claude and GPT every day</li>
            <li>✓ Bits top up the moment you subscribe</li>
            <li>✓ Cancel anytime; Pro stays until the period ends</li>
          </ul>
          <div className="mt-auto pt-8">
            {pro ? (
              <a href="/account" className="block rounded-xl border border-blox/40 py-2.5 text-center text-sm font-medium text-blox-soft">
                You&apos;re Pro · Manage
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void buy("pro")}
                disabled={!onSale("pro") || busy !== null || !loaded}
                className="w-full rounded-xl bg-blox py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blox/90 disabled:opacity-50"
              >
                {busy === "pro" ? "Opening checkout…" : "Get Pro"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bit packs */}
      <h2 className="mt-16 text-center font-display text-2xl font-bold tracking-tight">Bit packs</h2>
      <p className="mt-2 text-center text-sm text-white/45">One-time top-ups. They never expire and stack with your daily bits.</p>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        {(["bits_small", "bits_large"] as ItemId[]).map((id) => {
          const price = priceOf(id);
          return (
            <div key={id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div>
                <p className="text-lg font-semibold text-amber-200">⚡ {bitsOf(id).toLocaleString()} bits</p>
                <p className="mt-0.5 text-sm text-white/45">{price ? money(price.amount, currency) : "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => void buy(id)}
                disabled={!onSale(id) || busy !== null || !loaded}
                className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.14] disabled:opacity-40"
              >
                {busy === id ? "Opening…" : "Buy"}
              </button>
            </div>
          );
        })}
      </div>

      {askEmail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setAskEmail(null)}>
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const item = askEmail;
              setAskEmail(null);
              void buy(item, email);
            }}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#14161c] p-6"
          >
            <p className="font-semibold">Where should we send the receipt?</p>
            <p className="mt-1 text-sm text-white/45">lava.top needs an email for your payment.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" autoFocus className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-blox/60" />
            <button type="submit" className="mt-4 w-full rounded-xl bg-blox py-2.5 text-sm font-semibold text-white">
              Continue to payment
            </button>
          </form>
        </div>
      )}

      <p className="mt-14 text-center text-xs text-white/35">Payments are processed by lava.top.</p>
    </AccountShell>
  );
}
