import type { Metadata } from "next";
import { ClientAuth } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "Log in · Bloxy" };

export default function LoginRoute() {
  return <ClientAuth />;
}
