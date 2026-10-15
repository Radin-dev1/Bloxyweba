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
- **Nodes**: chain build steps (Step and Check nodes) into a workflow and run it. Each node is sent to the agent in order through the same conversation, with live status on every node. Templates: lava obby, coin collector, tycoon starter.
- **Chat dock**: the prompt bar floats over the workspace, and the conversation shows live tool calls.

## Studio tools

`get_studio_state`, `list_children`, `search_instances`, `get_properties`, `set_properties`, `create_instance`, `clone_instance`, `delete_instance`, `read_script`, `write_script`, `edit_script`, `grep_scripts`, `run_luau`, `get_output`, `insert_asset`, `set_selection`.

Every change goes through `ChangeHistoryService`, so **Ctrl+Z** in Studio undoes what the AI did.

To add a tool, define it in `src/lib/tools.ts` and add a function with the same name to the `tools` table in `plugin/Bloxy.server.lua`.

## Testing

```bash
npx tsx scripts/smoke-bridge.ts   # both bridge backends (memory + fake Redis) with a fake plugin
npm run lint
npm run build
```

## Roadmap

- OpenAI / ChatGPT provider (add `src/lib/agent/openai.ts` and an entry in `providers.ts`)
- Playtest control and screenshots
- Persistent chat history and accounts
