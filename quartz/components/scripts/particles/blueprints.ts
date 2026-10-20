// Blueprints turn a structure description into an ordered list of build steps.
// Steps are placed bottom-up so the guys can always climb what they've built.

import {
  EMPTY,
  PLANK,
  BEAM,
  LADDER,
  RUNG,
  ROOF,
  ROOF_SLATE,
  ROOF_GREEN,
  STONEBLOCK,
  BRICKWORK,
  WALL_WOOD,
  FRAME,
  WALL_STONE,
  WALL_BRICK,
  GLASS,
  ROPE,
  BANNER_RED,
  BANNER_BLUE,
  LANTERN,
  FLAGPOLE,
  SOLID,
  BUILT,
  BUILT_BG,
  TEXT,
  WATER,
  DIGGABLE,
  DIRT,
} from "./cells"
import type { World } from "./world"

export const L_FG = 0,
  L_BG = 1,
  L_FURN = 2,
  L_CLEAR = 3,
  L_FELL = 4,
  L_CLEARBG = 5

export const R_NONE = 0,
  R_WOOD = 1,
  R_STONE = 2

export interface Step {
  x: number
  y: number
  t: number // cell type (or furniture kind)
  L: number // layer / operation
  r: number // resource
  c: number // cost in resource points
  claim: number // guy id currently working on it
  done: boolean
  tries: number
  v?: number // furniture variant
  flip?: boolean
  room?: number
}

export const STORY = 12 // rows from floor to floor (11 clear)
const BODY_GAP = 9 // a gap under a floor needs this many rows to walk through

export const ROOF_GABLE = 0,
  ROOF_SPIRE = 1,
  ROOF_BATTLEMENT = 2,
  ROOF_DOME = 3,
  ROOF_HIP = 4,
  ROOF_LOOKOUT = 5

export interface TowerStyle {
  wall: number
  pillar: number
  floor: number
  roof: number
  roofKind: number
  window: number // 0 none, 1 small, 2 tall, 3 wide
  foundation: number
  solidFoundation: boolean
  ladder: number // 0 zigzag, 1 center, 2 inset zigzag
  flag: number // bg banner type or 0
  lantern: boolean
}

export interface Tower {
  id: number
  x0: number // outer columns (pillars)
  x1: number
  base: number // row of the ground floor plank
  stories: number // built stories
  style: TowerStyle
  roofTop: number
  doors: number[] // per story: bit 1 = left doorway, bit 2 = right doorway
  balconies: number[] // per story: bit 1 = left, bit 2 = right
  complete: boolean
  entrance: number // -1 left, 1 right, 0 flush with the ground
}

export function floorY(t: Tower, k: number): number {
  return t.base - k * STORY
}

export function ladderX(t: Tower, k: number): number {
  const p = t.style.ladder
  if (p === 1) return ((t.x0 + t.x1) >> 1) - 1
  if (p === 2) return k % 2 === 0 ? t.x0 + 2 : t.x1 - 4
  return k % 2 === 0 ? t.x0 + 1 : t.x1 - 3
}

export function costOf(type: number, L: number): [number, number] {
  if (L === L_FG) {
    if (type === DIRT) return [R_NONE, 0]
    if (type === STONEBLOCK || type === BRICKWORK) return [R_STONE, 10]
    if (type === ROOF_SLATE || type === ROOF_GREEN) return [R_WOOD, 8] // painted shingles
    if (type === RUNG) return [R_WOOD, 3]
    if (type === LADDER) return [R_WOOD, 5]
    if (type === ROOF) return [R_WOOD, 8]
    return [R_WOOD, 10]
  }
  if (L === L_BG) {
    if (type === WALL_STONE || type === WALL_BRICK) return [R_STONE, 1]
    if (type === LANTERN) return [R_STONE, 4]
    if (type === BANNER_RED || type === BANNER_BLUE) return [R_WOOD, 3]
    return [R_WOOD, 1]
  }
  return [R_NONE, 0]
}

export function mkStep(x: number, y: number, t: number, L: number): Step {
  const [r, c] = costOf(t, L)
  return { x, y, t, L, r, c, claim: 0, done: false, tries: 0 }
}

