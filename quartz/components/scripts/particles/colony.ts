// The colony: a planner that decides what to build next, a job board of projects made
// of ordered build steps, and the per-guy brain that picks work, gathers wood and stone,
// walks there and builds. Path searches share a per-tick budget so a crowd of guys
// never stalls a frame.

import {
  EMPTY,
  WATER,
  DYNAMIC,
  CLIMB,
  TEXT,
  SOLID,
  BUILT,
  BUILT_BG,
  QUARRY,
  PLANK,
  BEAM,
  STONEBLOCK,
  BRICKWORK,
  WALL_WOOD,
  WALL_STONE,
  WALL_BRICK,
  ROOF,
  ROOF_SLATE,
  ROOF_GREEN,
  BANNER_RED,
  BANNER_BLUE,
  FRAME,
  ROPE,
  TREE,
  BIRCH,
  LADDER,
  RUNG,
  GLASS,
  LANTERN,
  DIRT,
  DIRT_WALL,
  ROCK_WALL,
  WALL_PLASTER,
  WALL_DARK,
} from "./cells"
import {
  Step,
  Tower,
  TowerStyle,
  STORY,
  floorY,
  ladderX,
  mkStep,
  shellSteps,
  orderRoof,
  orderRoofRemoval,
  foundationSteps,
  roofSteps,
  ladderSteps,
  bridgeSteps,
  validSteps,
  reserveSteps,
  L_FG,
  L_BG,
  L_FURN,
  L_CLEAR,
  L_FELL,
  L_CLEARBG,
  R_NONE,
  R_WOOD,
  R_STONE,
  ROOF_GABLE,
  ROOF_SPIRE,
  ROOF_BATTLEMENT,
  ROOF_DOME,
  ROOF_HIP,
  ROOF_LOOKOUT,
} from "./blueprints"
import { FURN, Furniture, furnWidth, furnHeight, F_WORKBENCH } from "./furniture"
import {
  Guy,
  makeGuy,
  moveGuy,
  setPath,
  pathDone,
  ACT_NONE,
  ACT_HAMMER,
  ACT_CHOP,
  ACT_MINE,
  ACT_SIT,
  ACT_PLANT,
} from "./guys"
import { standable, solidAt } from "./nav"
import { isMature, fellTree, canPlant, plantTree, treeAt } from "./trees"
import type { World } from "./world"

export interface Room {
  id: number
  tower: number
  story: number
  x0: number // interior columns
  x1: number
  y: number // feet row on the floor
}

export interface Bridge {
  id: number
  a: number
  sa: number
  b: number
  sb: number
}

export interface Project {
  id: number
  kind: string
  steps: Step[]
  cursor: number
  done: boolean
  tower: number
  want: number
  workers: number
  fails: number
  starved: number
  progress: number // tick of the last placed step
  failMark?: number // fails as of the last placed step
  x: number
  y: number
  data: any
}

export interface Nest {
  lx: number // shaft ladder's left column
  s: number // surface row at the shaft
  b: number // bottom gallery's floor row
  levels: { y: number; xl: number; xr: number }[] // galleries: floor row, dug columns
}

export interface Colony {
  homeX: number
  homeY: number
  stock: number[] // indexed by resource
  projects: Project[]
  nextId: number
  towers: Tower[]
  rooms: Room[]
  bridges: Bridge[]
  furniture: Furniture[]
  tier: number
  startPop: number
  immT: number
  budget: number
  quarry: number[]
  quarryT: number
  ladders: number
  mines: number
  gapBridges: number
  nests: Nest[] // finished mines and the tunnels dug off them
  badSites: number[][] // [x0, x1, until tick]: recently abandoned, don't build there
  safeT: number // tick the safe set was last computed
  safeDirty: boolean
  stats: { placed: number; felled: number; arrived: number; towers: number }
}

export const TIER_NAMES = ["Shelter", "Carpentry", "Masonry", "Engineering"]
const TIER_STORIES = [2, 4, 6, 9]
const SEARCH_BUDGET = 13000
const CARRY_MAX = 1200

export function newColony(w: World, homeX: number, homeY: number): Colony {
  const c: Colony = {
    homeX,
    homeY,
    stock: [0, 0, 0],
    projects: [],
    nextId: 1,
    towers: [],
    rooms: [],
    bridges: [],
    furniture: [],
    tier: 0,
    // wider screens start with a bigger crew
    startPop: Math.max(4, Math.min(16, Math.round(2 + w.W / 45))),
    immT: 1500,
    budget: SEARCH_BUDGET,
    quarry: [],
    quarryT: 0,
    ladders: 0,
    mines: 0,
    gapBridges: 0,
    nests: [],
    badSites: [],
    safeT: -1000,
    safeDirty: true,
    stats: { placed: 0, felled: 0, arrived: 0, towers: 0 },
  }
  // keep the stockpile spot free of buildings
  for (let y = homeY - 10; y <= homeY; y++) {
    for (let x = homeX - 3; x <= homeX + 3; x++)
      if (w.inBounds(x, y)) w.reserved[y * w.W + x] = 65535
  }
  return c
}

export function spawnInitialGuys(w: World) {
  const c = w.colony
  for (let i = 0; i < c.startPop; i++) {
    const x = c.homeX + (i - (c.startPop >> 1)) * 3
    const k = w.nav.snap(w, x, c.homeY, 12)
    if (k >= 0) w.guys.push(makeGuy(w, k % w.W, Math.floor(k / w.W)))
    else {
      let y = c.homeY - 10
      while (y < w.H - 1 && !standable(w, x, y)) y++
      w.guys.push(makeGuy(w, x, y))
    }
  }
}

// --- Per tick ---
export function stepColony(w: World) {
  const c = w.colony
  c.budget = SEARCH_BUDGET
  if (w.tick - c.safeT >= 120 || (c.safeDirty && w.tick - c.safeT >= 8)) {
    w.nav.computeSafe(w, homeNode(w))
    c.safeT = w.tick
    c.safeDirty = false
  }
  if (w.tick % 30 === 0) plan(w)
  if (w.tick % 3000 === 1500) maybeMoveHome(w)
  if (w.tick >= c.immT) immigrate(w)
  for (let i = w.guys.length - 1; i >= 0; i--) {
    const g = w.guys[i]
    moveGuy(w, g)
    if (g.mode === "dead") {
      if (g.deadT > 150) {
        dropClaims(w, g)
        w.guys.splice(i, 1)
      }
      continue
    }
    brain(w, g)
  }
}

// --- Helpers ---
function guyById(w: World, id: number): Guy | undefined {
  for (const g of w.guys) if (g.id === id) return g
  return undefined
}

function projectById(c: Colony, id: number): Project | undefined {
  for (const p of c.projects) if (p.id === id) return p
  return undefined
}

function towerById(c: Colony, id: number): Tower | undefined {
  for (const t of c.towers) if (t.id === id) return t
  return undefined
}

function dropClaims(w: World, g: Guy) {
  const j = g.job
  if (j && j.kind === "build") {
    const p = projectById(w.colony, j.p)
    if (p && p.steps[j.s] && p.steps[j.s].claim === g.id) p.steps[j.s].claim = 0
  }
  if (j && j.kind === "chop") {
    for (const t of w.trees) if (t.claim === g.id) t.claim = 0
  }
}

function endJob(w: World, g: Guy, wait = 0) {
  dropClaims(w, g)
  g.job = null
  g.act = ACT_NONE
  g.actT = 0
  setPath(g, [])
  g.wait = wait
}

function startNode(w: World, g: Guy): number {
  return w.nav.snap(w, g.x, g.y)
}

// Path to any marked goal; spends the shared search budget. Trips stay on the safe
// network (everywhere you can walk back home from), so nobody works their way into
// a hole. Building only ever needs a place to stand that's connected both ways.
function go(w: World, g: Guy, maxExpand = 20000): boolean {
  const s = startNode(w, g)
  if (s < 0) {
    g.lost++
    return false
  }
  w.nav.safeGoalsOnly = w.nav.isSafe(s) || inWater(w, s)
  // (a lake's surface ripples faster than the safe map is redrawn, so swimmers
  // search freely until they reach the shore)
  const path = w.nav.search(w, s, maxExpand, true, !inWater(w, s))
  w.nav.safeGoalsOnly = false
  w.colony.budget -= w.nav.expanded + 50
  if (!path) return false
  g.lost = 0
  setPath(g, path)
  return true
}

function inWater(w: World, k: number): boolean {
  return w.grid[k] === WATER || w.grid[k + w.W] === WATER
}

function canGetHome(w: World, g: Guy): boolean {
  const s = startNode(w, g)
  return s >= 0 && w.nav.isSafe(s)
}

// Walk back onto the safe network by any route
function goToSafety(w: World, g: Guy): boolean {
  const s = startNode(w, g)
  if (s < 0) return false
  w.nav.beginGoals()
  const path = w.nav.search(w, s, 40000, true, false, true)
  w.colony.budget -= w.nav.expanded
  if (!path) return false
  setPath(g, path)
  g.job = { kind: "arrive", phase: "go", t: 0 }
  return true
}

function canSearch(w: World): boolean {
  return w.colony.budget > 1500
}

function stepSatisfied(w: World, s: Step): boolean {
  switch (s.L) {
    case L_FG:
      return w.get(s.x, s.y) === s.t
    case L_BG:
      return w.getBg(s.x, s.y) === s.t
    case L_CLEAR: {
      const v = w.get(s.x, s.y)
      return v === EMPTY || (!SOLID[v] && v !== WATER && !BUILT[v])
    }
    case L_CLEARBG:
      return w.getBg(s.x, s.y) === EMPTY
    case L_FELL: {
      const t = treeAt(w, s.x, s.y)
      return !t
    }
    case L_FURN:
      return w.colony.furniture.some((f) => f.x === s.x && f.y === s.y && f.kind === s.t)
  }
  return true
}

function claimValid(w: World, p: Project, i: number): boolean {
  const s = p.steps[i]
  if (!s.claim) return false
  const g = guyById(w, s.claim)
  return (
    !!g &&
    g.mode !== "dead" &&
    !!g.job &&
    g.job.kind === "build" &&
    g.job.p === p.id &&
    g.job.s === i
  )
}

const WINDOW = 12

// The next step this guy could take on, or -1. Of the next few steps, a guy takes one
// he can do from where he stands, or else the nearest, so the crew isn't forever
// walking back and forth.
function nextStep(w: World, p: Project, g?: Guy): number {
  while (p.cursor < p.steps.length && p.steps[p.cursor].done) p.cursor++
  const end = Math.min(p.steps.length, p.cursor + WINDOW)
  let first = -1,
    near = -1,
    nearD = Infinity
  for (let i = p.cursor; i < end; i++) {
    const s = p.steps[i]
    if (s.done) continue
    if (stepSatisfied(w, s)) {
      s.done = true
      continue
    }
    if (s.tries > 3) {
      s.done = true // give up on unreachable or blocked cells
      continue
    }
    if (claimValid(w, p, i)) continue
    s.claim = 0
    if (!g) return i
    if (first < 0) first = i
    if (inReach(g, s) && (s.r === R_NONE || (g.carry === s.r && g.carryAmt >= s.c))) return i
    const d = Math.abs(s.x - g.x) + Math.abs(s.y - g.y) * 0.7
    if (d < nearD) {
      nearD = d
      near = i
    }
  }
  // (after a run of failures, go back to the first step, which may be what's stuck)
  if (first >= 0) return near >= 0 && p.fails - (p.failMark ?? 0) < 8 ? near : first
  while (p.cursor < p.steps.length && p.steps[p.cursor].done) p.cursor++
  if (p.cursor >= p.steps.length) completeProject(w, p)
  return -1
}

function remainingNeed(p: Project, r: number): number {
  let n = 0
  for (let i = p.cursor; i < p.steps.length && n < CARRY_MAX; i++) {
    const s = p.steps[i]
    if (!s.done && s.r === r) n += s.c
  }
  return n
}

// Cells a guy standing at a node can work on: an arm's length to each side, a little
// below the feet, and up to just over their head. Anything further needs a ladder,
// a floor or scaffolding to stand on first.
const REACH_X = 4,
  REACH_UP = 12,
  REACH_DOWN = 3

