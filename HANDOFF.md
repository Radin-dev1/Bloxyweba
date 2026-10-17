# Bloxy: handoff for the next AI / developer

Read this first, then `README.md`, `AGENTS.md` and `docs/accounts-and-payments.md`.

## What Bloxy is

A Next.js website whose AI agent builds inside **Roblox Studio** (the owner's own take on
Ropilot), plus a 3D workspace, a node editor, a plain chat page, accounts and paid plans. It is
**not** the older `Projects/Bloxy` project.

- Repo: https://github.com/Radin-dev1/Bloxyweba (branch `main`; the owner wants work pushed there)
- Domain: **https://trybloxy.com** (registered at Squarespace; DNS must be moved to Vercel, see the
  setup guide). Old Vercel URL: https://bloxyweba-smoky.vercel.app
- Local: `npm install && npm run dev` → http://localhost:3000. `start.bat` also finds Blender, opens
  Roblox Studio and starts the dev server.

## Map of the code

| Area | Where |
| --- | --- |
| AI chat agent | `src/app/api/chat/route.ts` (modes: Bloxy plugin, Roblox Studio's built-in MCP, offline), runners in `src/lib/agent/` (`openrouter.ts`, `claude.ts`, `gemini.ts`), Studio tools + system prompt in `src/lib/tools.ts` |
| AI knowledge | `src/lib/skills.ts` (short packs picked per message), `src/lib/knowledge.ts` + `data/knowledge/chunks.json` (~900 sections from MIT repos, BM25, `search_knowledge` tool; rebuild with `scripts/build-knowledge.mjs`), credits in `docs/skill-sources.md` |
| 3D: parts | `build_model` tool (`src/lib/agent/offline.ts`), checks in `src/lib/buildCheck.ts` (floating, sunk, stretched balls…) |
| 3D: Blender sculpting | `sculpt_model` (`src/lib/agent/sculpt.ts`), runner `blender/bloxy_runner.py`, `src/lib/blender.ts` (safety denylist, secret-free env, 4-view render sheet the AI looks at). Local only, never on Vercel |
| 3D: open-source AI | `generate_3d_model` (`src/lib/agent/generate3d.ts`), `src/lib/hf.ts` + `src/lib/hfModels.ts` (FLUX / Qwen-Image / HiDream → Hunyuan3D 2.1 / TRELLIS.2 / Stable Fast 3D / UniForge3D with fallbacks, via Hugging Face Spaces and `HF_TOKEN`), route `/api/gen/hf3d`, Idea Forge "AI mesh" |
| Studio plugin (Luau, v0.4.0) | `plugin/Bloxy.server.lua`: long-poll bridge, tools, and a chat panel that relays through the open Bloxy tab (`/api/plugin/chat`, `/api/session/inbox`, `usePluginInbox.ts`) |
| Bridge | `src/lib/bridge/` (memory locally, Upstash Redis when `KV_REST_API_*` is set) |
| Studio app UI | `src/components/studio/` (`StudioApp.tsx` with tabs 3D Workspace / Nodes / Chat (`ChatView.tsx`) / Library (`LibraryView.tsx`) / Scripts (`ScriptsView.tsx`), `Viewport3D.tsx`, Explorer, Properties, `NodeEditor.tsx`, dock/Idea Forge), chat page `src/components/chat/` |
| Accounts | Login: Supabase (email, Google, Discord) via `src/lib/supabase.ts`, `/api/auth/supabase` (verifies the Supabase token, starts Bloxy's own session) and `/auth/callback`, `/auth/reset`; Roblox via Bloxy's own OAuth. `src/lib/accounts.ts` links all methods to one account (Roblox-first accounts keep the Roblox id), `src/lib/auth.ts` (signed cookie, generic OAuth, fallback email+password when Supabase isn't set), pages `/login`, `/account` |
| Bits + plans | `src/lib/bits.ts`: each request costs its real OpenRouter cost x `BITS_MARKUP` (default 2, free models 0, holds sized per model), 100 free bits a day; plans grant bits worth their USD price on every payment (`planCredits` in `lava.ts`); AI 3D limited per plan per day (`QUOTAS` in `accounts.ts`). Store: `src/lib/kv.ts` |
| Payments (lava.top) | `src/lib/lava.ts` (invoices, live prices, webhook, cancel, plan switching), routes `src/app/api/billing/*`, pages `/pricing`, `/billing`. Pro offer `3e9cb634-82fe-49ba-ad5b-9fbe2b5abc22`, Studio offer `c3fba64d-6d08-4dc8-aaa4-bdc4e4765319` (one product `dc0936b6-…`), built in as defaults |
| Landing | `src/app/page.tsx`, `src/components/landing/`, showcase renders in `public/showcase/` |

## What still needs the owner (not code)

1. Move trybloxy.com DNS from Squarespace to Vercel and set `SITE_URL=https://trybloxy.com`.
2. Set env vars in Vercel: `AUTH_SECRET`, Upstash Redis, `OPENROUTER_API_KEY`, `HF_TOKEN`,
   `LAVA_API_KEY`, `LAVA_WEBHOOK_SECRET`, Google/Discord/Roblox OAuth ids and secrets.
3. lava.top: point the webhook at `https://trybloxy.com/api/billing/webhook` (auth by API key =
   `LAVA_WEBHOOK_SECRET`), and create the two bit packs (`LAVA_OFFER_BITS_SMALL/LARGE`).
Full steps: `docs/accounts-and-payments.md`.

## Not yet tested for real

- Payments were tested only against a fake lava.top (checkout, webhooks, renewals, plan switch,
  cancel). Do one real low-price purchase before launch.
- Google/Discord/Roblox OAuth: the redirect flow is checked, a real login is not (no keys yet).
- The Studio plugin's chat panel: syntax-checked and the API it calls is tested, but not clicked
  in real Studio. TRELLIS.2 / Stable Fast 3D / UniForge3D need `HF_TOKEN` to test.
- Real model runs: the AI was tested with fake model servers; judge quality with real models.

## Rules and gotchas

- **Never put secrets in git.** Keys go in Vercel env vars or `.env.local` (git-ignored). Test
  stand-ins: `OPENROUTER_BASE_URL` and `LAVA_BASE_URL` can point at fake local servers; delete
  `.env.local` and restart the dev server afterwards.
- **Next.js 16** with `cacheComponents`: read `node_modules/next/dist/docs/` first. Route handlers
  that must run per request call `await connection()`. Don't let the bundler see literal Program
  Files paths or spawn calls (use `/* turbopackIgnore: true */` dynamic imports), or the build breaks.
- **Security choices to keep:** only verified emails (Google/Discord) auto-link accounts; admin
  checks never trust emails; Blender gets no secrets; AI Blender scripts pass a denylist; the
  lava.top webhook checks its key and applies each event once.
- **Licences:** only MIT text is vendored (`data/knowledge/LICENSES.md`). SyphoDev,
  brockmartin and sentinelcore repos are facts-only (no copied text).
- **Before committing:** `npx eslint .`, `npx tsc --noEmit`, `npm run build` (check the exit code;
  a pipe can hide a failure). Commit only the files you changed; don't `git add` broadly
  (`.claude/` and `brand/` renders are untracked on purpose).
- **Windows Git Bash:** long inline scripts with quotes or backslashes break; write a script file
  and run it.
- **Owner's taste:** Roblox Studio / Nilo / ForgeGUI look, dark glass panels, Bloxy blue `#2F7DFF`;
  they like to see changes in the browser and want work pushed to `main` when done.
