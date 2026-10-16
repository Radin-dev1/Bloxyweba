/**
 * Smoke test for the bits ledger (in-memory store): daily top-up, holds, settling to
 * real cost, refunds, grants and video job holds.
 *
 *   npx tsx scripts/smoke-bits.ts
 */
import assert from "node:assert/strict";
import { BITS_DAILY, BITS_PER_USD, balanceOf, grant, jobs, refund, reserve, settle } from "@/lib/bits";

async function main() {
  const u = "123456";

  // New users start with the daily allowance.
  assert.equal(await balanceOf(u), BITS_DAILY);

  // Hold 80, real cost $0.012 -> 12 bits charged, 68 refunded.
  assert.equal(await reserve(u, 80), true);
  assert.equal(await balanceOf(u), BITS_DAILY - 80);
  assert.equal(await settle(u, 80, 0.012), Math.ceil(0.012 * BITS_PER_USD));
  assert.equal(await balanceOf(u), BITS_DAILY - 12);

  // Cost higher than the hold is charged in full (may dip below zero; topped up tomorrow).
  assert.equal(await reserve(u, 40), true);
  await settle(u, 40, 0.1);
  assert.equal(await balanceOf(u), BITS_DAILY - 12 - 100);

  // Unknown cost keeps the hold as the price; failed calls are refunded.
  const before = await balanceOf(u);
  await reserve(u, 50);
  await settle(u, 50, undefined);
  assert.equal(await balanceOf(u), before - 50);
  await reserve(u, 50);
  await refund(u, 50);
  assert.equal(await balanceOf(u), before - 50);

  // Can't hold more than you have, and a failed hold takes nothing.
  const left = await balanceOf(u);
  assert.equal(await reserve(u, left + 1), false);
  assert.equal(await balanceOf(u), left);

  // Grants add on top.
  assert.equal(await grant(u, 2000), left + 2000);

  // Video holds settle exactly once.
  assert.equal(await reserve(u, 1500), true);
  await jobs.put("job-1", u, 1500);
  const held = await jobs.take("job-1");
  assert.deepEqual(held, { userId: u, reserved: 1500 });
  assert.equal(await jobs.take("job-1"), null);
  await settle(u, 1500, 0.9);
  assert.equal(await balanceOf(u), left + 2000 - 900);

  console.log("bits ledger: passed");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
