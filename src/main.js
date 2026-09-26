import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildBear, JAW_OPEN } from './bear.js'
import { furUniforms } from './fur.js'
import { hairUniforms } from './hair.js'

const params = new URLSearchParams(location.search)
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600
const quality = params.has('q') ? Number(params.get('q')) : mobile ? 0.45 : 1
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
const maxDpr = mobile ? 1.75 : 2
let dpr = Math.min(devicePixelRatio, maxDpr)
renderer.setPixelRatio(dpr)
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 0.72
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.VSMShadowMap

const scene = new THREE.Scene()
const bg = new THREE.Color('#d6cec4')
scene.background = bg

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.3

// Soft daylight: warm key, cool sky fill, strong back rim so the fur halo glows.
const hemi = new THREE.HemisphereLight('#ffeedd', '#6a4a36', 0.32)
scene.add(hemi)
const key = new THREE.DirectionalLight('#fff0dc', 3.0)
key.position.set(-1.1, 4.6, 1.6)
key.castShadow = true
key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 1.4, bottom: -0.4, near: 0.5, far: 9 })
key.shadow.bias = -0.0005
key.shadow.normalBias = 0.002
key.shadow.radius = 14
key.shadow.blurSamples = 16
scene.add(key)
const fill = new THREE.DirectionalLight('#dfe8ff', 0.3)
fill.position.set(3, 1.2, 2)
scene.add(fill)
const rim = new THREE.DirectionalLight('#ffe2b8', 0.9)
rim.position.set(1.5, 2.5, -3)
scene.add(rim)

// Seamless studio sweep: the floor only receives shadow, so it melts into the backdrop.
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ color: '#3a2a1c', opacity: 0.32 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)
// Contact shadow so the paws feel planted even where the shadow map is soft.
{
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(50,32,20,0.6)')
  grd.addColorStop(0.45, 'rgba(50,32,20,0.3)')
  grd.addColorStop(1, 'rgba(60,40,25,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  blob.rotation.x = -Math.PI / 2
  blob.position.set(0.03, 0.002, -0.06)
  scene.add(blob)
}

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 30)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.enablePan = false
controls.minDistance = 0.8
controls.maxDistance = 5
controls.minPolarAngle = 0.3
controls.maxPolarAngle = 1.62
controls.autoRotateSpeed = 0.8

// Let the loading veil paint before the (synchronous) sculpt + mesh step.
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
const t0 = performance.now()
const bear = buildBear({ quality, fur: !params.has('nofur'), hair: !params.has('nohair') })
let verts = 0
bear.root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) verts += o.geometry.attributes.position.count })
console.info(`Bear built in ${Math.round(performance.now() - t0)} ms: ${verts} skin vertices, ${bear.stats.shells} fur shells`)
scene.add(bear.root)
const { rig } = bear
window.__bear = { rig, camera, controls, scene }

const views = {
  full: { target: [0, 0.55, 0], dir: [0.55, 0.28, 1], dist: 3.1 },
  face: { target: [0, 0.9, 0.18], dir: [0.18, 0.06, 1], dist: 1.25 },
  snout: { target: [0, 0.86, 0.3], dir: [0.3, 0.12, 1], dist: 0.55 },
  side: { target: [0.02, 0.5, -0.05], dir: [1, 0.22, 0.1], dist: 3.2 },
}
let tween = null
function setView(name, instant = false) {
  const v = views[name] || views.full
  const fit = Math.max(1, 0.72 / camera.aspect)
  const target = new THREE.Vector3(...v.target)
  const pos = new THREE.Vector3(...v.dir).normalize().multiplyScalar(v.dist * fit).add(target)
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)))
  if (instant) {
    controls.target.copy(target)
    camera.position.copy(pos)
    controls.update()
    return
  }
  tween = { from: camera.position.clone(), fromT: controls.target.clone(), to: pos, toT: target, t: 0 }
}
setView(params.get('view') || 'full', true)

// ---------- Behaviour --------------------------------------------------------------

const state = {
  paused: reducedMotion || params.has('still'),
  excite: 0, // 0 calm .. 1 very happy (after a pet)
  look: new THREE.Vector2(), lookTarget: new THREE.Vector2(),
  tilt: 0, tiltTarget: 0, nextTilt: 3,
  blink: 0, nextBlink: 2,
  earTwitch: [0, 0], nextTwitch: 1.5,
  pointerActive: 0,
}
const pointer = new THREE.Vector2()
addEventListener('pointermove', e => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  state.pointerActive = 2.5
})

