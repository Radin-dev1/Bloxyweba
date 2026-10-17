import { randomBytes, randomInt } from "crypto";

/**
 * Bridge between browser sessions and Roblox Studio plugins.
 *
 * Flow:
 *  1. Browser creates a session -> gets a secret sessionId and a short pair code.
 *  2. User types the pair code into the Studio plugin -> plugin gets a pluginToken.
 *  3. The AI agent (server side) queues commands for the session.
 *  4. The plugin long-polls for commands, runs them in Studio, and posts results back.
 *
 * Two backends implement this: in-process memory (local dev, single server) and
 * Upstash Redis (serverless hosts like Vercel, where requests hit different instances).
 */

export type StudioCommand = { id: string; tool: string; args: unknown };

export type CommandResult = { ok: true; result: unknown } | { ok: false; error: string };

export type SessionStatus = {
  connected: boolean;
  pairCode: string | null;
  pairCodeExpires: number | null;
  studioInfo: Record<string, unknown> | null;
};

export type StudioInfo = Record<string, unknown> | null;

export type ChatJobStatus = "queued" | "running" | "completed" | "stopped" | "error";
export type ChatJob = {
  id: string;
  status: ChatJobStatus;
  events: { seq: number; event: unknown }[];
  updatedAt: number;
};

export type ChatJobResult = { jobId: string; status: ChatJobStatus; events: { seq: number; event: unknown }[]; nextSeq: number };

export interface Bridge {
  readonly kind: "memory" | "redis";
  /** How long one plugin poll may wait for commands before returning empty. */
  readonly longPollMs: number;
  createSession(): Promise<{ sessionId: string; pairCode: string; pairCodeExpires: number }>;
  refreshPairCode(sessionId: string): Promise<{ pairCode: string; pairCodeExpires: number } | null>;
  getSessionStatus(sessionId: string): Promise<SessionStatus | null>;
  connectPlugin(pairCode: string, studioInfo: StudioInfo): Promise<{ pluginToken: string } | null>;
  disconnectPlugin(pluginToken: string | null): Promise<boolean>;
  pollCommands(pluginToken: string | null, studioInfo?: StudioInfo): Promise<StudioCommand[] | null>;
  submitResult(pluginToken: string | null, id: string, result: CommandResult): Promise<boolean>;
  runInStudio(sessionId: string, tool: string, args: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<CommandResult>;
  createChatJob(sessionId: string, jobId: string): Promise<boolean>;
  appendChatJobEvent(sessionId: string, jobId: string, event: unknown): Promise<boolean>;
  getChatJob(sessionId: string, jobId: string, afterSeq?: number): Promise<ChatJobResult | null>;
  finishChatJob(sessionId: string, jobId: string, status: Exclude<ChatJobStatus, "queued" | "running">): Promise<boolean>;
  stopChatJob(sessionId: string, jobId: string): Promise<boolean>;
  /** The session a plugin token belongs to (null when not paired). */
  pluginSession(pluginToken: string | null): Promise<string | null>;
  /** Messages typed in the Studio plugin's chat, waiting for the website tab to run them. */
  pushInbox(sessionId: string, text: string): Promise<boolean>;
  takeInbox(sessionId: string): Promise<string[]>;
  /** The newest chat job of a session, so the plugin can show the conversation live. */
  latestChatJob(sessionId: string): Promise<string | null>;
}

/** Plugin chat limits: a few queued messages, each a normal chat message long. */
export const INBOX_MAX = 5;
export const INBOX_TEXT_MAX = 8000;

export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const PLUGIN_STALE_MS = 45 * 1000;
const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export const NOT_CONNECTED =
  "Roblox Studio is not connected. Ask the user to open the Bloxy plugin and pair it.";

export function token(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function randomPairCode() {
  return Array.from({ length: 6 }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join("");
}
