"""
75% high-profile mechanical keyboard, 84 keys — procedural, web-optimised.
Blender 4.x / 5.x.   blender -b -P build_keyboard_75.py

SCENE SCALE: 1 Blender unit = 1 cm.  Board is 31.3 x 12.3 cm.

v3 — the Z-stack refactor.
  Every height below is DERIVED from the one before it. Nothing in the vertical
  stack is an independent magic number, and the case is SOLVED from the stack
  rather than guessed alongside it. Three defects this fixes:
    * case top and bottom did not meet -> visible gap with switches showing
    * keycaps floated entirely above the rim -> not actually high-profile
    * each part was tilted separately -> layers drifted out of register

  The typing angle is now applied ONCE, to the whole assembled board, as the
  final step. An assertion pass at the end fails loudly if the stack breaks.

v2 — the line-drawing pass.
  The site renders every mesh as a near-black fill plus EdgesGeometry creases
  (25 deg). Shape and crease placement are all that read, so:
    * no blanket bevel modifier any more — a 2-segment bevel drew three lines on
      every edge. Each crease is now placed by hand, once.
    * keycaps are lofted rounded rectangles: tapered walls, a two-band soft
      shoulder (each step < 25 deg, so it shades round but draws no line), and a
      cylindrical dish. The only cap lines are the base, the dished top rim and
      nothing in between.
    * case corners are rounded in plan in < 25 deg steps (no vertical corner
      lines); the frame gets one deliberate 45 deg outer chamfer.
    * switch: lower/upper housing split with an overhanging upper, a stem post
      and a single-outline cross (v1's two crossed boxes drew lines through
      each other).
  Object names, materials, hierarchy, origins and the Z stack are unchanged.

Original design; a 75% layout and high-profile case are category conventions.
"""

import bpy, bmesh, math, os
from mathutils import Matrix, Vector

# ══════════════════════════════════════════════════════════════════════
#  PLAN DIMENSIONS  (cm)
# ══════════════════════════════════════════════════════════════════════
EXPORT_DIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "assets")
EXPORT_NAME  = "keyboard_75_v2.glb"

CASE_W       = 31.30
CASE_D       = 12.30
ROW_TOTAL_U  = 16.0
ROWS         = 6
WALL         = 0.40     # 4 mm. At 6.2 mm the cavity was shallower than 6 rows
                        # of keys — the field overflowed the case before v4.
KEY_GAP      = 0.16
PLATE_CLEAR  = 0.15     # 1.5 mm per side between plate/PCB and the cavity

TYPING_ANGLE_DEG = 6.0
FRONT_LIP_WANT   = 0.55     # chamfer on the front wall of the tub — clamped below
FRONT_MIN_WALL   = 0.15     # 1.5 mm of wall must survive behind the chamfer

# ══════════════════════════════════════════════════════════════════════
#  VERTICAL STACK — the single source of truth.
#  Read top-down: each line consumes the line above it.
# ══════════════════════════════════════════════════════════════════════
CASE_FLOOR_T        = 0.30   # tub floor thickness
PCB_STANDOFF        = 0.55   # inner floor -> PCB top
PCB_T               = 0.16
SWITCH_CLIP_DEPTH   = 0.19   # PCB top -> plate top (the switch's clip travel)
PLATE_T             = 0.15
SWITCH_ABOVE_PLATE  = 0.60   # 6 mm of switch body proud of the plate
KEY_TRAVEL          = 0.40   # 4 mm of key travel
RIM_BELOW_MIDTRAVEL = 0.10   # 1 mm: rim sits this far under a half-pressed cap
CASE_JOIN_OVERLAP   = 0.10   # 1 mm — top skirt hangs DOWN over the tub (lip joint)
CASE_JOIN_LIP       = 0.06   # 0.6 mm — tub is inset so the skirt sleeves outside it

POCKET_DEPTH  = 0.15         # 1.5 mm — openings are recessed this far
NUB_INSET     = 0.05         # 0.5 mm — nub face sits below the wall plane
POCKET_MARGIN = 0.15         # 1.5 mm — minimum clear space to any wall edge
USB_SIZE      = (0.90, 0.35) # 9 x 3.5 mm
SLIDER_SIZE   = (0.80, 0.30) # 8 x 3 mm
POCKET_SPACING = 0.50        # 5 mm between neighbouring openings
CLUSTER_INSET  = 0.40        # clear space between the cluster and the rear corner

# keycap height per row (8–11 mm), row 0 = F-row .. row 5 = bottom row
ROW_CAP_H    = [0.88, 1.10, 1.02, 0.94, 0.98, 1.06]
ROW_TILT_DEG = [ 2.0,  6.0,  3.5,  0.0, -3.5, -6.0]

# ── DERIVED — do not hardcode any of these ────────────────────────────
Z_INNER_FLOOR = CASE_FLOOR_T
Z_PCB_TOP     = Z_INNER_FLOOR + PCB_STANDOFF
Z_PCB_BOT     = Z_PCB_TOP - PCB_T
Z_PLATE_TOP   = Z_PCB_TOP + SWITCH_CLIP_DEPTH
Z_PLATE_BOT   = Z_PLATE_TOP - PLATE_T
Z_SWITCH_BOT  = Z_PLATE_BOT                       # housing passes through the plate
Z_SWITCH_TOP  = Z_PLATE_TOP + SWITCH_ABOVE_PLATE
SWITCH_H      = Z_SWITCH_TOP - Z_SWITCH_BOT
Z_KEYCAP_BASE = Z_SWITCH_TOP                      # stem engagement

def z_keycap_top(row):
    return Z_KEYCAP_BASE + ROW_CAP_H[row]

# rim is solved from a half-pressed keycap, per the brief
_MEAN_CAP_H          = sum(ROW_CAP_H) / len(ROW_CAP_H)
Z_KEYCAP_TOP_MIDTRAV = Z_KEYCAP_BASE + _MEAN_CAP_H - KEY_TRAVEL / 2
Z_CASE_RIM           = Z_KEYCAP_TOP_MIDTRAV - RIM_BELOW_MIDTRAVEL

# the split line: just above the plate, so the tub encloses PCB + plate
Z_CASE_SPLIT   = Z_PLATE_TOP + 0.25

# The front chamfer eats into the wall as it descends, and it is thinnest where
# the cavity floor meets it. v4 typed 5.5 mm here: at the floor line that left
# 0.2 mm of wall and then cut clean through, opening a slot along the whole front
# that the cavity looked out of. Solve the lip from the wall it may spend.
FRONT_LIP = min(FRONT_LIP_WANT,
                (WALL - FRONT_MIN_WALL) / (1.0 - CASE_FLOOR_T / Z_CASE_SPLIT))
Z_TOP_WALL_BOT = Z_CASE_SPLIT - CASE_JOIN_OVERLAP     # top sleeves down over the tub
CASE_TOP_H     = Z_CASE_RIM - Z_TOP_WALL_BOT

# tub is inset so the top skirt sits OUTSIDE it through the overlap band
BOTTOM_OUTER_W = CASE_W - 2 * CASE_JOIN_LIP
BOTTOM_OUTER_D = CASE_D - 2 * CASE_JOIN_LIP
WALL_OUTER_X   = -BOTTOM_OUTER_W / 2          # left wall outer plane

