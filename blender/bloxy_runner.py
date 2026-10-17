"""
Bloxy's Blender worker. Runs one AI-written procedural model script in an empty scene and
turns the result into a Roblox-ready asset:

  blender --background --factory-startup --python blender/bloxy_runner.py -- \
      <script.py> <out.glb> <preview.png> <report.json> [max_tris] [target_studs] [sheet.jpg]

- the script runs in a fresh, empty scene
- every mesh gets its modifiers applied; models over the triangle budget are decimated
  (Roblox caps a MeshPart at 20,000 triangles and ~10,000 is the real budget)
- the model is scaled to studs: longest side = `target_studs`, or real-world size at 0.3 m per stud
  and set on the ground, centred
- exported as one GLB (Y up), and rendered once from a three-quarter view for a preview
- optionally a 2x2 sheet (front, side, top, three-quarter) so an AI can look at its own model
- report.json says what happened: sizes, parts, floating pieces, or the script's error with
  the failing line and a hint
"""

import json
import math
import os
import sys
import traceback

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
script_path, out_glb, out_png, report_path = argv[:4]
max_tris = int(argv[4]) if len(argv) > 4 else 10000
target_studs = float(argv[5]) if len(argv) > 5 else 0.0
out_sheet = argv[6] if len(argv) > 6 else ""

# Blender API changes that AI-written scripts trip over most (4.x and 5.x).
HINTS = [
    ("use_auto_smooth", "Mesh.use_auto_smooth was removed in Blender 4.1. Use bpy.ops.object.shade_smooth() (or shade_auto_smooth())."),
    ("'Specular'", "The Principled BSDF input 'Specular' is now 'Specular IOR Level'."),
    ("'Emission'", "The Principled BSDF input 'Emission' is now 'Emission Color' (plus 'Emission Strength')."),
    ("'Subsurface Color'", "'Subsurface Color' was removed from the Principled BSDF; use 'Base Color' and 'Subsurface Weight'."),
    ("'Transmission'", "The Principled BSDF input 'Transmission' is now 'Transmission Weight'."),
    ("'Clearcoat'", "The Principled BSDF input 'Clearcoat' is now 'Coat Weight'."),
    ("'Sheen'", "The Principled BSDF input 'Sheen' is now 'Sheen Weight'."),
    ("context is incorrect", "That operator needs a selected, active object: set bpy.context.view_layer.objects.active = obj and obj.select_set(True) first, or use bpy.data / bmesh instead of bpy.ops."),
    ("has no attribute 'active_object'", "Use bpy.context.view_layer.objects.active instead of context.active_object in background mode."),
    ("KeyError", "A name lookup failed: check node, input and object names for Blender 5.2."),
]


def explain_error(tb, code):
    """The traceback's last line, the failing line of the script, and a fix hint when we know one."""
    lines = code.splitlines()
    where = ""
    for part in tb.split('File "bloxy_model.py", line ')[1:]:
        try:
            n = int(part.split(",")[0].split()[0])
            where = f"line {n}: {lines[n - 1].strip()}" if 0 < n <= len(lines) else f"line {n}"
        except ValueError:
            pass
    last = tb.strip().splitlines()[-1] if tb.strip() else "unknown error"
    hints = [h for key, h in HINTS if key in tb]
    out = last + (f"\nFailing {where}" if where else "")
    if hints:
        out += "\nHint: " + " ".join(hints[:2])
    return out + "\n\nTraceback (end):\n" + tb[-1500:]


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

# 1. Run the model script, or import a mesh file (e.g. from an open-source 3D generator or a
#    CC0 library). Imported glTF is a triangle soup with split normals: weld it first, or
#    decimation under-reduces and shading breaks.
imported = script_path.lower().endswith((".glb", ".gltf"))
try:
    if imported:
        code = ""
        bpy.ops.import_scene.gltf(filepath=script_path)
        for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            try:
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
            except Exception:
                pass
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.remove_doubles(threshold=0.0001)
            bpy.ops.object.mode_set(mode="OBJECT")
            o.select_set(False)
    else:
        with open(script_path, encoding="utf-8") as f:
            code = f.read()
        exec(compile(code, "bloxy_model.py", "exec"), {"__name__": "__main__"})
