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
| `src/lib/bridge.ts` | Sessions, pairing, command queue and long-polling (in memory) |
| `src/lib/tools.ts` | Tool definitions (zod), shared by every provider, plus the system prompt |
| `src/lib/agent/` | Agent loops for Claude (`claude.ts`) and Gemini (`gemini.ts`) |
| `src/app/api/` | Route handlers for sessions, the plugin and chat |
| `src/components/` | Chat UI, pairing panel and settings dialog |

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, then:

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

The bridge keeps state **in memory**, so it needs one long-running Node process: `npm run build && npm start` on Render, Railway, Fly or a VPS. Serverless hosts like Vercel run several short-lived instances that don't share memory. Before deploying there, move `src/lib/bridge.ts` to Redis (for example Upstash).

The plugin's website URL must use HTTPS in production. Studio asks the user once to allow the domain.

## Studio tools

`get_studio_state`, `list_children`, `search_instances`, `get_properties`, `set_properties`, `create_instance`, `clone_instance`, `delete_instance`, `read_script`, `write_script`, `edit_script`, `grep_scripts`, `run_luau`, `get_output`, `insert_asset`, `set_selection`.

Every change goes through `ChangeHistoryService`, so **Ctrl+Z** in Studio undoes what the AI did.

To add a tool, define it in `src/lib/tools.ts` and add a function with the same name to the `tools` table in `plugin/Bloxy.server.lua`.

## Testing

```bash
npx tsx scripts/smoke-bridge.ts   # bridge round-trip with a fake plugin, no Studio or key needed
npm run lint
npm run build
```

## Roadmap

- OpenAI / ChatGPT provider (add `src/lib/agent/openai.ts` and an entry in `providers.ts`)
- Playtest control and screenshots
- Persistent chat history and accounts
- Redis-backed bridge for serverless hosting