function markReach(w: World, s: Step) {
  const nav = w.nav
  nav.beginGoals()
  const solidPlace = s.L === L_FG && SOLID[s.t]
  for (let ny = s.y - REACH_DOWN; ny <= s.y + REACH_UP; ny++) {
    for (let nx = s.x - REACH_X; nx <= s.x + REACH_X; nx++) {
      if (solidPlace && Math.abs(nx - s.x) <= 1 && s.y >= ny - 8 && s.y <= ny) continue
      nav.markGoal(nx, ny, 0)
    }
  }
}

function inReach(g: Guy, s: Step): boolean {
  const gx = Math.round(g.x),
    gy = Math.round(g.y)
  if (Math.abs(gx - s.x) > REACH_X || s.y < gy - REACH_UP || s.y > gy + REACH_DOWN) return false
  if (s.L === L_FG && SOLID[s.t] && Math.abs(gx - s.x) <= 1 && s.y >= gy - 8 && s.y <= gy)
    return false
  return true
}

function overlapsGuy(w: World, x: number, y: number): boolean {
  for (const g of w.guys) {
    if (g.mode === "dead") continue
    const gx = Math.round(g.x),
      gy = Math.round(g.y)
    if (Math.abs(gx - x) <= 1 && y >= gy - 8 && y <= gy) return true
  }
  return false
}

function stepDuration(s: Step): number {
  switch (s.L) {
    case L_FG:
      return s.t === RUNG ? 4 : 7
    case L_BG:
      return 2
    case L_CLEAR:
      return 6
    case L_CLEARBG:
      return 2
    case L_FELL:
      return 45
    case L_FURN:
      return 40
  }
  return 5
}

// --- The brain ---
function brain(w: World, g: Guy) {
  if (g.mode === "fall" || g.mode === "hop") return
  if (g.wait > 0) {
    g.wait--
    return
  }
  const j = g.job
  if (!j) {
    if (!canSearch(w)) return
    think(w, g)
    return
  }
  if (j.phase === "go") {
    if (g.stuck > 240) {
      endJob(w, g, 20)
      return
    }
    if (!pathDone(g)) return
    j.phase = "work"
    g.actT = 0
    j.t = 0
  }
  switch (j.kind) {
    case "build":
      return workBuild(w, g)
    case "chop":
      return workChop(w, g)
    case "quarry":
      return workQuarry(w, g)
    case "stock":
      return workStock(w, g)
    case "plant":
      return workPlant(w, g)
    case "relax":
      g.act = ACT_SIT
      g.actT++
      g.dir = j.dir
      if (g.actT > j.dur) endJob(w, g, 10)
      return
    case "escape":
      return workEscape(w, g)
    case "wander":
    case "arrive":
      endJob(w, g, 30 + w.rng.int(90))
      return
  }
}

function think(w: World, g: Guy) {
  const c = w.colony
  // Off the safe network (fell in a hole, got walled in)? Head home, or dig out.
  const here = startNode(w, g)
  if (here < 0 || !w.nav.isSafe(here)) {
    // the map of safe ground may just be out of date (we're on something new)
    if (w.tick - c.safeT > 8) {
      c.safeDirty = true
      g.wait = 9
      return
    }
    if (here >= 0 && goToSafety(w, g)) return
    g.job = { kind: "escape", dir: c.homeX >= g.x ? 1 : -1, n: 0, phase: "work", t: 0 }
    return
  }
  // 1. Use what we're carrying (scraps aren't worth a trip)
  if (g.carry && g.carryAmt < 10) {
    g.carry = 0
    g.carryAmt = 0
  }
  if (g.carry && g.carryAmt > 0) {
    const own = g.project >= 0 ? projectById(c, g.project) : undefined
    const list = own ? [own, ...c.projects] : c.projects
    for (const p of list) {
      if (p.done) continue
      const i = nextStep(w, p, g)
      if (i >= 0 && p.steps[i].r === g.carry && g.carryAmt >= p.steps[i].c) {
        if (startBuild(w, g, p, i)) return
        break
      }
    }
    if (startStock(w, g, "deposit")) return
  }
  // 2. Work on a project
  let p = g.project >= 0 ? projectById(c, g.project) : undefined
  if (!p || p.done) {
    g.project = -1
    p = assignProject(w, g)
  }
  if (p) {
    const i = nextStep(w, p, g)
    if (i < 0) {
      leaveProject(c, g)
    } else {
      const s = p.steps[i]
      if (s.r === R_NONE || (g.carry === s.r && g.carryAmt >= s.c)) {
        if (startBuild(w, g, p, i)) return
        leaveProject(c, g)
        g.wait = 15
        return
      }
      if (g.carry && g.carry !== s.r) {
        // swap: drop what we have into the stockpile (and maybe pick up)
        if (startStock(w, g, "deposit")) return
      }
      const need = remainingNeed(p, s.r)
      if (c.stock[s.r] >= Math.min(need, 40) && startStock(w, g, "withdraw", s.r, need)) return
      if (s.r === R_WOOD && startChop(w, g)) return
      if (s.r === R_STONE && startQuarry(w, g)) return
      p.starved = w.tick + 600
      leaveProject(c, g)
    }
  }
  // 3. Nothing to build: keep the forest and the woodpile going, or take a break
  let mature = 0,
    near = 0
  for (const t of w.trees) {
    if (
      !w.nav.isSafe(t.y * w.W + t.x) &&
      !w.nav.isSafe(t.y * w.W + t.x + 1) &&
      !w.nav.isSafe(t.y * w.W + t.x - 1)
    )
      continue
    near++
    if (isMature(t)) mature++
  }
  const cap = Math.max(6, Math.floor(w.W / 7))
  const hungry = c.projects.some((p) => !p.done && p.starved > w.tick)
  if (
    near < Math.max(10, w.W / 14) &&
    w.trees.length < cap &&
    w.rng.chance(hungry ? 0.8 : 0.4) &&
    startPlant(w, g)
  )
    return
  if (c.stock[R_WOOD] < 250 && mature >= 3 && w.rng.chance(0.5) && startChop(w, g)) return
  if (w.rng.chance(0.25) && startRelax(w, g)) return
  startWander(w, g)
}

function leaveProject(c: Colony, g: Guy) {
  const p = g.project >= 0 ? projectById(c, g.project) : undefined
  if (p) p.workers = Math.max(0, p.workers - 1)
  g.project = -1
}