// Window glass/frame for a cell in a room's back wall, or 0 for plain wall
function windowCell(t: Tower, k: number, x: number, y: number): number {
  const s = t.style.window
  if (!s) return 0
  const fl = floorY(t, k)
  const inner = t.x1 - t.x0 - 1
  const centers =
    inner >= 13
      ? [t.x0 + 1 + Math.floor(inner * 0.27), t.x1 - 1 - Math.floor(inner * 0.27)]
      : [(t.x0 + t.x1) >> 1]
  const gw = s === 3 ? 3 : 2
  const top = s === 2 ? fl - 9 : fl - 8
  const bottom = fl - 6
  for (const c of centers) {
    const gx0 = c - (gw >> 1),
      gx1 = gx0 + gw - 1
    if (x >= gx0 && x <= gx1 && y >= top && y <= bottom) return GLASS
    if (x >= gx0 - 1 && x <= gx1 + 1 && y >= top - 1 && y <= bottom + 1) return FRAME
  }
  return 0
}

export function storySteps(w: World, t: Tower, k: number, top: boolean): Step[] {
  const steps: Step[] = []
  const { x0, x1, style } = t
  const fl = floorY(t, k),
    ceil = floorY(t, k + 1)
  const lx = ladderX(t, k)
  const door = t.doors[k] ?? 0
  // dig out anything in the way
  for (let y = fl - 1; y >= ceil; y--) {
    for (let x = x0; x <= x1; x++) {
      const c = w.get(x, y)
      if (c !== EMPTY && !BUILT[c] && (DIGGABLE[c] || SOLID[c] || c === WATER) && c !== TEXT)
        steps.push(mkStep(x, y, EMPTY, L_CLEAR))
    }
  }
  // pillars and ladder rise together, row by row
  for (let y = fl - 1; y > ceil; y--) {
    const doorway = y >= fl - 9
    if (!(doorway && door & 1)) steps.push(mkStep(x0, y, style.pillar, L_FG))
    if (!(doorway && door & 2)) steps.push(mkStep(x1, y, style.pillar, L_FG))
    if (!top) {
      steps.push(mkStep(lx, y, LADDER, L_FG))
      steps.push(mkStep(lx + 1, y, RUNG, L_FG))
      steps.push(mkStep(lx + 2, y, LADDER, L_FG))
    }
  }
  // back wall with windows and a beam under the ceiling
  for (let y = fl - 1; y > ceil; y--) {
    for (let x = x0 + 1; x < x1; x++) {
      const wc = windowCell(t, k, x, y)
      steps.push(mkStep(x, y, wc || (y === ceil + 1 ? FRAME : style.wall), L_BG))
    }
  }
  if (style.lantern && x1 - x0 > 10) steps.push(mkStep((x0 + x1) >> 1, ceil + 2, LANTERN, L_BG))
  // ceiling / next floor, leaving the ladder hole
  if (!top) {
    steps.push(mkStep(lx, ceil, LADDER, L_FG))
    steps.push(mkStep(lx + 1, ceil, RUNG, L_FG))
    steps.push(mkStep(lx + 2, ceil, LADDER, L_FG))
  }
  for (let x = x0; x <= x1; x++) {
    if (!top && x >= lx && x <= lx + 2) continue
    steps.push(mkStep(x, ceil, style.floor, L_FG))
  }
  return steps
}

// Ground floor plank and the stilts or stone footing under it
export function foundationSteps(w: World, t: Tower): Step[] {
  const steps: Step[] = []
  const f = t.base
  const { x0, x1, style } = t
  for (let x = x0; x <= x1; x++) {
    let gy = f + 1
    let wet = false
    while (gy < w.H && gy < f + 40 && !w.isSolid(x, gy)) {
      if (w.get(x, gy) === WATER) wet = true
      gy++
    }
    // gaps too low to walk under are packed with earth so nobody gets stuck there
    // (over water it's stilts all the way: you can swim under)
    if (gy - f - 1 < BODY_GAP && !wet) {
      for (let y = gy - 1; y > f; y--) steps.push(mkStep(x, y, DIRT, L_FG))
      continue
    }
    if (style.solidFoundation && !wet) {
      for (let y = gy - 1; y > f; y--) steps.push(mkStep(x, y, style.foundation, L_FG))
      continue
    }
    // stilts are posts in the background: you can walk (or swim) between them
    const stilt = x === x0 || x === x1 || (x - x0) % 4 === 0
    if (!stilt) continue
    for (let y = gy - 1; y > f; y--)
      steps.push(mkStep(x, y, style.foundation === STONEBLOCK ? WALL_STONE : FRAME, L_BG))
  }
  for (let x = x0; x <= x1; x++) steps.push(mkStep(x, f, style.floor, L_FG))
  return steps
}

