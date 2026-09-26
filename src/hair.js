import * as THREE from 'three'
import { furUniforms } from './fur.js'

// Guard hairs: individual camera-facing strands scattered over the skin, on top of the
// shell undercoat. They follow the same groom (furComb, gravity) as the shells, so the
// two layers agree, but they break up the silhouette and show which way the coat lies.
// Shading is Kajiya–Kay (tangent-based) so strands get the long hair highlight.

export const hairUniforms = {
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, // view space, set per frame
  uRimDir: { value: new THREE.Vector3(0, 0, -1) },
  uKeyColor: { value: new THREE.Color(1, 1, 1) },
  uRimColor: { value: new THREE.Color(1, 1, 1) },
  uSky: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uGround: { value: new THREE.Color(0.3, 0.25, 0.2) },
  uViewportH: { value: 800 },
}

const SEGMENTS = 5

function rand(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Scatter strand roots over the mesh, area-weighted, where the coat is long enough.
export function createHair(geometry, { perArea = 16000, minLen = 0.012, lengthScale = 1.25, width = 0.0016, seed = 1, lift = 0.7, clump = 0.55 } = {}) {
  const pos = geometry.attributes.position.array
  const nor = geometry.attributes.normal.array
  const col = geometry.attributes.color.array
  const len = geometry.attributes.furLen.array
  const comb = geometry.attributes.furComb.array
  const idx = geometry.index.array
  const rnd = rand(seed * 7919)

  const roots = [], normals = [], colors = [], combs = [], lens = [], seeds = [], clumps = []
  // Strands in the same small cell converge on that cell's first root (tufts).
  const CELL = 0.022, centres = new Map()
  const v = [0, 0, 0]
  const lerp3 = (arr, a, b, c, u, w, out) => {
    const s = 1 - u - w
    for (let k = 0; k < 3; k++) out[k] = arr[a * 3 + k] * s + arr[b * 3 + k] * u + arr[c * 3 + k] * w
    return out
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    const la = (len[a] + len[b] + len[c]) / 3
    if (la < minLen) continue
    const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2]
    const fx = pos[c * 3] - pos[a * 3], fy = pos[c * 3 + 1] - pos[a * 3 + 1], fz = pos[c * 3 + 2] - pos[a * 3 + 2]
    const area = 0.5 * Math.hypot(ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx)
    let n = area * perArea
    let count = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0)
    for (let i = 0; i < count; i++) {
      let u = rnd(), w = rnd()
      if (u + w > 1) { u = 1 - u; w = 1 - w }
      const r = lerp3(pos, a, b, c, u, w, v)
      roots.push(...r)
      const key = `${Math.floor(r[0] / CELL)},${Math.floor(r[1] / CELL)},${Math.floor(r[2] / CELL)}`
      if (!centres.has(key)) centres.set(key, [r[0], r[1], r[2]])
      const cc = centres.get(key)
      clumps.push(cc[0] - r[0], cc[1] - r[1], cc[2] - r[2])
      const nn = lerp3(nor, a, b, c, u, w, [0, 0, 0])
      const nl = Math.hypot(...nn) || 1
      normals.push(nn[0] / nl, nn[1] / nl, nn[2] / nl)
      colors.push(...lerp3(col, a, b, c, u, w, v))
      combs.push(...lerp3(comb, a, b, c, u, w, v))
      const l0 = len[a] * (1 - u - w) + len[b] * u + len[c] * w
      lens.push(l0 * lengthScale * (0.75 + 0.5 * rnd()))
      seeds.push(rnd())
    }
  }

  // One strand = a ribbon of SEGMENTS quads, expanded to face the camera in the shader.
  const base = new THREE.InstancedBufferGeometry()
  const ts = [], sides = [], index = []
  for (let s = 0; s <= SEGMENTS; s++) {
    ts.push(s / SEGMENTS, s / SEGMENTS)
    sides.push(-1, 1)
    if (s < SEGMENTS) {
      const i = s * 2
      index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
    }
  }
  base.setAttribute('position', new THREE.Float32BufferAttribute(new Array(ts.length * 3).fill(0), 3))
  base.setAttribute('t', new THREE.Float32BufferAttribute(ts, 1))
  base.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1))
  base.setIndex(index)
  base.setAttribute('iRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 3))
  base.setAttribute('iNormal', new THREE.InstancedBufferAttribute(new Float32Array(normals), 3))
  base.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3))
  base.setAttribute('iComb', new THREE.InstancedBufferAttribute(new Float32Array(combs), 3))
  base.setAttribute('iLen', new THREE.InstancedBufferAttribute(new Float32Array(lens), 1))
  base.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
  base.setAttribute('iClump', new THREE.InstancedBufferAttribute(new Float32Array(clumps), 3))
  base.instanceCount = lens.length

  const material = new THREE.ShaderMaterial({
    uniforms: { ...furUniforms, ...hairUniforms, uWidth: { value: width }, uLift: { value: lift }, uClump: { value: clump } },
    vertexShader: /* glsl */`
      attribute float t;
      attribute float side;
      attribute vec3 iRoot, iNormal, iColor, iComb, iClump;
      attribute float iLen, iSeed;
      uniform vec3 uGravity, uWind;
      uniform float uTime, uWidth, uViewportH, uLift, uClump;
      varying vec3 vColor;
      varying vec3 vTangent;
      varying vec3 vNormalV;
      varying float vT, vAlpha;
      void main() {
        float sway = sin(uTime * 1.7 + iRoot.x * 9.0 + iRoot.y * 7.0) * 0.5 + 0.5;
        // Each strand wanders a little from the groom so the coat isn't combed flat.
        vec3 jitter = (vec3(fract(iSeed * 13.1), fract(iSeed * 71.7), fract(iSeed * 37.3)) - 0.5) * 0.7;
        vec3 bend = iComb * 0.85 + uGravity * 0.35 + uWind * sway + jitter * 0.35;
        // Soft wave along the strand, perpendicular to the groom.
        vec3 waveDir = normalize(cross(iNormal, iComb + vec3(1e-3)));
        float wave = sin(t * 4.0 + iSeed * 40.0) * 0.12 * t;
        vec3 p = iRoot + iNormal * iLen * t * uLift + bend * iLen * t * t
          + iClump * uClump * t * t + waveDir * wave * iLen;
        vec3 tangent = normalize(iNormal * uLift + 2.0 * bend * t + 2.0 * iClump * uClump * t / max(iLen, 1e-3));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 tv = normalize((modelViewMatrix * vec4(tangent, 0.0)).xyz);
        vec3 across = normalize(cross(tv, normalize(-mv.xyz)));
        // Keep strands at least ~0.8px wide; fade thinner ones instead of letting them alias.
        float w = uWidth * (1.0 - 0.85 * t);
        float pxPerUnit = projectionMatrix[1][1] * uViewportH * 0.5 / max(-mv.z, 1e-3);
        float px = w * pxPerUnit;
        float minPx = 0.8;
        vAlpha = clamp(px / minPx, 0.15, 1.0);
        w = max(w, minPx / pxPerUnit);
        mv.xyz += across * side * w * 0.5;
        gl_Position = projectionMatrix * mv;
        vColor = iColor;
        vTangent = tv;
        vNormalV = normalize(normalMatrix * iNormal);
        vT = t;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uKeyDir, uRimDir, uKeyColor, uRimColor, uSky, uGround;
      varying vec3 vColor;
      varying vec3 vTangent;
      varying vec3 vNormalV;
      varying float vT, vAlpha;
      void main() {
        vec3 T = normalize(vTangent);
        vec3 V = vec3(0.0, 0.0, 1.0);
        float tl = dot(T, uKeyDir);
        float diffuse = sqrt(max(0.0, 1.0 - tl * tl));
        // Wrap with the skin normal so strands on the shadowed side stay darker.
        float facing = clamp(dot(vNormalV, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        vec3 H = normalize(uKeyDir + V);
        float th = dot(T, H);
        float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 48.0) * facing;
        float trl = dot(T, uRimDir);
        float rim = sqrt(max(0.0, 1.0 - trl * trl)) * pow(clamp(dot(vNormalV, uRimDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
        vec3 ambient = mix(uGround, uSky, vNormalV.y * 0.5 + 0.5);
        float occlusion = mix(0.5, 1.0, vT);
        vec3 albedo = vColor * mix(0.85, 1.12, vT);
        vec3 color = albedo * (ambient * occlusion + uKeyColor * diffuse * facing * occlusion)
          + uKeyColor * spec * 0.12 + albedo * uRimColor * rim * 0.6;
        gl_FragColor = vec4(color, vAlpha * (1.0 - smoothstep(0.75, 1.0, vT)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  material.alphaToCoverage = true
  material.side = THREE.DoubleSide
  const mesh = new THREE.Mesh(base, material)
  mesh.frustumCulled = false
  mesh.name = 'guard-hair'
  return mesh
}
