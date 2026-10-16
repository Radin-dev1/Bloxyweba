/**
 * Bloxy's skill packs: building, modeling, map and texture know-how distilled from the
 * roblox-3d-model, roblox-texture-gen, building-maps, building-3d-objects and roblox-map
 * skills. Each pack is loaded only when a request needs it, so the prompt stays small.
 * Numbers here were measured in Studio by those skills; keep them, don't round them.
 */

export type SkillId = "core" | "modeling" | "maps" | "textures";

export const SKILLS: Record<SkillId, { title: string; text: string }> = {
  core: {
    title: "Building in Roblox: rules that always apply",
    text: `- Scale: an R15 character is about 5 studs tall and 2 wide. Doors about 4 x 7.5, ceilings 10-12, tables about 3 high, chairs seat at 2. Check every object against the player.
- Every part Anchored = true unless physics is the point. Small decor: CanCollide = false. Neon and invisible triggers: CastShadow = false.
- Nothing floats: every piece rests on the ground or on/against another piece. Nothing sinks below the ground. Never stack two faces at the same height on top of each other (they flicker); offset by 0.02 or merge.
- Position sub-parts relative to the model's root CFrame, not hardcoded world coordinates, and snap sizes to 0.25 / 0.5 studs so pieces meet cleanly.
- A Roblox Cylinder runs along its X axis: an upright pillar is Size (length, d, d) rotated 90 degrees about Z. A WedgePart's thin edge points to +Z; tip up = rotate -90 degrees about X.
- Neon glows but lights nothing: add a PointLight/SpotLight for real light.
- Default grey Plastic reads as unfinished. Always choose colors and materials: 2-3 main colors plus one accent per object or zone.
- Organize: a named Model (objects) or Folder (maps) with named children. Never dump loose parts in Workspace.
- Studio code runs stateless: in every run_luau call, first re-find your model/map with workspace:FindFirstChild(name), never assume earlier variables exist. Build big things in phases (20-40 parts per call), then read back real positions instead of guessing.`,
  },
  modeling: {
    title: "Modeling objects and props",
    text: `- Plan before building: list the components (not "kitchen" but counter, sink, stove, island), the real-world proportions, and the scale against a 5-stud player.
- Silhouette first, then medium shapes, then small details. Big readable masses beat many tiny parts.
- Hard-surface things (furniture, vehicles, weapons, buildings, machines) are parts and CSG: crisp edges. Organic things (animals, trees, plants, characters) use Balls, Cylinders and rounded stacks with slight rotations; never a pile of axis-aligned boxes.
- What separates "built" from "extruded": trim where two masses meet (corner boards, sills, plinths, eaves); window and door reveals (recessed by 0.2-0.5, never stickers); a roof that overhangs the wall by 1-2 studs plus 1 more for the shingle course; wall thickness about 0.7.
- Houses: steep roofs (45-55 degrees, about as tall as the walls), gable facing the front, nothing perfectly square (a 1-2 degree lean reads storybook). The ground mound belongs to the map, not the asset.
- Variety: jitter rotation and size slightly on repeated pieces (planks, shingles, rocks, trees); a perfect grid reads as copy-paste.
- CSG: wrap SubtractAsync/UnionAsync in pcall and check the result is a BasePart; make cutters 0.01 larger; copy the full CFrame back; set UsePartColor = true; do CSG near the origin, then PivotTo; decorative unions use CollisionFidelity Box. CSG never works on MeshParts or Terrain.
- Moving parts: TweenService cannot tween a Model. Weld everything to the PrimaryPart and tween that, or tween a CFrameValue and PivotTo.
- Budgets: a prop is usually 10-80 parts, a building 50-300. A MeshPart should stay under 10,000 triangles (20,000 is the hard cap), textures 1024x1024 at most.
- Meshes: a .glb uploads as a Model asset (never "Mesh"), and MeshId cannot be set by assigning the property; insert the model (InsertService/GetObjects) or use AssetService:CreateMeshPartAsync with the inner mesh id.
- Verify after building: everything anchored, nothing below the ground or floating, no default grey parts; fix anything that fails and check again.`,
  },
  maps: {
    title: "Maps, levels and environments",
    text: `- Before building a map you need three things: the size (100x100 arena or 2000x2000 city), the gameplay type (flat social hub, parkour obby, combat arena, open world) and the zones (e.g. spawn plaza, 3 houses, a shop). If any is missing, ask ONE short question with concrete options instead of guessing.
- Build in phases: 1) ground and boundaries + an Origin anchor and Map folder, 2) zone shells, 3) landmarks, 4) zone fill (props, plants), 5) lighting and spawns. Keep each call to about 20-40 parts. Hierarchy: Map/Origin, Map/Terrain, Map/Zone_X/{Floor,Walls,Props}, Map/Landmarks, Map/Spawns. Every zone offset is relative to Origin.
- Stock movement (gravity 196.2, JumpPower 50, WalkSpeed 16): jump apex 6.37 studs, walking jump about 8.2 studs. For comfortable obby jumps keep gaps at 4-7 studs and rises at 4 or less; a jump that must climb 6+ studs is nearly impossible. Auto-step is about 2 studs: steps 1 stud high and 1.5-2 deep, never taller (a taller step is a wall). Ramps 45 degrees at most. Paths at least 6 studs wide, main roads 10+.
- Layout: connect points of interest in triangles so there is always more than one route. Hub/farm spacing between POIs 120-250 studs (40 seconds of walking is the absolute ceiling). Landmarks need a vertical element and sit at corners and turns. Give each zone its own palette. Wide, clear entrances. Put small content where the spheres around two POIs overlap.
- Break the grid: curve paths, jitter yaw on repeated pieces, vary heights; 90-degree-only maps read as greybox. Decorate the outer edges (trees, rocks, flowers); a bare edge is the clearest unfinished tell. Bounded maps need a real boundary with no gaps or hoppable barriers.
- Ground and water: prefer Terrain for ground, hills and water (Terrain:FillBlock(cframe, size, Enum.Material.Water)). Terrain is a 4-stud voxel grid; a solid part over water hides it, so leave a real hole, and the basin must end where the water begins. A transparent part is not water.
- Lighting for a shaded stylized look: Atmosphere Density 0.10-0.14, Haze 0.2-0.3, ClockTime 9-10, ColorCorrection tint near white. Lighting.Technology can't be set from a plugin; tell the user to pick Future by hand.
- SpawnLocations on solid ground, facing into the map. Verify at the end: every part anchored, nothing below the floor, no default grey, every zone reachable from spawn; fix and re-check.`,
  },
  textures: {
    title: "Textures, materials and skins",
    text: `- First choice for surfaces: Roblox Materials plus a fitting Color, and MaterialVariant for custom tiling materials across many parts. MeshParts take a SurfaceAppearance (ColorMap, NormalMap, RoughnessMap, MetalnessMap), each capped at 1024x1024.
- Texture and Decal instances go on a part face; Texture tiles via StudsPerTileU/V, Decal stretches. Check which property a target actually has (TextureID vs a SurfaceAppearance child) before writing; the wrong one silently does nothing.
- Uploaded textures must be IMAGE assets, not Decals: a Decal asset wraps the image with a different id, and putting a Decal id in TextureID silently renders grey.
- For AI texture prompts add "seamless tileable texture, flat lighting, no watermark, high detail" so it comes back as a material, not an illustration.
- Colors are albedo: never bake light or shine into a texture. A fresh upload can show grey for a while during moderation; that is not a failure.
- Reskinning a whole model: loop GetDescendants() in one call and set the property on every matching MeshPart/BasePart.`,
  },
};

