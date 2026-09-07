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
  colorAt, lengthAt = () => 1, seed = 173
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
    vertexColors: true, roughness: .88, sheen: .18, sheenRoughness: .88,
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
        float grain = coatNoise(coatPosition * 150.0);
        float coatValue = .83 + (patches - .5) * .18 + (grain - .5) * .055;
        diffuseColor.rgb *= coatValue;`)
  }
  const skin = new THREE.Mesh(geometry, baseMaterial)
  skin.castShadow = true
  skin.receiveShadow = true
  group.add(skin)

  const random = seededRandom(seed)
  const sampler = new MeshSurfaceSampler(skin).setRandomGenerator(random).build()
  const n = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3()
  const point = new THREE.Vector3()
  const positions = [], normals = [], colors = [], uvs = [], indices = []
  const segments = 3
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
    const variation = .82 + clump * .18 + (random() - .5) * .055
    c.multiplyScalar(variation)
    if (typeof groom === 'function') groom(p, n, tangent)
    else tangent.set(...groom)
    // Tangential grooming preserves volume without spikes normal to the skin.
    tangent.addScaledVector(n, -tangent.dot(n)).normalize()
    side.crossVectors(n, tangent)
    if (side.lengthSq() < 0.01) side.crossVectors(n, new THREE.Vector3(1, 0, 0))
    side.normalize()
    tangent.addScaledVector(side, cellTwist * .13).normalize()
    side.crossVectors(n, tangent).normalize()
    const guard = random() > .94
    const len = length * scale * (.73 + clump * .24 + (random() - .5) * .10) * (guard ? 1.28 : 1)
    const w = width * (.66 + clump * .26)
    const curl = (cellTwist + (random() - .5) * .18) * len * .09
    const offset = positions.length / 3
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      // Young coats lie close to the skin. A small mid-shaft lift keeps the
      // volume soft while the groom direction, rather than a large normal arc,
      // carries the visible flow.
      point.copy(p).addScaledVector(n, len * (.12 * t + .14 * Math.sin(t * Math.PI)))
        .addScaledVector(tangent, len * t * (.64 + t * .23))
        .addScaledVector(side, Math.sin(t * Math.PI) * curl)
      const taper = w * (1 - t * .90) * .5
      for (const s of [-1, 1]) {
        positions.push(point.x + side.x * taper * s, point.y + side.y * taper * s, point.z + side.z * taper * s)
        normals.push(n.x, n.y, n.z)
        const brightness = .76 + .18 * t
        colors.push(c.r * brightness, c.g * brightness, c.b * brightness)
      }
      uvs.push(0, t, 1, t)
      if (j < segments) {
        const a = offset + j * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
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
    vertexColors: true, alphaMap: FUR_STRAND_ALPHA, alphaTest: .12,
    roughness: .72, sheen: .42, sheenRoughness: .72, sheenColor: new THREE.Color(0x9e8a70),
    side: THREE.DoubleSide,
  }))
  hair.receiveShadow = true
  // The closed undercoat casts the shadow; fine fibers soften the silhouette.
  group.add(hair)
  group.userData.fiberCount = positions.length / ((segments + 1) * 6)
  return group
}
