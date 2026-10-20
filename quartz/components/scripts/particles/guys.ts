// Guys: logical movement along nav paths plus a procedurally posed stick figure.
// Movement is cell-based and deterministic; the skeleton is only for looks (and
// becomes a Verlet ragdoll when a guy dies).

import { FIRE, SOLID } from "./cells"
import { solidAt, climbAt, waterAt, supported, standable, headroom } from "./nav"
import type { World } from "./world"

// Skeleton nodes
export const N_HEAD = 0,
  N_NECK = 1,
  N_HIP = 2,
  N_LKNEE = 3,
  N_RKNEE = 4,
  N_LFOOT = 5,
  N_RFOOT = 6,
  N_LELBOW = 7,
  N_RELBOW = 8,
  N_LHAND = 9,
  N_RHAND = 10
export const NUM_NODES = 11

const SPRINGS: [number, number, number][] = [
  [N_HEAD, N_NECK, 1.5],
  [N_NECK, N_HIP, 2.5],
  [N_HIP, N_LKNEE, 2.0],
  [N_HIP, N_RKNEE, 2.0],
  [N_LKNEE, N_LFOOT, 2.0],
  [N_RKNEE, N_RFOOT, 2.0],
  [N_NECK, N_LELBOW, 1.5],
  [N_NECK, N_RELBOW, 1.5],
  [N_LELBOW, N_LHAND, 1.5],
  [N_RELBOW, N_RHAND, 1.5],
  [N_HEAD, N_HIP, 4.0],
]

export const WALK_SPEED = 0.16
const SWIM_SPEED = 0.07
const CLIMB_SPEED = 0.13
const HOP_SPEED = 0.35

// What the hands are doing (purely visual)
export const ACT_NONE = 0,
  ACT_HAMMER = 1,
  ACT_CHOP = 2,
  ACT_MINE = 3,
  ACT_SIT = 4,
  ACT_PLANT = 5

export type Mode = "stand" | "walk" | "climb" | "hop" | "fall" | "swim" | "dead"

export interface Job {
  kind: string
  [key: string]: any
}

export interface Guy {
  id: number
  x: number // feet column (float while moving)
  y: number // feet row (float while falling/climbing)
  vy: number
  dir: 1 | -1
  mode: Mode
  path: number[]
  pathI: number
  job: Job | null
  project: number // assigned project id (-1 none)
  carry: number // 0 nothing, 1 wood, 2 stone
  carryAmt: number
  act: number
  actT: number
  wait: number
  stuck: number
  phase: number
  idleT: number
  px: number[]
  py: number[]
  ox: number[]
  oy: number[]
  deadT: number
  hat: number // small per-guy variation in the drawing
  lost: number // consecutive failed path searches
}

export function makeGuy(w: World, x: number, y: number): Guy {
  const px = new Array(NUM_NODES).fill(x)
  const py = new Array(NUM_NODES).fill(y)
  const g: Guy = {
    id: w.nextGuyId++,
    x,
    y,
    vy: 0,
    dir: w.rng.next() < 0.5 ? -1 : 1,
    mode: "fall",
    path: [],
    pathI: 0,
    job: null,
    project: -1,
    carry: 0,
    carryAmt: 0,
    act: ACT_NONE,
    actT: 0,
    wait: w.rng.int(30),
    stuck: 0,
    phase: w.rng.next() * 6,
    idleT: 0,
    px,
    py,
    ox: [...px],
    oy: [...py],
    deadT: 0,
    hat: w.rng.int(6),
    lost: 0,
  }
  pose(g, 1)
  for (let n = 0; n < NUM_NODES; n++) {
    g.ox[n] = g.px[n]
    g.oy[n] = g.py[n]
  }
  return g
}

export function setPath(g: Guy, path: number[] | null) {
  g.path = path ?? []
  g.pathI = 0
  g.stuck = 0
}

export function pathDone(g: Guy): boolean {
  return g.pathI >= g.path.length
}

