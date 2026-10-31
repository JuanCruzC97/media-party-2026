import * as THREE from 'three'
import { OrbitControls } from '../vendor/OrbitControls.js'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const MOBILE = window.matchMedia('(max-width: 900px)').matches

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = !MOBILE
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.localClippingEnabled = true
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#3e3226', 50, 180)

  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  )
  camera.position.set(7, 3.2, 31)
  camera.lookAt(0, 7.5, 0)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 7.4, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enablePan = false
  controls.rotateSpeed = 0.55
  controls.zoomSpeed = 0.8
  controls.minDistance = 9
  controls.maxDistance = 52
  controls.minPolarAngle = 0.25
  controls.maxPolarAngle = Math.PI / 2 - 0.03
  controls.enabled = false
  controls.update()

  /* ---------- lighting ---------- */

  const hemi = new THREE.HemisphereLight('#eaf2f7', '#6d6047', 0.8)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#ffb15a', 1.8)
  sun.position.set(-18, 28, 16)
  sun.castShadow = !MOBILE
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -30
  sun.shadow.camera.right = 30
  sun.shadow.camera.top = 30
  sun.shadow.camera.bottom = -18
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 100
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.025
  sun.shadow.camera.updateProjectionMatrix()
  sun.target.position.set(0, 4, 0)
  scene.add(sun)
  scene.add(sun.target)

  const ambient = new THREE.AmbientLight('#c3cdd1', 0.12)
  scene.add(ambient)

  const fill = new THREE.DirectionalLight('#8fb6b0', 0.28)
  fill.position.set(18, 10, -20)
  scene.add(fill)

  /* ---------- vertical reveal for the tower ---------- */

  const towerClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 16.5)

  /* ---------- atmosphere ---------- */

  const cssCache = {}
  function setCss(name, value) {
    if (cssCache[name] === value) return
    cssCache[name] = value
    document.documentElement.style.setProperty(name, value)
  }

  function setAtmosphere(atm) {
    if (!atm) return
    setCss('--sky-top', atm.skyTop)
    setCss('--sky-bottom', atm.skyBottom)
    setCss('--horizon', atm.horizon)
    setCss('--scene-fog', atm.fog)
    scene.fog.color.set(atm.fog)
    scene.fog.near = atm.fogNear
    scene.fog.far = atm.fogFar
    sun.color.set(atm.sun)
    sun.intensity = atm.sunIntensity
    hemi.intensity = atm.hemi
    renderer.toneMappingExposure = atm.exposure
  }

  /* ---------- camera ---------- */

  function setPose(pose) {
    if (!pose) return
    const [x, y, z] = pose.pos
    camera.position.set(x, y, z)
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2])
    if (Math.abs(camera.fov - pose.fov) > 0.01) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
  }

  function setFreeMode(enabled) {
    controls.enabled = enabled
    document.body.classList.toggle('is-free', enabled)
    if (enabled) {
      controls.target.set(0, 7.4, 0)
      controls.update()
    }
  }

  /* ---------- loop ---------- */

  function update(dt) {
    if (controls.enabled) controls.update()
    void dt
  }

  function resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  window.addEventListener('resize', resize, { passive: true })

  return {
    scene,
    camera,
    renderer,
    controls,
    towerClip,
    setPose,
    setAtmosphere,
    setFreeMode,
    update,
    resize,
    reducedMotion: REDUCED,
    isMobile: MOBILE,
  }
}
