import { timingSafeEqual } from "crypto";
import { getAccount, saveAccount, type Account } from "@/lib/accounts";
import type { Tier } from "@/lib/accounts";
import { grant, PLAN_BITS_PER_USD } from "@/lib/bits";
import { kv } from "@/lib/kv";

/**
 * Payments with lava.top (https://gate.lava.top/docs). You create the products on lava.top,
 * Bloxy creates a checkout (invoice) per purchase and lava.top calls the webhook when money
 * moves: a bit pack adds bits, Pro turns on and renews, a cancelled Pro runs to its end date.
 *
 * Env:
 *   LAVA_API_KEY            API key from lava.top (Settings -> API), used as X-Api-Key
 *   LAVA_WEBHOOK_SECRET     A long random string; enter it in lava.top's webhook settings as the
 *                           API key lava.top sends to <site>/api/billing/webhook
 *   LAVA_OFFER_PRO          Offer id (or product id) of the Pro subscription
 *   LAVA_OFFER_STUDIO       Offer id (or product id) of the Studio subscription
 *   LAVA_OFFER_BITS_SMALL   Offer id of the small bit pack (LAVA_BITS_SMALL bits, default 5,000)
 *   LAVA_OFFER_BITS_LARGE   Offer id of the large bit pack (LAVA_BITS_LARGE bits, default 25,000)
 */

// LAVA_BASE_URL only for testing against a stand-in server.
const GATE = (process.env.LAVA_BASE_URL || "https://gate.lava.top").replace(/\/+$/, "");
const P = "bloxy:bill:";

export type Currency = "USD" | "EUR" | "RUB";
export type Periodicity = "MONTHLY" | "PERIOD_90_DAYS" | "PERIOD_180_DAYS" | "PERIOD_YEAR";
export type ItemId = "pro" | "studio" | "bits_small" | "bits_large";

export const CURRENCIES: Currency[] = ["USD", "EUR", "RUB"];

/**
 * What's for sale. `offer` is the built-in lava.top offer id (offer ids aren't secret); the env
 * var overrides it. Pro and Studio are two prices of one lava.top product
 * (dc0936b6-7d8a-44b0-b529-6f11867e5fd2), so they must be set by offer id, not product id.
 */
export const ITEMS: Record<ItemId, { env: string; offer?: string; label: string; subscription: boolean; bits?: number }> = {
  pro: { env: "LAVA_OFFER_PRO", offer: "3e9cb634-82fe-49ba-ad5b-9fbe2b5abc22", label: "Bloxy Pro", subscription: true },
  studio: { env: "LAVA_OFFER_STUDIO", offer: "c3fba64d-6d08-4dc8-aaa4-bdc4e4765319", label: "Bloxy Studio", subscription: true },
  bits_small: { env: "LAVA_OFFER_BITS_SMALL", label: "Bit pack", subscription: false, bits: Number(process.env.LAVA_BITS_SMALL) || 5000 },
  bits_large: { env: "LAVA_OFFER_BITS_LARGE", label: "Big bit pack", subscription: false, bits: Number(process.env.LAVA_BITS_LARGE) || 25000 },
};

const PERIOD_DAYS: Record<Periodicity, number> = { MONTHLY: 31, PERIOD_90_DAYS: 91, PERIOD_180_DAYS: 182, PERIOD_YEAR: 366 };

/** What's configured for an item: an offer id, or a product id (resolved via the catalog). */
export function offerOf(item: ItemId) {
  return process.env[ITEMS[item].env]?.trim() || ITEMS[item].offer || null;
}

export function billingConfigured() {
  return !!process.env.LAVA_API_KEY && (Object.keys(ITEMS) as ItemId[]).some((i) => offerOf(i));
}

async function lava<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GATE}${path}`, {
    ...init,
    headers: { "X-Api-Key": process.env.LAVA_API_KEY!, "Content-Type": "application/json", Accept: "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.error || body?.message || `lava.top returned ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

// ── Catalog: your lava.top products, offers and prices (cached 10 minutes) ──

export type Price = { amount: number; currency: Currency; periodicity: string | null };
type Offer = { id: string; prices?: { amount: number | null; currency: Currency; periodicity?: string | null }[] };
let catalogCache: { at: number; offers: Map<string, Offer>; products: Map<string, Offer[]> } | null = null;

