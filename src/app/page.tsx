import HeroPrompt from "@/components/landing/HeroPrompt";
import Nav from "@/components/landing/Nav";
import Reveal from "@/components/landing/Reveal";
import StudioMock from "@/components/landing/StudioMock";
import {
  ArrowUpRight,
  BloxyLogo,
  Code,
  Cube,
  Download,
  Key,
  Link,
  Search,
  Shield,
  Sparkle,
  Terminal,
  Undo,
} from "@/components/landing/icons";

const TOOL_GROUPS = [
  {
    icon: Search,
    title: "Explore",
    blurb: "Reads your place before it touches anything.",
    tools: ["get_studio_state", "list_children", "search_instances", "get_properties", "grep_scripts"],
  },
  {
    icon: Code,
    title: "Script",
    blurb: "Writes and patches real scripts in place.",
    tools: ["read_script", "write_script", "edit_script"],
  },
  {
    icon: Cube,
    title: "Build",
    blurb: "Creates, edits and arranges instances.",
    tools: ["create_instance", "set_properties", "clone_instance", "delete_instance", "insert_asset", "set_selection"],
  },
  {
    icon: Terminal,
    title: "Run",
    blurb: "Runs Luau for bulk work, then checks Output.",
    tools: ["run_luau", "get_output"],
  },
];

const FAQ = [
  ["What is Bloxy?", "A website with an AI agent that edits your open Roblox Studio place through a small plugin."],
  ["Is it free?", "Bloxy is free. You pay your AI provider directly for what you use, with your own API key."],
  ["Where is my API key stored?", "Only in your browser. It is sent with each request and never saved on our server."],
  ["Can it break my game?", "Every change is one Ctrl+Z away in Studio, and it reads before it writes."],
  ["Which models work?", "Claude (Opus, Sonnet, Haiku) and Gemini (2.5 Pro, Flash). ChatGPT is coming."],
  ["Does it need HTTP enabled?", "No. Plugins can make requests; Studio just asks you once to allow Bloxy's site."],
  ["Does it write real code?", "Yes: typed, server-authoritative Luau that follows your existing project structure."],
  ["How do I start?", "Download the plugin, pair it with the code on the Studio page, then describe what you want."],
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium tracking-[0.2em] text-white/60 uppercase">
      {children}
    </span>
  );
}