const raycaster = new THREE.Raycaster()
let downAt = null
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY] })
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return
  raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera)
  if (raycaster.intersectObjects(bear.pickables, false).length) pet()
})

function pet() {
  state.excite = 1
  state.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * 0.28
  state.nextTilt = 2.5
  dirty = true
}
window.petBear = pet
window.setView = setView
window.toggleMotion = () => {
  dirty = true
  state.paused = !state.paused
  document.getElementById('motion-button').setAttribute('aria-pressed', String(state.paused))
  document.getElementById('motion-button').textContent = state.paused ? 'Resume' : 'Pause'
}
window.toggleRotate = () => {
  controls.autoRotate = !controls.autoRotate
  document.getElementById('rotate-button').setAttribute('aria-pressed', String(controls.autoRotate))
}
if (state.paused) {
  const b = document.getElementById('motion-button')
  b.setAttribute('aria-pressed', 'true')
  b.textContent = 'Resume'
}

const headWorld = new THREE.Vector3()
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
let time = 0

function animate(dt) {
  time += dt
  const s = state
  s.excite = Math.max(0, s.excite - dt * 0.18)
  const ex = s.excite

  // Where to look: the pointer when it's moving, otherwise the camera with idle wander.
  s.pointerActive -= dt
  if (s.pointerActive > 0) {
    s.lookTarget.set(pointer.x * 0.6, pointer.y * 0.35 + 0.05)
  } else {
    rig.neck.getWorldPosition(headWorld)
    const toCam = camera.position.clone().sub(headWorld)
    const yaw = Math.atan2(toCam.x, toCam.z)
    const pitch = Math.atan2(toCam.y - 0.2, Math.hypot(toCam.x, toCam.z))
    s.lookTarget.set(
      clamp(yaw, -0.7, 0.7) + Math.sin(time * 0.31) * 0.12,
      clamp(pitch * 0.5, -0.15, 0.3) + Math.sin(time * 0.23) * 0.05,
    )
  }
  s.look.x = damp(s.look.x, s.lookTarget.x, 3, dt)
  s.look.y = damp(s.look.y, s.lookTarget.y, 3, dt)

  // Curious head tilt now and then.
  s.nextTilt -= dt
  if (s.nextTilt < 0) {
    s.tiltTarget = s.tiltTarget !== 0 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.15)
    s.nextTilt = s.tiltTarget !== 0 ? 1.6 + Math.random() : 3 + Math.random() * 4
  }
  s.tilt = damp(s.tilt, s.tiltTarget, 5, dt)

  const breathe = Math.sin(time * (2.2 + ex * 5))
  rig.neck.rotation.set(-s.look.y * 0.6 + breathe * 0.01, s.look.x * 0.75, 0)
  rig.headRig.rotation.set(-s.look.y * 0.5, s.look.x * 0.25, s.tilt)
  rig.chest.scale.set(1 + breathe * 0.006, 1, 1 + breathe * 0.01)

  // Eyes track a little ahead of the head; blinks are quick.
  s.nextBlink -= dt
  if (s.nextBlink < 0) { s.blink = 1; s.nextBlink = 2 + Math.random() * 4 }
  s.blink = Math.max(0, s.blink - dt * 7)
  const close = Math.min(1, Math.sin(s.blink * Math.PI) + ex * 0.3)
  for (const eye of rig.eyes) {
    eye.userData.ball.rotation.set(0.04 - s.look.y * 0.3, s.look.x * 0.3, 0)
    eye.userData.lidTop.rotation.x = close * 1.05
    eye.userData.lidBottom.rotation.x = -close * 0.25
  }

  // Ears: perk forward when curious, ease back when happy, with small twitches.
  s.nextTwitch -= dt
  if (s.nextTwitch < 0) {
    s.earTwitch[Math.random() < 0.5 ? 0 : 1] = 1
    s.nextTwitch = 1.5 + Math.random() * 3.5
  }
  rig.ears.forEach((ear, i) => {
    s.earTwitch[i] = Math.max(0, s.earTwitch[i] - dt * 5)
    const side = i === 0 ? -1 : 1
    const tw = Math.sin(s.earTwitch[i] * Math.PI)
    ear.rotation.set(-ex * 0.45 + tw * 0.15, 0, side * (tw * 0.12 + ex * 0.2))
  })

  // Tail sweeps along the floor; faster and wider when happy.
  const wag = Math.sin(time * (3 + ex * 11)) * (0.1 + ex * 0.35)
  rig.tail.rotation.set(0, wag, 0)

  // Panting tongue.
  const pant = Math.sin(time * (5 + ex * 7))
  // Tongue comes out to pant when he's happy, and tucks away at rest.
  rig.tongue.rotation.x = pant * (0.03 + ex * 0.06)
  // Mouth closed at rest; it opens into a pant (tongue out) when he's happy.
  s.pant = damp(s.pant ?? 0, ex > 0.08 ? 1 : 0, 4, dt)
  rig.jaw.rotation.x = -JAW_OPEN * (1 - s.pant) + pant * 0.03 * s.pant
  rig.tongue.scale.set(Math.max(1e-4, s.pant), Math.max(1e-4, s.pant), s.pant * (1 + ex * 0.15 + pant * 0.02) + 1e-4)
  if (rig.tag) rig.tag.rotation.z = Math.sin(time * 2.1) * 0.08 + wag * 0.2

  furUniforms.uTime.value = time
  furUniforms.uWind.value.set(Math.sin(time * 0.7) * 0.06, 0, Math.cos(time * 0.5) * 0.04)
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

