import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
// Load the sculpt separately so the page can paint its loading state first.
const loadPuppy = () => import('./puppy.js')
import { seededRandom } from './fur.js'

const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
renderer.setSize(innerWidth,innerHeight)
renderer.outputColorSpace=THREE.SRGBColorSpace
renderer.toneMapping=THREE.ACESFilmicToneMapping
renderer.toneMappingExposure=1.05
renderer.shadowMap.enabled=true
renderer.shadowMap.type=THREE.VSMShadowMap
const scene=new THREE.Scene()
scene.background=new THREE.Color('#e4e0d7')
scene.fog=new THREE.Fog('#e4e0d7',8,18)
const room=new RoomEnvironment(), pmrem=new THREE.PMREMGenerator(renderer)
const environment=pmrem.fromScene(room,.04)
scene.environment=environment.texture;scene.environmentIntensity=.55
room.dispose();pmrem.dispose()
scene.add(new THREE.HemisphereLight('#f5f7ff','#91816b',.45))
const key=new THREE.DirectionalLight('#fff5e5',1.85)
key.position.set(-3,5,4);key.castShadow=true
key.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048)
Object.assign(key.shadow.camera,{left:-2,right:2,top:2.5,bottom:-1.5,near:.5,far:12})
key.shadow.bias=-.00015;key.shadow.normalBias=.012;key.shadow.radius=6;key.shadow.blurSamples=8
scene.add(key)
const fill=new THREE.DirectionalLight('#dce9ff',.28);fill.position.set(4,2,2);scene.add(fill)
const rim=new THREE.DirectionalLight('#fff0d6',.85);rim.position.set(1,3,-3);scene.add(rim)
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#ddd8cc',roughness:1}))
floor.rotation.x=-Math.PI/2;floor.position.y=-.009;floor.receiveShadow=true;scene.add(floor)
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256
const ctx=shadowCanvas.getContext('2d'), gradient=ctx.createRadialGradient(128,128,0,128,128,128)
gradient.addColorStop(0,'rgba(44,34,22,.38)');gradient.addColorStop(.4,'rgba(44,34,22,.17)');gradient.addColorStop(1,'rgba(44,34,22,0)')
ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256)
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.25),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}))
shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-.007,0);scene.add(shadow)

const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.05,40)
const controls=new OrbitControls(camera,canvas)
controls.enableDamping=true;controls.dampingFactor=.085;controls.enablePan=false
controls.minDistance=.85;controls.maxDistance=7;controls.minPolarAngle=.25;controls.maxPolarAngle=1.55
controls.autoRotate=false;controls.autoRotateSpeed=.45
let model
try {
  const {buildPuppy}=await loadPuppy()
  model=buildPuppy({quality:mobile?.36:.85})
} catch(error) {
  document.querySelector('.veil-text').textContent='Bear could not load. Please reload the page.'
  console.error('Puppy model failed to load',error)
  throw error
}
const {group:puppy,rig}=model
scene.add(puppy)
let activeView='default'
const portraitBounds=new THREE.Box3().setFromObject(puppy)
const portraitCenter=portraitBounds.getCenter(new THREE.Vector3())
const portraitHeight=portraitBounds.max.y-portraitBounds.min.y
const fullTarget=[portraitCenter.x,portraitBounds.min.y+portraitHeight*.51,portraitCenter.z]
const faceTarget=[rig.head.position.x,rig.head.position.y+.045,rig.head.position.z+.09]
const views={
  default:{target:fullTarget,offset:[1.22,.40,3.25]},
  face:{target:faceTarget,offset:[.62,.14,1.75]},
  side:{target:fullTarget,offset:[3.7,.25,.12]},
  front:{target:fullTarget,offset:[0,.18,3.5]}
}
function fitView(name) {
  const view=views[name]||views.default
  const factor=Math.max(1,(name==='face'?.66:.78)/camera.aspect)
  controls.target.set(...view.target)
  camera.position.set(...view.offset).multiplyScalar(factor).add(controls.target)
  controls.update()
}
window.setView=name=>{
  activeView=views[name]?name:'default';controls.autoRotate=false
  document.getElementById('rotate-button')?.setAttribute('aria-pressed','false')
  fitView(activeView)
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===activeView)))
}
fitView(activeView)
controls.addEventListener('start',()=>{controls.autoRotate=false;document.getElementById('rotate-button')?.setAttribute('aria-pressed','false')})
window.toggleRotate=()=>{
  controls.autoRotate=!controls.autoRotate
  document.getElementById('rotate-button').setAttribute('aria-pressed',String(controls.autoRotate))
}
let paused=reducedMotion.matches
window.toggleMotion=()=>{
  paused=!paused
  const button=document.getElementById('motion-button')
  button.textContent=paused?'Play motion':'Pause motion';button.setAttribute('aria-pressed',String(paused))
  if(paused) { rig.setBlink(0); blinkTime=-1 }
}
if(paused) {document.getElementById('motion-button').textContent='Play motion';document.getElementById('motion-button').setAttribute('aria-pressed','true')}