function Bezel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2rem] border border-white/[0.08] bg-white/[0.025] p-1.5 ${className}`}>
      <div className="h-full rounded-[calc(2rem-0.375rem)] bg-panel p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] md:p-9">
        {children}
      </div>
    </div>
  );
}

function CTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-3 rounded-full bg-blox py-2 pr-2 pl-6 font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_50px_-15px_rgba(47,125,255,0.8)] transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97]"
    >
      {children}
      <span className="grid size-9 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105">
        <ArrowUpRight className="size-4" />
      </span>
    </a>
  );
}

export default function Landing() {
  return (
    <div className="grain relative overflow-x-clip bg-ink">
      <Nav />

      {/* ───────────── Hero ───────────── */}
      <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 pt-32 pb-20 text-center">
        {/* Atmosphere: deep blue sky glow + faint horizon, like light over a baseplate. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-[-30%] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(47,125,255,0.35),transparent)]" />
          <div className="absolute top-[10%] left-[10%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(47,125,255,0.12),transparent)]" />
          <div className="absolute right-[5%] bottom-[15%] h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(127,176,255,0.12),transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
        </div>

        <div className="relative">
          <Reveal>
            <Eyebrow>
              <span className="size-1.5 rounded-full bg-signal" />
              AI agent for Roblox Studio
            </Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-7 max-w-5xl font-display text-[clamp(2.6rem,8vw,6.5rem)] leading-[0.92] font-extrabold tracking-[-0.04em] uppercase">
              <span className="text-shimmer">Build Roblox games</span>
              <br />
              by{" "}
              <span className="relative inline-block -rotate-3 rounded-2xl bg-blox px-4 pb-1 text-white shadow-[0_20px_60px_-15px_rgba(47,125,255,0.9),inset_0_2px_2px_rgba(255,255,255,0.3)] md:px-6">
                talking
              </span>{" "}
              to Studio.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
              Describe it. Bloxy explores your place, writes the scripts, builds the parts and checks Output, live
              in your open Studio.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-10 w-full">
            <HeroPrompt />
          </Reveal>
        </div>
      </section>

      {/* ───────────── Showcase ───────────── */}
      <section className="relative px-4 pb-28 md:px-8 md:pb-40">
        <Reveal className="mx-auto max-w-6xl">
          <StudioMock />
        </Reveal>
      </section>

      {/* ───────────── How it works ───────────── */}
      <section id="how" className="relative scroll-mt-24 px-4 py-28 md:px-8 md:py-40">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-bold tracking-[-0.035em]">
              Three steps.
              <br />
              <span className="text-white/35">Then just talk.</span>
            </h2>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-12 md:grid-rows-2">
            <Reveal className="md:col-span-7 md:row-span-2">
              <Bezel className="h-full">
                <div className="flex h-full flex-col">
                  <span className="font-mono text-xs text-blox-soft">01</span>
                  <h3 className="mt-3 font-display text-3xl font-bold tracking-tight">Drop in the plugin</h3>
                  <p className="mt-3 max-w-md text-white/50">
                    One file. Put it in Studio&apos;s Plugins folder and restart. A Bloxy button appears in the Plugins
                    tab.
                  </p>
                  <div className="mt-8 flex-1 rounded-2xl border border-white/[0.06] bg-black/40 p-5 font-mono text-[12px] leading-6 text-white/45">
                    <p>
                      <span className="text-white/25">%LOCALAPPDATA%</span>\Roblox\Plugins\
                    </p>
                    <p className="flex items-center gap-2 text-white/85">
                      <span className="size-2 rounded-[3px] bg-blox-soft/80" /> Bloxy.server.lua
                      <span className="ml-auto rounded-full bg-signal/10 px-2 text-[10px] text-signal">28 KB</span>
                    </p>
                  </div>
                  <a
                    href="/api/plugin/download"
                    className="group mt-6 inline-flex w-max items-center gap-2 rounded-full border border-white/15 py-1.5 pr-1.5 pl-4 text-sm transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-white/[0.06]"
                  >
                    Download plugin
                    <span className="grid size-7 place-items-center rounded-full bg-white/10 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-y-0.5">
                      <Download className="size-3.5" />
                    </span>
                  </a>
                </div>
              </Bezel>
            </Reveal>

            <Reveal delay={100} className="md:col-span-5">
              <Bezel className="h-full">
                <span className="font-mono text-xs text-blox-soft">02</span>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl font-bold tracking-tight">Pair with a code</h3>
                    <p className="mt-2 text-sm text-white/50">Six letters link this tab to your Studio. No account.</p>
                  </div>
                  <Link className="size-6 shrink-0 text-white/30" />
                </div>
                <div className="mt-6 flex gap-1.5">
                  {"K7QM2X".split("").map((c, i) => (
                    <span
                      key={i}
                      className="grid h-12 flex-1 place-items-center rounded-xl border border-white/10 bg-black/40 font-mono text-xl font-semibold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </Bezel>
            </Reveal>

            <Reveal delay={200} className="md:col-span-5">
              <Bezel className="h-full">
                <span className="font-mono text-xs text-blox-soft">03</span>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl font-bold tracking-tight">Ask for anything</h3>
                    <p className="mt-2 text-sm text-white/50">
                      Systems, maps, UI, bug fixes. Watch each step land in Studio.
                    </p>
                  </div>
                  <Sparkle className="size-6 shrink-0 text-white/30" />
                </div>
                <div className="mt-6 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">
                  Add a shop that sells speed coils for 50 coins
                  <span className="animate-caret ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-blox-soft" />
                </div>
              </Bezel>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────────── Tools ───────────── */}
      <section id="tools" className="relative scroll-mt-24 px-4 py-28 md:px-8 md:py-40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 md:grid-cols-12">
          <Reveal className="md:col-span-5">
            <div className="md:sticky md:top-32">
              <Eyebrow>16 Studio tools</Eyebrow>
              <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-bold tracking-[-0.035em]">
                Real edits.
                <br />
                <span className="whitespace-nowrap text-white/35">Not copy-paste.</span>
              </h2>
              <p className="mt-6 max-w-sm text-white/50">
                Bloxy doesn&apos;t hand you code to paste. It works inside your place like a teammate with Studio
                open.
              </p>
              <div className="mt-8 flex items-center gap-3 text-sm text-white/60">
                <span className="grid size-10 place-items-center rounded-full border border-white/10">
                  <Undo className="size-4" />
                </span>
                Every change is a single Ctrl+Z.
              </div>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:col-span-7">
            {TOOL_GROUPS.map((g, i) => (
              <Reveal key={g.title} delay={i * 80} className={i % 2 === 1 ? "sm:translate-y-10" : ""}>
                <Bezel className="h-full">
                  <g.icon className="size-6 text-blox-soft" />
                  <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">{g.title}</h3>
                  <p className="mt-2 text-sm text-white/50">{g.blurb}</p>
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {g.tools.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-white/[0.07] bg-black/30 px-2 py-0.5 font-mono text-[11px] text-white/55"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Bezel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Models ───────────── */}
      <section id="models" className="relative scroll-mt-24 px-4 py-28 md:px-8 md:py-40">
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(47,125,255,0.14),transparent)]" />
        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>Bring your own key</Eyebrow>
            <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-bold tracking-[-0.035em]">
              The best models.
              <br />
              <span className="text-white/35">Your key, your bill.</span>
            </h2>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              { name: "Claude", by: "Anthropic", models: ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5"], tag: "Default", soon: false },
              { name: "Gemini", by: "Google", models: ["2.5 Pro", "2.5 Flash"], tag: "Supported", soon: false },
              { name: "ChatGPT", by: "OpenAI", models: ["Coming soon"], tag: "Soon", soon: true },
            ].map((m, i) => (
              <Reveal key={m.name} delay={i * 90}>
                <Bezel className={`h-full ${m.soon ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">{m.by}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-[0.15em] uppercase ${
                        i === 0 ? "bg-blox/20 text-blox-soft" : "bg-white/[0.06] text-white/50"
                      }`}
                    >
                      {m.tag}
                    </span>
                  </div>
                  <h3 className="mt-10 font-display text-4xl font-bold tracking-tight">{m.name}</h3>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {m.models.map((x) => (
                      <span key={x} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-white/55">
                        {x}
                      </span>
                    ))}
                  </div>
                </Bezel>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mx-auto mt-8 max-w-3xl">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:flex-row sm:items-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-signal/10 text-signal">
                <Shield className="size-5" />
              </span>
              <p className="text-sm leading-relaxed text-white/60">
                <span className="text-white">Your key never leaves your browser&apos;s storage.</span> It rides along
                with each request to the AI provider and is never written to our server.
              </p>
              <Key className="ml-auto hidden size-5 shrink-0 text-white/25 sm:block" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="relative scroll-mt-24 px-4 py-28 md:px-8 md:py-40">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.03em]">Questions</h2>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={(i % 4) * 60}>
                <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors duration-500 ease-[var(--ease-spring)] hover:border-white/15 hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{q}</h3>
                    <ArrowUpRight className="size-4 shrink-0 text-white/25 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/60" />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/45">{a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Final CTA ───────────── */}
      <section className="relative px-4 py-28 md:px-8 md:py-40">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(120%_120%_at_50%_0%,#1b3d8a_0%,#0b1430_45%,#07070a_100%)] px-6 py-24 text-center md:py-32">
            <div
              className="pointer-events-none absolute inset-x-[-10%] bottom-[-30%] h-[70%] opacity-30"
              style={{
                transform: "perspective(500px) rotateX(60deg)",
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />
            <h2 className="relative mx-auto max-w-3xl font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.92] font-extrabold tracking-[-0.04em] uppercase">
              Your next game starts with a sentence.
            </h2>
            <div className="relative mt-10">
              <CTA href="/studio">Open Bloxy Studio</CTA>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="px-4 pb-10 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-sm text-white/35 sm:flex-row">
          <div className="flex items-center gap-2">
            <BloxyLogo className="text-[18px] text-white/60" />
          </div>
          <p>Not affiliated with Roblox Corporation.</p>
          <a href="https://github.com/Radin-dev1/Bloxyweba" className="hover:text-white/70">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
