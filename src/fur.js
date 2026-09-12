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
  colorAt, lengthAt = () => 1, tipAt = null, frizz = .12, lift = 1, seed = 173
} = {}) {
  const group = new THREE.Group()
  const p = new THREE.Vector3(), c = new THREE.Color()
  const color = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    p.fromBufferAttribute(geometry.attributes.position, i)
    colorAt(p, c)
    c.toArray(color, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  const baseMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .94, sheen: .08, sheenRoughness: .92,
  })
  // The undercoat has broad, quiet tonal variation plus a fine fiber grain.
  // It gives the dense core depth without turning the surface into sand.
  baseMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 coatPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ncoatPosition = position;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 coatPosition;
      float coatHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
      float coatNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(coatHash(i), coatHash(i + vec3(1.,0.,0.)), f.x),
                       mix(coatHash(i + vec3(0.,1.,0.)), coatHash(i + vec3(1.,1.,0.)), f.x), f.y),
                   mix(mix(coatHash(i + vec3(0.,0.,1.)), coatHash(i + vec3(1.,0.,1.)), f.x),
                       mix(coatHash(i + vec3(0.,1.,1.)), coatHash(i + vec3(1.,1.,1.)), f.x), f.y), f.z);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float patches = coatNoise(coatPosition * 13.0);
        float grain = coatNoise(coatPosition * 165.0);
        float strands = coatNoise(coatPosition * vec3(90.0, 260.0, 90.0));
        float coatValue = .91 + (patches - .5) * .09 + (grain - .5) * .030 + (strands - .5) * .030;
        diffuseColor.rgb *= coatValue;`)
  }
  const skin = new THREE.Mesh(geometry, baseMaterial)
  skin.castShadow = true
  skin.receiveShadow = true
  group.add(skin)

  const random = seededRandom(seed)
  const sampler = new MeshSurfaceSampler(skin).setRandomGenerator(random).build()
  const n = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3()
  const point = new THREE.Vector3(), curveDirection = new THREE.Vector3(), strandNormal = new THREE.Vector3()
  const tip = new THREE.Color(), strand = new THREE.Color()
  const positions = [], normals = [], colors = [], uvs = [], indices = []
  const segments = 4
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n)
    const scale = lengthAt(p, n)
    if (scale <= 0) continue
    colorAt(p, c)
    // A low-frequency cell makes neighbouring fibers agree on their length,
    // sweep and shade. Random per-fiber bends were what made the old coat look
    // like a collection of wires instead of compact tufts.
    const cx = Math.floor(p.x * 23), cy = Math.floor(p.y * 23), cz = Math.floor(p.z * 23)
    const cell = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453
    const clump = cell - Math.floor(cell)
    const cellTwist = Math.sin(cx * 269.5 + cy * 183.3 + cz * 419.2) * .5
    const variation = .93 + clump * .07 + (random() - .5) * .02
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
    tangent.addScaledVector(side, cellTwist * .13).normalize()
    side.crossVectors(n, tangent).normalize()
    const guard = random() > .94
    const len = length * scale * (.72 + clump * .26 + (random() - .5) * .12) * (guard ? 1.34 : 1)
    const w = width * (.62 + clump * .28)
    const curl = (cellTwist + (random() - .5) * .22) * len * .12
    // Per-fiber frizz breaks ribbon uniformity; tips wander while roots stay put.
    const fzN = (random() - .5) * frizz, fzS = (random() - .5) * frizz * .6
    // Agouti weight: 0 keeps the base color along the whole strand.
    const tipWeight = tipAt ? tipAt(p, tip, guard) : 0
    const offset = positions.length / 3
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      // Young coats lie close to the skin. A small mid-shaft lift keeps the
      // volume soft while the groom direction, rather than a large normal arc,
      // carries the visible flow.
      point.copy(p).addScaledVector(n, len * lift * (.12 * t + .14 * Math.sin(t * Math.PI)))
        .addScaledVector(tangent, len * t * (.64 + t * .23))
        .addScaledVector(side, Math.sin(t * Math.PI) * curl + fzS * len * t * t)
        .addScaledVector(strandNormal, fzN * len * t * t)
      curveDirection.copy(n).multiplyScalar(len * (.12 + .14 * Math.PI * Math.cos(t * Math.PI)))
        .addScaledVector(tangent, len * (.64 + .46 * t))
        .addScaledVector(side, Math.PI * Math.cos(t * Math.PI) * curl)
      strandNormal.crossVectors(curveDirection, side).normalize()
      const taper = w * (1 - t * .93) * .5
      // Deep root shadow for a dense double-coat read; tips carry agouti band.
      const brightness = .68 + .32 * t
      const tipMix = tipWeight * Math.pow(t, 1.5)
      strand.copy(c).lerp(tip, tipMix)
      for (const s of [-1, 1]) {
        positions.push(point.x + side.x * taper * s, point.y + side.y * taper * s, point.z + side.z * taper * s)
        normals.push(strandNormal.x, strandNormal.y, strandNormal.z)
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
    vertexColors: true, alphaMap: FUR_STRAND_ALPHA, alphaTest: .13, alphaToCoverage: true,
    roughness: .86, sheen: .22, sheenRoughness: .82, sheenColor: new THREE.Color(0x8a7a64),
    side: THREE.DoubleSide,
  }))
  hair.receiveShadow = true
  // The closed undercoat casts the shadow; fine fibers soften the silhouette.
  group.add(hair)
  group.userData.fiberCount = positions.length / ((segments + 1) * 6)
  return group
}
