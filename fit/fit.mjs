// Analysis-by-synthesis shape fitting (no AI in the loop).
//
// For each reference photo we have a segmented silhouette and pixel-detected landmarks.
// We render the model's silhouette from a virtual camera by ray-marching its distance
// field, measure both images with the SAME function (row-by-row extents and filled
// width, landmark positions, all normalised by silhouette height), and let Nelder–Mead
// minimise the difference over the shape parameters (+ each photo's camera).
//
//   node fit/fit.mjs [iterations]      → writes src/shape.json and fit/data/report.json
import fs from 'node:fs'
globalThis.document = { createElement: () => ({ getContext: () => null }) }
const bear = await import('../src/bear.js')
const { P, setShape, silhouetteSDF, headPoint, earTips } = bear

const DATA = new URL('./data/', import.meta.url).pathname
const LM = JSON.parse(fs.readFileSync(DATA + 'landmarks.json', 'utf8'))
const MANUAL = JSON.parse(fs.readFileSync(new URL('./manual.json', import.meta.url), 'utf8'))
for (const [k, v] of Object.entries(MANUAL)) if (LM[k]) Object.assign(LM[k], v)

// ---------- Images ---------------------------------------------------------------------
function readPGM(path) {
  const buf = fs.readFileSync(path)
  const head = buf.subarray(0, 40).toString('latin1').split(/\s+/)
  const w = +head[1], h = +head[2]
  const off = buf.length - w * h
  const px = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) px[i] = buf[off + i] / 255
  return { w, h, px }
}

// ---------- The one measurement used for photos and renders ------------------------------
const BINS = 64
function measure(img, lm) {
  const { w, h, px } = img
  let top = h, bottom = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x] > 0.5) { if (y < top) top = y; bottom = y }
  // Sub-pixel top/bottom from column coverage.
  if (bottom >= 0) {
    let ct = 0, cb = 0
    for (let x = 0; x < w; x++) { ct = Math.max(ct, top > 0 ? px[(top - 1) * w + x] : 0); cb = Math.max(cb, bottom < h - 1 ? px[(bottom + 1) * w + x] : 0) }
    top -= ct; bottom += cb
  }
  if (bottom < 0) { top = 0; bottom = h - 1 }
  const H = bottom - top + 1
  top = Math.max(0, top)
  const ax = lm.nose[0]
  const L = new Float32Array(BINS).fill(NaN), R = new Float32Array(BINS).fill(NaN), F = new Float32Array(BINS).fill(0)
  const cnt = new Float32Array(BINS)
  for (let y = Math.ceil(top); y <= Math.floor(bottom); y++) {
    const b = Math.min(BINS - 1, Math.floor(((y - top) / H) * BINS))
    let l = -1, r = -1, f = 0
    for (let x = 0; x < w; x++) { const v = px[y * w + x]; f += v; if (v > 0.5) { if (l < 0) l = x; r = x } }
    if (l < 0) continue
    // Interpolate the 0.5 crossing on each side.
    const a0 = l > 0 ? px[y * w + l - 1] : 0, a1 = px[y * w + l]
    l = l - (a1 - 0.5) / Math.max(a1 - a0, 1e-3)
    const b0 = r < w - 1 ? px[y * w + r + 1] : 0, b1 = px[y * w + r]
    r = r + (b1 - 0.5) / Math.max(b1 - b0, 1e-3)
    L[b] = (isNaN(L[b]) ? 0 : L[b]) + (l - ax) / H
    R[b] = (isNaN(R[b]) ? 0 : R[b]) + (r - ax) / H
    F[b] += f / H
    cnt[b]++
  }
  for (let b = 0; b < BINS; b++) if (cnt[b]) { L[b] /= cnt[b]; R[b] /= cnt[b]; F[b] /= cnt[b] }
  const norm = p => (p ? [(p[0] - ax) / H, (p[1] - top) / H] : null)
  return { anchor: { top, H, ax, w, h }, L, R, F, lm: { earL: norm(lm.earL), earR: norm(lm.earR), eyes: lm.eyes.map(norm), nose: norm(lm.nose) } }
}

// ---------- Renderer -------------------------------------------------------------------
function camera(cam, W, H) {
  const target = [0, 0.58, 0.04]
  const ce = Math.cos(cam.elev), se = Math.sin(cam.elev)
  const eye = [target[0] + cam.dist * Math.sin(cam.yaw) * ce, target[1] + cam.dist * se, target[2] + cam.dist * Math.cos(cam.yaw) * ce]
  const f = norm3(sub(target, eye)), r = norm3(cross(f, [0, 1, 0])), u = cross(r, f)
  const tanH = 0.8 / cam.dist // keep the dog filling most of the frame at any distance
  return { eye, f, r, u, tanH, W, H,
    project(p) {
      const d = sub(p, eye), z = dot(d, f)
      return [W / 2 + (dot(d, r) / z / tanH) * (H / 2), H / 2 - (dot(d, u) / z / tanH) * (H / 2)]
    } }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = a => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }

