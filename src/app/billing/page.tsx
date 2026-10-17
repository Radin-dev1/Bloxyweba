import type { Metadata } from "next";
import { ClientAccount } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "Billing · Bloxy" };

/** lava.top returns buyers here after checkout; it's the account page with the payment status. */
export default function BillingRoute() {
  return <ClientAccount />;
}
