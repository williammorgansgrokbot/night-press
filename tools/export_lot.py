#!/usr/bin/env python3
"""Export the v4b Blender lot into game-ready GLBs, a sky panorama, and collision JSON.
Run: blender --background --python tools/export_lot.py
"""
import json, math, sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path("/workspace/carny-sim")
BLEND = ROOT / "assets/models/night_press_preview_v4b.blend"
ART = ROOT / "game/art"
ART.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def world_aabb(obj):
    xs, ys, zs = [], [], []
    if obj.type == "MESH" and obj.data and len(obj.data.vertices):
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    for ch in obj.children:
        a = world_aabb(ch)
        if a:
            xs += [a["min"][0], a["max"][0]]
            ys += [a["min"][1], a["max"][1]]
            zs += [a["min"][2], a["max"][2]]
    if not xs:
        return None
    return {
        "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
        "max": [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
    }


def select_objects(objs):
    bpy.ops.object.select_all(action="DESELECT")
    count = 0
    for o in objs:
        if o.name not in bpy.data.objects:
            continue
        try:
            o.hide_set(False)
            o.hide_viewport = False
            o.select_set(True)
            count += 1
        except Exception:
            pass
    return count


def export_glb(path, objs, *, decimate=0.0):
    path = Path(path)
    n = select_objects(objs)
    if n == 0:
        print("SKIP empty", path.name, flush=True)
        return False
    if decimate > 0:
        for o in list(bpy.context.selected_objects):
            if o.type != "MESH":
                continue
            if len(o.data.polygons) < 200:
                continue
            try:
                mod = o.modifiers.new("GameDecimate", "DECIMATE")
                mod.ratio = decimate
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as e:
                print("decimate fail", o.name, e, flush=True)
    print("EXPORT", path.name, "objs", n, flush=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_yup=True,
        export_image_format="JPEG",
        export_jpeg_quality=80,
        export_skins=False,
        export_animations=False,
    )
    print("  wrote", path, "MB", round(path.stat().st_size / 1e6, 2), flush=True)
    return True


def roots_in(*coll_names):
    out = []
    for name in coll_names:
        coll = bpy.data.collections.get(name)
        if not coll:
            continue
        for o in coll.objects:
            if o.parent is None:
                out.append(o)
    return out


def descendants(root):
    acc = [root]
    for ch in root.children:
        acc.extend(descendants(ch))
    return acc


# ---------------------------------------------------------------------------
# load
# ---------------------------------------------------------------------------
print("Opening", BLEND, flush=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))

# Make sure everything we want is visible; hide templates and cameras
for o in bpy.data.objects:
    if o.name in ("CAM_HERO", "CAM_LOT", "CAM_PANEL", "CAM_LOGO") or (
        o.name.endswith("_target")
    ):
        o.hide_set(True)
        o.hide_render = True
        o.hide_viewport = True

src = bpy.data.collections.get("CARS_SRC")
if src:
    for o in src.objects:
        o.hide_set(True)
        o.hide_render = True
        o.hide_viewport = True

# ---------------------------------------------------------------------------
# 1. Equirect sky + skyline (hide near-lot content)
# ---------------------------------------------------------------------------
hide_for_sky = []
for cname in ("LOT", "RIDE", "PANEL", "MALL", "PEOPLE", "CARS_SRC", "CAMERAS"):
    coll = bpy.data.collections.get(cname)
    if not coll:
        continue
    for o in list(coll.all_objects):
        if o is None:
            continue
        try:
            hide_for_sky.append((o, o.hide_render, o.hide_viewport))
            o.hide_render = True
            o.hide_viewport = True
        except Exception:
            pass

# volume haze cube can stay; lights in SKYLINE stay

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.03
scene.render.resolution_x = 2048
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 85
scene.render.image_settings.color_mode = "RGB"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = -0.15
scene.render.filepath = str(ART / "sky_skyline.jpg")

cam_data = bpy.data.cameras.new("CAM_EQUIRECT")
cam_data.type = "PANO"
try:
    cam_data.panorama_type = "EQUIRECTANGULAR"
except Exception:
    try:
        cam_data.panorama_type = "EQUIRECTANGULAR"
    except Exception:
        pass