except Exception:
    report(ok=False, error=explain_error(traceback.format_exc(), code) if code else traceback.format_exc()[-2000:])
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

# 3b. Generated meshes come back white. Paint them from their concept image: each vertex takes
#     the colour at the same spot of the subject seen from the front (x across, z up), and
#     surfaces facing sideways fall back to the subject's median colour instead of a smear.
concept = os.environ.get("BLOXY_CONCEPT", "")
painted = False
if imported and concept and os.path.exists(concept):
    try:
        import numpy as np

        img = bpy.data.images.load(concept)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)[:, :, :3]  # rows bottom first, like Blender's z
        if img.is_float:  # 16-bit/float images load as linear light: back to sRGB like 8-bit ones
            px = np.where(px <= 0.0031308, px * 12.92, 1.055 * np.power(np.clip(px, 0, None), 1 / 2.4) - 0.055)
        # Subject = whatever differs from the background, read off the image border (concepts
        # are asked for on white, but models often give light grey or a soft gradient).
        border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
        bg = np.median(border, axis=0)
        mask = np.abs(px - bg).max(axis=2) > 0.1
        ys, xs = np.nonzero(mask)
        if len(xs) > 0.02 * w * h:
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            median = np.median(px[mask], axis=0)
            lo_all = Vector((math.inf,) * 3)
            hi_all = Vector((-math.inf,) * 3)
            for o in meshes:
                for v in o.data.vertices:
                    p = o.matrix_world @ v.co
                    lo_all = Vector(map(min, lo_all, p))
                    hi_all = Vector(map(max, hi_all, p))
            span = hi_all - lo_all
            for o in meshes:
                me = o.data
                attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
                normal_m = o.matrix_world.to_3x3()
                cols = np.empty(len(me.loops) * 4, dtype=np.float32)
                for poly in me.polygons:
                    facing = abs((normal_m @ poly.normal).normalized().y)
                    for li in poly.loop_indices:
                        p = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
                        u = (p.x - lo_all.x) / max(span.x, 1e-6)
                        t = (p.z - lo_all.z) / max(span.z, 1e-6)
                        ix = int(np.clip(x0 + u * (x1 - x0), 0, w - 1))
                        iy = int(np.clip(y0 + t * (y1 - y0), 0, h - 1))
                        c = px[iy, ix] if mask[iy, ix] else median
                        k = min(1.0, facing * 1.6)  # edge-on to the camera: trust the median
                        c = c * k + median * (1 - k)
                        c = c * 0.75 + median * 0.25  # soften lighting baked into the concept
                        cols[li * 4 : li * 4 + 3] = c
                        cols[li * 4 + 3] = 1.0
                attr.data.foreach_set("color_srgb", cols)  # the image's pixels are sRGB
                mat = bpy.data.materials.new("Painted")
                mat.use_nodes = True
                nodes = mat.node_tree.nodes
                bsdf = nodes["Principled BSDF"]
                ca = nodes.new("ShaderNodeVertexColor")
                ca.layer_name = "Col"
                mat.node_tree.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
                bsdf.inputs["Roughness"].default_value = 0.6
                mat.diffuse_color = (*(float(v) ** 2.2 for v in median), 1)
                me.materials.clear()
                me.materials.append(mat)
            painted = True
    except Exception:
        traceback.print_exc()
if imported:
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        except Exception:
            bpy.ops.object.shade_smooth()
        o.select_set(False)

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
# Everything top-level goes under the root (imports often wrap meshes in a parent empty).
for o in list(scene.objects):
    if o.parent is None and o is not root:
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