const WORDS: Record<Exclude<SkillId, "core">, RegExp> = {
  maps: /\b(map|level|arena|obby|obbies|parkour|lobby|hub|town|village|city|world|island|zone|terrain|spawn|course|track|race|biome|environment|forest|dungeon|maze|plaza|park|farm|base|battleground|tycoon)\b/i,
  textures: /\b(texture|textures|skin|skins|reskin|retexture|material|materials|decal|surface ?appearance|camo|paint|painted|pattern|tileable|pbr|normal map|shiny|metallic|wood ?grain)\b/i,
  modeling: /\b(build|make|create|model|prop|house|home|car|vehicle|truck|boat|plane|sword|gun|weapon|tool|tree|furniture|chair|table|bed|castle|tower|bridge|statue|character|creature|animal|robot|shop|building|door|fence|lamp|crate|chest|object|3d)\b/i,
};

/** Which skill packs a request needs, from the latest user message (core whenever something gets built). */
export function pickSkills(text: string): SkillId[] {
  const picked = (Object.keys(WORDS) as Exclude<SkillId, "core">[]).filter((id) => WORDS[id].test(text));
  return picked.length ? ["core", ...picked] : [];
}

export function skillBlock(ids: SkillId[]) {
  if (!ids.length) return "";
  return `\n\n# Bloxy skills loaded for this request\n${ids.map((id) => `\n## ${SKILLS[id].title}\n${SKILLS[id].text}`).join("\n")}`;
}
