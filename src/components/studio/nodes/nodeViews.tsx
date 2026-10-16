"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState } from "react";
import { ChevronDown } from "../../landing/icons";
import {
  CHECKS,
  KIND_STYLE,
  type CheckData,
  type FlowNode,
  type ImageData,
  type Model3DData,
  type NodeKind,
  type NoteData,
  type RunStatus,
  type StudioData,
  type TextData,
  type UploadData,
  type VideoData,
} from "./types";
import { KindIcon } from "./icons";

const ModelPreview = dynamic(() => import("./ModelPreview"), { ssr: false });

// ── Actions the nodes call into (provided by the editor) ──

export type NodeActions = {
  run: (id: string) => void;
  insertBuild: (id: string) => void;
  connected: boolean;
  busy: boolean;
};
export const ActionsContext = createContext<NodeActions>({
  run: () => {},
  insertBuild: () => {},
  connected: false,
  busy: false,
});

// Model id suggestions per kind, fetched once from OpenRouter's public lists.
type ModelOption = { id: string; name: string };
const modelCache: Partial<Record<"text" | "image" | "video" | "model3d", Promise<ModelOption[]>>> = {};
function useModels(kind: "text" | "image" | "video" | "model3d") {
  const [models, setModels] = useState<ModelOption[]>([]);
  useEffect(() => {
    modelCache[kind] ??= fetch(`/api/gen/models?kind=${kind}`)
      .then((r) => r.json())
      .then((d: { models?: ModelOption[] }) => d.models ?? [])
      .catch(() => []);
    let alive = true;
    void modelCache[kind]!.then((m) => alive && setModels(m));
    return () => {
      alive = false;
    };
  }, [kind]);
  return models;
}

// ── Shared pieces ──

const STATUS_STYLE: Record<RunStatus, string> = {
  idle: "bg-white/[0.06] text-white/40",
  queued: "bg-white/[0.06] text-white/60",
  running: "bg-blox/20 text-blox-soft",
  done: "bg-signal/15 text-signal",
  error: "bg-red-500/15 text-red-300",
};

function StatusBadge({ status }: { status: RunStatus }) {
  if (status === "idle") return null;
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
  kind,
  title,
  selected,
  status,
  width = 300,
  inputs = true,
  outputs = true,
  children,
  footer,
}: {
  kind: NodeKind;
  title?: React.ReactNode;
  selected: boolean;
  status: RunStatus;
  width?: number;
  inputs?: boolean;
  outputs?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const style = KIND_STYLE[kind];
  const ring =
    status === "running"
      ? "shadow-[0_0_0_1px_rgba(47,125,255,0.8),0_0_0_5px_rgba(47,125,255,0.15),0_24px_60px_-24px_rgba(47,125,255,0.8)]"
      : selected
        ? "shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
        : "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]";
  return (
    <div style={{ width }} className={`rounded-2xl bg-[#14151a] transition-shadow duration-300 ${ring}`}>
      {inputs && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-[#14151a]"
          style={{ background: style.color }}
        />
      )}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span
          className="grid size-6 place-items-center rounded-lg"
          style={{ background: `${style.color}22`, color: style.color }}
        >
          <KindIcon kind={kind} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">{title ?? style.label}</span>
        <StatusBadge status={status} />
      </div>
      <div className="px-3 pb-3">{children}</div>
      {footer && <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">{footer}</div>}
      {outputs && (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-[#14151a]"
          style={{ background: style.color }}
        />
      )}
    </div>
  );
}

const fieldCls =
  "nodrag nowheel w-full resize-none rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 text-[12.5px] leading-relaxed text-white/85 outline-none placeholder:text-white/25 focus:border-white/25";

function PromptField({
  id,
  value,
  placeholder,
  rows = 3,
}: {
  id: string;
  value: string;
  placeholder: string;
  rows?: number;
}) {
  const { updateNodeData } = useReactFlow();
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
      placeholder={placeholder}
      className={fieldCls}
    />
  );
}

function ModelField({ id, value, kind }: { id: string; value: string; kind: "text" | "image" | "video" | "model3d" }) {
  const { updateNodeData } = useReactFlow();
  const models = useModels(kind);
  const listId = `models-${kind}`;
  return (
    <div className="relative mt-2">
      <input
        aria-label="Model ID"
        value={value}
        list={listId}
        onChange={(e) => updateNodeData(id, { model: e.target.value })}
        className="nodrag w-full rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-white/25"
      />
      <datalist id={listId}>
        {models.map((model) => (
          <option key={model.id} value={model.id} label={model.name} />
        ))}
      </datalist>
      {kind === "model3d" && <p className="mt-1 text-[9px] text-white/30">OpenRouter coding models · manually editable</p>}
    </div>
  );
}

function RunButton({ id, label, status }: { id: string; label: string; status: RunStatus }) {
  const { run, busy } = useContext(ActionsContext);
  const running = status === "running";
  return (
    <button
      onClick={() => run(id)}
      disabled={running || busy}
      className="nodrag ml-auto flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="currentColor">
        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
      </svg>
      {running ? "Working…" : label}
    </button>
  );
}

function ErrorLine({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-red-300">{error}</p>;
}

// ── Node views ──

function TextNode({ id, data, selected }: NodeProps<FlowNode & { type: "text"; data: TextData }>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell kind="text" selected={!!selected} status={data.status} inputs={false}>
      <textarea
        value={data.text}
        rows={4}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="Write a prompt or idea. Connect it to Image, Video, 3D or Studio nodes."
        className={fieldCls}
      />
    </Shell>
  );
}

function NoteNode({ id, data }: NodeProps<FlowNode & { type: "note"; data: NoteData }>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div className="w-[220px] -rotate-1 rounded-xl bg-[#f5c451] p-3 text-[#3a2c00] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]">
      <textarea
        value={data.text}
        rows={4}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="Note…"
        className="nodrag nowheel w-full resize-none bg-transparent text-[13px] leading-snug font-medium outline-none placeholder:text-[#3a2c00]/50"
      />
    </div>
  );
}