const BOX = { min: [-0.5, -0.01, -0.65], max: [0.5, 1.45, 0.55] }
function render(cam, W, H, opts) {
  const c = camera(cam, W, H)
  const px = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sx = ((i + 0.5 - W / 2) / (H / 2)) * c.tanH, sy = -((j + 0.5 - H / 2) / (H / 2)) * c.tanH
    const d = norm3([c.f[0] + c.r[0] * sx + c.u[0] * sy, c.f[1] + c.r[1] * sx + c.u[1] * sy, c.f[2] + c.r[2] * sx + c.u[2] * sy])
    // Clip the ray to the bounding box, then sphere-trace inside it.
    let t0 = 0, t1 = 1e9
    for (let k = 0; k < 3; k++) {
      const inv = 1 / d[k]
      let a = (BOX.min[k] - c.eye[k]) * inv, b = (BOX.max[k] - c.eye[k]) * inv
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a); t1 = Math.min(t1, b)
    }
    if (t0 > t1) continue
    // Soft coverage: how close the ray passes to the surface, in pixel footprints.
    let t = t0, closest = 1e9, tc = t0
    for (let s = 0; s < 90 && t < t1; s++) {
      const x = c.eye[0] + d[0] * t, y = c.eye[1] + d[1] * t, z = c.eye[2] + d[2] * t
      const dist = silhouetteSDF(x, y, z, opts)
      if (dist < closest) { closest = dist; tc = t }
      if (dist < 0) break
      t += Math.max(dist * 0.9, 0.0015)
    }
    const footprint = (tc * c.tanH * 2) / H
    px[j * W + i] = Math.min(1, Math.max(0, 0.5 - closest / footprint))
  }
  const pose = opts.pose || {}
  const eyes = bear.EYE_POS.map(p => c.project(headPoint(p, pose)))
  const nose = c.project(headPoint([bear.NOSE_POS[0], bear.NOSE_POS[1], bear.NOSE_POS[2] + 0.01], pose))
  const [earL, earR] = earTips().map(p => c.project(headPoint(p, pose)))
  return { img: { w: W, h: H, px }, lm: { eyes, nose, earL, earR } }
}

// ---------- Loss --------------------------------------------------------------------------
function profileLoss(a, b) {
  let e = 0, n = 0
  for (let k = 0; k < BINS; k++) {
    const ha = !isNaN(a.L[k]), hb = !isNaN(b.L[k])
    if (ha && hb) { e += Math.abs(a.L[k] - b.L[k]) + Math.abs(a.R[k] - b.R[k]) + Math.abs(a.F[k] - b.F[k]); n++ }
    else if (ha !== hb) { e += 0.3; n++ }
  }
  return e / Math.max(n, 1)
}
function landmarkLoss(a, b) {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
  let eyes = 0, ne = 0
  for (let i = 0; i < 2; i++) if (a.eyes[i] && b.eyes[i]) { eyes += d(a.eyes[i], b.eyes[i]); ne++ }
  eyes /= Math.max(ne, 1)
  return (d(a.earL, b.earL) + d(a.earR, b.earR)) / 2 + eyes + d(a.nose, b.nose) * 0.5
}

// ---------- Parameters -----------------------------------------------------------------
// [name, min, max]. Shape params are shared by all views; camera params are per view.
// Bounds are plausible puppy anatomy; fur thickness is fixed (it is a rendering
// property the silhouette proxy only approximates, so letting it float lets the
// optimiser trade coat for skull).
const SHAPE_PARAMS = [
  ['headScale', 1.0, 1.3], ['headY', -0.14, 0.0], ['skullW', 0.9, 1.15], ['skullH', 0.9, 1.15], ['cheekW', 0.85, 1.2],
  ['muzzleLen', 0.85, 1.15], ['muzzleW', 0.9, 1.12], ['eyeX', 0.05, 0.066], ['eyeY', 0.92, 0.96],
  ['earX', 0.07, 0.105], ['earY', 1.0, 1.07], ['earW', 0.062, 0.09], ['earH', 0.13, 0.18], ['earSplay', 0.0, 0.35],
  ['bodyW', 0.9, 1.15], ['bodyH', 0.9, 1.12], ['legX', 0.85, 1.25], ['legR', 0.85, 1.2], ['pawS', 0.9, 1.2], ['haunchW', 0.85, 1.15],
]
// Prior: penalise moving away from the hand-sculpted starting shape, per unit of range.
const PRIOR = +(process.env.PRIOR || 0.15)
const VIEWS = (process.env.VIEWS || '094').split(',')
const CAM_PARAMS = [['dist', 1.6, 6], ['elev', -0.15, 0.6], ['yaw', -0.4, 0.4], ['headYaw', -1.5, 1.5], ['headPitch', -0.5, 0.5], ['headRoll', -0.5, 0.5]]
const START_CAM = { dist: 3, elev: 0.1, yaw: 0, headYaw: 0, headPitch: 0, headRoll: 0 }
const START_VIEW = { '040': { headYaw: 1.1 }, '018': { headYaw: 1.1 }, '107': { headYaw: 1.0 } }

