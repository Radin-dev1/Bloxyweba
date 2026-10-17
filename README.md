# Bloxy

An AI assistant website that connects to **Roblox Studio** and builds in your open place: it reads and edits scripts, creates and changes instances, and runs Luau. Pick **Claude** or **Gemini**, and bring your own API key.

## How it works

```
Browser (chat UI) ──POST /api/chat──▶ Next.js server ──▶ Claude / Gemini (tool use)
                                          │  ▲
                          command queue   │  │  results
                                          ▼  │
                Studio plugin ◀── long-poll /api/plugin/poll ──  POST /api/plugin/result
```

1. The website creates a session and shows a 6-character **pair code**.
2. The Studio plugin redeems the code (`/api/plugin/connect`) and gets a private token.
3. When the AI calls a tool, the server queues a command and the plugin, which is long-polling, picks it up, runs it in Studio and posts the result back.

| Path | What it is |
| --- | --- |
| `plugin/Bloxy.server.lua` | The Studio plugin: HTTP bridge, tool implementations and dock UI |
| `src/lib/bridge/` | Sessions, pairing, command queue and long-polling: `memory.ts` (local) and `redis.ts` (Vercel) |
| `src/lib/tools.ts` | Tool definitions (zod), shared by every provider, plus the system prompt |
| `src/lib/agent/` | Agent loops for Claude (`claude.ts`) and Gemini (`gemini.ts`) |
| `src/app/api/` | Route handlers for sessions, the plugin and chat |
| `src/app/page.tsx`, `src/components/landing/` | Landing page (hero prompt hands off to `/studio?prompt=…`) |
| `src/components/studio/` | The app at `/studio`: 3D workspace (`Viewport3D`), node editor (`NodeEditor`), chat dock, pairing and settings |

## Run it locally

**Windows, one click:** double-click `start.bat`. It checks Node.js, installs packages on the first run, finds Blender (for real 3D meshes), checks for Roblox Studio's built-in MCP server, opens Roblox Studio if it isn't running, starts Bloxy and opens http://localhost:3000/studio.

**No plugin needed:** when Studio is open and its MCP server is on (Assistant panel, MCP settings), Bloxy's chat reaches Studio through Roblox's own `StudioMCP` server (`%LOCALAPPDATA%\Roblox\mcp.bat`): it reads the game tree and scripts, edits code, runs Luau, builds models and can use Roblox's mesh/material generators. The badge reads "Studio via MCP". The Bloxy plugin is still supported and also mirrors the place into the 3D workspace. Both are local only (never on Vercel).

**Blender:** found automatically under Program Files (or set `BLENDER_PATH`). Blender-mode 3D models are then built for real in headless Blender.

Or by hand:

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the landing page. The app itself lives at http://localhost:3000/studio:

1. Click **Download the plugin** and save `Bloxy.server.lua` into Studio's Plugins folder (Studio: *Plugins → Plugins Folder*, or `%LOCALAPPDATA%\Roblox\Plugins`). Restart Studio.
2. In Studio, open *Plugins → Bloxy*. Enter the website URL (`http://localhost:3000`) and the pair code, then press **Connect**. Allow the HTTP permission prompt.
3. Open **Settings** on the website, choose a provider and model, and paste your API key.

## API keys

- Users paste their own key in Settings. It is kept in their browser's `localStorage` and sent with each chat request. The server never stores it.
- Optionally, the server can supply its own key as a fallback through environment variables (`.env.local`):

  ```
  ANTHROPIC_API_KEY=sk-ant-...
  GEMINI_API_KEY=...
  ```

  ⚠️ If you set these on a public deployment, **anyone using the site spends your credits**. Leave them unset to make everyone bring their own key.

## Bits (credits) and Roblox sign-in

Bloxy can run on **your** OpenRouter key while users pay with **bits**:

