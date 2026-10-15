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
 * In-process bridge. Needs one long-lived Node server (`next dev`, `next start`, a VPS);
 * on serverless hosts every request may hit a different instance, so use the Redis bridge.
 */

// Roblox HttpService gives up after ~30s, so stay well under that.
const LONG_POLL_MS = 20_000;

type Pending = { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> };

type Session = {
  id: string;
  pairCode: string;
  pairCodeExpires: number;
  pluginToken: string | null;
  pluginLastSeen: number;
  studioInfo: StudioInfo;
  queue: StudioCommand[];
  pending: Map<string, Pending>;
  waiters: Set<() => void>;
  createdAt: number;
};

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

function newPairCode() {
  let code = "";
  do code = randomPairCode();
  while (store.byPairCode.has(code));
  return code;
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

const isConnected = (s: Session) => !!s.pluginToken && Date.now() - s.pluginLastSeen < PLUGIN_STALE_MS;

function sessionForPlugin(pluginToken: string | null) {
  if (!pluginToken) return null;
  const id = store.byPluginToken.get(pluginToken);
  return id ? (store.sessions.get(id) ?? null) : null;
}

export const memoryBridge: Bridge = {
  kind: "memory",
  longPollMs: LONG_POLL_MS,

  async createSession() {
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
  },

  async refreshPairCode(sessionId) {
    const s = store.sessions.get(sessionId);
    if (!s) return null;
    store.byPairCode.delete(s.pairCode);
    s.pairCode = newPairCode();
    s.pairCodeExpires = Date.now() + PAIR_CODE_TTL_MS;
    store.byPairCode.set(s.pairCode, s.id);
    return { pairCode: s.pairCode, pairCodeExpires: s.pairCodeExpires };
  },

  async getSessionStatus(sessionId) {
    const s = store.sessions.get(sessionId);
    if (!s) return null;
    return {
      connected: isConnected(s),
      pairCode: s.pairCode || null,
      pairCodeExpires: s.pairCode ? s.pairCodeExpires : null,
      studioInfo: s.studioInfo,
    };
  },

  async connectPlugin(pairCode, studioInfo) {
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
  },

  async disconnectPlugin(pluginToken) {
    const s = sessionForPlugin(pluginToken);
    if (!s || !s.pluginToken) return false;
    store.byPluginToken.delete(s.pluginToken);
    s.pluginToken = null;
    s.pluginLastSeen = 0;
    return true;
  },

  async pollCommands(pluginToken, studioInfo) {
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
        const timer = setTimeout(done, LONG_POLL_MS);
        s.waiters.add(done);
      });
    }
    s.pluginLastSeen = Date.now();
    return s.queue.splice(0, s.queue.length);
  },

  async submitResult(pluginToken, id, result) {
    const s = sessionForPlugin(pluginToken);
    if (!s) return false;
    s.pluginLastSeen = Date.now();
    const p = s.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    s.pending.delete(id);
    p.resolve(result);
    return true;
  },

  async runInStudio(sessionId, tool, args, timeoutMs = 60_000) {
    const s = store.sessions.get(sessionId);
    if (!s) return { ok: false, error: "Unknown session. Reload the page." };
    if (!isConnected(s)) return { ok: false, error: NOT_CONNECTED };

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
  },
};
