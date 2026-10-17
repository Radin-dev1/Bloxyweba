import { redisFromEnv } from "@/lib/bridge/redis";
import { getAccount, tierOf, type Tier } from "@/lib/accounts";
import { currentUser, type User } from "@/lib/auth";
import { openrouterKey } from "@/lib/openrouter";

/**
 * Bits: Bloxy's credits for running AI on the owner's OpenRouter key.
 *
 * - Everyone signed in gets a daily allowance: once per UTC day the balance is topped up
 *   to BITS_DAILY (it doesn't stack). Admin grants add on top.
 * - Prices follow real cost: OpenRouter reports usage.cost in credits (1 credit = $1),
 *   charged at BITS_PER_USD bits per dollar. Requests reserve an estimate first, then
 *   settle to the real cost (refund or extra) when it's known.
 * - People who paste their own OpenRouter key never spend bits.
 *
 * Balances live in Upstash Redis when configured (required on Vercel), else in memory.
 */

export const BITS_PER_USD = Number(process.env.BITS_PER_USD) || 1000;
export const BITS_DAILY = Number(process.env.BITS_DAILY) || 300;
/** Paid plans get a much bigger daily allowance. */
export const BITS_DAILY_PRO = Number(process.env.BITS_DAILY_PRO) || 5000;
export const BITS_DAILY_STUDIO = Number(process.env.BITS_DAILY_STUDIO) || 20000;

export function dailyForTier(tier: Tier | null) {
  return tier === "studio" ? BITS_DAILY_STUDIO : tier === "pro" ? BITS_DAILY_PRO : BITS_DAILY;
}

/** Today's allowance for this account (by plan). */
export async function dailyFor(userId: string) {
  return dailyForTier(tierOf(await getAccount(userId).catch(() => null)));
}

/** Upfront holds per kind of request, in bits (settled to the real cost afterwards). */
export const BIT_ESTIMATES = {
  chatStep: 40,
  image: 80,
  model3d: 120,
  video: 1500,
} as const;

const P = "bloxy:bits:";
const today = () => new Date().toISOString().slice(0, 10);

type Store = {
  get(userId: string): Promise<{ balance: number; day: string } | null>;
  set(userId: string, balance: number, day: string): Promise<void>;
  add(userId: string, delta: number): Promise<number>;
  putJob(id: string, value: { userId: string; reserved: number }): Promise<void>;
  takeJob(id: string): Promise<{ userId: string; reserved: number } | null>;
};

function memoryStore(): Store {
  const g = globalThis as unknown as { __bloxyBits?: Map<string, { balance: number; day: string }>; __bloxyJobs?: Map<string, { userId: string; reserved: number }> };
  const users = (g.__bloxyBits ??= new Map());
  const jobs = (g.__bloxyJobs ??= new Map());
  return {
    async get(id) {
      return users.get(id) ?? null;
    },
    async set(id, balance, day) {
      users.set(id, { balance, day });
    },
    async add(id, delta) {
      const u = users.get(id) ?? { balance: 0, day: today() };
      u.balance += delta;
      users.set(id, u);
      return u.balance;
    },
    async putJob(id, v) {
      jobs.set(id, v);
    },
    async takeJob(id) {
      const v = jobs.get(id) ?? null;
      jobs.delete(id);
      return v;
    },
  };
}

function redisStore(): Store | null {
  const redis = redisFromEnv();
  if (!redis) return null;
  return {
    async get(id) {
      const h = await redis.hgetall<{ balance?: string; day?: string }>(`${P}u:${id}`);
      if (!h || h.balance === undefined) return null;
      return { balance: Number(h.balance), day: h.day ?? "" };
    },
    async set(id, balance, day) {
      await redis.hset(`${P}u:${id}`, { balance, day });
    },
    async add(id, delta) {
      return redis.hincrby(`${P}u:${id}`, "balance", Math.round(delta));
    },
    async putJob(id, v) {
      await redis.set(`${P}job:${id}`, JSON.stringify(v), { ex: 86_400 });
    },
    async takeJob(id) {
      const v = await redis.getdel<string>(`${P}job:${id}`);
      return v ? (JSON.parse(v) as { userId: string; reserved: number }) : null;
    },
  };
}

let storeCache: Store | null = null;
function store(): Store {
  return (storeCache ??= redisStore() ?? memoryStore());
}

export function bitsEnabled() {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Current balance, applying today's top-up first. */
export async function balanceOf(userId: string) {
  const s = store();
  const rec = await s.get(userId);
  const day = today();
  if (!rec) {
    const daily = await dailyFor(userId);
    await s.set(userId, daily, day);
    return daily;
  }
  if (rec.day !== day) {
    const topped = Math.max(rec.balance, await dailyFor(userId));
    await s.set(userId, topped, day);
    return topped;
  }
  return rec.balance;
}

/** Holds `amount` bits. Returns false (and holds nothing) if the balance is too low. */
export async function reserve(userId: string, amount: number) {
  await balanceOf(userId); // applies the daily top-up
  const after = await store().add(userId, -amount);
  if (after < 0) {
    await store().add(userId, amount);
    return false;
  }
  return true;
}

/** Settles a hold against the real cost (USD). Unknown cost keeps the hold as the price. */
export async function settle(userId: string, reserved: number, costUsd: number | null | undefined) {
  if (costUsd === null || costUsd === undefined || !Number.isFinite(costUsd)) return reserved;
  const actual = Math.max(1, Math.ceil(costUsd * BITS_PER_USD));
  const diff = reserved - actual; // positive = refund, negative = charge extra
  if (diff !== 0) await store().add(userId, diff);
  return actual;
}

export async function refund(userId: string, reserved: number) {
  await store().add(userId, reserved);
}

export async function grant(userId: string, amount: number) {
  await balanceOf(userId);
  return store().add(userId, Math.round(amount));
}

/** Async jobs (video) hold bits until they finish. */
export const jobs = {
  put: (id: string, userId: string, reserved: number) => store().putJob(id, { userId, reserved }),
  take: (id: string) => store().takeJob(id),
};

export type Billing =
  | { ok: true; key: string; user: User | null; charge: false }
  | { ok: true; key: string; user: User; charge: true }
  | { ok: false; response: Response };

/**
 * Who pays for a request: the user's own OpenRouter key (free, no sign-in), else the
 * server key on bits (requires Roblox sign-in), else a clear error.
 */
export async function resolveBilling(clientKey: string | undefined): Promise<Billing> {
  const own = clientKey?.trim();
  if (own) return { ok: true, key: own, user: null, charge: false };
  const serverKey = openrouterKey();
  if (!serverKey) {
    return {
      ok: false,
      response: Response.json({ error: "Add your OpenRouter API key in Settings to generate." }, { status: 400 }),
    };
  }
  const user = await currentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Sign in to use your free daily bits.", code: "sign_in" }, { status: 401 }),
    };
  }
  return { ok: true, key: serverKey, user, charge: true };
}

export function outOfBits() {
  return Response.json(
    { error: `Not enough bits for this. You get ${BITS_DAILY} free bits every day (${BITS_DAILY_PRO.toLocaleString("en-US")} with Pro, ${BITS_DAILY_STUDIO.toLocaleString("en-US")} with Studio), you can buy a bit pack on the Pricing page, or add your own OpenRouter key in Settings.`, code: "no_bits" },
    { status: 402 },
  );
}