# ── cavity -> plate -> key field. Sizing the key field independently is what
#    pushed the plate edge through the case seam in v3.
CAVITY_W = BOTTOM_OUTER_W - 2 * WALL
CAVITY_D = BOTTOM_OUTER_D - 2 * WALL
PLATE_W  = CAVITY_W - 2 * PLATE_CLEAR
PLATE_D  = CAVITY_D - 2 * PLATE_CLEAR
PCB_W    = PLATE_W - 0.20
PCB_D    = PLATE_D - 0.20

# ── port cluster: exactly three pockets, rear of the left edge ────────
# The usable face is the tub wall between its own bottom edge and the parting
# line (the skirt covers everything above Z_TOP_WALL_BOT). Pockets are centred
# in that band, so none can touch a wall edge or straddle the seam.
BAND_LO  = CASE_FLOOR_T + POCKET_MARGIN
BAND_HI  = Z_TOP_WALL_BOT - POCKET_MARGIN
CTRL_Z   = (BAND_LO + BAND_HI) / 2

_WALL_Y1 = (BOTTOM_OUTER_D - 2 * WALL) / 2            # rear limit of the wall span


def _cluster():
    """Three pockets laid out from the rear corner forward: USB, slider, slider."""
    out, cursor = [], _WALL_Y1 - CLUSTER_INSET
    for name, (ln, ht) in (('usb', USB_SIZE), ('s1', SLIDER_SIZE), ('s2', SLIDER_SIZE)):
        y1 = cursor
        y0 = y1 - ln
        out.append({'name': name, 'y0': y0, 'y1': y1,
                    'z0': CTRL_Z - ht / 2, 'z1': CTRL_Z + ht / 2,
                    'yc': (y0 + y1) / 2, 'len': ln, 'ht': ht})
        cursor = y0 - POCKET_SPACING
    return sorted(out, key=lambda p: p['y0'])


POCKETS = _cluster()

# Rear risers. At 26 x 3.4 mm these were blades — a 12 mm drop held up by a
# paddle thinner than the wall it hangs off. A foot that carries a tilt reads as
# a plinth: wide, deep, tucked under the rear wall with the case overhanging it.
FOOT_W      = 4.20    # X
FOOT_D      = 1.60    # Y
FOOT_DRAFT  = 0.06    # bottom pulled in — a moulded foot, not a sawn prism
FOOT_INSET  = 1.60    # clear of the case ends
FOOT_TUCK   = 0.12    # clear of the tub's rear plane, so the case overhangs it
FOOT_SINK   = 0.003   # top pushed into the case, not coplanar with its underside

BEVEL_WIDTH = 0.035
BEVEL_SEGS  = 2
BEVEL_ANGLE = math.radians(40)

SWITCH_W  = 1.38
PLATE_CUT = 1.40             # 14 mm, the MX cutout standard — 0.1 mm clear per side
STEM_H    = 0.34             # stem top sits this far above the housing (into the cap)

# v2 switch: the split sits a little above the plate, and the upper housing
# overhangs the lower — the ledge is what reads as "two mouldings"
SPLIT_ABOVE_PLATE = 0.14
UPPER_W      = 1.50          # upper housing footprint (wider than the 14 mm cutout)
UPPER_SKIRT  = 0.10          # vertical band before the upper housing slopes in
UPPER_TOP_W  = 1.02          # flat top of the upper housing
STEM_POST    = (0.56, 0.44, 0.10)   # w, d, h — the slider body proud of the housing
STEM_ARM_LEN = 0.60
STEM_ARM_W   = 0.20

# v2 keycap. Every number here is chosen against the 25 deg crease threshold.
#
# THE ROUNDING RULE used everywhere below: a rounded edge is a run of chords
# whose normals step < 25 deg (so it shades soft and draws nothing), ending in
# ONE step > 25 deg onto the flat face. In a line drawing that is one clean
# outline on the flat side of a soft edge — the way Fig 5 draws its plates.
# Plan-view corners turn in steps < 25 deg and draw no line at all.
KEYCAP_TAPER = 0.20          # wall lean per side, base -> shoulder
CAP_R_BASE   = 0.15          # plan-view corner radius at the base
CAP_R_TOP    = 0.13          # ... at the top rim (shoulder rings are concentric
                             #     offsets of it, so the shoulder never twists)
CAP_CORNER_SEGS = 4          # 22.5 deg per step
# shoulder chord normals, degrees up from horizontal. The wall's normal is
# ~14 deg; steps of 15 deg stay silent, the 31 deg step onto the dish draws.
CAP_SHOULDER_NORMALS = [29, 44, 59]
CAP_SHOULDER_L = 0.032       # chord length
DISH_DEPTH   = 0.09          # cylindrical scoop, deepest on the centre line (parabola over the full base width)

# v2 case
CASE_R        = 0.80         # plan-view outer corner radius of the frame.
                             # Capped by the USB pocket: the rear corner arc of
                             # the tub must start behind it (asserted below).
CASE_CORNER_SEGS = 6         # 15 deg per step
FRAME_TOP_NORMALS = [18, 36, 54]   # outer top edge: wall -> ... -> top (36 deg draws)
FRAME_TOP_L   = 0.065
BEZEL_LIP_TANGENTS = [36, 54, 72]  # inner lip: top -> (36 deg draws) -> ... -> wall
BEZEL_LIP_L   = 0.05
TUB_FOOT_NORMALS = [18, 36, 54]    # desk edge, mirrored: wall -> ... -> floor
TUB_FOOT_L    = 0.04
PLATE_R       = 0.40         # plate + PCB plan-view corner radius
SINK          = 0.02         # 0.2 mm: touching parts overlap instead of sharing a face

# ══════════════════════════════════════════════════════════════════════
#  KEY LAYOUT — 75%, 84 keys. (width_u, role)
#  role: 'a' alpha | 'm' modifier/F/nav | 'e' Esc
# ══════════════════════════════════════════════════════════════════════
A, N = 'a', 'm'
KEY_LAYOUT = [
    [(1, 'e')] + [(1, N)] * 15,                                    # 16 keys
    [(1, A)] * 13 + [(2, N), (1, N)],                              # 15
    [(1.5, N)] + [(1, A)] * 12 + [(1.5, N), (1, N)],               # 15
    [(1.75, N)] + [(1, A)] * 11 + [(2.25, N), (1, N)],             # 14
    [(2.25, N)] + [(1, A)] * 10 + [(1.75, N), (1, N), (1, N)],     # 14
    [(1.25, N)] * 3 + [(6.25, A)] + [(1, N)] * 6,                  # 10
]
MAT_BY_ROLE = {'a': 0, 'm': 1, 'e': 2}

# key pitch is derived from the PLATE, so the field can never outgrow the cavity
KEY_UNIT    = min(PLATE_W / ROW_TOTAL_U, PLATE_D / ROWS)
KEY_FIELD_W = ROW_TOTAL_U * KEY_UNIT
KEY_FIELD_D = ROWS * KEY_UNIT
TYPING_ANGLE = math.radians(TYPING_ANGLE_DEG)
TILT_PIVOT   = Vector((0.0, -CASE_D / 2, 0.0))     # front bottom edge


