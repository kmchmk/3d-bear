import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildPuppy } from './puppy.js'

const isCoarse = window.matchMedia('(pointer: coarse)').matches
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700
const MOBILE = isCoarse || isSmall

// ---------- renderer ----------
const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE })
let maxDpr = MOBILE ? 1.8 : 2
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.VSMShadowMap

// ---------- scene / camera ----------
const scene = new THREE.Scene()
{
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#fdf6ec')
  grad.addColorStop(0.55, '#f3e6d4')
  grad.addColorStop(1, '#e2cdb4')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 256)
  const bg = new THREE.CanvasTexture(c)
  bg.colorSpace = THREE.SRGBColorSpace
  scene.background = bg
}
scene.fog = new THREE.Fog(0xe2cdb4, 9, 16)

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 50)
// pull back on narrow/portrait screens so the whole puppy fits
const fitDistance = () => {
  const aspect = window.innerWidth / window.innerHeight
  return 3.9 * Math.max(1, 1.08 / Math.pow(Math.max(aspect, 0.01), 0.6))
}
camera.position.set(0.55, 1.25, 3.9).setLength(fitDistance())

// ---------- environment light ----------
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.5
pmrem.dispose()

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xfff3e3, 0xcbb59a, 0.55)
scene.add(hemi)

const key = new THREE.DirectionalLight(0xfff0da, 1.5)
key.position.set(2.8, 5, 2.6)
key.castShadow = true
key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048)
const sc = key.shadow.camera
sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -2
sc.near = 1; sc.far = 12
key.shadow.bias = -0.0002
key.shadow.radius = 7
key.shadow.blurSamples = 10
scene.add(key)

const rim = new THREE.DirectionalLight(0xdfe9ff, 0.6)
rim.position.set(-3, 2.6, -2.8)
scene.add(rim)

// ---------- ground ----------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(9, 48),
  new THREE.ShadowMaterial({ opacity: 0.2 })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// soft contact-shadow blob under the body
{
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 126)
  grad.addColorStop(0, 'rgba(70,45,20,0.42)')
  grad.addColorStop(0.55, 'rgba(70,45,20,0.18)')
  grad.addColorStop(1, 'rgba(70,45,20,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.002
  scene.add(blob)
}

// ---------- puppy ----------
const LAYERS = MOBILE ? 10 : 16
const { group: puppy, rig } = buildPuppy({ layers: LAYERS })
scene.add(puppy)
puppy.rotation.y = -0.35 // slightly angled initial pose

// ---------- controls ----------
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0.62, 0)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.enablePan = false
controls.minDistance = 1.7
controls.maxDistance = 7
controls.minPolarAngle = 0.25
controls.maxPolarAngle = 1.52
controls.rotateSpeed = 0.75
controls.autoRotate = true
controls.autoRotateSpeed = 0.7
controls.addEventListener('start', () => {
  controls.autoRotate = false
})
let userZoomed = false
let distAtStart = 0
controls.addEventListener('start', () => {
  distAtStart = controls.getDistance()
})
controls.addEventListener('end', () => {
  if (Math.abs(controls.getDistance() - distAtStart) > 0.25) userZoomed = true
})

// ---------- idle animation ----------
const clock = new THREE.Clock()
const rand = (a, b) => a + Math.random() * (b - a)

function makeTimer(min, max) {
  return { t: rand(min, max), min, max }
}
function tick(timer, dt) {
  timer.t -= dt
  if (timer.t <= 0) {
    timer.t = rand(timer.min, timer.max)
    return true
  }
  return false
}

const breathT = { v: 0 }
const look = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 }
const lookTimer = makeTimer(2.5, 5)
const ears = rig.ears.map((e) => ({ ...e, timer: makeTimer(2, 7), env: 0 }))
const blink = { timer: makeTimer(2.5, 6.5), p: 1 } // p=progress, >=1 means open
const tail = { level: 0.25, target: 0.25, timer: makeTimer(5, 9) }

