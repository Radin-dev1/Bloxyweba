import { z } from "zod";

/**
 * Minimal OpenRouter client for the generation nodes. The user's key comes from their
 * browser with each request (or OPENROUTER_API_KEY on the server) and is never stored.
 */

export const OPENROUTER = "https://openrouter.ai/api/v1";

export const GEN_DEFAULTS = {
  model3d: "anthropic/claude-opus-5.5",
  image: "google/gemini-3.1-flash-image",
  video: "google/veo-3.1-fast",
};

export function openrouterKey(fromClient?: string) {
  return fromClient?.trim() || process.env.OPENROUTER_API_KEY || "";
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function orFetch(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${OPENROUTER}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Bloxy",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const msg = body?.error?.message ?? `OpenRouter returned ${res.status}`;
    throw new OpenRouterError(
      res.status === 401 ? "OpenRouter rejected the API key. Check it in Settings." : msg,
      res.status,
    );
  }
  return res;
}

export function errorResponse(err: unknown) {
  if (err instanceof OpenRouterError)
    return Response.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status });
  if (err instanceof z.ZodError)
    return Response.json({ error: "The model returned something that isn't a valid build." }, { status: 422 });
  return Response.json({ error: (err as Error)?.message?.slice(0, 400) || "Generation failed" }, { status: 500 });
}

export const NO_KEY = () =>
  Response.json({ error: "Add your OpenRouter API key in Settings to generate." }, { status: 400 });

// ── 3D as code: the model writes a Roblox build as a list of parts ──

export const SHAPES = ["Block", "Ball", "Cylinder", "Wedge"] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const BuildPart = z.object({
  name: z.string().min(1).max(60),
  shape: z.enum(SHAPES).catch("Block"),
  size: vec3.transform((v) => v.map((n) => Math.min(2048, Math.max(0.05, Math.abs(n)))) as [number, number, number]),
  position: vec3,
  rotation: vec3.catch([0, 0, 0]),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .transform((c) => c.replace("#", "").toLowerCase())
    .catch("a3a2a5"),
  material: z.string().max(40).catch("Plastic"),
  transparency: z.number().min(0).max(1).catch(0),
});

export const Build = z.object({
  name: z.string().min(1).max(60).catch("Model"),
  parts: z.array(BuildPart).min(1).max(400),
});

export type BuildT = z.infer<typeof Build>;

export const BUILD_SYSTEM_PROMPT = `You are a Roblox 3D modeler. You build objects out of Roblox parts and reply with ONLY a JSON object, no prose and no code fences:

{"name": string, "parts": [{"name": string, "shape": "Block"|"Ball"|"Cylinder"|"Wedge", "size": [x,y,z], "position": [x,y,z], "rotation": [rx,ry,rz], "color": "#RRGGBB", "material": string, "transparency": number}]}

Rules:
- Units are studs. A Roblox character is about 5 studs tall; a door is about 4x7.
- "position" is the part's center relative to the model origin. The model stands on the ground: its lowest point is at y = 0, centered on x = z = 0.
- "rotation" is Roblox orientation in degrees (order Y, X, Z).
- Cylinders run along their X axis: size [length, diameter, diameter]. For an upright cylinder use rotation [0, 0, 90].
- Wedge: flat bottom, tall face at +Z, slope going down toward -Z.
- Ball uses the smallest size component as its diameter.
- material is a Roblox Material name: Plastic, SmoothPlastic, Neon, Wood, WoodPlanks, Metal, DiamondPlate, Glass, Brick, Concrete, Grass, Sand, Slate, Marble, Granite, Fabric, Ice, Foil.
- Use 12 to 200 parts. Make it clearly recognizable: good proportions, a tight color palette, details like trims, handles, windows. Parts should touch or overlap; nothing floats unless it should.`;

export function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error("The model didn't return a build. Try again or pick another model.");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}