function assignProject(w: World, g: Guy): Project | undefined {
  const c = w.colony
  let best: Project | undefined
  let bestScore = -Infinity
  for (const p of c.projects) {
    if (p.done || p.starved > w.tick) continue
    // big jobs soak up a bigger crew
    const big = p.kind === "tower" || p.kind === "raise" || p.kind === "mine"
    const room = (big ? Math.min(6, p.want + Math.floor(w.guys.length / 10)) : p.want) - p.workers
    const dist = Math.abs(p.x - g.x) + Math.abs(p.y - g.y) * 0.5
    const score = room * 40 - dist * 0.2 - p.fails * 3 + (p.kind === "furnish" ? -10 : 0)
    if (room <= 0 && p.workers > 0) continue
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  if (best) {
    best.workers++
    g.project = best.id
  }
  return best
}

function startBuild(w: World, g: Guy, p: Project, i: number): boolean {
  const s = p.steps[i]
  if (inReach(g, s) && standable(w, Math.round(g.x), Math.round(g.y))) {
    setPath(g, [])
  } else {
    markReach(w, s)
    if (!go(w, g)) {
      // only blame the step if this guy can otherwise get around
      // Only blame the step if it's the first unbuilt one (later steps often just
      // need the floor below them first) and this guy can otherwise get around.
      // (a stale safe map might be to blame, so those failures count for less)
      if (i === p.cursor) {
        if (w.tick - w.colony.safeT <= 5) s.tries++
        else {
          s.tries += 0.25
          w.colony.safeDirty = true
        }
      }
      p.fails++
      g.wait = 40
      return false
    }
  }
  s.claim = g.id
  g.job = { kind: "build", p: p.id, s: i, phase: "go", t: 0 }
  if (g.project !== p.id) {
    leaveProject(w.colony, g)
    g.project = p.id
    p.workers++
  }
  return true
}

function workBuild(w: World, g: Guy) {
  const c = w.colony
  const j = g.job!
  const p = projectById(c, j.p)
  if (!p || p.done) return endJob(w, g)
  const s = p.steps[j.s]
  if (!s || s.done) return endJob(w, g)
  g.act = s.L === L_CLEAR ? ACT_MINE : s.L === L_FELL ? ACT_CHOP : ACT_HAMMER
  g.dir = s.x > g.x ? 1 : s.x < g.x ? -1 : g.dir
  g.actT++
  if (g.actT < stepDuration(s)) return
  const res = applyStep(w, g, s)
  if (res === "need") {
    s.claim = 0
    return endJob(w, g)
  }
  if (res === "wait") {
    g.actT = 0
    s.tries += 0.05
    if (s.tries > 3) s.done = true
    return
  }
  s.done = true
  s.claim = 0
  if (res === "ok") {
    c.stats.placed++
    p.progress = w.tick
    p.failMark = p.fails
    if (s.L !== L_BG) c.safeDirty = true
  }
  // keep going while the next step is in reach and affordable
  const n = nextStep(w, p, g)
  if (n >= 0) {
    const ns = p.steps[n]
    const afford = ns.r === R_NONE || (g.carry === ns.r && g.carryAmt >= ns.c)
    if (afford && inReach(g, ns)) {
      ns.claim = g.id
      j.s = n
      g.actT = 0
      return
    }
  }
  endJob(w, g)
}

function applyStep(w: World, g: Guy, s: Step): "ok" | "skip" | "wait" | "need" {
  const c = w.colony
  const k = s.y * w.W + s.x
  if (!w.inBounds(s.x, s.y)) return "skip"
  const pay = () => {
    if (s.r !== R_NONE) {
      g.carryAmt -= s.c
      if (g.carryAmt <= 0) {
        g.carryAmt = 0
        g.carry = 0
      }
    }
  }
  const affordable = () => s.r === R_NONE || (g.carry === s.r && g.carryAmt >= s.c)
  // closing up a hatch: wait for everyone up there to come down first
  if (s.seal) {
    const [x0, y0, x1, y1] = s.seal
    for (const o of w.guys) {
      if (o.mode !== "dead" && o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) {
        s.tries -= 0.04 // waiting on people is mostly not the step's fault
        return "wait"
      }
    }
  }
  switch (s.L) {
    case L_FG: {
      const cur = w.grid[k]
      if (cur === s.t) return "skip"
      if (cur === TEXT || w.noBuild[k] || BUILT[cur]) {
        return "skip"
      }
      if (!affordable()) return "need"
      if (SOLID[s.t] && overlapsGuy(w, s.x, s.y)) return "wait"
      // ground that's still to be dug out (by whoever's on the step before this one)
      if (SOLID[cur]) return "wait"
      // never cap somebody else's ladder or rope: leave a gap for it instead
      if (SOLID[s.t]) {
        for (let d = 1; d <= 8; d++) {
          const kk = k + d * w.W
          if (kk < w.grid.length && CLIMB[w.grid[kk]] && w.reserved[kk] !== w.reserved[k])
            return "skip"
        }
      }
      w.grid[k] = s.t
      pay()
      return "ok"
    }
    case L_BG: {
      const cur = w.bg[k]
      if (cur === s.t || BUILT_BG[cur] || w.noBuild[k]) {
        return "skip"
      }
      if (!affordable()) return "need"
      w.bg[k] = s.t
      pay()
      return "ok"
    }
    case L_CLEAR: {
      const cur = w.grid[k]
      if (cur === TEXT) return "skip"
      if (BUILT[cur]) c.stock[cur === STONEBLOCK || cur === BRICKWORK ? R_STONE : R_WOOD] += 5
      // stone dug out of the ground is hauled up for building
      else if (QUARRY[cur]) c.stock[R_STONE] += 12
      dig(w, s.x, s.y)
      return "ok"
    }
    case L_CLEARBG: {
      if (BUILT_BG[w.bg[k]]) c.stock[R_WOOD] += 1
      w.bg[k] = EMPTY
      return "ok"
    }
    case L_FELL: {
      const t = treeAt(w, s.x, s.y)
      if (!t) return "skip"
      const wood = fellTree(w, t, t.x >= g.x ? 1 : -1)
      c.stats.felled++
      giveWood(w, g, wood)
      return "ok"
    }
    case L_FURN: {
      if (!affordable()) return "need"
      c.furniture.push({
        x: s.x,
        y: s.y,
        kind: s.t,
        variant: s.v ?? 0,
        flip: !!s.flip,
        room: s.room ?? -1,
      })
      pay()
      return "ok"
    }
  }
  return "skip"
}

// Remove a cell; natural ground leaves a darker back wall behind, like a tunnel
export function dig(w: World, x: number, y: number) {
  if (!w.inBounds(x, y)) return
  const k = y * w.W + x
  const c = w.grid[k]
  w.grid[k] = EMPTY
  if (w.bg[k] === EMPTY && !BUILT[c] && SOLID[c] && c !== TEXT) {
    let open = 0
    for (let i = 1; i <= 3; i++)
      if (w.get(x, y - i) === EMPTY && w.getBg(x, y - i) === EMPTY) open++
    const deep = y - Math.min(surfaceAt(w, x - 1), surfaceAt(w, x + 1)) > 3
    if (open < 3 || deep) w.bg[k] = QUARRY[c] ? ROCK_WALL : DIRT_WALL
  }
}

function giveWood(w: World, g: Guy, wood: number) {
  if (g.carry === R_STONE) {
    w.colony.stock[R_STONE] += g.carryAmt
    g.carryAmt = 0
  }
  g.carry = R_WOOD
  g.carryAmt = Math.min(CARRY_MAX, g.carryAmt + wood)
}

// Stranded somewhere they can't walk back from: find the nearest ledge that leads
// home, walk to the foot of the wall under it, and climb a rope ladder up to it.
function workEscape(w: World, g: Guy) {
  const j = g.job!
  const c = w.colony
  if (!pathDone(g)) {
    if (g.stuck > 240) setPath(g, [])
    return
  }
  const cx = Math.round(g.x),
    cy = Math.round(g.y)
  const here = startNode(w, g)
  if (here >= 0 && w.nav.isSafe(here)) return endJob(w, g)
  const giveUp = () => {
    // hopeless: they find their own way home off-screen
    const k = homeNode(w)
    if (k >= 0) {
      g.x = k % w.W
      g.y = Math.floor(k / w.W)
      g.mode = "fall"
    }
    endJob(w, g, 60)
  }
  const walkTo = (x: number, y: number, dx: number) => {
    w.nav.beginGoals()
    w.nav.markBox(x, y, dx, -1, 1, 0)
    const s = startNode(w, g)
    const path = s >= 0 ? w.nav.search(w, s, 20000, true, false) : null
    c.budget -= w.nav.expanded
    if (path) setPath(g, path)
    return !!path
  }
  if (j.tx === undefined && j.down === undefined) {
    // nearest safe ledge above us, with a clear column beside it to hang a ladder
    let best = -1,
      bd = 1e9
    for (let y = Math.max(2, cy - 45); y <= cy; y++) {
      for (let x = Math.max(2, cx - 60); x <= Math.min(w.W - 3, cx + 60); x++) {
        const k = y * w.W + x
        if (!w.nav.isSafe(k) || !standable(w, x, y)) continue
        const d = Math.abs(x - cx) + (cy - y) * 0.6
        if (d < bd) {
          bd = d
          best = k
        }
      }
    }
    let up = best >= 0
    let tx = 0,
      ty = 0,
      lx = 0,
      by = 0
    if (up) {
      tx = best % w.W
      ty = Math.floor(best / w.W)
      lx = tx + (tx > cx ? -1 : 1)
      by = ty
      while (by < w.H - 1 && !w.isSolid(lx, by + 1) && by - ty < 50) by++
      up = !(by - ty >= 50 || w.isSolid(lx, ty) || w.noBuild[ty * w.W + lx])
    }
    if (up) {
      j.tx = tx
      j.ty = ty
      j.lx = lx
      // walk to the foot of where the ladder goes (its own column if we can)
      if (!(cx === lx && cy === by) && !walkTo(lx, by, 0) && !walkTo(lx, by, 1)) return giveUp()
      return
    }
    // stuck up high (a roof, a ledge) with nothing safe above: let a rope down instead
    const down = ropeDown(w, g)
    if (down) {
      j.down = down
      if (!(cx === down[0] && cy === down[1]) && !walkTo(down[0], down[1], 0)) return giveUp()
      return
    }
    // walled in by a bit of earth: tunnel through to safe ground alongside
    const tun = tunnelOut(w, cx, cy)
    if (!tun) return giveUp()
    j.tunnel = tun
    j.n = 0
    return
  }
  g.act = j.tunnel ? ACT_MINE : ACT_HAMMER
  g.actT++
  if (g.actT % 10 !== 0) return
  if (j.tunnel) {
    // dig a column a time, from where we stand to the far side
    const [dir, x1, y0, y1] = j.tunnel
    const x = cx + dir * (j.n + 1)
    if ((dir > 0 && x > x1) || (dir < 0 && x < x1)) {
      c.safeDirty = true
      return endJob(w, g, 10)
    }
    for (let y = y0; y <= y1; y++) if (w.isSolid(x, y)) dig(w, x, y)
    j.n++
    return
  }
  if (j.down) {
    // pay the rope out from the edge, a rung at a time, then climb down it
    const [px, py, rx, sy, dir] = j.down
    if (cx !== px || cy !== py) return giveUp()
    j.n++
    const y = py + j.n - 1
    if (y <= sy) {
      for (let i = 0; i < 3; i++) {
        const x = rx + dir * i
        if (w.get(x, y) === EMPTY) w.set(x, y, i === 1 ? RUNG : LADDER)
      }
      return
    }
    c.safeDirty = true
    endJob(w, g, 10)
    return
  }
  // at the top: step off onto the ledge (and if that keeps failing, pick another)
  if (cy <= j.ty) {
    j.tops = (j.tops ?? 0) + 1
    if (j.tops > 4 || !standable(w, j.tx, j.ty)) {
      if ((j.retries = (j.retries ?? 0) + 1) > 3) return giveUp()
      j.tx = undefined
      j.tops = 0
      return
    }
    setPath(g, [j.ty * w.W + j.tx])
    if (cy > j.ty) g.mode = "hop"
    c.safeDirty = true
    return
  }
  j.n++
  // ended up a column over from where we meant to start: hang it here instead
  if (j.n === 1 && cx !== j.lx && Math.abs(cx - j.lx) === 1 && cx !== j.tx) j.lx = cx
  if (j.n > 70 || cx !== j.lx) return giveUp()
  for (let i = 1; i <= BODY_TOP; i++) {
    const v = w.get(cx, cy - i)
    if (v === TEXT || BUILT[v]) return giveUp()
    if (SOLID[v]) dig(w, cx, cy - i)
  }
  // a proper ladder: this column and two more on the side away from the ledge
  const away = j.tx > cx ? -1 : 1
  for (const y of [cy, cy - 1]) {
    for (let i = 0; i < 3; i++) {
      const x = cx + away * i
      const v = w.get(x, y)
      if (i > 0 && SOLID[v] && !BUILT[v] && v !== TEXT && !w.noBuild[y * w.W + x]) dig(w, x, y)
      if (w.get(x, y) === EMPTY && !w.noBuild[y * w.W + x]) w.set(x, y, i === 1 ? RUNG : LADDER)
    }
  }
  setPath(g, [(cy - 1) * w.W + cx])
}

// A short straight tunnel through natural ground to a safe spot at about our height:
// [direction, far column, top row, bottom row] of what has to be dug
function tunnelOut(w: World, cx: number, cy: number): number[] | null {
  let best: number[] | null = null,
    bd = 1e9
  for (const dir of [-1, 1]) {
    for (let d = 1; d <= 10; d++) {
      const x = cx + dir * d
      for (let y = cy - 2; y <= cy + 2; y++) {
        if (!standable(w, x, y) || !w.nav.isSafe(y * w.W + x)) continue
        const y0 = Math.min(cy, y) - BODY_TOP + 1,
          y1 = Math.max(cy, y)
        let dug = 0,
          ok = true
        for (let xx = cx + dir; xx !== x + dir && ok; xx += dir) {
          for (let yy = y0; yy <= y1; yy++) {
            const k = yy * w.W + xx
            const v = w.get(xx, yy)
            if (v === EMPTY) continue
            if (!SOLID[v] || BUILT[v] || v === TEXT || w.noBuild[k] || w.reserved[k]) ok = false
            else dug++
          }
        }
        const cost = dug + d
        if (ok && cost < bd) {
          bd = cost
          best = [dir, x - dir, y0, y1]
        }
      }
    }
  }
  return best
}

// From somewhere we can walk to, an edge with a clear drop beside it down to safe
// ground: [edge x, edge y, rope column, row the rope reaches down to]
function ropeDown(w: World, g: Guy): number[] | null {
  const s = startNode(w, g)
  if (s < 0) return null
  const nav = w.nav
  nav.search(w, s, 3000, false, false)
  w.colony.budget -= nav.expanded
  const W = w.W
  let best: number[] | null = null,
    bd = 1e9
  for (const k of nav.visited) {
    const x = k % W,
      y = (k - x) / W
    for (const dir of [-1, 1]) {
      const rx = x + dir
      if (rx < 3 || rx >= W - 3 || rx + 2 * dir < 3 || rx + 2 * dir >= W - 3) continue
      let yy = y
      let ok = true
      while (yy < w.H - 1 && yy - y < 60) {
        const kk = yy * W + rx
        const v = w.grid[kk]
        if (v !== EMPTY) break
        if (w.noBuild[kk] || (w.reserved[kk] && w.reserved[kk] !== 65534)) {
          ok = false
          break
        }
        yy++
      }
      // the ladder hangs to just above whatever it reaches, which must be safe ground
      const foot = yy - 1
      if (!ok || foot <= y || !w.isSolid(rx, yy)) continue
      if (!standable(w, rx, foot) || !nav.isSafe(foot * W + rx)) continue
      for (let i = 1; i < 8; i++) if (w.isSolid(rx, y - i)) ok = false
      // and it's a full ladder's width of open air
      for (let yy2 = y; yy2 <= foot && ok; yy2++)
        for (let i = 1; i < 3; i++) {
          const kk = yy2 * W + rx + dir * i
          if (w.grid[kk] !== EMPTY || w.noBuild[kk] || (w.reserved[kk] && w.reserved[kk] !== 65534))
            ok = false
        }
      if (!ok) continue
      const d = foot - y + Math.abs(x - g.x)
      if (d < bd) {
        bd = d
        best = [x, y, rx, foot, dir]
      }
    }
  }
  return best
}

const MAX_STEP_UP = 7
const BODY_TOP = 8

// --- Gathering ---
function startChop(w: World, g: Guy): boolean {
  const nav = w.nav
  nav.beginGoals()
  let any = false
  for (const t of w.trees) {
    if (!isMature(t) || t.claim) continue
    nav.markBox(t.x, t.y, 2, -2, 2, t.id)
    any = true
  }
  if (!any || !go(w, g)) return false
  const t = w.trees.find((tr) => tr.id === nav.lastGoalId)
  if (!t) return false
  t.claim = g.id
  g.job = { kind: "chop", tree: t.id, phase: "go", t: 0 }
  return true
}

function workChop(w: World, g: Guy) {
  const j = g.job!
  const t = w.trees.find((tr) => tr.id === j.tree)
  if (!t) return endJob(w, g)
  g.act = ACT_CHOP
  g.dir = t.x >= g.x ? 1 : -1
  g.actT++
  if (g.actT < 50) return
  const wood = fellTree(w, t, t.x >= g.x ? 1 : -1)
  w.colony.stats.felled++
  giveWood(w, g, wood)
  // good foresters replant what they fell
  if (w.rng.chance(0.85) && canPlant(w, t.x, t.y, 3)) plantTree(w, t.x, t.y, 1)
  endJob(w, g)
}

function refreshQuarry(w: World) {
  const c = w.colony
  c.quarryT = w.tick + 900
  const { W, H, grid, bg } = w
  const list: number[] = []
  const top = new Int16Array(W)
  for (let x = 0; x < W; x++) top[x] = surfaceAt(w, x)
  for (let y = 4; y < H - 2; y++) {
    for (let x = 3; x < W - 3; x++) {
      const k = y * W + x
      if (!QUARRY[grid[k]] || w.noBuild[k] || w.reserved[k]) continue
      // open pits in hillsides, not mine shafts
      if (y - Math.min(top[x - 1], top[x], top[x + 1]) > 6) continue
      const up = grid[k - W]
      if (up !== EMPTY && !QUARRY[up]) continue
      if (grid[k - 1] === WATER || grid[k + 1] === WATER || up === WATER) continue
      if (bg[k - W] === TREE || bg[k - W] === BIRCH || BUILT[up]) continue
      if (grid[k - W] === EMPTY || grid[k - 1] === EMPTY || grid[k + 1] === EMPTY) list.push(k)
    }
  }
  c.quarry = list
}

function startQuarry(w: World, g: Guy): boolean {
  const c = w.colony
  if (w.tick >= c.quarryT) refreshQuarry(w)
  if (c.quarry.length === 0) return false
  const nav = w.nav
  nav.beginGoals()
  for (const k of c.quarry) {
    const x = k % w.W,
      y = (k - x) / w.W
    if (QUARRY[w.grid[k]]) nav.markBox(x, y, 3, -3, 6, k)
  }
  if (!go(w, g)) return false
  g.job = { kind: "quarry", phase: "go", t: 0 }
  return true
}

function workQuarry(w: World, g: Guy) {
  g.act = ACT_MINE
  g.actT++
  if (g.actT % 24 !== 0) return
  const gx = Math.round(g.x),
    gy = Math.round(g.y)
  // nearest stone in reach, not under anything built or a tree
  let best = -1,
    bd = 1e9
  for (let y = gy - 6; y <= gy + 3; y++) {
    for (let x = gx - 3; x <= gx + 3; x++) {
      if (!w.inBounds(x, y)) continue
      const k = y * w.W + x
      if (!QUARRY[w.grid[k]] || w.reserved[k] || w.noBuild[k]) continue
      if (Math.abs(x - gx) <= 1 && y >= gy - 8 && y <= gy) continue
      if (y > gy + 1) continue // don't dig down under ourselves
      const up = w.get(x, y - 1)
      if (BUILT[up] || up === WATER || w.getBg(x, y - 1) === TREE) continue
      if (w.get(x - 1, y) === WATER || w.get(x + 1, y) === WATER) continue
      const d = Math.abs(x - gx) + Math.abs(y - gy)
      if (d < bd) {
        bd = d
        best = k
      }
    }
  }
  if (best < 0 || g.carryAmt >= 80) {
    if (g.carryAmt === 0) w.colony.quarryT = 0
    return endJob(w, g)
  }
  g.dir = best % w.W >= gx ? 1 : -1
  dig(w, best % w.W, Math.floor(best / w.W))
  if (g.carry !== R_STONE) {
    if (g.carry === R_WOOD) w.colony.stock[R_WOOD] += g.carryAmt
    g.carry = R_STONE
    g.carryAmt = 0
  }
  g.carryAmt += 10
}

// The stores: the main stockpile at home, a smaller one at the head of every finished
// mine shaft, and the ground floor of every finished tower. They share one stock, so
// a guy just uses the nearest.
export function depots(c: Colony): number[][] {
  return [[c.homeX, c.homeY], ...c.nests.map((n) => [n.lx - 3, n.s - 1])]
}

function startStock(w: World, g: Guy, mode: "deposit" | "withdraw", r = 0, need = 0): boolean {
  const c = w.colony
  w.nav.beginGoals()
  w.nav.markBox(c.homeX, c.homeY, 4, -3, 3, 0)
  for (const n of c.nests) w.nav.markBox(n.lx - 3, n.s - 1, 2, -2, 2, 0)
  for (const t of c.towers)
    if (t.complete) w.nav.markBox((t.x0 + t.x1) >> 1, t.base - 1, ((t.x1 - t.x0) >> 1) - 1, 0, 0, 0)
  if (!go(w, g)) return false
  g.job = { kind: "stock", mode, r, need, phase: "go", t: 0 }
  return true
}

function workStock(w: World, g: Guy) {
  const c = w.colony
  const j = g.job!
  if (j.mode === "deposit") {
    if (g.carry) c.stock[g.carry] += g.carryAmt
    g.carry = 0
    g.carryAmt = 0
  } else {
    const take = Math.min(c.stock[j.r], Math.max(100, Math.min(j.need, CARRY_MAX)))
    if (take > 0) {
      if (g.carry && g.carry !== j.r) c.stock[g.carry] += g.carryAmt
      if (g.carry !== j.r) g.carryAmt = 0
      g.carry = j.r
      g.carryAmt += take
      c.stock[j.r] -= take
    }
  }
  endJob(w, g, 5)
}

function startPlant(w: World, g: Guy): boolean {
  const c = w.colony
  const nav = w.nav
  nav.beginGoals()
  let any = false
  const x0 = Math.max(3, c.homeX - 90),
    x1 = Math.min(w.W - 4, c.homeX + 90)
  for (let x = x0; x <= x1; x += 2) {
    for (let y = Math.max(8, c.homeY - 40); y < Math.min(w.H - 1, c.homeY + 30); y++) {
      if (canPlant(w, x, y, 4)) {
        nav.markGoal(x, y, y * w.W + x)
        any = true
      }
    }
  }
  if (!any || !go(w, g, 20000)) return false
  g.job = { kind: "plant", spot: nav.lastGoalId, phase: "go", t: 0 }
  return true
}

function workPlant(w: World, g: Guy) {
  const j = g.job!
  g.act = ACT_PLANT
  g.actT++
  if (g.actT < 30) return
  const x = j.spot % w.W,
    y = (j.spot - x) / w.W
  if (canPlant(w, x, y, 4)) plantTree(w, x, y, 1)
  endJob(w, g, 20)
}

function startRelax(w: World, g: Guy): boolean {
  const c = w.colony
  const nav = w.nav
  nav.beginGoals()
  let any = false
  for (let i = 0; i < c.furniture.length; i++) {
    const f = c.furniture[i]
    if (!FURN[f.kind].seat) continue
    if (w.guys.some((o) => o.job && o.job.kind === "relax" && o.job.f === i)) continue
    const sx =
      f.x + (f.kind === F_WORKBENCH ? 0 : 1) + (FURN[f.kind].name === "sofa" ? 1 + w.rng.int(3) : 0)
    nav.markGoal(sx, f.y, i)
    any = true
  }
  if (!any || !go(w, g, 6000)) return false
  const f = c.furniture[nav.lastGoalId]
  g.job = {
    kind: "relax",
    f: nav.lastGoalId,
    dir: f.flip ? -1 : 1,
    dur: 200 + w.rng.int(300),
    phase: "go",
    t: 0,
  }
  return true
}

function startWander(w: World, g: Guy) {
  const s = startNode(w, g)
  if (s < 0) {
    g.wait = 30
    return
  }
  w.nav.beginGoals()
  w.nav.search(w, s, 220, false, !inWater(w, s))
  w.colony.budget -= 300
  let v = w.nav.visited.filter((n) => w.grid[n] !== WATER)
  const wet = v.length < 2
  if (wet) {
    // out in the middle of a lake: swim for the nearest shore
    w.nav.search(w, s, 4000, false, false)
    w.colony.budget -= w.nav.expanded
    const shore = w.nav.visited.find((n) => w.grid[n] !== WATER)
    v = shore !== undefined ? [shore, shore] : []
  }
  if (v.length < 2) {
    g.lost += 3
    g.wait = 20
    return
  }
  // drift back toward home if we've wandered far
  let pick = v[w.rng.int(v.length)]
  const c = w.colony
  if (Math.abs(g.x - c.homeX) > 60) {
    let best = pick,
      bd = 1e9
    for (let i = 0; i < 12; i++) {
      const n = v[w.rng.int(v.length)]
      const d = Math.abs((n % w.W) - c.homeX)
      if (d < bd) {
        bd = d
        best = n
      }
    }
    pick = best
  }
  w.nav.beginGoals()
  w.nav.markGoal(pick % w.W, Math.floor(pick / w.W), 0)
  if (!go(w, g, wet ? 5000 : 400)) {
    g.wait = 40
    return
  }
  g.job = { kind: "wander", phase: "go", t: 0 }
}

// --- Immigration: furniture makes the place attractive ---
export function popCap(w: World): number {
  const c = w.colony
  let score = 0
  for (const f of c.furniture) score += FURN[f.kind].name === "bed" ? 2 : 1
  const max = Math.max(c.startPop + 6, Math.min(44, Math.floor((w.W * w.H) / 3800)))
  return Math.min(max, c.startPop + Math.floor(score / 2))
}

function immigrate(w: World) {
  const c = w.colony
  c.immT = w.tick + 400
  const alive = w.guys.filter((g) => g.mode !== "dead").length
  if (alive >= popCap(w)) return
  const sides = w.rng.chance(0.5) ? [3, w.W - 4] : [w.W - 4, 3]
  for (const x of sides) {
    let y = 2
    while (y < w.H - 1 && !standable(w, x, y)) y++
    if (y >= w.H - 1) continue
    const g = makeGuy(w, x, y)
    g.mode = "stand"
    w.nav.beginGoals()
    w.nav.markBox(c.homeX, c.homeY, 8, -6, 6, 0)
    if (!go(w, g, 30000)) continue
    g.job = { kind: "arrive", phase: "go", t: 0 }
    w.guys.push(g)
    c.stats.arrived++
    return
  }
  // nobody can walk in from the edges: they turn up at the stockpile instead
  const k = w.nav.snap(w, c.homeX, c.homeY, 30)
  if (k < 0) return
  const g = makeGuy(w, k % w.W, Math.floor(k / w.W))
  g.mode = "stand"
  w.guys.push(g)
  c.stats.arrived++
}

// --- Planning ---
function updateTier(w: World) {
  const c = w.colony
  // a dug-out nest counts as much as a tower (a level for every finished one)
  let levels = 0
  for (const n of c.nests) levels += n.levels.length
  const done = c.towers.filter((t) => t.complete).length + Math.floor(levels / 2)
  const furn = c.furniture.length
  let tier = 0
  if (done >= 1) tier = 1
  if (tier === 1 && done >= 2 && furn >= 5) tier = 2
  if (tier === 2 && done >= 3 && furn >= 14) tier = 3
  c.tier = Math.max(c.tier, tier)
}

function activeCount(c: Colony, furnish: boolean): number {
  let n = 0
  for (const p of c.projects) if (!p.done && (p.kind === "furnish") === furnish) n++
  return n
}

function plan(w: World) {
  const c = w.colony
  // projects nobody has managed to touch in ages are dropped
  for (const p of c.projects) {
    if (!p.done && (w.tick - p.progress > 15000 || (p.fails > 60 && w.tick - p.progress > 2000))) {
      // remember where that was, so the same thing isn't planned straight back
      let x0 = Infinity,
        x1 = -Infinity
      for (const st of p.steps) {
        x0 = Math.min(x0, st.x)
        x1 = Math.max(x1, st.x)
      }
      c.badSites.push([x0, x1, w.tick + 30000])
      for (const st of p.steps) if (!st.done) st.tries = 9
      completeProject(w, p)
    }
  }
  c.projects = c.projects.filter((p) => !p.done)
  c.badSites = c.badSites.filter((b) => b[2] > w.tick)
  updateTier(w)
  const alive = w.guys.filter((g) => g.mode !== "dead")
  const idle = alive.filter((g) => g.project < 0).length
  const limit = Math.max(1, Math.ceil(alive.length / 3))
  const active = activeCount(c, false)
  const building = c.projects.filter(
    (p) => !p.done && (p.kind === "tower" || p.kind === "raise"),
  ).length
  // a few big crews make visible progress; lots of tiny ones just make scaffolding
  const towerRoom = building < Math.max(1, Math.min(3, Math.ceil(alive.length / 9)))
  if ((active < limit && idle > 0) || active === 0) {
    if (c.towers.length === 0 && tryTower(w)) {
      // the first tower comes first, if there's anywhere for one
    } else {
      const options: [number, () => boolean][] = [
        [!towerRoom ? 0 : c.towers.length < Math.floor(w.W / 28) + 1 ? 3 : 0.3, () => tryTower(w)],
        [c.tier >= 1 && towerRoom ? 2 : 0, () => tryRaise(w)],
        [c.tier >= 1 ? 3 : 0, () => tryBridge(w)],
        [c.tier >= 1 ? 0.8 : 0, () => tryBalcony(w)],
        [c.ladders < Math.floor(w.W / 80) + 1 ? 0.7 : 0, () => tryCliffLadder(w)],
        [
          c.mines < 1 + Math.floor(w.W / 160) ? (c.stock[R_STONE] < 300 ? 4 : 1) : 0,
          () => tryMine(w),
        ],
        [c.gapBridges < 1 + Math.floor(w.W / 160) ? 2.5 : 0, () => tryGapBridge(w)],
        [c.nests.length ? 2 + idle : 0, () => tryTunnel(w)],
      ]
      // weighted shuffle, then take the first that works
      const order: (() => boolean)[] = []
      const pool = options.filter((o) => o[0] > 0)
      while (pool.length) {
        let total = 0
        for (const o of pool) total += o[0]
        let r = w.rng.next() * total
        let i = 0
        while (i < pool.length - 1 && r > pool[i][0]) {
          r -= pool[i][0]
          i++
        }
        order.push(pool[i][1])
        pool.splice(i, 1)
      }
      for (const f of order) if (f()) break
    }
  }
  if (
    (c.tier >= 1 || c.nests.length) &&
    activeCount(c, true) < 2 &&
    (idle > 0 || w.rng.chance(0.2))
  )
    tryFurnish(w)
}

function addProject(
  w: World,
  kind: string,
  steps: Step[],
  tower: number,
  want: number,
  data: any = null,
): Project {
  const c = w.colony
  let sx = 0,
    sy = 0
  for (const s of steps) {
    sx += s.x
    sy += s.y
  }
  const p: Project = {
    id: c.nextId++,
    kind,
    steps,
    cursor: 0,
    done: false,
    tower,
    want,
    workers: 0,
    fails: 0,
    starved: 0,
    progress: w.tick,
    x: steps.length ? sx / steps.length : c.homeX,
    y: steps.length ? sy / steps.length : c.homeY,
    data,
  }
  c.projects.push(p)
  return p
}

function completeProject(w: World, p: Project) {
  if (p.done) return
  p.done = true
  const c = w.colony
  for (const g of w.guys) if (g.project === p.id) g.project = -1
  const t = p.tower >= 0 ? towerById(c, p.tower) : undefined
  // too much of it couldn't be built: leave it as a ruin
  let skipped = 0
  for (const s of p.steps) if (s.tries > 3) skipped++
  if (skipped > p.steps.length * 0.25) {
    if (t && p.kind === "tower") {
      c.towers.splice(c.towers.indexOf(t), 1)
      // tear down whatever got built and take the wood back
      const steps: Step[] = []
      for (let i = p.steps.length - 1; i >= 0; i--) {
        const st = p.steps[i]
        if (st.L === L_FG && w.get(st.x, st.y) === st.t && BUILT[st.t])
          steps.push(mkStep(st.x, st.y, EMPTY, L_CLEAR))
        else if (st.L === L_BG && w.getBg(st.x, st.y) === st.t)
          steps.push(mkStep(st.x, st.y, EMPTY, L_CLEARBG))
      }
      for (let k = 0; k < w.reserved.length; k++) if (w.reserved[k] === t.id) w.reserved[k] = 0
      if (steps.length) addProject(w, "demolish", steps, -1, 2)
    }
    return
  }
  if ((p.kind === "tower" || p.kind === "raise") && t) {
    const from = t.stories
    t.stories = p.data.stories
    t.roofTop = p.data.roofTop
    t.complete = true
    for (let k = p.kind === "tower" ? 0 : from; k < t.stories; k++) {
      c.rooms.push({
        id: c.nextId++,
        tower: t.id,
        story: k,
        x0: t.x0 + 1,
        x1: t.x1 - 1,
        y: floorY(t, k) - 1,
      })
    }
    if (p.kind === "tower") c.stats.towers++
  } else if (p.kind === "bridge") {
    const d = p.data
    const a = towerById(c, d.a),
      b = towerById(c, d.b)
    if (a) a.doors[d.sa] = (a.doors[d.sa] ?? 0) | 2
    if (b) b.doors[d.sb] = (b.doors[d.sb] ?? 0) | 1
    c.bridges.push({ id: p.id, a: d.a, sa: d.sa, b: d.b, sb: d.sb })
  } else if (p.kind === "mine" && p.data) {
    const d = p.data
    c.nests.push({ lx: d.lx, s: d.s, b: d.b, levels: [{ y: d.b, xl: d.xl, xr: d.xr }] })
    nestRooms(w, c.nests.length - 1, d.b, d.xl, d.xr)
  } else if (p.kind === "tunnel" && p.data) {
    const d = p.data
    const n = c.nests[d.nest]
    nestRooms(w, d.nest, d.y, d.xl, d.xr)
    if (n) {
      const lv = n.levels.find((l) => l.y === d.y)
      if (lv) {
        lv.xl = Math.min(lv.xl, d.xl)
        lv.xr = Math.max(lv.xr, d.xr)
      } else n.levels.push({ y: d.y, xl: d.xl, xr: d.xr })
    }
  } else if (p.kind === "balcony" && t) {
    t.doors[p.data.story] = (t.doors[p.data.story] ?? 0) | p.data.bit
    t.balconies[p.data.story] = (t.balconies[p.data.story] ?? 0) | p.data.bit
  }
  for (const g of w.guys) if (g.project === p.id) g.project = -1
}

function pickStyle(w: World): TowerStyle {
  const r = w.rng
  const tier = w.colony.tier
  // weighted: pitched roofs read best against the sky
  const roofKinds = [ROOF_GABLE, ROOF_GABLE, ROOF_GABLE, ROOF_HIP, ROOF_HIP, ROOF_LOOKOUT]
  if (tier >= 1) roofKinds.push(ROOF_BATTLEMENT, ROOF_BATTLEMENT, ROOF_GABLE)
  if (tier >= 2) roofKinds.push(ROOF_SPIRE, ROOF_SPIRE, ROOF_SPIRE)
  if (tier >= 3) roofKinds.push(ROOF_DOME, ROOF_DOME)
  const roofKind = r.pick(roofKinds)
  const c = w.colony
  if (w.tick >= c.quarryT) refreshQuarry(w)
  const stoneOk = c.stock[R_STONE] > 150 || c.quarry.length > 20
  // a colony sitting on a pile of stone and short of wood builds in stone
  const stoneRich = c.stock[R_STONE] > 600 && c.stock[R_STONE] > c.stock[R_WOOD] * 2
  const stone =
    (tier >= 2 && stoneOk && r.chance(0.6)) || (tier >= 1 && stoneRich && r.chance(0.85))
  const brick = (tier >= 3 && stoneOk && r.chance(0.5)) || (tier >= 2 && stoneRich && r.chance(0.5))
  const woodWalls =
    tier >= 1 ? [WALL_WOOD, WALL_WOOD, WALL_PLASTER, WALL_DARK] : [WALL_WOOD, WALL_WOOD, WALL_DARK]
  const roofs = tier >= 1 ? [ROOF, ROOF, ROOF_SLATE, ROOF_GREEN] : [ROOF]
  const style: TowerStyle = {
    wall: brick ? WALL_BRICK : stone && r.chance(0.7) ? WALL_STONE : r.pick(woodWalls),
    pillar: brick ? BRICKWORK : stone ? STONEBLOCK : BEAM,
    floor: PLANK,
    roof: roofKind === ROOF_DOME ? ROOF_GREEN : r.pick(roofs),
    roofKind,
    window: tier === 0 ? r.pick([1, 1, 0, 2]) : r.pick([1, 2, 3, 2]),
    foundation: stone || brick ? STONEBLOCK : BEAM,
    solidFoundation: (stone || brick) && r.chance(0.6),
    ladder: r.pick([0, 0, 2, 1]),
    flag: tier >= 1 && r.chance(0.6) ? r.pick([BANNER_RED, BANNER_BLUE]) : 0,
    lantern: tier >= 2 || (tier >= 1 && r.chance(0.4)),
  }
  if (roofKind === ROOF_BATTLEMENT && style.pillar === BEAM && r.chance(0.5)) style.pillar = PLANK
  return style
}

// First solid (or water / text) row in a column, scanning from the top
function surfaceAt(w: World, x: number): number {
  for (let y = 0; y < w.H; y++) {
    const c = w.grid[y * w.W + x]
    if (c !== EMPTY && c !== TEXT && (SOLID[c] || c === WATER)) return y
  }
  return w.H
}

// Is a rectangle free for building? Counts terrain that would need digging.
function volumeFree(
  w: World,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  owner: number,
  dig: { n: number },
  wetOk = false,
): boolean {
  if (y0 < 0) return false
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!w.inBounds(x, y)) return false
      const k = y * w.W + x
      if (w.noBuild[k]) {
        return false
      }
      const r = w.reserved[k]
      if (r !== 0 && r !== owner) {
        return false
      }
      const c = w.grid[k]
      if (c === TEXT || (c === WATER && !wetOk)) {
        return false
      }
      if (BUILT[c] || BUILT_BG[w.bg[k]]) {
        return false
      }
      if (SOLID[c]) dig.n++
    }
  }
  return true
}