export function killGuy(g: Guy) {
  if (g.mode === "dead") return
  g.mode = "dead"
  g.deadT = 0
  g.job = null
  g.path = []
  // keep whatever wobble they had, plus a little stagger
  g.ox[N_HEAD] += g.dir * 0.3
}

// Advance one guy by one tick: hazards, gravity, water, path following, pose.
export function moveGuy(w: World, g: Guy) {
  if (g.mode === "dead") {
    ragdoll(w, g)
    return
  }
  const W = w.W
  let cx = Math.round(g.x),
    cy = Math.round(g.y)

  // Fire anywhere on the body is fatal
  for (let i = 0; i < 8; i++) {
    const k = (cy - i) * W + cx
    if (
      k >= 0 &&
      k < w.grid.length &&
      (w.grid[k] === FIRE || w.grid[k - 1] === FIRE || w.grid[k + 1] === FIRE)
    ) {
      killGuy(g)
      return
    }
  }
  // Buried by something: pop up, or get crushed
  if (solidAt(w, cx, cy) && g.mode !== "hop") {
    let up = 1
    while (up <= 10 && solidAt(w, cx, cy - up)) up++
    if (up > 10) {
      killGuy(g)
      return
    }
    g.y = cy - up
    cy = g.y
    g.vy = 0
  }

  // No room to stand up (a floor was built just over our head): squeeze out sideways
  if (
    g.mode !== "fall" &&
    g.mode !== "hop" &&
    g.mode !== "climb" &&
    !headroom(w, cx, cy) &&
    !waterAt(w, cx, cy)
  ) {
    const k = w.nav.snap(w, cx, cy, 8)
    if (k >= 0) {
      g.x = k % W
      g.y = Math.floor(k / W)
      cx = g.x
      cy = g.y
      setPath(g, [])
    }
  }

  const inWater = waterAt(w, cx, cy) || waterAt(w, cx, cy - 2)
  const onLadder = climbAt(w, cx, cy)

  // Gravity
  if (g.mode === "fall" || (!inWater && !onLadder && g.mode !== "hop" && !supported(w, cx, cy))) {
    if (g.mode !== "fall") {
      g.mode = "fall"
      g.vy = 0
    }
    if (inWater) {
      g.mode = "swim"
      g.vy = 0
    } else {
      g.vy = Math.min(g.vy + 0.07, 0.9)
      const ny = g.y + g.vy
      for (let r = Math.floor(g.y); r <= Math.floor(ny); r++) {
        if (supported(w, cx, r) || climbAt(w, cx, r) || waterAt(w, cx, r)) {
          if (r >= g.y - 0.001 && r <= ny + 0.001) {
            g.y = r
            g.vy = 0
            g.mode = waterAt(w, cx, r) ? "swim" : "stand"
            break
          }
        }
      }
      if (g.mode === "fall") g.y = ny
      if (g.y > w.H + 10) {
        killGuy(g)
        g.deadT = 1000
      }
      pose(g, 0.5)
      return
    }
  }

  if (inWater) {
    if (g.mode !== "swim") g.mode = "swim"
    // float up to the surface
    if (waterAt(w, cx, Math.round(g.y) - 1)) g.y -= 0.08
    else g.y = Math.round(g.y)
  } else if (g.mode === "swim") {
    g.mode = "stand"
    g.y = Math.round(g.y)
  }

  // Follow the path
  if (g.pathI < g.path.length) {
    const t = g.path[g.pathI]
    const tx = t % W,
      ty = (t - tx) / W
    const speed = g.mode === "swim" ? SWIM_SPEED : WALK_SPEED
    g.stuck++
    if (g.mode === "hop") {
      // rise to the ledge, then step across it, all without gravity
      if (g.y > ty) g.y = Math.max(ty, g.y - HOP_SPEED)
      else {
        g.dir = tx > g.x ? 1 : -1
        g.x += g.dir * WALK_SPEED
        if ((g.dir > 0 && g.x >= tx) || (g.dir < 0 && g.x <= tx)) g.x = tx
      }
    } else if (tx !== cx || Math.abs(g.x - tx) > 0.01) {
      if (ty < Math.round(g.y) && Math.abs(g.x - tx) <= 1.01 && g.mode !== "swim") {
        g.mode = "hop" // jump up first, then step across
      } else if (ty < Math.round(g.y) && g.mode === "swim") {
        g.y = ty // climb out of the water
      } else {
        g.dir = tx > g.x ? 1 : -1
        g.x += g.dir * speed
        if ((g.dir > 0 && g.x >= tx) || (g.dir < 0 && g.x <= tx)) g.x = tx
        if (g.mode !== "swim") g.mode = "walk"
        g.phase += speed * 1.6
      }
    } else if (Math.abs(g.y - ty) > 0.01) {
      // vertical: ladder
      g.mode = "climb"
      const d = ty - g.y
      g.y += Math.sign(d) * Math.min(Math.abs(d), CLIMB_SPEED)
      g.phase += CLIMB_SPEED * 2.2
    }
    if (Math.abs(g.x - tx) < 0.01 && Math.abs(g.y - ty) < 0.01) {
      g.x = tx
      g.y = ty
      g.pathI++
      g.stuck = 0
      if (g.mode !== "swim") g.mode = climbAt(w, tx, ty) && !supported(w, tx, ty) ? "climb" : "walk"
      // sanity: the world may have changed under the next node
      if (g.pathI < g.path.length) {
        const n = g.path[g.pathI]
        if (!standable(w, n % W, Math.floor(n / W))) g.stuck = 1000
      }
    }
    if (g.pathI >= g.path.length && g.mode !== "swim")
      g.mode =
        climbAt(w, Math.round(g.x), Math.round(g.y)) &&
        !supported(w, Math.round(g.x), Math.round(g.y))
          ? "climb"
          : "stand"
  } else if (g.mode === "walk" || g.mode === "hop") {
    g.mode = "stand"
    g.y = Math.round(g.y)
  }
  pose(g, 0.45)
}