const specs = [...SHAPE_PARAMS.map(([k, lo, hi]) => ({ k, lo, hi }))]
for (const v of VIEWS) for (const [k, lo, hi] of CAM_PARAMS) specs.push({ k: `${v}.${k}`, lo, hi, view: v, ck: k })
const toVec = () => specs.map(s => (s.view ? (START_VIEW[s.view]?.[s.ck] ?? START_CAM[s.ck]) : P[s.k]))
const scale = specs.map(s => (s.hi - s.lo) * 0.08)
const x0prior = specs.map(s => (s.view ? 0 : P[s.k]))

const targets = Object.fromEntries(VIEWS.map(v => {
  const img = readPGM(`${DATA}${v}_mask.pgm`)
  const s = img.h / LM[v].size[1]
  const sc = p => (p ? [p[0] * s, p[1] * s] : null)
  const lm = { eyes: LM[v].eyes.map(sc), nose: sc(LM[v].nose), earL: sc(LM[v].earL), earR: sc(LM[v].earR) }
  return [v, measure(img, lm)]
}))

const RES = +(process.env.RES || 96)
function evaluate(vec, detail = false) {
  const shape = {}, cams = {}
  specs.forEach((s, i) => {
    const val = Math.min(s.hi, Math.max(s.lo, vec[i]))
    if (s.view) (cams[s.view] ??= {})[s.ck] = val
    else shape[s.k] = val
  })
  setShape(shape)
  let total = 0
  const parts = {}
  for (const v of VIEWS) {
    const cam = cams[v], pose = { yaw: cam.headYaw, pitch: cam.headPitch, roll: cam.headRoll }
    const r = render(cam, RES, RES, { tail: false, pose })
    const m = measure(r.img, r.lm)
    const pl = profileLoss(targets[v], m), ll = landmarkLoss(targets[v].lm, m.lm)
    parts[v] = { profile: pl, landmarks: ll }
    total += pl + ll
    if (detail) parts[v].render = r
  }
  specs.forEach((s, i) => { if (!s.view) total += PRIOR * VIEWS.length * ((vec[i] - x0prior[i]) / (s.hi - s.lo)) ** 2 })
  // Out-of-bounds penalty keeps the simplex inside the box.
  specs.forEach((s, i) => { if (vec[i] < s.lo) total += (s.lo - vec[i]) * 10; if (vec[i] > s.hi) total += (vec[i] - s.hi) * 10 })
  if (!Number.isFinite(total)) total = 10
  return detail ? { total, parts, shape, cams } : total / VIEWS.length
}

// ---------- Nelder–Mead ------------------------------------------------------------------
function nelderMead(f, x0, steps, iters) {
  const n = x0.length
  let simplex = [x0.slice()]
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x) }
  let vals = simplex.map(x => f(x))
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b])
    simplex = order.map(i => simplex[i]); vals = order.map(i => vals[i])
    if (it % 20 === 0) console.log(`iter ${it}  loss ${vals[0].toFixed(4)}`)
    const c = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n
    const pt = (a) => c.map((ck, k) => ck + a * (simplex[n][k] - ck))
    const xr = pt(-1), fr = f(xr)
    if (fr < vals[0]) {
      const xe = pt(-2), fe = f(xe)
      if (fe < fr) { simplex[n] = xe; vals[n] = fe } else { simplex[n] = xr; vals[n] = fr }
    } else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr }
    else {
      const xc = pt(fr < vals[n] ? -0.5 : 0.5), fc = f(xc)
      if (fc < Math.min(fr, vals[n])) { simplex[n] = xc; vals[n] = fc }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); vals[i] = f(simplex[i]) }
    }
  }
  const best = vals.indexOf(Math.min(...vals))
  return { x: simplex[best], f: vals[best] }
}