function maxFoundation(tier: number): number {
  return tier >= 2 ? 30 : 22
}

function homeNode(w: World): number {
  const c = w.colony
  return w.nav.snap(w, c.homeX, c.homeY, 8)
}

// Search from home to the goals already marked
function reachableFromHome(w: World, maxExpand = 40000): boolean {
  const s = homeNode(w)
  if (s < 0) return false
  const ok = !!w.nav.search(w, s, maxExpand, true, false)
  w.colony.budget -= w.nav.expanded
  return ok
}

// Would the finished structure wall off part of the walkable network?
function cutsNetwork(w: World, steps: Step[]): boolean {
  const c = w.colony
  const home = homeNode(w)
  if (home < 0) return false
  const before = w.nav.safeCount
  const saved: [number, number][] = []
  for (const st of steps) {
    if (st.L !== L_FG && st.L !== L_CLEAR) continue
    const k = st.y * w.W + st.x
    saved.push([k, w.grid[k]])
    w.grid[k] = st.L === L_FG ? st.t : EMPTY
  }
  w.nav.computeSafe(w, home)
  const after = w.nav.safeCount
  for (let i = saved.length - 1; i >= 0; i--) w.grid[saved[i][0]] = saved[i][1]
  w.nav.computeSafe(w, home)
  c.safeT = w.tick
  c.budget -= 6000
  return after < before * 0.9
}

