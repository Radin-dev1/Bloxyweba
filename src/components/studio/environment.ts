/**
 * The workspace environment (display only, never sent to Studio): sky, ground and fog presets.
 * Everything is drawn procedurally on canvases, so presets apply instantly with no downloads.
 */

export type SkyPreset = "studio" | "clear" | "peaks" | "sunset" | "night" | "overcast";
export type GroundPreset = "roblox" | "checkers" | "concrete" | "grass" | "sand" | "metal" | "stone" | "snow" | "plain";

export type Environment = {
  sky: SkyPreset;
  ground: GroundPreset;
  /** Ground base color override (#rrggbb), or null for the preset's own. */
  groundColor: string | null;
  /** Studs per texture tile. */
  tile: number;
  fog: { enabled: boolean; color: string | null; near: number; far: number };
};

export const DEFAULT_ENVIRONMENT: Environment = {
  sky: "studio",
  ground: "roblox",
  groundColor: null,
  tile: 8,
  fog: { enabled: true, color: null, near: 90, far: 750 },
};

type SkyInfo = {
  label: string;
  /** Top → horizon gradient stops. */
  stops: [number, string][];
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  fog: string;
};

export const SKY_PRESETS: Record<SkyPreset, SkyInfo> = {
  studio: {
    label: "Studio",
    stops: [[0, "#9ac8db"], [0.32, "#bbd2db"], [0.5, "#d6dbdb"]],
    hemiSky: "#d8e6f8", hemiGround: "#6d788b", hemi: 1.15, sun: "#f6f9ff", sunIntensity: 2, fog: "#92a2b0",
  },
  clear: {
    label: "Clear Day",
    stops: [[0, "#2f86e0"], [0.3, "#62aef0"], [0.5, "#cfe8f7"]],
    hemiSky: "#dbeeff", hemiGround: "#6f7b8a", hemi: 1.2, sun: "#fff7e8", sunIntensity: 2.4, fog: "#b7d3ea",
  },
  peaks: {
    label: "Cloud Peaks",
    stops: [[0, "#1ba0e6"], [0.32, "#6cc6f2"], [0.5, "#e6f6fc"]],
    hemiSky: "#e3f4ff", hemiGround: "#6f8090", hemi: 1.25, sun: "#ffffff", sunIntensity: 2.2, fog: "#d6eef8",
  },
  sunset: {
    label: "Sunset",
    stops: [[0, "#3b3f8f"], [0.25, "#a45a92"], [0.42, "#f08a5d"], [0.5, "#ffd29a"]],
    hemiSky: "#ffd2b0", hemiGround: "#5a4a5e", hemi: 1.0, sun: "#ffb27a", sunIntensity: 2.0, fog: "#e7a689",
  },
  night: {
    label: "Night",
    stops: [[0, "#050914"], [0.35, "#0d1a33"], [0.5, "#24375a"]],
    hemiSky: "#5a74a8", hemiGround: "#1c2333", hemi: 0.7, sun: "#bcd0ff", sunIntensity: 0.8, fog: "#1a2740",
  },
  overcast: {
    label: "Overcast",
    stops: [[0, "#8f99a6"], [0.3, "#aab3bd"], [0.5, "#c9ced4"]],
    hemiSky: "#d6dbe2", hemiGround: "#6a717b", hemi: 1.3, sun: "#eef1f5", sunIntensity: 1.1, fog: "#b4bbc4",
  },
};

export const GROUND_PRESETS: Record<GroundPreset, { label: string; color: string; tile: number }> = {
  roblox: { label: "Baseplate", color: "#6b778d", tile: 8 },
  checkers: { label: "Checkers", color: "#5d6a80", tile: 8 },
  concrete: { label: "Concrete", color: "#8b8f95", tile: 16 },
  grass: { label: "Grass", color: "#5c9a3f", tile: 16 },
  sand: { label: "Sand", color: "#d8c49a", tile: 16 },
  metal: { label: "Metal", color: "#8d97a3", tile: 8 },
  stone: { label: "Stone", color: "#7d7f7c", tile: 16 },
  snow: { label: "Snow", color: "#eef3f8", tile: 16 },
  plain: { label: "Plain", color: "#6b778d", tile: 8 },
};

// ── helpers ──

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