// A 3-wide ladder whose top cell is at row yTop and that reaches down to the ground
export function ladderSteps(w: World, lx: number, yTop: number, maxLen = 40): Step[] | null {
  const cols: number[] = []
  for (let i = 0; i < 3; i++) {
    const x = lx + i
    let y = yTop
    if (w.isSolid(x, y)) return null
    while (y < w.H && !w.isSolid(x, y + 1) && y - yTop < maxLen) y++
    if (y - yTop >= maxLen) return null
    cols.push(y)
  }
  const bottom = Math.max(...cols)
  const steps: Step[] = []
  for (let y = bottom; y >= yTop; y--) {
    for (let i = 0; i < 3; i++) {
      if (y > cols[i]) continue
      steps.push(mkStep(lx + i, y, i === 1 ? RUNG : LADDER, L_FG))
    }
  }
  return steps
}

export function roofSteps(t: Tower, stories: number): { steps: Step[]; top: number } {
  const steps: Step[] = []
  const F = floorY(t, stories)
  const { x0, x1, style } = t
  const wd = x1 - x0 + 1
  const cx = (x0 + x1) >> 1
  let top = F
  const fg = (x: number, y: number, type: number) => {
    steps.push(mkStep(x, y, type, L_FG))
    top = Math.min(top, y)
  }
  const bgc = (x: number, y: number, type: number) => {
    steps.push(mkStep(x, y, type, L_BG))
    top = Math.min(top, y)
  }
  const flag = (px: number, height: number) => {
    for (let i = 1; i <= height; i++) bgc(px, F - i, FLAGPOLE)
    if (style.flag) {
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 1; dx <= 3 - (dy === 1 ? 0 : 1); dx++)
          bgc(px + dx, F - height + dy, style.flag)
    }
  }
  switch (style.roofKind) {
    case ROOF_GABLE: {
      const p = wd + 2 > 18 ? 2 : 1
      for (let i = 0; ; i++) {
        const lx = x0 - 1 + i * p,
          rx = x1 + 1 - i * p
        const y = F - 1 - i
        if (rx - lx <= 2 * p) {
          for (let x = lx; x <= rx; x++) fg(x, y, style.roof)
          break
        }
        for (let x = lx; x <= lx + p; x++) fg(x, y, style.roof)
        for (let x = rx - p; x <= rx; x++) fg(x, y, style.roof)
        for (let x = lx + p + 1; x < rx - p; x++)
          bgc(x, y, i === 2 && Math.abs(x - cx) <= 0 ? GLASS : style.wall)
      }
      break
    }
    case ROOF_SPIRE: {
      // parapet with a slate spire in the middle
      for (let x = x0; x <= x1; x++) if ((x - x0) % 3 === 0) fg(x, F - 1, style.pillar)
      const widths = [5, 5, 3, 3, 3, 1, 1, 1]
      for (let i = 0; i < widths.length; i++) {
        const hw = widths[i] >> 1
        for (let x = cx - hw; x <= cx + hw; x++) fg(x, F - 1 - i, style.roof)
      }
      bgc(cx, F - 1 - widths.length, FLAGPOLE)
      break
    }
    case ROOF_BATTLEMENT: {
      for (let x = x0; x <= x1; x++) {
        if ((x - x0) % 4 < 2 || x === x1) {
          fg(x, F - 1, style.pillar)
          fg(x, F - 2, style.pillar)
        }
      }
      flag(x0 + 2 + ((wd - 5) >> 1), 8)
      break
    }
    case ROOF_DOME: {
      const r = Math.min(8, (wd + 1) >> 1)
      for (let i = 0; i <= r; i++) {
        const hw = Math.round(Math.sqrt(r * r - i * i) * ((wd + 1) / 2 / r))
        const y = F - 1 - i
        for (let x = cx - hw; x <= cx + hw; x++) {
          const edge = x <= cx - hw + 1 || x >= cx + hw - 1 || i >= r - 1
          if (edge) fg(x, y, style.roof)
          else bgc(x, y, i === Math.floor(r / 2) && x === cx ? GLASS : style.wall)
        }
      }
      bgc(cx, F - r - 2, FLAGPOLE)
      break
    }
    case ROOF_HIP: {
      for (let i = 0; i < 5; i++) {
        const lx = x0 - 2 + i * 2,
          rx = x1 + 2 - i * 2
        if (rx - lx < 3) break
        for (let x = lx; x <= rx; x++) fg(x, F - 1 - i, style.roof)
      }
      break
    }
    case ROOF_LOOKOUT: {
      for (let x = x0; x <= x1; x++) {
        if ((x - x0) % 3 === 0 || x === x1) for (let y = F - 3; y < F; y++) bgc(x, y, FRAME)
        else bgc(x, F - 3, ROPE)
      }
      // a little shingle hat on one side
      const hx0 = x0 + 1,
        hx1 = Math.min(x1 - 1, x0 + 6)
      for (let y = F - 1; y >= F - 7; y--) bgc(hx0, y, FRAME)
      for (let x = hx0 - 1; x <= hx1 + 1; x++) fg(x, F - 8, style.roof)
      for (let x = hx0; x <= hx1; x++) fg(x, F - 9, style.roof)
      if (style.lantern) bgc(hx1, F - 7, LANTERN)
      break
    }
  }
  return { steps, top }
}

