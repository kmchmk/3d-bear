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
# A puppy skull is a shallow wedge: a broad brain case and zygomatic arches
# narrow through the maxilla to a small nasal pad.  Keeping the masses distinct
# also gives the brow, stop, and jaw visible planes beneath the coat.
head_volumes=[
 (0,.038,-.067,.182,.176,.158),       # broad but shallow cranial vault
  (0,-.002,.052,.164,.139,.181),        # forehead falling into a short stop
 (0,-.041,.165,.105,.087,.176,.10,0,0), # long, tapering nasal bridge
 (0,-.076,.286,.083,.064,.128,.08,0,0), # muzzle root -- narrower than the skull
 (0,-.083,.373,.060,.044,.070,.04,0,0), # small incisive/nasal end
 (0,-.146,.220,.091,.042,.139),       # clear lower-jaw and chin plane
]
for sign in [-1,1]:
 head_volumes += [
   (sign*.118,-.049,.040,.100,.101,.145), # projected cheek / zygomatic arch
  (sign*.052,-.107,.281,.052,.041,.096), # paired jowls, leaving a mouth crease
   (sign*.103,.072,.088,.055,.030,.070),  # flatter brow, no horn-like knob
 ]
head=smooth_anatomy('Head',head_volumes,[[-.29,-.245,-.30],[.29,.265,.49]],.0047,.042,
  sockets=[(sign*.092,.016,.180,.040,.023,.045,.0,sign*.10,0) for sign in [-1,1]])

# Low recumbent body.  The thorax is deeper than the abdomen, the pelvis is
# narrower than the ribs, and each limb follows a sloped shoulder/elbow axis.
body_volumes=[
 (0,.285,-.155,.268,.169,.438),       # deep rib cage, long and low to the floor
 (0,.220,-.455,.218,.133,.260),       # tucked waist flowing into the pelvis
 (0,.331,.038,.236,.163,.255,-.18,0,0), # sternum tapering down between forelegs
 (0,.505,.100,.153,.174,.164,-.38,0,0), # compact, sloping neck
 (0,.183,-.228,.205,.097,.285),       # narrow belly clearance, not a round barrel
]
for sign in [-1,1]:
 body_volumes += [
  (sign*.180,.285,.060,.080,.142,.093,.12,0,sign*.035), # upper foreleg
  (sign*.155,.145,.170,.067,.082,.100,.12,0,sign*.02),  # planted elbow
  (sign*.138,.082,.330,.060,.047,.185),                  # forearm on floor
  (sign*.132,.062,.445,.060,.050,.082),                  # wrist into paw
  (sign*.228,.315,-.060,.102,.118,.127,.08,0,sign*.06), # scapular muscle
 ]
# Asymmetric recumbent hindquarters: the camera-side thigh opens outward while
# the far leg remains mostly tucked under the abdomen.
body_volumes += [
 (.245,.205,-.355,.157,.140,.222,.10,0,.10),
 (.310,.090,-.205,.080,.065,.155,-.15,0,.16),
 (-.178,.190,-.385,.125,.118,.190,.04,0,-.05),
 (-.125,.075,-.300,.064,.052,.125,-.10,0,-.10),
]
# The pelvis reaches z=-.715 and the blend radius extends past the raw
# extents, so the sample box keeps a margin on every side; an isosurface at
# a grid edge becomes an open, clipped mesh.
body=smooth_anatomy('Body',body_volumes,[[-.43,-.03,-.81],[.46,.74,.60]],.0065,.046)
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
    _living_surface(ob, .005 if ob == head else .007)
    bpy.context.view_layer.objects.active=ob
    dec=ob.modifiers.new('Browser surface budget','DECIMATE');dec.ratio=.065 if ob==head else .060
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for poly in ob.data.polygons:poly.use_smooth=True

out={}
for ob in [head,body]:
    ob.data.calc_loop_triangles()
    out[ob.name.lower()]={
      'positions':[round(c,5) for v in ob.data.vertices for c in v.co],
      'indices':[i for tri in ob.data.loop_triangles for i in tri.vertices],
    }
    print(ob.name, len(ob.data.vertices),'vertices',len(ob.data.loop_triangles),'triangles')
(ROOT/'src'/'sculpted-meshes.json').write_text(json.dumps(out,separators=(',',':')))
# Keep an editable local sculpt without including Blender files in the website.
(ROOT/'.review').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'.review'/'bear-sculpt.blend'))