// Move the stockpile somewhere better connected if the colony has outgrown it
function maybeMoveHome(w: World) {
  const c = w.colony
  const cands: [number, number][] = []
  for (const t of c.towers) if (t.complete) cands.push([(t.x0 + t.x1) >> 1, t.base - 1])
  for (let i = 1; i < 8; i++) {
    const x = Math.floor((w.W * i) / 8)
    cands.push([x, surfaceAt(w, x) - 1])
  }
  const cur = w.nav.safeCount
  let best: [number, number] | null = null,
    bestN = cur * 1.4
  for (const [x, y] of cands) {
    const k = w.nav.snap(w, x, y, 6)
    if (k < 0) continue
    w.nav.computeSafe(w, k)
    if (w.nav.safeCount > bestN) {
      bestN = w.nav.safeCount
      best = [k % w.W, Math.floor(k / w.W)]
    }
  }
  if (best) {
    for (let k = 0; k < w.reserved.length; k++) if (w.reserved[k] === 65535) w.reserved[k] = 0
    c.homeX = best[0]
    c.homeY = best[1]
  }
  w.nav.computeSafe(w, homeNode(w))
  c.safeT = w.tick
}

function tryTower(w: World): boolean {
  const c = w.colony
  const r = w.rng
  const tierMax = TIER_STORIES[c.tier]
  const cands: number[][] = []
  const widths = [13, 15, 15, 17, 17, 19, 21]
  for (let i = 0; i < 40; i++) {
    const wd = r.pick(widths)
    cands.push([3 + r.int(Math.max(1, w.W - 7 - wd)), wd])
  }
  for (const t of c.towers) {
    for (let i = 0; i < 4; i++) {
      const wd = r.pick(widths)
      const gap = 5 + r.int(20)
      cands.push([t.x1 + 1 + gap, wd], [t.x0 - gap - wd, wd])
    }
  }
  if (c.towers.length === 0) {
    for (let i = 0; i < 8; i++) {
      const wd = r.pick(widths)
      cands.push([c.homeX + (i % 2 ? 6 : -6 - wd) + r.int(10) * (i % 2 ? 1 : -1), wd])
    }
  }
  type Site = { x0: number; x1: number; base: number; n: number; score: number }
  const sites: Site[] = []
  const owner = 0
  for (const [x0, wd] of cands) {
    const x1 = x0 + wd - 1
    if (x0 < 3 || x1 > w.W - 4) continue
    if (c.badSites.some((b) => x1 + 3 >= b[0] && x0 - 3 <= b[1])) continue
    let gmin = w.H,
      gmax = 0,
      wet = 0,
      bad = false
    for (let x = x0; x <= x1; x++) {
      let s = surfaceAt(w, x)
      const v = w.get(x, s)
      if (v === TEXT || BUILT[v]) bad = true
      if (v === WATER) {
        // shallow water is fine: the tower stands on stilts down to the bed
        wet = Math.max(wet, s)
        let bed = s
        while (bed < w.H && w.get(x, bed) === WATER) bed++
        if (bed - s > 16) bad = true
        gmax = Math.max(gmax, bed)
        gmin = Math.min(gmin, s - 9) // room to swim underneath
        continue
      }
      gmin = Math.min(gmin, s)
      gmax = Math.max(gmax, s)
    }
    if (bad) {
      continue
    }
    let base = gmin - 1
    let aligned = false
    let nearGap = 1e9
    for (const t of c.towers) {
      const gap = x0 > t.x1 ? x0 - t.x1 - 1 : t.x0 - x1 - 1
      if (gap < 4) {
        bad = true
        break
      }
      nearGap = Math.min(nearGap, gap)
      if (gap <= 40 && !aligned) {
        const d = (((base - t.base) % STORY) + STORY) % STORY
        if (gmax - (base - d) - 1 <= maxFoundation(c.tier)) {
          base -= d
          aligned = true
        }
      }
    }
    if (bad) {
      continue
    }
    const depth = gmax - base - 1
    if (depth > maxFoundation(c.tier)) {
      continue
    }
    // how many stories fit?
    let n = 0
    const dig = { n: 0 }
    if (!volumeFree(w, x0, x1, base + 1, gmax - 1, owner, { n: 0 })) {
      // foundation area: allow terrain, it's only stilts
    }
    while (n < tierMax) {
      const top = base - (n + 1) * STORY - 10
      const d2 = { n: 0 }
      if (!volumeFree(w, x0, x1, top, base - n * STORY - 1, owner, d2)) break
      if (!volumeFree(w, x0 - 2, x0 - 1, top, base - n * STORY - 1, owner, d2, true)) break
      if (!volumeFree(w, x1 + 1, x1 + 2, top, base - n * STORY - 1, owner, d2, true)) break
      dig.n += d2.n
      n++
    }
    if (n < 1 || dig.n > 60) {
      continue
    }
    let trees = 0
    for (const t of w.trees)
      if (t.x >= x0 - 2 && t.x <= x1 + 2 && t.y <= base + 2 && t.y >= base - n * STORY) trees++
    const dHome = Math.abs((x0 + x1) / 2 - c.homeX)
    let score = Math.min(n, 4) * 6 - depth * 0.7 - dig.n * 0.25 - trees * 1.5 + r.next() * 5
    if (c.towers.length === 0) score -= dHome * 0.6
    else {
      score +=
        nearGap >= 5 && nearGap <= 26
          ? 10 - Math.abs(nearGap - 11) * 0.4
          : -Math.min(nearGap, 200) * 0.08
      score -= dHome * 0.04
      if (aligned) score += 5
    }
    sites.push({ x0, x1, base, n, score })
  }
  sites.sort((a, b) => b.score - a.score)
  for (const site of sites.slice(0, 4)) {
    if (!canSearch(w)) return false
    const id = c.nextId++
    const style = pickStyle(w)
    const t: Tower = {
      id,
      x0: site.x0,
      x1: site.x1,
      base: site.base,
      stories: 0,
      style,
      roofTop: site.base,
      doors: [3],
      balconies: [],
      complete: false,
      entrance: 0,
    }
    const want = c.towers.length === 0 ? Math.max(1, Math.min(3, w.guys.length)) : 3
    let stories = Math.max(
      1,
      Math.min(site.n, c.towers.length === 0 ? 2 : 2 + r.int(Math.max(1, tierMax - 1))),
    )
    let steps: Step[] | null = null
    let roofTop = site.base
    while (stories >= 1) {
      steps = towerBlueprint(w, t, stories)
      if (steps) {
        roofTop = steps.length ? Math.min(...steps.map((s) => s.y)) : site.base
        break
      }
      stories--
    }
    if (!steps) {
      continue
    }
    // can the colony walk to where building starts?
    const first = steps.find((st) => st.L === L_FG)
    if (!first) continue
    markReach(w, first)
    if (!reachableFromHome(w)) {
      continue
    }
    if (cutsNetwork(w, steps)) {
      continue
    }
    c.towers.push(t)
    reserveSteps(w, steps, id)
    addProject(w, "tower", steps, id, want, { stories, roofTop })
    return true
  }
  return false
}