// ---------- Pattern search (robust on piecewise / bumpy losses) ------------------------
function patternSearch(f, x0, steps, sweeps, minStep = 0.02) {
  let x = x0.slice(), fx = f(x)
  const st = steps.slice()
  for (let sw = 0; sw < sweeps; sw++) {
    let improved = false
    for (let i = 0; i < x.length; i++) {
      for (const dir of [1, -1]) {
        const y = x.slice(); y[i] += dir * st[i]
        const fy = f(y)
        if (fy < fx - 1e-5) {
          x = y; fx = fy; improved = true
          // Keep going in the same direction while it pays off.
          for (let k = 0; k < 4; k++) { const z = x.slice(); z[i] += dir * st[i]; const fz = f(z); if (fz < fx - 1e-5) { x = z; fx = fz } else break }
          break
        }
      }
    }
    console.log(`sweep ${sw}  loss ${fx.toFixed(4)}`)
    if (!improved) { for (let i = 0; i < st.length; i++) st[i] *= 0.5; if (st.every((v, i) => v < steps[i] * minStep)) break }
  }
  return { x, f: fx }
}

// ---------- Run --------------------------------------------------------------------------
if (process.env.SENS) {
  const x0 = toVec(); specs.forEach((sp, i) => { if (sp.view) x0[i] = JSON.parse(fs.readFileSync(DATA + 'report.json')).cams[sp.view][sp.ck] })
  const f0 = evaluate(x0)
  console.log('base', f0.toFixed(4))
  specs.forEach((sp, i) => {
    const row = [-0.25, 0.25].map(fr => { const x = x0.slice(); x[i] = Math.min(sp.hi, Math.max(sp.lo, x[i] + fr * (sp.hi - sp.lo))); return (evaluate(x) - f0).toFixed(4) })
    console.log(sp.k.padEnd(12), row.join('  '))
  })
  process.exit(0)
}
const iters = +(process.argv[2] || 300)
let x = toVec()
const before = evaluate(x, true)
console.log('start', before.total.toFixed(4), JSON.stringify(Object.fromEntries(Object.entries(before.parts).map(([k, v]) => [k, { profile: +v.profile.toFixed(4), landmarks: +v.landmarks.toFixed(4) }]))))
const t0 = Date.now()
// Cameras first (shape frozen), then everything — standard coarse-to-fine fitting.
const camIdx = specs.map((s, i) => (s.view ? i : -1)).filter(i => i >= 0)
{
  const sub = xs => { const y = x.slice(); camIdx.forEach((i, k) => (y[i] = xs[k])); return y }
  const r = nelderMead(xs => evaluate(sub(xs)), camIdx.map(i => x[i]), camIdx.map(i => scale[i] * 3), 60)
  x = sub(r.x)
}
x = patternSearch(evaluate, x, scale.map(v => v * 1.5), iters).x
const after = evaluate(x, true)
console.log('end', after.total.toFixed(4), `(${((Date.now() - t0) / 1000).toFixed(0)} s)`)

// Save the fitted shape (rounded) and a report with the final measurements.
const shape = Object.fromEntries(Object.entries({ ...P, ...after.shape }).map(([k, v]) => [k, +(+v).toFixed(4)]))
if (!process.env.DRY) fs.writeFileSync(new URL('../src/shape.json', import.meta.url), JSON.stringify(shape, null, 1) + '\n')
fs.writeFileSync(DATA + 'report.json', JSON.stringify({ before: before.total, after: after.total, parts: Object.fromEntries(Object.entries(after.parts).map(([k, v]) => [k, { profile: v.profile, landmarks: v.landmarks }])), cams: after.cams, shape }, null, 1))
const arr = a => Array.from(a, v => (Number.isFinite(v) ? +v.toFixed(4) : null))
const prof = m => ({ anchor: m.anchor, L: arr(m.L), R: arr(m.R), F: arr(m.F), lm: m.lm })
fs.writeFileSync(DATA + 'profiles.json', JSON.stringify(Object.fromEntries(VIEWS.map(v => {
  const r = after.parts[v].render
  return [v, { target: prof(targets[v]), render: prof(measure(r.img, r.lm)) }]
}))))
// Silhouette overlays for inspection: photo (red), render (green), overlap (yellow).
for (const v of VIEWS) {
  const r = after.parts[v].render.img, t = readPGM(`${DATA}${v}_mask.pgm`)
  fs.writeFileSync(`${DATA}${v}_render.pgm`, Buffer.concat([Buffer.from(`P5 ${r.w} ${r.h} 255\n`), Buffer.from(Uint8Array.from(r.px, p => p * 255))]))
}
