"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GEN_DEFAULTS, type BuildT } from "@/lib/openrouter";
import type { TurnResult } from "./useChat";
import { KindIcon } from "./nodes/icons";
import { ActionsContext, nodeTypes, type NodeActions } from "./nodes/nodeViews";
import { CHECKS, KIND_STYLE, type Edge, type FlowNode, type NodeKind } from "./nodes/types";

const STORAGE_KEY = "bloxy.workflow.v2";
const MAX_SAVED_OUTPUT = 300_000; // big images/videos aren't kept in localStorage

type Props = {
  send: (text: string) => Promise<TurnResult>;
  stop: () => void;
  busy: boolean;
  connected: boolean;
  openrouterKey: string;
  /** Inserts a generated build into Studio (or the demo place); resolves to its path. */
  onInsertBuild: (build: BuildT) => Promise<string>;
  onNeedsKey: () => void;
};

// ── Node factory & templates ──

function newNode(
  kind: NodeKind,
  position: { x: number; y: number },
  id = `${kind}-${Date.now().toString(36)}`,
): FlowNode {
  const base = { id, position };
  switch (kind) {
    case "text":
      return { ...base, type: "text", data: { status: "idle", text: "" } };
    case "note":
      return { ...base, type: "note", data: { status: "idle", text: "" } };
    case "upload":
      return { ...base, type: "upload", data: { status: "idle" } };
    case "image":
      return { ...base, type: "image", data: { status: "idle", prompt: "", model: GEN_DEFAULTS.image } };
    case "video":
      return {
        ...base,
        type: "video",
        data: { status: "idle", prompt: "", model: GEN_DEFAULTS.video, duration: 6, aspect: "16:9" },
      };
    case "model3d":
      return { ...base, type: "model3d", data: { status: "idle", prompt: "", model: GEN_DEFAULTS.model3d } };
    case "studio":
      return { ...base, type: "studio", data: { status: "idle", title: "Studio step", prompt: "" } };
    case "check":
      return { ...base, type: "check", data: { status: "idle", preset: "output" } };
  }
}

function withData<T extends FlowNode>(n: T, data: Partial<T["data"]>): T {
  return { ...n, data: { ...n.data, ...data } } as T;
}

const TEMPLATES: { label: string; build: () => { nodes: FlowNode[]; edges: Edge[] } }[] = [
  {
    label: "Prop → Studio",
    build: () => {
      const t = withData(newNode("text", { x: 0, y: 40 }, "t1"), {
        text: "A cozy wooden market stall with a striped awning and crates of fruit",
      });
      const m = newNode("model3d", { x: 340, y: 0 }, "m1");
      const s = withData(newNode("studio", { x: 720, y: 20 }, "s1"), {
        title: "Place it",
        prompt: "Move the inserted model next to the SpawnLocation and make sure it's anchored.",
      });
      return {
        nodes: [t, m, s],
        edges: [
          { id: "e1", source: "t1", target: "m1" },
          { id: "e2", source: "m1", target: "s1" },
        ],
      };
    },
  },
  {
    label: "Thumbnail → Trailer",
    build: () => {
      const t = withData(newNode("text", { x: 0, y: 60 }, "t1"), {
        text: "Roblox game thumbnail: a blocky hero jumping across lava platforms, bright, dramatic lighting",
      });
      const i = newNode("image", { x: 340, y: 0 }, "i1");
      const v = withData(newNode("video", { x: 720, y: 0 }, "v1"), { prompt: "Slow cinematic push-in, lava bubbling" });
      return {
        nodes: [t, i, v],
        edges: [
          { id: "e1", source: "t1", target: "i1" },
          { id: "e2", source: "i1", target: "v1" },
        ],
      };
    },
  },
  {
    label: "Obby in Studio",
    build: () => {
      const a = withData(newNode("studio", { x: 0, y: 0 }, "s1"), {
        title: "Course",
        prompt:
          "Build a 12-stage obby in Workspace.Obby: anchored platforms over a lava floor, getting harder each stage.",
      });
      const b = withData(newNode("studio", { x: 360, y: 40 }, "s2"), {
        title: "Checkpoints",
        prompt:
          "Add a checkpoint at each stage that saves the player's stage with a leaderstat and respawns them there.",
      });
      const c = newNode("check", { x: 720, y: 0 }, "c1");
      return {
        nodes: [a, b, c],
        edges: [
          { id: "e1", source: "s1", target: "s2" },
          { id: "e2", source: "s2", target: "c1" },
        ],
      };
    },
  },
];

