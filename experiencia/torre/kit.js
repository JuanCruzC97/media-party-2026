import * as THREE from 'three'

/* --------------------------------------------------------------------------
   Shared geometry + helpers
   -------------------------------------------------------------------------- */

export const UP = new THREE.Vector3(0, 1, 0)

/** Unit box with its origin at the bottom face: y ∈ [0, 1]. Scaling y grows it. */
export const BASE_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** Unit box centred on the origin. */
export const BOX = new THREE.BoxGeometry(1, 1, 1)

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

export function mulberry32(seed) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shadowed(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast
      child.receiveShadow = receive
    }
  })
  return object
}

/** A square-section timber from point a to point b (origin at a, grows toward b). */
export function beamBetween(a, b, size, material, width = size) {
  const direction = new THREE.Vector3().subVectors(b, a)
  const length = direction.length()
  const mesh = new THREE.Mesh(BASE_BOX, material)
  mesh.position.copy(a)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  mesh.scale.set(width, length, size)
  return shadowed(mesh)
}

/** Re-aim an existing beamBetween() mesh at new endpoints. */
export function aimBeam(mesh, a, b) {
  const direction = new THREE.Vector3().subVectors(b, a)
  const length = direction.length()
  mesh.position.copy(a)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  mesh.scale.y = length
}

/** A centred box (plank, slab, block). */
export function block(sx, sy, sz, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(BOX, material)
  mesh.scale.set(sx, sy, sz)
  mesh.position.set(x, y, z)
  return shadowed(mesh)
}

/* --------------------------------------------------------------------------
   Kit: every buildable piece is registered with a start time and an entrance.
   The director moves a single clock `t`; each piece derives its own state
   from it. Seeking, skipping and replaying are therefore free and exact.
   -------------------------------------------------------------------------- */

const gsap = window.gsap

const EASES = {
  grow: gsap.parseEase('power3.out'),
  pop: gsap.parseEase('back.out(1.8)'),
  drop: gsap.parseEase('bounce.out'),
  rise: gsap.parseEase('power3.out'),
  slide: gsap.parseEase('power3.out'),
}

const DURATIONS = { grow: 0.7, pop: 0.45, drop: 0.9, rise: 0.8, slide: 0.6 }

export class Kit {
  constructor() {
    this.pieces = []
  }

  /**
   * @param {THREE.Object3D} object  already placed at its final transform
   * @param {number} t               start time (seconds on the build clock)
   * @param {object} [o]
   * @param {'grow'|'pop'|'drop'|'rise'|'slide'} [o.mode]
   * @param {number} [o.dur]
   * @param {string} [o.ease]        GSAP ease string overriding the mode default
   * @param {number} [o.height]      travel for drop / rise
   * @param {THREE.Vector3} [o.offset] travel for slide
   */
  add(object, t, o = {}) {
    const mode = o.mode || 'pop'
    this.pieces.push({
      object,
      t,
      mode,
      dur: o.dur ?? DURATIONS[mode],
      ease: o.ease ? gsap.parseEase(o.ease) : EASES[mode],
      height: o.height ?? 3,
      offset: o.offset ? o.offset.clone() : null,
      position: object.position.clone(),
      scale: object.scale.clone(),
      p: -1,
    })
    return object
  }

  get count() {
    return this.pieces.length
  }

  get end() {
    let end = 0
    for (const piece of this.pieces) end = Math.max(end, piece.t + piece.dur)
    return end
  }

  /** Force every piece to re-evaluate on the next apply(). */
  invalidate() {
    for (const piece of this.pieces) piece.p = -1
  }

  /** Evaluate all pieces at build time `time`; returns how many are visible. */
  apply(time) {
    let shown = 0
    for (const piece of this.pieces) {
      const raw = (time - piece.t) / piece.dur
      const p = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
      if (p > 0) shown++
      if (p === piece.p) continue
      piece.p = p
      setPiece(piece, p)
    }
    return shown
  }
}

function setPiece(piece, p) {
  const { object } = piece
  object.visible = p > 0
  if (p <= 0) return

  const e = piece.ease(p)
  const { position, scale } = piece

  switch (piece.mode) {
    case 'grow':
      object.scale.set(scale.x, scale.y * Math.max(e, 1e-4), scale.z)
      break
    case 'pop': {
      const s = Math.max(e, 1e-4)
      object.scale.set(scale.x * s, scale.y * s, scale.z * s)
      break
    }
    case 'drop':
      object.position.set(position.x, position.y + (1 - e) * piece.height, position.z)
      break
    case 'rise':
      object.position.set(position.x, position.y - (1 - e) * piece.height, position.z)
      break
    case 'slide':
      object.position.copy(piece.offset).multiplyScalar(1 - e).add(position)
      break
  }
}
