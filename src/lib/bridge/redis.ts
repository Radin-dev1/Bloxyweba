import { Redis } from "@upstash/redis";
import {
  NOT_CONNECTED,
  PAIR_CODE_TTL_MS,
  PLUGIN_STALE_MS,
  SESSION_TTL_MS,
  randomPairCode,
  token,
  type Bridge,
  type CommandResult,
  type StudioCommand,
  type StudioInfo,
} from "./types";

/**
 * Redis bridge for serverless hosts (Vercel). Every request may run on a different
 * instance, so all state lives in Upstash Redis:
 *
 *   s:{sessionId}  hash   pairCode, pairCodeExpires, pluginToken, lastSeen, studioInfo, createdAt
 *   pair:{code}    string → sessionId                      (expires with the code)
 *   tok:{token}    string → sessionId
 *   q:{sessionId}  list   queued commands (JSON) for the plugin
 *   pend:{cmdId}   string → sessionId                      (which session may answer)
 *   res:{cmdId}    string → result JSON                    (picked up by runInStudio)
 *
 * Neither side can block on Redis over REST, so both poll with short sleeps.
 */

const P = "bloxy:";
const SESSION_TTL_S = Math.ceil(SESSION_TTL_MS / 1000);
const PAIR_TTL_S = Math.ceil(PAIR_CODE_TTL_MS / 1000);

// Plugin long-poll: check the queue every POLL_STEP_MS for up to LONG_POLL_MS.
// Short enough to stay well inside function limits, long enough to keep Redis traffic down.
const LONG_POLL_MS = 10_000;
const POLL_STEP_MS = 1_000;
// Agent side: how often to look for a result while waiting on Studio.
const RESULT_STEP_MS = 350;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SessionHash = {
  pairCode?: string;
  pairCodeExpires?: string;
  pluginToken?: string;
  lastSeen?: string;
  studioInfo?: string;
  createdAt?: string;
};

export function redisFromEnv(): Redis | null {
  // Vercel's Upstash integration sets KV_REST_API_*; Upstash's own docs use UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  // We store our own JSON strings, so keep values as raw strings.
  return new Redis({ url, token, automaticDeserialization: false });
}

