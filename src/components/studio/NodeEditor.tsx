"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TurnResult } from "./useChat";
import { ChevronDown, Plus, Sparkle, Stop } from "../landing/icons";

// ── Node data ──

type RunStatus = "idle" | "queued" | "running" | "done" | "error";
type StepData = { title: string; prompt: string; status: RunStatus; result?: string; tools?: number };
type CheckData = { preset: keyof typeof CHECKS; status: RunStatus; result?: string; tools?: number };
type StartData = { status: RunStatus };

type StepNode = Node<StepData, "step">;
type CheckNode = Node<CheckData, "check">;
type StartNode = Node<StartData, "start">;
type FlowNode = StepNode | CheckNode | StartNode;

const CHECKS = {
  output: {
    label: "Fix Output errors",
    prompt: "Read the Output window. If there are errors or warnings from what you built, fix them and check again.",
  },
  review: {
    label: "Review scripts",
    prompt:
      "Review the scripts you created or changed in this session for bugs, exploits and missing server validation, and fix what you find.",
  },
  tidy: {
    label: "Tidy hierarchy",
    prompt:
      "Tidy up what you built: group related instances into well-named Models/Folders and anchor parts that should not move.",
  },
} as const;

const STORAGE_KEY = "bloxy.workflow.v1";

// ── Templates ──

function chain(steps: { title: string; prompt: string }[], check?: keyof typeof CHECKS) {
  const nodes: FlowNode[] = [
    { id: "start", type: "start", position: { x: 0, y: 0 }, data: { status: "idle" }, deletable: false },
  ];
  const edges: Edge[] = [];
  let prev = "start";
  steps.forEach((s, i) => {
    const id = `step-${i + 1}`;
    nodes.push({
      id,
      type: "step",
      position: { x: 300 + i * 340, y: i % 2 === 0 ? -20 : 40 },
      data: { ...s, status: "idle" },
    });
    edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
    prev = id;
  });
  if (check) {
    const id = "check-1";
    nodes.push({
      id,
      type: "check",
      position: { x: 300 + steps.length * 340, y: 0 },
      data: { preset: check, status: "idle" },
    });
    edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
  }
  return { nodes, edges };
}

const TEMPLATES = {
  blank: { label: "Blank", build: () => chain([{ title: "First step", prompt: "" }]) },
  obby: {
    label: "Lava obby",
    build: () =>
      chain(
        [
          {
            title: "Course",
            prompt:
              "Build a 12-stage obby in Workspace.Obby: anchored platforms over a lava floor, getting harder each stage.",
          },
          {
            title: "Checkpoints",
            prompt:
              "Add a checkpoint at each stage that saves the player's stage with a leaderstat and respawns them there.",
          },
          { title: "Lava", prompt: "Make the lava kill players on touch, with a server script. Make it glow." },
        ],
        "output",
      ),
  },
  coins: {
    label: "Coin collector",
    build: () =>
      chain(
        [
          {
            title: "Leaderstats",
            prompt: "Add a Coins leaderstat for every player, saved with DataStoreService and pcall.",
          },
          {
            title: "Coins",
            prompt:
              "Scatter 30 spinning gold coins in Workspace.Coins that give +1 Coins on touch and respawn after 10 seconds.",
          },
          { title: "HUD", prompt: "Add a clean coin counter HUD at the top of the screen that updates live." },
        ],
        "review",
      ),
  },
  tycoon: {
    label: "Tycoon starter",
    build: () =>
      chain(
        [
          {
            title: "Plot",
            prompt: "Create a tycoon plot in Workspace.Tycoon with a claim pad, a dropper, a conveyor and a collector.",
          },
          {
            title: "Economy",
            prompt: "Wire the economy: droppers spawn ore, the collector converts it to Cash leaderstat on the server.",
          },
          {
            title: "Buttons",
            prompt: "Add 5 purchase buttons that unlock upgrades in order, with prices shown on BillboardGuis.",
          },
        ],
        "output",
      ),
  },
} as const;

// ── Node components ──

