import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP, NOSE_BUMP } from './textures.js'
import meshUrl from './sculpted-meshes.json?url'

const meshResponse = await fetch(meshUrl)
if (!meshResponse.ok) throw new Error(`Model download failed: ${meshResponse.status}`)
const sculptedMeshes = await meshResponse.json()

const C = Object.fromEntries(Object.entries({
  gold: '#a57643', light: '#c9a173', dark: '#7d5230', cream: '#e8d5b8',
  white: '#eee4d0', mask: '#49382e', muzzle: '#644330', nose: '#4a2c20',
  skin: '#ad7974', lip: '#3b2525', tongue: '#cb7380', strap: '#6b6259'
}).map(([key, value]) => [key, new THREE.Color(value)]))
const smooth = THREE.MathUtils.smoothstep
// Deterministic per-point jitter (±.5) so every color boundary dissolves into
// fur instead of surviving as a hard edge at any zoom.
const jitter = (p, s) => {
  const v = Math.sin(p.x * 12.9 * s + p.y * 78.2 * s + p.z * 37.7 * s) * 43758.55
  return v - Math.floor(v) - .5
}
const LINER = new THREE.Color('#17100d')
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
    count: 110000, length: .10, width: .00078, frizz: .11, lift: 1.35,
    groom: (p,n,t) => t.set(p.x * .5, -.9, p.y < .45 ? .3 : -.25),
    lengthAt: p => {
      const bib = smooth(p.z,.025,.18) * smooth(p.y,.34,.52)
        * (1 - smooth(Math.abs(p.x),.12,.27) * .72)
      // Neck ruff: longer feathered fur where the reference shows a mane.
      const ruff = smooth(p.y,.48,.66) * smooth(p.z,.02,.24)
        * (1 - smooth(Math.abs(p.x),.10,.26))
      // Leg feathering: longer furnishings on the lower limbs, not clipped velvet.
      const legFur = (1 - smooth(p.y,.25,.45)) * smooth(p.y,.0,.10)
        * (1 - smooth(Math.abs(p.x),.18,.30))
      return .42 + smooth(p.y,.35,.68) * 1.05 + bib * 1.45 + smooth(p.y,.45,.62) * .75
        + smooth(p.y,.22,.5) * (1 - smooth(Math.abs(p.x),.15,.30)) * .55 + ruff * .85 + legFur * .7
    },
    colorAt: (p,c) => {
      const jz = jitter(p, 9) * .030
      const bib = smooth(p.z,.025+jz,.18+jz) * smooth(p.y,.34,.52)
        * (1 - smooth(Math.abs(p.x),.12,.27) * .72)
      c.copy(C.gold).lerp(C.cream,bib*.95)
      const sockEdge = .11 + .025 * Math.sin(p.z*85+p.y*40) * Math.sin(p.x*75) + jitter(p, 22) * .030
      c.lerp(C.white,(1-smooth(p.y,sockEdge,sockEdge+.08))*smooth(p.z,.12,.24))
      c.lerp(C.dark,smooth(-p.z,.17,.42)*.20)
    },
    // Dorsal guard hairs carry darker tips; belly and bib stay pale throughout.
    tipAt: (p, tip, guard) => {
      const dorsal = smooth(p.y,.42,.66) * (1 - smooth(p.z,.20,.34)) * (1 - smooth(Math.abs(p.x),.22,.36) * .6)
      if (guard) { tip.copy(C.light).lerp(C.cream,.5); return dorsal * .35 }
      tip.copy(C.dark).lerp(C.gold,.30)
      return dorsal * .8
    }
  },group)
  // Sparse long dorsal guard hairs flowing back over the undercoat.
  fur(sculpt('body'), {
    count: 14000, length: .10, width: .00050, frizz: .16, lift: .6,
    groom: (p,n,t) => t.set(p.x * .4, -.35, -.55),
    lengthAt: p => smooth(p.y,.45,.70) * (1 - smooth(Math.abs(p.x),.20,.35)) * (1 - smooth(p.z,.20,.35)),
    colorAt: (p,c) => c.copy(C.gold).lerp(C.dark,.25),
    tipAt: (p,tip) => { tip.copy(C.light).lerp(C.cream,.35); return .45 }
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
  function paw(parent, x, z, size = 1, yaw = 0) {
    const paw = new THREE.Group(); paw.position.set(x, .038, z); paw.rotation.y=yaw; paw.scale.set(size*.94,size,size); parent.add(paw)
    // White sock with carved inter-toe grooves so digits read instead of a mitten.
    fur(ellipsoid(.073, .034, .105), { count: 2200, length: .012, width: .00055, groom: [0, -.18, 1], colorAt: (p,c) => {
      c.copy(C.white)
      const groove = Math.min(Math.abs(Math.abs(p.x)-.035)-.005, Math.abs(p.x)-.005)
      if (p.z > .045 && groove < 0) c.multiplyScalar(.62 + .38 * smooth(Math.abs(groove),0,.005))
    } }, paw)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * .035, z = .072 + (i === 1 || i === 2 ? .012 : .005)
      fur(ellipsoid(.026, .022, .042), { count: 320, length: .012, width: .0005, groom: [0, -.35, 1], colorAt: solid(C.white) }, paw, [x, -.002, z])
      const claw = mesh(new THREE.ConeGeometry(.0055, .016, 8), new THREE.MeshStandardMaterial({color:'#2a201c', roughness:.35}), [x, -.012, z + .038], paw)
      claw.rotation.x = Math.PI / 2 + .25
    }
  }
  paw(group,-.126,.492,.94,-.055)
  paw(group,.148,.515,1.0,.045)
  paw(group,.278,-.100,.72,2.85)
  paw(group,-.135,-.260,.60,2.99)

  const head = new THREE.Group(); head.position.set(-.015, .695, .115); head.rotation.z=.025; group.add(head); rig.head = head
  const headColor = (p,c) => {
    c.copy(C.gold)
    // Low-frequency blotches diffuse markings; fine grain only textures fur.
    const j1 = jitter(p, 11) * .008 + jitter(p, 4) * .030
    const side = smooth(Math.abs(p.x),.125+j1,.236+j1)
    const cheek = side * (1-smooth(p.y,-.06,.045)) * smooth(p.z,-.16,.05)
    c.lerp(C.cream,cheek*.79)
    const muzzle=smooth(p.z,.15+j1,.29+j1)
    const bridge=gaussian(p.x,p.y+.015,.135,.20)*smooth(p.z,.05+j1,.15+j1)
    const socket=gaussian(Math.abs(p.x)-.084,p.y-.010,.080,.065)*smooth(p.z,.05+j1,.14+j1)
    // Softer milk-chocolate mask with feathered edges, not a solid hood.
    // The brow fades out so no hard hood arc survives across the forehead.
    const browFade = 1 - smooth(p.y,.04,.14)*.55
    c.lerp(C.mask,Math.max(muzzle*.68,bridge*.66*browFade,socket*.90))
    // Subtle painted eyeliner band in the undercoat; geometry liner does the rest.
    const edx=Math.abs(p.x)-.084, edy=p.y-.010
    const ed=Math.sqrt(edx*edx*.81+edy*edy*1.96)
    const linerBand=Math.exp(-Math.pow((ed-.044)/.007,2))*smooth(p.z,.05,.14)
    c.lerp(LINER,linerBand*.38)
    // Fine whisker-pore texture across the muzzle (sampled per fiber root).
    const poreMask = smooth(p.z,.16,.24) * (1 - smooth(p.z,.33,.40)) * (1 - smooth(Math.abs(p.x),.045,.075))
    const pores = Math.pow(Math.abs(Math.sin(p.x*1570) * Math.sin(p.y*1500)), 6)
    c.lerp(C.lip, poreMask * pores * .08)
    const tear=gaussian(Math.abs(p.x)-.100,p.y-.002,.042,.022)*smooth(p.z,.05,.14)
    c.lerp(C.light,tear*.40)
    // Subtle painted eyeliner band in the undercoat; geometry liner does the rest.
    const brow=gaussian(Math.abs(p.x)-.090,p.y-.072,.034,.024)*smooth(p.z,.07,.16)
    c.lerp(C.cream,brow*.12)
    const chin=(1-smooth(p.y,-.2,-.165))*(1-smooth(p.z,.10,.22))
    c.lerp(C.cream,chin*.62)
  }
  const headGeo=sculpt('head')
  const hp=headGeo.attributes.position
  headGeo.computeVertexNormals()
  fur(headGeo,{
    count:92000,length:.045,width:.00072,colorAt:headColor,frizz:.12,lift:1.25,
    lengthAt:p=>{
      const eye=gaussian(Math.abs(p.x)-.084,p.y-.010,.052,.036)*smooth(p.z,.105,.16)
      const cheek=smooth(Math.abs(p.x),.14,.24)*(1-smooth(p.y,-.01,.08))
      const crown=smooth(p.y,.08,.18)*(1-smooth(Math.abs(p.x),.05,.12))
      // Longer brow cover softens the brow-blob geometry into a flat forehead read.
      const browZone=gaussian(Math.abs(p.x)-.100,p.y-.070,.052,.030)*smooth(p.z,.07,.16)
      // Shorter bridge fur slims the snout toward a tapered read.
      const snoutSlim=smooth(p.z,.15,.30)*(1-smooth(Math.abs(p.x),.03,.08))*.25
      const base=.38+(1-smooth(p.z,.09,.25))*.55+cheek*1.6+crown*1.35+browZone*.9-snoutSlim
      // Feathered crater into the short eye window instead of a hard cliff.
      return base*(1-smooth(eye,.10,.24))+.04
    },
    groom:(p,n,t)=>{
      const front=smooth(p.z,.15,.25)
      t.set(p.x*(2+front*3),-.28-front*.2,p.y>.09?-.7:.1+front)
      const crown=smooth(p.y,-.04,.18)
      t.set(p.x*(2+front*3),-.5+crown*1.3,-.3-crown*.4+front*.8)
    }
  },head)

  // Compact upright pinnae: smaller, closer-set, tan-furred with a small pink concha.
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); head.add(ear); ear.position.set(s * .108, .138, -.040)
    ear.rotation.z = -s * .075; ear.rotation.x = -.08
    const positions = [], indices = [], uv = []
    const rows = 36, cols = 28
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, half = (.062 + .048*smooth(t,0,.25)) * Math.pow(1 - t, .68) + .001
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1
        positions.push(u * half + s * .020 * t*t, t * .225, .010 + .030 * u*u * Math.sin(Math.PI*t) - .026 * Math.sin(Math.PI*t) - .028*t*t)
        uv.push(i/cols, t)
        if (j < rows && i < cols) {
          const k = j * (cols+1) + i
          indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1)
        }
      }
    }
    const earGeo = new THREE.BufferGeometry(); earGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); earGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); earGeo.setIndex(indices); earGeo.computeVertexNormals()
    const earColor = (p,c) => {
      const t = p.y/.225, half = (.062+.048*smooth(t,0,.25))*Math.pow(Math.max(0,1-t),.68)+.001
      const edge = smooth(Math.abs(p.x-s*.020*t*t)/half,.30,.78)
      // Mostly tan fur; pink shows only in the mid-concha, fringed cream at rim.
      const concha = (1-edge) * smooth(t,.06,.22) * (1-smooth(t,.62,.88))
      c.copy(C.light).lerp(C.skin,concha*.62).lerp(C.cream,edge*.72)
      c.lerp(C.gold,(1-smooth(t,.0,.20))*.55+smooth(t,.78,1)*.55)
      c.multiplyScalar(.82 + .18 * smooth(p.y,.0,.12))
      // Mottled inner-ear skin rather than flat pink.
      c.multiplyScalar(.93 + .07 * Math.sin(p.y*290+s)*Math.sin(p.x*240))
    }
    const front = fur(earGeo, { count: 7500, length:.034, width:.0005, colorAt:earColor, lengthAt: p => .12 + smooth(Math.abs(p.x),.020,.055)*1.1, groom:[s*.15,1,.15] },ear)
    front.children[0].material.side = THREE.DoubleSide
    const back = earGeo.clone(); back.translate(0,0,-.012)
    // Flip rear winding and normals so coat grows away from the back of the ear.
    const idx = back.index.array
    for(let i=0;i<idx.length;i+=3) { const tmp=idx[i]; idx[i]=idx[i+1]; idx[i+1]=tmp }
    back.computeVertexNormals()
    fur(back,{count:4000,length:.024,width:.0006,colorAt:solid(C.gold),groom:[s*.1,1,-.1]},ear)
    rig.ears.push({group:ear,baseZ:ear.rotation.z,baseX:ear.rotation.x})
  }

  // Deep-set globes with a crisp dark liner ring instead of protruding buttons.
  const eyelids=[]
  for(const s of [-1,1]) {
    const eye=new THREE.Group();eye.position.set(s*.084,.010,.175);eye.rotation.y=s*.02;head.add(eye)
    const positions=[],uvs=[],indices=[]
    const segments=48,rings=10
    const outline=(a,r=1)=>{
      // Forward almond canine eye: fuller lower lid, minimal lateral slant.
      const upper=Math.sin(a)>0 ? 1.02 : .82
      return [Math.cos(a)*.0365*r,(Math.sin(a)*.022*upper+s*Math.cos(a)*.0015)*r]
    }
    for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
      const r=j/rings,a=i/segments*Math.PI*2,[x,y]=outline(a,r)
      positions.push(x,y,.013+.004*(1-r*r));uvs.push(.5+x/.068,.5+y/.046)
      if(j<rings&&i<segments){const k=j*(segments+1)+i;indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2)}
    }
    const irisGeo=new THREE.BufferGeometry();irisGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));irisGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));irisGeo.setIndex(indices);irisGeo.computeVertexNormals()
    const globe=mesh(irisGeo,new THREE.MeshPhysicalMaterial({map:IRIS_MAP,color:'#f7f2e8',roughness:.32,clearcoat:.6,clearcoatRoughness:.14,envMapIntensity:.30}),[0,0,0],eye)
    rig.eyes.push(globe)
    const corneaGeo=new THREE.SphereGeometry(.035,28,14,0,Math.PI*2,0,.62)
    corneaGeo.scale(1,.64,.45)
    const cornea=mesh(corneaGeo,new THREE.MeshPhysicalMaterial({color:'#dfe6e4',transparent:true,opacity:.13,roughness:.05,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:.6}),[0,.0015,.003],eye)
    cornea.castShadow=false
    const lidPositions=[],lidColors=[],lidIndices=[],rest=[],weights=[]
    for(let j=0;j<=5;j++)for(let i=0;i<=segments;i++){
      const t=j/5,a=i/segments*Math.PI*2,[x,y]=outline(a)
      const xx=x*(1+t*.30),yy=y*(1+t*.44)
      const z=.014-t*.017
      lidPositions.push(xx,yy,z);rest.push(xx,yy,z);weights.push(1-t)
      // Wide near-black liner band framing the iris, feathering to coat fur.
      const color=LINER.clone().lerp(Math.sin(a)<0?C.light:C.gold,smooth(t,.15,1)*.75)
      lidColors.push(color.r,color.g,color.b)
      if(j<5&&i<segments){const k=j*(segments+1)+i;lidIndices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2)}
    }
    const lidGeo=new THREE.BufferGeometry();lidGeo.setAttribute('position',new THREE.Float32BufferAttribute(lidPositions,3));lidGeo.setAttribute('color',new THREE.Float32BufferAttribute(lidColors,3));lidGeo.setIndex(lidIndices);lidGeo.computeVertexNormals()
    const lidSurface=fur(lidGeo,{count:1100,length:.0055,width:.00044,
      colorAt:(p,c)=>{
        const r=Math.sqrt((p.x/.031)**2+(p.y/.018)**2)
        c.copy(LINER).lerp(p.y<0?C.light:C.gold,smooth(r,1.05,1.45)*.70)
      },
      lengthAt:p=>smooth(Math.sqrt((p.x/.035)**2+(p.y/.022)**2),1.08,1.32),
      groom:[s*.7,.5,-.2]
    },eye)
    lidSurface.children[0].material.side=THREE.DoubleSide
    eyelids.push({geo:lidGeo,rest,weights,hair:lidSurface.children[1]})
    // Pink caruncle at the inner corner so the eye reads as anatomy, not decal.
    mesh(ellipsoid(.0042,.0030,.0022),new THREE.MeshStandardMaterial({color:'#b98a8a',roughness:.6}),[-s*.029,-.005,.016],eye)
    // Dual glints kept small: a pin catchlight + a faint window sheen.
    // Mirrored per side so both eyes read as one forward gaze, not strabismus.
    const glint=mesh(new THREE.SphereGeometry(.0011,10,6),new THREE.MeshBasicMaterial({color:'#f4f6f2'}),[s*-.008,.006,.024],globe);glint.scale.set(1,1.35,.25)
    const glintSoft=mesh(new THREE.SphereGeometry(.0026,12,8),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.07}),[s*.009,-.005,.022],globe);glintSoft.scale.set(1,.7,.2)
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
  const noseGeo=ellipsoid(.050,.032,.025)
  const np=noseGeo.attributes.position
  for(let i=0;i<np.count;i++) { const y=np.getY(i); np.setX(i,np.getX(i)*(y<0 ? .72+.28*(y+.042)/.042 : 1)) }
  noseGeo.computeVertexNormals()
  const noseMat=new THREE.MeshPhysicalMaterial({color:new THREE.Color('#3a231b'),roughness:.82,clearcoat:.05,clearcoatRoughness:.8,bumpMap:NOSE_BUMP,bumpScale:.0025})
  mesh(noseGeo,noseMat,[0,-.085,.431],head)
  // Alar wings give the nose its wide bridge instead of a smooth ball.
  for(const s of [-1,1]) mesh(ellipsoid(.013,.008,.009),noseMat,[s*.034,-.087,.443],head)
  const nostrilMat=new THREE.MeshStandardMaterial({color:'#1c1114',roughness:.95})
  for(const s of [-1,1]) {
    const nostril=mesh(ellipsoid(.014,.006,.004),nostrilMat,[s*.028,-.085,.450],head);nostril.rotation.z=s*.45;nostril.rotation.y=-s*.55
  }
  tube([[0,-.087,.457],[0,-.105,.447],[0,-.116,.433]],.0010,nostrilMat,head)
  const lipMat=new THREE.MeshStandardMaterial({color:'#2e1c1c',roughness:.8})
  for(const s of [-1,1])
    tube([[s*.006,-.096,.453],[s*.034,-.114,.40],[s*.056,-.138,.305],[s*.060,-.147,.252]],.0012,lipMat,head)

  // The mouth is only slightly parted; a short tongue tip rests between the lips.
  const jaw=new THREE.Group();jaw.position.set(0,-.137,.115);head.add(jaw);rig.jaw=jaw
  fur(ellipsoid(.066,.022,.104),{count:2700,length:.008,width:.0005,colorAt:solid(C.muzzle),groom:[0,-.3,1]},jaw,[0,-.018,.112])
  const mouthMat=new THREE.MeshStandardMaterial({color:'#372027',roughness:.85})
  mesh(ellipsoid(.059,.007,.096),mouthMat,[0,.002,.117],jaw)
  // Small lower canines so the open mouth reads as teeth + tongue, not a void.
  const toothMat=new THREE.MeshStandardMaterial({color:'#efe6d4',roughness:.35})
  for(const s of [-1,1]) {
    const fang=mesh(new THREE.ConeGeometry(.0038,.013,8),toothMat,[s*.030,-.002,.178],jaw)
    fang.rotation.x=Math.PI
  }
  const tongue=new THREE.Group();tongue.position.set(0,-.004,.222);tongue.rotation.z=.10;jaw.add(tongue);rig.tongue=tongue
  const tongueGeo=ellipsoid(.030,.009,.085)
  const tp=tongueGeo.attributes.position
  for(let i=0;i<tp.count;i++) {
    const z=tp.getZ(i), x=tp.getX(i), y=tp.getY(i)
    tp.setXYZ(i,x*.9,y-Math.pow(Math.max(0,z+.006)/.05,2)*.018-.0015*Math.exp(-x*x/.00004),z)
  }
  tongueGeo.computeVertexNormals()
  const tongueMat=new THREE.MeshPhysicalMaterial({color:C.tongue,roughness:.48,clearcoat:.35,clearcoatRoughness:.4,bumpMap:NOSE_BUMP,bumpScale:.0003})
  mesh(tongueGeo,tongueMat,[0,0,0],tongue)
  tube([[0,.007,-.018],[0,.004,.002],[0,-.002,.022]],.00045,new THREE.MeshStandardMaterial({color:'#a65c6a',roughness:.65}),tongue)

  const whiskerMat=new THREE.MeshStandardMaterial({color:'#685749',transparent:true,opacity:.30,roughness:.7})
  for(const s of [-1,1]) for(let i=0;i<6;i++) {
    const z=.245+i*.010, y=-.12+(i%3)*.015
    tube([[s*.092,y,z],[s*(.130+(i%2)*.012),y+.01-i*.004,z+.012],[s*(.160+(i%3)*.016),y-.015-i*.006,z-.005-(i%2)*.014]],.0003,whiskerMat,head)
  }

  const tail=new THREE.Group();tail.position.set(.07,.23,-.50);group.add(tail);rig.tail=tail
  // Rearward plume carried low then curving up, wagging around Y. Previous
  // curve ran sideways (+x), foreshortening to a ball in profile views.
  const tailCurve=new THREE.CatmullRomCurve3([[.02,0,0],[.02,-.05,-.17],[.02,-.06,-.35],[.02,-.02,-.51],[.02,.08,-.62]].map(p=>new THREE.Vector3(...p)))
  const tailGeo=new THREE.TubeGeometry(tailCurve,48,.072,20,false)
  // Golden fluffy top with a pale underside: white lives below the tube's
  // centerline (and a frosted tip), never the whole plume.
  const tailCenters=[[0,0],[-.17,-.05],[-.35,-.06],[-.51,-.02],[-.62,.08]]
  const tailCenterY=z=>{
    if(z>=0)return 0
    for(let i=0;i<tailCenters.length-1;i++){
      const [z0,y0]=tailCenters[i],[z1,y1]=tailCenters[i+1]
      if(z<=z0&&z>=z1){const t=(z-z0)/(z1-z0);return y0+(y1-y0)*t}
    }
    return .08
  }
  fur(tailGeo,{count:22000,length:.13,width:.00060,frizz:.12,lift:1.2,
    lengthAt:p=>1+smooth(p.y-tailCenterY(p.z),.0,.05)*.8,
    colorAt:(p,c)=>{
      const jt=jitter(p,13)*.05
      const under=smooth(tailCenterY(p.z)-p.y,.008+jitter(p,17)*.012,.055)*(1-smooth(-p.z,.5,.62))
      c.copy(C.gold).lerp(C.white,Math.max(smooth(-p.z,.50+jt,.62+jt)*.45,under*.85))
    },
    tipAt:(p,tip)=>{tip.copy(C.light).lerp(C.cream,.4);return smooth(p.y-tailCenterY(p.z),-.02,.04)*.5},
    groom:(p,n,t)=>t.set(.1,.25,-1)},tail)

  const collar=new THREE.Group();collar.position.set(0,.625,.075);group.add(collar);rig.collar=collar
  const strap=mesh(new THREE.TorusGeometry(.170,.009,10,80),new THREE.MeshStandardMaterial({color:C.strap,roughness:.9}),[0,0,0],collar)
  strap.rotation.x=Math.PI/2;strap.scale.set(1,.94,1)
  const pendant=new THREE.Group();pendant.position.set(0,-.047,.240);collar.add(pendant);rig.pendant=pendant
  mesh(new THREE.TorusGeometry(.015,.0026,8,24),new THREE.MeshStandardMaterial({color:'#9eaaa8',metalness:.8,roughness:.3}),[0,0,0],pendant)
  const tag=mesh(ellipsoid(.020,.045,.010),new THREE.MeshStandardMaterial({color:'#8fabc5',roughness:.38,metalness:.12}),[.014,-.062,.006],pendant);tag.rotation.z=.10
  mesh(ellipsoid(.021,.024,.021),new THREE.MeshStandardMaterial({color:'#650d35',metalness:.8,roughness:.23}),[-.028,-.042,.011],pendant)

  
  return {group,rig}
}