function UploadNode({ id, data, selected }: NodeProps<FlowNode & { type: "upload"; data: UploadData }>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell kind="upload" selected={!!selected} status={data.status} inputs={false} width={260}>
      <label className="nodrag block cursor-pointer overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/30 text-center hover:border-white/30">
        {data.output ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.output} alt={data.fileName ?? "Uploaded image"} className="max-h-56 w-full object-contain" />
        ) : (
          <span className="block px-3 py-8 text-[12px] text-white/40">Click to upload an image</span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8_000_000) {
              updateNodeData(id, { error: "Images up to 8 MB.", status: "error" });
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              updateNodeData(id, { output: String(reader.result), fileName: f.name, status: "done", error: undefined });
            reader.readAsDataURL(f);
          }}
        />
      </label>
      <ErrorLine error={data.error} />
    </Shell>
  );
}

function ImageNode({ id, data, selected }: NodeProps<FlowNode & { type: "image"; data: ImageData }>) {
  return (
    <Shell
      kind="image"
      selected={!!selected}
      status={data.status}
      footer={
        <>
          {data.output && (
            <a
              href={data.output}
              download="bloxy-image.png"
              className="nodrag text-[11px] text-white/45 hover:text-white"
            >
              Download
            </a>
          )}
          <RunButton id={id} label="Generate" status={data.status} />
        </>
      }
    >
      {data.output && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.output} alt="Generated" className="mb-2 w-full rounded-xl" />
      )}
      <PromptField id={id} value={data.prompt} placeholder="Describe the image… (connected Text nodes are added)" />
      <ModelField id={id} value={data.model} kind="image" />
      <ErrorLine error={data.error} />
    </Shell>
  );
}

function VideoNode({ id, data, selected }: NodeProps<FlowNode & { type: "video"; data: VideoData }>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell
      kind="video"
      selected={!!selected}
      status={data.status}
      width={320}
      footer={
        <>
          <select
            value={data.aspect}
            onChange={(e) => updateNodeData(id, { aspect: e.target.value })}
            className="nodrag rounded-md bg-black/40 px-1.5 py-1 text-[11px] text-white/70 outline-none"
          >
            {["16:9", "9:16", "1:1"].map((a) => (
              <option key={a} value={a} className="bg-[#14151a]">
                {a}
              </option>
            ))}
          </select>
          <select
            value={data.duration}
            onChange={(e) => updateNodeData(id, { duration: Number(e.target.value) })}
            className="nodrag rounded-md bg-black/40 px-1.5 py-1 text-[11px] text-white/70 outline-none"
          >
            {[4, 5, 6, 8, 10].map((d) => (
              <option key={d} value={d} className="bg-[#14151a]">
                {d}s
              </option>
            ))}
          </select>
          <RunButton id={id} label="Generate" status={data.status} />
        </>
      }
    >
      {data.output && <video src={data.output} controls loop className="nodrag mb-2 w-full rounded-xl" />}
      {data.status === "running" && data.phase && <p className="mb-2 text-[11px] text-white/45">{data.phase}</p>}
      <PromptField
        id={id}
        value={data.prompt}
        placeholder="Describe the shot… (a connected image becomes the first frame)"
      />
      <ModelField id={id} value={data.model} kind="video" />
      <ErrorLine error={data.error} />
    </Shell>
  );
}

