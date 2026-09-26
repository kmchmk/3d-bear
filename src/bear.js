import * as THREE from 'three'
import {
  clamp, mix, smoothstep, smin, smax, sphere, ellipsoid, roundCone, segment, triangle2, noise3, polygonize,
} from './sdf.js'
import { createFurMesh } from './fur.js'
import { createHair } from './hair.js'

// Bear: a red Pomsky-type puppy, sitting. Rest-pose coordinates are in "puppy units"
// (floor at y = 0, ~1.2 tall to the ear tips, facing +z). Every part is an SDF in that
// shared space, so markings and fur length are painted by position and line up across
// part boundaries.

// Palette sampled from the reference photos, then nudged toward albedo.
const hex = h => new THREE.Color(h)
const C = {
  ginger: hex('#aa6a3e'),
  gingerDeep: hex('#8a4b27'),
  gingerLight: hex('#c48a5a'),
  cream: hex('#e8c49a'),
  white: hex('#eedfc8'),
  mask: hex('#6b4128'),
  maskDark: hex('#3b271e'),
  skin: hex('#3a2620'),
  earPink: hex('#9a5a4a'),
  lip: hex('#2a1614'),
  gum: hex('#4a2226'),
}

const L = (x, y, z) => [x, y, z]
const sym = (p, s) => [p[0] * s, p[1], p[2]]

// ---------- Anatomy ----------------------------------------------------------------

const EYE = { r: 0.0255, y: 0.934, z: 0.222, x: 0.052, slant: 0.2 }
export const EYE_POS = [L(-EYE.x, EYE.y, EYE.z), L(EYE.x, EYE.y, EYE.z)]
// Almond-shaped distance to an eye opening, outer corner raised (in multiples of EYE.r).
export function eyeAlmond(x, y, z) {
  let best = 1e9
  for (const e of EYE_POS) {
    const s = Math.sign(e[0])
    const dx = (x - e[0]) * s, dy = y - e[1], dz = z - e[2]
    const c = Math.cos(EYE.slant), sn = Math.sin(EYE.slant)
    const u = dx * c - dy * sn, v = dx * sn + dy * c
    best = Math.min(best, Math.hypot(u / 1.02, v / 0.66, Math.max(dz, 0) / 2.2 + Math.min(dz, 0) / 1.0) / EYE.r)
  }
  return best
}
export const NECK_PIVOT = L(0, 0.76, 0.07)
export const TAIL_PIVOT = L(0, 0.19, -0.3)
export const EAR_PIVOT = [L(-0.086, 1.035, 0.05), L(0.086, 1.035, 0.05)]
export const NOSE_POS = L(0, 0.878, 0.39)
export const COLLAR = { c: L(0, 0.7, 0.07), r: 0.14, tilt: 0.32 }

// Mouth geometry shared by the sculpt and the paint: the roof (underside of the upper
// muzzle) and the top of the lower jaw, as heights at a given depth z.
const JAW = { a: L(0, 0.815, 0.19), b: L(0, 0.77, 0.333), ra: 0.043, rb: 0.026 }
const mouthRoof = z => mix(0.828, 0.826, smoothstep(0.22, 0.38, z))
function jawTop(z) {
  const t = clamp((z - JAW.a[2]) / (JAW.b[2] - JAW.a[2]), 0, 1)
  return mix(JAW.a[1], JAW.b[1], t) + mix(JAW.ra, JAW.rb, t)
}

function headSDF(x, y, z) {
  const ax = Math.abs(x)
  // Skull: broad and rounded, as a puppy's is.
  let d = ellipsoid(x, y, z, L(0, 0.945, 0.11), L(0.14, 0.125, 0.132))
  // Cheeks / zygomatic fluff base.
  d = smin(d, ellipsoid(ax, y, z, L(0.072, 0.875, 0.17), L(0.08, 0.07, 0.08)), 0.05)
  // Rounded forehead above the eyes gives a clear stop.
  d = smin(d, ellipsoid(x, y, z, L(0, 0.975, 0.17), L(0.085, 0.055, 0.06)), 0.04)
  // Muzzle: broad at the stop, moderately long (husky side of the cross).
  d = smin(d, roundCone(x, y, z, L(0, 0.893, 0.2), L(0, 0.874, 0.352), 0.071, 0.046), 0.04)
  // Upper lips (flews) hang at the sides and close the mouth corners.
  d = smin(d, roundCone(ax, y, z, L(0.036, 0.853, 0.22), L(0.024, 0.846, 0.342), 0.036, 0.021), 0.02)
  // Lower jaw, dropped open for a relaxed pant.
  d = smin(d, roundCone(x, y, z, JAW.a, JAW.b, JAW.ra, JAW.rb), 0.006)
  // Neck, overlapping the body so turns never open a gap.
  d = smin(d, roundCone(x, y, z, L(0, 0.64, 0.035), L(0, 0.88, 0.07), 0.125, 0.105), 0.06)
  // Eye sockets.
  d = smax(d, -(eyeAlmond(x, y, z) - 1) * EYE.r, 0.006)
  return d
}

