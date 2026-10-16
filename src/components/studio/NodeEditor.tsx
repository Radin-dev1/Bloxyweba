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
import type { Generate3D } from "./model3dStream";
import AddNodeMenu from "./nodes/AddNodeMenu";
import { KindIcon } from "./nodes/icons";
import { ActionsContext, nodeTypes, type NodeActions } from "./nodes/nodeViews";
import { CHECKS, KIND_STYLE, type Edge, type FlowNode, type NodeKind } from "./nodes/types";

const STORAGE_KEY = "bloxy.workflow.v2";
const WORKFLOW_NAME_KEY = "bloxy.workflow.name.v1";
const MAX_SAVED_OUTPUT = 300_000; // big images/videos aren't kept in localStorage

type Props = {
  send: (text: string) => Promise<TurnResult>;
  stop: () => void;
  busy: boolean;
  connected: boolean;
  openrouterKey: string;
  /** Streams a 3D model and builds it live in the workspace (offline it's added there when done). */
  generate3D?: Generate3D;
  /** Inserts a generated build into Studio (or the demo place); resolves to its path. */
  onInsertBuild: (build: BuildT) => Promise<string>;
  onNeedsKey: () => void;
  onBackToWorkspace: () => void;
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

const TEMPLATES: { label: string; details: string; icon: NodeKind; build: () => { nodes: FlowNode[]; edges: Edge[] } }[] = [
  {
    label: "Prop → Studio",
    details: "Turn a prompt into a 3D prop, then place it in the connected Studio.",
    icon: "model3d",
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
    details: "Create a visual concept, then spin it into a short trailer.",
    icon: "video",
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
    details: "Build an obby in steps and ask Bloxy to check the result.",
    icon: "studio",
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
  {
    label: "Roblox Character",
    details: "Concept art first, then a blocky 3D character built from it, placed in Studio.",
    icon: "image",
    build: () => {
      const t = withData(newNode("text", { x: 0, y: 60 }, "t1"), {
        text: "A friendly robot mechanic NPC with a tool belt and goggles, Roblox style",
      });
      const i = withData(newNode("image", { x: 340, y: 0 }, "i1"), {
        prompt: "Full-body front view character concept, plain background, game-ready proportions",
      });
      const m = newNode("model3d", { x: 720, y: 0 }, "m1");
      const s1 = withData(newNode("studio", { x: 1100, y: 20 }, "s1"), {
        title: "Make it an NPC",
        prompt: "Put the inserted character near the spawn, anchor it, and add a ProximityPrompt that greets the player.",
      });
      return {
        nodes: [t, i, m, s1],
        edges: [
          { id: "e1", source: "t1", target: "i1" },
          { id: "e2", source: "i1", target: "m1" },
          { id: "e3", source: "t1", target: "m1" },
          { id: "e4", source: "m1", target: "s1" },
        ],
      };
    },
  },
  {
    label: "World Asset",
    details: "From a reference image to a placed environment piece.",
    icon: "upload",
    build: () => {
      const u = newNode("upload", { x: 0, y: 0 }, "u1");
      const t = withData(newNode("text", { x: 0, y: 260 }, "t1"), { text: "A mossy stone bridge over a small river" });
      const m = newNode("model3d", { x: 380, y: 60 }, "m1");
      const c = withData(newNode("check", { x: 760, y: 60 }, "c1"), { preset: "tidy" });
      return {
        nodes: [u, t, m, c],
        edges: [
          { id: "e1", source: "u1", target: "m1" },
          { id: "e2", source: "t1", target: "m1" },
          { id: "e3", source: "m1", target: "c1" },
        ],
      };
    },
  },
  {
    label: "Game Icon",
    details: "A crisp item icon for your shop or inventory UI.",
    icon: "text",
    build: () => {
      const t = withData(newNode("text", { x: 0, y: 40 }, "t1"), { text: "A legendary golden sword with a ruby hilt" });
      const i = withData(newNode("image", { x: 340, y: 0 }, "i1"), {
        prompt: "Game inventory icon, centered, bold outline, soft studio lighting, transparent-looking plain background",
      });
      return { nodes: [t, i], edges: [{ id: "e1", source: "t1", target: "i1" }] };
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
    delete d.mesh; // object URLs and big previews don't survive a reload
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

function Editor({ send, stop, busy, connected, openrouterKey, generate3D, onInsertBuild, onNeedsKey, onBackToWorkspace }: Props) {
  const initial = useMemo(() => loadSaved(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [mode, setMode] = useState<"select" | "hand">("select");
  const [menu, setMenu] = useState<"none" | "add" | "more">("none");
  const [runningAll, setRunningAll] = useState(false);
  const [workflowName, setWorkflowName] = useState(() => {
    try {
      return localStorage.getItem(WORKFLOW_NAME_KEY) || "Untitled Workflow";
    } catch {
      return "Untitled Workflow";
    }
  });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
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
      localStorage.setItem(WORKFLOW_NAME_KEY, workflowName);
    } catch {}
  }, [nodes, edges, workflowName]);

  const backToWorkspace = onBackToWorkspace;

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

  // Where a right-click on empty canvas asked for a node (screen + flow coordinates).
  const [contextAt, setContextAt] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null);

  const addNode = (kind: NodeKind, at?: { x: number; y: number }) => {
    const rect = wrapper.current?.getBoundingClientRect();
    const k = spawnCount.current++ % 6;
    const pos =
      at ??
      screenToFlowPosition({
        x: (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) - 150 + k * 24,
        y: (rect ? rect.top + rect.height / 2.6 : window.innerHeight / 2.6) + k * 24,
      });
    setContextAt(null);
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...newNode(kind, pos), selected: true }]);
    setMenu("none");
  };

  const loadTemplate = (template: (typeof TEMPLATES)[number]) => {
    const graph = template.build();
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setMenu("none");
    setGalleryOpen(false);
    setTimeout(() => fitView({ padding: 0.25, duration: 500, maxZoom: 1 }), 50);
  };

  const askAssistant = async () => {
    const prompt = assistantInput.trim();
    if (!prompt || assistantBusy || busy) return;
    setAssistantBusy(true);
    setAssistantInput("");
    try {
      const result = await send(`You are helping edit the user's Roblox asset workflow. Current nodes: ${nodesRef.current.map((node) => `${node.type} (${node.id})`).join(", ") || "none"}. User request: ${prompt}`);
      setAssistantReply(result.error ?? result.text ?? "No response received.");
    } catch (error) {
      setAssistantReply((error as Error).message);
    } finally {
      setAssistantBusy(false);
    }
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
          const body = {
            apiKey: openrouterKey,
            model: node.data.model,
            prompt,
            image: images[0],
            codeFormat: node.data.codeFormat ?? "blender",
          };
          if (generate3D) {
            // The node's preview grows part by part; offline the model also lands in the workspace.
            let partial: BuildT = { name: "Building", parts: [] };
            patch(id, { build: undefined, inserted: undefined, phase: "Building…" });
            const r = await generate3D(
              body,
              {
                onName: (name) => (partial = { ...partial, name }),
                onPart: (part) => {
                  partial = { ...partial, parts: [...partial.parts, part] };
                  patch(id, { build: partial, phase: `${partial.parts.length} parts` });
                },
              },
              { autoAdd: !connected },
            ).catch((err: Error & { status?: number }) => {
              if (err.status === 400 && err.message.includes("OpenRouter")) onNeedsKey();
              throw err;
            });
            patch(id, {
              build: r.build,
              inserted: r.path,
              phase: undefined,
              mesh: r.mesh ? { url: r.mesh.url, preview: r.mesh.preview, tris: r.mesh.tris } : undefined,
            });
          } else {
            const r = await post<{ build: BuildT }>("/api/gen/model3d", body);
            patch(id, { build: r.build, inserted: undefined });
          }
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
          onPaneContextMenu={(event) => {
            event.preventDefault();
            const rect = wrapper.current?.getBoundingClientRect();
            setMenu("none");
            setContextAt({
              x: event.clientX - (rect?.left ?? 0),
              y: event.clientY - (rect?.top ?? 0),
              flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            });
          }}
          onPaneClick={() => setContextAt(null)}
          onMoveStart={() => setContextAt(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a3040" />
          <Controls position="bottom-left" showInteractive={false} className="!bottom-5 !left-4 !top-auto" />
          {nodes.length > 0 && (
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              maskColor="rgba(5,5,6,0.72)"
              nodeColor={(n) => KIND_STYLE[n.type as NodeKind]?.color ?? "#2f7dff"}
              className="!bottom-5 !left-[68px] !top-auto !m-0"
            />
          )}
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-[14%] bottom-24 z-[1] flex items-center justify-center overflow-y-auto py-6">
            <div className="pointer-events-auto w-full max-w-[960px]">
              <div className="mx-auto max-w-xl text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-blox/25 bg-blox/10 text-blox-soft shadow-[0_12px_40px_-18px_rgba(47,125,255,0.65)]"><KindIcon kind="more" className="size-6" /></span>
                <p className="mt-4 text-[10px] font-semibold tracking-[0.2em] text-blox-soft uppercase">Bloxy workflow canvas</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Start with one good idea.</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/45">Drop in a prompt, bring a reference, or choose a small workflow to get moving. Connect the steps and run them when you’re ready.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => addNode("image")} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#191b20]/90 px-3.5 py-2.5 text-xs font-medium text-white/85 transition hover:border-blox/35 hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-blox-soft"><KindIcon kind="image" className="size-4" />Generate image</button>
                  <button type="button" onClick={() => addNode("upload")} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#191b20]/90 px-3.5 py-2.5 text-xs font-medium text-white/85 transition hover:border-blox/35 hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-blox-soft"><KindIcon kind="upload" className="size-4" />Upload reference</button>
                  <button type="button" onClick={() => addNode("text")} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#191b20]/90 px-3.5 py-2.5 text-xs font-medium text-white/85 transition hover:border-blox/35 hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-blox-soft"><KindIcon kind="text" className="size-4" />Start from text</button>
                </div>
              </div>
              <div className="my-6 flex items-center gap-4 text-[11px] text-white/30"><span className="h-px flex-1 bg-white/[0.08]" /><span>or choose a starter</span><span className="h-px flex-1 bg-white/[0.08]" /></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {TEMPLATES.slice(0, 3).map((template) => (
                  <button key={template.label} type="button" onClick={() => loadTemplate(template)} className="group flex min-h-[124px] flex-col rounded-2xl border border-white/[0.09] bg-[#14161b]/90 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#1a1d24] focus-visible:ring-2 focus-visible:ring-blox-soft"><span className="grid size-8 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-blox-soft transition group-hover:border-blox/30 group-hover:bg-blox/10"><KindIcon kind={template.icon} className="size-4" /></span><span className="mt-3 text-sm font-semibold text-white/90">{template.label}</span><span className="mt-1 text-[11px] leading-relaxed text-white/45">{template.details}</span></button>
                ))}
                <button type="button" onClick={() => setGalleryOpen(true)} className="group flex min-h-[124px] flex-col rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.02] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blox/40 hover:bg-blox/[0.06] focus-visible:ring-2 focus-visible:ring-blox-soft"><span className="grid size-8 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-white/70"><KindIcon kind="more" className="size-4" /></span><span className="mt-3 text-sm font-semibold text-white/90">Browse templates</span><span className="mt-1 text-[11px] leading-relaxed text-white/45">{TEMPLATES.length} ready-made workflows for characters, worlds, icons and more.</span></button>
              </div>
              <p className="mt-4 text-center text-[10px] text-white/25">Right-click anywhere on the canvas to add a node at that spot.</p>
            </div>
          </div>
        )}

        <header className="pointer-events-none absolute inset-x-0 top-[4.25rem] z-10 flex items-center justify-between gap-3 px-4 sm:px-5">
          <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-[#111318]/90 p-1 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            <button type="button" onClick={backToWorkspace} title="Back to workspace" className="grid size-8 place-items-center rounded-xl text-white/65 transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-blox-soft"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m7 7-7-7 7-7" /></svg></button>
            <input aria-label="Workflow name" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} className="w-[min(34vw,185px)] bg-transparent px-2 text-xs font-medium text-white/90 outline-none focus-visible:ring-1 focus-visible:ring-blox-soft" />
            <span title="Saved in this browser" className="mr-1 grid size-7 place-items-center rounded-lg text-white/40"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18a4 4 0 0 1 .5-8 6.5 6.5 0 0 1 12.4-1.4A4.5 4.5 0 0 1 18 17h-2"/><path d="m9 15 3-3 3 3m-3-3v8"/></svg></span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111318]/90 p-1.5 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            <span className="hidden rounded-xl bg-white/[0.055] px-3 py-2 text-[11px] text-white/55 sm:inline-flex"><span className="mr-1.5 font-semibold tabular-nums text-white/85">{nodes.length}</span>{nodes.length === 1 ? "node" : "nodes"}</span>
            <button type="button" onClick={() => { setAssistantOpen((open) => !open); setMenu("none"); }} aria-pressed={assistantOpen} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-blox-soft ${assistantOpen ? "bg-blox/20 text-blox-soft" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`}><KindIcon kind="studio" className="size-4" /><span className="hidden sm:inline">Workflow assistant</span></button>
          </div>
        </header>

        {assistantOpen && <aside className="absolute top-[4.25rem] bottom-0 right-0 z-20 rounded-tl-2xl flex w-[min(360px,100vw)] flex-col border-l border-white/10 bg-[#101116]/95 shadow-[-24px_0_60px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4"><div><p className="text-sm font-semibold text-white">Workflow assistant</p><p className="text-[10px] text-white/40">Ask Bloxy to explain or plan your graph</p></div><button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close workflow assistant" className="grid size-8 place-items-center rounded-lg text-white/45 transition hover:bg-white/[0.08] hover:text-white">×</button></div>
          <div className="flex-1 overflow-y-auto px-4 py-5">{assistantReply ? <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{assistantReply}</div> : <div className="grid h-full place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl border border-blox/20 bg-blox/10 text-blox-soft"><KindIcon kind="studio" className="size-5" /></span><p className="mt-3 text-sm font-medium text-white/80">What should we build next?</p><p className="mt-1 max-w-[250px] text-xs leading-relaxed text-white/40">Ask for a workflow idea, help debugging a graph, or a plan for your next Roblox asset.</p><button type="button" onClick={() => setAssistantInput("Explain what this workflow does and where it could be improved.")} className="mt-4 rounded-full border border-white/10 px-3 py-2 text-[10px] text-white/55 transition hover:bg-white/[0.06] hover:text-white">Explain this workflow</button></div></div>}</div>
          <form onSubmit={(event) => { event.preventDefault(); void askAssistant(); }} className="shrink-0 border-t border-white/[0.08] p-3"><textarea value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askAssistant(); } }} rows={3} placeholder="Ask about this workflow…" className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-blox/45" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-white/35">Enter to send · Shift+Enter for newline</span><button type="submit" disabled={!assistantInput.trim() || assistantBusy || busy} className="rounded-lg bg-blox px-3 py-2 text-xs font-medium text-white transition hover:bg-blox/85 disabled:opacity-40">{assistantBusy || busy ? "Thinking…" : "Ask Bloxy →"}</button></div></form>
        </aside>}

        {contextAt && (
          <div
            className="absolute z-30"
            style={{
              left: Math.min(contextAt.x, (wrapper.current?.clientWidth ?? 9999) - 264),
              top: Math.min(contextAt.y, (wrapper.current?.clientHeight ?? 9999) - 420),
            }}
          >
            <AddNodeMenu title="Add node here" onPick={(kind) => addNode(kind, contextAt.flow)} />
          </div>
        )}

        {galleryOpen && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => setGalleryOpen(false)}>
            <div onMouseDown={(e) => e.stopPropagation()} className="max-h-[85%] w-full max-w-3xl overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[#101116]/97 p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">Templates</h2>
                  <p className="text-xs text-white/45">Start from a workflow, then edit any node. Loading one replaces the canvas.</p>
                </div>
                <button type="button" aria-label="Close templates" onClick={() => setGalleryOpen(false)} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">×</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((template) => {
                  const g = template.build();
                  return (
                    <button key={template.label} type="button" onClick={() => loadTemplate(template)} className="group flex flex-col rounded-2xl border border-white/[0.09] bg-[#14161b] p-4 text-left transition hover:-translate-y-0.5 hover:border-blox/40">
                      <span className="flex items-center gap-1.5">
                        {g.nodes.map((n, i) => (
                          <span key={n.id} className="flex items-center gap-1.5">
                            {i > 0 && <span className="h-px w-2.5 bg-white/20" />}
                            <span className="grid size-7 place-items-center rounded-lg bg-white/[0.05]" style={{ color: KIND_STYLE[n.type as NodeKind].color }}><KindIcon kind={n.type as NodeKind} className="size-3.5" /></span>
                          </span>
                        ))}
                      </span>
                      <span className="mt-3 text-sm font-semibold text-white/90">{template.label}</span>
                      <span className="mt-1 text-[11px] leading-relaxed text-white/45">{template.details}</span>
                      <span className="mt-2 text-[10px] text-white/30">{g.nodes.length} nodes</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom toolbar */}
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        {/* Menus live outside the scrolling bar so overflow doesn't clip them. */}
        {menu === "add" && <div className="absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2"><AddNodeMenu onPick={(kind) => addNode(kind)} /></div>}
        {menu === "more" && <div className="absolute bottom-full left-1/2 mb-3 w-56 -translate-x-1/2 z-20 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-2xl backdrop-blur-xl"><p className="px-3 pt-1.5 pb-1 text-[10px] tracking-[0.18em] text-white/35 uppercase">Templates</p>{TEMPLATES.slice(0, 4).map((template) => <button key={template.label} onClick={() => loadTemplate(template)} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.07] hover:text-white">{template.label}</button>)}<button onClick={() => { setGalleryOpen(true); setMenu("none"); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-blox-soft hover:bg-white/[0.07]">Browse all templates…</button><div className="my-1 h-px bg-white/10"/><button onClick={() => { setNodes([]); setEdges([]); setMenu("none"); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-300/80 hover:bg-red-500/10">Clear canvas</button></div>}
        <div className="flex max-w-[calc(100vw-100px)] items-center gap-1 overflow-x-auto rounded-[1.35rem] border border-white/10 bg-[#14161b]/95 p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl [scrollbar-width:none]">
          <ToolButton active={mode === "select"} title="Select (V)" onClick={() => setMode("select")}><KindIcon kind="select" className="size-[19px]" /></ToolButton>
          <ToolButton active={mode === "hand"} title="Hand / pan (H)" onClick={() => setMode("hand")}><KindIcon kind="hand" className="size-[19px]" /></ToolButton>
          <div className="relative"><ToolButton title="Notes and comments" onClick={() => setMenu((m) => m === "add" ? "none" : "add")}><KindIcon kind="note" className="size-[19px]" /></ToolButton></div>
          <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
          {TOOLBAR_NODES.map((kind) => <ToolButton key={kind} title={`Add ${KIND_STYLE[kind].label}`} onClick={() => addNode(kind)}><KindIcon kind={kind} className="size-[19px]" /></ToolButton>)}
          <div className="relative"><ToolButton title="Templates and canvas options" onClick={() => setMenu((m) => m === "more" ? "none" : "more")}><KindIcon kind="more" className="size-[19px]" /></ToolButton></div>
          <button type="button" title="Add node" aria-label="Add node" onClick={() => setMenu((m) => m === "add" ? "none" : "add")} className="ml-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/80 transition hover:border-blox/30 hover:bg-blox/10 hover:text-white focus-visible:ring-2 focus-visible:ring-blox-soft"><KindIcon kind="plus" className="size-5" /></button>
          {runningAll ? <button onClick={() => { cancelRef.current = true; stop(); }} className="h-10 shrink-0 rounded-xl bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15">Stop</button> : <button onClick={() => void runAll()} disabled={busy || nodes.length === 0} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-blox px-3.5 text-xs font-semibold text-white shadow-[0_10px_30px_-10px_rgba(47,125,255,0.75)] transition hover:bg-blox/90 disabled:opacity-40"><svg viewBox="0 0 24 24" className="size-3" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>Run all</button>}
        </div>
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
