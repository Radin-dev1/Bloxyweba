import type { NodeKind } from "./types";

// Solid, simple glyphs for the node toolbar and node headers.
const PATHS: Record<NodeKind | "select" | "hand" | "more" | "plus", React.ReactNode> = {
  select: <path d="M6 3.5 18.5 11l-5.6 1.4L10 18 6 3.5Z M15 4l1-2M19 7l2-1M4 15l-2 1M12 3V1" />,
  hand: (
    <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-6.5V4.5a1.5 1.5 0 0 1 3 0V12m0-6a1.5 1.5 0 0 1 3 0v6m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.3 15.5a1.6 1.6 0 0 1 2.4-2.1L8 15" />
  ),
  note: <path d="M4 4h16v11l-5 5H4V4Z M15 20v-5h5" />,
  text: <path d="M5 3h9l5 5v13H5V3Z M14 3v5h5 M8 13h8 M8 17h6" />,
  upload: <path d="M12 16V4 M7 9l5-5 5 5 M5 20h14" />,
  image: <path d="M3 5h18v14H3V5Z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5a1.5 1.5 0 1 0 0-.01" />,
  video: <path d="M3 6h12v12H3V6Z M15 10l6-3.5v11L15 14" />,
  model3d: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5l8 4.5 8-4.5 M12 12v9" />,
  studio: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />,
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function KindIcon({
  kind,
  className,
}: {
  kind: NodeKind | "select" | "hand" | "more" | "plus";
  className?: string;
}) {
  const strokeWidth = kind === "more" ? 3 : 1.7;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind]}
    </svg>
  );
}
