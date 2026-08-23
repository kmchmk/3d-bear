import * as THREE from 'three'

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Cellular strand pattern used as alpha mask across shell layers.
// Strands are bucketed per cell so generation stays fast.
function makeStrandTexture(size = 1024, cells = 28, angleJitter = 0.55) {
  const rnd = mulberry32(1234)
  const cs = size / cells
  const buckets = Array.from({ length: cells * cells }, () => [])
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const n = 1 + (rnd() < 0.6 ? 1 : 0)
      for (let s = 0; s < n; s++) {
        const ox = (cx + rnd()) * cs
        const oy = (cy + rnd()) * cs
        const ang = Math.PI / 2 + (rnd() - 0.5) * angleJitter * Math.PI
        const len = cs * (0.9 + rnd() * 0.8)
        buckets[cy * cells + cx].push({
          x0: ox,
          y0: oy,
          x1: ox + Math.cos(ang) * len,
          y1: oy + Math.sin(ang) * len,
          w: cs * (0.14 + rnd() * 0.08),
          b: 0.9 + rnd() * 0.2,
        })
      }
    }
  }
  const img = new Uint8Array(size * size * 4)
  const wrap = (i) => (i + cells * 4) % cells
  for (let y = 0; y < size; y++) {
    const cyy = Math.floor(y / cs)
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cs)
      let best = 1e9
      let bb = 1
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const bx = wrap(cx + dx)
          const by = wrap(cyy + dy)
          const wx = bx * cs
          const wy = by * cs
          const px = x - wx
          const py = y - wy
          const cell = buckets[by * cells + bx]
          for (let k = 0; k < cell.length; k++) {
            const s = cell[k]
            const sx = s.x0 - wx
            const sy = s.y0 - wy
            const ex = s.x1 - wx
            const ey = s.y1 - wy
            let ddx = ex - sx
            let ddy = ey - sy
            const ll = ddx * ddx + ddy * ddy || 1
            let t = ((px - sx) * ddx + (py - sy) * ddy) / ll
            t = t < 0 ? 0 : t > 1 ? 1 : t
            const qx = sx + ddx * t - px
            const qy = sy + ddy * t - py
            const d = Math.sqrt(qx * qx + qy * qy) - s.w
            if (d < best) {
              best = d
              bb = s.b
            }
          }
        }
      const i = (y * size + x) * 4
      const a = best < 0 ? 1 : best > 1 ? 0 : 1 - best
      img[i] = Math.round(255 * bb)
      img[i + 1] = Math.round(255 * bb)
      img[i + 2] = Math.round(255 * bb)
      img[i + 3] = Math.round(a * 255)
    }
  }
  const tex = new THREE.DataTexture(img, size, size)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

export const FUR_MAP = makeStrandTexture()
// fully random strand directions — for limbs where UV-aligned strands stripe
export const FUR_MAP_LIMB = makeStrandTexture(1024, 28, 2.0)

// Amber puppy iris painted on canvas.
function makeIris() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#20140c'
  g.fillRect(0, 0, s, s)
  const cx = s / 2,
    cy = s / 2
  let grad = g.createRadialGradient(cx, cy, 10, cx, cy, s * 0.46)
  grad.addColorStop(0, '#7a6a30')
  grad.addColorStop(0.55, '#96995d')
  grad.addColorStop(0.85, '#a8ab6a')
  grad.addColorStop(1, '#5c5024')
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cy, s * 0.46, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.28
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2
    const r0 = s * 0.13 + Math.random() * s * 0.05
    const r1 = s * 0.42
    g.strokeStyle = Math.random() < 0.5 ? '#4a4020' : '#c8c48a'
    g.lineWidth = 1 + Math.random() * 1.6
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    g.stroke()
  }
  g.globalAlpha = 1
  grad = g.createRadialGradient(cx, cy, s * 0.34, cx, cy, s * 0.46)
  grad.addColorStop(0, 'rgba(20,14,6,0)')
  grad.addColorStop(0.85, 'rgba(20,14,6,0.85)')
  grad.addColorStop(1, 'rgba(12,8,4,1)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cy, s * 0.46, 0, Math.PI * 2)
  g.fill()
  grad = g.createRadialGradient(cx, cy, 2, cx, cy, s * 0.16)
  grad.addColorStop(0, '#000')
  grad.addColorStop(0.8, '#050403')
  grad.addColorStop(1, 'rgba(5,4,3,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cy, s * 0.16, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.beginPath()
  g.arc(s * 0.385, s * 0.33, s * 0.038, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.beginPath()
  g.arc(s * 0.6, s * 0.62, s * 0.02, 0, Math.PI * 2)
  g.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export const IRIS_MAP = makeIris()
