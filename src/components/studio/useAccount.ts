"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase";
import { supabaseSignOut } from "../account/supabaseLogin";

export type Account = {
  user: { id: string; username: string; displayName: string; picture: string | null } | null;
  bits: number | null;
  daily: number;
  bitsEnabled: boolean;
  signInEnabled: boolean;
  /** OAuth sign-in methods set up on this server. */
  providers?: ("roblox" | "google" | "discord")[];
  admin: boolean;
  account?: {
    email: string | null;
    hasPassword: boolean;
    linked: string[];
    pro: boolean;
    tier?: "pro" | "studio" | null;
    proUntil: number | null;
    cancelled: boolean;
  } | null;
};

/** Signed-in user, their plan and their bits. Call refresh() after anything that spends bits. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) setAccount((await res.json()) as Account);
    } catch {}
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Also end the Supabase login (no-op when Supabase isn't set up).
    if (supabaseEnabled()) await supabaseSignOut();
    await refresh();
  }, [refresh]);

  return { account, refresh, signOut };
}
