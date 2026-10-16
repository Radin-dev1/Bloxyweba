# Bloxy — handoff for the next AI / developer

Read this first, then `README.md` and `AGENTS.md`.

## What Bloxy is

A website (Next.js) with an AI agent that builds inside **Roblox Studio**. It's the owner's own take on Ropilot. A Studio plugin connects to the site, so the AI can read and edit the open place. It is **not** the older `Projects/Bloxy` project, so don't mix the two up.

- Repo: https://github.com/Radin-dev1/Bloxyweba (branch `main`, deployed on Vercel)
- Production: https://bloxyweba-smoky.vercel.app
- Local: `npm install && npm run dev` → http://localhost:3000 (landing), `/studio` (the app)

## Architecture (where things are)

| Area | Files |
| --- | --- |
| Studio plugin (Luau, v0.3.0) | `plugin/Bloxy.server.lua`: HTTP long-poll bridge, the tools table (read/write scripts, instances, `run_luau`, `get_scene`, `insert_parts`, …), dock UI |
| Bridge (sessions, pair codes, command queue) | `src/lib/bridge/`: `memory.ts` (local), `redis.ts` (Upstash, used automatically when `KV_REST_API_*` or `UPSTASH_REDIS_REST_*` env vars are set), `index.ts` picks one |
| AI chat agent | `src/lib/agent/` (Claude via `@anthropic-ai/sdk`, Gemini via `@google/genai`), tools in `src/lib/tools.ts`, route `src/app/api/chat/route.ts` (NDJSON stream) |
| Website → Studio direct calls | `src/app/api/studio/route.ts` (allowlist: `get_scene`, `set_selection`, `set_properties`, `insert_parts`, `get_studio_state`) |
| Generation (OpenRouter) | `src/lib/openrouter.ts`, `src/app/api/gen/{image,video,video/status,video/content,model3d,models}` |
| Studio app UI | `src/components/studio/`: `StudioApp.tsx` (layout, tabs, chat dock), `Viewport3D.tsx` (R3F 3D workspace), `Explorer.tsx`, `Properties.tsx`, `NodeEditor.tsx` + `nodes/` (React Flow canvas) |
| Landing page | `src/app/page.tsx`, `src/components/landing/` |
| Roblox sign-in + bits | `src/lib/auth.ts` (OAuth + PKCE, signed cookie), `src/lib/bits.ts` (ledger, `resolveBilling`), routes `src/app/api/auth/*`, `src/app/api/bits/grant`, UI `src/components/studio/AccountPill.tsx` + `useAccount.ts`; chat on bits = provider `openrouter` ("Bloxy") in `src/lib/agent/openrouter.ts` |
| Brand / logo | `brand/` (Spark Brick logo kit, `GUIDELINES.md`), components `BloxyMark` / `BloxyWordmark` / `BloxyLogo` in `src/components/landing/icons.tsx` |

## Current state (all pushed)

- **3D Workspace** looks like Roblox Studio:
  - **Baseplate:** uses Roblox's own texture (`public/roblox/baseplate.png`, 8 studs per tile, Transparency 0.8). In Bloxy every baseplate is drawn #5b5b5b and stretched to 60k studs with fog, so no edge shows. This is display only; Studio's real part is unchanged.
  - **Panels and tools:** Explorer and Properties (editable), Select/Move/Scale/Rotate with Ctrl+1–4, and a view cube.
  - **Starting state:** it opens empty, with just the Baseplate.
- **Nodes tab** (React Flow):
  - **Toolbar:** at the bottom, like the owner's screenshot.
  - **Node types:** Text, Note, Upload, Image, Video, 3D Model, Studio step, Check.
  - **Wires carry data:** text → prompts, image → references or the first video frame, 3D → Studio step (the model is inserted first).
  - **3D generation is "3D as code":** an LLM on OpenRouter returns JSON parts (validated by zod `Build` in `openrouter.ts`). It previews in the node, then "Insert into Studio" calls the plugin tool `insert_parts`.
  - **Starting state:** the canvas starts empty and autosaves to localStorage (`bloxy.workflow.v2`).
