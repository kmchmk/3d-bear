import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP } from './textures.js'

// Palette sampled from the reference photos
const C = {
  tan: new THREE.Color('#c08a52'),
  tanDark: new THREE.Color('#9d6836'),
  tanLight: new THREE.Color('#d09a60'),
  cream: new THREE.Color('#f2e4cb'),
  liver: new THREE.Color('#6e4b33'),
  liverDark: new THREE.Color('#543a28'),
  pinkEar: new THREE.Color('#dba693'),
  nose: new THREE.Color('#4e352a'),
  mouth: new THREE.Color('#38120e'),
  tongue: new THREE.Color('#ee8b96'),
  collarBlue: new THREE.Color('#a9c7e2'),
  tagBlue: new THREE.Color('#b9cede'),
  bellRed: new THREE.Color('#b3123e'),
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const clamp = (v) => Math.min(1, Math.max(0, v))

// Paint vertex colours on unit-sphere geometry using its direction vector
function paintSphere(geo, fn) {
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const d = new THREE.Vector3()
  const col = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize()
    fn(d, col)
    colors[i * 3] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

// Paint by height fraction along local Y (capsules / cones); fn(t, v, col)
function paintByY(geo, fn) {
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const span = bb.max.y - bb.min.y || 1
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const col = new THREE.Color()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y - bb.min.y) / span
    fn(t, v, col)
    colors[i * 3] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

export function buildPuppy({ layers = 14 } = {}) {
  const group = new THREE.Group()
  const rig = {}

  // ---- torso ----
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 56, 40), (d, c) => {
      c.copy(C.tan).lerp(C.tanDark, clamp(smoothstep(-0.1, -0.85, d.z) * 0.7 + smoothstep(0.15, 0.9, d.y) * 0.25))
      const belly = smoothstep(-0.1, -0.45, d.y) * (0.35 + 0.65 * smoothstep(-0.8, 0.0, d.z))
      c.lerp(C.cream, Math.min(1, belly))
    })
    const m = makeFurPart(geo, { layers, furLength: 0.062, uvScale: [2.2, 1.2] })
    m.position.set(0, 0.6, -0.1)
    m.rotation.x = 0.12
    m.scale.set(0.54, 0.52, 0.88)
    group.add(m)
    rig.body = m
  }

  // ---- chest ruff ----
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 48, 36), (d, c) => {
      c.copy(C.cream).lerp(C.tan, clamp(smoothstep(-0.3, 0.75, d.y) * 0.85 + smoothstep(0.2, 0.9, -d.z) * 0.5))
    })
    const m = makeFurPart(geo, { layers, furLength: 0.075, uvScale: [1.8, 1.2] })
    m.position.set(0, 0.66, 0.4)
    m.rotation.x = 0.12
    m.scale.set(0.48, 0.46, 0.44)
    group.add(m)
    rig.chest = m
  }

  // ---- haunches ----
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 40, 30), (d, c) => {
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.2, 0.9, d.x * s) * 0.55)
      c.lerp(C.cream, smoothstep(-0.25, -0.7, d.y) * 0.8 * smoothstep(0.6, -0.2, d.z))
    })
    const m = makeFurPart(geo, { layers, furLength: 0.055, uvScale: [1.6, 1.2] })
    m.position.set(0.38 * s, 0.42, -0.56)
    m.scale.set(0.34, 0.38, 0.48)
    m.rotation.z = -0.12 * s
    group.add(m)
  }

  // ---- rear paws peeking forward beside haunches ----
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 28, 20), (d, c) => c.copy(C.cream).lerp(C.tan, smoothstep(-0.2, -0.9, d.z) * 0.7))
    const m = makeFurPart(geo, { layers: Math.max(6, layers - 6), furLength: 0.013, uvScale: [0.45, 0.7] })
    m.position.set(0.4 * s, 0.035, -0.2)
    m.scale.set(0.075, 0.032, 0.1)
    m.rotation.y = 0.45 * s
    group.add(m)
  }

  // ---- front legs ----
  const legDir = new THREE.Vector3(0.27 - 0.22, 0.085 - 0.48, 0.98 - 0.5).normalize()
  const legQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), legDir)
  for (const s of [1, -1]) {
    const geo = paintByY(new THREE.CapsuleGeometry(0.135, 0.36, 10, 22), (t, p, c) => {
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.8, 0.05, t) * 0.2)
      c.lerp(C.cream, smoothstep(0.62, 0.92, t))
    })
    const m = makeFurPart(geo, { layers: Math.max(8, layers - 4), furLength: 0.018, limb: true, uvScale: [0.45, 1.0] })
    m.position.set(((0.22 + 0.27) / 2) * s, (0.48 + 0.085) / 2, (0.5 + 0.98) / 2)
    m.quaternion.copy(legQuat)
    group.add(m)
  }

  // ---- front paws ----
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 30, 22), (d, c) => c.copy(C.cream).lerp(C.tan, smoothstep(-0.5, -1, d.z) * 0.5))
    const m = makeFurPart(geo, { layers: Math.max(6, layers - 6), furLength: 0.013, uvScale: [0.55, 0.8] })
    m.position.set(0.265 * s, 0.068, 1.02)
    m.scale.set(0.145, 0.068, 0.175)
    m.rotation.y = 0.18 * s
    group.add(m)
  }

  // ---- neck ----
  {
    const geo = paintByY(new THREE.CylinderGeometry(0.27, 0.4, 0.5, 30, 6), (t, p, c) => {
      const r = Math.sqrt(p.x * p.x + p.z * p.z) || 1
      const nz = p.z / r
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.1, 0.8, -nz) * 0.4 * (1 - t))
      c.lerp(C.cream, smoothstep(0.15, 0.75, nz) * (1 - t) * 0.45)
    })
    const m = makeFurPart(geo, { layers, furLength: 0.055, uvScale: [1.2, 1.0] })
    m.position.set(0, 0.98, 0.48)
    m.rotation.x = 0.5
    group.add(m)
  }

  // ---- head assembly ----
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 1.12, 0.58)
  rig.head = headGroup
  group.add(headGroup)

  const HEAD_CENTER = new THREE.Vector3(0, 0.1, 0.1)
  const HEAD_RADII = new THREE.Vector3(0.39, 0.37, 0.35)

  // skull
  {
    const eyeDirL = new THREE.Vector3(-0.42, 0.1, 0.9).normalize()
    const eyeDirR = eyeDirL.clone()
    eyeDirR.x *= -1
    const gaussAt = (d, e, sigma) => {
      const dot = Math.min(1, Math.max(-1, d.dot(e)))
      const ang = Math.acos(dot)
      return Math.exp(-(ang * ang) / (sigma * sigma))
    }
    const geo = paintSphere(new THREE.SphereGeometry(1, 64, 48), (d, c) => {
      let mask = smoothstep(0.18, 0.72, d.z) * smoothstep(0.3, -0.2, d.y)
      mask += gaussAt(d, eyeDirL, 0.28) * 0.8
      mask += gaussAt(d, eyeDirR, 0.28) * 0.8
      mask += smoothstep(0.5, 0.9, d.z) * smoothstep(0.3, 0.08, Math.abs(d.x)) * smoothstep(0.5, 0.0, d.y)
      mask = clamp(mask)
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.35, 0.95, d.y) * 0.3).lerp(C.liver, mask)
      c.lerp(C.cream, smoothstep(0.55, 0.95, Math.abs(d.x)) * smoothstep(-0.05, -0.5, d.y) * 0.35)
    })
    const m = makeFurPart(geo, { layers, furLength: 0.042, uvScale: [1.8, 1.2] })
    m.position.copy(HEAD_CENTER)
    m.scale.copy(HEAD_RADII)
    headGroup.add(m)
  }

  // fluffy cheeks
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 40, 30), (d, c) => {
      c.copy(C.tan)
      c.lerp(C.cream, smoothstep(-0.1, -0.7, d.y) * 0.7)
      c.lerp(C.liver, smoothstep(0.6, 0.98, d.z) * 0.4)
    })
    const m = makeFurPart(geo, { layers, furLength: 0.05, uvScale: [1.4, 1.0] })
    m.position.set(0.22 * s, -0.02, 0.1)
    m.scale.set(0.16, 0.14, 0.14)
    headGroup.add(m)
  }

  // muzzle (dark liver mask)
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 44, 32), (d, c) => {
      c.copy(C.liver).lerp(C.liverDark, smoothstep(-0.1, -0.9, d.y) * 0.5)
      c.lerp(C.tan, smoothstep(-0.35, -0.95, d.z + d.y * 0.4) * 0.85)
      c.lerp(C.cream, smoothstep(0.2, 0.8, -d.y) * 0.25)
    })
    const m = makeFurPart(geo, { layers: Math.max(8, layers - 4), furLength: 0.024, uvScale: [1.1, 0.9] })
    m.position.set(0, -0.07, 0.36)
    m.scale.set(0.175, 0.14, 0.165)
    headGroup.add(m)
    rig.muzzle = m
  }

  // nose — glossy liver
  {
    const mat = new THREE.MeshStandardMaterial({ color: C.nose, roughness: 0.3, metalness: 0.05 })
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat)
    m.scale.set(0.082, 0.058, 0.05)
    m.position.set(0, -0.03, 0.51)
    m.rotation.x = 0.25
    m.castShadow = true
    headGroup.add(m)
    const nmat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5 })
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), nmat)
      n.position.set(0.034 * s, -0.016, 0.55)
      n.scale.set(1, 0.6, 0.7)
      headGroup.add(n)
    }
  }

  // open smiling mouth + tongue
  {
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 18),
      new THREE.MeshStandardMaterial({ color: C.mouth, roughness: 0.7 })
    )
    inner.scale.set(0.12, 0.07, 0.07)
    inner.position.set(0, -0.13, 0.41)
    headGroup.add(inner)

    const tg = new THREE.Group()
    tg.position.set(0.012, -0.11, 0.46)
    headGroup.add(tg)
    rig.tongue = tg
    const tongueGeo = new THREE.CapsuleGeometry(0.052, 0.1, 8, 18)
    tongueGeo.translate(0, -0.075, 0)
    const tmesh = new THREE.Mesh(
      tongueGeo,
      new THREE.MeshPhysicalMaterial({ color: C.tongue, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 })
    )
    tmesh.scale.set(1.7, 1, 0.62)
    tmesh.rotation.x = 0.5
    tmesh.castShadow = true
    tg.add(tmesh)
    const crease = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.005, 0.055, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc25f6e, roughness: 0.5 })
    )
    crease.scale.set(1, 1, 0.5)
    crease.position.set(0, -0.078, 0.032)
    crease.rotation.x = 0.5
    tg.add(crease)
  }

  // eyes — dark glossy puppy eyes nestled into fur, with catchlight
  const eyes = []
  {
    const eyeDir = new THREE.Vector3(0.3, 0.08, 0.95).normalize()
    for (const s of [1, -1]) {
      const surf = new THREE.Vector3(
        eyeDir.x * HEAD_RADII.x * s,
        HEAD_CENTER.y + eyeDir.y * HEAD_RADII.y,
        HEAD_CENTER.z + eyeDir.z * HEAD_RADII.z
      )
      const normal = new THREE.Vector3(eyeDir.x * HEAD_RADII.y * HEAD_RADII.z * s, eyeDir.y * HEAD_RADII.x * HEAD_RADII.z, eyeDir.z * HEAD_RADII.x * HEAD_RADII.y).normalize()
      const eg = new THREE.Group()
      eg.position.copy(surf).addScaledVector(normal, -0.004)
      headGroup.add(eg)
      eyes.push(eg)

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 28, 22),
        new THREE.MeshPhysicalMaterial({ color: 0x2a1a10, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.15 })
      )
      eg.add(ball)

      const catchL = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff8ee })
      )
      catchL.position.set(0.014 * s, 0.016, 0.041)
      eg.add(catchL)
    }
  }
  rig.eyes = eyes

  // ears — erect triangles with pink inner
  rig.ears = []
  for (const s of [1, -1]) {
    const earGroup = new THREE.Group()
    earGroup.position.set(0.23 * s, 0.34, -0.02)
    headGroup.add(earGroup)

    const outerGeo = paintByY(new THREE.ConeGeometry(0.14, 0.33, 20, 4, false), (t, p, c) => {
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.85, 0.35, t) * 0.3)
      c.lerp(C.cream, smoothstep(0.92, 0.99, t) * 0.4)
    })
    outerGeo.translate(0, 0.165, 0)
    const outer = makeFurPart(outerGeo, { layers: Math.max(6, layers - 6), furLength: 0.014, limb: true, uvScale: [0.5, 0.7] })
    outer.scale.set(1, 1, 0.55)
    earGroup.add(outer)

    const innerGeo = new THREE.ConeGeometry(0.095, 0.22, 18, 2)
    innerGeo.translate(0, 0.115, 0.012)
    const inner = new THREE.Mesh(innerGeo, new THREE.MeshStandardMaterial({ color: C.pinkEar, roughness: 0.75 }))
    inner.scale.set(1, 1, 0.5)
    inner.position.z = 0.032
    inner.castShadow = true
    earGroup.add(inner)

    earGroup.rotation.z = -0.55 * s
    earGroup.rotation.x = -0.1
    rig.ears.push({ group: earGroup, side: s })
  }

  // tail — curled to the side, cream tip, wags
  {
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0.2, 0.32, -0.7)
    group.add(tailGroup)
    rig.tail = tailGroup

    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.32, -0.02, -0.28),
      new THREE.Vector3(0.6, 0.02, -0.18),
      new THREE.Vector3(0.68, 0.18, -0.06),
    ]
    const curve = new THREE.CatmullRomCurve3(pts)
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.085, 14, false)
    const pos = tubeGeo.attributes.position
    const uv = tubeGeo.attributes.uv
    const colors = new Float32Array(pos.count * 3)
    const col = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i)
      col.copy(C.tan).lerp(C.tanLight, smoothstep(0.2, 0.7, t) * 0.4).lerp(C.cream, smoothstep(0.72, 0.98, t))
      colors[i * 3] = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b
    }
    tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const tail = makeFurPart(tubeGeo, { layers: Math.max(8, layers - 4), furLength: 0.034, limb: true, uvScale: [0.5, 0.8] })
    tailGroup.add(tail)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.95 }))
    cap.position.copy(curve.getPoint(1))
    tailGroup.add(cap)
  }

  // collar with tag + bell
  {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.355, 0.06, 14, 40),
      new THREE.MeshStandardMaterial({ color: C.collarBlue, roughness: 0.55 })
    )
    collar.position.set(0, 0.99, 0.47)
    collar.rotation.x = Math.PI / 2 - 0.5
    collar.castShadow = true
    group.add(collar)
    rig.collar = collar

    const tag = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.09, 6, 14),
      new THREE.MeshStandardMaterial({ color: C.tagBlue, roughness: 0.35, metalness: 0.1 })
    )
    tag.position.set(0.01, 0.79, 0.75)
    tag.rotation.x = 0.3
    tag.castShadow = true
    group.add(tag)

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 12),
      new THREE.MeshStandardMaterial({ color: C.bellRed, roughness: 0.28, metalness: 0.75 })
    )
    bell.position.set(0.1, 0.77, 0.72)
    bell.castShadow = true
    group.add(bell)
    rig.bell = bell
  }

  return { group, rig }
}
