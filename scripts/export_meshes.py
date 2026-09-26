"""Export the browser surfaces after welding tiny decimation slivers."""
import bpy, json

def export_scene(root):
    output={}
    for name in ('Head','Body'):
        ob=bpy.data.objects[name]
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); bpy.context.view_layer.objects.active=ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=.00005)
        bpy.ops.mesh.dissolve_degenerate(threshold=.000001)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        ob.data.calc_loop_triangles()
        output[name.lower()]={
            'positions':[round(c,6) for v in ob.data.vertices for c in v.co],
            'indices':[i for t in ob.data.loop_triangles if len(set(t.vertices))==3 for i in t.vertices],
        }
    (root/'src'/'sculpted-meshes.json').write_text(json.dumps(output,separators=(',',':')))
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'.review'/'bear-sculpt.blend'))
