/**
 * The workspace environment (display only, never sent to Studio): sky, ground and fog presets.
 * Skies are real 360° sky panoramas and grounds are real photo textures, all CC0 from
 * Poly Haven (polyhaven.com), resized into public/env/.
 */

export type SkyPreset = "studio" | "clear" | "cloudy" | "sunset" | "night" | "overcast";
export type GroundPreset =
  | "roblox"
  | "checkers"
  | "concrete"
  | "asphalt"
  | "grass"
  | "dirt"
  | "gravel"
  | "sand"
  | "stone"
  | "metal"
  | "snow"
  | "plain";

export type Environment = {
  sky: SkyPreset;
  ground: GroundPreset;
  /** Baseplate/plain: the ground color. Photo grounds: a tint multiplied over the photo. null = preset's own. */
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
  /** Equirectangular panorama; Studio's own look (gradient or Roblox skybox) has none. */
  image?: string;
  thumb?: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  fog: string;
  /** Poly Haven asset the image comes from. */
  source?: string;
};

export const SKY_PRESETS: Record<SkyPreset, SkyInfo> = {
  studio: {
    label: "Studio",
    hemiSky: "#d8e6f8", hemiGround: "#6d788b", hemi: 1.15, sun: "#f6f9ff", sunIntensity: 2, fog: "#92a2b0",
  },
  clear: {
    label: "Clear Day", image: "/env/sky/clear.jpg", thumb: "/env/thumbs/sky-clear.jpg", source: "kloofendal_43d_clear_puresky",
    hemiSky: "#dbeeff", hemiGround: "#6f7b8a", hemi: 1.2, sun: "#fff7e8", sunIntensity: 2.4, fog: "#c2d6e6",
  },
  cloudy: {
    label: "Cloudy", image: "/env/sky/cloudy.jpg", thumb: "/env/thumbs/sky-cloudy.jpg", source: "kloofendal_48d_partly_cloudy_puresky",
    hemiSky: "#e3f0ff", hemiGround: "#6f8090", hemi: 1.25, sun: "#ffffff", sunIntensity: 2.2, fog: "#c9d8e6",
  },
  sunset: {
    label: "Sunset", image: "/env/sky/sunset.jpg", thumb: "/env/thumbs/sky-sunset.jpg", source: "qwantani_sunset_puresky",
    hemiSky: "#ffd9b8", hemiGround: "#5a4a5e", hemi: 1.0, sun: "#ffb27a", sunIntensity: 2.0, fog: "#d9c3b0",
  },
  night: {
    label: "Night", image: "/env/sky/night.jpg", thumb: "/env/thumbs/sky-night.jpg", source: "qwantani_night_puresky",
    hemiSky: "#5a74a8", hemiGround: "#1c2333", hemi: 0.7, sun: "#bcd0ff", sunIntensity: 0.8, fog: "#1d2533",
  },
  overcast: {
    label: "Overcast", image: "/env/sky/overcast.jpg", thumb: "/env/thumbs/sky-overcast.jpg", source: "kloofendal_overcast_puresky",
    hemiSky: "#d6dbe2", hemiGround: "#6a717b", hemi: 1.3, sun: "#eef1f5", sunIntensity: 1.1, fog: "#b4bbc4",
  },
};

type GroundInfo = { label: string; color: string; tile: number; image?: string; thumb?: string; source?: string };

const photo = (key: string, label: string, color: string, tile: number, source: string): GroundInfo => ({
  label,
  color,
  tile,
  image: `/env/ground/${key}.jpg`,
  thumb: `/env/thumbs/ground-${key}.jpg`,
  source,
});

export const GROUND_PRESETS: Record<GroundPreset, GroundInfo> = {
  roblox: { label: "Baseplate", color: "#6b778d", tile: 8, thumb: "/roblox/baseplate.png" },
  checkers: photo("checkers", "Checkers", "#7a6a58", 32, "checkered_pavement_tiles"),
  concrete: photo("concrete", "Concrete", "#8b8b86", 24, "brushed_concrete"),
  asphalt: photo("asphalt", "Asphalt", "#6d6d6b", 24, "asphalt_02"),
  grass: photo("grass", "Grass", "#6d7a3f", 16, "leafy_grass"),
  dirt: photo("dirt", "Dirt", "#6e5a40", 16, "dirt"),
  gravel: photo("gravel", "Gravel", "#5f5244", 12, "gravel"),
  sand: photo("sand", "Sand", "#a8916c", 20, "coast_sand_01"),
  stone: photo("stone", "Cobblestone", "#77786e", 16, "cobblestone_floor_001"),
  metal: photo("metal", "Metal", "#4f5146", 12, "metal_plate"),
  snow: photo("snow", "Snow", "#e6e9ec", 24, "snow_02"),
  plain: { label: "Plain", color: "#6b778d", tile: 8 },
};

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
