import * as THREE from 'three'
import { OrbitControls } from '../vendor/OrbitControls.js'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.04
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#e4e2d7', 65, 220)

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  )
  camera.position.set(2.4, 9.6, 28)

  /* ---------- orbit ---------- */

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 7.6, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.rotateSpeed = 0.65
  controls.zoomSpeed = 0.9
  controls.minDistance = 8
  controls.maxDistance = 55
  controls.minPolarAngle = 0.3
  controls.maxPolarAngle = Math.PI / 2 - 0.04
  controls.update()

  /* ---------- lighting ---------- */

  const hemi = new THREE.HemisphereLight('#eaf2f7', '#6d6047', 1.05)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#fff1d7', 2.75)
  sun.position.set(-18, 28, 16)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -24
  sun.shadow.camera.right = 24
  sun.shadow.camera.top = 26
  sun.shadow.camera.bottom = -16
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 90
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.025
  sun.shadow.camera.updateProjectionMatrix()
  sun.target.position.set(0, 4, 0)
  scene.add(sun)
  scene.add(sun.target)

  const ambient = new THREE.AmbientLight('#c3cdd1', 0.15)
  scene.add(ambient)

  /* ---------- loop ---------- */

  function update() {
    controls.update()
  }

  function resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
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
    update,
    resize,
    reducedMotion: REDUCED,
  }
}
