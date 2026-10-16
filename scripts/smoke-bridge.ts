/**
 * Smoke test for the Studio bridge without Studio or an AI key. Runs the same scenario
 * against both backends: in-memory, and Redis (using a tiny in-process fake of the
 * Upstash commands the bridge uses). A fake plugin long-polls and answers commands.
 *
 *   npx tsx scripts/smoke-bridge.ts
 */
import assert from "node:assert/strict";
import type { Redis } from "@upstash/redis";
import { memoryBridge } from "@/lib/bridge/memory";
import { createRedisBridge } from "@/lib/bridge/redis";
import type { Bridge, CommandResult } from "@/lib/bridge/types";
import { validateToolInput } from "@/lib/tools";

/** Just enough of @upstash/redis for the bridge, with string values and no expiry. */
class FakeRedis {
  kv = new Map<string, string>();
  hashes = new Map<string, Record<string, string>>();
  lists = new Map<string, string[]>();
  async hgetall(k: string) {
    return this.hashes.get(k) ?? null;
  }
  async hset(k: string, v: Record<string, unknown>) {
    const h = this.hashes.get(k) ?? {};
    for (const [f, x] of Object.entries(v)) h[f] = String(x);
    this.hashes.set(k, h);
    return Object.keys(v).length;
  }
  async expire() {
    return 1;
  }
  async set(k: string, v: string, o?: { nx?: boolean }) {
    if (o?.nx && this.kv.has(k)) return null;
    this.kv.set(k, String(v));
    return "OK";
  }
  async get(k: string) {
    return this.kv.get(k) ?? null;
  }
  async getdel(k: string) {
    const v = this.kv.get(k) ?? null;
    this.kv.delete(k);
    return v;
  }
  async del(...ks: string[]) {
    let n = 0;
    for (const k of ks) n += Number(this.kv.delete(k) || this.hashes.delete(k) || this.lists.delete(k));
    return n;
  }
  async lpop(k: string, count = 1) {
    const l = this.lists.get(k) ?? [];
    const out = l.splice(0, count);
    return out.length ? out : null;
  }
  async rpush(k: string, ...v: string[]) {
    const l = this.lists.get(k) ?? [];
    l.push(...v);
    this.lists.set(k, l);
    return l.length;
  }
  async incr(k: string) {
    const n = Number(this.kv.get(k) ?? 0) + 1;
    this.kv.set(k, String(n));
    return n;
  }
  async lrange(k: string, start: number, stop: number) {
    const list = this.lists.get(k) ?? [];
    const end = stop < 0 ? list.length + stop : stop;
    return list.slice(start, end + 1);
  }
  async ltrim(k: string, start: number, stop: number) {
    const list = this.lists.get(k) ?? [];
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedEnd = stop < 0 ? list.length + stop : stop;
    this.lists.set(k, list.slice(normalizedStart, normalizedEnd + 1));
    return "OK";
  }
  async lrem(k: string, _n: number, v: string) {
    const l = this.lists.get(k) ?? [];
    const kept = l.filter((x) => x !== v);
    this.lists.set(k, kept);
    return l.length - kept.length;
  }
  pipeline() {
    const ops: (() => Promise<unknown>)[] = [];
    const chain: Record<string, unknown> = {
      exec: () => Promise.all(ops.map((op) => op())),
    };
    for (const m of ["hset", "expire", "set", "del", "rpush", "lrem", "ltrim"] as const) {
      chain[m] = (...args: unknown[]) => {
        ops.push(() => (this[m] as (...a: unknown[]) => Promise<unknown>)(...args));
        return chain;
      };
    }
    return chain;
  }
}

async function scenario(bridge: Bridge) {
  const { sessionId, pairCode } = await bridge.createSession();

  // Same validation path the agent uses, then into Studio.
  const execute = async (name: string, input: unknown): Promise<CommandResult> => {
    const v = validateToolInput(name, input);
    if (!v.ok) return { ok: false, error: v.error };
    return bridge.runInStudio(sessionId, name, v.data, 5_000);
  };

  // Not paired yet -> clear error, no hang.
  const offline = await execute("get_studio_state", {});
  assert.equal(offline.ok, false);
  assert.match((offline as { error: string }).error, /not connected/);

  assert.equal(await bridge.connectPlugin("ZZZZZZ", null), null, "bad code rejected");
  const paired = await bridge.connectPlugin(pairCode.toLowerCase(), { placeName: "Smoke" });
  assert.ok(paired, "pair code works (case-insensitive)");
  assert.equal(await bridge.connectPlugin(pairCode, null), null, "pair code is one-time");
  const token = paired.pluginToken;

  const status = await bridge.getSessionStatus(sessionId);
  assert.equal(status?.connected, true);
  assert.deepEqual(status?.studioInfo, { placeName: "Smoke" });
  assert.equal(await bridge.pollCommands("nope"), null, "unknown token rejected");

  // Fake plugin: answer every command by echoing it back.
  let running = true;
  const plugin = (async () => {
    while (running) {
      const cmds = (await bridge.pollCommands(token)) ?? [];
      for (const c of cmds) {
        if (c.tool === "read_script") await bridge.submitResult(token, c.id, { ok: false, error: "not a script" });
        else await bridge.submitResult(token, c.id, { ok: true, result: { echoed: c.tool, args: c.args } });
      }
    }
  })();

  const jobId = "chat-smoke-job";
  assert.equal(await bridge.createChatJob(sessionId, jobId), true);
  assert.equal(await bridge.appendChatJobEvent(sessionId, jobId, { type: "user", content: "Keep running after tab close" }), true);
  const events = await bridge.getChatJob(sessionId, jobId, -1);
  assert.equal(events?.status, "running");
  assert.equal((events?.events[0]?.event as { type: string }).type, "user");
  assert.equal(await bridge.stopChatJob(sessionId, jobId), true);
  assert.equal(await bridge.appendChatJobEvent(sessionId, jobId, { type: "text", delta: "ignored after stop" }), false);
  assert.equal((await bridge.getChatJob(sessionId, jobId))?.status, "stopped");

  const ok = await execute("list_children", { path: "Workspace", depth: 2 });
  assert.deepEqual(ok, { ok: true, result: { echoed: "list_children", args: { path: "Workspace", depth: 2 } } });

  const studioErr = await execute("read_script", { path: "Workspace.Part" });
  assert.deepEqual(studioErr, { ok: false, error: "not a script" });

  const invalid = await execute("set_properties", { properties: { Anchored: true } });
  assert.equal(invalid.ok, false);
  assert.match((invalid as { error: string }).error, /Invalid arguments/);

  // Parallel calls resolve independently.
  const many = await Promise.all(Array.from({ length: 5 }, (_, i) => execute("get_output", { limit: i + 1 })));
  assert.ok(many.every((r) => r.ok));

  // A result for someone else's command is refused.
  assert.equal(await bridge.submitResult(token, "not-a-real-id", { ok: true, result: 1 }), false);

  running = false;
  assert.equal(await bridge.disconnectPlugin(token), true);
  await plugin;
  assert.equal((await bridge.getSessionStatus(sessionId))?.connected, false);
}

async function main() {
  await scenario(memoryBridge);
  console.log("memory bridge: passed");
  await scenario(createRedisBridge(new FakeRedis() as unknown as Redis));
  console.log("redis bridge: passed");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
