"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_ENVIRONMENT,
  GROUND_PRESETS,
  SKY_PRESETS,
  drawGround,
  drawSky,
  type Environment,
  type GroundPreset,
  type SkyPreset,
} from "../environment";

type Tab = "sky" | "ground" | "fog";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block px-1">
      <span className="flex justify-between text-[11px] text-white/55">
        {label}
        <span className="tabular-nums text-white/80">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[#2f7dff]"
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="flex-1 text-[11px] text-white/55">{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent"
      />
      <span className="w-16 font-mono text-[10.5px] text-white/50">{value ?? "preset"}</span>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-[10.5px] text-blox-soft hover:underline">
          Reset
        </button>
      )}
    </div>
  );
}

/**
 * Sky, ground and fog for the 3D workspace. Changes apply instantly and are remembered in
 * this browser; nothing here touches the real place in Studio.
 */
export default function EnvironmentPanel({ env, onChange }: { env: Environment; onChange: (e: Environment) => void }) {
  const [tab, setTab] = useState<Tab>("sky");
  const skyThumbs = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(SKY_PRESETS) as SkyPreset[]).map((k) => {
          // Thumbnail = the band just above the horizon, where the clouds and peaks are.
          const full = drawSky(k, 512, 256);
          const c = document.createElement("canvas");
          c.width = 160;
          c.height = 90;
          c.getContext("2d")!.drawImage(full, 0, 40, 290, 92, 0, 0, 160, 90);
          return [k, c.toDataURL("image/jpeg", 0.8)];
        }),
      ) as Record<SkyPreset, string>,
    [],
  );
  const groundThumbs = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(GROUND_PRESETS) as GroundPreset[]).map((k) => [
          k,
          k === "roblox" ? "/roblox/baseplate.png" : drawGround(k, null, 96).toDataURL("image/jpeg", 0.85),
        ]),
      ) as Record<GroundPreset, string>,
    [],
  );

  const set = (patch: Partial<Environment>) => onChange({ ...env, ...patch });
  const isDefault = JSON.stringify(env) === JSON.stringify(DEFAULT_ENVIRONMENT);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-3 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">
        {(["sky", "ground", "fog"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-1.5 text-[11.5px] capitalize transition-colors ${
              tab === t ? "bg-blox/25 text-blox-soft" : "text-white/50 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {tab === "sky" && (
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SKY_PRESETS) as SkyPreset[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={env.sky === k}
                onClick={() => set({ sky: k })}
                className={`overflow-hidden rounded-xl border text-left transition-all ${
                  env.sky === k ? "border-blox ring-2 ring-blox/40" : "border-white/10 hover:border-white/25"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={skyThumbs[k]} alt="" className="aspect-video w-full object-cover" />
                <span className="block bg-black/30 px-2 py-1.5 text-[11px] text-white/80">{SKY_PRESETS[k].label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "ground" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(GROUND_PRESETS) as GroundPreset[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={env.ground === k}
                  onClick={() => set({ ground: k, groundColor: null, tile: GROUND_PRESETS[k].tile })}
                  className={`overflow-hidden rounded-xl border text-left transition-all ${
                    env.ground === k ? "border-blox ring-2 ring-blox/40" : "border-white/10 hover:border-white/25"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={groundThumbs[k]}
                    alt=""
                    className="aspect-square w-full object-cover"
                    style={k === "roblox" ? { background: GROUND_PRESETS.roblox.color } : undefined}
                  />
                  <span className="block truncate bg-black/30 px-1.5 py-1 text-[10.5px] text-white/80">{GROUND_PRESETS[k].label}</span>
                </button>
              ))}
            </div>
            <ColorRow
              label="Ground color"
              value={env.groundColor}
              fallback={GROUND_PRESETS[env.ground].color}
              onChange={(v) => set({ groundColor: v })}
            />
            <Slider label="Tile size" value={env.tile} min={2} max={64} suffix=" studs" onChange={(v) => set({ tile: v })} />
          </>
        )}

        {tab === "fog" && (
          <>
            <label className="flex cursor-pointer items-center justify-between rounded-xl px-1 py-1">
              <span className="text-[12px] text-white/80">Fog</span>
              <input
                type="checkbox"
                checked={env.fog.enabled}
                onChange={(e) => set({ fog: { ...env.fog, enabled: e.target.checked } })}
                className="size-4 accent-[#2f7dff]"
              />
            </label>
            {env.fog.enabled && (
              <>
                <ColorRow
                  label="Fog color"
                  value={env.fog.color}
                  fallback={env.sky === "studio" ? "#92a2b0" : SKY_PRESETS[env.sky].fog}
                  onChange={(v) => set({ fog: { ...env.fog, color: v } })}
                />
                <Slider label="Starts at" value={env.fog.near} min={0} max={1000} step={10} suffix=" studs" onChange={(v) => set({ fog: { ...env.fog, near: v } })} />
                <Slider label="Fully hidden at" value={env.fog.far} min={100} max={5000} step={50} suffix=" studs" onChange={(v) => set({ fog: { ...env.fog, far: v } })} />
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2.5">
        <span className="text-[10.5px] text-white/35">Only changes how Bloxy shows your place.</span>
        <button
          type="button"
          disabled={isDefault}
          onClick={() => onChange(DEFAULT_ENVIRONMENT)}
          className="text-[11px] text-blox-soft hover:underline disabled:text-white/25 disabled:no-underline"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
