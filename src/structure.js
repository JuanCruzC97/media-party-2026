import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

/* --------------------------------------------------------------------------
   procedural textures
   -------------------------------------------------------------------------- */

function mulberry32(seed) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeTexture(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function makeWoodTexture({ base, grain, seed, planks = 0 }) {
  const random = mulberry32(seed)
  return makeTexture(512, (ctx, size) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, size, size)

    for (let i = 0; i < 230; i++) {
      const y = random() * size
      const amp = 0.6 + random() * 2.4
      const phase = random() * Math.PI * 2
      ctx.beginPath()
      ctx.strokeStyle = grain
      ctx.globalAlpha = 0.025 + random() * 0.075
      ctx.lineWidth = 0.5 + random() * 1.7
      for (let x = 0; x <= size; x += 14) {
        const yy = y + Math.sin((x / size) * Math.PI * 2 * 1.2 + phase) * amp
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }

    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.05 + random() * 0.07
      ctx.fillStyle = '#f0dfc2'
      ctx.fillRect(random() * size, random() * size, 2 + random() * 26, 1 + random() * 1.5)
    }

    for (let i = 0; i < 4; i++) {
      const x = random() * size
      const y = random() * size
      const rx = 3 + random() * 8
      const ry = 2 + random() * 4
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = grain
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.ellipse(x, y, rx + k * 2, ry + k * 1.4, 0.2, 0, Math.PI * 2)
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    if (planks > 0) {
      const row = size / planks
      for (let i = 0; i <= planks; i++) {
        const y = i * row
        ctx.globalAlpha = 0.34
        ctx.fillStyle = '#231a12'
        ctx.fillRect(0, y - 1, size, 2.5)
        ctx.globalAlpha = 0.12
        ctx.fillStyle = '#f6e6cb'
        ctx.fillRect(0, y + 1.5, size, 2)
      }
    }
    ctx.globalAlpha = 1
  })
}

