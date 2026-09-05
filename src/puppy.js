import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP, NOSE_BUMP } from './textures.js'
import meshUrl from './sculpted-meshes.json?url'

const meshResponse = await fetch(meshUrl)
if (!meshResponse.ok) throw new Error(`Model download failed: ${meshResponse.status}`)
const sculptedMeshes = await meshResponse.json()

const C = Object.fromEntries(Object.entries({
  gold: '#b77c3f', light: '#d0a06b', dark: '#8b552c', cream: '#e8d5b8',
  white: '#eee4d0', mask: '#49382e', muzzle: '#644330', nose: '#281c19',
  skin: '#ad7974', lip: '#3b2525', tongue: '#cb7380', strap: '#5a5650'
}).map(([key, value]) => [key, new THREE.Color(value)]))
const smooth = THREE.MathUtils.smoothstep
const gaussian = (x, y, sx, sy) => Math.exp(-(x*x/(sx*sx) + y*y/(sy*sy)) * 2)
const solid = color => (_, c) => c.copy(color)
function ellipsoid(x, y, z) {
  const geo = new THREE.SphereGeometry(1, 32, 24)
  geo.scale(x, y, z)
  return geo
}
function sculpt(name) {
  const data=sculptedMeshes[name], geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions,3))
  geometry.setIndex(data.indices);geometry.computeVertexNormals()
  return geometry
}
function tube(points, radius, material, parent) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 6, false), material)
  parent.add(mesh)
  return mesh
}
function mesh(geo, mat, pos, parent) {
  const item = new THREE.Mesh(geo, mat)
  item.position.set(...pos); item.castShadow = true; item.receiveShadow = true
  parent.add(item)
  return item
}