function towerBlueprint(w: World, t: Tower, stories: number): Step[] | null {
  const steps: Step[] = []
  // trees standing in the footprint get felled first
  for (const tr of w.trees) {
    if (
      tr.x >= t.x0 - 2 &&
      tr.x <= t.x1 + 2 &&
      tr.y <= t.base + 3 &&
      tr.y >= t.base - stories * STORY - 10
    ) {
      steps.push(mkStep(tr.x, tr.y, EMPTY, L_FELL))
    }
  }
  // entrances: a step up is fine, a taller one gets a ladder on that side so the
  // tower never cuts the ground path in two
  const gl = surfaceAt(w, t.x0 - 2) - 1,
    gr = surfaceAt(w, t.x1 + 2) - 1
  const stepL = gl - (t.base - 1),
    stepR = gr - (t.base - 1)
  let entrances = 0
  for (const [left, step] of [
    [true, stepL],
    [false, stepR],
  ] as [boolean, number][]) {
    if (step <= 4) {
      if (step >= -4) entrances++
      continue
    }
    const lad = ladderSteps(w, left ? t.x0 - 3 : t.x1 + 1, t.base, 30)
    if (!lad) continue
    // its foot has to be somewhere the colony can walk back from, not down a hole
    const foot = lad[0]
    let footSafe = false
    for (let dx = -2; dx <= 2 && !footSafe; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (w.nav.isSafe((foot.y + dy) * w.W + foot.x + dx)) footSafe = true
    if (!footSafe) continue
    t.entrance = left ? -1 : 1
    steps.push(...lad)
    entrances++
  }
  if (entrances === 0) return null
  steps.push(...foundationSteps(w, t))
  steps.push(...shellSteps(w, t, 0, stories))
  steps.push(...orderRoof(t, stories, roofSteps(t, stories).steps))
  if (!validSteps(w, steps, t.id)) return null
  return steps
}

// A tower is busy while its shell is being built or changed
function busyTower(c: Colony, t: Tower): boolean {
  return c.projects.some((p) => !p.done && p.tower === t.id && p.kind !== "furnish")
}

function tryRaise(w: World): boolean {
  const c = w.colony
  const tierMax = TIER_STORIES[c.tier]
  const r = w.rng
  const cands = c.towers.filter((t) => t.complete && t.stories < tierMax && !busyTower(c, t))
  if (cands.length === 0) return false
  const t = r.pick(cands)
  const n = t.stories
  const add = 1 + r.int(Math.min(3, tierMax - n))
  for (let m = add; m >= 1; m--) {
    // the new volume must be clear apart from our own old roof
    const top = floorY(t, n + m) - 10
    const free = volumeFree2(w, t, t.x0 - 2, t.x1 + 2, top, floorY(t, n) - 1)
    if (!free) continue
    // take the old roof off
    const off: Step[] = []
    for (let y = t.roofTop; y < floorY(t, n); y++) {
      for (let x = t.x0 - 3; x <= t.x1 + 3; x++) {
        if (!w.inBounds(x, y) || w.reserved[y * w.W + x] !== t.id) continue
        if (BUILT[w.get(x, y)]) off.push(mkStep(x, y, EMPTY, L_CLEAR))
        if (BUILT_BG[w.getBg(x, y)]) off.push(mkStep(x, y, EMPTY, L_CLEARBG))
      }
    }
    // first open the hatch in the old ceiling and put the ladder back up through it,
    // then climb out and take the roof apart
    const steps: Step[] = []
    const lx = ladderX(t, n - 1)
    const fl = floorY(t, n - 1),
      ceil = floorY(t, n)
    for (let x = lx; x <= lx + 2; x++) {
      const v = w.get(x, ceil)
      if (v !== LADDER && v !== RUNG) steps.push(mkStep(x, ceil, EMPTY, L_CLEAR))
    }
    for (let y = fl - 1; y >= ceil; y--) {
      steps.push(mkStep(lx, y, LADDER, L_FG))
      steps.push(mkStep(lx + 1, y, RUNG, L_FG))
      steps.push(mkStep(lx + 2, y, LADDER, L_FG))
    }
    steps.push(...orderRoofRemoval(t, n, off))
    // fresh style for the new top if the colony has learned new tricks
    const nt: Tower = { ...t, style: { ...t.style } }
    if (r.chance(0.5)) {
      const s2 = pickStyle(w)
      nt.style.roofKind = s2.roofKind
      nt.style.roof = s2.roof
      nt.style.flag = s2.flag
      nt.style.lantern = s2.lantern
    }
    steps.push(...shellSteps(w, nt, n, n + m))
    const roof = roofSteps(nt, n + m)
    steps.push(...orderRoof(nt, n + m, roof.steps))
    const clearing = new Set<number>()
    for (const s of steps) if (s.L === L_CLEAR || s.L === L_CLEARBG) clearing.add(s.y * w.W + s.x)
    const check = steps.filter(
      (s) => (s.L === L_FG || s.L === L_BG) && !clearing.has(s.y * w.W + s.x),
    )
    if (!validSteps(w, check, t.id)) continue
    // don't take the roof off until there's wood for most of the new floors
    let need = 0
    for (const st of steps) if (st.r === R_WOOD) need += st.c
    if (c.stock[R_WOOD] < Math.min(need, 1500) * 0.5) {
      return false
    }
    t.style = nt.style
    reserveSteps(w, steps, t.id)
    addProject(w, "raise", steps, t.id, 3, { stories: n + m, roofTop: roof.top })
    return true
  }
  return false
}

function volumeFree2(w: World, t: Tower, x0: number, x1: number, y0: number, y1: number): boolean {
  for (let y = Math.max(0, y0); y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!w.inBounds(x, y)) return false
      const k = y * w.W + x
      if (w.noBuild[k]) return false
      const r = w.reserved[k]
      if (r !== 0 && r !== t.id) return false
      const c = w.grid[k]
      if (c === TEXT || c === WATER) return false
      if (r !== t.id && (BUILT[c] || BUILT_BG[w.bg[k]])) return false
    }
  }
  return y0 >= 0
}

