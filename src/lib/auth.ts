import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Sign in with Roblox (OAuth 2.0 + PKCE). The session is a small signed cookie, so no
 * database is needed for auth itself; balances live in the bits ledger.
 *
 * Env: ROBLOX_CLIENT_ID, ROBLOX_CLIENT_SECRET, AUTH_SECRET (any long random string).
 * Redirect URI to register on create.roblox.com: <site>/api/auth/roblox/callback
 */

export const ROBLOX_OAUTH = "https://apis.roblox.com/oauth/v1";
const SESSION_COOKIE = "bloxy_session";
const FLOW_COOKIE = "bloxy_oauth";
const SESSION_DAYS = 30;

export type User = { id: string; username: string; displayName: string; picture: string | null };

export function authConfigured() {
  return !!(process.env.ROBLOX_CLIENT_ID && process.env.ROBLOX_CLIENT_SECRET && process.env.AUTH_SECRET);
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify<T>(token: string | undefined): T | null {
  if (!token || !process.env.AUTH_SECRET) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

/** The signed-in user, or null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const data = verify<User>(jar.get(SESSION_COOKIE)?.value);
  return data ? { id: data.id, username: data.username, displayName: data.displayName, picture: data.picture } : null;
}

export async function setSession(user: User) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign({ ...user, exp: Date.now() + SESSION_DAYS * 86_400_000 }), {
    ...cookieBase,
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// ── OAuth flow state (state + PKCE verifier) kept in a short-lived signed cookie ──

export async function startFlow(redirectUri: string, returnTo: string) {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  (await cookies()).set(FLOW_COOKIE, sign({ state, verifier, returnTo, exp: Date.now() + 10 * 60_000 }), {
    ...cookieBase,
    maxAge: 600,
  });
  const url = new URL(`${ROBLOX_OAUTH}/authorize`);
  url.searchParams.set("client_id", process.env.ROBLOX_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function finishFlow(state: string | null) {
  const jar = await cookies();
  const flow = verify<{ state: string; verifier: string; returnTo: string }>(jar.get(FLOW_COOKIE)?.value);
  jar.delete(FLOW_COOKIE);
  if (!flow || !state || flow.state !== state) return null;
  return flow;
}

/** Exchanges the code and reads the Roblox profile. */
export async function fetchRobloxUser(code: string, verifier: string, redirectUri: string): Promise<User> {
  const tokenRes = await fetch(`${ROBLOX_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: process.env.ROBLOX_CLIENT_ID!,
      client_secret: process.env.ROBLOX_CLIENT_SECRET!,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Roblox token exchange failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch(`${ROBLOX_OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new Error(`Roblox userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as {
    sub: string;
    name?: string;
    nickname?: string;
    preferred_username?: string;
    picture?: string | null;
  };
  return {
    id: String(info.sub),
    username: info.preferred_username ?? info.nickname ?? `user${info.sub}`,
    displayName: info.name ?? info.nickname ?? info.preferred_username ?? "Roblox user",
    picture: info.picture ?? null,
  };
}

export function isAdmin(user: User | null) {
  if (!user) return false;
  return (process.env.ADMIN_ROBLOX_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(user.id);
}

/** The site origin for redirects (works behind Vercel's proxy). */
export function originOf(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
