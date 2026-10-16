import { z } from "zod";
import { jobs, refund, resolveBilling, settle } from "@/lib/bits";
import { errorResponse, orFetch } from "@/lib/openrouter";

const Body = z.object({ apiKey: z.string().max(500).optional(), id: z.string().min(1).max(200) });

/** Polls a video job. When done, returns a signed URL if OpenRouter has one, and settles bits. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const billing = await resolveBilling(parsed.data.apiKey);
  if (!billing.ok) return billing.response;
  try {
    const res = await orFetch(billing.key, `/videos/${encodeURIComponent(parsed.data.id)}`);
    const job = (await res.json()) as {
      status: string;
      urls?: string[];
      error?: string | { message?: string };
      usage?: { cost?: number };
    };
    let bits: number | null = null;
    if (job.status === "completed" || job.status === "failed") {
      // Settle exactly once: the hold is removed when taken.
      const held = await jobs.take(parsed.data.id);
      if (held && job.status === "completed") bits = await settle(held.userId, held.reserved, job.usage?.cost);
      if (held && job.status === "failed") await refund(held.userId, held.reserved);
    }
    const error = typeof job.error === "string" ? job.error : job.error?.message;
    return Response.json({ status: job.status, url: job.urls?.[0] ?? null, cost: job.usage?.cost ?? null, bits, error });
  } catch (err) {
    return errorResponse(err);
  }
}
