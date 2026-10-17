"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BloxyMark, BloxyWordmark } from "../landing/icons";
import type { Account } from "../studio/useAccount";

/** Page frame for the account pages: logo bar and a centred column. */
export function AccountShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-[#0b0c10] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,125,255,0.16),transparent_70%)]" />
      <header className="relative flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <BloxyMark className="size-7" />
          <BloxyWordmark className="h-[15px] w-auto text-white" />
        </Link>
        <nav className="flex items-center gap-1 text-sm text-white/60">
          <Link href="/pricing" className="rounded-full px-3 py-1.5 hover:bg-white/[0.06] hover:text-white">
            Pricing
          </Link>
          <Link href="/studio" className="rounded-full px-3 py-1.5 hover:bg-white/[0.06] hover:text-white">
            Studio
          </Link>
        </nav>
      </header>
      <main className={`relative mx-auto w-full px-4 pt-6 pb-24 ${wide ? "max-w-5xl" : "max-w-md"}`}>{children}</main>
    </div>
  );
}

/** /api/auth/me, refreshed on demand. */
export function useMe() {
  const [me, setMe] = useState<Account | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) setMe((await res.json()) as Account);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);
  return { me, loaded, refresh };
}

/** A query parameter, read once on the client. */
export function useQuery(name: string) {
  const [value] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch {
      return null;
    }
  });
  return value;
}

/** Same-site paths only. */
export function safePath(p: string | null, fallback = "/studio") {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : fallback;
}

export const PROVIDER_INFO = {
  google: {
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.66 0 9.4-3.98 9.4-9.58 0-.64-.07-1.13-.16-1.62H12Z" />
      </svg>
    ),
  },
  discord: {
    label: "Discord",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
        <path fill="#5865F2" d="M19.6 5.3A16.8 16.8 0 0 0 15.4 4l-.5 1a15.6 15.6 0 0 0-5.8 0L8.6 4a16.8 16.8 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.1 2.6l1.1-1.8a10.9 10.9 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a17 17 0 0 0 5.1-2.6c.4-4.4-.7-8.3-3.1-11.7ZM8.7 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
      </svg>
    ),
  },
  roblox: {
    label: "Roblox",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
        <path fill="currentColor" d="M5.2 2 2 18.8 18.8 22 22 5.2 5.2 2Zm8.6 12.7-4.5-.9.9-4.5 4.5.9-.9 4.5Z" />
      </svg>
    ),
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_INFO;
