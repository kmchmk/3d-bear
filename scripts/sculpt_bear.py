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
head_volumes=[
 (0,.02,-.045,.231,.24,.203),
 (0,-.082,-.079,.182,.15,.167),
 (0,-.035,.144,.116,.113,.174),
 (0,-.092,.259,.121,.073,.133),
 (0,-.086,.352,.077,.046,.066),
]
for sign in [-1,1]:
 head_volumes += [
  (sign*.146,-.072,.004,.113,.126,.154),
  (sign*.050,-.11,.30,.072,.049,.078),
  (sign*.137,.10,.115,.071,.043,.065),
 ]
head=smooth_anatomy('Head',head_volumes,[[-.32,-.27,-.29],[.32,.30,.44]],.005,.085,
 sockets=[(sign*.149,.064,.184,.046,.032,.047) for sign in [-1,1]])
body_volumes=[
 (0,.459,-.155,.258,.339,.297),
 (0,.693,.008,.224,.25,.202),
 (0,.865,.019,.163,.190,.165),
 (0,.568,.109,.163,.222,.146),
]
for sign in [-1,1]:
 body_volumes += [
  (sign*.22,.238,-.205,.152,.217,.204),
  (sign*.278,.104,-.118,.074,.081,.13),
  (sign*.151,.453,.146,.072,.187,.080),
  (sign*.156,.250,.192,.054,.195,.057),
  (sign*.157,.086,.205,.058,.059,.065),
 ]
body=smooth_anatomy('Body',body_volumes,[[-.44,.015,-.52],[.44,1.09,.34]],.007,.062)
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
