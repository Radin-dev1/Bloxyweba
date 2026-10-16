"use client";

import { useCallback, useRef, useState } from "react";
import type { BuildT } from "@/lib/openrouter";
import type { BuildPartT } from "./model3dStream";

/** A model that is being built right now, shown in the 3D workspace part by part. */
export type LiveBuild = {
  name: string;
  parts: BuildPartT[];
  status: string;
  /** Where in the workspace it's being built (studs). */
  origin: [number, number, number];
};

export function useLiveBuild() {
  const [live, setLive] = useState<LiveBuild | null>(null);
  const playing = useRef(0);

  const begin = useCallback((origin: [number, number, number], name = "New model") => {
    playing.current++;
    setLive({ name, parts: [], status: "Planning the model", origin });
  }, []);
  const status = useCallback((text: string) => setLive((l) => (l ? { ...l, status: text } : l)), []);
  const rename = useCallback((name: string) => setLive((l) => (l ? { ...l, name } : l)), []);
  const part = useCallback(
    (p: BuildPartT) => setLive((l) => (l ? { ...l, parts: [...l.parts, p], status: `Placing ${p.name}` } : l)),
    [],
  );
  const end = useCallback(() => setLive(null), []);

  /** Replays a finished build part by part (about 2.5 s in total), e.g. one the chat agent made. */
  const play = useCallback(
    async (build: BuildT, origin: [number, number, number]) => {
      begin(origin, build.name);
      const run = playing.current;
      const delay = Math.min(140, Math.max(20, 2500 / Math.max(1, build.parts.length)));
      for (const p of build.parts) {
        await new Promise((r) => setTimeout(r, delay));
        if (playing.current !== run) return false; // another build took over
        part(p);
      }
      return true;
    },
    [begin, part],
  );

  return { live, begin, status, rename, part, end, play };
}
