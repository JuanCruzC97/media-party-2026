const numberFormat = new Intl.NumberFormat("es-AR")

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(value, min, max) {
  const t = clamp01((value - min) / (max - min))
  return t * t * (3 - 2 * t)
}

export function initVisuals() {
  const wellsGrid = document.querySelector("[data-wells-grid]")
  const wellsCount = document.querySelector('[data-count="130"]')
  const act2Gauge = document.querySelector("#act-2 .depth")
  const act2Value = document.querySelector("#act-2 [data-depth-value]")
  const discovery = document.querySelector(".discovery")
  const discoveryValue = document.querySelector(".discovery [data-depth-value]")
  const steps = [...document.querySelectorAll("[data-step]")]
  const chart = document.querySelector("[data-chart]")
  const chartTotals = [...document.querySelectorAll(".chart__total")].map((element) => ({
    element,
    value: Number(element.textContent.replace(/\./g, "")),
  }))

  if (wellsGrid && !wellsGrid.children.length) {
    const otherWells = new Set([4, 19, 37, 58, 76, 99, 121])
    for (let i = 0; i < 137; i++) {
      const dot = document.createElement("i")
      dot.style.setProperty("--i", i)
      dot.className = otherWells.has(i) ? "is-other" : "is-comodoro"
      wellsGrid.append(dot)
    }
  }

  if (chart) {
    const summary = document.createElement("p")
    summary.className = "sr-only"
    summary.textContent =
      "Producción del yacimiento: 450.328 metros cúbicos en 1923, de los cuales 343.889 eran de YPF; 1.170.300 metros cúbicos en 1930, de los cuales 721.592 eran de YPF."
    chart.closest(".chart-card")?.append(summary)
  }

  let lastAct = -1

  function update(act, progress) {
    if (act !== lastAct) {
      lastAct = act
    }

    if (act === 2) {
      const meters = Math.round(500 * smoothstep(progress, 0.08, 0.86))
      if (act2Gauge) {
        act2Gauge.style.setProperty("--depth", (meters / 535).toFixed(4))
        act2Gauge.setAttribute("aria-label", `Profundidad del pozo: ${meters} metros`)
      }
      if (act2Value) act2Value.textContent = numberFormat.format(meters)
    }

    if (act === 3) {
      const meters = Math.round(535 * smoothstep(progress, 0.04, 0.82))
      if (discovery) {
        discovery.style.setProperty("--depth", (meters / 535).toFixed(4))
      }
      if (discoveryValue) discoveryValue.textContent = numberFormat.format(meters)

      for (const step of steps) {
        const id = Number(step.dataset.step)
        let visible = false
        if (id === 1) visible = progress < 0.3
        if (id === 2) visible = progress >= 0.3 && progress < 0.57
        if (id === 3) visible = progress >= 0.57
        step.classList.toggle("is-visible", visible)
      }
    }

    if (act === 5) {
      const t = smoothstep(progress, 0.08, 0.72)
      if (wellsGrid) wellsGrid.style.setProperty("--wells", t.toFixed(4))
      if (wellsCount) wellsCount.textContent = numberFormat.format(Math.round(130 * t))
    }

    if (act === 6) {
      const t = smoothstep(progress, 0.08, 0.72)
      if (chart) chart.style.setProperty("--chart", t.toFixed(4))
      for (const total of chartTotals) {
        total.element.textContent = numberFormat.format(Math.round(total.value * t))
      }
    }
  }

  function reduced() {
    if (act2Gauge) act2Gauge.style.setProperty("--depth", (500 / 535).toFixed(4))
    if (act2Value) act2Value.textContent = "500"
    if (discovery) discovery.style.setProperty("--depth", "1")
    if (discoveryValue) discoveryValue.textContent = "535"
    for (const step of steps) step.classList.add("is-visible")
    if (wellsGrid) wellsGrid.style.setProperty("--wells", "1")
    if (wellsCount) wellsCount.textContent = "130"
    if (chart) chart.style.setProperty("--chart", "1")
    for (const total of chartTotals) {
      total.element.textContent = numberFormat.format(total.value)
    }
  }

  return { update, reduced }
}
