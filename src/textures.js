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
export const IRIS_MAP = texture(512, (ctx, size, random) => {
  const r = size / 2
  ctx.fillStyle = '#17100b'; ctx.fillRect(0, 0, size, size)
  const g = ctx.createRadialGradient(r, r, r * 0.26, r, r, r)
  g.addColorStop(0, '#66513c'); g.addColorStop(0.5, '#796548')
  g.addColorStop(0.82, '#51412d'); g.addColorStop(1, '#21170f')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill()
  for (let i = 0; i < 1100; i++) {
    const a = random() * Math.PI * 2, inner = r * (0.28 + random() * 0.26)
    const outer = r * (0.72 + random() * 0.25)
    ctx.strokeStyle = random() > 0.5 ? 'rgba(171,138,84,.22)' : 'rgba(31,21,13,.38)'
    ctx.lineWidth = 0.5 + random() * 1.5
    ctx.beginPath(); ctx.moveTo(r + Math.cos(a) * inner, r + Math.sin(a) * inner)
    ctx.lineTo(r + Math.cos(a + .02) * outer, r + Math.sin(a + .02) * outer); ctx.stroke()
  }
  ctx.fillStyle = '#090c0b'; ctx.beginPath(); ctx.arc(r, r, r * 0.48, 0, Math.PI * 2); ctx.fill()
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
