import type { Metadata } from "next";
import { ClientPricing } from "@/components/account/ClientPages";

export const metadata: Metadata = { title: "Pricing · Bloxy", description: "Free daily bits, Bloxy Pro and bit packs." };

export default function PricingRoute() {
  return <ClientPricing />;
}