# ══════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════
def purge_kb():
    for ob in [o for o in bpy.data.objects if o.name.startswith("KB_")]:
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    for ma in [m for m in bpy.data.materials if m.name.startswith("KB_Mat_")]:
        bpy.data.materials.remove(ma)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i+2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def make_material(name, hexc, roughness=0.5, metallic=0.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_rgb(hexc)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    if transmission and "Transmission Weight" in b.inputs:
        b.inputs["Transmission Weight"].default_value = transmission
    return m


def bm_box(bm, w, d, h, center, mat_idx=0, top_shrink=0.0):
    """Box whose BOTTOM face is centred on `center`."""
    cx, cy, cz = center
    bw, bd = w / 2, d / 2
    tw, td = bw - top_shrink, bd - top_shrink
    lo = [bm.verts.new((cx + sx*bw, cy + sy*bd, cz))
          for sx, sy in ((-1,-1), (1,-1), (1,1), (-1,1))]
    hi = [bm.verts.new((cx + sx*tw, cy + sy*td, cz + h))
          for sx, sy in ((-1,-1), (1,-1), (1,1), (-1,1))]
    faces = [bm.faces.new((lo[3], lo[2], lo[1], lo[0])), bm.faces.new(hi)]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
    for f in faces:
        f.material_index = mat_idx
    return faces[1]


def bm_span(bm, x_c, thick, y0, y1, z0, z1, mat_idx=0):
    """Box from explicit spans. bm_box takes a CENTRE; passing an edge to it has
       now caused two separate bugs (a nub through a wall, a shredded side wall),
       so anything positional goes through here instead."""
    if y1 - y0 <= 1e-6 or z1 - z0 <= 1e-6:
        return
    bm_box(bm, thick, y1 - y0, z1 - z0, (x_c, (y0 + y1) / 2, z0), mat_idx)


def rrect_ring(hw, hd, r, z, n_int=0, segs=4, cx=0.0, cy=0.0):
    """Rounded rectangle, counter-clockwise from above.

    Ordered front half by ascending x, then back half by descending x, so vertex
    i of the front half and its mirror in the back half share an x. Every ring
    built with the same (n_int, segs) has the same vertex count, so any two of
    them can be lofted quad-for-quad. n_int adds points along the front/back
    straight edges — the dish needs them, nothing else does.
    """
    r = max(1e-3, min(r, hw - 1e-3, hd - 1e-3))
    front = []
    for k in range(segs + 1):
        a = math.pi + k * (math.pi / 2) / segs
        front.append((-hw + r + r * math.cos(a), -hd + r + r * math.sin(a)))
    for k in range(1, n_int + 1):
        front.append((-hw + r + (2 * hw - 2 * r) * k / (n_int + 1), -hd))
    for k in range(segs + 1):
        a = 1.5 * math.pi + k * (math.pi / 2) / segs
        front.append((hw - r + r * math.cos(a), -hd + r + r * math.sin(a)))
    back = [(px, -py) for px, py in reversed(front)]
    return [Vector((cx + px, cy + py, z)) for px, py in front + back]


def bm_loft(bm, rings, mat_idx=0, cap_bottom=True, cap_top=True, loop=False):
    """Skin a list of equal-length CCW rings. Outward normals when the profile
       runs bottom -> top on the outside (and, for a loop, back down inside)."""
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    pairs = list(zip(vr, vr[1:])) + ([(vr[-1], vr[0])] if loop else [])
    faces = []
    for a, b in pairs:
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    if cap_bottom and not loop:
        faces.append(bm.faces.new(list(reversed(vr[0]))))
    if cap_top and not loop:
        faces.append(bm.faces.new(vr[-1]))
    for f in faces:
        f.material_index = mat_idx
    return vr


def bm_prism(bm, outline, z0, z1, mat_idx=0):
    """Straight extrusion of a CCW outline [(x, y), ...]."""
    lo = [Vector((x, y, z0)) for x, y in outline]
    hi = [Vector((x, y, z1)) for x, y in outline]
    return bm_loft(bm, [lo, hi], mat_idx)


def walk(start, dirs, step):
    """Polyline from `start`, one chord of length `step` along each unit (di, dz).
       Used to build every rounded edge as a run of short chords."""
    pts = [start]
    for di, dz in dirs:
        pts.append((pts[-1][0] + step * di, pts[-1][1] + step * dz))
    return pts


def bm_to_object(bm, name, materials):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in materials:
        ob.data.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob


def finalise(ob, bevel=False):
    # v2: bevel defaults OFF. Under a 25 deg EdgesGeometry pass a 2-segment
    # bevel draws three parallel lines per edge; creases are modelled instead.
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    if bevel:
        m = ob.modifiers.new("bev", 'BEVEL')
        m.width = BEVEL_WIDTH; m.segments = BEVEL_SEGS
        m.limit_method = 'ANGLE'; m.angle_limit = BEVEL_ANGLE
        bpy.ops.object.modifier_apply(modifier="bev")
    bpy.ops.object.shade_smooth()
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    except Exception:
        pass
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')


def key_slots():
    for r, row in enumerate(KEY_LAYOUT):
        cursor = -KEY_FIELD_W / 2
        y = ((ROWS - 1) / 2 - r) * KEY_UNIT
        for width, role in row:
            yield r, cursor + width * KEY_UNIT / 2, y, width, role
            cursor += width * KEY_UNIT


# ══════════════════════════════════════════════════════════════════════
#  PARTS  — all built FLAT. The typing angle is applied once, at the end.
# ══════════════════════════════════════════════════════════════════════
def cut(ob, bmc, name):
    """Difference `ob` by the boxes in `bmc`. Every cutter box must overshoot the
       surface it breaks, so the solver never has to resolve a coplanar face."""
    cutter = bm_to_object(bmc, name, list(ob.data.materials))
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("cut", 'BOOLEAN')
    m.object = cutter
    m.operation = 'DIFFERENCE'
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)
    return ob


