import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { FUR_STRAND_ALPHA } from './textures.js'

// Actual tapered fibers, sampled by triangle area. All dimensions are in model
// space; geometry is sculpted at its final size before grooming.
export function seededRandom(seed = 173) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function makeFurPart(geometry, {
  count = 12000, length = 0.035, width = 0.0008, groom = [0, -1, 0],
  colorAt, lengthAt = () => 1, tipAt = null, frizz = .12, lift = 1, seed = 173,
  // A second guard-coat pass can share the dense undercoat without drawing a
  // duplicate opaque shell. Kept opt-in so every existing caller is unchanged.
  skin: includeSkin = true
} = {}) {
  const group = new THREE.Group()
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  const p = new THREE.Vector3(), c = new THREE.Color()
  const color = new Float32Array(geometry.attributes.position.count * 3)
  const flowData=new Float32Array(color.length),surfaceNormal=new THREE.Vector3(),surfaceFlow=new THREE.Vector3()
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    p.fromBufferAttribute(geometry.attributes.position, i)
    colorAt(p, c)
    c.toArray(color, i * 3)
    surfaceNormal.fromBufferAttribute(geometry.attributes.normal,i)
    if(typeof groom==='function')groom(p,surfaceNormal,surfaceFlow);else surfaceFlow.set(...groom)
    surfaceFlow.addScaledVector(surfaceNormal,-surfaceFlow.dot(surfaceNormal))
    if(surfaceFlow.lengthSq()<1e-8){surfaceFlow.set(1,.37,.13);surfaceFlow.addScaledVector(surfaceNormal,-surfaceFlow.dot(surfaceNormal))}
    surfaceFlow.normalize().toArray(flowData,i*3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  geometry.setAttribute('coatFlow',new THREE.BufferAttribute(flowData,3))
  const baseMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .985, sheen: .045, sheenRoughness: 1,
  })
  // The undercoat has broad, quiet tonal variation plus a fine fiber grain.
  // It gives the dense core depth without turning the surface into sand.
  baseMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 coatFlow; varying vec3 coatPosition; varying vec3 vCoatFlow; varying vec3 vCoatNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ncoatPosition = position; vCoatFlow=coatFlow; vCoatNormal=normal;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 coatPosition; varying vec3 vCoatFlow; varying vec3 vCoatNormal;
      float coatHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
      float coatNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(coatHash(i), coatHash(i + vec3(1.,0.,0.)), f.x),
                       mix(coatHash(i + vec3(0.,1.,0.)), coatHash(i + vec3(1.,1.,0.)), f.x), f.y),
                   mix(mix(coatHash(i + vec3(0.,0.,1.)), coatHash(i + vec3(1.,0.,1.)), f.x),
                       mix(coatHash(i + vec3(0.,1.,1.)), coatHash(i + vec3(1.,1.,1.)), f.x), f.y), f.z);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Keep the shell quiet. High-frequency 3D hash noise aliases into
        // glitter at portrait distance, which makes the coat read as plastic.
        float patches = coatNoise(coatPosition * 8.0);
        float mottle = coatNoise(coatPosition * 24.0);
        vec3 fiberNormal=normalize(vCoatNormal),fiberFlow=normalize(vCoatFlow);
        vec3 fiberSide=normalize(cross(fiberNormal,fiberFlow));
        vec3 fiberCoords=vec3(dot(coatPosition,fiberSide)*950.,dot(coatPosition,fiberFlow)*85.,dot(coatPosition,fiberNormal)*650.);
        float fiberGrain=coatNoise(fiberCoords);
        float coatValue = .82 + (patches - .5) * .15 + (mottle - .5) * .06+(fiberGrain-.5)*.34;
        diffuseColor.rgb *= coatValue;`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
        vec3 r1=cross(dpy,normal),r2=cross(normal,dpx);
        float determinant=dot(dpx,r1);
        vec3 gradient=sign(determinant)*(dFdx(fiberGrain)*r1+dFdy(fiberGrain)*r2);
        normal=normalize(abs(determinant)*normal-gradient*.00026);`)
  }
  const skin = new THREE.Mesh(geometry, baseMaterial)
  skin.castShadow = true
  skin.receiveShadow = true
  if (includeSkin) group.add(skin)

  const random = seededRandom(seed)
  const sampler = new MeshSurfaceSampler(skin).setRandomGenerator(random).build()
  const n = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3()
  const point = new THREE.Vector3(), curveDirection = new THREE.Vector3(), ribbonNormal = new THREE.Vector3()
  const tip = new THREE.Color(), strand = new THREE.Color()
  const positions = [], normals = [], colors = [], uvs = [], indices = []
  const segments = 4
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n)
    n.normalize()
    const scale = lengthAt(p, n)
    if (scale <= 0) continue
    colorAt(p, c)
    // A low-frequency cell makes neighbouring fibers agree on their length,
    // sweep and shade. Random per-fiber bends were what made the old coat look
    // like a collection of wires instead of compact tufts.
    const cx = Math.floor(p.x * 19), cy = Math.floor(p.y * 19), cz = Math.floor(p.z * 19)
    const cell = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453
    const clump = cell - Math.floor(cell)
    const cellTwist = Math.sin(cx * 269.5 + cy * 183.3 + cz * 419.2) * .5
    const variation = .94 + clump * .06 + (random() - .5) * .015
    c.multiplyScalar(variation)
    if (typeof groom === 'function') groom(p, n, tangent)
    else tangent.set(...groom)
    // Tangential grooming preserves volume without spikes normal to the skin.
    tangent.addScaledVector(n, -tangent.dot(n))
    if (tangent.lengthSq() < 1e-8) {
      tangent.set(Math.abs(n.x) < .8 ? 1 : 0, Math.abs(n.x) < .8 ? 0 : 1, 0)
      tangent.addScaledVector(n, -tangent.dot(n))
    }
    tangent.normalize()
    side.crossVectors(n, tangent).normalize()
    tangent.addScaledVector(side, cellTwist * .16).normalize()
    side.crossVectors(n, tangent).normalize()
    const guard = random() > .94
    const len = length * scale * (.74 + clump * .24 + (random() - .5) * .08) * (guard ? 1.34 : 1)
    // At presentation distance a literal hair-width card falls between pixel
    // centers. A modest coverage width gives the optical density of many fine
    // hairs while preserving a tapered silhouette.
    const w = width * (1.28 + clump * .24)
    const curl = (cellTwist + (random() - .5) * .22) * len * .12
    // Per-fiber frizz breaks ribbon uniformity; tips wander while roots stay put.
    const fzN = (random() - .5) * frizz, fzS = (random() - .5) * frizz * .6
    // Agouti weight: 0 keeps the base color along the whole strand.
    const tipWeight = tipAt ? tipAt(p, tip, guard) : 0
    const offset = positions.length / 3
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      curveDirection.copy(n).multiplyScalar(len * lift * (.12 + .14 * Math.PI * Math.cos(t * Math.PI)))
        .addScaledVector(tangent, len * (.64 + .46 * t))
        .addScaledVector(side, Math.PI * Math.cos(t * Math.PI) * curl)
      // This is the actual card normal: curve × width direction. Calculating
      // it before using the point avoids inheriting the previous fiber's normal
      // (the source of unstable highlights and isolated bright flecks).
      ribbonNormal.crossVectors(curveDirection, side)
      if (ribbonNormal.lengthSq() < 1e-10) ribbonNormal.copy(n)
      else ribbonNormal.normalize()
      // Young coats lie close to the skin. A small mid-shaft lift keeps the
      // volume soft while the groom direction, rather than a large normal arc,
      // carries the visible flow.
      point.copy(p).addScaledVector(n, Math.max(.00035, w * .55) + len * lift * (.12 * t + .14 * Math.sin(t * Math.PI)))
        .addScaledVector(tangent, len * t * (.64 + t * .23))
        .addScaledVector(side, Math.sin(t * Math.PI) * curl + fzS * len * t * t)
        .addScaledVector(n, fzN * len * t * t)
      const taper = w * (1 - t * .93) * .5
      // Deep root shadow for a dense double-coat read; tips carry agouti band.
      const brightness = .58 + .42 * t
      const tipMix = tipWeight * Math.pow(t, 1.5)
      strand.copy(c).lerp(tip, tipMix)
      for (const s of [-1, 1]) {
        positions.push(point.x + side.x * taper * s, point.y + side.y * taper * s, point.z + side.z * taper * s)
        normals.push(ribbonNormal.x, ribbonNormal.y, ribbonNormal.z)
        colors.push(strand.r * brightness, strand.g * brightness, strand.b * brightness)
      }
      uvs.push(0, t, 1, t)
      if (j < segments) {
        const a = offset + j * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  }
  const fibers = new THREE.BufferGeometry()
  fibers.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  fibers.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  fibers.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  fibers.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  fibers.setIndex(indices)
  fibers.computeBoundingSphere()
  const hair = new THREE.Mesh(fibers, new THREE.MeshPhysicalMaterial({
    vertexColors: true, alphaMap: FUR_STRAND_ALPHA, alphaTest: .12, alphaToCoverage: true,
    roughness: .96, sheen: .075, sheenRoughness: 1, sheenColor: new THREE.Color(0x8a7a64),
    side: THREE.DoubleSide,
  }))
  hair.receiveShadow = true
  // The closed undercoat casts the shadow; fine fibers soften the silhouette.
  group.add(hair)
  group.userData.fiberCount = positions.length / ((segments + 1) * 6)
  return group
}
