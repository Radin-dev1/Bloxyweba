import type { Metadata } from "next";
import ClientChat from "@/components/chat/ClientChat";

export const metadata: Metadata = { title: "Bloxy Chat" };

export default function ChatRoute() {
  return <ClientChat />;
}