// ── Persistence (outputs that are too big for localStorage are dropped) ──

function loadSaved(): { nodes: FlowNode[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { nodes: FlowNode[]; edges: Edge[] };
      return {
        nodes: saved.nodes.map((n) => withData(n, { status: "idle", error: undefined })),
        edges: saved.edges,
      };
    }
  } catch {}
  return { nodes: [], edges: [] }; // a fresh canvas starts empty
}

function forStorage(nodes: FlowNode[]) {
  return nodes.map((n) => {
    const d = { ...n.data } as Record<string, unknown>;
    for (const k of ["output", "jobId", "phase"]) {
      const v = d[k];
      if (typeof v === "string" && (v.startsWith("blob:") || v.length > MAX_SAVED_OUTPUT)) delete d[k];
    }
    return { ...n, selected: false, data: d };
  });
}

// ── Toolbar ──

const TOOLBAR_NODES: NodeKind[] = ["text", "model3d", "upload", "video", "image", "studio", "check"];

function ToolButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid size-10 place-items-center rounded-xl transition-colors duration-200 ${
        active ? "bg-white/[0.12] text-white" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Editor({ send, stop, busy, connected, openrouterKey, onInsertBuild, onNeedsKey }: Props) {
  const initial = useMemo(() => loadSaved(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [mode, setMode] = useState<"select" | "hand">("select");
  const [menu, setMenu] = useState<"none" | "add" | "more">("none");
  const [runningAll, setRunningAll] = useState(false);
  const cancelRef = useRef(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const spawnCount = useRef(0);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Latest graph for async runners.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: forStorage(nodes), edges }));
    } catch {}
  }, [nodes, edges]);

  // V / H like design tools, when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "v" || e.key === "V") setMode("select");
      if (e.key === "h" || e.key === "H") setMode("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patch = useCallback(
    (id: string, data: Record<string, unknown>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? (withData(n, data as never) as FlowNode) : n))),
    [setNodes],
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es)),
    [setEdges],
  );

  const addNode = (kind: NodeKind) => {
    const rect = wrapper.current?.getBoundingClientRect();
    const k = spawnCount.current++ % 6;
    const pos = screenToFlowPosition({
      x: (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) - 150 + k * 24,
      y: (rect ? rect.top + rect.height / 2.6 : window.innerHeight / 2.6) + k * 24,
    });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...newNode(kind, pos), selected: true }]);
    setMenu("none");
  };

  // ── Running nodes ──

  const inputsFor = (id: string) => {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const ups = edgesRef.current
      .filter((e) => e.target === id)
      .map((e) => byId.get(e.source))
      .filter(Boolean) as FlowNode[];
    const texts: string[] = [];
    const images: string[] = [];
    const builds: BuildT[] = [];
    for (const u of ups) {
      if (u.type === "text" && u.data.text.trim()) texts.push(u.data.text.trim());
      if ((u.type === "image" || u.type === "upload") && u.data.output) images.push(u.data.output);
      if (u.type === "model3d" && u.data.build) builds.push(u.data.build);
    }
    return { texts, images, builds };
  };

  const post = async <T,>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      if (res.status === 400 && data.error?.includes("OpenRouter")) onNeedsKey();
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }
    return data;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Runs one node with its upstream inputs. Resolves true on success. */
  const runOne = async (id: string): Promise<boolean> => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return false;
    const { texts, images, builds } = inputsFor(id);
    const promptOf = (own: string) => [...texts, own.trim()].filter(Boolean).join("\n\n");
    patch(id, { status: "running", error: undefined });
    try {
      switch (node.type) {
        case "text":
        case "note":
        case "upload":
          break;
        case "image": {
          const prompt = promptOf(node.data.prompt);
          if (!prompt) throw new Error("Write a prompt or connect a Text node.");
          const r = await post<{ images: string[] }>("/api/gen/image", {
            apiKey: openrouterKey,
            model: node.data.model,
            prompt,
          });
          patch(id, { output: r.images[0] });
          break;
        }
        case "video": {
          const prompt = promptOf(node.data.prompt);
          if (!prompt) throw new Error("Write a prompt or connect a Text node.");
          patch(id, { output: undefined, phase: "Submitting…" });
          const job = await post<{ id: string }>("/api/gen/video", {
            apiKey: openrouterKey,
            model: node.data.model,
            prompt,
            duration: node.data.duration,
            aspectRatio: node.data.aspect,
            firstFrame: images[0],
          });
          patch(id, { jobId: job.id, phase: "Queued at the provider…" });
          const started = Date.now();
          for (;;) {
            if (cancelRef.current) throw new Error("Stopped.");
            if (Date.now() - started > 15 * 60_000) throw new Error("The video took too long. Try again later.");
            await sleep(5000);
            const st = await post<{ status: string; url: string | null; error?: string }>("/api/gen/video/status", {
              apiKey: openrouterKey,
              id: job.id,
            });
            const secs = Math.round((Date.now() - started) / 1000);
            if (st.status === "failed") throw new Error(st.error ?? "The provider couldn't make this video.");
            if (st.status === "completed") {
              let url = st.url;
              if (!url) {
                const res = await fetch("/api/gen/video/content", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ apiKey: openrouterKey, id: job.id }),
                });
                if (!res.ok) throw new Error("Couldn't download the finished video.");
                url = URL.createObjectURL(await res.blob());
              }
              patch(id, { output: url, phase: undefined });
              break;
            }
            patch(id, { phase: `${st.status === "in_progress" ? "Rendering" : "Waiting"}… ${secs}s` });
          }
          break;
        }
        case "model3d": {
          const prompt = promptOf(node.data.prompt);
          if (!prompt) throw new Error("Describe the object or connect a Text node.");
          const r = await post<{ build: BuildT }>("/api/gen/model3d", {
            apiKey: openrouterKey,
            model: node.data.model,
            prompt,
            image: images[0],
          });
          patch(id, { build: r.build, inserted: undefined });
          break;
        }
        case "studio":
        case "check": {
          if (!connected) throw new Error("Connect Studio first (3D Workspace tab).");
          const inserted: string[] = [];
          for (const b of builds) inserted.push(await onInsertBuild(b));
          const own = node.type === "studio" ? node.data.prompt : CHECKS[node.data.preset].prompt;
          const prompt = [
            ...texts,
            inserted.length ? `These models were just inserted into the place: ${inserted.join(", ")}.` : "",
            own.trim(),
          ]
            .filter(Boolean)
            .join("\n\n");
          if (!prompt) throw new Error("Write what Bloxy should do.");
          const r = await send(prompt);
          patch(id, { result: (r.error ?? r.text).replace(/\s+/g, " ").slice(0, 220), tools: r.tools });
          if (!r.ok) throw new Error(r.error ?? "The step failed.");
          break;
        }
      }
      patch(id, { status: "done" });
      return true;
    } catch (err) {
      patch(id, { status: "error", error: (err as Error).message, phase: undefined });
      return false;
    }
  };

  /** Runs every node in dependency order (left to right among independents). */
  const runAll = async () => {
    const ns = nodesRef.current;
    const es = edgesRef.current;
    const indeg = new Map(ns.map((n) => [n.id, 0]));
    for (const e of es) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    const order: FlowNode[] = [];
    const ready = ns.filter((n) => indeg.get(n.id) === 0);
    while (ready.length) {
      ready.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
      const n = ready.shift()!;
      order.push(n);
      for (const e of es.filter((x) => x.source === n.id)) {
        indeg.set(e.target, (indeg.get(e.target) ?? 1) - 1);
        const next = ns.find((x) => x.id === e.target);
        if (indeg.get(e.target) === 0 && next) ready.push(next);
      }
    }
    const runnable = order.filter((n) => !["text", "note", "upload"].includes(n.type));
    if (runnable.length === 0) return;
    cancelRef.current = false;
    setRunningAll(true);
    for (const n of runnable) patch(n.id, { status: "queued", error: undefined });
    for (const n of runnable) {
      if (cancelRef.current) break;
      setEdges((all) => all.map((e) => ({ ...e, animated: e.target === n.id })));
      const ok = await runOne(n.id);
      if (!ok) break;
    }
    setEdges((all) => all.map((e) => ({ ...e, animated: false })));
    setNodes((all) => all.map((n) => (n.data.status === "queued" ? withData(n, { status: "idle" }) : n)));
    setRunningAll(false);
  };

  const actions: NodeActions = {
    run: (id) => void runOne(id),
    insertBuild: (id) => {
      const n = nodesRef.current.find((x) => x.id === id);
      if (n?.type !== "model3d" || !n.data.build) return;
      onInsertBuild(n.data.build).then(
        (path) => patch(id, { inserted: path, error: undefined }),
        (err: Error) => patch(id, { error: err.message }),
      );
    },
    connected,
    busy: busy || runningAll,
  };

  return (
    <ActionsContext.Provider value={actions}>
      <div ref={wrapper} className="relative h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView={initial.nodes.length > 0}
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.75}
          panOnDrag={mode === "hand" ? true : [1, 2]}
          selectionOnDrag={mode === "select"}
          panOnScroll
          defaultEdgeOptions={{ type: "smoothstep" }}
          proOptions={{ hideAttribution: true }}
          className={`bloxy-flow ${mode === "hand" ? "cursor-grab" : ""}`}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a3040" />
          <Controls position="top-left" showInteractive={false} className="!top-16" />
          {nodes.length > 0 && (
            <MiniMap
              position="top-right"
              pannable
              zoomable
              maskColor="rgba(5,5,6,0.7)"
              nodeColor={(n) => KIND_STYLE[n.type as NodeKind]?.color ?? "#2f7dff"}
              className="!top-16"
            />
          )}
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="font-display text-xl font-bold tracking-tight text-white/80">Empty canvas</p>
              <p className="mt-1.5 text-sm text-white/40">
                Add a node from the toolbar below, or start from a template (⋯).
              </p>
            </div>
          </div>
        )}

        {/* Bottom toolbar */}
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <ToolButton active={mode === "select"} title="Select (V)" onClick={() => setMode("select")}>
              <KindIcon kind="select" className="size-[19px]" />
            </ToolButton>
            <ToolButton active={mode === "hand"} title="Hand / pan (H)" onClick={() => setMode("hand")}>
              <KindIcon kind="hand" className="size-[19px]" />
            </ToolButton>
            <ToolButton title="Note" onClick={() => addNode("note")}>
              <KindIcon kind="note" className="size-[19px]" />
            </ToolButton>
            <span className="mx-1 h-6 w-px bg-white/10" />
            {TOOLBAR_NODES.map((k) => (
              <ToolButton key={k} title={KIND_STYLE[k].label} onClick={() => addNode(k)}>
                <KindIcon kind={k} className="size-[19px]" />
              </ToolButton>
            ))}
            <div className="relative">
              <ToolButton title="Templates & more" onClick={() => setMenu((m) => (m === "more" ? "none" : "more"))}>
                <KindIcon kind="more" className="size-[19px]" />
              </ToolButton>
              {menu === "more" && (
                <div className="absolute bottom-full left-1/2 mb-3 w-52 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  <p className="px-3 pt-1.5 pb-1 text-[10px] tracking-[0.18em] text-white/35 uppercase">Templates</p>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => {
                        const g = t.build();
                        setNodes(g.nodes);
                        setEdges(g.edges);
                        setMenu("none");
                        setTimeout(() => fitView({ padding: 0.25, duration: 500, maxZoom: 1 }), 50);
                      }}
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.07] hover:text-white"
                    >
                      {t.label}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    onClick={() => {
                      setNodes([]);
                      setEdges([]);
                      setMenu("none");
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-300/80 hover:bg-red-500/10"
                  >
                    Clear canvas
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenu((m) => (m === "add" ? "none" : "add"))}
              title="Add node"
              aria-label="Add node"
              className="grid size-[52px] place-items-center rounded-2xl border border-white/10 bg-[#141518]/95 text-white/80 backdrop-blur-xl hover:text-white"
            >
              <KindIcon kind="plus" className="size-5" />
            </button>
            {menu === "add" && (
              <div className="absolute right-0 bottom-full mb-3 w-56 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                {(["text", "image", "video", "model3d", "upload", "studio", "check", "note"] as NodeKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => addNode(k)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.07] hover:text-white"
                  >
                    <span style={{ color: KIND_STYLE[k].color }}>
                      <KindIcon kind={k} className="size-4" />
                    </span>
                    {KIND_STYLE[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {runningAll ? (
            <button
              onClick={() => {
                cancelRef.current = true;
                stop();
              }}
              className="h-[52px] rounded-2xl bg-white/10 px-5 text-sm font-medium text-white hover:bg-white/15"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => void runAll()}
              disabled={busy || nodes.length === 0}
              className="flex h-[52px] items-center gap-2 rounded-2xl bg-blox px-5 text-sm font-semibold text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_10px_30px_-10px_rgba(47,125,255,0.9)] disabled:opacity-40 disabled:shadow-none"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
              Run all
            </button>
          )}
        </div>
      </div>
    </ActionsContext.Provider>
  );
}

export default function NodeEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
