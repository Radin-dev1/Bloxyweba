"use client";

/** The Free models only switch used by the model picker and the model browser. */
export default function FreeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title="Only show OpenRouter's free models (rate-limited, but they cost nothing)"
      className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] transition-colors ${on ? "bg-blox/20 text-blox-soft" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
    >
      <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-blox" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 left-0 size-3 rounded-full bg-white transition-transform ${on ? "translate-x-[14px]" : "translate-x-0.5"}`} />
      </span>
      Free models only
    </button>
  );
}
