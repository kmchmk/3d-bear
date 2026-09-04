import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

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
  const baseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  // Fine undercoat grain remains visible between individual guard hairs.
  baseMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 coatPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ncoatPosition = position;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 coatPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = fract(sin(dot(floor(coatPosition * 2100.0), vec3(12.9898,78.233,41.45))) * 43758.5453);
        diffuseColor.rgb *= 0.72 + 0.30 * grain;`)
  }
  const skin = new THREE.Mesh(geometry, baseMaterial)
  skin.castShadow = true
  skin.receiveShadow = true
  group.add(skin)

  const random = seededRandom(seed)
  const sampler = new MeshSurfaceSampler(skin).setRandomGenerator(random).build()
  const n = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3()
  const point = new THREE.Vector3()
  const positions = [], normals = [], colors = [], indices = []
  const segments = 3
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n)
    const scale = lengthAt(p, n)
    if (scale <= 0) continue
    colorAt(p, c)
    const variation = 0.78 + random() * 0.40
    c.multiplyScalar(variation)
    if (typeof groom === 'function') groom(p, n, tangent)
    else tangent.set(...groom)
    // Tangential grooming preserves volume without spikes normal to the skin.
    tangent.addScaledVector(n, -tangent.dot(n)).normalize()
    side.crossVectors(n, tangent)
    if (side.lengthSq() < 0.01) side.crossVectors(n, new THREE.Vector3(1, 0, 0))
    side.normalize()
    const len = length * scale * (0.55 + random() * 0.90)
    const w = width * (0.60 + random() * 0.65)
    const curl = (random() - 0.5) * len * 0.23
    const offset = positions.length / 3
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      point.copy(p).addScaledVector(n, len * t * (0.66 - 0.27 * t))
        .addScaledVector(tangent, len * t * (0.38 + t * 0.50))
        .addScaledVector(side, Math.sin(t * Math.PI * 0.8) * curl)
      const taper = w * (1 - t * 0.94) * 0.5
      for (const s of [-1, 1]) {
        positions.push(point.x + side.x * taper * s, point.y + side.y * taper * s, point.z + side.z * taper * s)
        normals.push(n.x, n.y, n.z)
        const brightness = 0.78 + 0.27 * t
        colors.push(c.r * brightness, c.g * brightness, c.b * brightness)
      }
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
  fibers.setIndex(indices)
  fibers.computeBoundingSphere()
  const hair = new THREE.Mesh(fibers, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, side: THREE.DoubleSide,
  }))
  hair.receiveShadow = true
  // The closed undercoat casts the shadow; fine fibers soften the silhouette.
  group.add(hair)
  group.userData.fiberCount = positions.length / ((segments + 1) * 6)
  return group
}