// --- Pose ---
// Poses are targets; the skeleton chases them on springs with a little inertia and
// floppy bones, so guys jiggle, bounce on landing and trail their arms.
const TX = new Float64Array(NUM_NODES),
  TY = new Float64Array(NUM_NODES)
// how hard each node is pulled to its target: feet and hips firm, hands loose
const STIFF = [0.16, 0.2, 0.34, 0.24, 0.24, 0.45, 0.45, 0.13, 0.13, 0.09, 0.09]
const DAMP = 0.8

function setNode(_g: Guy, n: number, x: number, y: number, _k: number) {
  TX[n] = x
  TY[n] = y
}

export function pose(g: Guy, k: number) {
  poseTargets(g)
  const { px, py, ox, oy } = g
  for (let n = 0; n < NUM_NODES; n++) {
    if (k >= 1 || Math.abs(TX[n] - px[n]) > 6 || Math.abs(TY[n] - py[n]) > 6) {
      px[n] = ox[n] = TX[n]
      py[n] = oy[n] = TY[n]
      continue
    }
    const vx = (px[n] - ox[n]) * DAMP,
      vy = (py[n] - oy[n]) * DAMP
    ox[n] = px[n]
    oy[n] = py[n]
    px[n] += vx + (TX[n] - px[n]) * STIFF[n]
    py[n] += vy + (TY[n] - py[n]) * STIFF[n]
  }
  // bones keep their length (loosely), which passes wobble along the limbs
  for (let iter = 0; iter < 2; iter++) {
    for (const [a, b, rest] of SPRINGS) {
      const dx = px[b] - px[a],
        dy = py[b] - py[a]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.001) continue
      const diff = ((rest - dist) / dist) * 0.25
      px[a] -= dx * diff
      py[a] -= dy * diff
      px[b] += dx * diff
      py[b] += dy * diff
    }
  }
  // feet stay planted
  for (const n of [N_LFOOT, N_RFOOT]) {
    px[n] += (TX[n] - px[n]) * 0.5
    py[n] += (TY[n] - py[n]) * 0.5
  }
}