- Users **sign in with Roblox** and get **free bits every day**. The balance tops up to `BITS_DAILY` once per UTC day; it doesn't stack.
- Each request costs what it really costs. OpenRouter reports the cost of every call, charged at `BITS_PER_USD` bits per dollar (default 1000, so 1 bit = $0.001). A request holds an estimate first, then settles to the real cost; failed calls are refunded.
- Bits cover the Studio chat (the **Bloxy** provider in Settings) and the Nodes tab (image, video, 3D).
- Anyone who pastes their own OpenRouter key in Settings uses that instead, free.
- Admins (`ADMIN_ROBLOX_IDS`) can grant bits from the account menu.

**Never put the OpenRouter key in the repo**, even a private one. Set it as an environment variable:

| Variable | What it is |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter key. Turns bits on. |
| `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET` | From an OAuth app on create.roblox.com (Credentials → OAuth 2.0 Apps), with scopes `openid profile`. |
| `AUTH_SECRET` | Long random string that signs session cookies (e.g. `openssl rand -base64 32`). |
| `BITS_DAILY` | Free bits per day (default 300). |
| `BITS_PER_USD` | Bits per $1 of real cost (default 1000). |
| `ADMIN_ROBLOX_IDS` | Comma-separated Roblox user IDs that can grant bits. |
| `HF_TOKEN` | Your Hugging Face token (huggingface.co/settings/tokens, a **read** token is enough). Powers the open-source 3D and image models for everyone using your Bloxy and raises the free GPU quota. Without it, a few anonymous runs a day still work. |

In the Roblox OAuth app, add these redirect URLs: `https://<your-domain>/api/auth/roblox/callback` and `http://localhost:3000/api/auth/roblox/callback`. Balances live in the same Upstash Redis as the bridge (in memory locally).

## Deploying

### Vercel

1. Import the GitHub repo in Vercel (framework: Next.js, no extra settings).
2. **Add Redis** (required). In the Vercel project: *Storage → Create → Upstash Redis* (free tier works), then connect it to the project. That sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which Bloxy picks up automatically (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work).
3. Redeploy. In the plugin, use your Vercel URL (e.g. `https://bloxyweba.vercel.app`) as the website URL.

Why Redis: Vercel runs many short-lived function instances that don't share memory, so the plugin's poll and the agent's command can land on different instances. Without Redis on Vercel, the API answers 503 with these setup steps instead of half-working.

Notes:
- The plugin long-polls in 10 s windows and checks Redis about once a second, roughly 60 Redis commands a minute while Studio is connected. Upstash's free tier covers light use. Disconnect the plugin when you're not building.
- Vercel Hobby caps functions at 300 s, so one agent message can run for at most 5 minutes. Say "continue" to pick up a longer job.

### Any Node host

`npm run build && npm start` on Render, Railway, Fly or a VPS works with no extra setup: one long-running process uses the in-memory bridge. Set the Redis variables to share state across several instances.

The plugin's website URL must use HTTPS in production. Studio asks the user once to allow the domain.

## The Studio app

- **3D Workspace**: a Roblox Studio–style view of your place: sky, a 4-stud grid on every surface, Explorer tree with search, Properties panel, Select/Move/Scale/Rotate tools (Ctrl+1–4, 1-stud / 15° snapping) and a view cube. Parts stream from the plugin with `get_scene`. Selection syncs to Studio, and edits from the gizmo or Properties go to Studio as undoable `set_properties` calls. Before you connect, a demo place lets you try everything locally.
- **Nodes**: a canvas for generating assets and chaining work, with a bottom toolbar (Select, Hand, Note, then Text, 3D, Upload, Video, Image, Studio step, Check). Wires carry data: Text → prompts, Image/Upload → reference or first frame, 3D → Studio steps (the model is inserted first). **Run all** goes in dependency order. Generation uses your **OpenRouter** key (Settings):
  - **3D Model**: "3D as code". An LLM (default `anthropic/claude-opus-5.5`) writes the object as a validated list of Roblox parts. It previews in 3D inside the node, and **Insert into Studio** builds it as one anchored Model where the Studio camera looks (plugin 0.3.0, one undo step).
  - **Image**: OpenRouter Images API (default `google/gemini-3.1-flash-image`).
  - **Video**: OpenRouter's async Videos API (default `google/veo-3.1-fast`), polled until done.
  - Models are free-text fields with suggestions from OpenRouter's live model lists.