// ---------- Loop -------------------------------------------------------------------

const clock = new THREE.Clock()
let dirty = true
window.__bear.redraw = () => { dirty = true }
addEventListener('resize', () => { dirty = true })
let slowFrames = 0
function updateHairLights() {
  const view = camera.matrixWorldInverse
  hairUniforms.uKeyDir.value.copy(key.position).normalize().transformDirection(view)
  hairUniforms.uRimDir.value.copy(rim.position).normalize().transformDirection(view)
  hairUniforms.uKeyColor.value.copy(key.color).multiplyScalar(key.intensity)
  hairUniforms.uRimColor.value.copy(rim.color).multiplyScalar(rim.intensity)
  // Hemisphere plus a rough share of the environment's irradiance.
  const env = scene.environmentIntensity * 0.9
  hairUniforms.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity + env)
  hairUniforms.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity + env * 0.6)
  hairUniforms.uViewportH.value = renderer.domElement.height
}
function render(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt * 1.6)
    const e = 1 - Math.pow(1 - tween.t, 3)
    camera.position.lerpVectors(tween.from, tween.to, e)
    controls.target.lerpVectors(tween.fromT, tween.toT, e)
    if (tween.t >= 1) tween = null
  }
  camera.updateMatrixWorld()
  updateHairLights()
  renderer.render(scene, camera)
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  if (!state.paused) animate(dt)
  // While paused, only redraw when the view actually changes.
  const moved = controls.update()
  if (state.paused && !moved && !tween && !controls.autoRotate && !dirty) return
  dirty = false
  render(dt)
  // Adaptive resolution: step down if the GPU can't keep up.
  if (dt > 1 / 40) slowFrames++
  else slowFrames = Math.max(0, slowFrames - 1)
  if (slowFrames > 45 && dpr > 1) {
    dpr = Math.max(1, dpr - 0.25)
    renderer.setPixelRatio(dpr)
    slowFrames = 0
  }
}
animate(0.016)
// ?fit=dist,elev,yaw,headYaw,headPitch,headRoll reproduces a camera and head pose found
// by fit/fit.mjs for one reference photo (square viewport), for colour matching.
if (params.has('fit')) {
  const [dist, elev, yaw, hy, hp, hr] = params.get('fit').split(',').map(Number)
  const target = new THREE.Vector3(0, 0.58, 0.04)
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.8 / dist))
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  camera.position.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev)).multiplyScalar(dist).add(target)
  controls.target.copy(target)
  controls.update()
  rig.neck.rotation.order = 'YXZ'
  rig.neck.rotation.set(hp || 0, hy || 0, hr || 0)
  rig.headRig.rotation.set(0, 0, 0)
  for (const eye of rig.eyes) eye.userData.ball.rotation.set(0, 0, 0)
}
renderer.setAnimationLoop(frame)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

requestAnimationFrame(() => {
  document.getElementById('veil').classList.add('hide')
  window.__bearReady = true
})
setTimeout(() => document.getElementById('hint')?.classList.add('fade'), 7000)