- **Create dock + Environment** (inspired by Nilo, own design): bottom-left dock with Idea Forge (I), Avatar (R) and Export (E) in `src/components/studio/dock/`; right-click the 3D view for the create wheel (parts, from text/image, avatar, import a Bloxy JSON, ask Bloxy); the rail's Environment panel sets sky/ground/fog presets drawn procedurally in `environment.ts` (display only, saved in localStorage).
- **Model browser** (ForgeGUI-style): `ModelBrowser.tsx` + `ProviderLogo.tsx`, fed by `/api/gen/models` (now with description, context, price, reasoning/vision/tools). Settings hides API keys under "Use your own API keys".
- **Nodes**: searchable Add Node menu (`nodes/AddNodeMenu.tsx`), 6 templates and a template gallery.
- **Chat** is styled after ForgeGUI: a floating prompt bar over the 3D view, shown only on the Workspace tab.
- **API keys:** user keys are entered in Settings and kept in the browser (Claude, Gemini, OpenRouter). The server can fall back to `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.

- **3D generation uses the 3DCode dataset** (huggingface.co/datasets/YipengGao/3DCode, 243 object categories): `scripts/build-3dcode-index.py` builds `data/3dcode/index.json` (construction descriptions + one trimmed Blender geometry script per category, Infinigen BSD-3 notice in `data/3dcode/NOTICE.md`). `src/lib/threeDCode.ts` does BM25 retrieval; `/api/gen/model3d` adds the closest references to the prompt in both modes (scripts only in Blender mode) and returns `references`.
- **Environment** uses real CC0 Poly Haven photos (`public/env/`), with normal maps, an anti-tiling shader in `Viewport3D.tsx` (`breakUpTiling`) and sky-based lighting. AI lab logos are LobeHub SVGs in `public/logos/`.

- **Chat runs as a background job** (`/api/chat` POST starts it with `after()`, GET polls events, DELETE stops; events live in the bridge). The conversation is saved in the browser (`bloxy.chat.v1`) and a running reply resumes after a reload. **Without Studio** the chat still works: `src/lib/agent/offline.ts` gives the model a `build_model` tool that places models in the local workspace (saved in `bloxy.localPlace.v1`).
- **Free models only** (Settings, the model chip and the model browser): `settings.freeOnly`, `models.ts` (`FREE_RECOMMENDED`, `isFreeChatModel`), `freeModels.ts`. Idea Forge's Make 3D also uses a free model in this mode.
- **Testing without a real key:** set `OPENROUTER_BASE_URL` (in `.env.local`) to a fake OpenRouter server.

- **Skill packs** (`src/lib/skills.ts`): building, modeling, map and texture know-how distilled from the roblox-3d-model, roblox-texture-gen, building-maps, building-3d-objects and roblox-map skills. `pickSkills()` loads only the packs a message needs, for the chat and for 3D generation. `src/lib/buildCheck.ts` checks every offline build (floating, sunk, duplicate, grey parts, size vs a 5-stud player) and the agent fixes its own build from the report; 3D results are set down on the ground.
- **Chat-only page** at `/chat` (`src/components/chat/`): same conversation and AI as Studio, models it builds show as 3D previews inline and are saved into the local workspace.
- **Blender backend**: `blender/bloxy_runner.py` + `src/lib/blender.ts` + `/api/gen/blender`. Blender-mode 3D models are executed in real headless Blender (found automatically, or `BLENDER_PATH`), budgeted to 10k tris, scaled to studs, exported as GLB with a preview render. Scripts are checked against a denylist first; never runs on Vercel, and production needs `BLENDER_PATH`. Meshes show in Idea Forge ("Real mesh"), the Nodes 3D node and the workspace (saved in IndexedDB).

## Open items / next steps

0. **Turn on bits in production:** set `OPENROUTER_API_KEY`, `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, `AUTH_SECRET` and `ADMIN_ROBLOX_IDS` in Vercel, register the callback URL in the Roblox OAuth app, then redeploy. Untested against real Roblox and OpenRouter so far; tested with a fake key and a forged test session.

1. **Vercel Redis:** the project has no Redis yet, so Studio pairing on production returns a 503 with setup steps. Fix: Vercel → Storage → Upstash Redis → connect → redeploy.
2. **Roblox sky:** the owner will send Studio's sky. Put the six faces in `public/roblox/sky/` as `rt.png lf.png up.png dn.png bk.png ft.png`, set `HAS_SKYBOX = true` in `Viewport3D.tsx`, and check the face orientation visually.
3. **Untested with real keys:** OpenRouter image, video and 3D generation, and real Claude/Gemini chat runs. The routes are smoke-tested for key errors only.
4. **Not tested in real Studio:** the plugin has only been parse-checked and exercised with a fake plugin. Test `get_scene`, `set_properties` and `insert_parts` in live Studio.
5. **Video size on Vercel:** if OpenRouter returns no signed URL, `/api/gen/video/content` proxies the bytes, and Vercel caps responses at about 4.5 MB.
6. **Plugin toolbar icon** is a placeholder `rbxassetid`. The owner can upload `brand/export/icon-512.png` as a Decal and use that id.
7. **Ideas the owner mentioned:** ChatGPT/OpenAI as a chat provider (a provider slot is ready in `src/lib/agent/providers.ts`), and more node types (the toolbar screenshot also had audio and layout).

## Gotchas

- **Next.js 16** with `cacheComponents`: don't add `export const dynamic`; read `node_modules/next/dist/docs/` before using APIs.
- **Tailwind via `@tailwindcss/turbopack`:** CSS changes sometimes need a dev-server restart, and occasionally `rm -rf .next`.
- **Lint:** the React Compiler lint rules forbid mutating hook values. In R3F, read three.js objects through `useThree(s => s.get)()` inside effects.
- **Windows Git Bash:** long heredocs with quotes can break the shell, so write files directly. API paths starting with `/` get rewritten (use `MSYS_NO_PATHCONV=1`).
- **Checks before committing:** `npx eslint src`, `npx tsc --noEmit`, `npx tsx scripts/smoke-bridge.ts`, `npm run build`.
- **Owner's preferences:** they like seeing changes in the browser, pushing to `main` once work is done, and a Roblox Studio / Nilo / ForgeGUI look (dark glass panels, electric blue `#2F7DFF`).
