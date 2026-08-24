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
// Long, gently curved strands, bucketed per cell for fast generation.
function makeStrandTexture(size = 1024, cells = 34, angleJitter = 0.55, minStrands = 1) {
  const rnd = mulberry32(1234)
  const cs = size / cells
  const buckets = Array.from({ length: cells * cells }, () => [])
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const n = minStrands + (rnd() < 0.55 ? 1 : 0)
      for (let s = 0; s < n; s++) {
        const x0 = (cx + rnd()) * cs
        const y0 = (cy + rnd()) * cs
        const ang = Math.PI / 2 + (rnd() - 0.5) * angleJitter * Math.PI
        const len = cs * (1.25 + rnd() * 1.05)
        const bend = (rnd() - 0.5) * 0.9
        const mx = x0 + Math.cos(ang + bend) * len * 0.55
        const my = y0 + Math.sin(ang + bend) * len * 0.55
        const x1 = x0 + Math.cos(ang) * len
        const y1 = y0 + Math.sin(ang) * len
        buckets[cy * cells + cx].push({
          x0,
          y0,
          mx,
          my,
          x1,
          y1,
          w: cs * (0.13 + rnd() * 0.07),
          b: 0.86 + rnd() * 0.28,
          warm: rnd(),
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
      let ww = 0.5
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
            const qx0 = s.mx - wx
            const qy0 = s.my - wy
            const ex = s.x1 - wx
            const ey = s.y1 - wy
            // distance to quadratic bezier (coarse: sample 6 segments)
            let px2 = sx
            let py2 = sy
            let dBest = 1e9
            for (let t = 1; t <= 6; t++) {
              const u = t / 6
              const v = 1 - u
              const bx2 = v * v * sx + 2 * v * u * qx0 + u * u * ex
              const by2 = v * v * sy + 2 * v * u * qy0 + u * u * ey
              const mx2 = (px2 + bx2) * 0.5
              const my2 = (py2 + by2) * 0.5
              const ddx = bx2 - px2
              const ddy = by2 - py2
              const ll = ddx * ddx + ddy * ddy || 1
              let tt = ((px - mx2) * ddx + (py - my2) * ddy) / ll
              tt = tt < 0 ? 0 : tt > 1 ? 1 : tt
              const rx = mx2 + ddx * tt - px
              const ry = my2 + ddy * tt - py
              const d = Math.sqrt(rx * rx + ry * ry) - s.w
              if (d < dBest) dBest = d
              px2 = bx2
              py2 = by2
            }
            if (dBest < best) {
              best = dBest
              bb = s.b
              ww = s.warm
            }
          }
        }
      const i = (y * size + x) * 4
      // soft edge: fade over ~4px so the shell height-field has gentle slopes
      const a = Math.max(0, Math.min(1, (1.4 - best) / 4))
      img[i] = Math.round(255 * bb * (1 + (ww - 0.5) * 0.12))
      img[i + 1] = Math.round(255 * bb)
      img[i + 2] = Math.round(255 * bb * (1 - (ww - 0.5) * 0.16))
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
export const FUR_MAP_LIMB = makeStrandTexture(1024, 34, 2.0, 2)

// Amber puppy iris painted on canvas.
function makeIris() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#20140c'
  g.fillRect(0, 0, s, s)
  const cx = s / 2
  const cy = s / 2
  let grad = g.createRadialGradient(cx, cy, 10, cx, cy, s * 0.46)
  grad.addColorStop(0, '#4a3f1e')
  grad.addColorStop(0.55, '#77683a')
  grad.addColorStop(0.85, '#8a7a45')
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