export function createRedisBridge(redis: Redis): Bridge {
  const sKey = (id: string) => `${P}s:${id}`;

  async function session(id: string) {
    const h = (await redis.hgetall<SessionHash>(sKey(id))) ?? null;
    return h && Object.keys(h).length > 0 ? h : null;
  }

  const connected = (h: SessionHash) =>
    !!h.pluginToken && Date.now() - Number(h.lastSeen ?? 0) < PLUGIN_STALE_MS;

  async function newPairCode(sessionId: string) {
    for (let i = 0; i < 8; i++) {
      const code = randomPairCode();
      const ok = await redis.set(`${P}pair:${code}`, sessionId, { nx: true, ex: PAIR_TTL_S });
      if (ok) return code;
    }
    throw new Error("Could not allocate a pair code");
  }

  async function sessionForPlugin(pluginToken: string | null) {
    if (!pluginToken) return null;
    return redis.get<string>(`${P}tok:${pluginToken}`);
  }

  return {
    kind: "redis",
    longPollMs: LONG_POLL_MS,

    async createSession() {
      const sessionId = token();
      const pairCode = await newPairCode(sessionId);
      const pairCodeExpires = Date.now() + PAIR_CODE_TTL_MS;
      await redis
        .pipeline()
        .hset(sKey(sessionId), { pairCode, pairCodeExpires, createdAt: Date.now(), lastSeen: 0 })
        .expire(sKey(sessionId), SESSION_TTL_S)
        .exec();
      return { sessionId, pairCode, pairCodeExpires };
    },

    async refreshPairCode(sessionId) {
      const h = await session(sessionId);
      if (!h) return null;
      if (h.pairCode) await redis.del(`${P}pair:${h.pairCode}`);
      const pairCode = await newPairCode(sessionId);
      const pairCodeExpires = Date.now() + PAIR_CODE_TTL_MS;
      await redis.hset(sKey(sessionId), { pairCode, pairCodeExpires });
      return { pairCode, pairCodeExpires };
    },

    async getSessionStatus(sessionId) {
      const h = await session(sessionId);
      if (!h) return null;
      const expires = Number(h.pairCodeExpires ?? 0);
      const codeValid = !!h.pairCode && expires > Date.now();
      let studioInfo: StudioInfo = null;
      try {
        studioInfo = h.studioInfo ? JSON.parse(h.studioInfo) : null;
      } catch {}
      return {
        connected: connected(h),
        pairCode: codeValid ? h.pairCode! : null,
        pairCodeExpires: codeValid ? expires : null,
        studioInfo,
      };
    },

    async connectPlugin(pairCode, studioInfo) {
      const code = pairCode.trim().toUpperCase();
      const sessionId = await redis.getdel<string>(`${P}pair:${code}`); // one-time use
      if (!sessionId) return null;
      const h = await session(sessionId);
      if (!h) return null;
      if (h.pluginToken) await redis.del(`${P}tok:${h.pluginToken}`);

      const pluginToken = token(32);
      await redis
        .pipeline()
        .set(`${P}tok:${pluginToken}`, sessionId, { ex: SESSION_TTL_S })
        .hset(sKey(sessionId), {
          pluginToken,
          lastSeen: Date.now(),
          studioInfo: JSON.stringify(studioInfo ?? null),
          pairCode: "",
          pairCodeExpires: 0,
        })
        .exec();
      return { pluginToken };
    },

    async disconnectPlugin(pluginToken) {
      const sessionId = await sessionForPlugin(pluginToken);
      if (!sessionId) return false;
      await redis
        .pipeline()
        .del(`${P}tok:${pluginToken}`)
        .hset(sKey(sessionId), { pluginToken: "", lastSeen: 0 })
        .exec();
      return true;
    },

    async pollCommands(pluginToken, studioInfo) {
      const sessionId = await sessionForPlugin(pluginToken);
      if (!sessionId) return null;
      const seen = (extra: Record<string, unknown> = {}) =>
        redis.hset(sKey(sessionId), { lastSeen: Date.now(), ...extra });
      await seen(studioInfo ? { studioInfo: JSON.stringify(studioInfo) } : {});

      const deadline = Date.now() + LONG_POLL_MS;
      for (;;) {
        const raw = await redis.lpop<string[]>(`${P}q:${sessionId}`, 50);
        if (raw && raw.length > 0) {
          await seen();
          return raw.map((r) => JSON.parse(r) as StudioCommand);
        }
        if (Date.now() + POLL_STEP_MS >= deadline) break;
        await sleep(POLL_STEP_MS);
      }
      await seen();
      return [];
    },

    async submitResult(pluginToken, id, result) {
      const sessionId = await sessionForPlugin(pluginToken);
      if (!sessionId) return false;
      const owner = await redis.getdel<string>(`${P}pend:${id}`);
      if (owner !== sessionId) return false;
      await redis
        .pipeline()
        .set(`${P}res:${id}`, JSON.stringify(result), { ex: 120 })
        .hset(sKey(sessionId), { lastSeen: Date.now() })
        .exec();
      return true;
    },

    async runInStudio(sessionId, tool, args, timeoutMs = 60_000) {
      const h = await session(sessionId);
      if (!h) return { ok: false, error: "Unknown session. Reload the page." };
      if (!connected(h)) return { ok: false, error: NOT_CONNECTED };

      const cmd: StudioCommand = { id: token(9), tool, args };
      const json = JSON.stringify(cmd);
      const qKey = `${P}q:${sessionId}`;
      await redis
        .pipeline()
        .set(`${P}pend:${cmd.id}`, sessionId, { ex: Math.ceil(timeoutMs / 1000) + 30 })
        .rpush(qKey, json)
        .expire(qKey, 3600)
        .exec();

      const deadline = Date.now() + timeoutMs;
      await sleep(150);
      while (Date.now() < deadline) {
        const res = await redis.getdel<string>(`${P}res:${cmd.id}`);
        if (res) return JSON.parse(res) as CommandResult;
        await sleep(RESULT_STEP_MS);
      }
      await redis.pipeline().lrem(qKey, 0, json).del(`${P}pend:${cmd.id}`).exec();
      return { ok: false, error: `Studio did not answer within ${timeoutMs / 1000}s` };
    },
  };
}
