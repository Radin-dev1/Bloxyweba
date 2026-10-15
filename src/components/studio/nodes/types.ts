import type { Edge, Node } from "@xyflow/react";
import type { BuildT } from "@/lib/openrouter";

export type RunStatus = "idle" | "queued" | "running" | "done" | "error";

type Base = { status: RunStatus; error?: string };

export type TextData = Base & { text: string };
export type NoteData = Base & { text: string };
export type UploadData = Base & { output?: string; fileName?: string };
export type ImageData = Base & { prompt: string; model: string; output?: string };
export type VideoData = Base & {
  prompt: string;
  model: string;
  duration: number;
  aspect: string;
  jobId?: string;
  output?: string;
  phase?: string;
};
export type Model3DData = Base & { prompt: string; model: string; build?: BuildT; inserted?: string };
export type StudioData = Base & { title: string; prompt: string; result?: string; tools?: number };
export type CheckData = Base & { preset: CheckPreset; result?: string; tools?: number };

export type FlowNode =
  | Node<TextData, "text">
  | Node<NoteData, "note">
  | Node<UploadData, "upload">
  | Node<ImageData, "image">
  | Node<VideoData, "video">
  | Node<Model3DData, "model3d">
  | Node<StudioData, "studio">
  | Node<CheckData, "check">;

export type NodeKind = FlowNode["type"];
export type { Edge };

export const CHECKS = {
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
export type CheckPreset = keyof typeof CHECKS;

/** Accent per node kind (header icon, handle and selection colour). */
export const KIND_STYLE: Record<NodeKind, { label: string; color: string }> = {
  text: { label: "Text", color: "#9aa4b8" },
  note: { label: "Note", color: "#f5c451" },
  upload: { label: "Upload", color: "#f0a35c" },
  image: { label: "Image", color: "#f472b6" },
  video: { label: "Video", color: "#a78bfa" },
  model3d: { label: "3D Model", color: "#34e0a1" },
  studio: { label: "Studio step", color: "#2f7dff" },
  check: { label: "Check", color: "#7fb0ff" },
};
