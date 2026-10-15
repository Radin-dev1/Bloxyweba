"use client";

import { useEffect, useState } from "react";
import { BloxyMark } from "./icons";

// A scripted replay of one Bloxy run, so visitors see what actually happens in Studio.
const STEPS = [
  { tool: "Checked Studio", target: "LavaRun.rbxl" },
  { tool: "Explored", target: "Workspace" },
  { tool: "Created", target: "Workspace.Obby" },
  { tool: "Ran Luau", target: "build 12 stages" },
  { tool: "Wrote", target: "ServerScriptService.Checkpoints" },
  { tool: "Read Output", target: "0 errors" },
];

const TREE = [
  { d: 0, name: "Workspace", cls: "svc" },
  { d: 1, name: "Baseplate", cls: "part" },
  { d: 1, name: "Obby", cls: "model", fresh: 2 },
  { d: 2, name: "Stage1 … Stage12", cls: "part", fresh: 3 },
  { d: 2, name: "Checkpoints", cls: "folder", fresh: 3 },
  { d: 0, name: "ServerScriptService", cls: "svc" },
  { d: 1, name: "Checkpoints", cls: "script", fresh: 4 },
  { d: 0, name: "StarterGui", cls: "svc" },
];

const CLS_COLOR: Record<string, string> = {
  svc: "bg-white/30",
  part: "bg-sky-400/70",
  model: "bg-violet-400/80",
  folder: "bg-amber-300/70",
  script: "bg-emerald-400/80",
};

// Stage blocks in the viewport: [left%, bottom%, width%, hue].
const BLOCKS: [number, number, number, string][] = [
  [8, 20, 13, "#2f7dff"],
  [24, 28, 11, "#2f7dff"],
  [38, 36, 10, "#5c9bff"],
  [51, 30, 10, "#5c9bff"],
  [63, 40, 9, "#7fb0ff"],
  [75, 48, 9, "#7fb0ff"],
  [86, 56, 8, "#34e0a1"],
];

export default function StudioMock() {
  const [step, setStep] = useState(0); // 0..STEPS.length (+ hold)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= STEPS.length + 3 ? 0 : s + 1)), 1100);
    return () => clearInterval(id);
  }, []);

  const built = step >= 4;
  const done = step >= STEPS.length + 1;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-2 shadow-[0_60px_160px_-60px_rgba(47,125,255,0.5)]">
      <div className="overflow-hidden rounded-[calc(2rem-0.5rem)] bg-[#141418] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 font-mono text-[11px] text-white/35">LavaRun — Roblox Studio</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-signal/10 px-2 py-0.5 text-[10px] font-medium text-signal">
            <span className="relative flex size-1.5">
              <span className="animate-pulse-ring absolute inset-0 rounded-full bg-signal" />
              <span className="relative size-1.5 rounded-full bg-signal" />
            </span>
            Bloxy connected
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
          {/* Explorer */}
          <div className="hidden border-r border-white/[0.06] p-3 md:block">
            <p className="mb-2 text-[10px] font-medium tracking-[0.2em] text-white/30 uppercase">Explorer</p>
            <ul className="space-y-1">
              {TREE.map((n, i) => {
                const visible = !n.fresh || step >= n.fresh;
                return (
                  <li
                    key={i}
                    style={{ paddingLeft: n.d * 14 }}
                    className={`flex items-center gap-2 rounded-md py-0.5 font-mono text-[11px] transition-all duration-700 ease-[var(--ease-spring)] ${
                      visible ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
                    } ${n.fresh && step === n.fresh ? "bg-blox/15 text-white" : "text-white/55"}`}
                  >
                    <span className={`size-2 rounded-[3px] ${CLS_COLOR[n.cls]}`} />
                    {n.name}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Viewport */}
          <div className="relative h-[340px] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,#1d2b4a_0%,#121218_60%)] md:h-[420px]">
            {/* Perspective floor grid */}
            <div
              className="absolute inset-x-[-20%] bottom-[-10%] h-[70%] opacity-40"
              style={{
                transform: "perspective(600px) rotateX(62deg)",
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            {/* Lava glow */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-orange-600/40 via-orange-500/10 to-transparent" />

            {/* Blocks stay left of the chat overlay on desktop. */}
            <div className="absolute inset-0 md:right-[360px]">
            {BLOCKS.map(([left, bottom, width, color], i) => (
              <div
                key={i}
                className="absolute h-4 rounded-[4px] transition-all duration-700 ease-[var(--ease-spring)]"
                style={{
                  left: `${left}%`,
                  bottom: `${bottom}%`,
                  width: `${width}%`,
                  background: `linear-gradient(180deg, ${color}, ${color}aa)`,
                  boxShadow: `0 10px 30px -6px ${color}99, inset 0 1px 0 rgba(255,255,255,0.4)`,
                  opacity: built ? 1 : 0,
                  transform: built ? "translateY(0) scale(1)" : "translateY(-40px) scale(0.9)",
                  transitionDelay: built ? `${i * 90}ms` : "0ms",
                }}
              />
            ))}
            </div>

            {/* Floating Bloxy chat, glass over the viewport. */}
            <div className="absolute right-3 bottom-3 left-3 rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur-xl md:left-auto md:w-[330px]">
              <div className="flex items-start gap-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blox/25 px-3 py-1.5 text-[12px] text-white/90">
                  Make a lava obby with 12 stages and checkpoints
                </div>
              </div>
              <div className="mt-2.5 flex items-start gap-2">
                <BloxyMark className="size-5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  {STEPS.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 text-[11px] transition-all duration-500 ease-[var(--ease-spring)] ${
                        step > i ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                      } ${step > i + 1 ? "text-white/45" : "text-white/85"}`}
                    >
                      <span className={step > i + 1 ? "text-signal" : "text-blox-soft"}>{step > i + 1 ? "✓" : "•"}</span>
                      <span className="font-medium">{s.tool}</span>
                      <span className="truncate font-mono text-white/35">{s.target}</span>
                    </div>
                  ))}
                  <p
                    className={`pt-1 text-[12px] leading-snug text-white/80 transition-all duration-700 ease-[var(--ease-spring)] ${
                      done ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    Built 12 stages in <span className="font-mono text-blox-soft">Workspace.Obby</span> with
                    checkpoint saving. Press Play to try it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
