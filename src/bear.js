import * as THREE from 'three'
import {
  clamp, mix, smoothstep, smin, smax, sphere, ellipsoid, roundCone, segment, triangle2, noise3, polygonize,
} from './sdf.js'
import { createFurMesh } from './fur.js'

// Bear: a red Pomsky-type puppy, sitting. Rest-pose coordinates are in "puppy units"
// (floor at y = 0, ~1.2 tall to the ear tips, facing +z). Every part is an SDF in that
// shared space, so markings and fur length are painted by position and line up across
// part boundaries.

// Palette sampled from the reference photos, then nudged toward albedo.
const hex = h => new THREE.Color(h)
const C = {
  ginger: hex('#c47638'),
  gingerDeep: hex('#a35b2a'),
  gingerLight: hex('#d99a5c'),
  cream: hex('#e6c9a0'),
  white: hex('#efe2cc'),
  mask: hex('#5a3d2c'),
  maskDark: hex('#3b271e'),
  skin: hex('#3a2620'),
  earPink: hex('#d4a595'),
}

const L = (x, y, z) => [x, y, z]
const sym = (p, s) => [p[0] * s, p[1], p[2]]

// ---------- Anatomy ----------------------------------------------------------------

const EYE = { r: 0.024, y: 0.93, z: 0.214, x: 0.062 }
export const EYE_POS = [L(-EYE.x, EYE.y, EYE.z), L(EYE.x, EYE.y, EYE.z)]
export const NECK_PIVOT = L(0, 0.76, 0.07)
export const TAIL_PIVOT = L(0, 0.19, -0.3)
export const EAR_PIVOT = [L(-0.088, 1.035, 0.055), L(0.088, 1.035, 0.055)]
export const NOSE_POS = L(0, 0.872, 0.362)
export const COLLAR = { c: L(0, 0.745, 0.07), r: 0.13, tilt: 0.3 }

function headSDF(x, y, z) {
  const ax = Math.abs(x)
  // Skull: broad and rounded, as a puppy's is.
  let d = ellipsoid(x, y, z, L(0, 0.945, 0.11), L(0.138, 0.125, 0.132))
  // Cheeks / zygomatic fluff base.
  d = smin(d, ellipsoid(ax, y, z, L(0.07, 0.875, 0.17), L(0.078, 0.07, 0.078)), 0.05)
  // Brow ridge and stop.
  // Muzzle: short and tapered.
  d = smin(d, roundCone(x, y, z, L(0, 0.888, 0.2), L(0, 0.868, 0.335), 0.066, 0.042), 0.045)
  // Upper lips hang slightly at the sides.
  d = smin(d, roundCone(ax, y, z, L(0.03, 0.856, 0.22), L(0.022, 0.848, 0.325), 0.036, 0.024), 0.02)
  // Lower jaw, parted a touch so the tongue can show.
  const jaw = roundCone(x, y, z, L(0, 0.826, 0.18), L(0, 0.818, 0.3), 0.046, 0.03)
  d = smin(d, jaw, 0.012)
  // Neck, overlapping the body so turns never open a gap.
  d = smin(d, roundCone(x, y, z, L(0, 0.64, 0.035), L(0, 0.88, 0.07), 0.125, 0.105), 0.06)
  // Eye sockets.
  for (const e of EYE_POS) d = smax(d, -sphere(x, y, z, e, EYE.r * 1.12), 0.012)
  // Mouth corner crease.
  d = smax(d, -roundCone(ax, y, z, L(0.035, 0.838, 0.24), L(0.012, 0.84, 0.33), 0.006, 0.004), 0.006)
  return d
}