export function buildPuppy({ quality = 1 } = {}) {
  const group = new THREE.Group(), rig = { eyes: [], ears: [] }
  let seed = 41
  const fur = (geo, options, parent, position = [0, 0, 0]) => {
    const part = makeFurPart(geo, { ...options, count: Math.round((options.count || 12000) * quality), seed: seed++ })
    part.position.set(...position); parent.add(part)
    return part
  }
  // One sculpted surface joins pelvis, rib cage, neck and forelegs.
  const bodySkin = fur(sculpt('body'), {
    count: 88000, length: .058, width: .00085,
    groom: (p,n,t) => t.set(p.x * .5, -.9, p.y < .45 ? .3 : -.25),
    lengthAt: p => .42 + smooth(p.y,.35,.68) * .85,
    colorAt: (p,c) => {
      const bib = smooth(p.z,.025,.18) * smooth(p.y,.34,.52)
        * (1 - smooth(Math.abs(p.x),.12,.27) * .72)
      c.copy(C.gold).lerp(C.cream,bib*.95)
      c.lerp(C.white,(1-smooth(p.y,.09,.16))*smooth(p.z,.12,.24))
      c.lerp(C.dark,smooth(-p.z,.17,.42)*.20)
    }
  },group)
  rig.breath = {value:0}
  for (const part of bodySkin.children) {
    const previous = part.material.onBeforeCompile
    part.material.onBeforeCompile = shader => {
      previous.call(part.material,shader)
      shader.uniforms.breath = rig.breath
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float breath;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float chestWeight = smoothstep(.35,.7,position.y) * (1.0-smoothstep(.98,1.2,position.y));
          transformed.x *= 1.0 + breath * .008 * chestWeight;
          transformed.z += breath * .003 * chestWeight;`)
    }
  }
  function paw(parent, x, z, size = 1) {
    const paw = new THREE.Group(); paw.position.set(x, .052, z); paw.scale.set(size*.92,size,size*.93); parent.add(paw)
    fur(ellipsoid(.096, .049, .125), { count: 2300, length: .014, width: .00065, groom: [0, -.25, 1], colorAt: solid(C.white) }, paw)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * .041, z = .065 + (i === 1 || i === 2 ? .027 : .012)
      fur(ellipsoid(.026, .033, .054), { count: 380, length: .012, width: .0006, groom: [0, -.2, 1], colorAt: solid(C.white) }, paw, [x, -.003, z])
      const claw = mesh(new THREE.ConeGeometry(.005, .019, 10), new THREE.MeshStandardMaterial({color:'#8a7465', roughness:.7}), [x, -.018, z + .049], paw)
      claw.rotation.x = Math.PI / 2 + .25
    }
  }
  for (const s of [-1,1]) {
    paw(group,s*.285,-.045,.85)
    paw(group,s*.157,.23)
  }

  const head = new THREE.Group(); head.position.set(0, 1.01, .07); group.add(head); rig.head = head
  const headColor = (p,c) => {
    c.copy(C.gold)
    const side = smooth(Math.abs(p.x),.125,.236)
    const cheek = side * (1-smooth(p.y,-.06,.045)) * smooth(p.z,-.16,.05)
    c.lerp(C.cream,cheek*.79)
    const muzzle=smooth(p.z,.15,.29)
    const bridge=gaussian(p.x,p.y+.015,.135,.20)*smooth(p.z,.05,.15)
    const socket=gaussian(Math.abs(p.x)-.15,p.y-.064,.10,.075)*smooth(p.z,.05,.14)
    c.lerp(C.mask,Math.max(muzzle*.87,bridge*.90,socket*.97))
    const tear=gaussian(Math.abs(p.x)-.168,p.y-.020,.044,.021)*smooth(p.z,.05,.14)
    c.lerp(C.light,tear*.68)
    const brow=gaussian(Math.abs(p.x)-.123,p.y-.123,.026,.018)*smooth(p.z,.07,.16)
    c.lerp(C.cream,brow*.30)
    const chin=(1-smooth(p.y,-.2,-.165))*(1-smooth(p.z,.10,.22))
    c.lerp(C.cream,chin*.62)
  }
  const headGeo=sculpt('head')
  const hp=headGeo.attributes.position
  for(let i=0;i<hp.count;i++){
    const z=hp.getZ(i)
    hp.setZ(i,z>.14?.14+(z-.14)*.80:z)
  }
  headGeo.computeVertexNormals()
  fur(headGeo,{
    count:74000,length:.027,width:.00090,colorAt:headColor,
    lengthAt:p=>{
      const eye=gaussian(Math.abs(p.x)-.15,p.y-.063,.055,.037)*smooth(p.z,.10,.17)
      if(eye>.22)return .04
      const cheek=smooth(Math.abs(p.x),.14,.24)*(1-smooth(p.y,-.01,.08))
      return .38+(1-smooth(p.z,.09,.25))*.75+cheek*1.8
    },
    groom:(p,n,t)=>{
      const front=smooth(p.z,.15,.25)
      t.set(p.x*(2+front*3),-.28-front*.2,p.y>.09?-.7:.1+front)
      const crown=smooth(p.y,-.04,.18)
      t.set(p.x*(2+front*3),-.5+crown*1.3,-.3-crown*.4+front*.8)
    }
  },head)

  // Broad, cupped pinnae with a soft irregular fur margin and visible concha.
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); head.add(ear); ear.position.set(s * .153, .154, -.054)
    ear.rotation.z = -s * .16; ear.rotation.x = -.08
    const positions = [], indices = [], uv = []
    const rows = 36, cols = 28
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, half = (.080 + .075*smooth(t,0,.25)) * Math.pow(1 - t, .75) + .001
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1
        positions.push(u * half + s * .035 * t*t, t * .302, .015 + .043 * u*u * Math.sin(Math.PI*t) - .037 * Math.sin(Math.PI*t) - .042*t*t)
        uv.push(i/cols, t)
        if (j < rows && i < cols) {
          const k = j * (cols+1) + i
          indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1)
        }
      }
    }
    const earGeo = new THREE.BufferGeometry(); earGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); earGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); earGeo.setIndex(indices); earGeo.computeVertexNormals()
    const earColor = (p,c) => {
      const t = p.y/.302, half = (.080+.075*smooth(t,0,.25))*Math.pow(Math.max(0,1-t),.75)+.001
      const edge = smooth(Math.abs(p.x-s*.035*t*t)/half,.30,.78)
      c.copy(C.skin).lerp(C.cream,edge*.8).lerp(C.gold,(1-smooth(t,.0,.22))*.65+smooth(t,.75,1)*.6)
      c.multiplyScalar(.78 + .22 * smooth(p.y,.0,.15))
    }
    const front = fur(earGeo, { count: 6500, length:.035, width:.0005, colorAt:earColor, lengthAt: p => .12 + smooth(Math.abs(p.x),.023,.065)*1.5, groom:[s*.15,1,.15] },ear)
    front.children[0].material.side = THREE.DoubleSide
    const back = earGeo.clone(); back.translate(0,0,-.012)
    // Flip rear winding and normals so coat grows away from the back of the ear.
    const idx = back.index.array
    for(let i=0;i<idx.length;i+=3) { const tmp=idx[i]; idx[i]=idx[i+1]; idx[i+1]=tmp }
    back.computeVertexNormals()
    fur(back,{count:4000,length:.024,width:.0006,colorAt:solid(C.gold),groom:[s*.1,1,-.1]},ear)
    rig.ears.push({group:ear,baseZ:ear.rotation.z,baseX:ear.rotation.x})
  }

  // Corneas sit in the sculpted orbital cavities, surrounded by fleshy lids.
  const eyelids=[]
  for(const s of [-1,1]) {
    const eye=new THREE.Group();eye.position.set(s*.15,.063,.150);eye.rotation.y=s*.28;eye.scale.setScalar(.91);head.add(eye)
    const positions=[],uvs=[],indices=[]
    const segments=40,rings=8
    const outline=(a,r=1)=>[Math.cos(a)*.037*r,(Math.sin(a)*.022+s*Math.cos(a)*.003)*r]
    for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
      const r=j/rings,a=i/segments*Math.PI*2,[x,y]=outline(a,r)
      positions.push(x,y,.019+.005*(1-r*r));uvs.push(.5+x/.071,.5+y/.071)
      if(j<rings&&i<segments){const k=j*(segments+1)+i;indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2)}
    }
    const irisGeo=new THREE.BufferGeometry();irisGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));irisGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));irisGeo.setIndex(indices);irisGeo.computeVertexNormals()
    const globe=mesh(irisGeo,new THREE.MeshPhysicalMaterial({map:IRIS_MAP,color:'#ffffff',roughness:.22,clearcoat:.7,clearcoatRoughness:.08,envMapIntensity:.10}),[0,0,0],eye)
    rig.eyes.push(globe)
    const lidPositions=[],lidColors=[],lidIndices=[],rest=[],weights=[]
    for(let j=0;j<=5;j++)for(let i=0;i<=segments;i++){
      const t=j/5,a=i/segments*Math.PI*2,[x,y]=outline(a)
      const xx=x*(1+t*.62),yy=y*(1+t*.95)
      const z=.020-t*.027
      lidPositions.push(xx,yy,z);rest.push(xx,yy,z);weights.push(1-t)
      const color=C.mask.clone().lerp(Math.sin(a)<0?C.light:C.gold,t*.7)
      if(j===0)color.copy(C.lip)
      lidColors.push(color.r,color.g,color.b)
      if(j<5&&i<segments){const k=j*(segments+1)+i;lidIndices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2)}
    }
    const lidGeo=new THREE.BufferGeometry();lidGeo.setAttribute('position',new THREE.Float32BufferAttribute(lidPositions,3));lidGeo.setAttribute('color',new THREE.Float32BufferAttribute(lidColors,3));lidGeo.setIndex(lidIndices);lidGeo.computeVertexNormals()
    const lidSurface=fur(lidGeo,{count:1800,length:.006,width:.00055,
      colorAt:(p,c)=>{
        const r=Math.sqrt((p.x/.037)**2+(p.y/.024)**2)
        c.copy(C.mask).lerp(p.y<0?C.light:C.gold,smooth(r,1.02,1.7)*.70)
        if(r<1.045)c.copy(C.lip)
      },
      lengthAt:p=>smooth(Math.sqrt((p.x/.037)**2+(p.y/.024)**2),1.1,1.35),
      groom:[s*.7,.5,-.2]
    },eye)
    lidSurface.children[0].material.side=THREE.DoubleSide
    eyelids.push({geo:lidGeo,rest,weights,hair:lidSurface.children[1]})
    const glint=mesh(new THREE.SphereGeometry(.0025,12,8),new THREE.MeshBasicMaterial({color:'#eff5eb'}),[-.010,.009,.026],globe);glint.scale.set(1,1.4,.3)
  }
  rig.setBlink = closure => {
    for(const eye of rig.eyes)eye.scale.y=Math.max(.025,1-closure)
    for(const lid of eyelids){
      lid.hair.visible=closure<.05
      const p=lid.geo.attributes.position
      for(let i=0;i<p.count;i++)p.setY(i,lid.rest[i*3+1]*(1-closure*lid.weights[i]))
      p.needsUpdate=true;lid.geo.computeVertexNormals()
    }
  }

  // Nose sits at the very end of the muzzle, with a central cleft and inset nares.
  const noseGeo=ellipsoid(.065,.044,.029)
  const np=noseGeo.attributes.position
  for(let i=0;i<np.count;i++) { const y=np.getY(i); np.setX(i,np.getX(i)*(y<0 ? .72+.28*(y+.038)/.038 : 1)) }
  noseGeo.computeVertexNormals()
  mesh(noseGeo,new THREE.MeshPhysicalMaterial({color:C.nose,roughness:.63,clearcoat:.12,bumpMap:NOSE_BUMP,bumpScale:.002}),[0,-.081,.354],head)
  const nostrilMat=new THREE.MeshStandardMaterial({color:'#201317',roughness:.82})
  for(const s of [-1,1]) {
    const nostril=mesh(ellipsoid(.013,.008,.005),nostrilMat,[s*.034,-.083,.379],head);nostril.rotation.z=s*.23
  }
  tube([[0,-.084,.383],[0,-.111,.375],[0,-.122,.364]],.0012,nostrilMat,head)

  // Hinged mandible and a broad flattened tongue with a rounded, unbroken tip.
  const jaw=new THREE.Group();jaw.position.set(0,-.174,.065);head.add(jaw);rig.jaw=jaw
  fur(ellipsoid(.097,.034,.139),{count:3400,length:.009,width:.0005,colorAt:solid(C.muzzle),groom:[0,-.4,1]},jaw,[0,-.025,.13])
  const mouthMat=new THREE.MeshStandardMaterial({color:'#372027',roughness:.85})
  mesh(ellipsoid(.081,.012,.133),mouthMat,[0,.003,.13],jaw)
  const gumMat=new THREE.MeshStandardMaterial({color:'#633c38',roughness:.72})
  for(const s of [-1,1]) {
    tube([[s*.086,-.003,.04],[s*.091,.007,.15],[s*.07,-.002,.25]],.0035,gumMat,jaw)
    for(let i=0;i<4;i++) {
      const tooth=mesh(new THREE.ConeGeometry(i===2?.007:.004,i===2?.022:.011,10),new THREE.MeshStandardMaterial({color:'#e5d8c0',roughness:.4}),[s*(.087-i*.003),.010,.075+i*.03],jaw)
      tooth.rotation.z=-s*.15
    }
  }
  const tongue=new THREE.Group();tongue.position.set(0,.020,.241);jaw.add(tongue);rig.tongue=tongue
  const tongueGeo=ellipsoid(.049,.018,.095)
  const tp=tongueGeo.attributes.position
  for(let i=0;i<tp.count;i++) {
    const z=tp.getZ(i), x=tp.getX(i), y=tp.getY(i)
    tp.setXYZ(i,x,y-Math.pow(Math.max(0,z+.025)/.12,2)*.065-.003*Math.exp(-x*x/.00007),z)
  }
  tongueGeo.computeVertexNormals()
  const tongueMat=new THREE.MeshPhysicalMaterial({color:C.tongue,roughness:.54,clearcoat:.15,bumpMap:NOSE_BUMP,bumpScale:.0003})
  mesh(tongueGeo,tongueMat,[0,0,0],tongue)
  tube([[0,.016,-.06],[0,.012,-.01],[0,-.005,.035],[0,-.027,.067]],.00075,new THREE.MeshStandardMaterial({color:'#a65c6a',roughness:.65}),tongue)

  const whiskerMat=new THREE.MeshStandardMaterial({color:'#685749',transparent:true,opacity:.45,roughness:.7})
  for(const s of [-1,1]) for(let i=0;i<6;i++) {
    const z=.245+i*.010, y=-.12+(i%3)*.015
    tube([[s*.092,y,z],[s*(.145+(i%2)*.015),y+.01-i*.004,z+.015],[s*(.19+(i%3)*.022),y-.015-i*.006,z-.005-(i%2)*.018]],.00035,whiskerMat,head)
  }

  const tail=new THREE.Group();tail.position.set(.08,.27,-.39);group.add(tail);rig.tail=tail
  const tailCurve=new THREE.CatmullRomCurve3([[0,0,0],[.19,-.08,-.15],[.37,-.11,-.14],[.48,-.04,-.10],[.50,.06,-.06]].map(p=>new THREE.Vector3(...p)))
  const tailGeo=new THREE.TubeGeometry(tailCurve,48,.055,20,false)
  fur(tailGeo,{count:9500,length:.062,width:.0007,colorAt:(p,c)=>c.copy(C.gold).lerp(C.white,smooth(p.x,.31,.48)),groom:(p,n,t)=>t.set(.8,.3,-.2)},tail)
  fur(ellipsoid(.037,.04,.037),{count:700,length:.041,colorAt:solid(C.white),groom:[.4,1,0]},tail,tailCurve.getPoint(1).toArray())

  const collar=new THREE.Group();collar.position.set(0,.878,.032);group.add(collar);rig.collar=collar
  const strap=mesh(new THREE.TorusGeometry(.182,.009,10,80),new THREE.MeshStandardMaterial({color:C.strap,roughness:.9}),[0,0,0],collar)
  strap.rotation.x=Math.PI/2;strap.scale.set(1,.94,1)
  const pendant=new THREE.Group();pendant.position.set(0,-.047,.240);collar.add(pendant);rig.pendant=pendant
  mesh(new THREE.TorusGeometry(.015,.0026,8,24),new THREE.MeshStandardMaterial({color:'#9eaaa8',metalness:.8,roughness:.3}),[0,0,0],pendant)
  const tag=mesh(ellipsoid(.027,.079,.012),new THREE.MeshStandardMaterial({color:'#8fabc5',roughness:.38,metalness:.12}),[.016,-.08,.006],pendant);tag.rotation.z=.10
  mesh(ellipsoid(.021,.024,.021),new THREE.MeshStandardMaterial({color:'#650d35',metalness:.8,roughness:.23}),[-.028,-.042,.011],pendant)

  
  return {group,rig}
}
