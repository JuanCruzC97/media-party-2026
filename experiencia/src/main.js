import { createStage } from "./scene.js"
import { buildSite } from "./structure.js"
import { initStory } from "./story.js"

const canvas = document.querySelector("#scene")

let stage
try {
  stage = createStage(canvas)
} catch (error) {
  console.error("[comodoro] No se pudo iniciar WebGL:", error)
}

if (stage) {
  const site = buildSite(stage)
  const story = initStory({ stage, site })

  let last = performance.now()
  let ready = false

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    story.update()
    site.update(now / 1000, dt)
    stage.update(dt)
    stage.renderer.render(stage.scene, stage.camera)

    if (!ready) {
      ready = true
      document.body.classList.add("is-ready")
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
} else {
  document.body.classList.add("no-webgl")
  const error = document.getElementById("scene-error")
  if (error) error.hidden = false
}