cam_data.clip_start = 1.0
cam_data.clip_end = 12000
cam_obj = bpy.data.objects.new("CAM_EQUIRECT", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
# Mid-lot eye height, slightly toward the skyline so the downtown band sits on the horizon
cam_obj.location = (0.0, 8.0, 1.7)
cam_obj.rotation_euler = (math.pi / 2, 0, 0)  # Blender pano: rotate to look along Y? default is -Z
# For equirect in Blender, camera rotation matters for the seam. Default camera looks -Z.
# We want downtown ( +Y ) in the "forward" view. Rotate 90 deg around X then 180 around Z?
# Standard: rotation_euler = (pi/2, 0, pi) often puts +Y in the center.
cam_obj.rotation_euler = (math.pi / 2, 0, math.pi)
scene.camera = cam_obj
print("RENDER equirect sky+skyline...", flush=True)
bpy.ops.render.render(write_still=True)
print("  wrote", ART / "sky_skyline.jpg", flush=True)

# unhide
for o, hr, hv in hide_for_sky:
    try:
        o.hide_render = hr
        o.hide_viewport = hv
    except Exception:
        pass

# ---------------------------------------------------------------------------
# 2. Collect objects by role
# ---------------------------------------------------------------------------
def is_car(o):
    n = o.name
    return n.startswith("Car_") or n.startswith("Moving_") or n in {
        "family-sedan", "suv", "hatchback", "pickup-truck", "delivery-van",
        "family-minivan", "estate-car", "kei-van", "offroad-4x4",
    } or (o.parent is None and any(
        n.startswith(p) for p in ("Car_", "Moving_")
    ))


ride_roots, mall_roots, carnival_roots = [], [], []
ground_roots, prop_roots, people_roots, sky_roots = [], [], [], []
car_roots = []
floor_objs = []

CARNIVAL_KEYS = (
    "ferris", "carousel", "swing", "wheel", "gondola", "spoke",
    "str", "string", "foodtr", "foodawn", "foodwh", "menuboard", "menutxt",
    "hot-dog", "street-food", "kiosk", "tickets", "lotgen", "eqtrailer", "eqwheel",
    "rampmid", "waste", "trash", "puddle",
)
GROUND_KEYS = (
    "asphalt", "stall", "stripe", "line", "curb", "island", "dirt", "xwalk",
    "crosswalk", "handicap", "lot_paint", "stallpatch", "stallw", "stalle",
    "stalln", "stalls", "stallfg", "v3a", "v3b", "v3c", "v3w", "v3n", "v3mid",
    "corral",
)
PROP_KEYS = (
    "lamp", "tree", "ginkgo", "spruce", "planter", "oak", "bin", "barrier",
    "fence", "post", "cable", "gen", "ramp",
)
RIDE_KEYS = (
    "night", "press", "deck", "ring", "hoop", "pad", "door", "sign", "panel",
    "trailer", "outrigger", "jack", "step", "stair", "booth", "ticket",
    "queue", "rail", "fence", "generator", "cable", "platform", "fascia",
    "neon", "rider",
)

# classify from collections first
for o in roots_in("RIDE", "PANEL"):
    ride_roots.append(o)
for o in roots_in("MALL"):
    mall_roots.append(o)
for o in roots_in("PEOPLE"):
    people_roots.append(o)
for o in roots_in("SKYLINE"):
    # skip volume/haze helpers and the equirect cam
    n = o.name.lower()
    if n.startswith("skyhaze") or n.startswith("cam_"):
        continue
    sky_roots.append(o)

lot_coll = bpy.data.collections.get("LOT")
if lot_coll:
    for o in lot_coll.objects:
        if o.parent is not None:
            continue
        n = o.name.lower()
        if o.hide_render and o.hide_viewport:
            continue
        if n.startswith("car_") or n.startswith("moving_"):
            car_roots.append(o)
            continue
        if any(k in n for k in CARNIVAL_KEYS):
            carnival_roots.append(o)
            continue
        if any(k in n for k in GROUND_KEYS) or n in ("asphalt", "ground"):
            ground_roots.append(o)
            continue
        # leftover lot props (lamps, trees, corrals, ramps, gens near the ride)
        prop_roots.append(o)

# also catch ride-adjacent generators already in RIDE
# floors: deck / step / platform meshes
for o in bpy.data.objects:
    n = o.name.lower()
    if o.type == "MESH" and any(k in n for k in ("deck", "step", "stair", "platform", "walk")):
        if "sky" in n:
            continue
        floor_objs.append(o)

print(
    "counts ride", len(ride_roots), "mall", len(mall_roots),
    "carnival", len(carnival_roots), "ground", len(ground_roots),
    "props", len(prop_roots), "people", len(people_roots),
    "cars", len(car_roots), "sky", len(sky_roots),
    flush=True,
)

# flatten to all objects in each hierarchy for export
def tree(roots):
    acc = []
    for r in roots:
        acc.extend(descendants(r))
    # unique
    seen = set()
    out = []
    for o in acc:
        if o.name not in seen:
            seen.add(o.name)
            out.append(o)
    return out

# ---------------------------------------------------------------------------
# 3. Export GLBs
# ---------------------------------------------------------------------------
export_glb(ART / "night_press.glb", tree(ride_roots))
export_glb(ART / "mall.glb", tree(mall_roots))
export_glb(ART / "carnival.glb", tree(carnival_roots))
export_glb(ART / "ground.glb", tree(ground_roots))
export_glb(ART / "props.glb", tree(prop_roots))
export_glb(ART / "people.glb", tree(people_roots))
# skyline 3D, lightly decimated so iPhone can hold it (backdrop panorama is the look)
export_glb(ART / "skyline.glb", tree(sky_roots), decimate=0.35)

# ---------------------------------------------------------------------------
# 4. Car placements + copy tevy templates
# ---------------------------------------------------------------------------
placements = []
for o in car_roots:
    # find a style from child / name? stored as Car_12 with paint
    style = "sedan"
    # walk children mesh names? not reliable. Use object name only.
    loc = o.matrix_world.translation
    # tevy forward is -Y; we added +pi/2 on place, so rot_z in blender is heading+pi/2
    # Export the actual world rotation Z
    rz = o.matrix_world.to_euler()[2]
    placements.append({
        "name": o.name,
        "x": round(loc.x, 3),
        "y": round(loc.y, 3),
        "z": round(loc.z, 3),
        "rz": round(rz, 4),
        "lights": o.name.startswith("Moving_"),
    })

# We also export the placed cars as one GLB so paint colors survive (templates alone lose per-instance paint)
export_glb(ART / "cars.glb", tree(car_roots))

# ---------------------------------------------------------------------------
# 5. Collision + floors + spawn
# ---------------------------------------------------------------------------
def box_from_roots(roots, name, kind="solid", pad=0.0):
    boxes = []
    for r in roots:
        a = world_aabb(r)
        if not a:
            continue
        mn, mx = a["min"], a["max"]
        dx, dy, dz = mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]
        if dx < 0.15 and dy < 0.15:
            continue
        if dz < 0.05 and kind == "solid":
            continue
        # skip huge ground
        if dx > 80 or dy > 80:
            continue
        boxes.append({
            "name": r.name,
            "kind": kind,
            "min": [mn[0] - pad, mn[1] - pad, mn[2]],
            "max": [mx[0] + pad, mx[1] + pad, mx[2]],
        })
    return boxes

