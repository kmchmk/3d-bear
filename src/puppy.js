import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP, NOSE_BUMP } from './textures.js'
import { createBodyGeometry } from './anatomy.js'

const C = Object.fromEntries(Object.entries({
  gold: '#aa703a', light: '#c29460', dark: '#8e582c', cream: '#e4d0ae',
  white: '#eee4d0', mask: '#573b2c', muzzle: '#644330', nose: '#492b29',
  skin: '#ad7974', lip: '#3b2525', tongue: '#cb7380', strap: '#5a5650'
}).map(([key, value]) => [key, new THREE.Color(value)]))
const smooth = THREE.MathUtils.smoothstep
const gaussian = (x, y, sx, sy) => Math.exp(-(x*x/(sx*sx) + y*y/(sy*sy)) * 2)
const solid = color => (_, c) => c.copy(color)
function ellipsoid(x, y, z) {
  const geo = new THREE.SphereGeometry(1, 56, 40)
  geo.scale(x, y, z)
  return geo
}
function surface(rings, segments = 80) {
  // Continuous smooth loft for cranium, nasal bridge and muzzle.
  const curves = [1, 2, 3].map(component => new THREE.SplineCurve(rings.map(r => new THREE.Vector2(r[0], r[component]))))
  const positions = [], uv = [], indices = []
  const rows = 84
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    const w = curves[0].getPoint(t), top = curves[1].getPoint(t).y, bottom = curves[2].getPoint(t).y
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2
      let x = Math.sin(a) * Math.max(.001, w.y)
      let y = (top + bottom) / 2 + Math.cos(a) * (top - bottom) / 2
      let z = w.x
      // Paired orbital depressions and a restrained brow ridge.
      const socket = gaussian(Math.abs(x) - .146, y - .105, .066, .052) * smooth(z, .22, .31)
      z -= socket * .012
      positions.push(x, y, z); uv.push(i / segments, t)
      if (j < rows && i < segments) {
        const k = j * (segments + 1) + i
        indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(indices); geo.computeVertexNormals()
  return geo
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
  const bodySkin = fur(createBodyGeometry(), {
    count: 76000, length: .049, width: .00065,
    groom: (p,n,t) => t.set(p.x * .5, -.9, p.y < .55 ? -.4 : .12),
    lengthAt: p => .42 + smooth(p.y,.35,.68) * .85,
    colorAt: (p,c) => {
      const bib = smooth(p.z,.09,.25) * smooth(p.y,.44,.65)
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
    const paw = new THREE.Group(); paw.position.set(x, .052, z); paw.scale.setScalar(size); parent.add(paw)
    fur(ellipsoid(.096, .049, .125), { count: 2300, length: .014, width: .00065, groom: [0, -.25, 1], colorAt: solid(C.white) }, paw)
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * .041, z = .065 + (i === 1 || i === 2 ? .027 : .012)
      fur(ellipsoid(.026, .033, .054), { count: 380, length: .012, width: .0006, groom: [0, -.2, 1], colorAt: solid(C.white) }, paw, [x, -.003, z])
      const claw = mesh(new THREE.ConeGeometry(.005, .019, 10), new THREE.MeshStandardMaterial({color:'#8a7465', roughness:.7}), [x, -.018, z + .049], paw)
      claw.rotation.x = Math.PI / 2 + .25
    }
  }
  for (const s of [-1,1]) {
    paw(group,s*.31,-.02,.85)
    paw(group,s*.17,.29)
  }

  const head = new THREE.Group(); head.position.set(0, 1.14, .12); group.add(head); rig.head = head
  const headColor = (p, c) => {
    c.copy(C.gold).lerp(C.dark, smooth(p.y, .17, .3) * .22)
    // Cream cheek edges; brown facial mask follows actual model landmarks.
    const cheek = smooth(Math.abs(p.x), .16, .27) * (1 - smooth(p.y, .02, .18)) * smooth(p.z, -.12, .2)
    c.lerp(C.cream, cheek * .93)
    const muzzle = smooth(p.z, .24, .43)
    const bridge = gaussian(p.x, p.y + .01, .20, .25) * smooth(p.z, .16, .3)
    const socket = gaussian(Math.abs(p.x) - .146, p.y - .105, .115, .090) * smooth(p.z, .09, .24)
    const maskWidth = .17 - smooth(p.y,.08,.24) * .075
    const faceMask = (1-smooth(Math.abs(p.x),maskWidth,maskWidth+.075)) * (1-smooth(p.y,.13,.26)) * smooth(p.z,.04,.20)
    c.lerp(C.mask, Math.min(1, Math.max(muzzle, bridge * .94, socket * .94, faceMask*.97)))
    const underEye = gaussian(Math.abs(p.x) - .183, p.y - .054, .06, .021) * smooth(p.z, .22, .3)
    c.lerp(C.light, underEye * .30)
    const brow = gaussian(Math.abs(p.x) - .148, p.y - .167, .042, .026) * smooth(p.z, .15, .26)
    c.lerp(C.cream, brow * .24)
  }
  const headGeo = surface([
    [-.265, .001, .02, .015], [-.21, .15, .21, -.16], [-.08, .25, .29, -.215],
    [.07, .263, .29, -.205], [.19, .247, .245, -.19], [.28, .207, .175, -.16],
    [.355, .159, .075, -.135], [.445, .12, .018, -.12], [.525, .09, -.005, -.10], [.56, .005, -.037, -.067]
  ])
  fur(headGeo, {
    count: 44000, length: .025, width: .00062, colorAt: headColor,
    lengthAt: p => {
      const eye = gaussian(Math.abs(p.x) - .146, p.y - .11, .053, .035) * smooth(p.z, .23, .30)
      if (eye > .35) return 0
      if (p.y < -.07 && p.z < .1) return 2.8
      return (.4 + (1 - smooth(p.z, .19, .42)) * .8) * (1 + smooth(Math.abs(p.x), .19, .28) * .7)
    },
    groom: (p, n, t) => {
      if (p.z > .32) t.set(p.x * 1.8, -.4, 1)
      else t.set(p.x * 2.8, Math.tanh((p.y - .12) * 14), -.45)
    }
  }, head)

  // Broad, cupped pinnae with a soft irregular fur margin and visible concha.
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); head.add(ear); ear.position.set(s * .18, .165, .005)
    ear.rotation.z = -s * .16; ear.rotation.x = -.08
    const positions = [], indices = [], uv = []
    const rows = 36, cols = 28
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, half = (.080 + .055*smooth(t,0,.22)) * Math.pow(1 - t, .75) + .001
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1
        positions.push(u * half + s * .035 * t*t, t * .355, .015 + .043 * u*u * Math.sin(Math.PI*t) - .037 * Math.sin(Math.PI*t) - .042*t*t)
        uv.push(i/cols, t)
        if (j < rows && i < cols) {
          const k = j * (cols+1) + i
          indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1)
        }
      }
    }
    const earGeo = new THREE.BufferGeometry(); earGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); earGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); earGeo.setIndex(indices); earGeo.computeVertexNormals()
    const earColor = (p,c) => {
      const t = p.y/.355, half = (.080+.055*smooth(t,0,.22))*Math.pow(Math.max(0,1-t),.75)+.001
      const edge = smooth(Math.abs(p.x-s*.035*t*t)/half,.30,.78)
      c.copy(C.skin).lerp(C.cream,edge*.8).lerp(C.gold,(1-smooth(t,.0,.22))*.65+smooth(t,.75,1)*.6)
      c.multiplyScalar(.78 + .22 * smooth(p.y,.0,.15))
    }
    const front = fur(earGeo, { count: 6000, length:.028, width:.0005, colorAt:earColor, lengthAt: p => .25 + smooth(Math.abs(p.x),.025,.09), groom:[s*.15,1,.15] },ear)
    front.children[0].material.side = THREE.DoubleSide
    const back = earGeo.clone(); back.translate(0,0,-.012)
    // Flip rear winding and normals so coat grows away from the back of the ear.
    const idx = back.index.array
    for(let i=0;i<idx.length;i+=3) { const tmp=idx[i]; idx[i]=idx[i+1]; idx[i+1]=tmp }
    back.computeVertexNormals()
    fur(back,{count:4000,length:.024,width:.0006,colorAt:solid(C.gold),groom:[s*.1,1,-.1]},ear)
    rig.ears.push({group:ear,baseZ:ear.rotation.z,baseX:ear.rotation.x})
  }

  // Almond-shaped corneal patches, recessed in the mask. No white googly spheres.
  for(const s of [-1,1]) {
    const eye = new THREE.Group(); eye.position.set(s*.146,.109,.321); eye.rotation.y=s*.29; eye.scale.setScalar(.84); head.add(eye)
    const positions=[], uvs=[], indices=[], outline=[]
    for (let ring=0;ring<=10;ring++) {
      const r=ring/10
      for (let i=0;i<=64;i++) {
        const a=i/64*Math.PI*2, x=Math.cos(a)*.044*r
        const y=(Math.sin(a)*.027*(.75+.25*Math.abs(Math.sin(a)))+s*Math.cos(a)*.0044)*r
        positions.push(x,y,.014*(1-r*r));uvs.push(.5+x/.075,.5+y/.075)
        if(ring===10)outline.push([x,y,.001])
        if(ring<10&&i<64){const k=ring*65+i;indices.push(k,k+65,k+1,k+1,k+65,k+66)}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals()
    const globe=mesh(geo,new THREE.MeshStandardMaterial({map:IRIS_MAP,color:'#a4afa5',roughness:.42,envMapIntensity:.12}),[0,0,.003],eye)
    const glint=mesh(new THREE.SphereGeometry(.003,12,8),new THREE.MeshBasicMaterial({color:'#e4eee9',transparent:true,opacity:.72}),[-.011,.012,.015],globe)
    glint.scale.set(.8,1.2,.35)
    const lipMat=new THREE.MeshStandardMaterial({color:C.lip,roughness:.66})
    tube(outline,.003,lipMat,eye)
    // A fur-colored closed lid sits just behind the cornea while it narrows.
    mesh(geo.clone(),new THREE.MeshStandardMaterial({color:C.mask,roughness:1}),[0,0,-.002],eye)
    rig.eyes.push(globe)
  }

  // Nose sits at the very end of the muzzle, with a central cleft and inset nares.
  const noseGeo=ellipsoid(.064,.038,.031)
  const np=noseGeo.attributes.position
  for(let i=0;i<np.count;i++) { const y=np.getY(i); np.setX(i,np.getX(i)*(y<0 ? .72+.28*(y+.038)/.038 : 1)) }
  noseGeo.computeVertexNormals()
  mesh(noseGeo,new THREE.MeshPhysicalMaterial({color:C.nose,roughness:.63,clearcoat:.12,bumpMap:NOSE_BUMP,bumpScale:.002}),[0,-.036,.547],head)
  const nostrilMat=new THREE.MeshStandardMaterial({color:'#201317',roughness:.82})
  for(const s of [-1,1]) {
    const nostril=mesh(ellipsoid(.013,.008,.005),nostrilMat,[s*.033,-.040,.574],head);nostril.rotation.z=s*.23
  }
  tube([[0,-.047,.576],[0,-.068,.573],[0,-.077,.563]],.0012,nostrilMat,head)

  // Hinged mandible and a broad flattened tongue with a rounded, unbroken tip.
  const jaw=new THREE.Group();jaw.position.set(0,-.125,.21);head.add(jaw);rig.jaw=jaw
  fur(ellipsoid(.10,.039,.16),{count:3400,length:.009,width:.0005,colorAt:solid(C.muzzle),groom:[0,-.4,1]},jaw,[0,-.025,.13])
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
  const tongue=new THREE.Group();tongue.position.set(0,.020,.295);jaw.add(tongue);rig.tongue=tongue
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
    const z=.38+i*.013, y=-.067+(i%3)*.015
    tube([[s*.092,y,z],[s*(.145+(i%2)*.015),y+.01-i*.004,z+.015],[s*(.19+(i%3)*.022),y-.015-i*.006,z-.005-(i%2)*.018]],.00035,whiskerMat,head)
  }

  const tail=new THREE.Group();tail.position.set(.08,.27,-.39);group.add(tail);rig.tail=tail
  const tailCurve=new THREE.CatmullRomCurve3([[0,0,0],[.19,-.08,-.15],[.37,-.11,-.14],[.48,-.04,-.10],[.50,.06,-.06]].map(p=>new THREE.Vector3(...p)))
  const tailGeo=new THREE.TubeGeometry(tailCurve,48,.055,20,false)
  fur(tailGeo,{count:9500,length:.062,width:.0007,colorAt:(p,c)=>c.copy(C.gold).lerp(C.white,smooth(p.x,.31,.48)),groom:(p,n,t)=>t.set(.8,.3,-.2)},tail)
  fur(ellipsoid(.037,.04,.037),{count:700,length:.041,colorAt:solid(C.white),groom:[.4,1,0]},tail,tailCurve.getPoint(1).toArray())

  const collar=new THREE.Group();collar.position.set(0,.965,.085);group.add(collar);rig.collar=collar
  const strap=mesh(new THREE.TorusGeometry(.216,.006,10,80),new THREE.MeshStandardMaterial({color:C.strap,roughness:.9}),[0,0,0],collar)
  strap.rotation.x=Math.PI/2;strap.scale.set(1,.94,1)
  const pendant=new THREE.Group();pendant.position.set(0,-.053,.241);collar.add(pendant);rig.pendant=pendant
  mesh(new THREE.TorusGeometry(.015,.0026,8,24),new THREE.MeshStandardMaterial({color:'#9eaaa8',metalness:.8,roughness:.3}),[0,0,0],pendant)
  const tag=mesh(ellipsoid(.027,.079,.012),new THREE.MeshStandardMaterial({color:'#8fabc5',roughness:.38,metalness:.12}),[.016,-.08,.006],pendant);tag.rotation.z=.10
  mesh(ellipsoid(.021,.024,.021),new THREE.MeshStandardMaterial({color:'#650d35',metalness:.8,roughness:.23}),[-.028,-.042,.011],pendant)

  
  return {group,rig}
}
