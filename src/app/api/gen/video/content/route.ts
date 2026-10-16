import { z } from "zod";
import { resolveBilling } from "@/lib/bits";
import { errorResponse, orFetch } from "@/lib/openrouter";

export const maxDuration = 120;

const Body = z.object({ apiKey: z.string().max(500).optional(), id: z.string().min(1).max(200) });

/** Streams a finished video's bytes (for jobs without a signed URL). Already paid at settle. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const billing = await resolveBilling(parsed.data.apiKey);
  if (!billing.ok) return billing.response;
  try {
    const res = await orFetch(billing.key, `/videos/${encodeURIComponent(parsed.data.id)}/content?index=0`);
    return new Response(res.body, {
      headers: { "Content-Type": res.headers.get("content-type") ?? "video/mp4", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