function poseTargets(g: Guy) {
  const k = 1
  const x = g.x
  const fy = g.y + 0.6 // feet sit at the bottom of the feet cell
  const d = g.dir
  const ph = g.phase
  const mode = g.mode
  let hipY = fy - 4
  if (mode === "walk") hipY -= Math.abs(Math.sin(ph)) * 0.35
  if (g.act === ACT_SIT) hipY = fy - 2.6
  const lean = mode === "walk" ? d * 0.25 : 0
  setNode(g, N_HIP, x, hipY, k)
  setNode(g, N_NECK, x + lean, hipY - 2.5, k)
  setNode(g, N_HEAD, x + lean * 1.2, hipY - 4, k)

  if (mode === "climb") {
    const s = Math.sin(ph)
    setNode(g, N_LHAND, x - 0.7, hipY - 4.2 + s * 0.8, k)
    setNode(g, N_RHAND, x + 0.7, hipY - 4.2 - s * 0.8, k)
    setNode(g, N_LELBOW, x - 1.3, hipY - 2.6 + s * 0.4, k)
    setNode(g, N_RELBOW, x + 1.3, hipY - 2.6 - s * 0.4, k)
    setNode(g, N_LFOOT, x - 0.6, fy - Math.max(0, s) * 1.3, k)
    setNode(g, N_RFOOT, x + 0.6, fy - Math.max(0, -s) * 1.3, k)
    setNode(g, N_LKNEE, x - 1.0, hipY + 1.8 - Math.max(0, s) * 0.8, k)
    setNode(g, N_RKNEE, x + 1.0, hipY + 1.8 - Math.max(0, -s) * 0.8, k)
    return
  }
  if (mode === "fall" || mode === "hop") {
    const s = Math.sin(ph * 3)
    setNode(g, N_LHAND, x - 2.2, hipY - 5 + s * 0.5, k)
    setNode(g, N_RHAND, x + 2.2, hipY - 5 - s * 0.5, k)
    setNode(g, N_LELBOW, x - 1.6, hipY - 3.4, k)
    setNode(g, N_RELBOW, x + 1.6, hipY - 3.4, k)
    setNode(g, N_LKNEE, x - 0.9, hipY + 1.6, k)
    setNode(g, N_RKNEE, x + 0.9, hipY + 1.6, k)
    setNode(g, N_LFOOT, x - 1.2, fy - 0.3, k)
    setNode(g, N_RFOOT, x + 1.0, fy, k)
    g.phase += 0.15
    return
  }
  if (mode === "swim") {
    const t = ph * 3
    const s = Math.sin(t)
    setNode(g, N_LHAND, x - 2 + s * 1.5, hipY - 3.5 + s * 1.5, k)
    setNode(g, N_RHAND, x + 2 - s * 1.5, hipY - 3.5 - s * 1.5, k)
    setNode(g, N_LELBOW, x - 1.5 + s, hipY - 3 + s, k)
    setNode(g, N_RELBOW, x + 1.5 - s, hipY - 3 - s, k)
    setNode(g, N_LKNEE, x - 0.5, hipY + 1.5 + s, k)
    setNode(g, N_RKNEE, x + 0.5, hipY + 1.5 - s, k)
    setNode(g, N_LFOOT, x - 0.8, hipY + 3.5 + s * 1.5, k)
    setNode(g, N_RFOOT, x + 0.8, hipY + 3.5 - s * 1.5, k)
    g.phase += 0.06
    return
  }

  // Legs
  if (g.act === ACT_SIT) {
    setNode(g, N_LKNEE, x + d * 1.4, hipY - 0.1, k)
    setNode(g, N_RKNEE, x + d * 1.6, hipY + 0.1, k)
    setNode(g, N_LFOOT, x + d * 1.5, fy, k)
    setNode(g, N_RFOOT, x + d * 1.8, fy, k)
  } else if (mode === "walk") {
    const s = Math.sin(ph),
      c = Math.cos(ph)
    setNode(g, N_LFOOT, x + s * 1.1 * d, fy - Math.max(0, c) * 0.8, k)
    setNode(g, N_RFOOT, x - s * 1.1 * d, fy - Math.max(0, -c) * 0.8, k)
    setNode(g, N_LKNEE, x + s * 0.6 * d + d * 0.3, hipY + 2 - Math.max(0, c) * 0.4, k)
    setNode(g, N_RKNEE, x - s * 0.6 * d + d * 0.3, hipY + 2 - Math.max(0, -c) * 0.4, k)
  } else {
    setNode(g, N_LFOOT, x - 0.8, fy, k)
    setNode(g, N_RFOOT, x + 0.8, fy, k)
    setNode(g, N_LKNEE, x - 0.5, hipY + 2, k)
    setNode(g, N_RKNEE, x + 0.5, hipY + 2, k)
  }

  // Arms
  const neckY = hipY - 2.5
  const t = g.actT
  if (g.act === ACT_HAMMER) {
    const s = Math.sin(t * 0.45)
    setNode(g, N_RELBOW, x + d * 1.2, neckY - 0.6, k)
    setNode(g, N_RHAND, x + d * (1.6 + s * 0.3), neckY - 2.2 + s * 1.4, k)
    setNode(g, N_LELBOW, x - d * 0.6, neckY + 1.4, k)
    setNode(g, N_LHAND, x - d * 0.3, neckY + 2.8, k)
  } else if (g.act === ACT_CHOP || g.act === ACT_MINE) {
    const s = Math.sin(t * 0.35)
    const low = g.act === ACT_MINE ? 1.5 : 0
    setNode(g, N_RELBOW, x + d * 1.3, neckY + 0.8 + low * 0.5, k)
    setNode(g, N_RHAND, x + d * (2.0 + s * 0.8), neckY + 1.2 - s * 1.2 + low, k)
    setNode(g, N_LELBOW, x + d * 1.0, neckY + 1.2 + low * 0.5, k)
    setNode(g, N_LHAND, x + d * (1.7 + s * 0.6), neckY + 1.6 - s + low, k)
  } else if (g.act === ACT_PLANT) {
    setNode(g, N_RELBOW, x + d * 1.2, neckY + 1.6, k)
    setNode(g, N_RHAND, x + d * 1.8, fy - 0.6, k)
    setNode(g, N_LELBOW, x - d * 0.8, neckY + 1.2, k)
    setNode(g, N_LHAND, x - d * 0.6, neckY + 2.6, k)
  } else if (g.act === ACT_SIT) {
    setNode(g, N_LELBOW, x + d * 0.6, neckY + 1.4, k)
    setNode(g, N_RELBOW, x + d * 0.9, neckY + 1.4, k)
    setNode(g, N_LHAND, x + d * 1.4, neckY + 2.2, k)
    setNode(g, N_RHAND, x + d * 1.6, neckY + 2.0, k)
  } else {
    const sw = mode === "walk" ? Math.sin(ph) * 0.5 * d : 0
    setNode(g, N_LELBOW, x - 0.8 - sw, neckY + 1.2, k)
    setNode(g, N_RELBOW, x + 0.8 + sw, neckY + 1.2, k)
    setNode(g, N_LHAND, x - 0.7 - sw * 1.5, neckY + 2.6, k)
    setNode(g, N_RHAND, x + 0.7 + sw * 1.5, neckY + 2.6, k)
  }
}