async function catalog() {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache;
  const offers = new Map<string, Offer>();
  const products = new Map<string, Offer[]>();
  let url: string | null = "/api/v2/products?showAllSubscriptionPeriods=true";
  for (let page = 0; url && page < 10; page++) {
    const data: { items?: { data?: { id?: string; offers?: Offer[] | null } }[]; nextPage?: string | null } = await lava(url);
    for (const item of data.items ?? []) {
      const list = item.data?.offers ?? [];
      if (item.data?.id) products.set(item.data.id, list);
      for (const o of list) offers.set(o.id, o);
    }
    url = data.nextPage ? data.nextPage.replace(GATE, "") : null;
  }
  catalogCache = { at: Date.now(), offers, products };
  return catalogCache;
}

/**
 * The offer to sell for an item. The env var may hold the offer id or, since lava.top's links
 * show both, the product id; a product id means its first offer.
 */
async function resolveOffer(item: ItemId): Promise<Offer | null> {
  const id = offerOf(item);
  if (!id) return null;
  const c = await catalog();
  return c.offers.get(id) ?? c.products.get(id)?.[0] ?? null;
}

export async function prices(): Promise<Partial<Record<ItemId, Price[]>>> {
  const out: Partial<Record<ItemId, Price[]>> = {};
  for (const item of Object.keys(ITEMS) as ItemId[]) {
    const offer = await resolveOffer(item);
    if (offer) {
      out[item] = (offer.prices ?? [])
        .filter((p) => p.amount !== null)
        .map((p) => ({ amount: Number(p.amount), currency: p.currency, periodicity: p.periodicity ?? null }));
    }
  }
  return out;
}

// ── Checkout ──

type Contract = { accountId: string; item: ItemId; periodicity?: Periodicity; email: string; createdAt: number };

export async function createCheckout(
  account: Account,
  item: ItemId,
  { email, currency, periodicity, returnUrl }: { email: string; currency: Currency; periodicity?: Periodicity; returnUrl: string },
) {
  // A configured id that isn't in the catalog is still tried as an offer id (lava.top decides).
  const offerId = (await resolveOffer(item).catch(() => null))?.id ?? offerOf(item);
  if (!offerId) throw new Error(`${ITEMS[item].label} isn't on sale yet.`);
  const sub = ITEMS[item].subscription;
  const invoice = await lava<{ id: string; paymentUrl?: string | null }>("/api/v3/invoice", {
    method: "POST",
    body: JSON.stringify({
      email,
      offerId,
      currency,
      ...(sub ? { periodicity: periodicity ?? "MONTHLY" } : {}),
      buyerLanguage: currency === "RUB" ? "RU" : "EN",
      successful_return_url: `${returnUrl}?status=success&item=${item}`,
      failure_return_url: `${returnUrl}?status=failed&item=${item}`,
      cancel_return_url: `${returnUrl}?status=cancelled&item=${item}`,
    }),
  });
  if (!invoice.paymentUrl) throw new Error("lava.top didn't return a payment link.");
  // Remember who this contract belongs to: the webhook only carries the contract id and email.
  await kv().set(`${P}contract:${invoice.id}`, { accountId: account.id, item, periodicity: sub ? (periodicity ?? "MONTHLY") : undefined, email, createdAt: Date.now() } satisfies Contract, {
    ttlS: 400 * 86_400,
  });
  return invoice.paymentUrl;
}

/** Fallback plan bits when no USD price is known (per month). */
const PLAN_FALLBACK_BITS: Record<string, number> = {
  pro: Number(process.env.PLAN_BITS_PRO) || 20_000,
  studio: Number(process.env.PLAN_BITS_STUDIO) || 60_000,
};
const MONTHS: Record<Periodicity, number> = { MONTHLY: 1, PERIOD_90_DAYS: 3, PERIOD_180_DAYS: 6, PERIOD_YEAR: 12 };

/**
 * Bits for one subscription payment: the plan's USD price for that period x PLAN_BITS_PER_USD
 * (so RUB and EUR buyers get the same bits as USD buyers). Falls back to the paid amount when it
 * was in USD, then to PLAN_BITS_PRO / PLAN_BITS_STUDIO per month.
 */
export async function planCredits(item: ItemId, periodicity: Periodicity, e?: { amount?: number; currency?: string }) {
  const usd = (await prices().catch(() => ({}) as Partial<Record<ItemId, Price[]>>))[item]?.find(
    (p) => p.currency === "USD" && (!p.periodicity || p.periodicity === periodicity),
  )?.amount;
  if (usd) return Math.round(usd * PLAN_BITS_PER_USD);
  if (e?.currency === "USD" && e.amount) return Math.round(e.amount * PLAN_BITS_PER_USD);
  return (PLAN_FALLBACK_BITS[item] ?? 0) * MONTHS[periodicity];
}

