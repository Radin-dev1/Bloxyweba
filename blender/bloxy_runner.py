"""
Bloxy's Blender worker. Runs one AI-written procedural model script in an empty scene and
turns the result into a Roblox-ready asset:

  blender --background --factory-startup --python blender/bloxy_runner.py -- \
      <script.py> <out.glb> <preview.png> <report.json> [max_tris] [target_studs]

- the script runs in a fresh, empty scene
- every mesh gets its modifiers applied; models over the triangle budget are decimated
  (Roblox caps a MeshPart at 20,000 triangles and ~10,000 is the real budget)
- the model is scaled to studs: longest side = `target_studs`, or real-world size at 0.3 m per stud
  and set on the ground, centred
- exported as one GLB (Y up), and rendered once from a three-quarter view for a preview
- report.json says what happened, including the script's error if it failed
"""

import json
import math
import sys
import traceback

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
script_path, out_glb, out_png, report_path = argv[:4]
max_tris = int(argv[4]) if len(argv) > 4 else 10000
target_studs = float(argv[5]) if len(argv) > 5 else 0.0


def report(**data):
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def tri_count(obj, depsgraph):
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    try:
        return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
    finally:
        obj.evaluated_get(depsgraph).to_mesh_clear()


bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Run the model script.
try:
    with open(script_path, encoding="utf-8") as f:
        code = f.read()
    exec(compile(code, "bloxy_model.py", "exec"), {"__name__": "__main__"})
except Exception:
    report(ok=False, error=traceback.format_exc()[-4000:])
    sys.exit(0)

scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == "MESH"]
if not meshes:
    report(ok=False, error="The script ran but created no mesh objects.")
    sys.exit(0)

# Drop anything that isn't part of the model (cameras, lights, empties the script made).
for o in list(scene.objects):
    if o.type not in {"MESH"} and not any(c.type == "MESH" for c in o.children_recursive):
        bpy.data.objects.remove(o, do_unlink=True)

# 2. Apply modifiers so the export and the counts match what you see.
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            o.modifiers.remove(m)
    o.select_set(False)

depsgraph = bpy.context.evaluated_depsgraph_get()
tris_before = sum(tri_count(o, depsgraph) for o in meshes)

# 3. Fit the triangle budget.
if tris_before > max_tris:
    ratio = max(0.02, max_tris / tris_before)
    for o in meshes:
        dec = o.modifiers.new("BloxyDecimate", "DECIMATE")
        dec.ratio = ratio
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=dec.name)
        o.select_set(False)
depsgraph = bpy.context.evaluated_depsgraph_get()
tris_after = sum(tri_count(o, depsgraph) for o in meshes)

# 4. Scale to studs, centre, and stand it on the ground.
def bounds():
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi

root = bpy.data.objects.new("BloxyRoot", None)
scene.collection.objects.link(root)
for o in meshes:
    if o.parent is None:
        mw = o.matrix_world.copy()
        o.parent = root
        o.matrix_world = mw
lo, hi = bounds()
size = hi - lo
longest = max(size.x, size.y, size.z, 1e-6)
# No target: keep the real-world size the script modelled, at about 0.3 m per stud
# (a 1.8 m person is a 6-stud Roblox character).
scale = target_studs / longest if target_studs > 0 else 1 / 0.3
root.scale = (scale, scale, scale)
bpy.context.view_layer.update()
lo, hi = bounds()
root.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
bpy.context.view_layer.update()
lo, hi = bounds()
dims = [round(v, 3) for v in (hi - lo)]

# 5. Export one GLB, Y up.
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_yup=True, export_apply=True)

# 6. Preview render: Workbench, material colours, three-quarter view.
try:
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("BloxyWorld")
    world.color = (0.86, 0.9, 0.96)
    scene.world = world
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.5)
    cam_data = bpy.data.cameras.new("BloxyCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("BloxyCam", cam_data)
    scene.collection.objects.link(cam)
    direction = Vector((1.0, -1.25, 0.8)).normalized()
    cam.location = center + direction * radius * 3.2
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_end = radius * 20
    scene.camera = cam
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
except Exception:
    pass

report(
    ok=True,
    objects=len(meshes),
    tris_before=tris_before,
    tris=tris_after,
    decimated=tris_before > max_tris,
    dimensions=dims,
    scale=scale,
    materials=sorted({s.material.name for o in meshes for s in o.material_slots if s.material}),
)
