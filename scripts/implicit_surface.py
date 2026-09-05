"""Smooth implicit anatomical volumes sampled into a Blender mesh."""
import numpy as np
import bpy

def smooth_anatomy(name, volumes, bounds, step=.007, blend=.055, sockets=()):
    lo=np.array(bounds[0]);hi=np.array(bounds[1])
    axes=[np.arange(lo[i],hi[i]+step,step) for i in range(3)]
    x,y,z=np.meshgrid(*axes,indexing='ij')
    def ellipsoid(v):
        cx,cy,cz,rx,ry,rz=v
        a=(x-cx)/rx;b=(y-cy)/ry;c=(z-cz)/rz
        k0=np.sqrt(a*a+b*b+c*c)
        k1=np.sqrt(a*a/rx**2+b*b/ry**2+c*c/rz**2)
        return k0*(k0-1)/np.maximum(k1,1e-8)
    field=np.full(x.shape,10.)
    for volume in volumes:
        d=ellipsoid(volume)
        h=np.maximum(blend-np.abs(field-d),0)/blend
        field=np.minimum(field,d)-h*h*blend*.25
    for volume in sockets:
        field=np.maximum(field,-ellipsoid(volume))
    offsets=np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])
    values=np.stack([field[a:a+field.shape[0]-1,b:b+field.shape[1]-1,c:c+field.shape[2]-1] for a,b,c in offsets],axis=-1)
    cells=np.argwhere((values.min(axis=-1)<0)&(values.max(axis=-1)>=0))
    tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]
    edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
    vertices=[];faces=[]
    for cell in cells:
        val=values[tuple(cell)]
        pos=lo+(cell+offsets)*step
        for tet in tetrahedra:
            pts=[]
            for i,j in edges:
                a=tet[i];b=tet[j]
                if (val[a]<0)==(val[b]<0):continue
                t=val[a]/(val[a]-val[b]);pts.append(pos[a]+(pos[b]-pos[a])*t)
            if len(pts)<3:continue
            # The gradient of linear tetrahedral interpolation gives outward winding.
            tp=pos[tet];tv=val[tet]
            grad=np.linalg.solve(tp[1:]-tp[0],tv[1:]-tv[0]);grad/=np.linalg.norm(grad)
            center=np.mean(pts,axis=0);u=pts[0]-center;u/=max(np.linalg.norm(u),1e-10);v=np.cross(grad,u)
            pts.sort(key=lambda p:np.arctan2(np.dot(p-center,v),np.dot(p-center,u)))
            start=len(vertices);vertices.extend([p.tolist() for p in pts])
            for i in range(1,len(pts)-1):faces.append((start,start+i,start+i+1))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    return ob