function makeDirtTexture() {
  const random = mulberry32(63)
  return makeTexture(512, (ctx, size) => {
    ctx.fillStyle = '#938a75'
    ctx.fillRect(0, 0, size, size)

    for (let i = 0; i < 70; i++) {
      const x = random() * size
      const y = random() * size
      const radius = 18 + random() * 74
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
      const tone = random() > 0.5 ? '116,114,82' : '173,162,139'
      gradient.addColorStop(0, `rgba(${tone},${0.05 + random() * 0.09})`)
      gradient.addColorStop(1, `rgba(${tone},0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }

    for (let i = 0; i < 11000; i++) {
      const tone = random() > 0.5 ? '40,35,25' : '230,220,198'
      ctx.fillStyle = `rgba(${tone},${0.02 + random() * 0.055})`
      ctx.fillRect(random() * size, random() * size, 1 + (random() > 0.95 ? 1 : 0), 1)
    }
  })
}

function makeConcreteTexture() {
  const random = mulberry32(91)
  return makeTexture(512, (ctx, size) => {
    ctx.fillStyle = '#b5aea1'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) {
      const tone = random() > 0.5 ? '0,0,0' : '255,255,255'
      ctx.fillStyle = `rgba(${tone},${0.015 + random() * 0.05})`
      const s = random() > 0.94 ? 2 : 1
      ctx.fillRect(random() * size, random() * size, s, s)
    }
    ctx.strokeStyle = 'rgba(55,50,40,0.22)'
    ctx.lineWidth = 2
    for (const v of [0, size / 2]) {
      ctx.beginPath()
      ctx.moveTo(0, v)
      ctx.lineTo(size, v)
      ctx.moveTo(v, 0)
      ctx.lineTo(v, size)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 3)
    ctx.lineTo(size, 3)
    ctx.stroke()
  })
}

/* --------------------------------------------------------------------------
   materials
   -------------------------------------------------------------------------- */

function createMaterials() {
  const woodMap = makeWoodTexture({ base: '#6d5338', grain: '#332416', seed: 11 })
  const darkMap = makeWoodTexture({ base: '#513b27', grain: '#20150d', seed: 29, planks: 4 })
  const paleMap = makeWoodTexture({ base: '#856a49', grain: '#3f2e1e', seed: 47, planks: 5 })
  const concreteMap = makeConcreteTexture()
  concreteMap.repeat.set(7, 4)
  const dirtMap = makeDirtTexture()
  dirtMap.repeat.set(30, 30)

  return {
    wood: new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.93, metalness: 0 }),
    woodDark: new THREE.MeshStandardMaterial({ map: darkMap, roughness: 0.95, metalness: 0 }),
    woodPale: new THREE.MeshStandardMaterial({ map: paleMap, roughness: 0.9, metalness: 0 }),
    iron: new THREE.MeshStandardMaterial({ color: '#34332d', roughness: 0.58, metalness: 0.55 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteMap, roughness: 0.97, metalness: 0 }),
    dirt: new THREE.MeshStandardMaterial({ map: dirtMap, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: '#73764d', roughness: 1 }),
    house: new THREE.MeshStandardMaterial({ color: '#cec4ae', roughness: 0.95 }),
    roof: new THREE.MeshStandardMaterial({ color: '#6d5e4c', roughness: 0.95 }),
    tree: new THREE.MeshStandardMaterial({ color: '#5c6547', roughness: 1 }),
    hill: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  }
}

/* --------------------------------------------------------------------------
   small builders
   -------------------------------------------------------------------------- */

function beam(a, b, thickness, material) {
  const direction = new THREE.Vector3().subVectors(b, a)
  const length = direction.length()
  const mesh = new THREE.Mesh(UNIT_BOX, material)
  mesh.scale.set(thickness, length, thickness)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function slatWall(width, height, material, thickness = 0.07) {
  const group = new THREE.Group()
  const step = 0.225
  const slat = 0.155
  for (let y = 0.15; y < height - 0.04; y += step) {
    const slatMesh = new THREE.Mesh(UNIT_BOX, material)
    slatMesh.scale.set(width, slat, thickness)
    slatMesh.position.y = y
    slatMesh.castShadow = true
    slatMesh.receiveShadow = true
    group.add(slatMesh)
  }
  return group
}

function buildLadder(start, end, width, materials) {
  const group = new THREE.Group()
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(UNIT_BOX, materials.woodDark)
    rail.scale.set(0.07, length, 0.09)
    rail.position.set((side * width) / 2, length / 2, 0)
    rail.castShadow = true
    group.add(rail)
  }

  const rungCount = Math.max(4, Math.floor(length / 0.32))
  for (let i = 0; i < rungCount; i++) {
    const rung = new THREE.Mesh(UNIT_BOX, materials.wood)
    rung.scale.set(width, 0.055, 0.055)
    rung.position.y = ((i + 0.5) / rungCount) * length
    rung.castShadow = true
    group.add(rung)
  }

  group.position.copy(start)
  group.quaternion.setFromUnitVectors(UP, direction.normalize())
  return group
}

/* --------------------------------------------------------------------------
   headframe
   -------------------------------------------------------------------------- */

function buildTower(materials) {
  const group = new THREE.Group()
  group.name = 'castillete'

  const HEIGHT = 13.4
  const BASE = { x: 3.15, z: 2.75 }
  const TOP = { x: 1.6, z: 1.4 }
  const levels = [0.14, 3.05, 6.05, 9.05, 11.75, 12.55]

  const corner = (index, y) => {
    const t = THREE.MathUtils.clamp(y / HEIGHT, 0, 1)
    const hx = THREE.MathUtils.lerp(BASE.x, TOP.x, t)
    const hz = THREE.MathUtils.lerp(BASE.z, TOP.z, t)
    return new THREE.Vector3(
      (index === 0 || index === 3 ? -1 : 1) * hx,
      y,
      (index < 2 ? -1 : 1) * hz
    )
  }

  /* legs */
  for (let i = 0; i < 4; i++) {
    group.add(beam(corner(i, 0.05), corner(i, 12.65), 0.34, materials.wood))
  }

  /* rings and X bracing */
  for (let level = 0; level < levels.length; level++) {
    const y = levels[level]
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      group.add(beam(corner(i, y), corner(j, y), level === 0 ? 0.3 : 0.22, materials.woodDark))
    }

    if (level > 0) {
      const below = levels[level - 1]
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        group.add(beam(corner(i, below), corner(j, y), 0.155, materials.wood))
        group.add(beam(corner(j, below), corner(i, y), 0.155, materials.wood))
      }
    }
  }

  /* open walkways at the two middle levels */
  for (const y of [6.05, 9.05]) {
    const t = y / HEIGHT
    const hx = THREE.MathUtils.lerp(BASE.x, TOP.x, t)
    const hz = THREE.MathUtils.lerp(BASE.z, TOP.z, t)
    const walk = 0.6
    const front = new THREE.Mesh(UNIT_BOX, materials.woodDark)
    front.scale.set(hx * 2, 0.12, walk)
    front.position.set(0, y + 0.09, hz - walk / 2)
    const back = front.clone()
    back.position.z = -(hz - walk / 2)
    const left = new THREE.Mesh(UNIT_BOX, materials.woodDark)
    left.scale.set(walk, 0.12, hz * 2 - walk * 2)
    left.position.set(-(hx - walk / 2), y + 0.09, 0)
    const right = left.clone()
    right.position.x = hx - walk / 2
    for (const mesh of [front, back, left, right]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }

  /* top deck */
  const deck = new THREE.Mesh(UNIT_BOX, materials.woodDark)
  deck.scale.set(4.15, 0.24, 3.4)
  deck.position.y = 12.55
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  /* concrete footings */
  for (let i = 0; i < 4; i++) {
    const foot = corner(i, 0)
    const block = new THREE.Mesh(UNIT_BOX, materials.concrete)
    block.scale.set(0.95, 0.5, 0.95)
    block.position.set(foot.x, 0.23, foot.z)
    block.castShadow = true
    block.receiveShadow = true
    group.add(block)
  }

  /* ---------------- cabin ---------------- */

  const cabin = new THREE.Group()
  cabin.position.y = 12.67
  group.add(cabin)

  const CW = 3.75
  const CD = 3.05
  const CH = 1.95

  for (const x of [-CW / 2, CW / 2]) {
    for (const z of [-CD / 2, CD / 2]) {
      const post = new THREE.Mesh(UNIT_BOX, materials.woodDark)
      post.scale.set(0.16, CH, 0.16)
      post.position.set(x, CH / 2, z)
      post.castShadow = true
      cabin.add(post)
    }
  }

  const backWall = slatWall(CW - 0.12, CH, materials.woodPale)
  backWall.position.set(0, 0, -CD / 2)
  cabin.add(backWall)

  for (const side of [-1, 1]) {
    const sideWall = slatWall(CD - 0.12, CH, materials.woodPale)
    sideWall.position.set((side * CW) / 2, 0, 0)
    sideWall.rotation.y = Math.PI / 2
    cabin.add(sideWall)
  }

  const parapet = slatWall(CW - 0.1, 0.78, materials.woodPale)
  parapet.position.set(0, 0, CD / 2)
  cabin.add(parapet)

  cabin.add(
    beam(
      new THREE.Vector3(-CW / 2, 0.92, CD / 2),
      new THREE.Vector3(CW / 2, 1.72, CD / 2),
      0.09,
      materials.woodDark
    )
  )
  cabin.add(
    beam(
      new THREE.Vector3(CW / 2, 0.92, CD / 2),
      new THREE.Vector3(-CW / 2, 1.72, CD / 2),
      0.09,
      materials.woodDark
    )
  )

  /* gabled roof */
  const rise = 0.8
  const angle = Math.atan2(rise, CD / 2)
  const slabDepth = Math.hypot(CD / 2, rise) + 0.22
  const eaveY = CH + 0.12
  const ridgeY = CH + rise + 0.12
  const roofCenterY = (eaveY + ridgeY) / 2

  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(UNIT_BOX, materials.woodPale)
    slab.scale.set(CW + 0.95, 0.12, slabDepth)
    slab.position.set(0, roofCenterY, side * (CD / 4 + 0.09))
    slab.rotation.x = side * angle
    slab.castShadow = true
    slab.receiveShadow = true
    cabin.add(slab)

    const fascia = new THREE.Mesh(UNIT_BOX, materials.woodDark)
    fascia.scale.set(CW + 0.95, 0.16, 0.1)
    fascia.position.set(0, CH + 0.04, side * (CD / 2 + 0.18))
    fascia.castShadow = true
    cabin.add(fascia)
  }

  const ridge = new THREE.Mesh(UNIT_BOX, materials.woodDark)
  ridge.scale.set(CW + 1.05, 0.16, 0.16)
  ridge.position.set(0, ridgeY - 0.02, 0)
  ridge.castShadow = true
  cabin.add(ridge)

  /* gable end panels */
  const gableShape = new THREE.Shape()
  gableShape.moveTo(-CD / 2, eaveY)
  gableShape.lineTo(CD / 2, eaveY)
  gableShape.lineTo(0, ridgeY)
  gableShape.closePath()

  const gableGeometry = new THREE.ShapeGeometry(gableShape)
  const gableMaterial = materials.woodPale.clone()
  gableMaterial.side = THREE.DoubleSide

  for (const side of [-1, 1]) {
    const gable = new THREE.Mesh(gableGeometry, gableMaterial)
    gable.rotation.y = (side * Math.PI) / 2
    gable.position.x = side * (CW / 2 - 0.02)
    gable.castShadow = true
    gable.receiveShadow = true
    cabin.add(gable)
  }

  /* axle and sheave */
  cabin.add(
    beam(
      new THREE.Vector3(-CW / 2, 1.46, 0),
      new THREE.Vector3(CW / 2, 1.46, 0),
      0.15,
      materials.woodDark
    )
  )

  const sheave = new THREE.Group()
  sheave.position.set(0, 1.46, 0)
  cabin.add(sheave)

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.63, 0.075, 8, 40),
    materials.woodDark
  )
  wheel.castShadow = true
  sheave.add(wheel)

  const spokeCount = 12
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2
    sheave.add(
      beam(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0),
        0.038,
        materials.wood
      )
    )
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 12), materials.iron)
  hub.rotation.x = Math.PI / 2
  hub.castShadow = true
  sheave.add(hub)

  /* cable down the centre */
  const cableTop = 12.67 + 1.46 - 0.63
  const cableBottom = 1.3
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, cableTop - cableBottom, 6),
    materials.iron
  )
  cable.position.set(0, (cableTop + cableBottom) / 2, 0)
  group.add(cable)

  const hook = new THREE.Mesh(UNIT_BOX, materials.iron)
  hook.scale.set(0.26, 0.34, 0.22)
  hook.position.set(0, cableBottom - 0.12, 0)
  hook.castShadow = true
  group.add(hook)

  /* ladders */
  group.add(
    buildLadder(
      new THREE.Vector3(1.2, 0.3, 2.5),
      new THREE.Vector3(1.2, 6.1, 1.95),
      0.55,
      materials
    )
  )
  group.add(
    buildLadder(
      new THREE.Vector3(-1.15, 6.2, 1.85),
      new THREE.Vector3(-1.15, 12.5, 1.4),
      0.55,
      materials
    )
  )

  group.userData.sheave = sheave
  return group
}

/* --------------------------------------------------------------------------
   ground
   -------------------------------------------------------------------------- */

function buildGround(materials) {
  const group = new THREE.Group()

  const earth = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), materials.dirt)
  earth.rotation.x = -Math.PI / 2
  earth.position.y = -0.05
  earth.receiveShadow = true
  group.add(earth)

  const pad = new THREE.Mesh(UNIT_BOX, materials.concrete)
  pad.scale.set(8.4, 0.12, 7.4)
  pad.position.set(0, 0.055, 0.15)
  pad.receiveShadow = true
  group.add(pad)

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 2.4), materials.grass)
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, 0.012, 5.2)
  grass.receiveShadow = true
  group.add(grass)

  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(64, 17), materials.concrete)
  plaza.rotation.x = -Math.PI / 2
  plaza.position.set(0, 0.008, 15.2)
  plaza.receiveShadow = true
  group.add(plaza)

  return group
}

/* --------------------------------------------------------------------------
   surrounding hills, houses and trees
   -------------------------------------------------------------------------- */

function hillHeight(angle, radius, inner, outer) {
  const wave =
    Math.sin(angle * 3.1 + 1.7) * 0.52 +
    Math.sin(angle * 7.3 + 0.4) * 0.3 +
    Math.sin(angle * 13.7 + 2.1) * 0.16
  const profile = 1.8 + 5.4 * Math.max(0, wave)
  const ramp = THREE.MathUtils.smoothstep(radius, inner, inner + 70)
  return ramp * profile
}

function buildHills(random, materials) {
  const group = new THREE.Group()
  const theta = 120
  const radial = 6
  const inner = 52
  const outer = 215

  const positions = []
  const indices = []

  for (let ri = 0; ri <= radial; ri++) {
    const radius = inner + (outer - inner) * Math.pow(ri / radial, 1.45)
    for (let ti = 0; ti < theta; ti++) {
      const angle = (ti / theta) * Math.PI * 2
      const jitter = ri === 0 ? 0 : (random() - 0.5) * 1.6
      const h = hillHeight(angle, radius, inner, outer) + jitter
      positions.push(Math.cos(angle) * radius, h - 0.15, Math.sin(angle) * radius)
    }
  }

  for (let ri = 0; ri < radial; ri++) {
    for (let ti = 0; ti < theta; ti++) {
      const a = ri * theta + ti
      const b = ri * theta + ((ti + 1) % theta)
      const c = (ri + 1) * theta + ti
      const d = (ri + 1) * theta + ((ti + 1) % theta)
      indices.push(a, b, c, b, d, c)
    }
  }

  let geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry = geometry.toNonIndexed()
  geometry.computeVertexNormals()

  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const palette = ['#999274', '#a59c7d', '#b2a687', '#8b906d', '#bcae8b']
  const color = new THREE.Color()

  for (let i = 0; i < pos.count; i += 3) {
    const avgY = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const idx = avgY > 9 ? 4 : avgY > 6 ? 2 : avgY > 3 ? 1 : Math.floor(random() * 2)
    color.set(palette[Math.min(palette.length - 1, idx)])
    color.offsetHSL(0, 0, (random() - 0.5) * 0.035)
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const hills = new THREE.Mesh(geometry, materials.hill)
  group.add(hills)

  /* distant houses */
  const houseGeo = new THREE.BoxGeometry(1, 1, 1)
  const roofGeo = new THREE.ConeGeometry(0.78, 0.55, 4)
  const houses = new THREE.InstancedMesh(houseGeo, materials.house, 34)
  const roofs = new THREE.InstancedMesh(roofGeo, materials.roof, 34)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < 34; i++) {
    const angle = random() * Math.PI * 2
    const radius = 58 + random() * 95
    const w = 0.9 + random() * 1.1
    const h = 0.9 + random() * 1.2
    const d = 0.9 + random() * 1.1
    const y = hillHeight(angle, radius, inner, outer) - 0.25
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius

    dummy.position.set(x, y + h / 2, z)
    dummy.rotation.set(0, random() * Math.PI, 0)
    dummy.scale.set(w, h, d)
    dummy.updateMatrix()
    houses.setMatrixAt(i, dummy.matrix)

    dummy.position.set(x, y + h + 0.2, z)
    dummy.rotation.set(0, Math.PI / 4, 0)
    dummy.scale.set(w * 1.25, 0.55, d * 1.25)
    dummy.updateMatrix()
    roofs.setMatrixAt(i, dummy.matrix)
  }

  group.add(houses, roofs)

  /* trees */
  const treeGeo = new THREE.ConeGeometry(0.5, 1.8, 6)
  const trees = new THREE.InstancedMesh(treeGeo, materials.tree, 90)

  for (let i = 0; i < 90; i++) {
    const angle = random() * Math.PI * 2
    const radius = 50 + random() * 120
    const height = 1.1 + random() * 1.8
    const y = hillHeight(angle, radius, inner, outer) - 0.1
    dummy.position.set(Math.cos(angle) * radius, y + height / 2, Math.sin(angle) * radius)
    dummy.rotation.set(0, random() * Math.PI, 0)
    dummy.scale.set(0.7 + random() * 0.6, height, 0.7 + random() * 0.6)
    dummy.updateMatrix()
    trees.setMatrixAt(i, dummy.matrix)
  }

  group.add(trees)

  return group
}

/* --------------------------------------------------------------------------
   fence + marker
   -------------------------------------------------------------------------- */

function buildFence(materials) {
  const group = new THREE.Group()
  group.name = 'valla'

  const segments = [
    [-11.5, -2.9],
    [2.9, 11.5],
  ]

  for (const [from, to] of segments) {
    const length = to - from
    const count = Math.max(2, Math.round(length / 1.9))

    for (let i = 0; i <= count; i++) {
      const x = from + (i / count) * length
      const post = new THREE.Mesh(UNIT_BOX, materials.iron)
      post.scale.set(0.055, 1.08, 0.055)
      post.position.set(x, 0.54, 0)
      post.castShadow = true
      group.add(post)
    }

    for (const y of [0.44, 0.98]) {
      const rail = new THREE.Mesh(UNIT_BOX, materials.iron)
      rail.scale.set(length, 0.035, 0.035)
      rail.position.set((from + to) / 2, y, 0)
      group.add(rail)
    }
  }

  group.position.z = 8.4

  const marker = new THREE.Mesh(UNIT_BOX, materials.concrete)
  marker.scale.set(0.55, 1.15, 0.4)
  marker.position.set(-7.8, 0.57, 7.6)
  marker.castShadow = true
  marker.receiveShadow = true
  group.add(marker)

  return group
}

/* --------------------------------------------------------------------------
   dust motes
   -------------------------------------------------------------------------- */

function buildDust(random) {
  const count = 240
  const positions = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  const TOP = 16

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 26
    positions[i * 3 + 1] = random() * TOP
    positions[i * 3 + 2] = (random() - 0.5) * 22
    speeds[i] = 0.08 + random() * 0.22
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: '#f2e4c9',
    size: 0.045,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  function update(dt) {
    for (let i = 0; i < count; i++) {
      const yIndex = i * 3 + 1
      positions[yIndex] += speeds[i] * dt
      if (positions[yIndex] > TOP) positions[yIndex] = 0.2
    }
    geometry.getAttribute('position').needsUpdate = true
  }

  return { points, update }
}

/* --------------------------------------------------------------------------
   site
   -------------------------------------------------------------------------- */

export function buildSite(stage) {
  const random = mulberry32(20261031)
  const materials = createMaterials()

  const tower = buildTower(materials)
  const ground = buildGround(materials)
  const hills = buildHills(random, materials)
  const fence = buildFence(materials)
  const dust = buildDust(random)

  stage.scene.add(tower, ground, hills, fence, dust.points)

  const sheave = tower.userData.sheave

  function update(_time, dt) {
    if (sheave) sheave.rotation.z -= dt * 0.45
    dust.update(dt)
  }

  return { update, tower }
}