function tryBridge(w: World): boolean {
  const c = w.colony
  const r = w.rng
  // a tower getting extra floors on top can still take a bridge lower down
  const towers = c.towers.filter((t) => t.complete && t.stories >= 2).sort((a, b) => a.x0 - b.x0)
  type Cand = { a: Tower; sa: number; b: Tower; sb: number; score: number }
  const cands: Cand[] = []
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length && j <= i + 2; j++) {
      const A = towers[i],
        B = towers[j]
      const span = B.x0 - A.x1 - 1
      if (span < 4 || span > 70) continue
      if (
        c.projects.some(
          (p) => !p.done && p.kind === "bridge" && p.data.a === A.id && p.data.b === B.id,
        )
      )
        continue
      const linked = c.bridges.filter((b) => b.a === A.id && b.b === B.id).length
      for (let sa = 0; sa < A.stories; sa++) {
        if ((A.doors[sa] ?? 0) & 2 && sa > 0) continue
        for (let sb = 0; sb < B.stories; sb++) {
          if ((B.doors[sb] ?? 0) & 1 && sb > 0) continue
          if (sa === 0 && sb === 0) continue
          const ya = floorY(A, sa),
            yb = floorY(B, sb)
          if (Math.abs(ya - yb) > Math.min(6, span / 4)) continue
          cands.push({
            a: A,
            sa,
            b: B,
            sb,
            score: (sa + sb) * 2 + r.next() * 6 - Math.abs(ya - yb) - span * 0.05 - linked * 10,
          })
        }
      }
    }
  }
  cands.sort((x, y) => y.score - x.score)
  for (const cd of cands.slice(0, 12)) {
    const { a: A, sa, b: B, sb } = cd
    const plan = bridgeSteps(w, A.x1 + 1, floorY(A, sa), B.x0 - 1, floorY(B, sb))
    if (!plan) {
      continue
    }
    const owner = 20000 + (c.nextId % 20000)
    let ok = true
    let high = 0
    for (const [x, y] of plan.deck) {
      for (let yy = y - 9; yy <= y; yy++) {
        if (!w.inBounds(x, yy)) {
          ok = false
          break
        }
        const k = yy * w.W + x
        const v = w.grid[k]
        if (w.noBuild[k] || v === TEXT || v === WATER || (v !== EMPTY && (SOLID[v] || BUILT[v]))) {
          ok = false
        }
        if (w.reserved[k] && w.reserved[k] !== owner) {
          ok = false
        }
      }
      if (surfaceAt(w, x) - y >= 6) high++
      if (!ok) break
    }
    if (!ok) continue
    if (high < plan.deck.length * 0.6) {
      continue
    }
    if (!validSteps(w, plan.steps, owner)) {
      continue
    }
    const steps: Step[] = []
    const doorway = (t: Tower, s: number, x: number) => {
      const fl = floorY(t, s)
      for (let y = fl - 1; y >= fl - 9; y--)
        if (BUILT[w.get(x, y)]) steps.push(mkStep(x, y, EMPTY, L_CLEAR))
    }
    if (!((A.doors[sa] ?? 0) & 2)) doorway(A, sa, A.x1)
    steps.push(...plan.steps)
    if (!((B.doors[sb] ?? 0) & 1)) doorway(B, sb, B.x0)
    reserveSteps(w, plan.steps, owner)
    addProject(w, "bridge", steps, -1, 2, { a: A.id, sa, b: B.id, sb })
    return true
  }
  return false
}

function tryBalcony(w: World): boolean {
  const c = w.colony
  const r = w.rng
  const towers = c.towers.filter((t) => t.complete && t.stories >= 2 && !busyTower(c, t))
  if (!towers.length) return false
  const t = r.pick(towers)
  const k = 1 + r.int(t.stories - 1)
  const side = r.chance(0.5) ? 1 : 2
  if ((t.doors[k] ?? 0) & side) return false
  const fl = floorY(t, k)
  const len = 3 + r.int(3)
  const px = side === 1 ? t.x0 : t.x1
  const dir = side === 1 ? -1 : 1
  const steps: Step[] = []
  for (let y = fl - 1; y >= fl - 9; y--)
    if (BUILT[w.get(px, y)]) steps.push(mkStep(px, y, EMPTY, L_CLEAR))
  const deck: Step[] = []
  for (let i = 1; i <= len; i++) {
    const x = px + dir * i
    deck.push(mkStep(x, fl, PLANK, L_FG))
    if (i === len) for (let y = fl - 1; y >= fl - 4; y--) deck.push(mkStep(x, y, FRAME, L_BG))
    else deck.push(mkStep(x, fl - 4, ROPE, L_BG))
  }
  const dig = { n: 0 }
  const xa = Math.min(px + dir, px + dir * len),
    xb = Math.max(px + dir, px + dir * len)
  if (!volumeFree(w, xa, xb, fl - 10, fl, 0, dig) || dig.n > 0) return false
  if (!validSteps(w, deck, t.id)) return false
  steps.push(...deck)
  reserveSteps(w, deck, t.id)
  addProject(w, "balcony", steps, t.id, 1, { story: k, bit: side })
  return true
}

function tryCliffLadder(w: World): boolean {
  const c = w.colony
  if (c.projects.some((p) => !p.done && p.kind === "ladder")) return false
  // the safe set is what the colony can already get to and back from
  const reach = { has: (k: number) => w.nav.isSafe(k) }
  const fs = new Int16Array(w.W)
  for (let x = 0; x < w.W; x++) fs[x] = surfaceAt(w, x)
  const cands: [number, number, number][] = []
  for (let x = 6; x < w.W - 6; x++) {
    for (const dir of [1, -1]) {
      const hi = x + dir
      const rise = fs[x] - fs[hi]
      if (rise < 6 || rise > 36) continue
      const lowNode = (fs[x] - 1) * w.W + (x - dir)
      const highNode = (fs[hi] - 1) * w.W + hi
      if (!reach.has(lowNode) || reach.has(highNode)) continue
      if (!standable(w, hi, fs[hi] - 1)) continue
      // something worth reaching up there?
      let flat = 0
      for (let i = 1; i <= 14; i++) if (Math.abs(fs[hi + dir * i] - fs[hi]) <= 3) flat++
      if (flat < 8) continue
      cands.push([x, dir, rise])
    }
  }
  if (!cands.length) return false
  const [x, dir] = w.rng.pick(cands)
  const lx = dir === 1 ? x - 2 : x
  const steps = ladderSteps(w, lx, fs[x + dir] - 1, 40)
  if (!steps || !validSteps(w, steps, 0)) return false
  for (const st of steps) if (w.isSolid(st.x, st.y)) return false
  c.ladders++
  reserveSteps(w, steps, 65534)
  addProject(w, "ladder", steps, -1, 1)
  return true
}

// --- Bridging gaps in the ground ---
// Spot a drop (a ravine, a pit, a lake) between two ledges at about the same height
// where the far side can't be reached, or only by a long detour or a swim, and throw
// a plank bridge across it from the near side.
function tryGapBridge(w: World): boolean {
  const c = w.colony
  if (c.projects.some((p) => !p.done && p.kind === "gapbridge")) return false
  const { W, H } = w
  const nav = w.nav
  const fs = new Int16Array(W)
  for (let x = 0; x < W; x++) fs[x] = surfaceAt(w, x)
  const free = (x: number, y: number) => {
    const k = y * W + x
    return w.inBounds(x, y) && !w.noBuild[k] && !w.reserved[k] && !SOLID[w.grid[k]]
  }
  type Gap = { xa: number; xb: number; ya: number; yb: number; score: number }
  let best: Gap | null = null
  // searches are budgeted, so each look starts somewhere new along the ground
  const x0 = 6 + w.rng.int(Math.max(1, W - 18))
  for (let i = 0; i < W - 18; i++) {
    const x = 6 + ((x0 - 6 + i) % (W - 18))
    const ya = fs[x]
    if (ya >= H - 4 || w.get(x, ya) === WATER) continue
    // the near side: a walkable edge on the safe network, with the ground dropping away
    if (!standable(w, x, ya - 1) || !nav.isSafe((ya - 1) * W + x)) continue
    if (fs[x + 1] <= ya + 3 && w.get(x + 1, fs[x + 1]) !== WATER) continue
    for (let xb = x + 6; xb <= Math.min(W - 7, x + 36); xb++) {
      const yb = fs[xb]
      if (Math.abs(yb - ya) > 3 || w.get(xb, yb) === WATER || !standable(w, xb, yb - 1)) continue
      // everything in between is well below the deck (or water), with air over it
      const deck = Math.min(ya, yb)
      let ok = true,
        wet = false,
        deep = 0
      for (let xi = x + 1; xi < xb && ok; xi++) {
        const v = w.get(xi, fs[xi])
        if (v === WATER) wet = true
        deep = Math.max(deep, fs[xi] - deck)
        if (fs[xi] <= deck + 1) ok = false
        for (let y = deck - 9; y <= deck && ok; y++) if (!free(xi, y)) ok = false
        // (and no bridge or building already just under it)
        for (let y = deck + 1; y <= deck + 8 && ok; y++)
          if (BUILT[w.get(xi, y)] || BUILT_BG[w.getBg(xi, y)]) ok = false
      }
      if (!ok || (!wet && deep < 8)) continue
      // is it worth it? the far side is cut off, or the way round is long
      nav.beginGoals()
      nav.markGoal(xb, yb - 1, 0)
      const path = nav.search(w, (ya - 1) * W + x, 6000, true, false)
      c.budget -= nav.expanded
      const span = xb - x
      const cost = path ? nav.dist[(yb - 1) * W + xb] : Infinity
      const gain = Math.min(cost, span * 20) - span * 2
      if (gain < span * 3) {
        break // the first ledge across is the one that matters; it's already easy
      }
      const score = gain - span
      if (!best || score > best.score) best = { xa: x + 1, xb: xb - 1, ya, yb, score }
      break
    }
    if (!canSearch(w)) break
  }
  if (!best) return false
  const plan = bridgeSteps(w, best.xa, best.ya, best.xb, best.yb)
  if (!plan) return false
  const id = c.nextId++
  if (!validSteps(w, plan.steps, id)) return false
  reserveSteps(w, plan.steps, id)
  c.gapBridges++
  addProject(w, "gapbridge", plan.steps, -1, 2)
  return true
}

// Stretches of finished gallery become rooms underground, to be furnished like any
// other (which brings more guys in). The shaft itself is left clear.
function nestRooms(w: World, nest: number, y: number, xl: number, xr: number) {
  const c = w.colony
  const n = c.nests[nest]
  const runs: [number, number][] = []
  let a = -1
  for (let x = xl; x <= xr + 1; x++) {
    const ok = x <= xr && (!n || x < n.lx - 1 || x > n.lx + 3) && w.get(x, y) === EMPTY
    if (ok && a < 0) a = x
    if (!ok && a >= 0) {
      runs.push([a, x - 1])
      a = -1
    }
  }
  for (const [x0, x1] of runs) {
    for (let s = x0; s + 4 <= x1; s += 14) {
      const e = Math.min(x1, s + 13)
      if (e - s < 4) continue
      c.rooms.push({ id: c.nextId++, tower: -1, story: -1, x0: s, x1: e, y })
    }
  }
}

// --- The nest: more tunnels off the mines ---
// Like an ant colony, there's always more digging to do: carry a gallery further, or
// open a new level off a shaft. Galleries are a body tall, dug only through solid
// natural ground (never breaking into caves) with solid ground over and under them,
// and propped with a timber post every few cells under a beam along the roof.
function tunnelColOk(w: World, x: number, y: number): boolean {
  const { W, H } = w
  if (x < 4 || x >= W - 4 || y + 1 >= H || y - GALLERY_H - 3 < 0) return false
  if (!SOLID[w.get(x, y + 1)]) return false
  for (let yy = y - GALLERY_H - 2; yy <= y; yy++) {
    const k = yy * W + x
    const v = w.grid[k]
    if (w.noBuild[k] || w.reserved[k] || BUILT_BG[w.bg[k]]) return false
    if (!SOLID[v] || BUILT[v] || DYNAMIC[v] || v === TEXT) return false
  }
  // nothing loose or wet overhead that would pour in
  for (let yy = 0; yy < y - GALLERY_H - 2; yy++) {
    const v = w.grid[yy * W + x]
    if (DYNAMIC[v] || v === WATER) return false
  }
  return true
}

function gallerySteps(x: number, y: number, fromShaft: number): Step[] {
  const steps: Step[] = []
  for (let yy = y; yy > y - GALLERY_H; yy--) steps.push(mkStep(x, yy, EMPTY, L_CLEAR))
  steps.push(mkStep(x, y - GALLERY_H + 1, FRAME, L_BG))
  if (fromShaft % 4 === 0)
    for (let yy = y; yy > y - GALLERY_H + 1; yy--) steps.push(mkStep(x, yy, FRAME, L_BG))
  if (fromShaft % 12 === 6) steps.push(mkStep(x, y - GALLERY_H + 3, LANTERN, L_BG))
  return steps
}