// --- Ragdoll (after death) ---
function ragdoll(w: World, g: Guy) {
  g.deadT++
  for (let n = 0; n < NUM_NODES; n++) {
    const vx = (g.px[n] - g.ox[n]) * 0.95
    const vy = (g.py[n] - g.oy[n]) * 0.95
    g.ox[n] = g.px[n]
    g.oy[n] = g.py[n]
    g.px[n] += vx
    g.py[n] += Math.min(vy + 0.15, 0.9)
  }
  for (let iter = 0; iter < 6; iter++) {
    for (const [a, b, rest] of SPRINGS) {
      const dx = g.px[b] - g.px[a],
        dy = g.py[b] - g.py[a]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.001) continue
      const diff = ((rest - dist) / dist) * 0.5
      g.px[a] -= dx * diff
      g.py[a] -= dy * diff
      g.px[b] += dx * diff
      g.py[b] += dy * diff
    }
    for (let n = 0; n < NUM_NODES; n++) {
      const nx = Math.round(g.px[n]),
        ny = Math.round(g.py[n])
      if (SOLID[w.get(nx, ny)]) {
        let up = ny
        while (SOLID[w.get(nx, up)] && up > ny - 4) up--
        g.py[n] = up + 0.4
        g.oy[n] = g.py[n]
        g.ox[n] = g.px[n] - (g.px[n] - g.ox[n]) * 0.3
      }
    }
  }
}