function Model3DNode({ id, data, selected }: NodeProps<FlowNode & { type: "model3d"; data: Model3DData }>) {
  const { insertBuild, connected } = useContext(ActionsContext);
  const { updateNodeData } = useReactFlow();
  const codeFormat = data.codeFormat ?? "blender";
  const script = data.build?.blender_script ?? "";
  return (
    <Shell
      kind="model3d"
      selected={!!selected}
      status={data.status}
      width={320}
      footer={
        <>
          {data.build && (
            <button
              onClick={() => insertBuild(id)}
              className="nodrag rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/[0.06]"
              title={connected ? "Insert as a Model in Studio" : "Connect Studio to insert; adds to the demo place"}
            >
              {connected ? "Insert into Studio" : "Add to workspace"}
            </button>
          )}
          <RunButton id={id} label="Generate 3D" status={data.status} />
        </>
      }
    >
      <div className="mb-2 flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/25 p-1">
        {(["roblox", "blender"] as const).map((format) => <button key={format} type="button" aria-pressed={codeFormat === format} onClick={() => updateNodeData(id, { codeFormat: format, model: format === "blender" ? "google/gemini-3.8-flash" : "anthropic/claude-opus-5.5", build: undefined, error: undefined, status: "idle" })} className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium capitalize transition-colors ${codeFormat === format ? "bg-white/[0.12] text-white" : "text-white/45 hover:bg-white/[0.06] hover:text-white/80"}`}>{format === "roblox" ? "Roblox parts" : "Blender Python"}</button>)}
      </div>
      {data.build && codeFormat === "roblox" && (
        <div className="nodrag nowheel nopan mb-2 h-48 overflow-hidden rounded-xl">
          <ModelPreview build={data.build} />
        </div>
      )}
      {data.build && codeFormat === "blender" && script && (
        <div className="nodrag nowheel nopan mb-2 max-h-48 overflow-auto rounded-xl border border-white/[0.07] bg-black/35 p-3"><pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-white/70">{data.build.blender_script}</pre><button type="button" onClick={() => void navigator.clipboard?.writeText(script)} className="mt-2 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/65 hover:bg-white/[0.07]">Copy Blender code</button></div>
      )}
      {data.build && (
        <p className="mb-2 text-[11px] text-white/45">
          <span className="font-mono text-white/70">{data.build.name}</span>{codeFormat === "blender" ? " · Blender Python" : ` · ${data.build.parts.length} parts`}
          {data.inserted && <span className="text-signal"> · inserted at {data.inserted}</span>}
        </p>
      )}
      <PromptField id={id} value={data.prompt} placeholder="Describe the 3D object… e.g. a low-poly red pickup truck" />
      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">{codeFormat === "blender" ? "Generates a Blender 5.0 procedural bpy script using a related 3DCode training example as additional code context." : "Generates Roblox part geometry as structured code. Pick an OpenRouter coding model, then insert the validated result into the scene."}</p>
      <ModelField id={id} value={data.model} kind="model3d" />
      <ErrorLine error={data.error} />
    </Shell>
  );
}

function StudioNode({ id, data, selected }: NodeProps<FlowNode & { type: "studio"; data: StudioData }>) {
  const { updateNodeData } = useReactFlow();
  const { connected } = useContext(ActionsContext);
  return (
    <Shell
      kind="studio"
      selected={!!selected}
      status={data.status}
      title={
        <input
          value={data.title}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          className="nodrag w-full bg-transparent outline-none"
        />
      }
      footer={
        <>
          {!connected && <span className="text-[11px] text-white/35">Connect Studio to run</span>}
          <RunButton id={id} label="Run in Studio" status={data.status} />
        </>
      }
    >
      <PromptField id={id} value={data.prompt} placeholder="Tell Bloxy what to build or change in Studio…" rows={4} />
      {data.result !== undefined && (
        <p className="mt-2 text-[11.5px] leading-snug text-white/55">
          <span className="mr-1.5 font-mono text-white/35">{data.tools ?? 0} tools</span>
          {data.result || "No reply text."}
        </p>
      )}
      <ErrorLine error={data.error} />
    </Shell>
  );
}

function CheckNode({ id, data, selected }: NodeProps<FlowNode & { type: "check"; data: CheckData }>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell
      kind="check"
      selected={!!selected}
      status={data.status}
      width={260}
      footer={<RunButton id={id} label="Run" status={data.status} />}
    >
      <div className="relative">
        <select
          value={data.preset}
          onChange={(e) => updateNodeData(id, { preset: e.target.value })}
          className="nodrag w-full appearance-none rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 pr-8 text-[12.5px] text-white/85 outline-none"
        >
          {Object.entries(CHECKS).map(([key, c]) => (
            <option key={key} value={key} className="bg-[#14151a]">
              {c.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-white/40" />
      </div>
      {data.result !== undefined && (
        <p className="mt-2 text-[11.5px] leading-snug text-white/55">
          <span className="mr-1.5 font-mono text-white/35">{data.tools ?? 0} tools</span>
          {data.result || "No reply text."}
        </p>
      )}
      <ErrorLine error={data.error} />
    </Shell>
  );
}

export const nodeTypes = {
  text: TextNode,
  note: NoteNode,
  upload: UploadNode,
  image: ImageNode,
  video: VideoNode,
  model3d: Model3DNode,
  studio: StudioNode,
  check: CheckNode,
};
