// Saving and restoring a whole world (grids run-length encoded, everything else as JSON).

import { World } from "./world"
import { Rng } from "./rng"
import { makeGuy, Guy } from "./guys"
import { TEXT, EMPTY } from "./cells"
import type { Colony } from "./colony"

const VERSION = 2

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
  guys: Pick<Guy, "id" | "x" | "y" | "dir" | "carry" | "carryAmt" | "hat">[]
  nextGuyId: number
  colony: Colony
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
    trees: w.trees.map((t) => ({ ...t, claim: 0 })),
    nextTreeId: w.nextTreeId,
    guys: w.guys
      .filter((g) => g.mode !== "dead")
      .map((g) => ({
        id: g.id,
        x: Math.round(g.x),
        y: Math.round(g.y),
        dir: g.dir,
        carry: g.carry,
        carryAmt: g.carryAmt,
        hat: g.hat,
      })),
    nextGuyId: w.nextGuyId,
    colony: {
      ...w.colony,
      // claims and worker counts belong to guys' in-flight jobs, which aren't saved
      projects: w.colony.projects.map((p) => ({
        ...p,
        workers: 0,
        steps: p.steps.map((s) => ({ ...s, claim: 0 })),
      })),
    },
  }
}

// Rebuild a world from a save. Text cells are re-applied by the caller.
export function loadWorld(s: SavedWorld): World | null {
  if (!s || s.v !== VERSION) return null
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
  w.colony.mines ??= 0 // saved before mines existed
  w.colony.safeT = -1000
  w.colony.safeDirty = true
  w.nextGuyId = s.nextGuyId
  for (const sg of s.guys) {
    const g = makeGuy(w, sg.x, sg.y)
    g.id = sg.id
    g.dir = sg.dir
    g.carry = sg.carry
    g.carryAmt = sg.carryAmt
    g.hat = sg.hat
    w.guys.push(g)
  }
  w.nextGuyId = s.nextGuyId
  w.rng.s = s.rng >>> 0 // making guys drew from the rng; put it back
  return w
}
