import { createStage } from './scene.js'
import { buildSite } from './structure.js'

const canvas = document.querySelector('#scene')

let stage
try {
  stage = createStage(canvas)
} catch (error) {
  console.error('[castillete] No se pudo iniciar WebGL:', error)
}

if (stage) {
  const site = buildSite(stage)

  let last = performance.now()
  let ready = false

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    site.update(now / 1000, dt)
    stage.update(dt)
    stage.renderer.render(stage.scene, stage.camera)

    if (!ready) {
      ready = true
      document.body.classList.add('is-ready')
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
