import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { kv } from "@/lib/kv";

/**
 * Bloxy accounts. One account can sign in with email + password, Google, Discord and Roblox;
 * signing in with a new method while signed in links it. Accounts first made with Roblox keep
 * the Roblox user id as their account id, so balances from before accounts existed carry over.
 */

export type Provider = "roblox" | "google" | "discord";

export type Tier = "pro" | "studio";

export type Plan = {
  /** Which paid plan (older records without it are Pro). */
  tier?: Tier;
  /** Paid until this time (ms). Renewals push it forward; a cancelled plan runs to its end. */
  proUntil: number;
  /** lava.top parent contract of the subscription (needed to cancel it). */
  subscriptionId?: string;
  /** Email the subscription was bought with (lava.top identifies subscriptions by it). */
  subscriptionEmail?: string;
  cancelled?: boolean;
};

export type Account = {
  id: string;
  name: string;
  picture: string | null;
  email?: string;
  /** Proven by Google or Discord. Password signups are unverified until then. */
  emailVerified?: boolean;
  passwordHash?: string;
  providers: Partial<Record<Provider, string>>;
  plan?: Plan;
  createdAt: number;
};

const P = "bloxy:acct:";
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const normEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email.trim());

export async function getAccount(id: string) {
  return kv().get<Account>(`${P}id:${id}`);
}

export async function saveAccount(a: Account) {
  await kv().set(`${P}id:${a.id}`, a);
  if (a.email) await kv().set(`${P}email:${normEmail(a.email)}`, a.id);
  for (const [prov, pid] of Object.entries(a.providers)) if (pid) await kv().set(`${P}prov:${prov}:${pid}`, a.id);
  return a;
}

export async function accountByEmail(email: string) {
  const id = await kv().get<string>(`${P}email:${normEmail(email)}`);
  return id ? getAccount(id) : null;
}

export async function accountByProvider(provider: Provider, providerId: string) {
  const id = await kv().get<string>(`${P}prov:${provider}:${providerId}`);
  return id ? getAccount(id) : null;
}

// ── Passwords (scrypt, per-password salt) ──

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function checkPassword(password: string, stored: string | undefined) {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function createEmailAccount(email: string, password: string, name: string) {
  if (await accountByEmail(email)) return null;
  return saveAccount({
    id: `u_${randomBytes(9).toString("base64url")}`,
    name: name.trim().slice(0, 40) || email.split("@")[0],
    picture: null,
    email: normEmail(email),
    emailVerified: false,
    passwordHash: await hashPassword(password),
    providers: {},
    createdAt: Date.now(),
  });
}

/**
 * Finds or creates the account for an OAuth sign-in. Order: already linked -> link to the
 * signed-in account -> same verified email -> new account.
 */
export async function accountForOAuth(
  provider: Provider,
  profile: { id: string; name: string; picture: string | null; email?: string; emailVerified?: boolean },
  signedInId: string | null,
) {
  const linked = await accountByProvider(provider, profile.id);
  if (linked) return linked;
  const verifiedEmail = profile.email && profile.emailVerified ? normEmail(profile.email) : undefined;
  // Only a verified email links automatically: anyone can type an address into a signup form.
  const byEmail = verifiedEmail ? await accountByEmail(verifiedEmail) : null;
  const target = (signedInId && (await getAccount(signedInId))) || (byEmail?.emailVerified ? byEmail : null);
  // A verified owner takes the address over from an unverified password account using it.
  if (verifiedEmail && byEmail && !byEmail.emailVerified && byEmail.id !== target?.id) {
    byEmail.email = undefined;
    await kv().set(`${P}id:${byEmail.id}`, byEmail);
  }
  if (target) {
    target.providers[provider] = profile.id;
    target.picture ??= profile.picture;
    const ownedElsewhere = byEmail?.emailVerified && byEmail.id !== target.id;
    if (verifiedEmail && !ownedElsewhere && (!target.email || !target.emailVerified)) {
      target.email = verifiedEmail;
      target.emailVerified = true;
    }
    return saveAccount(target);
  }
  return saveAccount({
    // Roblox-first accounts keep the Roblox id: balances from before accounts stay put.
    id: provider === "roblox" ? profile.id : `u_${randomBytes(9).toString("base64url")}`,
    name: profile.name.slice(0, 40),
    picture: profile.picture,
    email: verifiedEmail,
    emailVerified: !!verifiedEmail,
    providers: { [provider]: profile.id },
    createdAt: Date.now(),
  });
}

/** Any paid plan that is still running. */
export function isPro(a: Pick<Account, "plan"> | null | undefined) {
  return !!a?.plan && a.plan.proUntil > Date.now();
}

/** The running paid plan, or null on the free plan. */
export function tierOf(a: Pick<Account, "plan"> | null | undefined): Tier | null {
  return isPro(a) ? (a!.plan!.tier ?? "pro") : null;
}

/** Too many attempts from one IP/email in 15 minutes: slow brute force down. */
export async function rateLimited(key: string, max = 10) {
  return (await kv().incr(`${P}rl:${key}`, 15 * 60)) > max;
}
