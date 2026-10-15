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
- **Chat** is styled after ForgeGUI: a floating prompt bar over the 3D view, shown only on the Workspace tab.
- **API keys:** user keys are entered in Settings and kept in the browser (Claude, Gemini, OpenRouter). The server can fall back to `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.

## Open items / next steps

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
