import { redisFromEnv } from "@/lib/bridge/redis";

/**
 * Tiny JSON key-value store for accounts and billing: Upstash Redis when configured (required
 * on Vercel), else process memory (local dev). Keys are namespaced by the callers.
 */

type Entry = { value: string; exp: number | null };

type KV = {
  get<T>(key: string): Promise<T | null>;
  /** ttlS: expire after this many seconds. nx: only if the key doesn't exist (returns false if it did). */
  set(key: string, value: unknown, opts?: { ttlS?: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Increments a counter, starting its expiry window on the first hit. */
  incr(key: string, windowS: number): Promise<number>;
};

function memoryKV(): KV {
  const g = globalThis as unknown as { __bloxyKV?: Map<string, Entry> };
  const map = (g.__bloxyKV ??= new Map());
  const live = (key: string) => {
    const e = map.get(key);
    if (e && e.exp !== null && e.exp < Date.now()) {
      map.delete(key);
      return undefined;
    }
    return e;
  };
  return {
    async get<T>(key: string) {
      const e = live(key);
      return e ? (JSON.parse(e.value) as T) : null;
    },
    async set(key, value, opts = {}) {
      if (opts.nx && live(key)) return false;
      map.set(key, { value: JSON.stringify(value), exp: opts.ttlS ? Date.now() + opts.ttlS * 1000 : null });
      return true;
    },
    async del(key) {
      map.delete(key);
    },
    async incr(key, windowS) {
      const e = live(key);
      const n = (e ? Number(JSON.parse(e.value)) : 0) + 1;
      map.set(key, { value: String(n), exp: e?.exp ?? Date.now() + windowS * 1000 });
      return n;
    },
  };
}

function redisKV(): KV | null {
  const redis = redisFromEnv();
  if (!redis) return null;
  return {
    async get<T>(key: string) {
      const v = await redis.get<string | T>(key);
      if (v === null || v === undefined) return null;
      // Upstash already parses JSON on read, so a stored string may arrive decoded once.
      if (typeof v !== "string") return v as T;
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as T;
      }
    },
    async set(key, value, opts = {}) {
      const json = JSON.stringify(value);
      const res = opts.ttlS
        ? opts.nx
          ? await redis.set(key, json, { ex: opts.ttlS, nx: true })
          : await redis.set(key, json, { ex: opts.ttlS })
        : opts.nx
          ? await redis.set(key, json, { nx: true })
          : await redis.set(key, json);
      return res === "OK";
    },
    async del(key) {
      await redis.del(key);
    },
    async incr(key, windowS) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowS);
      return n;
    },
  };
}

let cached: KV | null = null;
export function kv(): KV {
  return (cached ??= redisKV() ?? memoryKV());
}
