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
 (0,.032,-.060,.176,.181,.154),       # compact cranial vault
 (0,-.010,.050,.156,.145,.169),       # frontal wedge / short stop
 (0,-.045,.157,.101,.097,.151,.10,0,0), # bridge and maxilla
 (0,-.078,.270,.080,.066,.116,.08,0,0), # tapered muzzle base
 (0,-.084,.354,.057,.044,.064,.04,0,0), # incisive end
 (0,-.139,.190,.085,.047,.128),       # slim mandible and chin plane
]
for sign in [-1,1]:
 head_volumes += [
  (sign*.105,-.048,.034,.092,.107,.137), # cheek / zygomatic arch
  (sign*.049,-.103,.267,.051,.046,.088), # paired jowls
  (sign*.102,.083,.088,.057,.040,.073),  # brow ridge
 ]
head=smooth_anatomy('Head',head_volumes,[[-.28,-.245,-.25],[.28,.265,.415]],.0047,.042,
 sockets=[(sign*.103,.029,.159,.039,.027,.043,.0,sign*.10,0) for sign in [-1,1]])

# Low recumbent body.  The thorax is deeper than the abdomen, the pelvis is
# narrower than the ribs, and each limb follows a sloped shoulder/elbow axis.
body_volumes=[
 (0,.275,-.165,.265,.174,.425),       # long rib cage resting low
 (0,.225,-.440,.216,.139,.245),       # tucked abdomen / pelvis
 (0,.320,.035,.230,.166,.250,-.18,0,0), # low sternum and chest
 (0,.505,.105,.151,.176,.160,-.38,0,0), # compact sloping neck
 (0,.190,-.225,.205,.105,.275),       # belly near the floor
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
body=smooth_anatomy('Body',body_volumes,[[-.43,.005,-.62],[.46,.74,.53]],.0065,.046)
# Vertex counts are limited before export; fur is generated at runtime per device.
for ob in [head,body]:
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
