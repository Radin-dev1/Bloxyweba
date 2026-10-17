import { connection } from "next/server";
import { QUOTAS } from "@/lib/accounts";
import { BITS_DAILY, BITS_DAILY_PRO, BITS_DAILY_STUDIO, BITS_MARKUP, PLAN_BITS_PER_USD } from "@/lib/bits";
import { billingConfigured, ITEMS, offerOf, prices, type ItemId } from "@/lib/lava";

/** What's for sale and for how much (prices come from the lava.top products). */
export async function GET() {
  await connection(); // per request: prices and settings change without a rebuild
  const items = (Object.keys(ITEMS) as ItemId[]).map((id) => ({ id, ...ITEMS[id], env: undefined, offer: undefined, onSale: !!offerOf(id) }));
  let list: Awaited<ReturnType<typeof prices>> = {};
  let error: string | null = null;
  if (billingConfigured()) {
    try {
      list = await prices();
    } catch (err) {
      error = (err as Error).message;
    }
  }
  return Response.json(
    {
      configured: billingConfigured(),
      items,
      prices: list,
      daily: BITS_DAILY,
      dailyPro: BITS_DAILY_PRO,
      dailyStudio: BITS_DAILY_STUDIO,
      planBitsPerUsd: PLAN_BITS_PER_USD,
      markup: BITS_MARKUP,
      ai3d: QUOTAS.ai3d,
      error,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
