import type { Metadata } from "next";
import { ClientAuthCallback } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "New password · Bloxy" };

/** Supabase's password reset email links here. */
export default function AuthResetRoute() {
  return <ClientAuthCallback mode="reset" />;
}
