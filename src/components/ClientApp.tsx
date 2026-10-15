"use client";

import dynamic from "next/dynamic";

// The app lives on browser state (localStorage session + keys), so skip server rendering.
const StudioApp = dynamic(() => import("./studio/StudioApp"), {
  ssr: false,
  loading: () => <div className="h-dvh bg-ink" />,
});

export default function ClientApp() {
  return <StudioApp />;
}