function tryTunnel(w: World): boolean {
  const c = w.colony
  // more hands, more tunnels on the go (a couple of diggers each)
  const crews = 1 + Math.floor(w.guys.length / 4)
  if (c.projects.filter((p) => !p.done && p.kind === "tunnel").length >= crews) return false
  const r = w.rng
  type Cand = { nest: number; y: number; cols: number[]; side: number; score: number }
  const cands: Cand[] = []
  const run = (x0: number, dir: number, y: number) => {
    const cols: number[] = []
    const len = 6 + r.int(8)
    for (let x = x0; cols.length < len && tunnelColOk(w, x, y); x += dir) cols.push(x)
    return cols
  }
  c.nests.forEach((n, i) => {
    // carry each gallery further
    for (const lv of n.levels) {
      for (const dir of [-1, 1]) {
        const cols = run(dir < 0 ? lv.xl - 1 : lv.xr + 1, dir, lv.y)
        if (cols.length >= 4) cands.push({ nest: i, y: lv.y, cols, side: dir, score: cols.length })
      }
    }
    // or open a new level off the shaft
    for (let y = n.b - 12; y - GALLERY_H - 2 > n.s + 2; y -= 12) {
      if (n.levels.some((l) => l.y === y)) continue
      for (const dir of [-1, 1]) {
        const cols = run(dir < 0 ? n.lx - 2 : n.lx + 4, dir, y)
        if (cols.length >= 4) cands.push({ nest: i, y, cols, side: dir, score: cols.length + 6 })
      }
    }
  })
  if (!cands.length) return false
  let total = 0
  for (const cd of cands) total += cd.score
  let pick = r.next() * total
  let cand = cands[0]
  for (const cd of cands)
    if ((pick -= cd.score) <= 0) {
      cand = cd
      break
    }
  const n = c.nests[cand.nest]
  const steps: Step[] = []
  for (const x of cand.cols) steps.push(...gallerySteps(x, cand.y, Math.abs(x - (n.lx + 1))))
  reserveSteps(w, steps, MINE)
  const xs = cand.cols
  addProject(w, "tunnel", steps, -1, 2, {
    nest: cand.nest,
    y: cand.y,
    xl: Math.min(...xs),
    xr: Math.max(...xs),
  })
  return true
}

// --- Mines ---
// A shaft down through the dirt into the stone, with a ladder down the middle and
// room either side of it, then a gallery dug out along the bottom, propped up with
// timber. Everything dug out of the stone is building stone.
const MINE = 65533
const GALLERY_H = 9

function tryMine(w: World): boolean {
  const c = w.colony
  if (c.projects.some((p) => !p.done && p.kind === "mine")) return false
  const { W, H } = w
  const r = w.rng
  const cell = (x: number, y: number) => w.grid[y * W + x]
  const free = (x: number, y: number) => {
    const k = y * W + x
    return !w.noBuild[k] && !w.reserved[k] && !BUILT[w.grid[k]] && !BUILT_BG[w.bg[k]]
  }
  // can this column hold gallery rows b-GALLERY_H+1..b with solid stone over and under?
  const galleryOk = (x: number, b: number) => {
    if (x < 4 || x >= W - 4) return false
    if (!SOLID[cell(x, b + 1)]) return false
    for (let y = b - GALLERY_H - 2; y <= b; y++) {
      const v = cell(x, y)
      if (!free(x, y)) return false
      if (y >= b - GALLERY_H + 1 && v !== EMPTY && !QUARRY[v] && !SOLID[v]) return false
      if (y < b - GALLERY_H + 1 && !QUARRY[v]) return false // a stone roof
    }
    // nothing loose or wet overhead that would pour in
    for (let y = 0; y < b; y++) if (DYNAMIC[cell(x, y)]) return false
    return true
  }
  let best: { lx: number; s: number; b: number; L: number; R: number; score: number } | null = null
  for (let i = 0; i < 60; i++) {
    const lx = Math.round(c.homeX + r.range(-80, 80))
    if (lx < 8 || lx + 2 > W - 9) continue
    const s = surfaceAt(w, lx)
    if (s >= H - 20) continue
    let ok = true
    for (let x = lx - 2; x <= lx + 4 && ok; x++) {
      if (Math.abs(surfaceAt(w, x) - s) > 1) ok = false
      for (let y = s - 9; y < s && ok; y++) if (!free(x, y) || SOLID[cell(x, y)]) ok = false
    }
    if (!ok) continue
    // the top must be on the safe network
    if (!w.nav.isSafe((s - 1) * W + lx - 2) && !w.nav.isSafe((s - 1) * W + lx + 4)) continue
    const b = H - 3
    // the shaft goes through soil and stone only
    for (let y = s; y <= b && ok; y++)
      for (let x = lx - 1; x <= lx + 3; x++) {
        const v = cell(x, y)
        if (!free(x, y) || DYNAMIC[v] || v === WATER || v === TEXT) ok = false
      }
    if (!ok || b - s < 16) continue
    if (!galleryOk(lx - 1, b) || !galleryOk(lx + 3, b)) continue
    let L = 0,
      R = 0
    // just a short starter gallery: the nest opens sooner, and it grows from there
    const maxLen = 4
    while (L < maxLen && galleryOk(lx - 2 - L, b)) L++
    while (R < maxLen && galleryOk(lx + 4 + R, b)) R++
    if (L + R < 4) continue
    // not right on top of another nest
    let apart = 200
    for (const n of c.nests) apart = Math.min(apart, Math.abs(n.lx - lx))
    if (apart < 24) continue
    const score = L + R - Math.abs(lx - c.homeX) * 0.1
    if (!best || score > best.score) best = { lx, s, b, L, R, score }
  }
  if (!best) return false
  const { lx, s, b, L, R } = best
  const steps: Step[] = []
  // clear the trees off the spot first
  for (const t of w.trees)
    if (t.x >= lx - 4 && t.x <= lx + 6 && Math.abs(t.y - s) < 4)
      steps.push(mkStep(t.x, t.y, EMPTY, L_FELL))
  // the shaft: dig out a row a cell wider than the ladder each side, then put that
  // row of ladder in, all the way down
  for (let y = s; y <= b; y++) {
    for (let x = lx - 1; x <= lx + 3; x++)
      if (cell(x, y) !== EMPTY) steps.push(mkStep(x, y, EMPTY, L_CLEAR))
    steps.push(
      mkStep(lx, y, LADDER, L_FG),
      mkStep(lx + 1, y, RUNG, L_FG),
      mkStep(lx + 2, y, LADDER, L_FG),
    )
  }
  // the gallery, a column at a time on alternating sides, with a prop every few cells
  for (let d = 1; d <= Math.max(L, R); d++) {
    for (const side of [-1, 1]) {
      if (d > (side < 0 ? L : R)) continue
      const x = side < 0 ? lx - 1 - d : lx + 3 + d
      steps.push(...gallerySteps(x, b, Math.abs(x - (lx + 1))))
    }
  }
  const kept = steps.filter((st) => w.inBounds(st.x, st.y))
  reserveSteps(w, kept, MINE)
  // keep the way in clear
  for (let y = s - 10; y < s; y++)
    for (let x = lx - 2; x <= lx + 4; x++)
      if (w.inBounds(x, y) && !w.reserved[y * W + x]) w.reserved[y * W + x] = MINE
  c.mines++
  addProject(w, "mine", kept, -1, 3, { lx, s, b, xl: lx - 1 - L, xr: lx + 3 + R })
  return true
}

// --- Furniture ---
const ROOM_WISHLIST = [
  "bed",
  "table",
  "chair",
  "chest",
  "lamp",
  "bookshelf",
  "plant",
  "painting",
  "clock",
  "sofa",
  "banner",
  "plant",
  "chair",
  "painting",
  "anvil",
]

function tryFurnish(w: World): boolean {
  const c = w.colony
  if (!c.rooms.length) return false
  const r = w.rng
  const busy = new Set(
    c.projects.filter((p) => !p.done && p.kind === "furnish").map((p) => p.data.room),
  )
  const hasBench =
    c.furniture.some((f) => f.kind === F_WORKBENCH) ||
    c.projects.some((p) => !p.done && p.kind === "furnish" && p.data.kind === F_WORKBENCH)
  const rooms = c.rooms.filter((rm) => !busy.has(rm.id))
  if (!rooms.length) return false
  // emptiest rooms first
  rooms.sort((a, b) => countIn(c, a) - countIn(c, b) + (r.next() - 0.5) * 2)
  for (const room of rooms.slice(0, 4)) {
    const t = towerById(c, room.tower) ?? null
    if (!t && room.tower >= 0) continue
    const have = c.furniture.filter((f) => f.room === room.id).map((f) => FURN[f.kind].name)
    const wish = hasBench
      ? ROOM_WISHLIST.filter((n) => {
          const def = FURN.find((d) => d.name === n)!
          if (def.tier > c.tier) return false
          const count = have.filter((h) => h === n).length
          return count === 0 || ((n === "chair" || n === "plant" || n === "painting") && count < 2)
        })
      : ["workbench"]
    for (const name of wish) {
      const kind = FURN.findIndex((d) => d.name === name)
      const slot = findSlot(w, t, room, kind)
      if (!slot) {
        continue
      }
      const def = FURN[kind]
      const st: Step = {
        x: slot.x,
        y: slot.y,
        t: kind,
        L: L_FURN,
        r: def.stone ? R_STONE : R_WOOD,
        c: def.cost,
        claim: 0,
        done: false,
        tries: 0,
        v: r.int(5),
        flip: slot.flip,
        room: room.id,
      }
      addProject(w, "furnish", [st], t ? t.id : -1, 1, { room: room.id, kind })
      return true
    }
  }
  return false
}

function countIn(c: Colony, room: Room): number {
  let n = 0
  for (const f of c.furniture) if (f.room === room.id) n++
  return n
}

function findSlot(
  w: World,
  t: Tower | null,
  room: Room,
  kind: number,
): { x: number; y: number; flip: boolean } | null {
  const c = w.colony
  const def = FURN[kind]
  const fw = furnWidth(kind),
    fh = furnHeight(kind)
  const n = room.x1 - room.x0 + 1
  const floorUse = new Uint8Array(n) // 1 = blocked, 2 = short furniture, 3 = tall
  const wallUse = new Uint8Array(n)
  const block = (x0: number, x1: number, v: number, arr: Uint8Array) => {
    for (let x = x0; x <= x1; x++)
      if (x >= room.x0 && x <= room.x1) arr[x - room.x0] = Math.max(arr[x - room.x0], v)
  }
  // ladders up from this floor (including the one a future raise would add) and the hole below
  if (t) {
    const lx = ladderX(t, room.story)
    block(lx, lx + 2, 1, floorUse)
    if (room.story > 0) {
      const bx = ladderX(t, room.story - 1)
      block(bx, bx + 2, 1, floorUse)
    }
  }
  for (const f of c.furniture) {
    if (f.room !== room.id) continue
    const d = FURN[f.kind]
    const x1 = f.x + furnWidth(f.kind) - 1
    if (d.wall) block(f.x - 1, x1 + 1, 1, wallUse)
    else block(f.x, x1, furnHeight(f.kind) > 4 ? 3 : 2, floorUse)
  }
  for (const p of c.projects) {
    if (p.done || p.kind !== "furnish" || p.data.room !== room.id) continue
    const s = p.steps[0]
    const d = FURN[s.t]
    if (d.wall) block(s.x - 1, s.x + furnWidth(s.t), 1, wallUse)
    else block(s.x, s.x + furnWidth(s.t) - 1, 3, floorUse)
  }
  const options: number[] = []
  for (let x = room.x0; x + fw - 1 <= room.x1; x++) {
    let ok = true
    for (let i = 0; i < fw && ok; i++) {
      const v = def.wall ? wallUse[x - room.x0 + i] : floorUse[x - room.x0 + i]
      if (v) ok = false
      if (def.wall && floorUse[x - room.x0 + i] === 3) ok = false
      if (def.wall) {
        for (let dy = 0; dy < fh; dy++) {
          const b = w.getBg(x + i, room.y - 4 - dy)
          if (b === GLASS || b === FRAME || !BUILT_BG[b]) ok = false
        }
      }
      if (!def.wall && fh > 4) {
        // tall things shouldn't cover windows
        for (let dy = 5; dy < fh; dy++) if (w.getBg(x + i, room.y - dy) === GLASS) ok = false
      }
    }
    if (ok) options.push(x)
  }
  if (!options.length) return null
  // chairs like to sit beside tables
  if (FURN[kind].name === "chair") {
    const table = c.furniture.find((f) => f.room === room.id && FURN[f.kind].name === "table")
    if (table) {
      if (options.includes(table.x - fw)) return { x: table.x - fw, y: room.y, flip: false }
      if (options.includes(table.x + furnWidth(table.kind)))
        return { x: table.x + furnWidth(table.kind), y: room.y, flip: true }
    }
  }
  const x = options[w.rng.int(options.length)]
  const y = def.wall ? room.y - 4 : room.y
  return { x, y, flip: x > (room.x0 + room.x1) / 2 }
}

export { solidAt }
