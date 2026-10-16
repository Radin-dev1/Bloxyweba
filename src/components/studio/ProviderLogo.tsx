/* eslint-disable @next/next/no-img-element -- tiny static SVG logos */

/**
 * Real logos for the AI labs behind each model id ("anthropic/…", "openai/…"), from LobeHub's
 * MIT-licensed icon set (@lobehub/icons-static-svg), saved in public/logos/<vendor>.svg.
 * Labs without a logo get a colored letter tile.
 */

const LOGOS = new Set([
  "anthropic", "openai", "google", "x-ai", "meta", "meta-llama", "mistralai", "qwen", "deepseek", "moonshotai",
  "z-ai", "cohere", "nvidia", "amazon", "microsoft", "perplexity", "minimax", "baidu", "openrouter", "nousresearch",
  "liquid", "inception", "ai21", "bytedance-seed", "bytedance", "tencent", "stepfun", "ibm-granite", "arcee-ai",
  "morph", "xiaomi", "sakana", "upstage", "rekaai", "meituan", "fireworks", "poolside", "aion-labs", "relace",
  "perceptron", "dots-studio", "cognitivecomputations",
]);

const NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "x-ai": "xAI",
  meta: "Meta",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  moonshotai: "Moonshot AI",
  "z-ai": "Z.ai",
  nvidia: "NVIDIA",
  amazon: "Amazon",
  ai21: "AI21",
  "bytedance-seed": "ByteDance Seed",
  "ibm-granite": "IBM Granite",
  "arcee-ai": "Arcee AI",
  "aion-labs": "Aion Labs",
  rekaai: "Reka",
  nousresearch: "Nous Research",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  stepfun: "StepFun",
  "dots-studio": "dots.ai",
  cognitivecomputations: "Cognitive Computations",
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
  return NAMES[vendor] ?? vendor.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PALETTE = ["#1f2a44", "#2b1f3f", "#1d3229", "#3a2419", "#1d2d3a", "#3a1d2a"];

export default function ProviderLogo({ model, className = "size-5" }: { model: string; className?: string }) {
  const vendor = vendorOf(model);
  const known = LOGOS.has(vendor);
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-[28%] ring-1 ring-white/10 ${className}`}
      style={{ background: known ? "#1a1c22" : PALETTE[[...vendor].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length] }}
    >
      {known ? (
        <img src={`/logos/${vendor}.svg`} alt="" className="size-[66%] object-contain" draggable={false} />
      ) : (
        <svg viewBox="0 0 24 24" className="size-[78%]">
          <text x={12} y={16.6} textAnchor="middle" fontSize={14} fontWeight={700} fill="rgba(255,255,255,0.92)" fontFamily="system-ui, sans-serif">
            {(vendor[0] ?? "?").toUpperCase()}
          </text>
        </svg>
      )}
    </span>
  );
}
