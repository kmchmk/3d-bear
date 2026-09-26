import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP, NOSE_BUMP } from './textures.js'
import meshUrl from './sculpted-meshes.json?url'

const response = await fetch(meshUrl)
if (!response.ok) throw new Error(`Model download failed: ${response.status}`)
const source = await response.json()
const smooth = THREE.MathUtils.smoothstep
const C = Object.fromEntries(Object.entries({
  sable:'#a5794c',gold:'#b38a5d',light:'#c2a078',cream:'#d8c9ad',white:'#e5dbc6',
  mask:'#514235',dark:'#715036',nose:'#34251e',lip:'#2c211e',skin:'#9d7d6d',tongue:'#b7767d'
}).map(([key,value])=>[key,new THREE.Color(value)]))
const solid=color=>(p,c)=>c.copy(color)
const g=(x,y,sx,sy)=>Math.exp(-2*(x*x/(sx*sx)+y*y/(sy*sy)))
function sculpt(name){
  const data=source[name],geo=new THREE.BufferGeometry()
  geo.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3))
  geo.setIndex(data.indices);geo.computeVertexNormals();return geo
}
function ellipsoid(x,y,z){return new THREE.SphereGeometry(1,40,28).scale(x,y,z)}
function add(geo,material,position,parent){
  const mesh=new THREE.Mesh(geo,material);mesh.position.set(...position)
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
function line(points,radius,material,parent){
  return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,radius,5,false),material,[0,0,0],parent)
}

