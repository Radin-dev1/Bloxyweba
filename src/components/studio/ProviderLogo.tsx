/**
 * Small marks for the AI labs behind each model id ("anthropic/…", "openai/…"), drawn as
 * simple SVG so they stay crisp at 16 px. Unknown labs get a colored letter tile.
 */

type Vendor = { name: string; mark?: (s: number) => React.ReactNode; tile: string; letter?: string };

const ray = (deg: number, len: number) => {
  const r = (deg * Math.PI) / 180;
  return `M12 12L${(12 + Math.cos(r) * len).toFixed(2)} ${(12 + Math.sin(r) * len).toFixed(2)}`;
};

const VENDORS: Record<string, Vendor> = {
  anthropic: {
    name: "Anthropic",
    tile: "#2a1d18",
    mark: () => (
      <path
        d={[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((d, i) => ray(d + 8, i % 2 ? 7.2 : 9.4)).join(" ")}
        stroke="#d97757"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    ),
  },
  openai: {
    name: "OpenAI",
    tile: "#141414",
    mark: () => (
      <g fill="none" stroke="#f4f4f4" strokeWidth={1.7}>
        {[0, 60, 120, 180, 240, 300].map((d) => (
          <rect key={d} x={9.2} y={3.6} width={5.6} height={11} rx={2.8} transform={`rotate(${d} 12 12)`} />
        ))}
      </g>
    ),
  },
  google: {
    name: "Google",
    tile: "#121a2c",
    mark: () => (
      <>
        <defs>
          <linearGradient id="bloxy-gem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f8dff" />
            <stop offset="0.55" stopColor="#8f6cff" />
            <stop offset="1" stopColor="#d96bff" />
          </linearGradient>
        </defs>
        <path d="M12 2.5c.7 5.1 4.4 8.8 9.5 9.5-5.1.7-8.8 4.4-9.5 9.5-.7-5.1-4.4-8.8-9.5-9.5 5.1-.7 8.8-4.4 9.5-9.5Z" fill="url(#bloxy-gem)" />
      </>
    ),
  },
  "x-ai": {
    name: "xAI",
    tile: "#0d0d0d",
    mark: () => <path d="M5 5l14 14M19 3.5 13.6 10M10.4 14 5 20.5" stroke="#f2f2f2" strokeWidth={2.2} strokeLinecap="round" />,
  },
  "meta-llama": {
    name: "Meta",
    tile: "#0d1a33",
    mark: () => (
      <path
        d="M3.5 12c0-2.8 1.6-5 3.6-5 3.6 0 5.2 10 8.8 10 2 0 3.6-2.2 3.6-5s-1.6-5-3.6-5c-3.6 0-5.2 10-8.8 10-2 0-3.6-2.2-3.6-5Z"
        fill="none"
        stroke="#1d8cff"
        strokeWidth={2.1}
        strokeLinejoin="round"
      />
    ),
  },
  mistralai: {
    name: "Mistral",
    tile: "#1f160c",
    mark: () => (
      <g>
        {[
          [4, 5, "#ffd800"], [16, 5, "#ffd800"],
          [4, 8.6, "#ffaf00"], [8, 8.6, "#ffaf00"], [12, 8.6, "#ffaf00"], [16, 8.6, "#ffaf00"],
          [4, 12.2, "#ff8205"], [12, 12.2, "#ff8205"], [16, 12.2, "#ff8205"],
          [4, 15.8, "#fa500f"], [16, 15.8, "#fa500f"],
        ].map(([x, y, c], i) => (
          <rect key={i} x={x as number} y={y as number} width={4} height={3.6} fill={c as string} />
        ))}
      </g>
    ),
  },
  qwen: {
    name: "Qwen",
    tile: "#1d1536",
    mark: () => <path d="M12 3.5 19.4 7.8v8.4L12 20.5l-7.4-4.3V7.8L12 3.5Zm0 4.6-3.6 2.1v3.6l3.6 2.1 3.6-2.1v-3.6L12 8.1Z" fill="#8c6bff" fillRule="evenodd" />,
  },
  deepseek: {
    name: "DeepSeek",
    tile: "#0f1a3a",
    mark: () => (
      <path
        d="M3.5 10.5c2.4 1.6 4.2.6 6.5 1.6 2.6 1.1 3.6 4.6 7 4.4 2.3-.1 3.6-2.1 3.5-4.6 1.1-.8 1.2-2.1.5-3-.6 1-1.4 1.1-2.1.6-1.6-2.3-4.8-3.1-7.5-1.6M14.6 11.6h.01"
        fill="none"
        stroke="#4d6bfe"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  moonshotai: { name: "Moonshot AI", tile: "#121212", letter: "K" },
  "z-ai": { name: "Z.ai", tile: "#132036", letter: "Z" },
  cohere: { name: "Cohere", tile: "#2a1f3d", letter: "C" },
  nvidia: { name: "NVIDIA", tile: "#1b2a0c", letter: "N" },
  amazon: { name: "Amazon", tile: "#2b1d08", letter: "A" },
  microsoft: { name: "Microsoft", tile: "#0b2131", letter: "M" },
  perplexity: { name: "Perplexity", tile: "#0b2a2a", letter: "P" },
  minimax: { name: "MiniMax", tile: "#2b0f1e", letter: "M" },
  baidu: { name: "Baidu", tile: "#0d1b3b", letter: "B" },
  inception: { name: "Inception", tile: "#1d1d2b", letter: "I" },
  liquid: { name: "Liquid", tile: "#0f2230", letter: "L" },
  "nousresearch": { name: "Nous Research", tile: "#22201a", letter: "N" },
  openrouter: { name: "OpenRouter", tile: "#1a1f2e", letter: "O" },
};

/** The lab behind a model id: "anthropic/claude-x" → "anthropic". Direct Claude/Gemini ids are mapped too. */
export function vendorOf(modelId: string) {
  const id = modelId.toLowerCase();
  if (id.includes("/")) return id.split("/")[0].replace(/^~/, "");
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gemini") || id.startsWith("gemma")) return "google";
  if (id.startsWith("gpt") || /^o\d/.test(id)) return "openai";
  return id;
}

export function vendorName(vendor: string) {
  return VENDORS[vendor]?.name ?? vendor.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PALETTE = ["#1f2a44", "#2b1f3f", "#1d3229", "#3a2419", "#1d2d3a", "#3a1d2a"];

export default function ProviderLogo({ model, className = "size-5" }: { model: string; className?: string }) {
  const vendor = vendorOf(model);
  const v = VENDORS[vendor];
  const tile = v?.tile ?? PALETTE[[...vendor].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-[28%] ring-1 ring-white/10 ${className}`}
      style={{ background: tile }}
    >
      <svg viewBox="0 0 24 24" className="size-[78%]">
        {v?.mark ? (
          v.mark(24)
        ) : (
          <text x={12} y={16.6} textAnchor="middle" fontSize={14} fontWeight={700} fill="rgba(255,255,255,0.92)" fontFamily="system-ui, sans-serif">
            {(v?.letter ?? vendor[0] ?? "?").toUpperCase()}
          </text>
        )}
      </svg>
    </span>
  );
}