// --- Drawing (screen resolution) ---
export type Plot = (x: number, y: number, color: number) => void

function line(
  plot: Plot,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  thick: number,
) {
  let ix0 = Math.round(x0),
    iy0 = Math.round(y0)
  const ix1 = Math.round(x1),
    iy1 = Math.round(y1)
  const dx = Math.abs(ix1 - ix0),
    dy = Math.abs(iy1 - iy0)
  const sx = ix0 < ix1 ? 1 : -1,
    sy = iy0 < iy1 ? 1 : -1
  let err = dx - dy
  const half = Math.floor(thick / 2)
  for (let guard = 0; guard < 4000; guard++) {
    for (let t = -half; t < thick - half; t++) {
      if (dx >= dy) plot(ix0, iy0 + t, color)
      else plot(ix0 + t, iy0, color)
    }
    if (ix0 === ix1 && iy0 === iy1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      ix0 += sx
    }
    if (e2 < dx) {
      err += dx
      iy0 += sy
    }
  }
}

function circle(plot: Plot, cx: number, cy: number, r: number, color: number) {
  const ir = Math.max(1, Math.round(r))
  const icx = Math.round(cx),
    icy = Math.round(cy)
  let x = ir,
    y = 0,
    d = 1 - ir
  while (x >= y) {
    plot(icx + x, icy + y, color)
    plot(icx - x, icy + y, color)
    plot(icx + x, icy - y, color)
    plot(icx - x, icy - y, color)
    plot(icx + y, icy + x, color)
    plot(icx - y, icy + x, color)
    plot(icx + y, icy - x, color)
    plot(icx - y, icy - x, color)
    y++
    if (d < 0) d += 2 * y + 1
    else {
      x--
      d += 2 * (y - x) + 1
    }
  }
}

export const GUY_COLOR = 0xff4a4a4a
const DEAD_COLOR = ((255 << 24) | (0 << 16) | (0 << 8) | 139) >>> 0
const WOOD_COLOR = ((255 << 24) | (52 << 16) | (92 << 8) | 140) >>> 0
const WOOD_DARK = ((255 << 24) | (36 << 16) | (66 << 8) | 104) >>> 0
const STONE_COLOR = ((255 << 24) | (150 << 16) | (156 << 8) | 160) >>> 0
const STONE_DARK = ((255 << 24) | (110 << 16) | (114 << 8) | 118) >>> 0

