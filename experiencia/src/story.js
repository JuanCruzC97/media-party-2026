import { ACTS, ATMOSPHERES } from "./chapters.js"
import { initVisuals } from "./visuals.js"

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(value, min, max) {
  const t = clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function hexToRgb(hex) {
  const value = hex.replace("#", "")
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function lerpColor(a, b, t) {
  const from = hexToRgb(a)
  const to = hexToRgb(b)
  return `rgb(${Math.round(lerp(from[0], to[0], t))}, ${Math.round(
    lerp(from[1], to[1], t)
  )}, ${Math.round(lerp(from[2], to[2], t))})`
}

function lerpPose(a, b, t) {
  return {
    pos: [
      lerp(a.pos[0], b.pos[0], t),
      lerp(a.pos[1], b.pos[1], t),
      lerp(a.pos[2], b.pos[2], t),
    ],
    target: [
      lerp(a.target[0], b.target[0], t),
      lerp(a.target[1], b.target[1], t),
      lerp(a.target[2], b.target[2], t),
    ],
    fov: lerp(a.fov, b.fov, t),
  }
}

function lerpAtmosphere(a, b, t) {
  return {
    skyTop: lerpColor(a.skyTop, b.skyTop, t),
    skyBottom: lerpColor(a.skyBottom, b.skyBottom, t),
    horizon: lerpColor(a.horizon, b.horizon, t),
    fog: lerpColor(a.fog, b.fog, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    sun: lerpColor(a.sun, b.sun, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    hemi: lerp(a.hemi, b.hemi, t),
    exposure: lerp(a.exposure, b.exposure, t),
  }
}

function lerpScene(a, b, t) {
  return {
    tower: lerp(a.tower, b.tower, t),
    field: lerp(a.field, b.field, t),
    camp: lerp(a.camp, b.camp, t),
    lights: lerp(a.lights, b.lights, t),
    drop: lerp(a.drop, b.drop, t),
  }
}

function getPose(act, p, reduced) {
  const current = ACTS[act]
  let pose

  if (current.cameraMid) {
    if (p < 0.55) {
      pose = lerpPose(current.camera, current.cameraMid, smoothstep(p, 0, 0.55))
    } else {
      pose = lerpPose(
        current.cameraMid,
        current.cameraEnd,
        smoothstep(p, 0.55, 1)
      )
    }
  } else {
    pose = lerpPose(current.camera, current.cameraEnd, smoothstep(p, 0, 1))
  }

  if (!reduced) {
    const time = performance.now() / 1000
    pose.pos[0] += Math.sin(time * 0.22) * 0.055
    pose.pos[1] += Math.cos(time * 0.18) * 0.04
  }

  return pose
}

function getAtmosphere(act, p) {
  const current = ATMOSPHERES[act]
  const next = ATMOSPHERES[Math.min(act + 1, ATMOSPHERES.length - 1)]
  return lerpAtmosphere(current, next, smoothstep(p, 0, 1))
}

function getSceneState(act, p) {
  const current = ACTS[act]
  const state = lerpScene(current.scene, current.sceneEnd, smoothstep(p, 0, 1))

  if (act === 3) {
    state.drop = smoothstep(p, 0.62, 0.94)
  }

  return state
}

export function initStory({ stage, site }) {
  const sections = [...document.querySelectorAll(".act")]
  const timelineLinks = [...document.querySelectorAll(".timeline a")]
  const timelineFill = document.getElementById("timeline-fill")
  const progressBar = document.getElementById("progress-bar")
  const header = document.getElementById("site-header")
  const cinemaButton = document.getElementById("cinema-toggle")
  const cinemaLabel = cinemaButton?.querySelector(".btn__label")
  const indexDialog = document.getElementById("index-dialog")
  const indexOpen = document.getElementById("index-open")
  const indexClose = document.getElementById("index-close")
  const resetView = document.getElementById("reset-view")
  const visuals = initVisuals()
  const reduced =
    stage.reducedMotion ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  let active = -1
  let freeMode = false
  let cinemaRunning = false
  let cinemaFrame = 0
  let cinemaLast = 0
  let initialized = false

  if (reduced) {
    document.body.classList.add("reduced-motion")
  }

  function scrollToSection(id) {
    const target = document.getElementById(id)
    if (!target) return
    stopCinema()
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    })
  }

  function openIndex() {
    if (!indexDialog) return
    if (typeof indexDialog.showModal === "function") {
      indexDialog.showModal()
    } else {
      indexDialog.setAttribute("open", "")
    }
  }

  function closeIndex() {
    if (!indexDialog) return
    if (typeof indexDialog.close === "function") {
      indexDialog.close()
    } else {
      indexDialog.removeAttribute("open")
    }
  }

  function setActive(next) {
    if (next === active) return
    active = next

    sections.forEach((section, index) => {
      section.classList.toggle("is-active", index === active)
    })

    timelineLinks.forEach((link) => {
      const target = link.dataset.target
      const isActive = target === sections[active]?.id
      link.classList.toggle("is-active", isActive)
      if (isActive) link.setAttribute("aria-current", "step")
      else link.removeAttribute("aria-current")
    })

    const shouldBeFree = active === 8 && !reduced
    if (shouldBeFree !== freeMode) {
      freeMode = shouldBeFree
      stage.setFreeMode(freeMode)
    }
  }

  /* ------------------------------------------------------------------------
     cinema mode
     ------------------------------------------------------------------------ */

  function setCinemaUi(running) {
    cinemaRunning = running
    document.body.classList.toggle("is-cinema", running)
    cinemaButton?.setAttribute("aria-pressed", String(running))
    if (cinemaLabel) cinemaLabel.textContent = running ? "Pausar" : "Modo cine"
  }

  function stopCinema() {
    if (!cinemaRunning) return
    cancelAnimationFrame(cinemaFrame)
    setCinemaUi(false)
  }

  function cinemaStep(now) {
    if (!cinemaRunning) return
    const dt = Math.min((now - cinemaLast) / 1000, 0.05)
    cinemaLast = now
    const max =
      document.documentElement.scrollHeight - window.innerHeight

    if (window.scrollY >= max - 2) {
      stopCinema()
      return
    }

    window.scrollBy(0, 70 * dt)
    cinemaFrame = requestAnimationFrame(cinemaStep)
  }

  function startCinema() {
    if (reduced || cinemaRunning) return
    const max =
      document.documentElement.scrollHeight - window.innerHeight
    if (window.scrollY >= max - 4) {
      window.scrollTo({ top: 0, behavior: "auto" })
    }
    setCinemaUi(true)
    cinemaLast = performance.now()
    cinemaFrame = requestAnimationFrame(cinemaStep)
  }

  function toggleCinema() {
    if (cinemaRunning) stopCinema()
    else startCinema()
  }

  cinemaButton?.addEventListener("click", toggleCinema)

  for (const type of ["wheel", "touchstart"]) {
    window.addEventListener(
      type,
      () => {
        if (cinemaRunning) stopCinema()
      },
      { passive: true }
    )
  }

  window.addEventListener("keydown", (event) => {
    if (!cinemaRunning) return
    if (
      event.key === "Escape" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "PageDown" ||
      event.key === "PageUp" ||
      event.key === " "
    ) {
      stopCinema()
    }
  })

  /* ------------------------------------------------------------------------
     navigation
     ------------------------------------------------------------------------ */

  timelineLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault()
      scrollToSection(link.dataset.target)
    })
  })

  indexOpen?.addEventListener("click", openIndex)
  indexClose?.addEventListener("click", closeIndex)

  indexDialog?.addEventListener("click", (event) => {
    if (event.target === indexDialog) closeIndex()
  })

  indexDialog?.querySelectorAll("[data-index-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault()
      const id = link.getAttribute("href")?.replace("#", "")
      closeIndex()
      if (id) scrollToSection(id)
    })
  })

  resetView?.addEventListener("click", () => {
    scrollToSection("act-0")
  })

  /* ------------------------------------------------------------------------
     scroll loop
     ------------------------------------------------------------------------ */

  function update() {
    const vh = window.innerHeight
    const isMobile = window.innerWidth <= 900
    const maxScroll =
      document.documentElement.scrollHeight - vh
    const global = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0
    const progress = Math.round(global * 1000) / 10

    if (progressBar) progressBar.style.width = `${progress}%`
    if (timelineFill) timelineFill.style.height = `${progress}%`
    header?.classList.toggle("is-scrolled", window.scrollY > 24)

    let nextActive = 0
    const progresses = []

    for (let index = 0; index < sections.length; index++) {
      const section = sections[index]
      const rect = section.getBoundingClientRect()
      const act = Number(section.dataset.act)
      let local

      if (isMobile || reduced) {
        local = clamp((vh - rect.top) / Math.max(rect.height + vh, 1), 0, 1)
      } else if (act === 0) {
        local = clamp(-rect.top / Math.max(vh, 1), 0, 1)
      } else {
        const total = Math.max(rect.height - vh, 1)
        local = clamp(-rect.top / total, 0, 1)
      }

      progresses.push(local)

      if (rect.top <= vh * 0.45) nextActive = index

      const copyExit =
        act === 0 || act === 8 ? 1 : 1 - smoothstep(local, 0.9, 0.99)
      const copyEnter = 1 - smoothstep(local, 0, 0.1)
      const photoReveal = smoothstep(local, 0, 0.12)

      section.style.setProperty("--p", local.toFixed(4))
      section.style.setProperty("--copy-opacity", copyExit.toFixed(3))
      section.style.setProperty("--copy-y", `${(copyEnter * 18).toFixed(1)}px`)
      section.style.setProperty("--photo-reveal", photoReveal.toFixed(3))
      section.style.setProperty("--photo-opacity", (0.55 + photoReveal * 0.45).toFixed(3))
      section.style.setProperty("--photo-scale", (1.04 - local * 0.04).toFixed(4))
      section.style.setProperty("--photo-y", `${((local - 0.5) * -14).toFixed(1)}px`)
    }

    setActive(nextActive)

    if (!initialized) {
      initialized = true
      if (reduced) {
        stage.setPose(ACTS[0].camera)
        stage.setAtmosphere(ATMOSPHERES[0])
        site.setState({ tower: 1, field: 1, camp: 1, lights: 1, drop: 0 })
        visuals.reduced()
      }
    }

    if (reduced) return

    const activeProgress = progresses[nextActive] ?? 0

    if (!freeMode) {
      stage.setPose(getPose(nextActive, activeProgress, false))
    }

    stage.setAtmosphere(getAtmosphere(nextActive, activeProgress))
    site.setState(getSceneState(nextActive, activeProgress))
    visuals.update(nextActive, activeProgress)
  }

  update()

  return { update, stopCinema }
}
