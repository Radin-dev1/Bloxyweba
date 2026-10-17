import { handleWebhook, webhookAuthorized, type WebhookEvent } from "@/lib/lava";

/** lava.top calls this when a payment succeeds, renews, fails or a subscription is cancelled. */
export async function POST(request: Request) {
  if (!webhookAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const event = (await request.json().catch(() => null)) as WebhookEvent | null;
  if (!event) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const note = await handleWebhook(event);
    console.log(`[bloxy] lava.top ${event.eventType ?? "event"}: ${note}`);
    return Response.json({ ok: true });
  } catch (err) {
    // A 5xx makes lava.top retry later; the event isn't marked as applied until it succeeds.
    console.error("[bloxy] lava.top webhook failed", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
