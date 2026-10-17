import type { Metadata } from "next";
import { ClientAccount } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "Account · Bloxy" };

export default function AccountRoute() {
  return <ClientAccount />;
}
