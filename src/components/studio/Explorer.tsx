"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { buildTree, type TreeNode } from "./sceneMath";
import type { ScenePart } from "./useScene";
import { ChevronDown, Search } from "../landing/icons";

// Class-ish colour chips, like Studio's Explorer icons.
const SHAPE_CHIP: Record<string, string> = {
  Block: "bg-sky-400",
  Ball: "bg-amber-300",
  Cylinder: "bg-emerald-400",
  Wedge: "bg-orange-400",
  CornerWedge: "bg-orange-400",
  Mesh: "bg-fuchsia-400",
};

function Icon({ node, parts }: { node: TreeNode; parts: ScenePart[] }) {
  if (node.partIndex !== null) {
    const shape = parts[node.partIndex].shape;
    return <span className={`size-2.5 shrink-0 rounded-[3px] ${SHAPE_CHIP[shape] ?? "bg-sky-400"}`} />;
  }
  if (node.path === "Workspace") return <span className="size-2.5 shrink-0 rounded-full bg-blox-soft" />;
  // Containers we only know from paths: Models/Folders.
  return <span className="size-2.5 shrink-0 rounded-[3px] border border-violet-300/80 bg-violet-400/30" />;
}

const Row = memo(function Row({
  node,
  depth,
  parts,
  selectedPath,
  expanded,
  toggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  parts: ScenePart[];
  selectedPath: string | null;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onSelect: (index: number | null) => void;
}) {
  const open = expanded.has(node.path);
  const selected = selectedPath === node.path;
  const hasKids = node.children.length > 0;
  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasKids ? open : undefined}
        onClick={() => (node.partIndex !== null ? onSelect(node.partIndex) : toggle(node.path))}
        className={`group flex h-7 cursor-default items-center gap-1.5 rounded-lg pr-2 text-[12.5px] select-none ${
          selected ? "bg-blox/25 text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (hasKids) toggle(node.path);
          }}
          className={`grid size-4 shrink-0 place-items-center rounded text-white/40 ${hasKids ? "hover:text-white" : "invisible"}`}
        >
          <ChevronDown className={`size-3 transition-transform duration-300 ${open ? "" : "-rotate-90"}`} />
        </button>
        <Icon node={node} parts={parts} />
        <span className="truncate">{node.name}</span>
        {hasKids && !open && (
          <span className="ml-auto font-mono text-[10px] text-white/25">{node.children.length}</span>
        )}
      </div>
      {open &&
        node.children.map((c) => (
          <Row
            key={c.path}
            node={c}
            depth={depth + 1}
            parts={parts}
            selectedPath={selectedPath}
            expanded={expanded}
            toggle={toggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
});

/** Studio-style Explorer built from the scene's part paths. */
export default function Explorer({
  parts,
  selected,
  onSelect,
}: {
  parts: ScenePart[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const tree = useMemo(() => buildTree(parts), [parts]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["Workspace"]));
  const [query, setQuery] = useState("");
  const selectedPath = selected !== null ? (parts[selected]?.path ?? null) : null;

  // Reveal the selected part (e.g. picked in 3D) by opening its ancestors.
  useEffect(() => {
    if (!selectedPath) return;
    const segs = selectedPath.split(".");
    const ancestors = segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join("."));
    if (ancestors.every((a) => expanded.has(a))) return;
    const t = setTimeout(() => setExpanded((prev) => new Set([...prev, ...ancestors])), 0);
    return () => clearTimeout(t);
  }, [selectedPath, expanded]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? parts
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.path.toLowerCase().includes(q))
            .slice(0, 300)
        : [],
    [parts, q],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <p className="text-[10px] font-medium tracking-[0.2em] text-white/45 uppercase">Explorer</p>
        <span className="font-mono text-[10px] text-white/30">{parts.length.toLocaleString()}</span>
      </div>
      <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-1.5">
        <Search className="size-3.5 shrink-0 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter workspace"
          className="w-full bg-transparent text-[12px] outline-none placeholder:text-white/30"
        />
      </div>
      <div role="tree" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:thin]">
        {q
          ? matches.map(({ p, i }) => (
              <div
                key={p.path + i}
                onClick={() => onSelect(i)}
                className={`flex h-7 cursor-default items-center gap-2 truncate rounded-lg px-2 text-[12px] ${
                  selected === i ? "bg-blox/25 text-white" : "text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                <span className={`size-2.5 shrink-0 rounded-[3px] ${SHAPE_CHIP[p.shape] ?? "bg-sky-400"}`} />
                <span className="truncate font-mono text-[11px]">{p.path.replace(/^Workspace\./, "")}</span>
              </div>
            ))
          : tree.map((n) => (
              <Row
                key={n.path}
                node={n}
                depth={0}
                parts={parts}
                selectedPath={selectedPath}
                expanded={expanded}
                toggle={toggle}
                onSelect={onSelect}
              />
            ))}
        {q && matches.length === 0 && <p className="px-3 py-2 text-xs text-white/35">No parts match.</p>}
      </div>
    </div>
  );
}
