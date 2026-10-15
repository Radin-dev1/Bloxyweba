import type { Metadata } from "next";
import ClientApp from "@/components/ClientApp";

export const metadata: Metadata = { title: "Bloxy Studio" };

export default function StudioPage() {
  return <ClientApp />;
}
