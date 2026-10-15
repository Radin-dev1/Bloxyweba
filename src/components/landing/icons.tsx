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

export function BloxyMark({ className }: P) {
  // Tilted block "B": a nod to Roblox's tilted square without copying it.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="bloxy-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fb0ff" />
          <stop offset="1" stopColor="#2f7dff" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="24" height="24" rx="7" transform="rotate(-8 16 16)" fill="url(#bloxy-g)" />
      <path
        d="M12.5 10.5h5.2a3.1 3.1 0 0 1 1.2 6 3.3 3.3 0 0 1-1 6.5h-5.4v-12.5Zm2.6 2.3v3h2.4a1.5 1.5 0 0 0 0-3h-2.4Zm0 5.2v2.8h2.7a1.4 1.4 0 0 0 0-2.8h-2.7Z"
        fill="#fff"
        transform="rotate(-8 16 16)"
      />
    </svg>
  );
}
