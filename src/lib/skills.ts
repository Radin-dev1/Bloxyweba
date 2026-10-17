/**
 * Bloxy's skill packs: building, modeling, map, texture, sculpting, scripting, gameplay, UI and
 * game-design know-how, combined into one library. Each pack is loaded only when a request
 * needs it, so the prompt stays small. Numbers here were measured in Studio by the source
 * skills; keep them, don't round them.
 *
 * Written in our own words from (credit, see docs/skill-sources.md): TabooHarmony/roblox-brain
 * (MIT), AshExplained/roblox-skills (MIT), EL4CTEO/blender-skills (MIT), plus facts learned from
 * SyphoDev-yt/roblox-ai-skills, brockmartin/roblox-game-skill and sentinelcore/roblox-skills, and
 * the roblox-3d-model, roblox-texture-gen, building-maps, building-3d-objects and roblox-map skills.
 */

export type SkillId = "core" | "modeling" | "maps" | "textures" | "sculpting" | "scripting" | "gameplay" | "ui" | "design";

export const SKILLS: Record<SkillId, { title: string; text: string }> = {
  core: {
    title: "Building in Roblox: rules that always apply",
    text: `- Scale: an R15 character is about 5 studs tall and 2 wide. Doors about 4 x 7.5, ceilings 10-12, tables about 3 high, chairs seat at 2. Check every object against the player.
- Every part Anchored = true unless physics is the point. Small decor: CanCollide = false. Neon and invisible triggers: CastShadow = false.
- Nothing floats: every piece rests on the ground or on/against another piece. Nothing sinks below the ground. Never stack two faces at the same height on top of each other (they flicker); offset by 0.02 or merge.
- Position sub-parts relative to the model's root CFrame, not hardcoded world coordinates, and snap sizes to 0.25 / 0.5 studs so pieces meet cleanly.
- A Roblox Cylinder runs along its X axis: an upright pillar is Size (length, d, d) rotated 90 degrees about Z. A WedgePart's thin edge points to +Z; tip up = rotate -90 degrees about X.
- Ball parts are ALWAYS perfect spheres (diameter = the smallest size value; a stretched size just makes a smaller sphere) and Cylinders are always round (length on X, diameter = the smaller of Y/Z). Long round shapes (pickle, capsule, sausage, banana, limb, log) = a Cylinder body plus a Ball of the same diameter on each end. Surface details (bumps, buttons, rivets, eyes) must touch their surface: put their centre about 0.3 of their own size outside the surface, never in the air.
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
- Round and organic recipes (parts can't be stretched spheres):
  - capsule / pickle / sausage: Cylinder body (rotation so its X axis lies along the object) + a Ball cap of the same diameter centred on each end. Curved (pickle, banana): 3-4 shorter cylinder segments each turned 8-15 degrees, with Balls at every joint to hide the seams. Pickle: dark green #3f6b1f to #5b8c2a, bumps = small Balls (0.25-0.4 of the body diameter) half-sunk into the surface, a darker stem nub on one end.
  - fruit / egg / blob: one big Ball plus 2-4 overlapping smaller Balls to change the silhouette.
  - tree: Cylinder trunk (rotated upright) + 3-5 overlapping Balls of different sizes for the canopy, all touching.
  - rock: 2-4 rotated Blocks/Balls overlapping, in two close greys.
- After building, look at the size report: if the object's proportions don't match the real thing (a pickle is about 3x longer than wide), fix it.
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
  sculpting: {
    title: "Sculpting organic meshes in Blender (sculpt_model)",
    text: `- Use sculpt_model for anything organic: food, fruit, animals, creatures, characters, plants, rocks, statues. Roblox parts make these look like stacked toys; a mesh can be truly round and curved.
- Shape language: start from a primitive and DEFORM it, don't assemble many pieces. Stretch spheres with object.scale + transform_apply(scale=True), then SUBSURF (levels 1-2) for smoothness.
- Surface detail: a DISPLACE modifier with a texture from bpy.data.textures.new(name, type=...): VORONOI for bumps (pickle, toad, rock), CLOUDS for lumpy organic surfaces, small strength (0.03-0.15 of the object's size; negative strength pushes dimples in).
- Curves and poses: SIMPLE_DEFORM with deform_method BEND (banana, pickle, tail, horn), TWIST (shell, drill, candy), TAPER (carrot, tooth, claw); set deform_axis to the long axis.
- Creatures and trunks: SKIN modifier over a few connected vertices (a stick figure) + SUBSURF gives a smooth body with limbs; metaballs (bpy.data.metaballs, then convert to mesh) blend blobs into one soft shape.
- Symmetry: model half and add a MIRROR modifier. Repeats (petals, leaves, spikes): ARRAY, or a loop that rotates copies with math.radians.
- Always: bpy.ops.object.shade_smooth() on organic parts, a material on every object (Principled Base Color + Roughness AND diffuse_color), 2-3 colors per object (a body color, a darker shade, one accent). Keep under ~10,000 triangles: SUBSURF levels 1-2 on 32-48 segment primitives is enough.
- Real proportions matter more than detail: a pickle is about 3x longer than wide, an apple slightly wider than tall, a cat's head about 1/3 of its body length. Model at real size in meters and pass size_studs for the Roblox size.
- Blender 5.x scripting: prefer the data API (bpy.data, bmesh, foreach_get/set) over bpy.ops; Sculpt Mode operators crash in background mode, so never enter Sculpt Mode. Apply scale (transform_apply(scale=True)) before bevel, boolean or solidify, since their distances are in object space. New materials already contain a Principled BSDF: find nodes by type (n.type == "BSDF_PRINCIPLED"), not by name. Renamed inputs: Specular -> "Specular IOR Level", Emission -> "Emission Color", Transmission -> "Transmission Weight", Clearcoat -> "Coat Weight", Sheen -> "Sheen Weight". mesh.use_auto_smooth is gone: use shade_smooth or shade_smooth_by_angle.
- Hard-surface details on a mesh: bevel width about 0.5-2% of the part size, limit by angle 30 degrees, clamp overlap on; cylinder segments by size: bolts 6-8, handles 12-16, barrels 24-32. Boolean cutters must be closed and reach slightly past the surface (coplanar faces fail and flicker).
- Colors: base color is pure albedo (no baked light or shadow); dielectric colors sit roughly between sRGB 30 and 240. Metallic is 0 or 1, never in between; roughness carries the realism, so vary it a little.
- Example (a bumpy curved pickle lying on its side):
  import bpy, math
  def mat(name, rgb, rough=0.55):
      m = bpy.data.materials.new(name); m.use_nodes = True
      b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
      m.diffuse_color = (*rgb, 1); return m
  bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1)
  body = bpy.context.object; body.scale = (0.9, 0.85, 2.6); bpy.ops.object.transform_apply(scale=True)
  tex = bpy.data.textures.new("Bumps", type="VORONOI"); tex.noise_scale = 0.28
  body.modifiers.new("Smooth", "SUBSURF").levels = 1
  d = body.modifiers.new("Bumps", "DISPLACE"); d.texture = tex; d.strength = -0.12; d.mid_level = 0.6
  b = body.modifiers.new("Bend", "SIMPLE_DEFORM"); b.deform_method = "BEND"; b.angle = math.radians(28); b.deform_axis = "Y"
  body.data.materials.append(mat("PickleGreen", (0.16, 0.32, 0.06))); bpy.ops.object.shade_smooth()
  bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.18, depth=0.35, location=(0, 0, 2.7))
  stem = bpy.context.object; stem.data.materials.append(mat("Stem", (0.09, 0.15, 0.04), 0.8)); stem.parent = body
  body.rotation_euler = (math.radians(90), 0, 0)`,
  },
  scripting: {
    title: "Luau scripting, architecture and security",
    text: `- Luau traps: only false and nil are falsy (0, "" and {} are truthy); ~= is not-equal; arrays are 1-based and # is only reliable without nil gaps; dictionary order is unspecified; "x or fallback" also replaces a valid false; NaN ~= NaN, so check x ~= x before comparing. Prefer if-expressions (local s = if on then "On" else "Off") and backtick strings (\`{name}: {score}\`). JavaScript/Python syntax (===, null, ?., arrow functions, list comprehensions) is not Luau.
- Architecture: for every behaviour name the authoritative state and who may change it, what instances/connections it owns and when it starts and stops. Group code by feature; split server/client/shared only at real runtime boundaries; shared modules hold no secrets or authoritative state. Call modules directly; no event bus or manager ceremony to hide a plain dependency. Keep module top level cheap and non-yielding; give WaitForChild a timeout for replicated things.
- Networking: every client argument is attacker-controlled. On the server validate type, size, ownership, state, distance and cooldown; read prices, damage and rewards from server-owned tables. RemoteEvent for most requests; keep RemoteFunctions short; UnreliableRemoteEvent only for replaceable data (1000-byte cap). Tables arrive as copies without metatables or functions; nil truncates arrays. Rate-limit remotes and log suspicion with thresholds; never kick on one bad packet.
- Security: the client is always compromised. Never let it decide damage, currency, inventory, permissions, hits or loot. Purchases: grant only in a server ProcessReceipt handler that is idempotent and returns PurchaseGranted only after the grant is saved; PromptProductPurchaseFinished is not proof. Treat ProximityPrompt/ClickDetector input like a remote. Filter player text with TextService.
- Saves (DataStores): a versioned, serialisable template deep-copied per player; UpdateAsync for read-modify-write wrapped in pcall with retries; session locking so two servers never write one profile (or ProfileStore); save on important changes and on leave, and finish pending saves in BindToClose (about 30 seconds total). Only primitives/arrays/dictionaries; no NaN, infinities or broken UTF-8 (one bad value fails the whole write). Keys like player_<UserId>; separate store names for Studio tests.
- Performance: measure first (MicroProfiler Ctrl+F6, F9 console, Script Profiler). Targets: server heartbeat under 16 ms, 60 FPS desktop, 45 mobile. Disconnect connections and destroy instances you own (leaks = callbacks firing for players who left); pool frequently spawned objects. StreamingEnabled is on by default: streamed-out parts are parented to nil, so FindFirstChild can return nil.
- Debugging: first make a fast, repeatable repro (playtest steps or a direct execute_luau call), read the Output errors, list 3-5 ranked hypotheses, change one thing at a time, tag temporary prints (e.g. [DEBUG-a4f2]) and remove them after. Fix the cause with the smallest change, then re-run the repro.`,
  },
  gameplay: {
    title: "Gameplay systems: combat, NPCs, physics, animation, lighting",
    text: `- Combat: the client sends intent (aim direction, target candidate); the server checks range, cooldown, line of sight, team and state, then applies damage. Hitscan with raycasts; Touched only for slow physics projectiles, which always get a lifetime. Readability: anticipation, action, impact, recovery; clear feedback for hit, miss, crit, block, dodge and death; enemy tells and fair counterplay.
- NPCs: PathfindingService:CreatePath({AgentRadius = 2, AgentHeight = 5, AgentCanJump = true, Costs = {Water = 20}}), ComputeAsync, check path.Status, follow waypoints (Jump action -> humanoid.Jump = true), recompute on Blocked with a bounded retry. PathfindingModifier regions set costs (math.huge = impassable, PassThrough for doors). AI as a state machine: idle -> patrol -> chase -> attack -> flee -> dead, where each transition owns its cleanup.
- Physics: constraints connect two Attachments (both must be set, or it silently does nothing) and never move Anchored parts. Mechanical: HingeConstraint (Motor/Servo), Prismatic, BallSocket, Weld/Rigid; motion: AlignPosition, AlignOrientation, LinearVelocity, AngularVelocity. Vehicles: motor hinge wheels, SpringConstraint suspension, servo steering, CustomPhysicalProperties for friction. Keep gameplay-critical physics server-owned (SetNetworkOwner(nil)) and validate anything a player simulates.
- Animation and VFX: load tracks through an Animator; set AnimationTrack.Priority on purpose; use GetMarkerReachedSignal for timed cues. Burst particles: Rate = 0 and :Emit(n) with a short lifetime, pooled. Effects read as warning, contact, peak, fade. Beams and trails need two attachments. Tween only a few properties and clean temporary effects up (Debris:AddItem). TweenService can't tween a Model: tween a CFrameValue and PivotTo.
- Lighting: ClockTime 0-24, Brightness about 2, Ambient/OutdoorAmbient for shadow fill, ShadowSoftness 0.2; Atmosphere Density below 0.5 (0.1-0.3 for a light haze); BloomEffect with Threshold above 0.7. Lighting.Technology can't be set from a script.`,
  },
  ui: {
    title: "Game UI and UX",
    text: `- Mobile first: design on the smallest landscape phone with touch controls, then grow. Keep interactive UI inside the safe area (GuiService insets) and clear of the top bar, thumbstick, jump button and chat. Big touch targets with space between them; nothing important in the thumb zones.
- Scale with Scale-based sizes plus UIAspectRatioConstraint, UISizeConstraint and UITextSizeConstraint; let UIListLayout/UIGridLayout own repeated layout. Check every pair of elements that can show together; reflow instead of shrinking text.
- UI shows server state; a button is never an authority boundary (the server re-checks every purchase or action). Clean up connections when a screen closes; open and close it repeatedly to catch leaks. Put loading UI in ReplicatedFirst.
- Gamepad/console: one SelectedObject owner, SelectionGroup bounds, focus restored after closing a menu, and a TV-safe margin.
- First session: put the player into the core action within 10-30 seconds, spawn facing the first objective, teach by doing (markers and contextual prompts, never walls of text), make rewards loud but short, and keep deep menus optional at first. The HUD shows the objective, currency, progress and the next reward.`,
  },
  design: {
    title: "Game design, genres and monetization",
    text: `- Three loops must each work: the core loop (moment to moment), the meta game (hour to hour) and long-term progression (day to day). If the raw actions aren't fun, nothing above them saves the game.
- Retention phases: days 0-7 understandability, novelty and stability; 7-30 progression, mastery and reasons to return; 30-90 social comparison and live events; 90+ community.
- Economy: every currency source needs a sink; prices scale with the power curve; watch hoarding, choke points and inflation. Grind is a feeling: fix it with juice, skill ceilings and short measurable goals.
- Levels: safe introduction, development, twist, conclusion; guide with coins, light and landmarks instead of text; deaths should feel like the player's fault.
- Genre patterns: simulator (satisfying repeat action, upgrade ladder, rebirth, pets, zones); tycoon (visible build progress, income pacing, rebirth); obby (instant challenge, fast retries, checkpoints, cosmetics); RPG (quests, zones, loot, bosses, parties); pet collector (hatching, rarity, trading, index); tower defense (waves, unit upgrades, co-op); survival (resources, risk/reward, base building); horror (atmosphere, pursuit, team objectives); battlegrounds (readable combat, ability balance, anti-exploit). For any genre define the first 30 seconds, core loop, progression, social hook, monetization fit and the twist that makes it different.
- Monetization: prompt purchases from the client but grant value only on the server. Game Passes: one server table of pass id -> benefit, applied on join and on purchase through the same path. Developer Products are repeatable and granted in ProcessReceipt. Check PolicyService before paid random items (loot boxes) and offer the allowed alternatives. Monetize convenience, cosmetics and time, never basic fairness.`,
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
  sculpting: /\b(sculpt|sculpted|sculpture|organic|curvy|smooth|mesh|food|fruit|vegetable|pickle|banana|apple|carrot|pumpkin|mushroom|cake|donut|burger|egg|animal|creature|monster|character|cat|dog|fish|bird|frog|dragon|snake|slime|blob|plant|flower|rock|stone|shell|statue|bust|head|tree)s?\b/i,
  scripting: /\b(script|scripts|scripting|code|coding|luau|lua|function|module|remote|remotes|remoteevent|server|client|datastore|datastores|save|saves|saving|leaderstats|leaderboard|bug|error|errors|fix|debug|crash|lag|exploit|exploiters|anti.?cheat|secure|security|system|systems|api|tween|attribute)s?\b/i,
  gameplay: /\b(combat|fight|fighting|attack|damage|health|weapon|sword|gun|ability|abilities|skill|skills|npc|npcs|enemy|enemies|boss|zombie|ai|pathfinding|physics|vehicle|car|ragdoll|projectile|bullet|animation|animate|vfx|particle|particles|effect|effects|explosion|lighting|day.?night|sun|fog|atmosphere)s?\b/i,
  ui: /\b(ui|gui|hud|menu|menus|button|buttons|shop|store|inventory|screen|frame|label|dialog|popup|notification|health ?bar|interface|ux|onboarding|tutorial|mobile|touch)s?\b/i,
  design: /\b(game ?idea|idea|ideas|design|genre|simulator|tycoon|obby|rpg|horror|battlegrounds?|tower defense|survival|pet|pets|loop|retention|progression|economy|monetiz\w*|gamepass(?:es)?|game pass(?:es)?|robux|developer product|rebirth|prestige|plan|concept)s?\b/i,
  modeling: /\b(build|make|create|model|prop|house|home|car|vehicle|truck|boat|plane|sword|gun|weapon|tool|tree|furniture|chair|table|bed|castle|tower|bridge|statue|character|creature|animal|robot|shop|building|door|fence|lamp|crate|chest|object|3d)\b/i,
};

const BUILDING: SkillId[] = ["modeling", "maps", "textures", "sculpting"];

/** Which skill packs a request needs, from the latest user message (core whenever something gets built). */
export function pickSkills(text: string): SkillId[] {
  const picked = (Object.keys(WORDS) as Exclude<SkillId, "core">[]).filter((id) => WORDS[id].test(text));
  return picked.some((id) => BUILDING.includes(id)) ? ["core", ...picked] : picked;
}

export function skillBlock(ids: SkillId[]) {
  if (!ids.length) return "";
  return `\n\n# Bloxy skills loaded for this request\n${ids.map((id) => `\n## ${SKILLS[id].title}\n${SKILLS[id].text}`).join("\n")}`;
}
