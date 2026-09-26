"""Rebuild Bear's browser mesh using Blender; no photographs are embedded.
Run: Blender --background --factory-startup --python scripts/sculpt_bear.py
Exports geometry-only JSON plus an ignored editable .blend for local inspection.
Coordinates intentionally match Three.js: Y up, Z forward.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

import sys
sys.path.insert(0,str(ROOT/'scripts'))
from implicit_surface import smooth_anatomy
# A puppy skull is a narrow wedge: a slim flat-topped brain case and shallow
# zygomatic arches taper through the maxilla to a small nasal pad. Keeping the
# masses distinct also gives the brow, stop, and jaw visible planes beneath
# the coat. Cheek width comes from FUR (groomed ruff), not bone.
head_volumes=[
 (0,.017,-.070,.150,.132,.152),
 (0,.005,.024,.142,.121,.146),
 (0,-.046,.113,.098,.077,.141,-.13,0,0),
 (0,-.093,.209,.072,.048,.093,-.08,0,0),
 (0,-.103,.261,.054,.036,.060),
]
for sign in [-1,1]:
 head_volumes += [
  (sign*.097,-.039,.001,.052,.071,.096),
  (sign*.041,-.109,.225,.041,.035,.067),
  (sign*.095,.062,.051,.044,.023,.071),
 ]
head=smooth_anatomy('Head',head_volumes,[[-.27,-.22,-.29],[.27,.25,.38]],.004,.035,
 sockets=[(sign*.099,.031,.147,.044,.031,.078,0,sign*.17,0) for sign in [-1,1]])

# Recumbent skeleton: the sternum and elbows rest on the floor. The
# scapula slopes into the ribs; the forearms extend ahead of the chest.
body_volumes=[
 (0,.222,-.170,.220,.173,.365),
 (0,.183,-.440,.185,.138,.239),
 (0,.180,-.650,.177,.127,.165),
 (0,.230,.044,.182,.173,.200,-.20,0,0),
 (0,.395,.083,.135,.173,.141,-.28,0,0),
 (0,.130,-.210,.165,.112,.30),
]
for sign in [-1,1]:
 body_volumes += [
  (sign*.149,.191,.105,.064,.125,.108,.36,0,sign*.08),
  (sign*.158,.081,.185,.057,.063,.086),
  (sign*.150,.063,.337,.046,.041,.169,-.025,0,sign*.045),
  (sign*.146,.055,.470,.048,.042,.072),
  (sign*.178,.226,-.062,.065,.111,.166,-.35,0,sign*.06),
 ]
body_volumes += [
 (.193,.161,-.461,.119,.135,.209,.11,0,.15),
 (.273,.076,-.351,.070,.059,.138,-.18,.34,.14),
 (-.161,.138,-.558,.096,.105,.177,.03,0,-.04),
 (-.152,.056,-.447,.051,.043,.107),
]
body=smooth_anatomy('Body',body_volumes,[[-.42,-.08,-.91],[.46,.66,.62]],.006,.038)
# Vertex counts are limited before export; fur is generated at runtime per device.
import numpy as _np
def _living_surface(ob, amp):
    mesh = ob.data
    mesh.update()
    n = len(mesh.vertices)
    co = _np.empty(n * 3)
    mesh.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    try:
        no = _np.empty(n * 3)
        mesh.vertices.foreach_get('normal', no)
        no = no.reshape(-1, 3)
        lengths = _np.linalg.norm(no, axis=1)
        no[lengths > 1e-9] /= lengths[lengths > 1e-9, None]
        no[lengths <= 1e-9] = (0, 1, 0)
    except Exception:
        center = (co.min(axis=0) + co.max(axis=0)) / 2
        no = co - center
        no /= _np.maximum(_np.linalg.norm(no, axis=1, keepdims=True), 1e-9)
    rng = _np.random.default_rng(11 if ob == head else 23)
    phases = rng.uniform(0, 2 * _np.pi, (3, 3))
    disp = _np.zeros(n)
    for (freq, a, ph) in ((8.0, .55, phases[0]), (21.0, .25, phases[1]), (52.0, .11, phases[2])):
        disp += a * _np.sin(co[:, 0] * freq + ph[0]) * _np.sin(co[:, 1] * freq * 1.31 + ph[1]) * _np.sin(co[:, 2] * freq * .73 + ph[2])
    # Gentle left/right asymmetry so the animal is not a mirrored toy.
    disp += .38 * _np.sin(co[:, 1] * 6.5 + 1.0) * _np.tanh(co[:, 0] * 7.0)
    co += no * (disp * amp)[:, None]
    mesh.vertices.foreach_set('co', co.ravel())
    mesh.update()
for ob in [head,body]:
    _living_surface(ob, .0018 if ob == head else .003)
    bpy.context.view_layer.objects.active=ob
    dec=ob.modifiers.new('Browser surface budget','DECIMATE');dec.ratio=.065 if ob==head else .060
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in ob.data.polygons:poly.use_smooth=True

from export_meshes import export_scene
export_scene(ROOT)