function bodySDF(x, y, z) {
  const ax = Math.abs(x)
  let d = ellipsoid(x, y, z, L(0, 0.55, 0.075), L(0.175, 0.21, 0.165)) // chest
  d = smin(d, roundCone(x, y, z, L(0, 0.52, 0.02), L(0, 0.24, -0.13), 0.17, 0.2), 0.08) // torso
  d = smin(d, ellipsoid(x, y, z, L(0, 0.19, -0.14), L(0.215, 0.19, 0.21)), 0.06) // rump
  d = smin(d, roundCone(x, y, z, L(0, 0.62, 0.04), L(0, 0.8, 0.07), 0.13, 0.11), 0.06) // neck base
  // Haunches: thighs folded forward along the floor.
  d = smin(d, ellipsoid(ax, y, z, L(0.15, 0.175, -0.05), L(0.105, 0.135, 0.17)), 0.05)
  // Hind feet: hock to toes, lying flat.
  d = smin(d, roundCone(ax, y, z, L(0.15, 0.07, -0.17), L(0.165, 0.038, 0.06), 0.052, 0.042), 0.035)
  d = smin(d, ellipsoid(ax, y, z, L(0.168, 0.038, 0.1), L(0.058, 0.04, 0.07)), 0.02)
  // Forelegs: straight and planted, a bit apart.
  d = smin(d, roundCone(ax, y, z, L(0.088, 0.5, 0.09), L(0.09, 0.075, 0.16), 0.066, 0.05), 0.05)
  d = smin(d, ellipsoid(ax, y, z, L(0.092, 0.038, 0.19), L(0.062, 0.042, 0.074)), 0.03)
  // Toe grooves on the front paws.
  for (const tx of [0.074, 0.092, 0.11]) {
    d = smax(d, -roundCone(ax, y, z, L(tx, 0.06, 0.225), L(tx, 0.03, 0.26), 0.004, 0.004), 0.008)
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
const EAR = { hw: 0.064, h: 0.138, t: 0.02 }
function earSDF(x, y, z) {
  const zc = z - 1.6 * x * x - 0.2 * (y / EAR.h) * 0.05 // edges curl forward into a cup
  const tri = triangle2(x, EAR.h - y, EAR.hw, EAR.h) - 0.012
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
  // Height of the muzzle's midline at this depth; the mask sits above it, cream below.
  const mid = mix(0.884, 0.866, smoothstep(0.2, 0.34, z))
  const onMuzzle = smoothstep(0.16, 0.2, z)
  // Cream cheeks under the eyes, cream-white lower muzzle, lips and chin.
  const cheek = smoothstep(0.915, 0.875, y + 0.25 * Math.max(0, ax - 0.09)) * smoothstep(0.04, 0.08, ax + (z - 0.2) * 0.4) * smoothstep(0.06, 0.14, z)
  lerpColor(col, C.cream, cheek)
  lerpColor(col, C.white, smoothstep(mid + 0.004, mid - 0.012, y) * onMuzzle)
  // Cream eyebrow dots.
  for (const s of [-1, 1]) {
    const d = Math.hypot(x - s * 0.056, y - 0.972, z - 0.2)
    lerpColor(col, C.cream, smoothstep(0.026, 0.012, d) * 0.8)
  }
  // Throat and chest ruff.
  lerpColor(col, C.cream, smoothstep(0.84, 0.76, y) * smoothstep(0.0, 0.1, z) * (1 - smoothstep(0.07, 0.13, ax)))
  // Cocoa mask: the whole top of the muzzle, up between the eyes onto the forehead.
  const maskMuzzle = smoothstep(mid - 0.012, mid + 0.006, y) * smoothstep(0.205, 0.235, z) * (1 - smoothstep(0.045, 0.07, ax))
  const maskBridge = smoothstep(0.036, 0.018, ax) * smoothstep(0.99, 0.93, y) * smoothstep(0.14, 0.19, z)
  const mask = Math.max(maskMuzzle, maskBridge)
  lerpColor(col, C.mask, mask)
  lerpColor(col, C.maskDark, maskMuzzle * smoothstep(0.26, 0.31, z) * 0.6)
  // Darker rims and tear-line around the eyes.
  let eyeDist = 1
  for (const e of EYE_POS) eyeDist = Math.min(eyeDist, Math.hypot(x - e[0], y - e[1], z - e[2]))
  lerpColor(col, C.maskDark, smoothstep(0.036, 0.028, eyeDist))
  // Lip line.
  const lip = smoothstep(0.008, 0.002, Math.abs(y - (mid - 0.03 - 0.035 * Math.max(0, ax - 0.015)))) * smoothstep(0.235, 0.26, z) * smoothstep(0.008, 0.02, ax)
  lerpColor(col, C.maskDark, lip * 0.8)
  lerpColor(col, C.gingerLight, (grain - 0.5) * 0.35)

  let len = 0.034
  len = mix(len, 0.065, cheek * smoothstep(0.08, 0.12, ax) * smoothstep(0.24, 0.16, z))
  len = mix(len, 0.095, smoothstep(0.84, 0.72, y)) // neck ruff
  len = mix(len, 0.012, smoothstep(0.17, 0.23, z) * smoothstep(0.95, 0.9, y) * (1 - smoothstep(0.05, 0.09, ax))) // muzzle
  len = mix(len, 0.018, smoothstep(0.96, 1.05, y) * (1 - smoothstep(0.05, 0.1, ax))) // crown
  len *= smoothstep(0.03, 0.046, eyeDist) // bare around the eyes
  len *= 1 - lip * 0.7
  len *= smoothstep(0.024, 0.042, Math.hypot(x - NOSE_POS[0], y - NOSE_POS[1], z - NOSE_POS[2]))
  len *= 0.85 + 0.3 * grain
  len *= collarPress(x, y, z)

  // Groom: muzzle hair runs back toward the eyes, cheeks flare out and back.
  let comb = [0, -0.25, -0.9]
  if (y < 0.93 && ax > 0.05) comb = [Math.sign(x) * 0.8, -0.3, -0.5]
  if (y < 0.8) comb = [x * 2, -0.9, 0.2]
  return { col, len, comb }
}

function paintTail(x, y, z, n) {
  const { s, dir } = tailParam(x, y, z)
  const col = C.ginger.clone()
  lerpColor(col, C.gingerDeep, smoothstep(0.2, 0.8, n[1]) * 0.4)
  lerpColor(col, C.cream, smoothstep(0.1, -0.5, n[1]) + smoothstep(0.6, 0.95, s) * 0.8)
  lerpColor(col, C.gingerLight, noise3(x * 12, y * 12, z * 12) * 0.3)
  const len = mix(0.1, 0.12, Math.sin(s * Math.PI)) * smoothstep(1.02, 0.9, s + 0.0) + 0.02
  return { col, len, comb: [dir[0] * 1.1, dir[1] * 1.1 + 0.25, dir[2] * 1.1] }
}

function paintEar(x, y, z, n) {
  const col = C.ginger.clone()
  const front = smoothstep(-0.1, 0.35, n[2])
  const inner = front * smoothstep(0.042, 0.018, Math.abs(x) + 0.3 * y) * smoothstep(0.12, 0.08, y) * smoothstep(-0.1, 0.4, n[2])
  lerpColor(col, C.cream, inner * 0.85)
  lerpColor(col, C.earPink, inner * smoothstep(0.03, 0.08, y) * smoothstep(0.03, 0.01, Math.abs(x)) * 0.5)
  lerpColor(col, C.gingerDeep, smoothstep(0.13, 0.17, y) * 0.6) // darker tips
  let len = mix(0.012, 0.03, inner)
  len = mix(len, 0.035, front * smoothstep(0.07, 0.0, y) + smoothstep(0.03, 0.0, y) * 0.8) // inner tufts
  len = mix(len, 0.022, smoothstep(0.055, 0.08, Math.abs(x) + y * 0.2) * front) // edge fringe
  return { col, len, comb: [x * 3, 0.9, 0.3] }
}

// The collar parts the fur a little.
function collarPress(x, y, z) {
  const dy = y - COLLAR.c[1], dz = z - COLLAR.c[2]
  const planeD = dy * Math.cos(COLLAR.tilt) + dz * Math.sin(COLLAR.tilt)
  return mix(0.18, 1, smoothstep(0.008, 0.035, Math.abs(planeD)))
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
  if (furEnabled) group.add(createFurMesh(geometry, fur))
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
  iris.addColorStop(0, '#8a6a3e') // warm hazel ring around the pupil
  iris.addColorStop(0.32, '#6d6a5c')
  iris.addColorStop(0.55, '#5c6d7a') // blue-grey
  iris.addColorStop(0.85, '#46525c')
  iris.addColorStop(1, '#2a3036')
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
  g.beginPath(); g.ellipse(cx, cy, R * 0.5, R * 0.52, 0, 0, Math.PI * 2); g.fill()
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
  const liner = new THREE.Mesh(new THREE.TorusGeometry(EYE.r * 0.93, EYE.r * 0.2, 8, 40), new THREE.MeshStandardMaterial({ color: '#24160f', roughness: 0.7 }))
  liner.position.z = EYE.r * 0.38
  liner.scale.set(1.12, 0.9, 1)
  group.add(ball, cornea, liner)
  group.scale.set(1, 0.85, 0.7) // almond-ish, sits into the socket
  group.userData.ball = ball
  return group
}

function buildNose() {
  const c = NOSE_POS
  const sdf = (x, y, z) => {
    const ax = Math.abs(x - c[0])
    let d = ellipsoid(x, y, z, c, L(0.027, 0.019, 0.02))
    d = smin(d, ellipsoid(x, y, z, L(c[0], c[1] + 0.008, c[2] - 0.007), L(0.024, 0.012, 0.018)), 0.01)
    d = smax(d, -ellipsoid(ax, y, z, L(0.011, c[1] - 0.002, c[2] + 0.018), L(0.006, 0.0045, 0.008)), 0.004) // nostrils
    d = smax(d, -roundCone(ax, y, z, L(0.0, c[1] - 0.03, c[2] + 0.02), L(0.0, c[1] - 0.006, c[2] + 0.024), 0.003, 0.002), 0.004) // philtrum
    return d
  }
  const { positions, normals, indices } = polygonize(sdf, [c[0] - 0.06, c[1] - 0.05, c[2] - 0.05], [c[0] + 0.06, c[1] + 0.05, c[2] + 0.05], 0.0022)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#3e2824', roughness: 0.7, envMapIntensity: 0.2 }))
  mesh.castShadow = true
  return mesh
}

function buildTongue() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.022, 0)
  shape.bezierCurveTo(-0.026, -0.03, -0.022, -0.052, 0, -0.056)
  shape.bezierCurveTo(0.022, -0.052, 0.026, -0.03, 0.022, 0)
  shape.lineTo(-0.022, 0)
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 })
  g.translate(0, 0, -0.004)
  // Curl it forward over the lower lip.
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    p.setZ(i, p.getZ(i) + y * y * 7 - Math.abs(p.getX(i)) * 0.15)
  }
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#d7727a', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }))
  const pivot = new THREE.Group()
  pivot.position.set(0, 0.826, 0.305)
  mesh.rotation.x = -1.2
  pivot.add(mesh)
  // Dark mouth interior behind the tongue.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: '#2a1414', roughness: 0.8 }))
  mouth.scale.set(0.95, 0.35, 1.3)
  mouth.position.set(0, 0.832, 0.29)
  return { pivot, mouth }
}

