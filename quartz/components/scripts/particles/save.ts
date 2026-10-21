// Saving and restoring a whole world (grids run-length encoded, everything else as JSON).

import { World } from "./world"
import { Rng } from "./rng"
import { makeGuy, Guy } from "./guys"
import { TEXT, EMPTY } from "./cells"
import type { Colony, Project } from "./colony"
import type { Step } from "./blueprints"

// v3 saves everything the simulation runs on (guys' jobs and paths, claims, the
// safe map), so a reloaded world carries on exactly as if it had never stopped.
// Blueprint steps are packed into flat number arrays to keep saves small.
const VERSION = 3

function rle(a: ArrayLike<number>, skip = -1): number[] {
  const out: number[] = []
  let i = 0
  while (i < a.length) {
    const v = a[i] === skip ? 0 : a[i]
    let n = 1
    while (i + n < a.length && (a[i + n] === skip ? 0 : a[i + n]) === v && n < 65535) n++
    out.push(v, n)
    i += n
  }
  return out
}

function unrle(runs: number[], into: Uint8Array | Uint16Array) {
  let i = 0
  for (let r = 0; r < runs.length; r += 2) {
    into.fill(runs[r], i, i + runs[r + 1])
    i += runs[r + 1]
  }
}

export interface SavedWorld {
  v: number
  W: number
  H: number
  seed: number
  tick: number
  rng: number
  grid: number[]
  bg: number[]
  reserved: number[]
  trees: World["trees"]
  nextTreeId: number
  guys: SavedGuy[]
  nextGuyId: number
  colony: Colony
  safe?: number[] // the safe map, run-length encoded (v3)
  safeCount?: number
}

// everything about a guy but the drawing's pose
type SavedGuy = Omit<Guy, "px" | "py" | "ox" | "oy">

// x, y, t, L, r, c, claim, done, tries; then the rarer fields by step index
const STEP_FIELDS = 9
interface PackedProject extends Omit<Project, "steps"> {
  packed: number[]
  extras: Record<number, Pick<Step, "v" | "flip" | "room" | "seal" | "hold">>
}

function packSteps(p: Project): PackedProject {
  const { steps, ...rest } = p
  const packed: number[] = []
  const extras: PackedProject["extras"] = {}
  steps.forEach((st, i) => {
    packed.push(st.x, st.y, st.t, st.L, st.r, st.c, st.claim, st.done ? 1 : 0, st.tries)
    if (st.v !== undefined || st.flip !== undefined || st.room !== undefined || st.seal || st.hold)
      extras[i] = { v: st.v, flip: st.flip, room: st.room, seal: st.seal, hold: st.hold }
  })
  return { ...rest, packed, extras }
}

function unpackSteps(p: PackedProject | Project): Project {
  if (!("packed" in p)) return p // a v2 save: steps as objects
  const { packed, extras, ...rest } = p
  const steps: Step[] = []
  for (let i = 0; i < packed.length; i += STEP_FIELDS) {
    const [x, y, t, L, r, c, claim, done, tries] = packed.slice(i, i + STEP_FIELDS)
    const st: Step = { x, y, t, L, r, c, claim, done: done === 1, tries }
    const e = extras[i / STEP_FIELDS]
    if (e) {
      if (e.v !== undefined) st.v = e.v
      if (e.flip !== undefined) st.flip = e.flip
      if (e.room !== undefined) st.room = e.room
      if (e.seal) st.seal = e.seal
      if (e.hold !== undefined) st.hold = e.hold
    }
    steps.push(st)
  }
  return { ...rest, steps } as Project
}

export function saveWorld(w: World): SavedWorld {
  return {
    v: VERSION,
    W: w.W,
    H: w.H,
    seed: w.seed,
    tick: w.tick,
    rng: w.rng.s,
    grid: rle(w.grid, TEXT),
    bg: rle(w.bg),
    reserved: rle(w.reserved),
    trees: w.trees.map((t) => ({ ...t })),
    nextTreeId: w.nextTreeId,
    guys: w.guys.map(({ px, py, ox, oy, ...g }) => ({ ...g })),
    nextGuyId: w.nextGuyId,
    colony: {
      ...w.colony,
      projects: w.colony.projects.map(packSteps) as unknown as Project[],
    },
    safe: rle(Array.from(w.nav.safe, (v) => (v === w.nav.safeGen ? 1 : 0))),
    safeCount: w.nav.safeCount,
  }
}

// Rebuild a world from a save. Text cells are re-applied by the caller.
export function loadWorld(s: SavedWorld): World | null {
  if (!s || (s.v !== VERSION && s.v !== 2)) return null
  const w = new World(s.W, s.H, s.seed)
  w.tick = s.tick
  w.rng = new Rng(0)
  w.rng.s = s.rng >>> 0
  unrle(s.grid, w.grid)
  unrle(s.bg, w.bg)
  unrle(s.reserved, w.reserved)
  for (let k = 0; k < w.grid.length; k++) if (w.grid[k] === TEXT) w.grid[k] = EMPTY
  w.trees = s.trees
  w.nextTreeId = s.nextTreeId
  w.colony = s.colony
  w.colony.projects = w.colony.projects.map(unpackSteps)
  w.colony.mines ??= 0 // saved before mines existed
  w.colony.gapBridges ??= 0
  w.colony.nests ??= []
  w.colony.badSites ??= []
  w.nextGuyId = s.nextGuyId
  if (s.v === 2) {
    // only where the guys stood: they start their jobs afresh
    w.colony.safeT = -1000
    w.colony.safeDirty = true
    for (const p of w.colony.projects) {
      p.workers = 0
      for (const st of p.steps) st.claim = 0
    }
  } else if (s.safe) {
    const safe = new Uint8Array(w.W * w.H)
    unrle(s.safe, safe)
    w.nav.safe = new Uint32Array(w.W * w.H)
    w.nav.safeGen = 1
    for (let k = 0; k < safe.length; k++) if (safe[k]) w.nav.safe[k] = 1
    w.nav.safeCount = s.safeCount ?? 0
  }
  for (const sg of s.guys) {
    const g = makeGuy(w, Math.round(sg.x), Math.round(sg.y))
    if (s.v === 2) {
      g.id = sg.id
      g.dir = sg.dir
      g.carry = sg.carry
      g.carryAmt = sg.carryAmt
      g.hat = sg.hat
    } else {
      // keep the fresh pose arrays, take everything else from the save
      const { px, py, ox, oy } = g
      Object.assign(g, sg, { px, py, ox, oy })
    }
    w.guys.push(g)
  }
  w.nextGuyId = s.nextGuyId
  w.rng.s = s.rng >>> 0 // making guys drew from the rng; put it back
  return w
}