const random=seededRandom(718), randomRange=(a,b)=>a+(b-a)*random()
const look={yaw:0,pitch:0,roll:0,targetYaw:0,targetPitch:0,targetRoll:0,wait:3}
const pointer={x:0,y:0,last:-100}
let elapsed=0,petTime=0,blinkWait=2.8,blinkTime=-1,tailPhase=0,tailLevel=.25,tailWait=2
const earState=rig.ears.map(e=>({...e,wait:randomRange(3,7),phase:-1}))
canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse' && e.buttons===0){pointer.x=e.clientX/innerWidth*2-1;pointer.y=e.clientY/innerHeight*2-1;pointer.last=elapsed}
})
canvas.addEventListener('pointerleave',()=>{pointer.last=-100})
window.petBear=()=>{if(!paused){petTime=2.4;tailLevel=.9;look.targetRoll=-.065}}
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2()
let down=null
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}})
canvas.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6) return
  mouse.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2)
  raycaster.setFromCamera(mouse,camera)
  if(raycaster.intersectObject(puppy,true).length) window.petBear()
  down=null
})
function animate(dt){
  elapsed+=dt
  const t=elapsed, breath=Math.sin(t*2.5)
  rig.breath.value=breath
  look.wait-=dt
  if(look.wait<0){
    look.wait=randomRange(2.8,5.4);look.targetYaw=randomRange(-.20,.20)
    look.targetPitch=randomRange(-.065,.065);look.targetRoll=random()<.25?randomRange(-.055,.055):0
  }
  const attention=Math.max(0,1-(t-pointer.last)/2.5)*.24
  const k=1-Math.exp(-dt*3)
  look.yaw+=(look.targetYaw*(1-attention)+pointer.x*.3*attention-look.yaw)*k
  look.pitch+=(look.targetPitch+pointer.y*.16*attention-look.pitch)*k
  look.roll+=(look.targetRoll-look.roll)*(1-Math.exp(-dt*2))
  rig.head.rotation.set(look.pitch+breath*.003,look.yaw,look.roll)
  petTime=Math.max(0,petTime-dt)
  blinkWait-=dt
  if(blinkWait<0&&blinkTime<0){blinkTime=0;blinkWait=randomRange(2.6,6.2)}
  if(blinkTime>=0){
    blinkTime+=dt
    const closure=Math.sin(Math.min(1,blinkTime/.19)*Math.PI)
    rig.setBlink(closure)
    if(blinkTime>=.19){blinkTime=-1;rig.setBlink(0)}
  }
  for(const ear of earState){
    ear.wait-=dt
    if(ear.wait<0){ear.wait=randomRange(4,9);ear.phase=0}
    if(ear.phase>=0){ear.phase+=dt;const envelope=Math.sin(Math.min(1,ear.phase/.38)*Math.PI)
      ear.group.rotation.z=ear.baseZ+envelope*.065;ear.group.rotation.x=ear.baseX+envelope*.05
      if(ear.phase>=.38)ear.phase=-1
    }
  }
  tailWait-=dt
  if(tailWait<0){tailWait=randomRange(2,4);tailLevel=randomRange(.1,.45)}
  const wag=petTime>0?.72:tailLevel
  tailPhase+=dt*(6+wag*4)
  rig.tail.rotation.y=Math.sin(tailPhase)*wag
  rig.tail.rotation.z=Math.sin(tailPhase+.6)*wag*.20
  const pant=Math.sin(t*(petTime>0?8.5:7))
  rig.jaw.rotation.x=.10+pant*.014
  rig.tongue.rotation.x=.035+pant*.018
  rig.pendant.rotation.x=Math.sin(t*2.5+.7)*.025
  rig.pendant.rotation.z=-look.yaw*.07+Math.sin(t*2.5)*.009
}
const clock=new THREE.Clock()
let frame=0, measurementStart=0, performanceFrames=0, frameTime=0
renderer.setAnimationLoop(()=>{
  const rawDelta=clock.getDelta()
  const dt=Math.min(rawDelta,.05)
  if(!paused&&!document.hidden)animate(dt)
  controls.update();renderer.render(scene,camera)
  if(!document.hidden && frame>3){
    frameTime+=rawDelta;performanceFrames++
    if(performanceFrames===180){
      if(frameTime>6 && renderer.getPixelRatio()>1){
        renderer.setPixelRatio(Math.max(1,renderer.getPixelRatio()*.8))
        renderer.setSize(innerWidth,innerHeight)
      }
      performanceFrames=0;frameTime=0
    }
  }
  if(++frame===3){canvas.dataset.ready='true';document.getElementById('veil')?.classList.add('hide');measurementStart=performance.now()}
  if(frame===123 && import.meta.env.DEV) console.info('Bear render check '+JSON.stringify({fps:Math.round(120000/(performance.now()-measurementStart)),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls}))
})
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()
  renderer.setSize(innerWidth,innerHeight);fitView(activeView)
})
setTimeout(()=>document.getElementById('hint')?.classList.add('fade'),8000)
