import * as THREE from 'three'

// Smooth union of anatomical volumes. Marching tetrahedra makes one closed skin
// instead of overlapping ellipsoids with visible seams through the fur.
export function createBodyGeometry() {
  const volumes = [
    [0,.48,-.13,.276,.414,.32],
    [0,.79,.065,.252,.35,.222],
    [0,1.012,.035,.193,.225,.177],
    ...[-1,1].flatMap(s => [
      [s*.217,.246,-.145,.151,.225,.222],
      [s*.145,.53,.181,.088,.195,.101],
      [s*.16,.294,.233,.062,.252,.070],
    ])
  ]
  function field(x,y,z) {
    let distance=10
    for (const [cx,cy,cz,rx,ry,rz] of volumes) {
      const a=(x-cx)/rx,b=(y-cy)/ry,c=(z-cz)/rz
      const k0=Math.sqrt(a*a+b*b+c*c)
      const k1=Math.sqrt(a*a/(rx*rx)+b*b/(ry*ry)+c*c/(rz*rz))
      const d=k0*(k0-1)/Math.max(.00001,k1)
      const h=Math.max(.055-Math.abs(distance-d),0)/.055
      distance=Math.min(distance,d)-h*h*.055*.25
    }
    return distance
  }
  const nx=56,ny=84,nz=56
  const origin=[-.52,-.025,-.57],step=[1.04/nx,1.32/ny,1.1/nz]
  const index=(x,y,z)=>(x*(ny+1)+y)*(nz+1)+z
  const values=new Float32Array((nx+1)*(ny+1)*(nz+1))
  for(let x=0;x<=nx;x++)for(let y=0;y<=ny;y++)for(let z=0;z<=nz;z++) values[index(x,y,z)]=field(origin[0]+x*step[0],origin[1]+y*step[1],origin[2]+z*step[2])
  const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
  const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]
  const edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
  const vertices=[],normals=[]
  const normal=p=>{
    const e=.001, n=new THREE.Vector3(field(p[0]+e,p[1],p[2])-field(p[0]-e,p[1],p[2]),field(p[0],p[1]+e,p[2])-field(p[0],p[1]-e,p[2]),field(p[0],p[1],p[2]+e)-field(p[0],p[1],p[2]-e))
    return n.normalize()
  }
  function triangle(a,b,c) {
    const na=normal(a),nb=normal(b),nc=normal(c)
    const cross=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a)))
    if(cross.dot(na)<0){[b,c]=[c,b];vertices.push(...a,...b,...c);normals.push(...na.toArray(),...nc.toArray(),...nb.toArray())}
    else{vertices.push(...a,...b,...c);normals.push(...na.toArray(),...nb.toArray(),...nc.toArray())}
  }
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++){
    const val=corners.map(([a,b,c])=>values[index(x+a,y+b,z+c)])
    if(val.every(v=>v>=0)||val.every(v=>v<0))continue
    const pos=corners.map(([a,b,c])=>[origin[0]+(x+a)*step[0],origin[1]+(y+b)*step[1],origin[2]+(z+c)*step[2]])
    for(const tet of tetrahedra){
      const crossings=[]
      for(const [i,j] of edges){
        const a=tet[i],b=tet[j]
        if((val[a]<0)===(val[b]<0))continue
        const t=val[a]/(val[a]-val[b]);crossings.push(pos[a].map((v,k)=>v+(pos[b][k]-v)*t))
      }
      if(crossings.length===3)triangle(...crossings)
      if(crossings.length===4){
        const center=crossings.reduce((a,p)=>a.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(.25)
        const n=normal(center.toArray()),u=new THREE.Vector3(...crossings[0]).sub(center).normalize(),v=new THREE.Vector3().crossVectors(n,u)
        crossings.sort((a,b)=>{
          const ap=new THREE.Vector3(...a).sub(center),bp=new THREE.Vector3(...b).sub(center)
          return Math.atan2(ap.dot(v),ap.dot(u))-Math.atan2(bp.dot(v),bp.dot(u))
        })
        triangle(crossings[0],crossings[1],crossings[2]);triangle(crossings[0],crossings[2],crossings[3])
      }
    }
  }
  const geo=new THREE.BufferGeometry()
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3))
  return geo
}