colliders = []
colliders += box_from_roots(ride_roots, "ride", "solid", pad=0.05)
# but drop very low thin pieces; also mark floors separately
colliders += box_from_roots(mall_roots, "mall", "solid", pad=0.0)
colliders += box_from_roots(carnival_roots, "carnival", "solid", pad=0.15)
colliders += box_from_roots(car_roots, "car", "solid", pad=0.05)
# lamps / trees / kiosks / bins as props
colliders += box_from_roots(prop_roots, "prop", "solid", pad=0.05)

floors = [{"kind": "ground", "z": 0.0, "min": [-50, -50], "max": [32, 55]}]
for o in floor_objs:
    a = world_aabb(o)
    if not a:
        continue
    mn, mx = a["min"], a["max"]
    floors.append({
        "kind": "platform",
        "name": o.name,
        "z": round(mx[2], 3),
        "min": [round(mn[0], 3), round(mn[1], 3)],
        "max": [round(mx[0], 3), round(mx[1], 3)],
    })

# player spawn: south of Night Press, looking toward the ride (hero-like)
spawn = {
    "x": -8.0,
    "y": -20.0,
    "z": 1.65,
    "yaw": math.pi / 2,  # Blender +Y; in three.js after yup this becomes...
    "bounds": {"min": [-42, -46], "max": [30, 48]},
}

meta = {
    "units": "blender_xy_zup — glTF export is yup; X stays, Blender Y -> glTF Z, Blender Z -> glTF Y",
    "spawn": spawn,
    "floors": floors,
    "colliders": colliders,
    "cars": placements,
}
(ART / "lot.json").write_text(json.dumps(meta, indent=2))
print("lot.json colliders", len(colliders), "floors", len(floors), "cars", len(placements), flush=True)
print("DONE export", flush=True)
