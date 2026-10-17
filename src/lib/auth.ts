import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { Account, Provider } from "@/lib/accounts";
import { storageReady } from "@/lib/kv";

/**
 * Sessions and sign-in. The session is a small signed cookie naming the account; account
 * data (sign-in methods, plan) lives in the accounts store and balances in the bits ledger.
 *
 * Sign-in methods: email + password, and OAuth 2.0 (+ PKCE) with Google and Roblox. Each OAuth provider is on when its client id and secret are set.
 *
 * Env: AUTH_SECRET (long random string, required), plus per provider:
 *   ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET    redirect: <site>/api/auth/roblox/callback
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET    redirect: <site>/api/auth/google/callback
 */

export const ROBLOX_OAUTH = "https://apis.roblox.com/oauth/v1";
const SESSION_COOKIE = "bloxy_session";
const FLOW_COOKIE = "bloxy_oauth";
const SESSION_DAYS = 30;

/** The signed-in user as the session carries it. robloxId: for admin checks. */
export type User = { id: string; username: string; displayName: string; picture: string | null; email?: string; robloxId?: string };

export type OAuthProfile = { id: string; name: string; username?: string; picture: string | null; email?: string; emailVerified?: boolean };

type ProviderConfig = {
  label: string;
  authorize: string;
  token: string;
  scope: string;
  pkce: boolean;
  /** Reads the profile with the access token. */
  profile: (accessToken: string) => Promise<OAuthProfile>;
};

const getJson = async <T,>(url: string, token: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
};

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  roblox: {
    label: "Roblox",
    authorize: `${ROBLOX_OAUTH}/authorize`,
    token: `${ROBLOX_OAUTH}/token`,
    scope: "openid profile",
    pkce: true,
    async profile(t) {
      const i = await getJson<{ sub: string; name?: string; nickname?: string; preferred_username?: string; picture?: string | null }>(`${ROBLOX_OAUTH}/userinfo`, t);
      return { id: String(i.sub), name: i.name ?? i.nickname ?? i.preferred_username ?? "Roblox user", username: i.preferred_username ?? i.nickname, picture: i.picture ?? null };
    },
  },
  google: {
    label: "Google",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    pkce: true,
    async profile(t) {
      const i = await getJson<{ sub: string; name?: string; email?: string; email_verified?: boolean; picture?: string }>("https://openidconnect.googleapis.com/v1/userinfo", t);
      return { id: i.sub, name: i.name ?? i.email?.split("@")[0] ?? "Google user", picture: i.picture ?? null, email: i.email, emailVerified: i.email_verified === true };
    },
  },
};

const creds = (p: Provider) => {
  const up = p.toUpperCase();
  return { id: process.env[`${up}_CLIENT_ID`], secret: process.env[`${up}_CLIENT_SECRET`] };
};

export function isProvider(p: string): p is Provider {
  return p in PROVIDERS;
}

/** Accounts work at all (sessions can be signed). */
export function authConfigured() {
  // Accounts need durable storage too (Redis on Vercel), or sign-ups would vanish.
  return !!process.env.AUTH_SECRET && storageReady();
}

/** Which OAuth buttons to show. */
export function providersEnabled(): Provider[] {
  if (!authConfigured()) return [];
  return (Object.keys(PROVIDERS) as Provider[]).filter((p) => creds(p).id && creds(p).secret);
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
  const d = verify<User>(jar.get(SESSION_COOKIE)?.value);
  return d ? { id: d.id, username: d.username, displayName: d.displayName, picture: d.picture, email: d.email, robloxId: d.robloxId } : null;
}

export function userOf(a: Account): User {
  return {
    id: a.id,
    username: a.email?.split("@")[0] ?? a.name,
    displayName: a.name,
    picture: a.picture,
    email: a.email,
    robloxId: a.providers.roblox,
  };
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

/** Only same-site paths are allowed as a place to return to after signing in. */
export function safeReturn(path: string | null | undefined, fallback = "/studio") {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : fallback;
}

// ── OAuth flow state (state + PKCE verifier) kept in a short-lived signed cookie ──

export async function startFlow(provider: Provider, redirectUri: string, returnTo: string) {
  const cfg = PROVIDERS[provider];
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  (await cookies()).set(FLOW_COOKIE, sign({ provider, state, verifier, returnTo, exp: Date.now() + 10 * 60_000 }), {
    ...cookieBase,
    maxAge: 600,
  });
  const url = new URL(cfg.authorize);
  url.searchParams.set("client_id", creds(provider).id!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (cfg.pkce) {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function finishFlow(provider: Provider, state: string | null) {
  const jar = await cookies();
  const flow = verify<{ provider: Provider; state: string; verifier: string; returnTo: string }>(jar.get(FLOW_COOKIE)?.value);
  jar.delete(FLOW_COOKIE);
  if (!flow || !state || flow.state !== state || (flow.provider && flow.provider !== provider)) return null;
  return flow;
}

/** Exchanges the code for a token and reads the profile. */
export async function fetchProfile(provider: Provider, code: string, verifier: string, redirectUri: string): Promise<OAuthProfile> {
  const cfg = PROVIDERS[provider];
  const { id, secret: clientSecret } = creds(provider);
  const tokenRes = await fetch(cfg.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: id!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      ...(cfg.pkce ? { code_verifier: verifier } : {}),
    }),
  });
  if (!tokenRes.ok) throw new Error(`${cfg.label} token exchange failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  return cfg.profile(access_token);
}

export function isAdmin(user: User | null) {
  if (!user) return false;
  const ids = (process.env.ADMIN_ROBLOX_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // By account id (ADMIN_ACCOUNT_IDS) or linked Roblox id, never by email: emails from
  // password signups are not verified.
  const accounts = (process.env.ADMIN_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(user.id) || accounts.includes(user.id) || (!!user.robloxId && ids.includes(user.robloxId));
}

/** The site origin for redirects (works behind Vercel's proxy). SITE_URL wins when set. */
export function originOf(request: Request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