function bodySDF(x, y, z) {
  const ax = Math.abs(x)
  let d = ellipsoid(x, y, z, L(0, 0.55, 0.08), L(0.185, 0.22, 0.175)) // chest
  d = smin(d, roundCone(x, y, z, L(0, 0.52, 0.02), L(0, 0.24, -0.13), 0.17, 0.2), 0.08) // torso
  d = smin(d, ellipsoid(x, y, z, L(0, 0.19, -0.14), L(0.215, 0.19, 0.21)), 0.06) // rump
  d = smin(d, roundCone(x, y, z, L(0, 0.62, 0.04), L(0, 0.8, 0.07), 0.13, 0.11), 0.06) // neck base
  // Haunches: thighs folded forward along the floor.
  d = smin(d, ellipsoid(ax, y, z, L(0.15, 0.175, -0.05), L(0.105, 0.135, 0.17)), 0.05)
  // Hind feet: hock to toes, lying flat.
  d = smin(d, roundCone(ax, y, z, L(0.15, 0.07, -0.17), L(0.165, 0.038, 0.06), 0.052, 0.042), 0.035)
  d = smin(d, ellipsoid(ax, y, z, L(0.17, 0.042, 0.1), L(0.066, 0.044, 0.078)), 0.02)
  for (const [tx, tz] of [[0.148, 0.16], [0.17, 0.168], [0.192, 0.16]]) {
    d = smin(d, ellipsoid(ax, y, z, L(tx, 0.024, tz), L(0.021, 0.024, 0.024)), 0.012)
  }
  // Forelegs: straight and planted, a bit apart.
  d = smin(d, roundCone(ax, y, z, L(0.092, 0.5, 0.09), L(0.1, 0.075, 0.16), 0.074, 0.058), 0.05)
  // Big puppy paws: a pad plus four rounded toes.
  d = smin(d, ellipsoid(ax, y, z, L(0.1, 0.04, 0.18), L(0.064, 0.042, 0.065)), 0.03)
  for (const [tx, tz, r] of [[0.07, 0.235, 0.022], [0.092, 0.248, 0.024], [0.116, 0.246, 0.024], [0.136, 0.23, 0.021]]) {
    d = smin(d, ellipsoid(ax, y, z, L(tx, 0.026, tz), L(r, 0.026, r * 1.15)), 0.012)
  }
  return smax(d, -y + 0.004, 0.01) // flat on the floor
}

const TAIL_PTS = [L(0, 0.2, -0.29), L(0.03, 0.13, -0.39), L(0.12, 0.075, -0.45), L(0.24, 0.062, -0.43), L(0.33, 0.06, -0.33), L(0.37, 0.06, -0.21)]
const TAIL_R = [0.058, 0.056, 0.05, 0.045, 0.038, 0.026]
function tailSDF(x, y, z) {
  let d = 1e9
  for (let i = 0; i < TAIL_PTS.length - 1; i++) {
    d = smin(d, roundCone(x, y, z, TAIL_PTS[i], TAIL_PTS[i + 1], TAIL_R[i], TAIL_R[i + 1]), 0.02)
  }
  return smax(d, -y + 0.02, 0.01)
}
// 0..1 along the tail, and the local direction toward the tip.
function tailParam(x, y, z) {
  let best = 1e9, s = 0, dir = [0, 0, 1]
  for (let i = 0; i < TAIL_PTS.length - 1; i++) {
    const [dd, t] = segment(x, y, z, TAIL_PTS[i], TAIL_PTS[i + 1])
    if (dd < best) {
      best = dd
      s = (i + t) / (TAIL_PTS.length - 1)
      const a = TAIL_PTS[i], b = TAIL_PTS[i + 1]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]
    }
  }
  return { s, dir }
}

