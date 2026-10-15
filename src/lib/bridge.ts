import { randomBytes, randomInt } from "crypto";

/**
 * In-memory bridge between browser sessions and Roblox Studio plugins.
 *
 * Flow:
 *  1. Browser creates a session -> gets a secret sessionId and a short pair code.
 *  2. User types the pair code into the Studio plugin -> plugin gets a pluginToken.
 *  3. The AI agent (server side) enqueues commands for the session.
 *  4. The plugin long-polls for commands, runs them in Studio, and posts results back.
 *
 * State lives in process memory, so this needs a single long-lived Node server
 * (`next start`, Render, Railway, a VPS). On serverless hosts swap this for Redis.
 */

export type StudioCommand = {
  id: string;
  tool: string;
  args: unknown;
};

export type CommandResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

type Pending = {
  resolve: (r: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Session = {
  id: string;
  pairCode: string;
  pairCodeExpires: number;
  pluginToken: string | null;
  pluginLastSeen: number;
  studioInfo: Record<string, unknown> | null;
  queue: StudioCommand[];
  pending: Map<string, Pending>;
  waiters: Set<() => void>;
  createdAt: number;
};

const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PLUGIN_STALE_MS = 45 * 1000;
const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

type Store = {
  sessions: Map<string, Session>;
  byPairCode: Map<string, string>;
  byPluginToken: Map<string, string>;
};

// Keep the store on globalThis so dev-mode hot reloads don't wipe sessions.
const g = globalThis as unknown as { __bloxyBridge?: Store };
const store: Store = (g.__bloxyBridge ??= {
  sessions: new Map(),
  byPairCode: new Map(),
  byPluginToken: new Map(),
});

function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function newPairCode() {
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join("");
  } while (store.byPairCode.has(code));
  return code;
}

function sweep() {
  const now = Date.now();
  for (const s of store.sessions.values()) {
    if (now - s.createdAt > SESSION_TTL_MS) deleteSession(s.id);
    else if (s.pairCode && s.pairCodeExpires < now) {
      store.byPairCode.delete(s.pairCode);
      s.pairCode = "";
    }
  }
}

function deleteSession(id: string) {
  const s = store.sessions.get(id);
  if (!s) return;
  store.byPairCode.delete(s.pairCode);
  if (s.pluginToken) store.byPluginToken.delete(s.pluginToken);
  for (const p of s.pending.values()) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error: "Session closed" });
  }
  store.sessions.delete(id);
}

export function createSession() {
  sweep();
  const s: Session = {
    id: token(),
    pairCode: newPairCode(),
    pairCodeExpires: Date.now() + PAIR_CODE_TTL_MS,
    pluginToken: null,
    pluginLastSeen: 0,
    studioInfo: null,
    queue: [],
    pending: new Map(),
    waiters: new Set(),
    createdAt: Date.now(),
  };
  store.sessions.set(s.id, s);
  store.byPairCode.set(s.pairCode, s.id);
  return { sessionId: s.id, pairCode: s.pairCode, pairCodeExpires: s.pairCodeExpires };
}

/** Issue a fresh pair code (e.g. after the old one expired or to re-pair). */
export function refreshPairCode(sessionId: string) {
  const s = store.sessions.get(sessionId);
  if (!s) return null;
  store.byPairCode.delete(s.pairCode);
  s.pairCode = newPairCode();
  s.pairCodeExpires = Date.now() + PAIR_CODE_TTL_MS;
  store.byPairCode.set(s.pairCode, s.id);
  return { pairCode: s.pairCode, pairCodeExpires: s.pairCodeExpires };
}

export function getSessionStatus(sessionId: string) {
  const s = store.sessions.get(sessionId);
  if (!s) return null;
  return {
    connected: isPluginConnected(s),
    pairCode: s.pairCode || null,
    pairCodeExpires: s.pairCode ? s.pairCodeExpires : null,
    studioInfo: s.studioInfo,
  };
}

function isPluginConnected(s: Session) {
  return !!s.pluginToken && Date.now() - s.pluginLastSeen < PLUGIN_STALE_MS;
}

export function isSessionConnected(sessionId: string) {
  const s = store.sessions.get(sessionId);
  return !!s && isPluginConnected(s);
}

/** Plugin redeems a pair code. Replaces any previous plugin on the session. */
export function connectPlugin(pairCode: string, studioInfo: Record<string, unknown> | null) {
  sweep();
  const sessionId = store.byPairCode.get(pairCode.trim().toUpperCase());
  const s = sessionId ? store.sessions.get(sessionId) : undefined;
  if (!s || s.pairCodeExpires < Date.now()) return null;

  if (s.pluginToken) store.byPluginToken.delete(s.pluginToken);
  s.pluginToken = token(32);
  s.pluginLastSeen = Date.now();
  s.studioInfo = studioInfo;
  store.byPluginToken.set(s.pluginToken, s.id);

  // One-time use: the code is burned once a plugin has paired.
  store.byPairCode.delete(s.pairCode);
  s.pairCode = "";
  return { pluginToken: s.pluginToken };
}

function sessionForPlugin(pluginToken: string | null) {
  if (!pluginToken) return null;
  const id = store.byPluginToken.get(pluginToken);
  return id ? store.sessions.get(id) ?? null : null;
}

export function disconnectPlugin(pluginToken: string | null) {
  const s = sessionForPlugin(pluginToken);
  if (!s || !s.pluginToken) return false;
  store.byPluginToken.delete(s.pluginToken);
  s.pluginToken = null;
  s.pluginLastSeen = 0;
  return true;
}

/**
 * Long-poll: returns queued commands immediately, or waits up to `waitMs` for one.
 * Returns null if the token is unknown.
 */
export async function pollCommands(
  pluginToken: string | null,
  waitMs: number,
  studioInfo?: Record<string, unknown> | null,
): Promise<StudioCommand[] | null> {
  const s = sessionForPlugin(pluginToken);
  if (!s) return null;
  s.pluginLastSeen = Date.now();
  if (studioInfo) s.studioInfo = studioInfo;

  if (s.queue.length === 0) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        s.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      s.waiters.add(done);
    });
  }
  s.pluginLastSeen = Date.now();
  return s.queue.splice(0, s.queue.length);
}

export function submitResult(pluginToken: string | null, id: string, result: CommandResult) {
  const s = sessionForPlugin(pluginToken);
  if (!s) return false;
  s.pluginLastSeen = Date.now();
  const p = s.pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer);
  s.pending.delete(id);
  p.resolve(result);
  return true;
}

/** Called by the agent: send a command to Studio and wait for its result. */
export function runInStudio(
  sessionId: string,
  tool: string,
  args: unknown,
  timeoutMs = 60_000,
): Promise<CommandResult> {
  const s = store.sessions.get(sessionId);
  if (!s) return Promise.resolve({ ok: false, error: "Unknown session. Reload the page." });
  if (!isPluginConnected(s)) {
    return Promise.resolve({
      ok: false,
      error: "Roblox Studio is not connected. Ask the user to open the Bloxy plugin and pair it.",
    });
  }

  const cmd: StudioCommand = { id: token(9), tool, args };
  return new Promise<CommandResult>((resolve) => {
    const timer = setTimeout(() => {
      s.pending.delete(cmd.id);
      const i = s.queue.indexOf(cmd);
      if (i !== -1) s.queue.splice(i, 1);
      resolve({ ok: false, error: `Studio did not answer within ${timeoutMs / 1000}s` });
    }, timeoutMs);
    s.pending.set(cmd.id, { resolve, timer });
    s.queue.push(cmd);
    for (const wake of [...s.waiters]) wake();
  });
}