def make_case_bottom(mat):
    """Tub: ONE solid, hollowed and ported by ONE boolean.

    v4 stacked a floor box and four wall boxes, and cut the port openings by
    leaving gaps between six more boxes. Every junction between those boxes was a
    pair of coincident 90-degree edges; the bevel found all of them and the case
    wore a groove right round it at floor height, another down each corner, and
    brickwork around the ports. A solid minus its cavity has no junctions to find.

    Booleans are safe here because every operand is a single closed box. What ate
    the front wall in v3 was booleaning the overlapping, non-manifold tub itself.
    """
    ow, od, h = BOTTOM_OUTER_W, BOTTOM_OUTER_D, Z_CASE_SPLIT
    r_out = CASE_R - CASE_JOIN_LIP              # concentric with the frame
    S = CASE_CORNER_SEGS
    # desk edge: soft round, one outline where it meets the floor
    foot = walk((0.0, 0.0), [(math.sin(math.radians(n)), -math.cos(math.radians(n)))
                             for n in TUB_FOOT_NORMALS], TUB_FOOT_L)
    zf = -foot[-1][1]
    prof = [(i, zf + dz) for i, dz in reversed(foot)] + [(0.0, h)]
    bm = bmesh.new()
    bm_loft(bm, [rrect_ring(ow/2 - i, od/2 - i, r_out - i, zz, segs=S) for i, zz in prof])
    # Chamfer the front: floor edge and wall on one plane, desk to seam. v4 sloped
    # the wall alone, so the floor kept its full depth and stood out underneath it
    # as a 5.5 mm ledge running the whole length of the board.
    # v2: the whole front band (front edge + both front corner arcs) shears as
    # one, so the arcs stay arcs and the side walls stay planar.
    for v in bm.verts:
        if v.co.y < -od / 2 + r_out + 1e-6:
            v.co.y += FRONT_LIP * (1.0 - v.co.z / h)
    ob = bm_to_object(bm, "KB_Case_Bottom", [mat])

    bmc = bmesh.new()
    bm_loft(bmc, [rrect_ring(ow/2 - WALL, od/2 - WALL, r_out - WALL, CASE_FLOOR_T, segs=S),
                  rrect_ring(ow/2 - WALL, od/2 - WALL, r_out - WALL, h + 0.2, segs=S)])  # cavity
    for p in POCKETS:                                                # blind ports
        bm_span(bmc, WALL_OUTER_X + (POCKET_DEPTH - 0.2) / 2, POCKET_DEPTH + 0.2,
                p['y0'], p['y1'], p['z0'], p['z1'])
    cut(ob, bmc, "KB_CaseCutter")
    finalise(ob)
    return ob


def make_case_top(mat):
    """High-profile frame. Bottom edge sleeves 0.2 mm down OUTSIDE the tub;
       rim height is solved from the keycap stack, never typed in.

       One solid, one boolean, for the same reason as the tub: four separate wall
       boxes put a bevelled seam down all four corners of the frame."""
    ow, od, z, h = CASE_W, CASE_D, Z_TOP_WALL_BOT, CASE_TOP_H
    zt, S = z + h, CASE_CORNER_SEGS
    # v2: no boolean at all — the frame is ONE closed loop of rings swept round
    # its cross-section: outer wall, soft rounded top edge (outline on the bezel
    # side), flat bezel, soft lip into the opening (outline on the bezel side),
    # inner wall, underside. Radius = CASE_R - inset keeps every ring concentric,
    # so the plan corners stay true offsets and no quad twists.
    top = walk((0.0, 0.0), [(math.sin(math.radians(n)), math.cos(math.radians(n)))
                            for n in FRAME_TOP_NORMALS], FRAME_TOP_L)
    rise = top[-1][1]
    lip = walk((0.0, 0.0), [(math.cos(math.radians(t)), -math.sin(math.radians(t)))
                            for t in BEZEL_LIP_TANGENTS], BEZEL_LIP_L)
    lip_in = lip[-1][0]
    prof = [(0.0, z)] + [(i, zt - rise + dz) for i, dz in top]
    prof += [(WALL - lip_in + i, zt + dz) for i, dz in lip]
    prof += [(WALL, z)]
    def ring(inset, zz):
        return rrect_ring(ow/2 - inset, od/2 - inset, CASE_R - inset, zz, segs=S)
    bm = bmesh.new()
    bm_loft(bm, [ring(i, zz) for i, zz in prof], loop=True)
    ob = bm_to_object(bm, "KB_Case_Top", [mat])
    finalise(ob)
    return ob


def make_slab(name, w, d, z_bot, z_top, mat):
    bm = bmesh.new()
    bm_loft(bm, [rrect_ring(w/2, d/2, PLATE_R, z_bot, segs=CASE_CORNER_SEGS),
                 rrect_ring(w/2, d/2, PLATE_R, z_top, segs=CASE_CORNER_SEGS)])
    ob = bm_to_object(bm, name, [mat])
    finalise(ob)
    return ob


def make_plate(mat):
    """Brass plate with a real cutout under every key.

    A solid slab was the loudest fake tell in the exploded view — a plate is
    mostly hole, and the switches are supposed to be visibly clipped INTO it.
    One cutter object holding all 84 boxes, one boolean: the same result as 84
    separate booleans and a fraction of the build time.
    """
    bm = bmesh.new()
    bm_loft(bm, [rrect_ring(PLATE_W/2, PLATE_D/2, PLATE_R, Z_PLATE_BOT, segs=CASE_CORNER_SEGS),
                 rrect_ring(PLATE_W/2, PLATE_D/2, PLATE_R, Z_PLATE_TOP, segs=CASE_CORNER_SEGS)])
    ob = bm_to_object(bm, "KB_Plate", [mat])

    bmc = bmesh.new()
    for r, x, y, width, role in key_slots():
        # cutter overshoots the plate top and bottom so the boolean never has to
        # resolve a coplanar face
        bm_box(bmc, PLATE_CUT, PLATE_CUT, PLATE_T * 3, (x, y, Z_PLATE_BOT - PLATE_T))
    cutter = bm_to_object(bmc, "KB_PlateCutter", [mat])

    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("cut", 'BOOLEAN')
    m.object = cutter
    m.operation = 'DIFFERENCE'
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)

    finalise(ob)
    return ob


def make_side_controls(mat_case, mat_port):
    """What sits INSIDE the three wall openings.

    v4 left every recess case-coloured with a small nub floating in the middle of
    it — three blank stamped panels, not ports. The read comes from contrast: a
    dark backing turns each recess into a HOLE, and the part that belongs in that
    hole sits on top of it. A USB-C tongue centred in its slot; a toggle pushed to
    one end of its own, because a switch parked dead centre reads as decoration.

    Every outer face stays NUB_INSET below the wall plane, so the silhouette is
    unbroken. Material 0 = case, 1 = the dark port black.
    """
    bm = bmesh.new()
    x_floor = WALL_OUTER_X + POCKET_DEPTH        # bottom of the pocket
    x_back  = x_floor - 0.04                     # dark backing, just proud of it
    x_face  = WALL_OUTER_X + NUB_INSET           # outermost face we may occupy

    def slab(xa, xb, y0, y1, z0, z1, mi):
        bm_span(bm, (xa + xb) / 2, xb - xa, y0, y1, z0, z1, mi)

    for p in POCKETS:
        slab(x_back, x_floor + SINK, p['y0'], p['y1'], p['z0'], p['z1'], 1)   # the hole
        if p['name'] == 'usb':
            # tongue: centred, thin, sunk halfway down the recess
            slab(WALL_OUTER_X + POCKET_DEPTH * 0.55, x_back + SINK,
                 p['yc'] - p['len'] * 0.31, p['yc'] + p['len'] * 0.31,
                 CTRL_Z - p['ht'] * 0.18, CTRL_Z + p['ht'] * 0.18, 0)
        else:
            # toggle, thrown to one end — the two switches sit opposite ways
            off = p['len'] * (0.18 if p['name'] == 's1' else -0.18)
            slab(x_face, x_back + SINK,
                 p['yc'] + off - p['len'] * 0.20, p['yc'] + off + p['len'] * 0.20,
                 CTRL_Z - p['ht'] * 0.32, CTRL_Z + p['ht'] * 0.32, 0)

    ob = bm_to_object(bm, "KB_SideControls", [mat_case, mat_port])
    finalise(ob)
    return ob


