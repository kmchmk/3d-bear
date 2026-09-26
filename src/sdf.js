// Signed-distance modelling helpers and a surface-nets mesher.
// Bear is sculpted from smooth primitives and meshed in the browser at load time,
// so there is no binary model file to ship or keep in sync.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
export const mix = (a, b, t) => a + (b - a) * t
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Polynomial smooth minimum; k is the blend radius.
export function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1)
  return mix(b, a, h) - k * h * (1 - h)
}
export function smax(a, b, k) {
  return -smin(-a, -b, k)
}

export function sphere(x, y, z, c, r) {
  const dx = x - c[0], dy = y - c[1], dz = z - c[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r
}

// Approximate ellipsoid distance (iq), good enough near the surface.
export function ellipsoid(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2]
  const k0 = Math.sqrt(px * px + py * py + pz * pz)
  const qx = px / r[0], qy = py / r[1], qz = pz / r[2]
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz)
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1
}

// Cone with rounded ends of radius r1 at a and r2 at b (iq).
export function roundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const pax = x - a[0], pay = y - a[1], paz = z - a[2]
  const yy = pax * bax + pay * bay + paz * baz
  const zz = yy - l2
  const xvx = pax * l2 - bax * yy, xvy = pay * l2 - bay * yy, xvz = paz * l2 - baz * yy
  const x2 = xvx * xvx + xvy * xvy + xvz * xvz
  const y2 = yy * yy * l2
  const z2 = zz * zz * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1
}

// Distance from p to segment ab, plus the 0..1 parameter of the closest point.
export function segment(x, y, z, a, b) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2]
  const pax = x - a[0], pay = y - a[1], paz = z - a[2]
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1)
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t
  return [Math.sqrt(dx * dx + dy * dy + dz * dz), t]
}

// Isosceles triangle in 2D with its tip at the origin and base at y = h (iq).
export function triangle2(px, py, hw, h) {
  px = Math.abs(px)
  const qq = hw * hw + h * h
  const ta = clamp((px * hw + py * h) / qq, 0, 1)
  const ax = px - hw * ta, ay = py - h * ta
  const tb = clamp(px / hw, 0, 1)
  const bx = px - hw * tb, by = py - h
  const s = -Math.sign(h)
  const d1 = ax * ax + ay * ay, s1 = s * (px * h - py * hw)
  const d2 = bx * bx + by * by, s2 = s * (py - h)
  const d = Math.min(d1, d2)
  const sg = Math.min(s1, s2)
  return -Math.sqrt(d) * Math.sign(sg)
}

// Cheap deterministic value noise for surface variation.
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
export function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const fx = x - i, fy = y - j, fz = z - k
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  let v = 0
  for (let c = 0; c < 8; c++) {
    const a = c & 1, b = (c >> 1) & 1, d = (c >> 2) & 1
    const w = (a ? ux : 1 - ux) * (b ? uy : 1 - uy) * (d ? uz : 1 - uz)
    v += w * hash3(i + a, j + b, k + d)
  }
  return v
}

// Surface nets: one vertex per sign-changing cell, quads across sign-changing edges.
// Returns positions/normals/indices for the zero level set of `sdf` inside the bounds.
export function polygonize(sdf, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1
  const field = new Float32Array(nx * ny * nz)
  const at = (i, j, k) => i + nx * (j + ny * k)
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell
      for (let i = 0; i < nx; i++) field[at(i, j, k)] = sdf(min[0] + i * cell, y, z)
    }
  }

  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cat = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k)
  const pos = []
  const corner = new Float32Array(8)
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0
    for (let c = 0; c < 8; c++) {
      const v = field[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]
      corner[c] = v
      if (v < 0) inside++
    }
    if (inside === 0 || inside === 8) continue
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b]
      if ((va < 0) === (vb < 0)) continue
      const t = va / (va - vb)
      sx += (a & 1) + (((b & 1) - (a & 1)) * t)
      sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t)
      sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t)
      n++
    }
    cellIndex[cat(i, j, k)] = pos.length / 3
    pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell)
  }

  const idx = []
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) idx.push(a, b, c, a, c, d)
    else idx.push(a, c, b, a, d, c)
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = field[at(i, j, k)], v1 = field[at(i + 1, j, k)]
    if ((v0 < 0) === (v1 < 0)) continue
    quad(cellIndex[cat(i, j - 1, k - 1)], cellIndex[cat(i, j, k - 1)], cellIndex[cat(i, j, k)], cellIndex[cat(i, j - 1, k)], v0 < 0)
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[at(i, j, k)], v1 = field[at(i, j + 1, k)]
    if ((v0 < 0) === (v1 < 0)) continue
    quad(cellIndex[cat(i - 1, j, k - 1)], cellIndex[cat(i - 1, j, k)], cellIndex[cat(i, j, k)], cellIndex[cat(i, j, k - 1)], v0 < 0)
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[at(i, j, k)], v1 = field[at(i, j, k + 1)]
    if ((v0 < 0) === (v1 < 0)) continue
    quad(cellIndex[cat(i - 1, j - 1, k)], cellIndex[cat(i, j - 1, k)], cellIndex[cat(i, j, k)], cellIndex[cat(i - 1, j, k)], v0 < 0)
  }

  // Project vertices onto the surface and take normals from the field gradient.
  const count = pos.length / 3
  const positions = new Float32Array(pos)
  const normals = new Float32Array(count * 3)
  const e = cell * 0.35
  for (let v = 0; v < count; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z)
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z)
      let gy = sdf(x, y + e, z) - sdf(x, y - e, z)
      let gz = sdf(x, y, z + e) - sdf(x, y, z - e)
      const gl = Math.hypot(gx, gy, gz) || 1
      gx /= gl; gy /= gl; gz /= gl
      const step = clamp(d, -cell * 0.5, cell * 0.5)
      x -= gx * step; y -= gy * step; z -= gz * step
      if (it === 1) { normals[v * 3] = gx; normals[v * 3 + 1] = gy; normals[v * 3 + 2] = gz }
    }
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z
  }
  return { positions, normals, indices: count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) }
}
