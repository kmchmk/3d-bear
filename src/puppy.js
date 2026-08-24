import * as THREE from 'three'
import { makeFurPart } from './fur.js'
import { IRIS_MAP } from './textures.js'

// Palette sampled from the reference photos — golden amber with liver mask
const C = {
  tan: new THREE.Color('#d1934f'),
  tanDark: new THREE.Color('#ad6f33'),
  tanLight: new THREE.Color('#dfa96b'),
  cream: new THREE.Color('#f2e4c8'),
  liver: new THREE.Color('#75503a'),
  liverDark: new THREE.Color('#4e3220'),
  pinkEar: new THREE.Color('#e0a892'),
  nose: new THREE.Color('#4e3428'),
  mouth: new THREE.Color('#3a130f'),
  tongue: new THREE.Color('#ec8b96'),
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

  // ---- torso: low fluffy egg, fur sweeping back and down ----
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 56, 40), (d, c) => {
      c.copy(C.tan).lerp(C.tanDark, clamp(smoothstep(-0.05, -0.85, d.z) * 0.7 + smoothstep(0.15, 0.9, d.y) * 0.3))
      const belly = smoothstep(-0.02, -0.5, d.y) * (0.35 + 0.65 * smoothstep(-0.8, 0.0, d.z))
      c.lerp(C.cream, Math.min(1, belly))
    })
    const m = makeFurPart(geo, {
      layers,
      furLength: 0.095,
      uvScale: [2.6, 1.25],
      groom: [0, -0.55, -0.8],
    })
    m.position.set(0, 0.58, -0.1)
    m.rotation.x = 0.12
    m.scale.set(0.5, 0.48, 0.84)
    group.add(m)
    rig.body = m
  }

  // ---- chest ruff: long cream fur hanging over the front ----
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 48, 36), (d, c) => {
      c.copy(C.cream).lerp(C.tan, clamp(smoothstep(-0.25, 0.7, d.y) * 0.85 + smoothstep(0.2, 0.9, -d.z) * 0.5))
    })
    const m = makeFurPart(geo, {
      layers,
      furLength: 0.12,
      uvScale: [2.6, 1.25],
      groom: [0, -0.85, -0.25],
    })
    m.position.set(0, 0.62, 0.4)
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
    const m = makeFurPart(geo, {
      layers,
      furLength: 0.085,
      uvScale: [2.25, 1.25],
      groom: [0.1 * s, -0.5, -0.8],
    })
    m.position.set(0.37 * s, 0.4, -0.54)
    m.scale.set(0.32, 0.36, 0.46)
    m.rotation.z = -0.12 * s
    group.add(m)
  }

  // ---- rear paws peeking forward beside haunches ----
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 28, 20), (d, c) => c.copy(C.cream).lerp(C.tan, smoothstep(-0.2, -0.9, d.z) * 0.7))
    const m = makeFurPart(geo, { layers: Math.max(6, layers - 6), furLength: 0.018, uvScale: [3.2, 1] })
    m.position.set(0.33 * s, 0.028, -0.14)
    m.scale.set(0.06, 0.025, 0.08)
    m.rotation.y = 0.45 * s
    group.add(m)
  }

  // ---- front legs: mostly hidden in chest fluff ----
  const legDir = new THREE.Vector3(0.26 - 0.22, 0.085 - 0.44, 0.84 - 0.46).normalize()
  const legQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), legDir)
  for (const s of [1, -1]) {
    const geo = paintByY(new THREE.CapsuleGeometry(0.14, 0.22, 10, 22), (t, p, c) => {
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.8, 0.05, t) * 0.2)
      c.lerp(C.cream, smoothstep(0.55, 0.9, t))
    })
    const m = makeFurPart(geo, {
      layers,
      furLength: 0.024,
      limb: true,
      uvScale: [2.9, 1.25],
      groom: [0, 0, 0.25],
    })
    m.position.set(((0.22 + 0.26) / 2) * s, (0.44 + 0.085) / 2, (0.46 + 0.84) / 2)
    m.quaternion.copy(legQuat)
    group.add(m)
  }

  // ---- front paws: fluffy cream mitts ----
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 30, 22), (d, c) => c.copy(C.cream).lerp(C.tan, smoothstep(-0.5, -1, d.z) * 0.5))
    const m = makeFurPart(geo, { layers: Math.max(6, layers - 6), furLength: 0.024, uvScale: [3.2, 1], groom: [0, -0.3, 0.6] })
    m.position.set(0.25 * s, 0.068, 0.9)
    m.scale.set(0.16, 0.075, 0.19)
    m.rotation.y = 0.18 * s
    group.add(m)
  }

  // ---- neck: ruff fur sweeping up toward the head ----
  {
    const geo = paintByY(new THREE.CylinderGeometry(0.26, 0.39, 0.5, 30, 6), (t, p, c) => {
      const r = Math.sqrt(p.x * p.x + p.z * p.z) || 1
      const nz = p.z / r
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.1, 0.8, -nz) * 0.4 * (1 - t))
      c.lerp(C.cream, smoothstep(0.15, 0.75, nz) * (1 - t) * 0.45)
    })
    const m = makeFurPart(geo, { layers, furLength: 0.085, uvScale: [4.5, 1.25], groom: [0, 0.75, 0.35] })
    m.position.set(0, 0.96, 0.46)
    m.rotation.x = 0.5
    group.add(m)
  }

  // ---- head assembly ----
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 1.1, 0.58)
  rig.head = headGroup
  group.add(headGroup)

  const HEAD_CENTER = new THREE.Vector3(0, 0.09, 0.07)
  const HEAD_RADII = new THREE.Vector3(0.46, 0.43, 0.41)

  // skull — fur combed back from the face
  {
    const eyeDirL = new THREE.Vector3(-0.31, -0.01, 0.95).normalize()
    const eyeDirR = eyeDirL.clone()
    eyeDirR.x *= -1
    const gaussAt = (d, e, sigma) => {
      const dot = Math.min(1, Math.max(-1, d.dot(e)))
      const ang = Math.acos(dot)
      return Math.exp(-(ang * ang) / (sigma * sigma))
    }
    const geo = paintSphere(new THREE.SphereGeometry(1, 64, 48), (d, c) => {
      // liver mask: whole muzzle zone + eye rings + bridge; brows stay tan
      let mask = smoothstep(0.3, 0.78, d.z) * smoothstep(0.32, -0.28, d.y)
      mask += gaussAt(d, eyeDirL, 0.23) * 0.85
      mask += gaussAt(d, eyeDirR, 0.23) * 0.85
      mask += smoothstep(0.38, 0.85, d.z) * smoothstep(0.32, 0.08, Math.abs(d.x)) * smoothstep(0.45, -0.05, d.y)
      mask = clamp(mask)
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.35, 0.95, d.y) * 0.3).lerp(C.liver, mask)
      // darker toward the nose tip area
      c.lerp(C.liverDark, smoothstep(0.75, 1.0, d.z) * smoothstep(0.2, -0.3, d.y) * 0.55)
      c.lerp(C.cream, smoothstep(0.6, 0.95, Math.abs(d.x)) * smoothstep(-0.05, -0.5, d.y) * 0.3)
    })
    const m = makeFurPart(geo, { layers, furLength: 0.075, uvScale: [2.7, 1.25], groom: [0, -0.2, -0.95] })
    m.position.copy(HEAD_CENTER)
    m.scale.copy(HEAD_RADII)
    headGroup.add(m)
  }

  // fluffy cheeks — long fur sweeping down and back
  for (const s of [1, -1]) {
    const geo = paintSphere(new THREE.SphereGeometry(1, 40, 30), (d, c) => {
      c.copy(C.tan)
      c.lerp(C.cream, smoothstep(-0.1, -0.7, d.y) * 0.7)
      c.lerp(C.liver, smoothstep(0.6, 0.98, d.z) * 0.4)
    })
    const m = makeFurPart(geo, {
      layers,
      furLength: 0.08,
      uvScale: [2.75, 1.25],
      groom: [0.15 * s, -0.6, -0.6],
    })
    m.position.set(0.26 * s, -0.04, 0.1)
    m.scale.set(0.2, 0.18, 0.18)
    headGroup.add(m)
  }

  // muzzle — dark liver, protruding, fur pointing forward-down
  {
    const geo = paintSphere(new THREE.SphereGeometry(1, 44, 32), (d, c) => {
      c.copy(C.liver).lerp(C.liverDark, smoothstep(-0.1, -0.9, d.y) * 0.5)
      c.lerp(C.tan, smoothstep(-0.35, -0.95, d.z + d.y * 0.4) * 0.85)
      c.lerp(C.cream, smoothstep(0.2, 0.8, -d.y) * 0.22)
    })
    const m = makeFurPart(geo, { layers: Math.max(8, layers - 4), furLength: 0.038, uvScale: [3.2, 1.25], groom: [0, -0.35, 0.75] })
    m.position.set(0, -0.07, 0.395)
    m.scale.set(0.185, 0.14, 0.24)
    headGroup.add(m)
    rig.muzzle = m
  }

  // nose — big glossy liver
  {
    const mat = new THREE.MeshStandardMaterial({ color: C.nose, roughness: 0.28, metalness: 0.05 })
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat)
    m.scale.set(0.098, 0.068, 0.06)
    m.position.set(0, -0.024, 0.585)
    m.rotation.x = 0.25
    m.castShadow = true
    headGroup.add(m)
    const nmat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5 })
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), nmat)
      n.position.set(0.037 * s, -0.012, 0.615)
      n.scale.set(1, 0.6, 0.7)
      headGroup.add(n)
    }
  }

  // open smiling mouth + big side-hanging tongue (as in the photos)
  {
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 18),
      new THREE.MeshStandardMaterial({ color: C.mouth, roughness: 0.7 })
    )
    inner.scale.set(0.12, 0.075, 0.07)
    inner.position.set(0, -0.13, 0.42)
    headGroup.add(inner)

    const tg = new THREE.Group()
    tg.position.set(0.045, -0.1, 0.44)
    tg.rotation.z = -0.22 // loll out to the side
    headGroup.add(tg)
    rig.tongue = tg
    // one smooth curved piece: tube along a drooping curve, flattened
    const tCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.015, -0.07, 0.045),
      new THREE.Vector3(0.03, -0.15, 0.06),
      new THREE.Vector3(0.035, -0.21, 0.04),
    ])
    const tongueGeo = new THREE.TubeGeometry(tCurve, 16, 0.052, 14, false)
    const tmesh = new THREE.Mesh(
      tongueGeo,
      new THREE.MeshPhysicalMaterial({ color: C.tongue, roughness: 0.4, clearcoat: 0.65, clearcoatRoughness: 0.3 })
    )
    tmesh.scale.set(1.5, 1, 0.55)
    tmesh.castShadow = true
    tg.add(tmesh)
    const tipCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 16, 12),
      new THREE.MeshPhysicalMaterial({ color: C.tongue, roughness: 0.4, clearcoat: 0.65 })
    )
    tipCap.scale.set(1.5, 1, 0.55)
    tipCap.position.copy(tCurve.getPoint(1))
    tg.add(tipCap)
  }

  // eyes — small almond amber eyes with dark rims, nestled in fur
  const eyes = []
  {
    const eyeDir = new THREE.Vector3(0.31, -0.01, 0.95).normalize()
    for (const s of [1, -1]) {
      const surf = new THREE.Vector3(
        eyeDir.x * HEAD_RADII.x * s,
        HEAD_CENTER.y + eyeDir.y * HEAD_RADII.y,
        HEAD_CENTER.z + eyeDir.z * HEAD_RADII.z
      )
      const normal = new THREE.Vector3(eyeDir.x * HEAD_RADII.y * HEAD_RADII.z * s, eyeDir.y * HEAD_RADII.x * HEAD_RADII.z, eyeDir.z * HEAD_RADII.x * HEAD_RADII.y).normalize()
      const eg = new THREE.Group()
      eg.position.copy(surf).addScaledVector(normal, -0.004)
      eg.scale.y = 0.85 // almond shape
      headGroup.add(eg)
      eyes.push(eg)

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 28, 22),
        new THREE.MeshPhysicalMaterial({ color: 0x1e120a, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.3 })
      )
      eg.add(ball)

      // amber iris
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), new THREE.MeshStandardMaterial({ map: IRIS_MAP, roughness: 0.3 }))
      iris.position.copy(normal).multiplyScalar(0.035)
      iris.lookAt(iris.position.clone().add(normal))
      eg.add(iris)

      const catchL = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff8ee }))
      catchL.position.set(0.01 * s, 0.012, 0.03)
      eg.add(catchL)
    }
  }
  rig.eyes = eyes

  // ears — big wide triangles, tilted outward, pink inner, wispy edges
  rig.ears = []
  for (const s of [1, -1]) {
    const earGroup = new THREE.Group()
    earGroup.position.set(0.27 * s, 0.38, -0.02)
    headGroup.add(earGroup)

    const outerGeo = paintByY(new THREE.ConeGeometry(0.25, 0.36, 20, 4, false), (t, p, c) => {
      c.copy(C.tan).lerp(C.tanDark, smoothstep(0.85, 0.35, t) * 0.3)
      c.lerp(C.cream, smoothstep(0.93, 0.99, t) * 0.45)
    })
    outerGeo.translate(0, 0.2, 0)
    const outer = makeFurPart(outerGeo, { layers: Math.max(8, layers - 4), furLength: 0.04, limb: true, uvScale: [2.4, 1.25] })
    outer.scale.set(1.1, 1, 0.62)
    earGroup.add(outer)

    const innerGeo = new THREE.ConeGeometry(0.16, 0.24, 18, 2)
    innerGeo.translate(0, 0.14, 0.012)
    const inner = new THREE.Mesh(innerGeo, new THREE.MeshStandardMaterial({ color: C.pinkEar, roughness: 0.75 }))
    inner.scale.set(1.1, 1, 0.55)
    inner.position.z = 0.05
    inner.castShadow = true
    earGroup.add(inner)

    earGroup.rotation.z = -0.5 * s
    earGroup.rotation.x = -0.25
    rig.ears.push({ group: earGroup, side: s })
  }

  // tail — fluffy, curled to the side, cream tip
  {
    const tailGroup = new THREE.Group()
    tailGroup.position.set(0.2, 0.32, -0.68)
    group.add(tailGroup)
    rig.tail = tailGroup

    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.32, -0.02, -0.28),
      new THREE.Vector3(0.6, 0.02, -0.18),
      new THREE.Vector3(0.68, 0.2, -0.06),
    ]
    const curve = new THREE.CatmullRomCurve3(pts)
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.085, 14, false)
    const uv = tubeGeo.attributes.uv
    const pos = tubeGeo.attributes.position
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
    const tail = makeFurPart(tubeGeo, { layers: Math.max(8, layers - 4), furLength: 0.05, limb: true, uvScale: [2.6, 1.25], groom: [0, 0.3, 0] })
    tailGroup.add(tail)
    const capGeo = new THREE.SphereGeometry(0.07, 16, 12)
    const capPos = capGeo.attributes.position
    const capCols = new Float32Array(capPos.count * 3)
    for (let i = 0; i < capPos.count; i++) {
      capCols[i * 3] = C.cream.r
      capCols[i * 3 + 1] = C.cream.g
      capCols[i * 3 + 2] = C.cream.b
    }
    capGeo.setAttribute('color', new THREE.BufferAttribute(capCols, 3))
    const cap = makeFurPart(capGeo, { layers: Math.max(6, layers - 8), furLength: 0.045, uvScale: [2, 1] })
    cap.position.copy(curve.getPoint(1))
    tailGroup.add(cap)
  }

  // collar with tag + bell
  {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.05, 14, 40),
      new THREE.MeshStandardMaterial({ color: C.collarBlue, roughness: 0.55 })
    )
    collar.position.set(0, 0.88, 0.42)
    collar.rotation.x = Math.PI / 2 + 0.5
    collar.castShadow = true
    group.add(collar)
    rig.collar = collar

    const tag = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.045, 0.1, 6, 14),
      new THREE.MeshStandardMaterial({ color: C.tagBlue, roughness: 0.35, metalness: 0.1 })
    )
    tag.position.set(0.015, 0.73, 0.86)
    tag.rotation.x = 0.3
    tag.castShadow = true
    group.add(tag)

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 12),
      new THREE.MeshStandardMaterial({ color: C.bellRed, roughness: 0.28, metalness: 0.75 })
    )
    bell.position.set(0.11, 0.71, 0.82)
    bell.castShadow = true
    group.add(bell)
    rig.bell = bell
  }

  return { group, rig }
}