// Ear in its own frame: base centred on the origin, tip up +y, front facing +z.
const EAR = { hw: 0.084, h: 0.145, t: 0.018 }
function earSDF(x, y, z) {
  const zc = z - 1.6 * x * x - 0.2 * (y / EAR.h) * 0.05 // edges curl forward into a cup
  const tri = triangle2(x, EAR.h - y, EAR.hw, EAR.h) - 0.015
  const slab = Math.abs(zc) - EAR.t
  let d = Math.min(Math.max(tri, slab), 0) + Math.hypot(Math.max(tri, 0), Math.max(slab, 0)) - 0.006
  // Hollow of the ear.
  d = smax(d, -ellipsoid(x, y, zc, L(0, 0.065, 0.03), L(0.052, 0.1, 0.022)), 0.01)
  // Thick fluffy base where it joins the head.
  d = smin(d, ellipsoid(x, y, z, L(0, 0.0, -0.01), L(0.07, 0.035, 0.04)), 0.02)
  return d
}

// ---------- Coat painting ------------------------------------------------------------

const tmp = new THREE.Color()
function lerpColor(out, c, t) { return out.lerp(c, clamp(t, 0, 1)) }

function paintBody(x, y, z, n) {
  const ax = Math.abs(x)
  const col = C.ginger.clone()
  const grain = noise3(x * 14, y * 14, z * 14)
  // Deeper red saddle along the back and the top of the rump.
  lerpColor(col, C.gingerDeep, smoothstep(0.2, 0.45, y) * smoothstep(0.0, -0.2, z) * (1 - smoothstep(0.08, 0.16, ax)) * 0.7)
  lerpColor(col, C.gingerDeep, smoothstep(0.3, 0.9, n[1]) * smoothstep(0.05, -0.2, z) * 0.5)
  // Cream bib: front of chest down between the forelegs.
  const bib = smoothstep(0.04, 0.12, z + 0.03 * (0.65 - y)) * (1 - smoothstep(0.045, 0.085, ax)) * smoothstep(0.3, 0.42, y) * (1 - smoothstep(0.7, 0.78, y))
  lerpColor(col, C.cream, bib)
  // Cream on the throat and under the neck.
  lerpColor(col, C.cream, smoothstep(0.04, 0.12, z) * smoothstep(0.62, 0.7, y) * (1 - smoothstep(0.05, 0.1, ax)) * 0.9)
  // Pale backs of the forelegs and inside of the thighs.
  lerpColor(col, C.cream, smoothstep(0.2, 0.6, -n[2]) * smoothstep(0.35, 0.2, y) * smoothstep(0.1, 0.2, z) * 0.6)
  lerpColor(col, C.cream, smoothstep(0.4, 0.9, -n[0] * Math.sign(x || 1)) * smoothstep(0.3, 0.1, y) * 0.45)
  // Belly and underside of the rump.
  lerpColor(col, C.cream, smoothstep(-0.2, -0.8, n[1]) * 0.8)
  // White socks and feet.
  lerpColor(col, C.white, smoothstep(0.1, 0.05, y) * smoothstep(0.02, 0.1, z + 0.12))
  lerpColor(col, C.white, smoothstep(0.1, 0.05, y) * smoothstep(0.1, 0.18, ax))
  // Lighter flanks where the undercoat shows.
  lerpColor(col, C.gingerLight, (grain - 0.5) * 0.6 + smoothstep(0.1, 0.18, ax) * smoothstep(0.25, 0.1, y) * 0.3)

  // Fur length: fluffy ruff and chest, medium body, short legs and feet.
  let len = 0.06
  len = mix(len, 0.095, smoothstep(0.52, 0.7, y) * smoothstep(-0.05, 0.08, z)) // ruff
  len = mix(len, 0.08, bib)
  len = mix(len, 0.075, smoothstep(0.15, -0.1, z) * smoothstep(0.3, 0.12, y)) // pants
  len = mix(len, 0.03, smoothstep(0.4, 0.18, y) * smoothstep(0.1, 0.16, z) * (1 - smoothstep(0.13, 0.16, ax))) // forelegs
  len = mix(len, 0.02, smoothstep(0.09, 0.04, y)) // toes
  len *= 0.85 + 0.3 * grain
  len *= collarPress(x, y, z)
  len *= smoothstep(0.0, 0.02, y)

  // Groom: down the legs, back and down on the body, down and out on the ruff.
  let comb = [0, -0.55, -0.6]
  if (y < 0.45 && z > 0.08 && ax < 0.14) comb = [0, -1, 0.1]
  if (y > 0.5) comb = [x * 1.5, -0.8, 0.25]
  return { col, len, comb }
}

