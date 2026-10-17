import { connection } from "next/server";
import { BITS_DAILY, BITS_DAILY_PRO } from "@/lib/bits";
import { billingConfigured, ITEMS, offerOf, prices, type ItemId } from "@/lib/lava";

/** What's for sale and for how much (prices come from the lava.top products). */
export async function GET() {
  await connection(); // per request: prices and settings change without a rebuild
  const items = (Object.keys(ITEMS) as ItemId[]).map((id) => ({ id, ...ITEMS[id], env: undefined, onSale: !!offerOf(id) }));
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
    { configured: billingConfigured(), items, prices: list, daily: BITS_DAILY, dailyPro: BITS_DAILY_PRO, error },
    { headers: { "Cache-Control": "no-store" } },
  );
}