- **Chat dock**: the prompt bar floats over the workspace, and the conversation shows live tool calls.
- **Chat inside Roblox Studio**: once the plugin (0.4.0) is paired, its panel becomes a chat. Messages run through your open Bloxy tab (your model, key or bits) and the reply streams back into Studio.
- **Knowledge base**: about 900 sections of Roblox and Blender engineering notes (`data/knowledge`, from MIT-licensed skill repos). Each chat message gets the most relevant sections, and the AI can call `search_knowledge` mid-task. Rebuild with `node scripts/build-knowledge.mjs <dir with the cloned repos>`.
- **Open-source 3D models** (Hugging Face, picked in Settings): an image model (FLUX.1 schnell, Qwen-Image 2512, HiDream-O1) draws a concept and a 3D model (Hunyuan3D 2.1, TRELLIS.2, Stable Fast 3D, UniForge3D, Hunyuan3D 2) builds the mesh. If one is busy the next is tried. With Blender installed the mesh is welded, painted from the concept, cut to 10,000 triangles and scaled to studs. Use it from chat (`generate_3d_model`) or Idea Forge (**AI mesh**). Meshes stay in the Bloxy workspace: select one and press **Download .glb**, then File > Import 3D in Studio.

### Matching Roblox Studio's look

The workspace uses Roblox's own baseplate texture (`public/roblox/baseplate.png`, from a Studio export). For Studio's sky, put the six Sky faces in `public/roblox/sky/` as `rt.png`, `lf.png`, `up.png`, `dn.png`, `bk.png`, `ft.png` (SkyboxRt/Lf/Up/Dn/Bk/Ft) and set `HAS_SKYBOX = true` in `src/components/studio/Viewport3D.tsx`.

## Studio tools

`get_studio_state`, `list_children`, `search_instances`, `get_properties`, `set_properties`, `create_instance`, `clone_instance`, `delete_instance`, `read_script`, `write_script`, `edit_script`, `grep_scripts`, `run_luau`, `get_output`, `insert_asset`, `set_selection`.

Every change goes through `ChangeHistoryService`, so **Ctrl+Z** in Studio undoes what the AI did.

To add a tool, define it in `src/lib/tools.ts` and add a function with the same name to the `tools` table in `plugin/Bloxy.server.lua`.

## Brand

The logo (Spark Brick, a 2-stud brick that winks) and its full kit live in `brand/`: master SVGs, lockups, one-colour and reversed versions, a web icon set, a presentation board and [usage guidelines](brand/GUIDELINES.md). The site uses them through `BloxyMark` / `BloxyWordmark` / `BloxyLogo` in `src/components/landing/icons.tsx`, plus Next's `icon.svg`, `apple-icon.png`, `favicon.ico` and `opengraph-image.png` in `src/app/`.

## Credits

- Environment skies and ground textures: [Poly Haven](https://polyhaven.com), CC0. Resized copies live in `public/env/`.
- AI lab logos: [LobeHub Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg` 1.95.1, MIT), saved in `public/logos/`. The logos are trademarks of their owners and only label each lab's models.

## Testing

```bash
npx tsx scripts/smoke-bridge.ts   # both bridge backends (memory + fake Redis) with a fake plugin
npx tsx scripts/smoke-bits.ts     # bits ledger: daily top-up, holds, settling, refunds, grants
npm run lint
npm run build
```

## Roadmap

- OpenAI / ChatGPT provider (add `src/lib/agent/openai.ts` and an entry in `providers.ts`)
- Playtest control and screenshots
- Persistent chat history and accounts