// ── Sky (equirectangular: horizon at mid-height, wraps horizontally) ──

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, r: () => number, tint: string) {
  const puffs = 5 + Math.floor(r() * 5);
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass === 0 ? tint : "rgba(255,255,255,0.96)";
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const px = x - w / 2 + t * w + (r() - 0.5) * w * 0.12;
      const rad = w * (0.12 + Math.sin(t * Math.PI) * 0.16) * (0.8 + r() * 0.4);
      ctx.beginPath();
      ctx.arc(px, y - rad * 0.35 + (pass === 0 ? rad * 0.18 : 0), rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function wrapDraw(w: number, x: number, draw: (x: number) => void) {
  draw(x);
  draw(x - w);
  draw(x + w);
}

export function drawSky(preset: SkyPreset, w = 2048, h = 1024) {
  const [c, ctx] = canvas(w, h);
  const info = SKY_PRESETS[preset];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, col] of info.stops) g.addColorStop(at, col);
  g.addColorStop(1, info.stops[info.stops.length - 1][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(7 + preset.length);
  const horizon = h / 2;

  if (preset === "night") {
    for (let i = 0; i < 900; i++) {
      const y = r() * horizon * 0.95;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7 * (1 - y / horizon)})`;
      const s = r() < 0.06 ? 2 : 1;
      ctx.fillRect(r() * w, y, s * (w / 2048), s * (w / 2048));
    }
    ctx.fillStyle = "#f4f1e3";
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.2, w * 0.016, 0, Math.PI * 2);
    ctx.fill();
  }

  if (preset === "sunset") {
    const sun = ctx.createRadialGradient(w * 0.62, horizon * 0.92, 0, w * 0.62, horizon * 0.92, w * 0.12);
    sun.addColorStop(0, "rgba(255,240,200,1)");
    sun.addColorStop(0.15, "rgba(255,200,130,0.85)");
    sun.addColorStop(1, "rgba(255,160,110,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, horizon);
  }

  if (preset === "peaks") {
    // Two snowy ranges along the horizon, the far one paler.
    for (const [layer, base, col, snow] of [
      [0, horizon - h * 0.005, "#a9d4ec", "#eef8fd"],
      [1, horizon + h * 0.004, "#7fb9df", "#f6fbff"],
    ] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, horizon + 4);
      const peaks: [number, number][] = [];
      let x = 0;
      while (x <= w) {
        const ph = h * (layer === 0 ? 0.035 + r() * 0.07 : 0.02 + r() * 0.05);
        peaks.push([x, base - ph]);
        x += w * (0.02 + r() * 0.05);
      }
      peaks.push([w, peaks[0][1]]);
      for (let i = 0; i < peaks.length; i++) {
        const [px, py] = peaks[i];
        const next = peaks[i + 1];
        ctx.lineTo(px, py);
        if (next) ctx.lineTo((px + next[0]) / 2, base - h * 0.006);
      }
      ctx.lineTo(w, horizon + 4);
      ctx.fill();
      // Snow caps.
      ctx.fillStyle = snow;
      for (const [px, py] of peaks) {
        const capH = (base - py) * 0.35;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - capH * 0.9, py + capH);
        ctx.lineTo(px - capH * 0.3, py + capH * 0.8);
        ctx.lineTo(px, py + capH * 1.05);
        ctx.lineTo(px + capH * 0.35, py + capH * 0.75);
        ctx.lineTo(px + capH * 0.9, py + capH);
        ctx.fill();
      }
    }
  }

  // Clouds (none at night).
  if (preset !== "night" && preset !== "studio") {
    const count = preset === "overcast" ? 70 : preset === "peaks" ? 34 : 18;
    const tint = preset === "sunset" ? "rgba(214,120,140,0.9)" : preset === "overcast" ? "rgba(150,158,170,0.9)" : "rgba(170,205,232,0.9)";
    ctx.save();
    ctx.filter = `blur(${Math.max(1, w / 1024)}px)`;
    for (let i = 0; i < count; i++) {
      const y = horizon * (0.55 + r() * 0.4);
      const cw = w * (0.04 + r() * 0.08) * (y / horizon);
      wrapDraw(w, r() * w, (x) => cloud(ctx, x, y, cw, r, tint));
    }
    ctx.restore();
  }

  // Soft haze band right at the horizon.
  const haze = ctx.createLinearGradient(0, horizon - h * 0.06, 0, horizon + h * 0.02);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(1, preset === "night" ? "rgba(40,60,95,0.6)" : "rgba(255,255,255,0.55)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - h * 0.06, w, h * 0.08);
  return c;
}

// ── Ground tiles (seamless) ──

function speckle(ctx: CanvasRenderingContext2D, s: number, r: () => number, n: number, size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    const d = 0.5 + r() * size;
    ctx.fillRect(r() * s, r() * s, d, d);
  }
}

export function drawGround(preset: GroundPreset, color: string | null, s = 512) {
  const [c, ctx] = canvas(s, s);
  const base = color ?? GROUND_PRESETS[preset].color;
  const r = rng(preset.length * 31 + 3);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  switch (preset) {
    case "checkers": {
      ctx.fillStyle = shade(base, 0.12);
      ctx.fillRect(0, 0, s / 2, s / 2);
      ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
      break;
    }
    case "concrete": {
      speckle(ctx, s, r, 9000, 2.2, 0.12);
      ctx.strokeStyle = shade(base, -0.12);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
      break;
    }
    case "grass": {
      for (let i = 0; i < 6000; i++) {
        const x = r() * s;
        const y = r() * s;
        ctx.strokeStyle = shade(base, (r() - 0.45) * 0.22);
        ctx.lineWidth = 1 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8);
        ctx.stroke();
      }
      break;
    }
    case "sand": {
      for (let y = 0; y < s; y += 18) {
        ctx.strokeStyle = shade(base, -0.05);
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y + Math.sin(((x / s) * Math.PI * 2) * 3 + y) * 4);
        ctx.stroke();
      }
      speckle(ctx, s, r, 7000, 1.6, 0.14);
      break;
    }
    case "metal": {
      // Diamond plate: raised lozenges in alternating directions.
      const step = s / 8;
      for (let gy = 0; gy < 8; gy++)
        for (let gx = 0; gx < 8; gx++) {
          const cx = gx * step + step / 2;
          const cy = gy * step + step / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(((gx + gy) % 2 ? 1 : -1) * (Math.PI / 4));
          ctx.fillStyle = shade(base, -0.12);
          ctx.fillRect(-step * 0.33 + 2, -step * 0.08 + 2, step * 0.66, step * 0.16);
          ctx.fillStyle = shade(base, 0.12);
          ctx.fillRect(-step * 0.33, -step * 0.08, step * 0.66, step * 0.16);
          ctx.restore();
        }
      speckle(ctx, s, r, 3000, 1.2, 0.06);
      break;
    }
    case "stone": {
      // Offset flagstones with grout.
      const rows = 4;
      const rh = s / rows;
      ctx.fillStyle = shade(base, -0.22);
      ctx.fillRect(0, 0, s, s);
      for (let row = 0; row < rows; row++) {
        const cols = 3;
        const cw = s / cols;
        const off = row % 2 ? cw / 2 : 0;
        for (let col = -1; col < cols; col++) {
          ctx.fillStyle = shade(base, (r() - 0.5) * 0.14);
          ctx.fillRect(col * cw + off + 4, row * rh + 4, cw - 8, rh - 8);
        }
      }
      speckle(ctx, s, r, 6000, 1.8, 0.1);
      break;
    }
    case "snow": {
      speckle(ctx, s, r, 5000, 2.4, 0.07);
      ctx.fillStyle = "rgba(170,195,225,0.12)";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.ellipse(r() * s, r() * s, 20 + r() * 50, 10 + r() * 20, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  return c;
}

export function loadEnvironment(): Environment {
  try {
    const raw = localStorage.getItem("bloxy.environment.v1");
    if (raw) {
      const e = JSON.parse(raw) as Partial<Environment>;
      return {
        ...DEFAULT_ENVIRONMENT,
        ...e,
        sky: e.sky && e.sky in SKY_PRESETS ? e.sky : DEFAULT_ENVIRONMENT.sky,
        ground: e.ground && e.ground in GROUND_PRESETS ? e.ground : DEFAULT_ENVIRONMENT.ground,
        fog: { ...DEFAULT_ENVIRONMENT.fog, ...e.fog },
      };
    }
  } catch {}
  return DEFAULT_ENVIRONMENT;
}

export function saveEnvironment(env: Environment) {
  try {
    localStorage.setItem("bloxy.environment.v1", JSON.stringify(env));
  } catch {}
}
