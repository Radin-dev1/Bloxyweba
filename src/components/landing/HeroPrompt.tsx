"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Sparkle } from "./icons";

const IDEAS = ["Tycoon dropper", "Obby with checkpoints", "Sword combat", "Day/night cycle", "Shop UI"];

/** The hero composer: whatever you type here opens in /studio, ready to send. */
export default function HeroPrompt() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<"claude" | "gemini">("claude");

  function go(prompt: string) {
    try {
      const raw = localStorage.getItem("bloxy.settings");
      const saved = raw ? JSON.parse(raw) : {};
      localStorage.setItem("bloxy.settings", JSON.stringify({ ...saved, provider }));
    } catch {}
    const q = prompt.trim() ? `?prompt=${encodeURIComponent(prompt.trim())}` : "";
    router.push(`/studio${q}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Double bezel: outer tray + inner core with concentric radius. */}
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_40px_120px_-40px_rgba(47,125,255,0.45)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
          className="rounded-[calc(1.75rem-0.375rem)] bg-[#0b0b0e] p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                go(text);
              }
            }}
            rows={2}
            placeholder="Make a lava obby with 12 stages, checkpoints and a timer…"
            className="w-full resize-none bg-transparent px-2 pt-1 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1 text-xs">
              {(["claude", "gemini"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`rounded-full px-3 py-1 capitalize transition-all duration-500 ease-[var(--ease-spring)] ${
                    provider === p ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
                  }`}
                >
                  {p}
                </button>
              ))}
              <span className="hidden px-2 text-white/25 sm:inline">ChatGPT soon</span>
            </div>
            <button
              type="submit"
              className="group flex items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-4 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97]"
            >
              Build it
              <span className="grid size-7 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-0.5 group-hover:scale-105">
                <ArrowUp className="size-3.5" />
              </span>
            </button>
          </div>
        </form>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Sparkle className="size-3.5 text-white/30" />
        {IDEAS.map((idea) => (
          <button
            key={idea}
            onClick={() => setText(`Make a ${idea.toLowerCase()} in my place`)}
            className="rounded-full border border-white/[0.07] px-3 py-1 text-xs text-white/50 transition-colors duration-500 ease-[var(--ease-spring)] hover:border-white/20 hover:text-white/85"
          >
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