const STATUS_STYLE: Record<RunStatus, string> = {
  idle: "bg-white/[0.06] text-white/45",
  queued: "bg-white/[0.06] text-white/60",
  running: "bg-blox/20 text-blox-soft",
  done: "bg-signal/15 text-signal",
  error: "bg-red-500/15 text-red-300",
};

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] uppercase ${STATUS_STYLE[status]}`}
    >
      {status === "running" && (
        <span className="relative flex size-1.5">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-blox-soft" />
          <span className="relative size-1.5 rounded-full bg-blox-soft" />
        </span>
      )}
      {status}
    </span>
  );
}

function Shell({
  selected,
  status,
  accent,
  children,
}: {
  selected: boolean;
  status: RunStatus;
  accent: string;
  children: React.ReactNode;
}) {
  const ring =
    status === "running"
      ? "border-blox/60 shadow-[0_0_0_4px_rgba(47,125,255,0.15),0_20px_60px_-20px_rgba(47,125,255,0.8)]"
      : selected
        ? "border-white/30"
        : "border-white/10";
  return (
    <div
      className={`w-[280px] rounded-[1.25rem] border bg-white/[0.03] p-1 transition-all duration-500 ease-[var(--ease-spring)] ${ring}`}
    >
      <div className="relative overflow-hidden rounded-[calc(1.25rem-0.25rem)] bg-[#101116] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
        <div className={`absolute inset-x-0 top-0 h-px ${accent}`} />
        {children}
      </div>
    </div>
  );
}

const handleCls = "!size-3 !rounded-full !border-2 !border-[#101116] !bg-blox-soft";

function StartNodeView({ data }: NodeProps<StartNode>) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#101116] py-2 pr-4 pl-2 shadow-[0_20px_50px_-20px_rgba(47,125,255,0.6)]">
      <span
        className={`grid size-8 place-items-center rounded-full ${data.status === "running" ? "bg-blox" : "bg-white/10"}`}
      >
        <Sparkle className="size-4" />
      </span>
      <span className="font-display text-sm font-bold tracking-tight">Start</span>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </div>
  );
}

function StepNodeView({ id, data, selected }: NodeProps<StepNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell
      selected={!!selected}
      status={data.status}
      accent="bg-gradient-to-r from-transparent via-blox to-transparent"
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <input
          value={data.title}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          className="nodrag min-w-0 flex-1 bg-transparent font-display text-[15px] font-bold tracking-tight outline-none"
          placeholder="Step name"
        />
        <StatusBadge status={data.status} />
      </div>
      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        rows={4}
        placeholder="Tell Bloxy what to build in this step…"
        className="nodrag nowheel mx-3 mt-2 mb-3 block w-[calc(100%-1.5rem)] resize-none rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 text-[12.5px] leading-relaxed text-white/85 outline-none placeholder:text-white/25 focus:border-blox/50"
      />
      {data.result !== undefined && (
        <div className="border-t border-white/[0.06] px-3.5 py-2.5 text-[11.5px] leading-snug text-white/55">
          <span className="mr-1.5 font-mono text-white/35">{data.tools ?? 0} tools</span>
          {data.result || "No reply text."}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={handleCls} />
    </Shell>
  );
}

function CheckNodeView({ id, data, selected }: NodeProps<CheckNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell
      selected={!!selected}
      status={data.status}
      accent="bg-gradient-to-r from-transparent via-signal to-transparent"
    >
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className="font-display text-[15px] font-bold tracking-tight">Check</span>
        <StatusBadge status={data.status} />
      </div>
      <div className="relative mx-3 mt-2 mb-3">
        <select
          value={data.preset}
          onChange={(e) => updateNodeData(id, { preset: e.target.value })}
          className="nodrag w-full appearance-none rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 pr-8 text-[12.5px] text-white/85 outline-none focus:border-signal/50"
        >
          {Object.entries(CHECKS).map(([key, c]) => (
            <option key={key} value={key} className="bg-[#101116]">
              {c.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-white/40" />
      </div>
      {data.result !== undefined && (
        <div className="border-t border-white/[0.06] px-3.5 py-2.5 text-[11.5px] leading-snug text-white/55">
          <span className="mr-1.5 font-mono text-white/35">{data.tools ?? 0} tools</span>
          {data.result || "No reply text."}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={handleCls} />
    </Shell>
  );
}

const nodeTypes = { start: StartNodeView, step: StepNodeView, check: CheckNodeView };

// ── Run order: walk from Start; at a fork, go top to bottom. ──

function runOrder(nodes: FlowNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    const next = edges
      .filter((e) => e.source === id)
      .map((e) => byId.get(e.target))
      .filter((n): n is FlowNode => !!n && !seen.has(n.id))
      .sort((a, b) => a.position.y - b.position.y);
    for (const n of next) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      order.push(n);
      visit(n.id);
    }
  };
  visit("start");
  return order;
}

function promptFor(n: FlowNode) {
  if (n.type === "step") return n.data.prompt.trim();
  if (n.type === "check") return CHECKS[n.data.preset].prompt;
  return "";
}

function loadSaved(): { nodes: FlowNode[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { nodes: FlowNode[]; edges: Edge[] };
      // Never restore a half-finished run.
      saved.nodes = saved.nodes.map((n) => ({ ...n, data: { ...n.data, status: "idle" } }) as FlowNode);
      if (saved.nodes.some((n) => n.id === "start")) return saved;
    }
  } catch {}
  return TEMPLATES.obby.build();
}

// ── Editor ──

function Editor({
  send,
  stop,
  busy,
  connected,
}: {
  send: (text: string) => Promise<TurnResult>;
  stop: () => void;
  busy: boolean;
  connected: boolean;
}) {
  const initial = useMemo(() => loadSaved(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [running, setRunning] = useState(false);
  const [menu, setMenu] = useState(false);
  const cancelRef = useRef(false);
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    } catch {}
  }, [nodes, edges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, animated: false }, es)),
    [setEdges],
  );

  const setStatus = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as FlowNode) : n))),
    [setNodes],
  );

  const addNode = (type: "step" | "check") => {
    const id = `${type}-${Date.now().toString(36)}`;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2.4 });
    const node: FlowNode =
      type === "step"
        ? { id, type, position: center, data: { title: "New step", prompt: "", status: "idle" } }
        : { id, type, position: center, data: { preset: "output", status: "idle" } };
    setNodes((ns) => [...ns, node]);
  };

  const loadTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key].build();
    setNodes(t.nodes);
    setEdges(t.edges);
    setMenu(false);
    setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 50);
  };

  const run = async () => {
    const order = runOrder(nodes, edges);
    if (order.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setNodes((ns) =>
      ns.map(
        (n) =>
          ({
            ...n,
            data: {
              ...n.data,
              status: n.id === "start" ? "running" : order.some((o) => o.id === n.id) ? "queued" : "idle",
              result: undefined,
              tools: undefined,
            },
          }) as FlowNode,
      ),
    );
    setEdges((es) => es.map((e) => ({ ...e, animated: false })));
    setStatus("start", { status: "done" });

    for (const n of order) {
      if (cancelRef.current) break;
      const prompt = promptFor(n);
      if (!prompt) {
        setStatus(n.id, { status: "error", result: "This step has no prompt." });
        break;
      }
      setStatus(n.id, { status: "running" });
      setEdges((es) => es.map((e) => ({ ...e, animated: e.target === n.id })));
      const r = await send(prompt);
      setStatus(n.id, {
        status: r.ok ? "done" : "error",
        result: (r.error ?? r.text).replace(/\s+/g, " ").slice(0, 180),
        tools: r.tools,
      });
      if (!r.ok) break;
    }
    setEdges((es) => es.map((e) => ({ ...e, animated: false })));
    setNodes((ns) =>
      ns.map((n) => (n.data.status === "queued" ? ({ ...n, data: { ...n.data, status: "idle" } } as FlowNode) : n)),
    );
    setRunning(false);
  };

  const cancel = () => {
    cancelRef.current = true;
    stop();
  };

  const stepCount = nodes.filter((n) => n.type !== "start").length;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.25}
        maxZoom={1.75}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
        className="bloxy-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a3040" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable maskColor="rgba(5,5,6,0.7)" nodeColor="#2f7dff" />
      </ReactFlow>

      {/* Toolbar */}
      <div className="absolute top-[4.75rem] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/50 p-1.5 backdrop-blur-xl">
          <button
            onClick={() => addNode("step")}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/75 transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <Plus className="size-3.5" /> Step
          </button>
          <button
            onClick={() => addNode("check")}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/75 transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <Plus className="size-3.5" /> Check
          </button>
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              disabled={running}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/75 transition-colors duration-500 ease-[var(--ease-spring)] hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
            >
              Templates{" "}
              <ChevronDown
                className={`size-3.5 transition-transform duration-500 ease-[var(--ease-spring)] ${menu ? "rotate-180" : ""}`}
              />
            </button>
            {menu && (
              <div className="absolute top-full left-0 z-10 mt-2 w-48 rounded-2xl border border-white/10 bg-[#0d0e12]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => loadTemplate(k)}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.07] hover:text-white"
                  >
                    {TEMPLATES[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="mx-1 h-5 w-px bg-white/10" />
          {running ? (
            <button
              onClick={cancel}
              className="flex items-center gap-2 rounded-full bg-white/10 py-1.5 pr-3 pl-2 text-sm hover:bg-white/15"
            >
              <span className="grid size-6 place-items-center rounded-full bg-white/10">
                <Stop className="size-3" />
              </span>
              Stop run
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!connected || busy || stepCount === 0}
              title={!connected ? "Connect Studio first" : undefined}
              className="group flex items-center gap-2 rounded-full bg-blox py-1.5 pr-1.5 pl-4 text-sm font-medium text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_10px_30px_-10px_rgba(47,125,255,0.9)] transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
            >
              Run workflow
              <span className="grid size-6 place-items-center rounded-full bg-white/15 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="size-3" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                </svg>
              </span>
            </button>
          )}
        </div>
        {!connected && (
          <p className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] text-white/50 backdrop-blur-xl">
            Connect Studio in the 3D Workspace tab to run workflows
          </p>
        )}
      </div>
    </div>
  );
}

export default function NodeEditor(props: {
  send: (text: string) => Promise<TurnResult>;
  stop: () => void;
  busy: boolean;
  connected: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
