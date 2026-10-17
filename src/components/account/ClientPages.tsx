"use client";

import dynamic from "next/dynamic";

// These pages read the URL, the browser language and the session, so they render client-side.
const blank = () => <div className="min-h-dvh bg-[#0b0c10]" />;
const Auth = dynamic(() => import("./AuthPage"), { ssr: false, loading: blank });
const Pricing = dynamic(() => import("./PricingPage"), { ssr: false, loading: blank });
const Account = dynamic(() => import("./AccountPage"), { ssr: false, loading: blank });

export function ClientAuth() {
  return <Auth />;
}
export function ClientPricing() {
  return <Pricing />;
}
export function ClientAccount() {
  return <Account />;
}