export async function cancelSubscription(account: Account) {
  const plan = account.plan;
  if (!plan?.subscriptionId || !plan.subscriptionEmail) throw new Error("No active subscription to cancel.");
  await lava(`/api/v1/subscriptions?contractId=${encodeURIComponent(plan.subscriptionId)}&email=${encodeURIComponent(plan.subscriptionEmail)}`, {
    method: "DELETE",
  });
  // The webhook (subscription.cancelled) confirms it; mark it now so the page updates right away.
  plan.cancelled = true;
  await saveAccount(account);
}

// ── Webhook ──

/** lava.top sends the key you set for the webhook in X-Api-Key (or as Basic auth). */
export function webhookAuthorized(request: Request) {
  const want = process.env.LAVA_WEBHOOK_SECRET;
  if (!want) return false;
  const same = (got: string | null | undefined) => {
    if (!got) return false;
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if (same(request.headers.get("x-api-key"))) return true;
  const basic = request.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [, pass] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    return same(pass);
  }
  return false;
}

export type WebhookEvent = {
  eventType?: string;
  contractId?: string;
  parentContractId?: string | null;
  buyer?: { email?: string };
  status?: string;
  willExpireAt?: string;
  amount?: number;
  currency?: string;
};

/** Applies one webhook. Returns a short note for the log. Safe to receive twice. */
export async function handleWebhook(e: WebhookEvent): Promise<string> {
  const type = e.eventType ?? "";
  if (!e.contractId) return `ignored ${type || "event"} without contractId`;
  // Each (contract, event) is applied once, even if lava.top retries.
  const eventKey = `${P}event:${e.contractId}:${type}`;
  if (!(await kv().set(eventKey, Date.now(), { nx: true, ttlS: 400 * 86_400 }))) return "duplicate";
  try {
    return await applyWebhook(e, type);
  } catch (err) {
    await kv().del(eventKey); // let lava.top's retry apply it
    throw err;
  }
}

async function applyWebhook(e: WebhookEvent, type: string): Promise<string> {
  const contract = await kv().get<Contract>(`${P}contract:${e.parentContractId || e.contractId}`);
  if (!contract) return `unknown contract ${e.contractId}`;
  const account = await getAccount(contract.accountId);
  if (!account) return `unknown account ${contract.accountId}`;
  const item = ITEMS[contract.item];

  if (type === "payment.success" || type === "subscription.recurring.payment.success") {
    if (item.subscription) {
      const tier = contract.item as Tier;
      const days = PERIOD_DAYS[contract.periodicity ?? "MONTHLY"];
      const subscriptionId = e.parentContractId || e.contractId!;
      const previous = account.plan;
      // A late renewal of a subscription they already switched away from doesn't change the plan.
      if (type === "subscription.recurring.payment.success" && previous?.subscriptionId && previous.subscriptionId !== subscriptionId) {
        return `renewal of a replaced subscription ignored for ${account.id}`;
      }
      // Switching plans (Pro <-> Studio): stop the old subscription so nobody pays twice.
      if (previous?.subscriptionId && previous.subscriptionId !== subscriptionId && !previous.cancelled && previous.subscriptionEmail) {
        await lava(`/api/v1/subscriptions?contractId=${encodeURIComponent(previous.subscriptionId)}&email=${encodeURIComponent(previous.subscriptionEmail)}`, {
          method: "DELETE",
        }).catch((err) => console.error("[bloxy] couldn't cancel the previous subscription", err));
      }
      const sameSub = previous?.subscriptionId === subscriptionId;
      const from = sameSub ? Math.max(Date.now(), previous?.proUntil ?? 0) : Date.now();
      account.plan = {
        tier,
        proUntil: from + days * 86_400_000,
        subscriptionId,
        subscriptionEmail: contract.email,
        cancelled: false,
      };
      await saveAccount(account);
      // Every payment (first or renewal) adds bits worth the plan's price.
      const credits = await planCredits(contract.item, contract.periodicity ?? "MONTHLY", e);
      if (credits > 0) await grant(account.id, credits);
      return `${tier} until ${new Date(account.plan.proUntil).toISOString()} for ${account.id}, +${credits} bits`;
    }
    await grant(account.id, item.bits ?? 0);
    return `granted ${item.bits} bits to ${account.id}`;
  }
  if (type === "subscription.cancelled" && account.plan) {
    account.plan.cancelled = true;
    const end = e.willExpireAt ? Date.parse(e.willExpireAt) : NaN;
    if (Number.isFinite(end)) account.plan.proUntil = end;
    await saveAccount(account);
    return `pro cancelled for ${account.id}, ends ${new Date(account.plan.proUntil).toISOString()}`;
  }
  return `${type} for ${account.id} (no change)`;
}