function paintHead(x, y, z, n) {
  const ax = Math.abs(x)
  const col = C.ginger.clone()
  const grain = noise3(x * 16, y * 16, z * 16)
  lerpColor(col, C.gingerDeep, smoothstep(0.95, 1.06, y) * 0.45)
  const roof = mouthRoof(z)
  const onMuzzle = smoothstep(0.19, 0.225, z)
  // Cream cheek fans below and outside the eyes, sweeping down to the jaw.
  const cheek = smoothstep(0.92, 0.88, y + 0.3 * Math.max(0, ax - 0.1)) * smoothstep(0.055, 0.085, ax) * smoothstep(0.05, 0.13, z)
  lerpColor(col, C.cream, cheek)
  // Cream eyebrow dots.
  for (const s of [-1, 1]) {
    const d = Math.hypot(x - s * 0.056, y - 0.975, z - 0.2)
    lerpColor(col, C.cream, smoothstep(0.024, 0.01, d) * 0.7)
  }
  // Chin, lower jaw and throat.
  lerpColor(col, C.white, smoothstep(roof - 0.01, roof - 0.03, y) * onMuzzle)
  lerpColor(col, C.cream, smoothstep(0.84, 0.76, y) * smoothstep(0.0, 0.1, z) * (1 - smoothstep(0.07, 0.13, ax)))
  // Chocolate mask: the whole upper muzzle down to the lip, up the bridge between the
  // eyes and softly into the forehead.
  const maskMuzzle = smoothstep(roof + 0.004, roof + 0.016, y) * smoothstep(0.215, 0.245, z) * (1 - smoothstep(0.07, 0.09, ax))
  const maskBridge = smoothstep(0.034, 0.018, ax) * smoothstep(0.99, 0.94, y) * smoothstep(0.16, 0.2, z)
  const mask = Math.max(maskMuzzle, maskBridge)
  lerpColor(col, C.mask, mask)
  lerpColor(col, C.maskDark, maskMuzzle * smoothstep(0.3, 0.36, z) * 0.5)
  // Thin dark eye rims.
  const eyeA = eyeAlmond(x, y, z)
  lerpColor(col, C.maskDark, smoothstep(1.22, 1.05, eyeA))
  // Lips and the inside of the open mouth.
  const lipBand = smoothstep(roof + 0.008, roof, y) * smoothstep(jawTop(z) - 0.012, jawTop(z) - 0.002, y) * smoothstep(0.215, 0.245, z)
  lerpColor(col, C.lip, lipBand)
  // Inside the open mouth (top of the lower jaw): dark gum, no fur.
  const inMouth = smoothstep(0.1, 0.5, n[1]) * smoothstep(roof - 0.004, roof - 0.014, y) * smoothstep(0.215, 0.24, z) * (1 - smoothstep(0.03, 0.045, ax)) * smoothstep(jawTop(z) - 0.02, jawTop(z) - 0.008, y)
  lerpColor(col, C.gum, inMouth)
  lerpColor(col, C.gingerLight, (grain - 0.5) * 0.3 * (1 - lipBand))

  let len = 0.034
  len = mix(len, 0.07, cheek * smoothstep(0.08, 0.12, ax) * smoothstep(0.26, 0.16, z))
  len = mix(len, 0.095, smoothstep(0.84, 0.72, y)) // neck ruff
  len = mix(len, 0.013, onMuzzle * (1 - smoothstep(0.075, 0.1, ax)) * smoothstep(0.95, 0.9, y)) // muzzle
  len = mix(len, 0.018, smoothstep(0.96, 1.05, y) * (1 - smoothstep(0.05, 0.1, ax))) // crown
  len *= mix(0.3, 1, smoothstep(1.4, 2.6, eyeA)) * smoothstep(1.02, 1.2, eyeA) // short fur around the eyes
  len *= (1 - lipBand) * (1 - inMouth)
  len *= smoothstep(0.02, 0.042, Math.hypot(x - NOSE_POS[0], (y - NOSE_POS[1]) * 1.3, z - NOSE_POS[2]))
  len *= 0.85 + 0.3 * grain
  len *= collarPress(x, y, z)

  // Groom: muzzle hair runs back toward the eyes, cheeks flare out and back.
  let comb = [0, -0.25, -0.9]
  if (y < 0.93 && ax > 0.06) comb = [Math.sign(x) * 0.8, -0.3, -0.5]
  if (y < roof && z > 0.2) comb = [x * 3, -0.6, -0.6]
  if (y < 0.8) comb = [x * 2, -0.9, 0.2]
  return { col, len, comb }
}

