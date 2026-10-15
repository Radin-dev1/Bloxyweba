import { z } from "zod";
import { NO_KEY, errorResponse, openrouterKey, orFetch } from "@/lib/openrouter";

const Body = z.object({ apiKey: z.string().max(500).optional(), id: z.string().min(1).max(200) });

/** Polls a video job. When done, returns a signed URL if OpenRouter has one. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const key = openrouterKey(parsed.data.apiKey);
  if (!key) return NO_KEY();
  try {
    const res = await orFetch(key, `/videos/${encodeURIComponent(parsed.data.id)}`);
    const job = (await res.json()) as {
      status: string;
      urls?: string[];
      error?: string | { message?: string };
      usage?: { cost?: number };
    };
    const error = typeof job.error === "string" ? job.error : job.error?.message;
    return Response.json({ status: job.status, url: job.urls?.[0] ?? null, cost: job.usage?.cost ?? null, error });
  } catch (err) {
    return errorResponse(err);
  }
}
