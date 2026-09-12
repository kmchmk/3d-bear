import * as THREE from 'three'

// Kept local so fur can also consume the procedural strand mask without a
// module cycle. The texture seeds are deliberately fixed: a coat should not
// shimmer or change pattern as parts are rebuilt.
function seededRandom(seed = 173) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function texture(size, draw, color = true) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size, seededRandom(831))
  const map = new THREE.CanvasTexture(canvas)
  if (color) map.colorSpace = THREE.SRGBColorSpace
  return map
}

// Planar UVs on a curved iris, not a circular image wrapped around a sphere.
// Readable hazel canine iris: bright gold-brown mid band around a smaller
// pupil, dark limbal rim. Must survive tone-mapping at portrait distance.
export const IRIS_MAP = texture(512, (ctx, size, random) => {
  const r = size / 2
  ctx.fillStyle = '#14100b'; ctx.fillRect(0, 0, size, size)
  const g = ctx.createRadialGradient(r, r, r * 0.20, r, r, r)
  g.addColorStop(0, '#8a7a5c'); g.addColorStop(0.34, '#7a6c4e')
  g.addColorStop(0.58, '#54493a'); g.addColorStop(0.82, '#2e2820'); g.addColorStop(1, '#14100b')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill()
  // Dense radial fibers: bright gold + dark brown for a sunburst hazel read.
  for (let i = 0; i < 1700; i++) {
    const a = random() * Math.PI * 2, inner = r * (0.30 + random() * 0.20)
    const outer = r * (0.66 + random() * 0.28)
    const pick = random()
    ctx.strokeStyle = pick > 0.80 ? 'rgba(196,164,110,.38)' : pick > 0.5 ? 'rgba(150,128,88,.28)' : 'rgba(15,10,6,.46)'
    ctx.lineWidth = 0.5 + random() * 1.4
    ctx.beginPath(); ctx.moveTo(r + Math.cos(a) * inner, r + Math.sin(a) * inner)
    ctx.lineTo(r + Math.cos(a + .025) * outer, r + Math.sin(a + .025) * outer); ctx.stroke()
  }
  // Collarette: pale broken ring just outside the pupil.
  ctx.strokeStyle = 'rgba(190,160,115,.55)'; ctx.lineWidth = r * 0.018
  ctx.beginPath(); ctx.arc(r, r, r * 0.52, 0, Math.PI * 2); ctx.stroke()
  // Limbal ring: dark outer rim like the reference eye edge.
  ctx.strokeStyle = 'rgba(12,8,5,.92)'; ctx.lineWidth = r * 0.070
  ctx.beginPath(); ctx.arc(r, r, r * 0.955, 0, Math.PI * 2); ctx.stroke()
  // Pupil sized to leave a readable hazel band at portrait distance.
  ctx.fillStyle = '#070605'; ctx.beginPath(); ctx.arc(r, r, r * 0.44, 0, Math.PI * 2); ctx.fill()
})

export const NOSE_BUMP = texture(256, (ctx, size, random) => {
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 4800; i++) {
    const v = Math.floor(70 + random() * 120)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.beginPath(); ctx.arc(random() * size, random() * size, 0.5 + random() * 1.6, 0, Math.PI * 2); ctx.fill()
  }
}, false)
NOSE_BUMP.wrapS = NOSE_BUMP.wrapT = THREE.RepeatWrapping
NOSE_BUMP.repeat.set(1, 1)

// Each generated ribbon receives this mask in its own UV space. Its soft,
// uneven edge breaks the hard card silhouette while the opaque core still
// writes depth correctly in a dense coat.
export const FUR_STRAND_ALPHA = texture(128, (ctx, size) => {
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1)
      const edge = Math.abs(u * 2 - 1)
      const shaft = Math.max(0, 1 - Math.pow(edge, 2.35))
      // Round the root very slightly and dissolve the last third into a tip.
      const tip = 1 - Math.pow(Math.max(0, (v - .58) / .42), 1.55)
      const root = .82 + .18 * Math.sin(v * Math.PI)
      const value = Math.round(255 * shaft * tip * root)
      const i = (y * size + x) * 4
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}, false)
FUR_STRAND_ALPHA.wrapS = FUR_STRAND_ALPHA.wrapT = THREE.ClampToEdgeWrapping
FUR_STRAND_ALPHA.magFilter = THREE.LinearFilter
FUR_STRAND_ALPHA.minFilter = THREE.LinearMipmapLinearFilter