function paintTail(x, y, z, n) {
  const { s, dir } = tailParam(x, y, z)
  const col = C.ginger.clone()
  lerpColor(col, C.gingerDeep, smoothstep(0.2, 0.8, n[1]) * 0.4)
  lerpColor(col, C.cream, smoothstep(0.3, -0.3, n[1]) + smoothstep(0.55, 0.9, s) * 0.8 + smoothstep(0.2, 0.7, -(x * dir[2] - z * dir[0]) / 0.05) * 0.6)
  lerpColor(col, C.gingerLight, noise3(x * 12, y * 12, z * 12) * 0.3)
  const len = mix(0.1, 0.12, Math.sin(s * Math.PI)) * smoothstep(1.02, 0.9, s + 0.0) + 0.02
  return { col, len, comb: [dir[0] * 1.1, dir[1] * 1.1 + 0.25, dir[2] * 1.1] }
}

function paintEar(x, y, z, n) {
  const col = C.ginger.clone()
  const front = smoothstep(-0.1, 0.35, n[2])
  // Half-width of the ear at this height, and how far inside the hollow we are (0 edge, 1 centre).
  const half = EAR.hw * Math.max(0.05, 1 - y / EAR.h)
  const depth = 1 - Math.abs(x) / half
  const skin = front * smoothstep(0.3, 0.55, depth) * smoothstep(0.01, 0.03, y) * smoothstep(EAR.h * 0.85, EAR.h * 0.6, y)
  const fringe = front * smoothstep(0.05, 0.25, depth) * (1 - skin)
  lerpColor(col, C.cream, fringe * 0.9)
  lerpColor(col, C.earPink, skin)
  let len = 0.011
  len = mix(len, 0.024, fringe) // pale furnishings around the hollow
  len = mix(len, 0.004, skin) // sparse over the pink skin
  len = mix(len, 0.03, front * smoothstep(0.035, 0.0, y)) // tufts at the base
  return { col, len, comb: [x * 3, 0.9, 0.3] }
}

// The collar parts the fur a little.
function collarPress(x, y, z) {
  const dy = y - COLLAR.c[1], dz = z - COLLAR.c[2]
  const planeD = dy * Math.cos(COLLAR.tilt) + dz * Math.sin(COLLAR.tilt)
  return mix(0.08, 1, smoothstep(0.012, 0.04, Math.abs(planeD)))
}

// ---------- Mesh building -----------------------------------------------------------