# Shape analysis: what a careful modeller checks. Blender is Z up; sizes are x, y, z in studs.
def obj_bounds(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


parts = []
boxes = {}
for o in meshes:
    a, b = obj_bounds(o)
    boxes[o.name] = (a, b)
    parts.append({"name": o.name, "size": [round(v, 2) for v in (b - a)], "bottom": round(a.z, 2)})
gap = max(max(dims) * 0.01, 0.02)


def touches(a, b):
    return all(a[0][i] - gap <= b[1][i] and b[0][i] - gap <= a[1][i] for i in range(3))


floating = []
for o in meshes:
    box = boxes[o.name]
    if box[0].z <= gap:
        continue  # on the ground
    if not any(touches(box, boxes[x.name]) for x in meshes if x is not o):
        floating.append(o.name)

# Loose pieces inside one object (e.g. bumps that never joined the body).
loose = {}
try:
    import bmesh

    for o in meshes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        seen, islands = set(), 0
        for v in bm.verts:
            if v.index in seen:
                continue
            islands += 1
            stack = [v]
            while stack:
                cur = stack.pop()
                if cur.index in seen:
                    continue
                seen.add(cur.index)
                stack.extend(e.other_vert(cur) for e in cur.link_edges)
        bm.free()
        if islands > 1:
            loose[o.name] = islands
except Exception:
    pass

# 5. Export one GLB, Y up.
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_yup=True, export_apply=True)

# 6. Preview render: Workbench, material colours, three-quarter view.
try:
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "VERTEX" if painted else "MATERIAL"
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

# 7. A 2x2 sheet so an AI can check its own work: front, side (top row), top, three-quarter.
if out_sheet:
    try:
        import numpy as np

        res = 384
        scene.render.resolution_x = scene.render.resolution_y = res
        scene.render.image_settings.file_format = "PNG"
        center = (lo + hi) / 2
        extent = max(max(hi - lo), 0.5)
        views = [
            (Vector((0, -1, 0)), "Y", True),  # front
            (Vector((1, 0, 0)), "Y", True),  # side
            (Vector((0, 0, 1)), "Y", True),  # top
            (Vector((1.0, -1.25, 0.8)).normalized(), "Y", False),  # three-quarter
        ]
        tiles = []
        for i, (direction, up, ortho) in enumerate(views):
            cd = bpy.data.cameras.new(f"BloxySheet{i}")
            cd.type = "ORTHO" if ortho else "PERSP"
            cd.ortho_scale = extent * 1.25
            cd.lens = 50
            cd.clip_end = extent * 40
            cam = bpy.data.objects.new(f"BloxySheet{i}", cd)
            scene.collection.objects.link(cam)
            cam.location = center + direction * extent * (3.0 if ortho else 2.4)
            cam.rotation_euler = (center - cam.location).to_track_quat("-Z", up).to_euler()
            scene.camera = cam
            scene.render.filepath = f"{out_sheet}.{i}.png"
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(f"{out_sheet}.{i}.png")
            px = np.empty(res * res * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            tiles.append(px.reshape(res, res, 4))
        # Image rows are stored bottom first, so the upper half of the array is the top row.
        sheet = np.ones((res * 2, res * 2, 4), dtype=np.float32)
        sheet[res:, :res], sheet[res:, res:] = tiles[0], tiles[1]
        sheet[:res, :res], sheet[:res, res:] = tiles[2], tiles[3]
        sheet[:, res - 1 : res + 1] = (0.25, 0.3, 0.4, 1)
        sheet[res - 1 : res + 1, :] = (0.25, 0.3, 0.4, 1)
        out = bpy.data.images.new("BloxySheet", res * 2, res * 2)
        out.pixels.foreach_set(sheet.ravel())
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 85
        out.save_render(out_sheet, scene=scene)
    except Exception:
        traceback.print_exc()

report(
    ok=True,
    objects=len(meshes),
    tris_before=tris_before,
    tris=tris_after,
    decimated=tris_before > max_tris,
    dimensions=dims,
    scale=scale,
    materials=sorted({s.material.name for o in meshes for s in o.material_slots if s.material}),
    painted=painted,
    unpainted=sorted(o.name for o in meshes if not any(s.material for s in o.material_slots)),
    parts=parts[:40],
    floating=floating,
    loose=loose,
)
