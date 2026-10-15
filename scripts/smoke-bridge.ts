/**
 * Smoke test for the Studio bridge without Studio or an AI key:
 * a fake plugin long-polls and answers, while the agent-side executor calls tools.
 *
 *   npx tsx scripts/smoke-bridge.ts
 */
import assert from "node:assert/strict";
import { connectPlugin, createSession, pollCommands, submitResult } from "@/lib/bridge";
import { makeStudioExecutor, type AgentEvent } from "@/lib/agent";

async function main() {
  const { sessionId, pairCode } = createSession();
  const events: AgentEvent[] = [];
  const execute = makeStudioExecutor(sessionId, (e) => events.push(e));

  // Not paired yet -> clear error, no hang.
  const offline = await execute("c0", "get_studio_state", {});
  assert.equal(offline.ok, false);
  assert.match(offline.content, /not connected/);

  const paired = connectPlugin(pairCode, { placeName: "Smoke" });
  assert.ok(paired);
  const token = paired.pluginToken;

  // Fake plugin: answer every command by echoing it back.
  let running = true;
  const plugin = (async () => {
    while (running) {
      const cmds = (await pollCommands(token, 200)) ?? [];
      for (const c of cmds) {
        if (c.tool === "read_script") submitResult(token, c.id, { ok: false, error: "not a script" });
        else submitResult(token, c.id, { ok: true, result: { echoed: c.tool, args: c.args } });
      }
    }
  })();

  const ok = await execute("c1", "list_children", { path: "Workspace", depth: 2 });
  assert.equal(ok.ok, true);
  assert.deepEqual(JSON.parse(ok.content), { echoed: "list_children", args: { path: "Workspace", depth: 2 } });

  const studioErr = await execute("c2", "read_script", { path: "Workspace.Part" });
  assert.equal(studioErr.ok, false);
  assert.equal(studioErr.content, "not a script");

  const invalid = await execute("c3", "set_properties", { properties: { Anchored: true } });
  assert.equal(invalid.ok, false);
  assert.match(invalid.content, /Invalid arguments/);

  // Parallel calls resolve independently.
  const many = await Promise.all(
    Array.from({ length: 5 }, (_, i) => execute(`p${i}`, "get_output", { limit: i + 1 })),
  );
  assert.ok(many.every((r) => r.ok));

  assert.equal(events.filter((e) => e.type === "tool_result").length, 9);
  running = false;
  await plugin;
  console.log("bridge smoke test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