function buildPart(sdf, paint, min, max, cell, pivot = [0, 0, 0]) {
  const { positions, normals, indices } = polygonize(sdf, min, max, cell)
  const count = positions.length / 3
  const colors = new Float32Array(count * 3)
  const furLen = new Float32Array(count)
  const furComb = new Float32Array(count * 3)
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    const n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]]
    const { col, len, comb } = paint(x, y, z, n)
    colors[v * 3] = col.r; colors[v * 3 + 1] = col.g; colors[v * 3 + 2] = col.b
    furLen[v] = Math.max(0, len)
    // Keep the comb tangent to the skin so strands lie down instead of piercing it.
    const dot = comb[0] * n[0] + comb[1] * n[1] + comb[2] * n[2]
    let cx = comb[0] - n[0] * dot, cy = comb[1] - n[1] * dot, cz = comb[2] - n[2] * dot
    const cl = Math.hypot(cx, cy, cz) || 1
    const m = Math.min(1, Math.hypot(...comb))
    furComb[v * 3] = (cx / cl) * m; furComb[v * 3 + 1] = (cy / cl) * m; furComb[v * 3 + 2] = (cz / cl) * m
    positions[v * 3] -= pivot[0]; positions[v * 3 + 1] -= pivot[1]; positions[v * 3 + 2] -= pivot[2]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('furLen', new THREE.BufferAttribute(furLen, 1))
  g.setAttribute('furComb', new THREE.BufferAttribute(furComb, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  g.computeBoundingSphere()
  return g
}

let furEnabled = true
function furred(geometry, fur, name) {
  const group = new THREE.Group()
  group.name = name
  // Skin/undercoat: darker so gaps between strands read as depth.
  const skin = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, color: furEnabled ? '#a29a90' : '#ffffff', roughness: 0.95 }))
  skin.castShadow = true
  skin.receiveShadow = true
  skin.name = name + '-skin'
  group.add(skin)
  if (furEnabled) {
    group.add(createFurMesh(geometry, fur))
    if (fur.hair) group.add(createHair(geometry, fur.hair))
  }
  return { group, skin }
}