export interface BridgePlan {
  steps: Step[]
  deck: [number, number][]
}

// Deck from column xa (at row ya) to column xb (at row yb), with sag, rails and maybe a support
export function bridgeSteps(
  w: World,
  xa: number,
  ya: number,
  xb: number,
  yb: number,
): BridgePlan | null {
  const steps: Step[] = []
  const deck: [number, number][] = []
  const span = xb - xa
  if (span < 3) return null
  const sag = Math.min(3, Math.floor(span / 12))
  for (let x = xa; x <= xb; x++) {
    const t = (x - xa) / span
    const y = Math.round(ya + (yb - ya) * t + sag * Math.sin(Math.PI * t))
    deck.push([x, y])
  }
  // walkable: neighbouring deck cells within one row
  for (let i = 1; i < deck.length; i++) if (Math.abs(deck[i][1] - deck[i - 1][1]) > 1) return null
  for (const [x, y] of deck) steps.push(mkStep(x, y, PLANK, L_FG))
  // rails: rope at hand height, posts every few cells
  for (let i = 0; i < deck.length; i++) {
    const [x, y] = deck[i]
    if (i % 4 === 0 || i === deck.length - 1)
      for (let dy = 1; dy <= 4; dy++) steps.push(mkStep(x, y - dy, FRAME, L_BG))
    else steps.push(mkStep(x, y - 4, ROPE, L_BG))
  }
  // a support pillar under long bridges if the ground is near enough to build from
  if (span > 28) {
    const [mx, my] = deck[deck.length >> 1]
    let gy = my + 1
    while (gy < w.H && !w.isSolid(mx, gy) && gy - my < 22) gy++
    if (gy - my < 22 && w.isSolid(mx, gy)) {
      const sup: Step[] = []
      for (let y = gy - 1; y > my; y--)
        sup.push(mkStep(mx, y, FRAME, L_BG), mkStep(mx + 1, y, FRAME, L_BG))
      steps.unshift(...sup)
    }
  }
  return { steps, deck }
}

// Can every step be built here without touching text, the edges or someone else's claim?
export function validSteps(w: World, steps: Step[], owner: number): boolean {
  for (const s of steps) {
    if (!w.inBounds(s.x, s.y)) return false
    const k = s.y * w.W + s.x
    if (w.noBuild[k]) return false
    const r = w.reserved[k]
    if (r !== 0 && r !== owner) return false
    if (s.L === L_FG) {
      const c = w.grid[k]
      if (c === TEXT) return false
      if (BUILT[c] && c !== s.t) return false
    } else if (s.L === L_BG) {
      const b = w.bg[k]
      if (BUILT_BG[b] && b !== s.t) return false
    }
  }
  return true
}

export function reserveSteps(w: World, steps: Step[], owner: number, pad = 0) {
  for (const s of steps) {
    for (let dy = -pad; dy <= pad; dy++) {
      for (let dx = -pad; dx <= pad; dx++) {
        const x = s.x + dx,
          y = s.y + dy
        if (!w.inBounds(x, y)) continue
        const k = y * w.W + x
        if (w.reserved[k] === 0) w.reserved[k] = owner
      }
    }
  }
}