// Draw a guy. (ox, oy) is the screen position of cell (0, 0); s is pixels per cell.
export function drawGuy(g: Guy, plot: Plot, s: number, ox: number, oy: number) {
  const col = g.mode === "dead" ? DEAD_COLOR : GUY_COLOR
  const th = Math.max(1, Math.round((s * 2) / 3))
  const X = (n: number) => ox + g.px[n] * s
  const Y = (n: number) => oy + g.py[n] * s
  const headR = 1.2 * s
  circle(plot, X(N_HEAD), Y(N_HEAD), headR, col)
  if (s >= 2.5 && g.mode !== "dead" && g.hat < 2) {
    // a few of them wear a little cap
    const hx = X(N_HEAD),
      hy = Y(N_HEAD) - headR
    line(plot, hx - headR, hy, hx + headR + g.dir * s * 0.6, hy, col, th)
  }
  line(plot, X(N_HEAD), Y(N_HEAD) + headR, X(N_NECK), Y(N_NECK), col, th)
  line(plot, X(N_NECK), Y(N_NECK), X(N_HIP), Y(N_HIP), col, th)
  line(plot, X(N_HIP), Y(N_HIP), X(N_LKNEE), Y(N_LKNEE), col, th)
  line(plot, X(N_LKNEE), Y(N_LKNEE), X(N_LFOOT), Y(N_LFOOT), col, th)
  line(plot, X(N_HIP), Y(N_HIP), X(N_RKNEE), Y(N_RKNEE), col, th)
  line(plot, X(N_RKNEE), Y(N_RKNEE), X(N_RFOOT), Y(N_RFOOT), col, th)
  if (g.carry && g.carryAmt > 0 && g.mode !== "dead" && g.act === ACT_NONE && g.mode !== "climb") {
    // arms up, holding a bundle over the head
    const hx = X(N_HEAD),
      hy = Y(N_HEAD)
    const iw = Math.round(s * (1.6 + Math.min(1, g.carryAmt / 300)))
    const ih = Math.round(s * (g.carry === 1 ? 1.0 : 1.6))
    const top = hy - headR - ih - Math.max(1, Math.round(s * 0.6))
    const nx = X(N_NECK),
      ny = Y(N_NECK)
    line(plot, nx, ny, hx - iw, hy - headR, col, th)
    line(plot, hx - iw, hy - headR, hx - iw, top + ih, col, th)
    line(plot, nx, ny, hx + iw, hy - headR, col, th)
    line(plot, hx + iw, hy - headR, hx + iw, top + ih, col, th)
    const c1 = g.carry === 1 ? WOOD_COLOR : STONE_COLOR
    const c2 = g.carry === 1 ? WOOD_DARK : STONE_DARK
    for (let yy = 0; yy <= ih; yy++) {
      for (let xx = -iw - 1; xx <= iw + 1; xx++) {
        const edge =
          g.carry === 1
            ? yy === Math.floor(ih / 2) || (xx + 99) % Math.max(2, Math.round(s * 1.3)) === 0
            : yy === 0 || xx === -iw - 1
        plot(Math.round(hx) + xx, Math.round(top) + yy, edge ? c2 : c1)
      }
    }
  } else {
    line(plot, X(N_NECK), Y(N_NECK), X(N_LELBOW), Y(N_LELBOW), col, th)
    line(plot, X(N_LELBOW), Y(N_LELBOW), X(N_LHAND), Y(N_LHAND), col, th)
    line(plot, X(N_NECK), Y(N_NECK), X(N_RELBOW), Y(N_RELBOW), col, th)
    line(plot, X(N_RELBOW), Y(N_RELBOW), X(N_RHAND), Y(N_RHAND), col, th)
    if ((g.act === ACT_HAMMER || g.act === ACT_CHOP || g.act === ACT_MINE) && s >= 2) {
      // the tool in hand
      const hx = X(N_RHAND),
        hy = Y(N_RHAND)
      const tc = g.act === ACT_HAMMER ? WOOD_DARK : STONE_DARK
      line(plot, hx, hy, hx + g.dir * s * 0.9, hy - s * 0.9, tc, th)
    }
  }
}

// Screen-space bounding box for dirty-rect redraws
export function guyBounds(g: Guy, s: number): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (let n = 0; n < NUM_NODES; n++) {
    x0 = Math.min(x0, g.px[n])
    x1 = Math.max(x1, g.px[n])
    y0 = Math.min(y0, g.py[n])
    y1 = Math.max(y1, g.py[n])
  }
  return [
    Math.floor((x0 - 4.5) * s),
    Math.floor((y0 - 6) * s),
    Math.ceil((x1 + 4.5) * s),
    Math.ceil((y1 + 2) * s),
  ]
}
