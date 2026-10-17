"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BloxyLogo } from "./icons";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#tools", label: "Tools" },
  { href: "#3d", label: "3D" },
  { href: "#models", label: "Models" },
  { href: "#faq", label: "FAQ" },
  { href: "/pricing", label: "Pricing" },
  { href: "/chat", label: "Chat" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 pt-4 md:px-8 md:pt-6">
        <a href="#" className="flex items-center gap-2.5" aria-label="Bloxy home">
          <BloxyLogo className="text-[26px] text-white" />
        </a>

        {/* Floating glass island, detached from the edges. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-1.5 text-sm text-white/65 transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-white/[0.06] hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/studio"
            className="group hidden items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-4 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_30px_-8px_rgba(47,125,255,0.7)] transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97] sm:flex"
          >
            Open Studio
            <span className="grid size-7 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
              <ArrowUpRight className="size-3.5" />
            </span>
          </a>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="relative grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl md:hidden"
          >
            <span
              className={`absolute h-px w-4 bg-white transition-transform duration-500 ease-[var(--ease-spring)] ${
                open ? "rotate-45" : "-translate-y-[3px]"
              }`}
            />
            <span
              className={`absolute h-px w-4 bg-white transition-transform duration-500 ease-[var(--ease-spring)] ${
                open ? "-rotate-45" : "translate-y-[3px]"
              }`}
            />
          </button>
        </div>
      </header>

      {/* Mobile overlay menu with staggered link reveal. */}
      <div
        className={`fixed inset-0 z-40 bg-black/85 backdrop-blur-3xl transition-opacity duration-500 ease-[var(--ease-spring)] md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <nav className="flex h-full flex-col justify-center gap-2 px-8">
          {[...LINKS, { href: "/studio", label: "Open Studio" }].map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${100 + i * 50}ms` : "0ms" }}
              className={`font-display text-4xl font-bold tracking-tight transition-all duration-700 ease-[var(--ease-spring)] ${
                open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
              }`}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