function updateIdle(dt, t) {
  // breathing
  breathT.v += dt
  const br = Math.sin(breathT.v * 2.1)
  rig.chest.scale.set(0.44 * (1 + 0.018 * br), 0.42 * (1 + 0.03 * br), 0.4 * (1 + 0.02 * br))
  rig.body.scale.set(0.5 * (1 + 0.008 * br), 0.5 * (1 + 0.012 * br), 0.92)
  puppy.position.y = Math.sin(breathT.v * 2.1) * 0.004

  // look around (smoothed targets) + gentle sway
  if (tick(lookTimer, dt)) {
    look.tyaw = rand(-0.38, 0.38)
    look.tpitch = rand(-0.1, 0.14)
  }
  const k = 1 - Math.pow(0.002, dt)
  look.yaw += (look.tyaw - look.yaw) * k
  look.pitch += (look.tpitch - look.pitch) * k
  rig.head.rotation.y = look.yaw + Math.sin(t * 0.45) * 0.05
  rig.head.rotation.x = look.pitch + Math.sin(t * 0.33) * 0.025
  rig.head.rotation.z = Math.sin(t * 0.27) * 0.02

  // ear twitches
  for (const ear of ears) {
    if (tick(ear.timer, dt)) ear.env = 1
    if (ear.env > 0) {
      ear.env -= dt * 3
      const w = Math.max(0, ear.env) * Math.max(0, ear.env)
      ear.group.rotation.z = -0.5 * ear.side + Math.sin((1 - ear.env) * 24) * 0.16 * w
      ear.group.rotation.x = -0.12 + Math.cos((1 - ear.env) * 20) * 0.08 * w
    }
  }

  // blinking
  if (blink.p >= 1 && tick(blink.timer, dt)) blink.p = 0
  if (blink.p < 1) {
    blink.p += dt / 0.16
    const closeAmt = Math.sin(Math.min(1, blink.p) * Math.PI)
    for (const eye of rig.eyes) eye.scale.y = Math.max(0.06, 1 - closeAmt)
  }

  // tail wag with excitement bursts
  if (tick(tail.timer, dt)) tail.target = rand(0.7, 1)
  tail.level += (tail.target - tail.level) * (1 - Math.pow(0.15, dt))
  if (tail.level > 0.6) tail.timer.t -= dt * 2 // bursts decay faster
  else if (tail.level < 0.35 && tail.target > 0.5) tail.target = rand(0.15, 0.3)
  const wagSpeed = 3.2 + tail.level * 3.5
  rig.tail.rotation.y = Math.sin(t * wagSpeed) * (0.16 + 0.3 * tail.level)
  rig.tail.rotation.x = Math.sin(t * wagSpeed * 0.5) * 0.05

  // panting tongue
  rig.tongue.rotation.x = 0.28 + Math.sin(t * 6.8) * 0.05
  rig.tongue.rotation.z = Math.sin(t * 1.9) * 0.07
  const ps = 1 + Math.sin(t * 6.8) * 0.035
  rig.tongue.scale.set(ps, 1 + Math.sin(t * 6.8 + 0.6) * 0.03, ps)

  // collar reacts subtly to breathing
  rig.collar.rotation.z = Math.sin(t * 2.1) * 0.015
}

// ---------- adaptive resolution ----------
let frameAcc = 0
let frameCount = 0
let curDpr = renderer.getPixelRatio()
function adaptResolution(dt) {
  frameAcc += dt
  frameCount++
  if (frameCount < 90) return
  const avg = frameAcc / frameCount
  frameAcc = 0
  frameCount = 0
  if (avg > 0.034 && curDpr > 1) {
    curDpr = Math.max(1, curDpr - 0.25)
    renderer.setPixelRatio(curDpr)
  } else if (avg < 0.02 && curDpr < Math.min(window.devicePixelRatio, maxDpr)) {
    curDpr = Math.min(curDpr + 0.25, Math.min(window.devicePixelRatio, maxDpr))
    renderer.setPixelRatio(curDpr)
  }
}

// ---------- resize ----------
function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  // keep the puppy framed after orientation changes if user hasn't zoomed
  const fit = fitDistance()
  if (!userZoomed && camera.position.distanceTo(controls.target) < 8) {
    camera.position.setLength(fit)
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr))
  curDpr = renderer.getPixelRatio()
  renderer.setSize(w, h)
}
window.addEventListener('resize', onResize)
window.visualViewport?.addEventListener('resize', onResize)

// ---------- loop ----------
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  updateIdle(dt, t)
  controls.update()
  adaptResolution(dt)
  renderer.render(scene, camera)
})

// fade out loading veil once first frame is up
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.getElementById('veil')?.classList.add('hide')
}))
setTimeout(() => document.getElementById('hint')?.classList.add('fade'), 6000)
