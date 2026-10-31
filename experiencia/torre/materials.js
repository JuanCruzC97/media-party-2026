import * as THREE from 'three'
import { mulberry32 } from './kit.js'

/* --------------------------------------------------------------------------
   Procedural canvas textures — no image files needed.
   -------------------------------------------------------------------------- */

function canvasTexture(width, height, draw, { repeat = [1, 1] } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Weathered timber. `along` = 'v' draws the grain along the texture's V axis
 * (for beams that grow along local Y), 'u' along U (for planks long in X).
 */
function woodTexture({ seed, along, base, dark, light }) {
  const random = mulberry32(seed)
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    if (along === 'v') {
      ctx.translate(w, 0)
      ctx.rotate(Math.PI / 2)
    }

    /* soft tonal bands */
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.05 + random() * 0.08
      ctx.fillStyle = random() > 0.5 ? dark : light
      ctx.fillRect(0, random() * h, w, 6 + random() * 30)
    }

    /* grain lines */
    for (let i = 0; i < 150; i++) {
      const y = random() * h
      const amp = 0.4 + random() * 2.2
      const freq = 0.6 + random() * 1.6
      const phase = random() * Math.PI * 2
      ctx.globalAlpha = 0.05 + random() * 0.14
      ctx.strokeStyle = random() > 0.2 ? dark : light
      ctx.lineWidth = 0.5 + random() * 1.4
      ctx.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin((x / w) * Math.PI * 2 * freq + phase) * amp
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }

    /* checks / cracks */
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.25 + random() * 0.25
      ctx.fillStyle = '#1b140e'
      ctx.fillRect(random() * w, random() * h, 10 + random() * 50, 0.8 + random())
    }

    /* knots */
    for (let i = 0; i < 3; i++) {
      const x = random() * w
      const y = random() * h
      const r = 2 + random() * 5
      for (let k = 0; k < 4; k++) {
        ctx.globalAlpha = 0.3 - k * 0.05
        ctx.strokeStyle = dark
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(x, y, r + k * 2.4, r * 0.55 + k * 1.2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    /* silver weathering speckle */
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let i = 0; i < 2600; i++) {
      ctx.globalAlpha = 0.04 + random() * 0.06
      ctx.fillStyle = random() > 0.55 ? '#b9b2a6' : '#16110c'
      ctx.fillRect(random() * w, random() * h, 1, 1)
    }
    ctx.globalAlpha = 1
  })
}

function pavingTexture() {
  const random = mulberry32(7)
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#c8c3b6'
      ctx.fillRect(0, 0, w, h)
      const tile = w / 4
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          ctx.fillStyle = `hsl(42, ${6 + random() * 5}%, ${74 + random() * 6}%)`
          ctx.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4)
        }
      }
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = `rgba(${random() > 0.5 ? '0,0,0' : '255,255,255'},${0.03 + random() * 0.05})`
        ctx.fillRect(random() * w, random() * h, 1.5, 1.5)
      }
    },
    { repeat: [6, 5] }
  )
}

function asphaltTexture() {
  const random = mulberry32(19)
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#b4b1aa'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 7000; i++) {
        ctx.fillStyle = `rgba(${random() > 0.5 ? '40,38,34' : '235,232,226'},${0.06 + random() * 0.1})`
        ctx.fillRect(random() * w, random() * h, 1, 1)
      }
    },
    { repeat: [30, 6] }
  )
}

function stoneTexture() {
  const random = mulberry32(5)
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dcd6c9'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(${random() > 0.5 ? '90,80,64' : '255,255,250'},${0.04 + random() * 0.08})`
      const s = random() > 0.95 ? 2.5 : 1.2
      ctx.fillRect(random() * w, random() * h, s, s)
    }
  })
}

/* --------------------------------------------------------------------------
   Materials
   -------------------------------------------------------------------------- */

export function createMaterials() {
  const beamMap = woodTexture({ seed: 3, along: 'v', base: '#5b4a3a', dark: '#2a1f16', light: '#8a7a68' })
  const plankMap = woodTexture({ seed: 17, along: 'u', base: '#5d4c3c', dark: '#281d14', light: '#8d7d6a' })

  const wood = (map, tint) =>
    new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.92, metalness: 0 })

  return {
    /* a few tints of the same timber, picked at random per piece */
    beams: [wood(beamMap, '#ffffff'), wood(beamMap, '#e6ded3'), wood(beamMap, '#cfc5b9'), wood(beamMap, '#f2e6d8')],
    planks: [wood(plankMap, '#ffffff'), wood(plankMap, '#e3dbd0'), wood(plankMap, '#cdc3b6')],
    iron: new THREE.MeshStandardMaterial({ color: '#3b3833', roughness: 0.5, metalness: 0.65 }),
    rope: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.7, metalness: 0.3 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a7a196', roughness: 0.97 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.45, metalness: 0.7 }),
    paving: new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.96 }),
    paint: new THREE.MeshStandardMaterial({ color: '#efeee8', roughness: 0.8 }),
    curb: new THREE.MeshStandardMaterial({ color: '#d2cec4', roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: '#76843f', roughness: 1 }),
    meadow: new THREE.MeshStandardMaterial({ color: '#8b8b5c', roughness: 1 }),
    hills: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    house: new THREE.MeshStandardMaterial({ color: '#ddd6c6', roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: '#8b6d55', roughness: 0.9 }),
    bark: new THREE.MeshStandardMaterial({ color: '#5c5247', roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#6c7347', roughness: 1, flatShading: true }),
  }
}

/** Deterministic picker over a material list. */
export function picker(list, random) {
  return () => list[Math.floor(random() * list.length)]
}