function irisTexture() {
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const g = canvas.getContext('2d')
  g.fillStyle = '#2a1d17'
  g.fillRect(0, 0, s, s)
  const cx = s / 2, cy = s / 2, R = s * 0.47
  const iris = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R)
  iris.addColorStop(0, '#9a8a6a') // faint warm ring around the pupil
  iris.addColorStop(0.3, '#93a9ba')
  iris.addColorStop(0.6, '#7f98ad') // pale ice blue
  iris.addColorStop(0.86, '#5c7288')
  iris.addColorStop(1, '#2c3238')
  g.fillStyle = iris
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  // Radial fibres.
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2 + Math.random() * 0.03
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '220,225,230' : '40,45,50'},${0.08 + Math.random() * 0.1})`
    g.lineWidth = 1 + Math.random() * 1.5
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25)
    g.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95)
    g.stroke()
  }
  g.fillStyle = '#050405'
  g.beginPath(); g.ellipse(cx, cy, R * 0.36, R * 0.38, 0, 0, Math.PI * 2); g.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function buildEye(tex) {
  const group = new THREE.Group()
  const geo = new THREE.SphereGeometry(EYE.r, 40, 28)
  // Planar-project the iris onto the front (+z) hemisphere.
  const pos = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / EYE.r * 0.5, 0.5 + pos.getY(i) / EYE.r * 0.5)
  const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, envMapIntensity: 0.5 }))
  const cornea = new THREE.Mesh(
    new THREE.SphereGeometry(EYE.r * 1.04, 40, 28),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 }),
  )
  // Eyelids: dark-rimmed caps above and below the ball; the gap between them is the almond.
  const lidMat = new THREE.MeshStandardMaterial({ color: '#2b1a12', roughness: 0.6 })
  const lidTop = new THREE.Mesh(new THREE.SphereGeometry(EYE.r * 1.07, 32, 12, 0, Math.PI * 2, 0, 0.86), lidMat)
  const lidBottom = new THREE.Mesh(new THREE.SphereGeometry(EYE.r * 1.06, 32, 12, 0, Math.PI * 2, Math.PI - 1.12, 1.12), lidMat)
  const lidTopPivot = new THREE.Group()
  lidTopPivot.add(lidTop)
  group.add(ball, cornea, lidTopPivot, lidBottom)
  group.userData.lidTop = lidTopPivot
  group.userData.lidBottom = lidBottom
  group.userData.ball = ball
  return group
}

function buildNose() {
  const c = NOSE_POS
  const S = 1.12 // Bear's nose is big and broad
  const sdf = (x, y, z) => noseShape((x - c[0]) / S, (y - c[1]) / S, (z - c[2]) / S, x, y, z) * S
  const noseShape = (px, py, pz, x, y, z) => {
    const ax = Math.abs(px)
    // Wedge: wider across the top, narrowing to the philtrum, flat on top.
    const widen = 1 + 0.45 * clamp(py / 0.018, -1, 1)
    let d = ellipsoid(px / widen, py, pz, [0, 0, 0], [0.026, 0.018, 0.02])
    d = smin(d, ellipsoid(px, py, pz, [0, 0.006, -0.012], [0.026, 0.014, 0.02]), 0.01)
    d = smax(d, py - 0.013, 0.007)
    // Comma-shaped nostrils.
    d = smax(d, -ellipsoid(ax, py, pz, [0.011, -0.001, 0.017], [0.0062, 0.0045, 0.008]), 0.003)
    d = smax(d, -roundCone(ax, py, pz, [0.013, -0.002, 0.015], [0.022, -0.008, 0.008], 0.0022, 0.0012), 0.003)
    // Philtrum groove.
    d = smax(d, -roundCone(ax, py, pz, [0, -0.03, 0.018], [0, -0.004, 0.02], 0.0026, 0.0018), 0.003)
    // Pebbled leather.
    return d + (noise3(x * 260, y * 260, z * 260) - 0.5) * 0.0003
  }
  const { positions, normals, indices } = polygonize(sdf, [c[0] - 0.065, c[1] - 0.055, c[2] - 0.06], [c[0] + 0.065, c[1] + 0.04, c[2] + 0.047], 0.0017)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#5a342d', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45, envMapIntensity: 0.4 }))
  mesh.castShadow = true
  return mesh
}

const TONGUE_PTS = [L(0.004, 0.819, 0.25), L(0.006, 0.806, 0.32), L(0.008, 0.792, 0.354), L(0.01, 0.772, 0.363)]
const TONGUE_PIVOT = L(0, 0.815, 0.26)
function buildTongue() {
  // A flat, slightly cupped tongue lying on the lower jaw and lolling over the lip.
  const sdf = (x, y, z) => {
    let d = 1e9
    for (let i = 0; i < TONGUE_PTS.length - 1; i++) {
      const a = TONGUE_PTS[i], b = TONGUE_PTS[i + 1]
      const dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dy, dz)
      const ty = dy / l, tz = dz / l
      const t = clamp(((y - a[1]) * ty + (z - a[2]) * tz) / l, 0, 1)
      const oy = y - (a[1] + dy * t), oz = z - (a[2] + dz * t)
      const along = oy * ty + oz * tz
      const across = -oy * tz + oz * ty // thickness direction (perpendicular in the yz-plane)
      const w = mix(0.02, 0.017, (i + t) / 3), th = 0.0052
      const cup = 0.004 * (1 - (x / w) ** 2) // centre groove
      const e = Math.hypot(x / w, (across - cup) / th, along / w)
      d = smin(d, (e - 1) * th, 0.004)
    }
    return d
  }
  const { positions, normals, indices } = polygonize(sdf, [-0.04, 0.74, 0.22], [0.04, 0.84, 0.4], 0.0016)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= TONGUE_PIVOT[0]; positions[i + 1] -= TONGUE_PIVOT[1]; positions[i + 2] -= TONGUE_PIVOT[2]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#d46b76', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 }))
  const pivot = new THREE.Group()
  pivot.position.set(...TONGUE_PIVOT)
  pivot.add(mesh)
  // Dark mouth interior behind the tongue.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: '#2a1414', roughness: 0.8 }))
  mouth.scale.set(0.032, 0.02, 0.08)
  mouth.position.set(0, 0.812, 0.275)
  return { pivot, mouth }
}

function buildCollar() {
  const group = new THREE.Group()
  group.position.set(...COLLAR.c)
  group.rotation.x = COLLAR.tilt
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(COLLAR.r, 0.011, 10, 72),
    new THREE.MeshStandardMaterial({ color: '#8c3d4c', roughness: 0.6 }),
  )
  band.scale.set(1, 1, 0.55)
  band.rotation.x = Math.PI / 2
  band.scale.set(1.0, 0.92, 1)
  band.castShadow = true
  group.add(band)
  // Ring and the pale blue ID tag.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 20), new THREE.MeshStandardMaterial({ color: '#c9c3b5', metalness: 1, roughness: 0.3 }))
  ring.position.set(0, -0.012, COLLAR.r * 0.92 + 0.006)
  group.add(ring)
  const tagShape = new THREE.Shape()
  tagShape.absarc(0, 0, 0.022, 0, Math.PI * 2)
  const tag = new THREE.Mesh(
    new THREE.ExtrudeGeometry(tagShape, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }),
    new THREE.MeshPhysicalMaterial({ color: '#a9bde3', roughness: 0.3, clearcoat: 0.8 }),
  )
  tag.scale.set(0.8, 1.15, 1)
  const tagPivot = new THREE.Group()
  tagPivot.position.set(0, -0.01, COLLAR.r * 0.92 + 0.035)
  tagPivot.rotation.x = -COLLAR.tilt
  tag.position.set(0, -0.026, 0)
  tag.castShadow = true
  tagPivot.add(tag)
  group.add(tagPivot)
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), new THREE.MeshPhysicalMaterial({ color: '#6b2f6e', roughness: 0.2, clearcoat: 1 }))
  bead.position.set(0.02, -0.02, 0)
  tagPivot.add(bead)
  return { group, tagPivot }
}

export function buildBear({ quality = 1, fur: withFur = true } = {}) {
  furEnabled = withFur
  const shells = Math.round(mix(14, 30, quality))
  const res = mix(1.45, 1, quality)
  const hairDensity = mix(7000, 22000, quality)
  const fur = { shells, density: 150, hair: { perArea: hairDensity, lengthScale: 1.02, width: 0.0013, seed: 1 } }

  const root = new THREE.Group()
  root.name = 'bear'

  const body = furred(buildPart(bodySDF, paintBody, [-0.3, -0.01, -0.4], [0.3, 0.86, 0.32], 0.0105 * res), fur, 'body')
  root.add(body.group)

  const neck = new THREE.Group()
  neck.position.set(...NECK_PIVOT)
  root.add(neck)
  const headRig = new THREE.Group() // separate node so nods/tilts compose cleanly
  neck.add(headRig)
  const head = furred(buildPart(headSDF, paintHead, [-0.22, 0.6, -0.12], [0.22, 1.1, 0.45], 0.0072 * res, NECK_PIVOT), { ...fur, hair: { ...fur.hair, lift: 0.45, lengthScale: 0.9, seed: 2 } }, 'head')
  headRig.add(head.group)
  headRig.scale.setScalar(1.12)
  headRig.position.set(0, -0.07, 0.01)

  const local = p => [p[0] - NECK_PIVOT[0], p[1] - NECK_PIVOT[1], p[2] - NECK_PIVOT[2]]
  const tex = irisTexture()
  const eyes = EYE_POS.map((p, i) => {
    const eye = buildEye(tex)
    eye.position.set(...local(p))
    eye.rotation.set(0, (i === 0 ? -1 : 1) * 0.14, (i === 0 ? -1 : 1) * 0.07)
    
    headRig.add(eye)
    return eye
  })
  const nose = buildNose()
  nose.position.set(...local([0, 0, 0]))
  headRig.add(nose)
  const { pivot: tongue, mouth } = buildTongue()
  tongue.position.sub(new THREE.Vector3(...NECK_PIVOT))
  mouth.position.sub(new THREE.Vector3(...NECK_PIVOT))
  headRig.add(tongue, mouth)

  const earGeo = buildPart(earSDF, paintEar, [-0.11, -0.06, -0.08], [0.11, 0.2, 0.08], 0.0048 * res)
  const ears = EAR_PIVOT.map((p, i) => {
    const s = i === 0 ? -1 : 1
    const pivot = new THREE.Group()
    pivot.position.set(...local(p))
    const base = new THREE.Group()
    base.rotation.set(-0.1, s * 0.25, s * -0.12) // splayed outward, turned slightly to the side
    pivot.add(base)
    const ear = furred(earGeo, { shells: Math.max(10, Math.round(shells * 0.6)), density: 230}, 'ear')
    base.add(ear.group)
    headRig.add(pivot)
    return pivot
  })

  const tailPivot = new THREE.Group()
  tailPivot.position.set(...TAIL_PIVOT)
  root.add(tailPivot)
  const tail = furred(buildPart(tailSDF, paintTail, [-0.12, 0.0, -0.58], [0.47, 0.3, -0.1], 0.0095 * res, TAIL_PIVOT), fur, 'tail')
  tailPivot.add(tail.group)

  const collar = buildCollar()
  root.add(collar.group)

  return {
    root,
    rig: { neck, headRig, eyes, ears, tail: tailPivot, tongue, tag: collar.tagPivot, chest: body.group },
    pickables: [body.skin, head.skin, tail.skin],
    stats: { shells },
  }
}
