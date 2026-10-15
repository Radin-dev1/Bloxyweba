// Hairline icons (1.25px stroke) so they sit quietly next to the display type.
type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export const ArrowUpRight = ({ className }: P) => (
  <svg {...base} className={className}><path d="M7 17 17 7M8 7h9v9" /></svg>
);
export const ArrowRight = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Plug = ({ className }: P) => (
  <svg {...base} className={className}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" /></svg>
);
export const Link = ({ className }: P) => (
  <svg {...base} className={className}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
);
export const Sparkle = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7ZM19 16c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z" /></svg>
);
export const Code = ({ className }: P) => (
  <svg {...base} className={className}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></svg>
);
export const Cube = ({ className }: P) => (
  <svg {...base} className={className}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
);
export const Search = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const Terminal = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 9.5 3 2.5-3 2.5M12.5 15H17" /></svg>
);
export const Undo = ({ className }: P) => (
  <svg {...base} className={className}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const Key = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5 16.5 10.5" /></svg>
);
export const Shield = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const Plus = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const Download = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
export const ChevronDown = ({ className }: P) => (
  <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
export const Settings = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const Stop = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
);
export const ArrowUp = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={1.75}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);

// Brand artwork from brand/logo/ (Spark Brick). Keep these paths in sync with the SVG masters.
const SYMBOL_PATH =
  "M82 28h92a54 54 0 0 1 54 54v92a54 54 0 0 1-54 54H82a54 54 0 0 1-54-54V82a54 54 0 0 1 54-54Z M74 104a21 21 0 1 0 42 0a21 21 0 1 0 -42 0Z M163 75c3.6 17.4 11.6 25.4 29 29-17.4 3.6-25.4 11.6-29 29-3.6-17.4-11.6-25.4-29-29 17.4-3.6 25.4-11.6 29-29Z M86 150h84a42 42 0 0 1-84 0Z";

const WORDMARK_PATH =
  "M17 24a17 17 0 0 1 17 17v39h46a44 44 0 0 1 44 44v32a44 44 0 0 1-44 44H44A44 44 0 0 1 0 156V41a17 17 0 0 1 17-17Z M48 114a14 14 0 0 0-14 14v24a14 14 0 0 0 14 14h28a14 14 0 0 0 14-14v-24a14 14 0 0 0-14-14Z M159 24a17 17 0 0 1 17 17v142a17 17 0 0 1-34 0V41a17 17 0 0 1 17-17Z M238 80h36a44 44 0 0 1 44 44v32a44 44 0 0 1-44 44h-36a44 44 0 0 1-44-44v-32a44 44 0 0 1 44-44Z M242 114a14 14 0 0 0-14 14v24a14 14 0 0 0 14 14h28a14 14 0 0 0 14-14v-24a14 14 0 0 0-14-14Z M479 80a17 17 0 0 1 17 17v39a14 14 0 0 0 14 14h28a14 14 0 0 0 14-14V97a17 17 0 0 1 34 0v109a44 44 0 0 1-44 44h-45a17 17 0 0 1 0-34h45a10 10 0 0 0 10-10v-22h-38a44 44 0 0 1-44-44V97a17 17 0 0 1 17-17Z";
const WORDMARK_X = "M336 80h39.3l69.3 120h-39.3Z M405.3 80h39.3l-69.3 120H336Z";

/** The Spark Brick symbol: a 2-stud brick that winks, the wink being the AI spark. */
export function BloxyMark({ className }: P) {
  return (
    <svg viewBox="28 28 200 200" className={className} aria-hidden>
      <path fillRule="evenodd" fill="#2F7DFF" d={SYMBOL_PATH} />
    </svg>
  );
}

/** The custom "bloxy" wordmark; takes the text colour. */
export function BloxyWordmark({ className }: P) {
  return (
    <svg viewBox="0 20 586 234" className={className} role="img" aria-label="Bloxy">
      <path fillRule="evenodd" fill="currentColor" d={WORDMARK_PATH} />
      <path fill="currentColor" d={WORDMARK_X} />
    </svg>
  );
}

/** Symbol + wordmark, the horizontal lockup. */
export function BloxyLogo({ className, markClassName }: P & { markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.32em] ${className ?? ""}`}>
      <BloxyMark className={markClassName ?? "h-[1.15em] w-auto"} />
      <BloxyWordmark className="h-[0.92em] w-auto" />
    </span>
  );
}
