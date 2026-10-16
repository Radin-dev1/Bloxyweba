"use client";

import dynamic from "next/dynamic";

// Lives on browser state (session, keys, chat history), so skip server rendering.
const ChatPage = dynamic(() => import("./ChatPage"), {
  ssr: false,
  loading: () => <div className="h-dvh bg-[#0b0c10]" />,
});

export default function ClientChat() {
  return <ChatPage />;
}