export function buildPuppy({quality=1}={}){
  const group=new THREE.Group(),rig={eyes:[],ears:[]};let seed=73
  const fur=(geo,options,parent,position=[0,0,0])=>{
    const part=makeFurPart(geo,{...options,count:Math.round((options.count||10000)*quality),seed:seed++})
    part.position.set(...position);parent.add(part);return part
  }
  const bodyColor=(p,c)=>{
    const chest=smooth(p.z,-.04,.17)*smooth(p.y,.14,.31)*(1-smooth(Math.abs(p.x),.06,.22))
    const belly=(1-smooth(p.y,.06,.19))*.42
    c.copy(C.sable).lerp(C.cream,Math.max(chest*.92,belly))
    c.lerp(C.gold,smooth(p.y,.23,.45)*.32*(1-chest))
    const sock=(1-smooth(p.y,.042,.12))*smooth(p.z,.39,.49)
    c.lerp(C.white,sock)
  }
  const body=fur(sculpt('body'),{
    count:200000,length:.055,width:.00145,lift:1.05,frizz:.07,colorAt:bodyColor,
    lengthAt:p=>.52+smooth(p.y,.12,.37)*.60+g(p.x,p.y-.46,.20,.18)*smooth(p.z,-.02,.10)*.8,
    groom:(p,n,t)=>{
      const neck=smooth(p.y,.31,.48)
      t.set(p.x*.75,-.30-neck*.85,-.95+neck*1.05)
      if(p.y<.13&&p.z>.18)t.set(p.x*.16,-.35,1)
    },
    tipAt:(p,c,guard)=>{c.copy(guard?C.light:C.dark);return smooth(p.y,.25,.42)*(guard?.24:.18)}
  },group)
  rig.breath={value:0}
  for(const child of body.children){
    const previous=child.material.onBeforeCompile
    child.material.onBeforeCompile=shader=>{
      previous.call(child.material,shader)
      shader.uniforms.breath=rig.breath
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float breath;')
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          float chestWeight=smoothstep(.10,.24,position.y)*(1.-smoothstep(.40,.56,position.y));
          transformed.x*=1.+breath*.006*chestWeight;
          transformed.y+=breath*.0016*chestWeight;`)
    }
  }
  // Compact metacarpus with small overlapping digits, each planted at floor level.
  const clawMat=new THREE.MeshStandardMaterial({color:'#655b4b',roughness:.60})
  function paw(x,z,scale,yaw){
    const part=new THREE.Group();part.position.set(x,.039,z);part.rotation.y=yaw;part.scale.setScalar(scale);group.add(part)
    fur(ellipsoid(.055,.034,.087),{count:3500,length:.014,width:.00065,colorAt:solid(C.white),groom:[0,-.3,1]},part)
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.026,z=.057+(i===1||i===2?.013:0)
      fur(ellipsoid(.019,.022,.035),{count:430,length:.010,width:.0005,colorAt:solid(C.white),groom:[0,-.2,1]},part,[x,-.009,z])
      const claw=add(new THREE.ConeGeometry(.0024,.009,8),clawMat,[x,-.014,z+.034],part);claw.rotation.x=Math.PI/2+.18
    }
  }
  paw(-.145,.515,.97,-.06);paw(.15,.55,1,.07)
  paw(.294,-.255,.78,-.34);paw(-.15,-.355,.62,.16)

  const head=new THREE.Group();head.position.set(-.007,.587,.115);group.add(head);rig.head=head
  const headColor=(p,c)=>{
    const cheeks=smooth(Math.abs(p.x),.112,.172)*(1-smooth(p.y,-.025,.065))*smooth(p.z,-.18,-.015)
    c.copy(C.gold).lerp(C.cream,cheeks*.86)
    const muzzle=smooth(p.z,.06,.22)*(1-smooth(Math.abs(p.x),.075,.12)*.45)
    const bridge=g(p.x,p.y+.002,.09,.15)*smooth(p.z,.015,.105)
    const sockets=g(Math.abs(p.x)-.099,p.y-.031,.062,.047)*smooth(p.z,.065,.12)
    c.lerp(C.mask,Math.max(muzzle*.90,bridge*.82,sockets*.94))
    c.lerp(C.light,g(Math.abs(p.x)-.102,p.y-.081,.040,.027)*smooth(p.z,.01,.09)*.55)
    c.lerp(C.cream,(1-smooth(p.y,-.15,-.115))*smooth(p.z,.01,.12)*.4)
  }
  const headGeo=sculpt('head')
  fur(headGeo,{
    count:140000,length:.032,width:.00105,lift:1,frizz:.065,colorAt:headColor,
    lengthAt:p=>{
      const socket=g(Math.abs(p.x)-.099,p.y-.031,.055,.040)*smooth(p.z,.085,.13)
      const cheek=smooth(Math.abs(p.x),.09,.16)*(1-smooth(p.y,-.015,.07))
      return (.25+(1-smooth(p.z,.065,.23))*.6+cheek*1.4)*(1-smooth(socket,.22,.5))+.035
    },
    groom:(p,n,t)=>{
      const muzzle=smooth(p.z,.08,.22)
      t.set(p.x*4,-.22-smooth(-p.y,0,.12)*.4,-.7+muzzle*1.65)
    }
  },head)

  // Actual cupped pinnae. Front and rear have opposite winding, with a
  // continuous rim and distinct short concha and longer edge furnishings.
  for(const s of [-1,1]){
    const ear=new THREE.Group();ear.position.set(s*.116,.120,-.049);ear.rotation.set(-.10,0,-s*.11);head.add(ear)
    const rows=32,cols=24,pos=[],idx=[]
    for(let j=0;j<=rows;j++){
      const t=j/rows,half=(.060+.024*Math.sin(Math.PI*t))*Math.pow(1-t,.72)+.001
      for(let i=0;i<=cols;i++){
        const u=i/cols*2-1
        pos.push(u*half+s*.017*t*t,.234*t,-.038*Math.sin(Math.PI*t)*(1-u*u)-.025*t*t+.012*u*u)
        if(j<rows&&i<cols){const k=j*(cols+1)+i;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1)}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals()
    const earColor=(p,c)=>{
      const t=p.y/.234,half=(.060+.024*Math.sin(Math.PI*t))*Math.pow(Math.max(0,1-t),.72)+.001
      const edge=smooth(Math.abs(p.x-s*.017*t*t)/half,.28,.82)
      const concha=(1-edge)*smooth(t,.09,.27)*(1-smooth(t,.65,.87))
      c.copy(C.light).lerp(C.skin,concha*.65).lerp(C.cream,edge*.82)
    }
    const front=fur(geo,{count:10500,length:.024,width:.00065,colorAt:earColor,lengthAt:p=>.18+smooth(Math.abs(p.x),.012,.048)*1.4,groom:[s*.1,1,.1]},ear)
    front.children[0].material.side=THREE.DoubleSide
    const back=geo.clone();back.translate(0,0,-.007)
    const indices=back.index.array;for(let i=0;i<indices.length;i+=3){const a=indices[i];indices[i]=indices[i+1];indices[i+1]=a}back.computeVertexNormals()
    fur(back,{count:6500,length:.023,width:.00065,colorAt:solid(C.gold),groom:[0,1,-.3]},ear)
    rig.ears.push({group:ear,baseZ:ear.rotation.z,baseX:ear.rotation.x})
  }

  // The eyelid's outside edge is fitted to the actual sculpt, not another
  // floating ellipse. This makes sockets, skin and fur meet from every angle.
  const surface=new THREE.Mesh(headGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))
  surface.updateMatrixWorld(true)
  const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3(0,0,-1)
  const lidRigs=[]
  for(const s of [-1,1]){
    const eye=new THREE.Group();eye.position.set(s*.099,.031,.117);eye.rotation.y=s*.33;head.add(eye)
    const outline=a=>{
      const x=Math.cos(a)*.0315,y=Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),1.18)*.019+s*Math.cos(a)*.001
      return [x,y]
    }
    const seg=56,rings=10,pos=[],uv=[],ind=[]
    for(let j=0;j<=rings;j++)for(let i=0;i<=seg;i++){
      const r=j/rings,a=i/seg*Math.PI*2,[x,y]=outline(a)
      pos.push(x*r,y*r,.018+.008*(1-r*r));uv.push(.5+x*r/.067,.5+y*r/.067)
      if(j<rings&&i<seg){const k=j*(seg+1)+i;ind.push(k,k+seg+1,k+1,k+1,k+seg+1,k+seg+2)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ind);geo.computeVertexNormals()
    const globe=add(geo,new THREE.MeshPhysicalMaterial({map:IRIS_MAP,roughness:.26,ior:1.38,specularIntensity:.35,clearcoat:.25,clearcoatRoughness:.09,envMapIntensity:.12}),[0,0,0],eye)
    globe.castShadow=false;rig.eyes.push(globe)
    const lidPos=[],lidIndices=[],rest=[],weights=[]
    for(let j=0;j<=7;j++)for(let i=0;i<=seg;i++){
      const t=j/7,a=i/seg*Math.PI*2,[x,y]=outline(a)
      const ox=x*1.43,oy=y*1.7
      origin.set(eye.position.x+ox,eye.position.y+oy,1)
      ray.set(origin,direction)
      const hit=ray.intersectObject(surface)[0]
      const outerZ=hit?hit.point.z-eye.position.z+.001:-.024
      const u=t*t*(3-2*t)
      lidPos.push(THREE.MathUtils.lerp(x,ox,t),THREE.MathUtils.lerp(y,oy,t),THREE.MathUtils.lerp(.019,outerZ,u))
      rest.push(lidPos[lidPos.length-2]);weights.push(1-u)
      if(j<7&&i<seg){const k=j*(seg+1)+i;lidIndices.push(k,k+seg+1,k+1,k+1,k+seg+1,k+seg+2)}
    }
    const lidGeo=new THREE.BufferGeometry();lidGeo.setAttribute('position',new THREE.Float32BufferAttribute(lidPos,3));lidGeo.setIndex(lidIndices);lidGeo.computeVertexNormals()
    const lids=fur(lidGeo,{count:2300,length:.0045,width:.0004,lift:.5,
      colorAt:(p,c)=>{
        const r=Math.sqrt((p.x/.0315)**2+(p.y/.019)**2)
        const hp=new THREE.Vector3(p.x+eye.position.x,p.y+eye.position.y,p.z+eye.position.z)
        headColor(hp,c);c.lerp(C.lip,1-smooth(r,1.015,1.22))
      },lengthAt:p=>smooth(Math.sqrt((p.x/.0315)**2+(p.y/.019)**2),1.08,1.4),groom:[s*.8,.2,-.1]},eye)
    lids.children[0].material.side=THREE.DoubleSide
    lidRigs.push({geo:lidGeo,rest,weights,hair:lids.children[1]})
  }
  rig.setBlink=closure=>{
    for(const eye of rig.eyes)eye.scale.y=Math.max(.015,1-closure)
    for(const lid of lidRigs){
      lid.hair.visible=closure<.08
      const p=lid.geo.attributes.position
      for(let i=0;i<p.count;i++)p.setY(i,lid.rest[i]*(1-closure*lid.weights[i]))
      p.needsUpdate=true;lid.geo.computeVertexNormals()
    }
  }

  const noseMat=new THREE.MeshPhysicalMaterial({color:C.nose,roughness:.43,clearcoat:.18,clearcoatRoughness:.3,bumpMap:NOSE_BUMP,bumpScale:.0007})
  const nose=ellipsoid(.046,.029,.024),np=nose.attributes.position
  for(let i=0;i<np.count;i++){
    const y=np.getY(i),x=np.getX(i)
    np.setX(i,x*(y<0?.74+.26*smooth(y,-.029,0):1))
    np.setZ(i,np.getZ(i)-.002*Math.exp(-x*x/.000025))
  }
  nose.computeVertexNormals();add(nose,noseMat,[0,-.102,.309],head)
  const nostrilMat=new THREE.MeshStandardMaterial({color:'#160f0d',roughness:.85})
  for(const s of [-1,1]){
    const n=add(ellipsoid(.011,.0048,.003),nostrilMat,[s*.027,-.102,.328],head);n.rotation.z=s*.40
    line([[s*.018,-.095,.328],[s*.028,-.095,.330],[s*.037,-.101,.322]],.0015,noseMat,head)
  }
  line([[0,-.103,.333],[0,-.122,.326],[0,-.139,.297]],.00075,nostrilMat,head)
  const lipMat=new THREE.MeshStandardMaterial({color:C.lip,roughness:.7})
  for(const s of [-1,1])line([[0,-.135,.304],[s*.040,-.141,.274],[s*.069,-.143,.199],[s*.080,-.115,.129]],.0018,lipMat,head)
  const jaw=new THREE.Group();jaw.position.set(0,-.113,.085);head.add(jaw);rig.jaw=jaw
  fur(ellipsoid(.051,.015,.094),{count:3300,length:.006,width:.0005,colorAt:solid(C.mask),groom:[0,-.3,1]},jaw,[0,-.032,.115])
  add(ellipsoid(.051,.007,.092),new THREE.MeshStandardMaterial({color:'#271619',roughness:.85}),[0,-.021,.115],jaw)
  const tongue=new THREE.Group();tongue.position.set(0,-.015,.176);jaw.add(tongue);rig.tongue=tongue
  const tongueGeo=ellipsoid(.027,.006,.031)
  const tp=tongueGeo.attributes.position;for(let i=0;i<tp.count;i++){const z=tp.getZ(i);tp.setY(i,tp.getY(i)-smooth(z,-.005,.031)*.008)}tongueGeo.computeVertexNormals()
  add(tongueGeo,new THREE.MeshPhysicalMaterial({color:C.tongue,roughness:.48,clearcoat:.25}),[0,0,0],tongue)
  const whiskerMat=new THREE.MeshStandardMaterial({color:'#baae94',roughness:.6,transparent:true,opacity:.42})
  for(const s of [-1,1])for(let i=0;i<5;i++){
    const y=-.112+(i%3)*.011,z=.21+i*.010
    line([[s*.064,y,z],[s*(.102+(i%2)*.008),y+.004,z+.009],[s*(.146+(i%3)*.013),y-.009-i*.004,z-.021]],.00016,whiskerMat,head)
  }

  const tail=new THREE.Group();tail.position.set(.065,.18,-.695);group.add(tail);rig.tail=tail
  const tailCurve=new THREE.CatmullRomCurve3([[0,0,0],[.15,-.085,-.10],[.34,-.09,-.14],[.49,-.04,-.08],[.55,.05,.01]].map(p=>new THREE.Vector3(...p)))
  const tailGeo=new THREE.TubeGeometry(tailCurve,56,.038,16,false)
  fur(tailGeo,{count:35000,length:.068,width:.00085,lift:1.2,frizz:.10,
    colorAt:(p,c)=>{c.copy(C.sable).lerp(C.cream,Math.max((1-smooth(p.y,-.07,-.03))*.65,smooth(p.x,.42,.57)*.78))},
    lengthAt:p=>.8+Math.sin(smooth(p.x,0,.55)*Math.PI)*.6,groom:[.75,-.1,.2]},tail)
  fur(ellipsoid(.028,.028,.028),{count:2400,length:.04,width:.0007,colorAt:solid(C.cream),groom:[.3,.8,.1]},tail,[.55,.05,.01])
  const collar=new THREE.Group();collar.position.set(0,.509,.105);group.add(collar);rig.collar=collar
  const strap=add(new THREE.TorusGeometry(.136,.0055,8,64),new THREE.MeshStandardMaterial({color:'#75695a',roughness:.95}),[0,0,0],collar);strap.rotation.x=Math.PI/2
  const pendant=new THREE.Group();pendant.position.set(0,-.023,.145);collar.add(pendant);rig.pendant=pendant
  add(new THREE.TorusGeometry(.009,.0015,8,20),new THREE.MeshStandardMaterial({color:'#b6b1a3',metalness:.8,roughness:.3}),[0,0,0],pendant)
  const tag=add(ellipsoid(.016,.036,.006),new THREE.MeshStandardMaterial({color:'#9aafbc',roughness:.45,metalness:.1}),[.007,-.041,0],pendant);tag.rotation.z=.12
  add(ellipsoid(.014,.016,.014),new THREE.MeshStandardMaterial({color:'#74334a',metalness:.65,roughness:.32}),[-.019,-.022,.003],pendant)
  return {group,rig}
}
