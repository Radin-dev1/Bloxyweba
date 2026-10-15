import { memoryBridge } from "./memory";
import { createRedisBridge, redisFromEnv } from "./redis";
import type { Bridge, CommandResult } from "./types";

export type { Bridge, CommandResult, SessionStatus, StudioCommand, StudioInfo } from "./types";

/**
 * Picks the bridge backend: Redis when Upstash credentials are set, memory otherwise.
 * On Vercel without Redis the memory bridge would silently half-work (plugin and agent
 * landing on different instances), so fail loudly with setup instructions instead.
 */
function pickBridge(): Bridge {
  const redis = redisFromEnv();
  if (redis) return createRedisBridge(redis);
  if (process.env.VERCEL) return misconfigured;
  return memoryBridge;
}

const SETUP =
  "Bloxy needs Redis on Vercel. In your Vercel project open Storage → add Upstash Redis (free tier works) → connect it to this project, then redeploy.";

const fail = async (): Promise<never> => {
  throw new BridgeConfigError(SETUP);
};

export class BridgeConfigError extends Error {}

const misconfigured: Bridge = {
  kind: "memory",
  longPollMs: 0,
  createSession: fail,
  refreshPairCode: fail,
  getSessionStatus: fail,
  connectPlugin: fail,
  disconnectPlugin: fail,
  pollCommands: fail,
  submitResult: fail,
  runInStudio: async (): Promise<CommandResult> => ({ ok: false, error: SETUP }),
};

export const bridge: Bridge = pickBridge();

/** Turns a missing-Redis error into a readable 503 for API routes. */
export function bridgeErrorResponse(err: unknown) {
  if (err instanceof BridgeConfigError) return Response.json({ error: err.message }, { status: 503 });
  console.error("[bloxy] bridge error", err);
  return Response.json({ error: "Bridge unavailable. Try again in a moment." }, { status: 503 });
}
