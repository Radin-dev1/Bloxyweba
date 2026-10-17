import type { Metadata } from "next";
import { ClientAuthCallback } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "Logging in · Bloxy" };

/** Supabase returns here after Google or an email confirmation link. */
export default function AuthCallbackRoute() {
  return <ClientAuthCallback mode="callback" />;
}