def make_switch_mesh(m_lower, m_upper, m_stem):
    """One master mesh, 3 slots. Height comes from the derived stack."""
    bm = bmesh.new()
    z_split = PLATE_T + SPLIT_ABOVE_PLATE
    # lower housing: a plain block through the 14 mm cutout, up to the split
    # (runs SINK into the upper, so no two faces share the split plane)
    bm_box(bm, SWITCH_W, SWITCH_W, z_split + SINK, (0, 0, 0), 0)
    # upper housing: overhangs the lower (the ledge reads as the split), a short
    # vertical skirt, then one sloped band to a flat top
    sq = lambda w, zz: [Vector((sx * w / 2, sy * w / 2, zz))
                        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm_loft(bm, [sq(UPPER_W, z_split), sq(UPPER_W, z_split + UPPER_SKIRT),
                 sq(UPPER_TOP_W, SWITCH_H)], 1)
    # stem: slider post proud of the housing, then ONE cross outline. v1 crossed
    # two boxes, and each box's top edges drew straight through the other.
    pw, pd, ph = STEM_POST
    bm_box(bm, pw, pd, ph + SINK, (0, 0, SWITCH_H - SINK), 2)
    L, a = STEM_ARM_LEN / 2, STEM_ARM_W / 2
    cross = [(a, -L), (a, -a), (L, -a), (L, a), (a, a), (a, L),
             (-a, L), (-a, a), (-L, a), (-L, -a), (-a, -a), (-a, -L)]
    bm_prism(bm, cross, SWITCH_H + ph - SINK, SWITCH_H + STEM_H, 2)
    ob = bm_to_object(bm, "KB_Switch_master", [m_lower, m_upper, m_stem])
    finalise(ob)
    mesh = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    return mesh


def make_switches(mesh):
    empty = bpy.data.objects.new("KB_Switches_Group", None)
    empty.empty_display_size = 2.0
    bpy.context.collection.objects.link(empty)
    n = 0
    for r, x, y, width, role in key_slots():
        ob = bpy.data.objects.new("KB_Switch_%d_%02d" % (r, n), mesh)
        ob.location = (x, y, Z_SWITCH_BOT)
        bpy.context.collection.objects.link(ob)
        ob.parent = empty
        ob.matrix_parent_inverse = empty.matrix_world.inverted()
        n += 1
    return empty, n


def build_cap(bm, x, y, w, d, h, width_u):
    """Sculpted cap, lofted from rounded-rectangle rings.

      base ring  ->  tapered wall  ->  shoulder band 1  ->  band 2  ->  dished top

    Read as a line drawing it is two outlines: the base and the top rim, the rim
    sagging front and back where the cylindrical dish cuts it. Everything else —
    corner arcs, the shoulder, the dish itself — turns in steps under the 25 deg
    crease threshold, so it shades round without drawing.

    v1 subdivided a tapered box and pushed the top down: a 4x4 grid on a box
    with a 2-segment bevel, which drew as a grid of lines on a block.
    """
    z0 = Z_KEYCAP_BASE
    n_int = min(13, 5 + int(round(2 * (width_u - 1))))
    sh = walk((0.0, 0.0), [(math.sin(math.radians(n)), math.cos(math.radians(n)))
                           for n in CAP_SHOULDER_NORMALS], CAP_SHOULDER_L)
    sh_in, sh_rise = sh[-1]

    def ring(inset, zz, rad):
        return rrect_ring(w/2 - inset, d/2 - inset, rad, zz, n_int,
                          CAP_CORNER_SEGS, x, y)

    # base, then the shoulder rings — concentric offsets of the top rim, so the
    # straight runs line up vertex for vertex and the shoulder quads stay flat
    rings = [ring(0.0, z0, CAP_R_BASE)]
    for i, dz in sh:
        rings.append(ring(KEYCAP_TAPER + i, z0 + h - sh_rise + dz,
                          CAP_R_TOP + (sh_in - i)))

    # Cylindrical dish, axis front-to-back: depth depends on x only. Applied to
    # the shoulder rings too, so the whole top edge sags as one — that sag in the
    # front rim line is what says "keycap" in a drawing.
    # The parabola spans the full base width, so no shoulder ring ever crosses
    # its end: a clamp to zero there put a 14 deg kink into the shoulder at
    # every corner, and EdgesGeometry drew it as a stray tick.
    hx = w / 2
    def sag(px):
        t = (px - x) / hx
        return DISH_DEPTH * (1.0 - t * t)
    for ring_pts in rings[1:]:
        for p in ring_pts:
            p.z -= sag(p.x)

    vr = bm_loft(bm, rings, 0, cap_bottom=True, cap_top=False)
    # Top as strips between each front rim vertex and its mirror at the back:
    # same x, same sag, so every strip is planar and the dish has no diagonals.
    top = vr[-1]
    F = len(top) // 2
    for i in range(F - 1):
        a, b = top[i], top[i + 1]
        bb, ab = top[2 * F - 2 - i], top[2 * F - 1 - i]
        bm.faces.new((a, b, bb, ab))


def make_keycap_rows(m_alpha, m_mod, m_esc):
    """One OBJECT per key, parented to a per-row Empty.

    Was one merged mesh per row, which made a row the smallest thing that could
    move: clicking a key pressed all fifteen of them, and an exploded view could
    only ever fan out six slabs. The Empty still carries the row — same shape as
    KB_Switches_Group — so the explode drives rows and the click drives one key.

    Each key ends up with its own origin at its own centre, which is what makes
    a press a one-line local translation on the right axis.
    """
    mats = [m_alpha, m_mod, m_esc]
    rows = []
    for r in range(ROWS):
        empty = bpy.data.objects.new("KB_Keycaps_Row%d" % r, None)
        empty.empty_display_size = 1.0
        bpy.context.collection.objects.link(empty)

        # sculpted angle pivots on this row's own centre line at mid-cap height,
        # so tilting changes the angle without changing how proud the row sits
        row_y = ((ROWS - 1) / 2 - r) * KEY_UNIT
        P = Matrix.Translation(Vector((0.0, row_y, Z_KEYCAP_BASE + ROW_CAP_H[r]/2)))
        SCULPT = P @ Matrix.Rotation(math.radians(ROW_TILT_DEG[r]), 4, 'X') @ P.inverted()

        n = 0
        for rr, x, y, width, role in key_slots():
            if rr != r:
                continue
            bm = bmesh.new()
            cap_w = width * KEY_UNIT - KEY_GAP
            build_cap(bm, x, y, cap_w, KEY_UNIT - KEY_GAP, ROW_CAP_H[r], width)
            ob = bm_to_object(bm, "KB_Key_R%d_%02d" % (r, n), [mats[MAT_BY_ROLE[role]]])
            ob.matrix_world = SCULPT @ ob.matrix_world
            finalise(ob)
            ob.parent = empty
            ob.matrix_parent_inverse = empty.matrix_world.inverted()
            n += 1
        rows.append((empty, n))
    return rows


# ══════════════════════════════════════════════════════════════════════
#  BUILD  (flat)
# ══════════════════════════════════════════════════════════════════════
purge_kb()

m_case  = make_material("KB_Mat_Case",        "#17181C", 0.50, 0.35)
m_alpha = make_material("KB_Mat_Cap_Alpha",   "#A9ABAD", 0.55)
m_mod   = make_material("KB_Mat_Cap_Mod",     "#4A4C50", 0.55)
m_esc   = make_material("KB_Mat_Cap_Esc",     "#E8500F", 0.48)
m_lower = make_material("KB_Mat_SwitchLower", "#101014", 0.62)
m_upper = make_material("KB_Mat_SwitchUpper", "#C9CED6", 0.14, 0.0, 0.25)
m_stem  = make_material("KB_Mat_Stem",        "#2FA8E0", 0.32)
m_plate = make_material("KB_Mat_Plate",       "#B08D57", 0.35, 0.90)
m_pcb   = make_material("KB_Mat_PCB",         "#14181F", 0.70)
m_port  = make_material("KB_Mat_Port",        "#0A0B0D", 0.45)

make_case_bottom(m_case)
make_case_top(m_case)
make_slab("KB_PCB",   PCB_W,   PCB_D,   Z_PCB_BOT,   Z_PCB_TOP,   m_pcb)
make_plate(m_plate)
switch_mesh = make_switch_mesh(m_lower, m_upper, m_stem)
_, n_switch = make_switches(switch_mesh)
cap_rows = make_keycap_rows(m_alpha, m_mod, m_esc)
make_side_controls(m_case, m_port)

# ══════════════════════════════════════════════════════════════════════
#  TYPING ANGLE — one rotation, whole board, front bottom edge. Final step.
#  Doing this per part is what knocked the layers out of register in v2.
# ══════════════════════════════════════════════════════════════════════
TILT = Matrix.Translation(TILT_PIVOT) @ Matrix.Rotation(TYPING_ANGLE, 4, 'X') \
       @ Matrix.Translation(-TILT_PIVOT)

for ob in bpy.data.objects:
    if ob.name.startswith("KB_") and ob.parent is None:
        ob.matrix_world = TILT @ ob.matrix_world
bpy.context.view_layer.update()

# feet are built AFTER the tilt, in world space, so they reach the ground
def make_feet(mat):
    """Rear feet, built after the tilt.

    Their TOP face is snapped onto the tilted case underside vertex by vertex —
    a flat top under a 6-degree underside touches along one edge and gapes at
    the other, which reads as a foot floating loose. Foot Z is derived from the
    underside plane, never typed in.

    No bevel: the assertion demands the top face sit flush within 0.05 mm, and a
    0.35 mm chamfer would pull it away from the case. The draft on the bottom
    face does that job instead, and only on the edges that face the desk.
    """
    bm = bmesh.new()
    y = BOTTOM_OUTER_D / 2 - FOOT_TUCK - FOOT_D / 2
    nominal = (TILT @ Vector((0.0, y, 0.0))).z
    for sx in (-1, 1):
        cx = sx * (CASE_W / 2 - FOOT_INSET - FOOT_W / 2)
        before = set(bm.verts)
        bm_box(bm, FOOT_W, FOOT_D, nominal, (cx, y, 0.0))
        for v in set(bm.verts) - before:
            if v.co.z > nominal * 0.5:                 # top face -> onto the case
                v.co.z = (TILT @ Vector((v.co.x, v.co.y, 0.0))).z + FOOT_SINK
            else:                                      # bottom face -> draft
                v.co.x -= math.copysign(FOOT_DRAFT, v.co.x - cx)
                v.co.y -= math.copysign(FOOT_DRAFT, v.co.y - y)
    ob = bm_to_object(bm, "KB_Feet", [mat])
    finalise(ob, bevel=False)
    return ob

make_feet(m_case)
bpy.context.view_layer.update()


# ══════════════════════════════════════════════════════════════════════
#  ASSERTION PASS
# ══════════════════════════════════════════════════════════════════════
INV_TILT = TILT.inverted()

def z_range(name, board_local=True):
    """Z span of a PART — a mesh, or an Empty and everything parented to it.
       board_local un-rotates the typing angle first; comparing tilted parts by
       raw world Z is how you invent phantom bugs."""
    ob = bpy.data.objects.get(name)
    if ob is None:
        return None
    meshes = [ob] if ob.type == 'MESH' else [c for c in ob.children_recursive
                                             if c.type == 'MESH']
    zs = []
    for m in meshes:
        M = (INV_TILT @ m.matrix_world) if board_local else m.matrix_world
        zs.extend((M @ v.co).z for v in m.data.vertices)
    return (min(zs), max(zs)) if zs else None


def switches_z(board_local=True):
    zs = []
    for ob in bpy.data.objects:
        if not ob.name.startswith("KB_Switch_") or ob.type != 'MESH':
            continue
        M = (INV_TILT @ ob.matrix_world) if board_local else ob.matrix_world
        for v in ob.data.vertices:
            zs.append((M @ v.co).z)
    return (min(zs), max(zs)) if zs else None


print("\n" + "═" * 66)
print("SCALE SANITY  (1 unit = 1 cm)")
print("  KEY_UNIT           %.3f cm = %5.2f mm   (MX standard 19.05)" % (KEY_UNIT, KEY_UNIT * 10))
print("  bottom wall face   %.3f → %.3f cm = %5.2f mm tall"
      % (CASE_FLOOR_T, Z_TOP_WALL_BOT, (Z_TOP_WALL_BOT - CASE_FLOOR_T) * 10))
print("  left edge length   %.2f cm = %6.1f mm   (board depth)" % (CASE_D, CASE_D * 10))
print("  long edge length   %.2f cm = %6.1f mm   (board width)" % (CASE_W, CASE_W * 10))
for p in POCKETS:
    print("  pocket %-4s        %5.2f x %4.2f mm   recess %.1f mm"
          % (p['name'], p['len'] * 10, p['ht'] * 10, POCKET_DEPTH * 10))

print("\n" + "═" * 66)
print("DERIVED Z-STACK  (cm, board-local)")
print("  inner floor      %.3f" % Z_INNER_FLOOR)
print("  pcb              %.3f → %.3f" % (Z_PCB_BOT, Z_PCB_TOP))
print("  plate            %.3f → %.3f" % (Z_PLATE_BOT, Z_PLATE_TOP))
print("  switch           %.3f → %.3f   (%.2f mm above plate)"
      % (Z_SWITCH_BOT, Z_SWITCH_TOP, SWITCH_ABOVE_PLATE * 10))
print("  keycap base      %.3f" % Z_KEYCAP_BASE)
print("  keycap tops      %.3f → %.3f   (by row)"
      % (min(z_keycap_top(r) for r in range(ROWS)),
         max(z_keycap_top(r) for r in range(ROWS))))
print("  cap mid-travel   %.3f" % Z_KEYCAP_TOP_MIDTRAV)
print("  CASE RIM         %.3f   (= mid-travel − %.1f mm)"
      % (Z_CASE_RIM, RIM_BELOW_MIDTRAVEL * 10))
print("  case split       %.3f   top wall starts %.3f (%.1f mm overlap)"
      % (Z_CASE_SPLIT, Z_TOP_WALL_BOT, CASE_JOIN_OVERLAP * 10))

print("\nROW WIDTH CHECK   (target %.2fu)" % ROW_TOTAL_U)
ok_layout, total_keys = True, 0
for r, row in enumerate(KEY_LAYOUT):
    w = sum(float(x) for x, _ in row)
    ok = abs(w - ROW_TOTAL_U) < 1e-6
    ok_layout &= ok
    total_keys += len(row)
    print("  row %d: %2d keys  %6.2fu  cap %.2f cm  %s"
          % (r, len(row), w, ROW_CAP_H[r], "OK" if ok else "*** MISMATCH ***"))
print("  total keys %d   switches %d   %s"
      % (total_keys, n_switch, "OK" if total_keys == 84 else "*** expected 84 ***"))

print("\nLAYER Z RANGES   (board-local / world)")
LAYERS = ["KB_Feet", "KB_Case_Bottom", "KB_PCB", "KB_Plate", "KB_Case_Top",
          "KB_SideControls"] + ["KB_Keycaps_Row%d" % r for r in range(ROWS)]
for n in LAYERS:
    l, w = z_range(n), z_range(n, board_local=False)
    if l and w:
        print("  %-18s %6.3f → %6.3f   |  %6.3f → %6.3f" % (n, l[0], l[1], w[0], w[1]))
sw_l, sw_w = switches_z(), switches_z(False)
print("  %-18s %6.3f → %6.3f   |  %6.3f → %6.3f" % ("KB_Switches (84)", sw_l[0], sw_l[1], sw_w[0], sw_w[1]))

print("\nASSERTIONS")
fails = []

# (a) no gap at the case join — checked PER WALL.
#     Measuring the whole object hides a short wall behind the tall ones: v4.0
#     passed this check while the front wall stood 4.5 mm open.
def wall_verts(name, axis, sign):
    """Vertices belonging to one wall, in board-local space."""
    ob = bpy.data.objects[name]
    M = INV_TILT @ ob.matrix_world
    band = WALL * 1.6
    lim = (CASE_W / 2 - band) if axis == 'x' else (CASE_D / 2 - band)
    out = []
    for v in ob.data.vertices:
        p = M @ v.co
        c = p.x if axis == 'x' else p.y
        if (c > lim) if sign > 0 else (c < -lim):
            out.append(p.z)
    return out

for label, axis, sign in (("front", 'y', -1), ("back", 'y', +1),
                          ("left", 'x', -1), ("right", 'x', +1)):
    tub = wall_verts("KB_Case_Bottom", axis, sign)
    skirt = wall_verts("KB_Case_Top", axis, sign)
    if not tub or not skirt:
        continue
    tub_top, skirt_bot = max(tub), min(skirt)
    opening = skirt_bot - tub_top
    if opening > 0:
        fails.append("SEAM OPEN on %s wall: skirt %.3f, tub %.3f (%.2f mm slot)"
                     % (label, skirt_bot, tub_top, opening * 10))
    print("  seam %-6s      skirt_bot %.3f vs tub_top %.3f  ->  %s"
          % (label, skirt_bot, tub_top,
             "FAIL %.2f mm open" % (opening * 10) if opening > 0
             else "sealed, %.1f mm lap" % (-opening * 10)))

# the skirt must also sleeve OUTSIDE the tub, or the lip joint is only vertical
tub_x  = max(abs(v) for v in (BOTTOM_OUTER_W / 2, -BOTTOM_OUTER_W / 2))
skirt_x = CASE_W / 2
if skirt_x <= tub_x:
    fails.append("skirt not outboard of tub: skirt %.3f <= tub %.3f" % (skirt_x, tub_x))
print("  skirt outboard   skirt %.3f vs tub %.3f  ->  %s"
      % (skirt_x, tub_x,
         "FAIL" if skirt_x <= tub_x else "%.1f mm proud" % ((skirt_x - tub_x) * 10)))

# (b) internals must clear the cavity — a plate wider than the cavity is what
#     pushed a gold line through the seam in v3
clear_w = (CAVITY_W - PLATE_W) / 2
clear_d = (CAVITY_D - PLATE_D) / 2
if clear_w <= 0 or clear_d <= 0:
    fails.append("plate exceeds cavity: clearance %.2f / %.2f mm" % (clear_w * 10, clear_d * 10))
print("  plate vs cavity  %.3f wide in %.3f  |  %.3f deep in %.3f  ->  %s"
      % (PLATE_W, CAVITY_W, PLATE_D, CAVITY_D,
         "FAIL" if min(clear_w, clear_d) <= 0
         else "%.1f / %.1f mm clearance" % (clear_w * 10, clear_d * 10)))

# key field must sit on the plate, not hang off it
if KEY_FIELD_W > PLATE_W + 1e-9 or KEY_FIELD_D > PLATE_D + 1e-9:
    fails.append("key field %.3f x %.3f overhangs plate %.3f x %.3f"
                 % (KEY_FIELD_W, KEY_FIELD_D, PLATE_W, PLATE_D))
print("  field vs plate   %.3f x %.3f on %.3f x %.3f  ->  %s"
      % (KEY_FIELD_W, KEY_FIELD_D, PLATE_W, PLATE_D,
         "FAIL overhang" if (KEY_FIELD_W > PLATE_W + 1e-9 or KEY_FIELD_D > PLATE_D + 1e-9)
         else "seated"))

# (b2) the front chamfer must not eat the wall it is cut into
lip_wall = WALL - FRONT_LIP * (1.0 - CASE_FLOOR_T / Z_CASE_SPLIT)
if lip_wall < FRONT_MIN_WALL - 1e-6:
    fails.append("front chamfer leaves %.2f mm of wall at the cavity floor (need %.1f)"
                 % (lip_wall * 10, FRONT_MIN_WALL * 10))
print("  front chamfer    %.1f mm lip, %.1f mm of wall left at the cavity floor  ->  %s"
      % (FRONT_LIP * 10, lip_wall * 10,
         "FAIL breaches the cavity" if lip_wall < FRONT_MIN_WALL - 1e-6 else "solid"))

# (c) port cluster: exactly three pockets, all clear of every wall edge
print("  port cluster     %d pockets, band %.3f..%.3f, seam %.3f"
      % (len(POCKETS), BAND_LO, BAND_HI, Z_TOP_WALL_BOT))
if len(POCKETS) != 3:
    fails.append("expected 3 pockets, built %d" % len(POCKETS))
for p in POCKETS:
    clr = {
        'wall bottom': p['z0'] - CASE_FLOOR_T,
        'seam':        Z_TOP_WALL_BOT - p['z1'],
        'rear corner': _WALL_Y1 - p['y1'],
        'front':       p['y0'] + _WALL_Y1,
    }
    worst = min(clr.values())
    if worst < POCKET_MARGIN - 1e-6:
        fails.append("pocket %s only %.2f mm from %s (need %.1f)"
                     % (p['name'], worst * 10,
                        min(clr, key=clr.get), POCKET_MARGIN * 10))
    ratio_short = p['len'] / CASE_D
    ratio_long  = p['len'] / CASE_W
    print("     %-4s %4.1f x %4.1f mm  y %6.1f..%6.1f mm  z %5.1f..%5.1f mm"
          % (p['name'], p['len'] * 10, p['ht'] * 10,
             p['y0'] * 10, p['y1'] * 10, p['z0'] * 10, p['z1'] * 10))
    print("          clearance %.1f mm (%s)   w/edge  short %.3f  long %.3f  ->  %s"
          % (worst * 10, min(clr, key=clr.get), ratio_short, ratio_long,
             "FAIL" if worst < POCKET_MARGIN - 1e-6 else "ok"))

# (c1) v2: the rounded rear corner must start behind the rearmost pocket, or
#      the USB recess is cut into a curved face
arc_start = BOTTOM_OUTER_D / 2 - (CASE_R - CASE_JOIN_LIP)
rear_pocket = max(p['y1'] for p in POCKETS)
if rear_pocket > arc_start - 1e-6:
    fails.append("rear pocket ends at %.3f, past the corner arc start %.3f"
                 % (rear_pocket, arc_start))
print("  corner arc       starts y %.3f, rear pocket ends %.3f  ->  %s"
      % (arc_start, rear_pocket,
         "FAIL pocket on the curve" if rear_pocket > arc_start - 1e-6
         else "%.1f mm of flat wall behind it" % ((arc_start - rear_pocket) * 10)))

# (c2) the left wall's outer face must be ONE flat plane, broken only by the
#      three openings. Any face pointing -X that is not on that plane is a step,
#      a tray, or a slab — exactly what the reference photos say must not exist.
cb = bpy.data.objects["KB_Case_Bottom"]
Mcb = INV_TILT @ cb.matrix_world
Ncb = Mcb.to_3x3().inverted().transposed()


# A correct wall has exactly TWO depth levels: the outer skin at 0, and the
# backing slab at POCKET_DEPTH showing through the three openings. The backing
# is one long face hidden behind the skin, so it cannot be validated by asking
# whether its centre lies in a window — only its depth matters.
off_plane, on_plane, pocket_floors = [], 0, 0
for f in cb.data.polygons:
    n = (Ncb @ f.normal).normalized()
    if n.x > -0.85:                                # not an outward-left face
        continue
    vs = [Mcb @ cb.data.vertices[i].co for i in f.vertices]
    cx = sum(v.x for v in vs) / len(vs)
    # only the LEFT wall band — the right wall's inner face also points -X
    if not (WALL_OUTER_X - 0.05 <= cx <= WALL_OUTER_X + WALL + 0.05):
        continue
    d = abs(cx - WALL_OUTER_X)
    if d < 0.02:
        on_plane += 1
    elif abs(d - POCKET_DEPTH) < 0.06:
        pocket_floors += 1                         # recess backing: expected
    elif d > BEVEL_WIDTH * 2:                      # ignore chamfer slivers
        off_plane.append(round(d * 10, 2))
if off_plane:
    fails.append("left wall has %d face(s) off the outer plane (mm deep: %s)"
                 % (len(off_plane), sorted(set(off_plane))[:6]))
print("  wall flatness    %d on plane, %d pocket floors, %d stray  ->  %s"
      % (on_plane, pocket_floors, len(off_plane),
         "FAIL extra features %s mm" % sorted(set(off_plane))[:4] if off_plane
         else "single flat plane + %d recesses" % pocket_floors))

# (d) feet must sit flush against the tilted underside, and mirror each other
feet = bpy.data.objects.get("KB_Feet")
if feet:
    pts = [feet.matrix_world @ v.co for v in feet.data.vertices]
    zmax = max(p.z for p in pts)
    tops = [p for p in pts if p.z > zmax - 0.30]
    worst = max(abs((TILT @ Vector((p.x, p.y, 0.0))).z - p.z) for p in tops)
    if worst > 0.005:
        fails.append("foot top stands off the case by %.3f mm" % (worst * 10))
    print("  feet flush       max deviation %.4f mm  ->  %s"
          % (worst * 10, "FAIL" if worst > 0.005 else "flush"))

    left  = sorted(round(-p.x, 4) for p in pts if p.x < 0)
    right = sorted(round(p.x, 4) for p in pts if p.x > 0)
    sym = left == right
    if not sym:
        fails.append("feet are not mirror-symmetric about x=0")
    print("  feet symmetry    %d/%d verts each side  ->  %s"
          % (len(left), len(right), "mirrored" if sym else "FAIL asymmetric"))

# (e) nothing on the side-control cluster may cross the wall's outer plane
sc = bpy.data.objects.get("KB_SideControls")
if sc:
    M = INV_TILT @ sc.matrix_world
    min_x = min((M @ v.co).x for v in sc.data.vertices)
    breach = WALL_OUTER_X - min_x
    if breach > 1e-6:
        fails.append("SideControls protrudes %.2f mm past the wall plane" % (breach * 10))
    print("  side controls    min_x %.3f vs wall plane %.3f  ->  %s"
          % (min_x, WALL_OUTER_X,
             "FAIL protrudes %.2f mm" % (breach * 10) if breach > 1e-6
             else "recessed %.1f mm" % (-breach * 10)))

# (b)/(c) rim must sit BETWEEN every row's cap base and cap top
rim = z_range("KB_Case_Top")[1]
for r in range(ROWS):
    lo, hi = z_range("KB_Keycaps_Row%d" % r)
    swallowed = hi < rim
    floating   = lo > rim
    if swallowed:
        fails.append("Row%d SWALLOWED: cap top %.3f < rim %.3f" % (r, hi, rim))
    if floating:
        fails.append("Row%d FLOATING: cap base %.3f > rim %.3f" % (r, lo, rim))
    print("  Row%d  base %.3f  top %.3f  rim %.3f  ->  %s"
          % (r, lo, hi, rim,
             "FAIL swallowed" if swallowed else
             "FAIL floating"  if floating   else
             "%.1f mm of cap shows" % ((hi - rim) * 10)))

print()
if fails:
    print("  *** %d ASSERTION FAILURE(S) ***" % len(fails))
    for f in fails:
        print("      - " + f)
else:
    print("  all assertions passed")

meshes = [ob.data for ob in bpy.data.objects if ob.name.startswith("KB_") and ob.type == 'MESH']
for me in meshes:
    me.calc_loop_triangles()
print("\n  unique meshes %d   drawn triangles %s"
      % (len({m.name for m in meshes}), format(sum(len(m.loop_triangles) for m in meshes), ",")))
print("  case %.1f x %.1f cm   key unit %.3f cm   typing angle %.1f deg"
      % (CASE_W, CASE_D, KEY_UNIT, TYPING_ANGLE_DEG))

# ══════════════════════════════════════════════════════════════════════
os.makedirs(EXPORT_DIR, exist_ok=True)
out = os.path.join(EXPORT_DIR, EXPORT_NAME)
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.data.objects:
    if ob.name.startswith("KB_"):
        ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_cameras=False,
                          export_lights=False, export_animations=False,
                          export_draco_mesh_compression_enable=False)
print("\n  exported -> %s  (%d KB)" % (out, os.path.getsize(out) // 1024))
print("═" * 66 + "\n")
