import * as THREE from 'three'
import { seededRandom } from './fur.js'

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
  ctx.fillStyle = '#292b24'; ctx.fillRect(0, 0, size, size)
  const g = ctx.createRadialGradient(r, r, r * 0.26, r, r, r)
  g.addColorStop(0, '#888473'); g.addColorStop(0.5, '#8c978e')
  g.addColorStop(0.82, '#697c75'); g.addColorStop(1, '#303b34')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill()
  for (let i = 0; i < 1100; i++) {
    const a = random() * Math.PI * 2, inner = r * (0.28 + random() * 0.26)
    const outer = r * (0.72 + random() * 0.25)
    ctx.strokeStyle = random() > 0.5 ? 'rgba(213,207,171,.28)' : 'rgba(36,51,43,.32)'
    ctx.lineWidth = 0.5 + random() * 1.5
    ctx.beginPath(); ctx.moveTo(r + Math.cos(a) * inner, r + Math.sin(a) * inner)
    ctx.lineTo(r + Math.cos(a + .02) * outer, r + Math.sin(a + .02) * outer); ctx.stroke()
  }
  ctx.fillStyle = '#090c0b'; ctx.beginPath(); ctx.arc(r, r, r * 0.39, 0, Math.PI * 2); ctx.fill()
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