function buildCollar() {
  const group = new THREE.Group()
  group.position.set(...COLLAR.c)
  group.rotation.x = COLLAR.tilt
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(COLLAR.r, 0.008, 10, 72),
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
  const fur = { shells, density: 95 }

  const root = new THREE.Group()
  root.name = 'bear'

  const body = furred(buildPart(bodySDF, paintBody, [-0.3, -0.01, -0.4], [0.3, 0.86, 0.32], 0.0105 * res), fur, 'body')
  root.add(body.group)

  const neck = new THREE.Group()
  neck.position.set(...NECK_PIVOT)
  root.add(neck)
  const headRig = new THREE.Group() // separate node so nods/tilts compose cleanly
  neck.add(headRig)
  const head = furred(buildPart(headSDF, paintHead, [-0.22, 0.6, -0.12], [0.22, 1.1, 0.4], 0.0072 * res, NECK_PIVOT), fur, 'head')
  headRig.add(head.group)

  const local = p => [p[0] - NECK_PIVOT[0], p[1] - NECK_PIVOT[1], p[2] - NECK_PIVOT[2]]
  const tex = irisTexture()
  const eyes = EYE_POS.map((p, i) => {
    const eye = buildEye(tex)
    eye.position.set(...local(p))
    eye.rotation.y = (i === 0 ? -1 : 1) * 0.18
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
    base.rotation.set(-0.18, s * 0.3, s * -0.22) // splayed outward, turned slightly to the side
    pivot.add(base)
    const ear = furred(earGeo, { shells: Math.max(10, Math.round(shells * 0.6)), density: 160 }, 'ear')
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
