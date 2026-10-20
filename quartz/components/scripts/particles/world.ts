// The world: grids, falling-particle physics and the slow "living" terrain processes.
// Guys, trees and the colony live in their own modules and hang off this object.

import {
  EMPTY,
  SAND,
  WATER,
  FIRE,
  SMOKE,
  MUD,
  SEED,
  GRASS,
  KILN_FIRE,
  BRICK,
  DIRT,
  TURF,
  TEXT,
  DYNAMIC,
  SOLID,
  SOIL,
  FLAMMABLE,
  BG_FLAMMABLE,
  TUFT,
  FLOWER_RED,
  FLOWER_GOLD,
  FLOWER_BLUE,
  DIRT_WALL,
  ROCK_WALL,
  TREE,
  BIRCH,
  LEAF,
  PINE,
  BLOSSOM,
  AUTUMN,
  BIRCH_LEAF,
} from "./cells"
import { Rng, Noise } from "./rng"
import { Nav } from "./nav"
import type { Guy } from "./guys"
import type { Tree } from "./trees"
import type { Colony } from "./colony"

export const CELL = 3 // screen pixels per cell
export const TEXT_MARGIN = 3 // no building within this many cells of text

export class World {
  W: number
  H: number
  seed: number
  rng: Rng
  noise: Noise
  tick = 0
  grid: Uint8Array
  bg: Uint8Array
  updated: Uint8Array
  noBuild: Uint8Array
  reserved: Uint16Array // project id that has claimed a cell for a structure (0 = none)
  textCells: Int32Array = new Int32Array(0)
  textBottom = 0 // lowest row covered by text (0 if none)
  trees: Tree[] = []
  nextTreeId = 1
  guys: Guy[] = []
  nextGuyId = 1
  colony!: Colony
  nav: Nav
  // Hooks set by the systems that own trees (avoids import cycles)
  onSprout: (w: World, x: number, y: number) => void = () => {}

  constructor(W: number, H: number, seed: number) {
    this.W = W
    this.H = H
    this.seed = seed >>> 0
    this.rng = new Rng(seed)
    this.noise = new Noise(seed)
    const n = W * H
    this.grid = new Uint8Array(n)
    this.bg = new Uint8Array(n)
    this.updated = new Uint8Array(n)
    this.noBuild = new Uint8Array(n)
    this.reserved = new Uint16Array(n)
    this.nav = new Nav(W, H)
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.W && y >= 0 && y < this.H
  }
  get(x: number, y: number): number {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return y < 0 ? EMPTY : TEXT
    return this.grid[y * this.W + x]
  }
  set(x: number, y: number, v: number) {
    if (x >= 0 && x < this.W && y >= 0 && y < this.H) this.grid[y * this.W + x] = v
  }
  getBg(x: number, y: number): number {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return EMPTY
    return this.bg[y * this.W + x]
  }
  setBg(x: number, y: number, v: number) {
    if (x >= 0 && x < this.W && y >= 0 && y < this.H) this.bg[y * this.W + x] = v
  }
  isSolid(x: number, y: number): boolean {
    return SOLID[this.get(x, y)] === 1
  }

  // Text rectangles are given in cell coordinates [x0, y0, x1, y1) and become
  // invisible solid cells. Building is kept TEXT_MARGIN cells away from them.
  setText(rects: number[][]) {
    const { W, H, grid } = this
    for (const k of this.textCells) if (grid[k] === TEXT) grid[k] = EMPTY
    const cells: number[] = []
    const mask = new Uint8Array(W * H)
    let bottom = 0
    for (const [rx0, ry0, rx1, ry1] of rects) {
      const x0 = Math.max(0, Math.floor(rx0)),
        x1 = Math.min(W, Math.ceil(rx1))
      const y0 = Math.max(0, Math.floor(ry0)),
        y1 = Math.min(H, Math.ceil(ry1))
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = y * W + x
          if (mask[k]) continue
          mask[k] = 1
          if (grid[k] === EMPTY) {
            grid[k] = TEXT
            cells.push(k)
          }
        }
      }
      if (y1 > bottom && x1 > x0) bottom = y1
    }
    this.textCells = Int32Array.from(cells)
    this.textBottom = bottom
    // Dilate: horizontal then vertical running max
    const m = TEXT_MARGIN
    const tmp = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      let last = -1e9
      for (let x = 0; x < W; x++) {
        if (mask[y * W + x]) last = x
        if (x - last <= m) tmp[y * W + x] = 1
      }
      last = 1e9
      for (let x = W - 1; x >= 0; x--) {
        if (mask[y * W + x]) last = x
        if (last - x <= m) tmp[y * W + x] = 1
      }
    }
    const nb = this.noBuild
    nb.fill(0)
    for (let x = 0; x < W; x++) {
      let last = -1e9
      for (let y = 0; y < H; y++) {
        if (tmp[y * W + x]) last = y
        if (y - last <= m) nb[y * W + x] = 1
      }
      last = 1e9
      for (let y = H - 1; y >= 0; y--) {
        if (tmp[y * W + x]) last = y
        if (last - y <= m) nb[y * W + x] = 1
      }
    }
    // Keep structures off the screen edges too
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 2; x++) {
        nb[y * W + x] = 1
        nb[y * W + W - 1 - x] = 1
      }
    }
    for (let x = 0; x < W; x++) for (let y = 0; y < 2; y++) nb[y * W + x] = 1
  }
}

// --- Falling particle physics ---
export function stepParticles(w: World) {
  const { W, H, grid, bg, rng } = w
  const upd = w.updated
  upd.fill(0)
  const at = (x: number, y: number) =>
    x < 0 || x >= W || y >= H ? TEXT : y < 0 ? EMPTY : grid[y * W + x]
  const move = (k: number, x: number, y: number, v: number) => {
    const j = y * W + x
    grid[k] = EMPTY
    grid[j] = v
    upd[j] = 1
  }

  for (let y = H - 1; y >= 0; y--) {
    const ltr = rng.next() < 0.5
    const row = y * W
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i
      const k = row + x
      const cell = grid[k]
      if (!DYNAMIC[cell] || upd[k]) continue

      if (cell === SAND || cell === MUD || cell === GRASS || cell === SEED) {
        const below = at(x, y + 1)
        if (below === EMPTY) {
          move(k, x, y + 1, cell)
        } else if (below === WATER && cell !== SEED) {
          grid[k] = WATER
          grid[k + W] = cell
          upd[k + W] = 1
          upd[k] = 1
        } else {
          const d = rng.next() < 0.5 ? -1 : 1
          if (at(x + d, y + 1) === EMPTY) move(k, x + d, y + 1, cell)
          else if (at(x - d, y + 1) === EMPTY) move(k, x - d, y + 1, cell)
          else if (cell === SEED) {
            // Landed seed: sprouts on soil, faster with water nearby
            let wet = false
            for (let j = 0; j < 4; j++) {
              const nx = x + (j === 0 ? -1 : j === 1 ? 1 : 0),
                ny = y + (j === 2 ? -1 : j === 3 ? 1 : 0)
              if (at(nx, ny) === WATER) {
                wet = true
                if (rng.next() < 0.4) grid[ny * W + nx] = EMPTY
                break
              }
            }
            if ((SOIL[below] || below === SAND) && (wet || rng.next() < 0.004)) {
              grid[k] = EMPTY
              w.onSprout(w, x, y)
            }
          } else if (cell === MUD && rng.next() < 0.002) {
            if (at(x, y - 1) === EMPTY || at(x - 1, y) === EMPTY || at(x + 1, y) === EMPTY)
              grid[k] = GRASS
          } else if (cell === GRASS) {
            if (at(x, y - 1) !== EMPTY && at(x - 1, y) !== EMPTY && at(x + 1, y) !== EMPTY)
              grid[k] = MUD
          }
        }
      } else if (cell === WATER) {
        if (at(x, y + 1) === EMPTY) {
          move(k, x, y + 1, WATER)
          continue
        }
        const d = rng.next() < 0.5 ? -1 : 1
        if (at(x + d, y + 1) === EMPTY) move(k, x + d, y + 1, WATER)
        else if (at(x - d, y + 1) === EMPTY) move(k, x - d, y + 1, WATER)
        else if (at(x + d, y) === EMPTY) move(k, x + d, y, WATER)
        else if (at(x - d, y) === EMPTY) move(k, x - d, y, WATER)
        else if (rng.next() < 0.01) {
          // A stray splash soaks into sand and makes mud; lakes stay put
          let wet = 0,
            sx = -1,
            sy = -1
          for (let j = 0; j < 4; j++) {
            const nx = x + (j === 0 ? -1 : j === 1 ? 1 : 0),
              ny = y + (j === 2 ? -1 : j === 3 ? 1 : 0)
            const c = at(nx, ny)
            if (c === WATER) wet++
            else if (c === SAND) {
              sx = nx
              sy = ny
            }
          }
          if (wet <= 1 && sx >= 0) {
            grid[sy * W + sx] = MUD
            grid[k] = EMPTY
          }
        }
      } else if (cell === FIRE) {
        if (rng.next() < 0.08) {
          grid[k] = SMOKE
          upd[k] = 1
          continue
        }
        if (rng.next() < 0.15) {
          grid[k] = EMPTY
          continue
        }
        for (let j = 0; j < 4; j++) {
          const nx = x + (j === 0 ? -1 : j === 1 ? 1 : 0),
            ny = y + (j === 2 ? -1 : j === 3 ? 1 : 0)
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          const nk = ny * W + nx
          const nc = grid[nk],
            bc = bg[nk]
          if (BG_FLAMMABLE[bc] && rng.next() < 0.04) {
            bg[nk] = EMPTY
            if (nc === EMPTY && rng.next() < 0.5) {
              grid[nk] = FIRE
              upd[nk] = 1
            }
          }
          if (FLAMMABLE[nc] && rng.next() < 0.02) {
            grid[nk] = FIRE
            upd[nk] = 1
          } else if (nc === WATER && rng.next() < 0.02) {
            grid[nk] = SMOKE
            upd[nk] = 1
          } else if ((nc === MUD || nc === GRASS) && rng.next() < 0.03) {
            grid[nk] = BRICK
          }
        }
        const d = rng.next() < 0.5 ? -1 : 1
        if (at(x, y - 1) === EMPTY) move(k, x, y - 1, FIRE)
        else if (at(x + d, y - 1) === EMPTY) move(k, x + d, y - 1, FIRE)
      } else if (cell === SMOKE) {
        if (rng.next() < 0.025) {
          grid[k] = EMPTY
          continue
        }
        const d = rng.next() < 0.5 ? -1 : 1
        if (at(x, y - 1) === EMPTY) move(k, x, y - 1, SMOKE)
        else if (at(x + d, y - 1) === EMPTY) move(k, x + d, y - 1, SMOKE)
        else if (at(x + d, y) === EMPTY) move(k, x + d, y, SMOKE)
      } else if (cell === KILN_FIRE) {
        if (rng.next() < 0.01) grid[k] = SMOKE
      }
    }
  }
}

const FLOWERS = [FLOWER_RED, FLOWER_GOLD, FLOWER_BLUE]
const isPlantBg = (b: number) =>
  b === TUFT || b === FLOWER_RED || b === FLOWER_GOLD || b === FLOWER_BLUE

// Grass spreading over bare dirt, tufts and flowers coming and going. Samples a few
// random cells per tick so it costs almost nothing.
export function stepLiving(w: World) {
  const { W, H, grid, bg, rng } = w
  const samples = Math.max(16, (W * H) >> 10)
  for (let s = 0; s < samples; s++) {
    const x = 1 + rng.int(W - 2),
      y = 1 + rng.int(H - 2)
    const k = y * W + x
    const c = grid[k]
    if (c === DIRT) {
      const up = grid[k - W]
      const upBg = bg[k - W]
      if (up === EMPTY && upBg !== DIRT_WALL && upBg !== ROCK_WALL && rng.next() < 0.3) {
        // grass creeps in from neighbouring turf
        if (
          grid[k - 1] === TURF ||
          grid[k + 1] === TURF ||
          grid[k - W - 1] === TURF ||
          grid[k - W + 1] === TURF ||
          grid[k + W - 1] === TURF ||
          grid[k + W + 1] === TURF
        )
          grid[k] = TURF
      }
    } else if (c === TURF) {
      const up = grid[k - W]
      if (SOLID[up] || up === WATER) grid[k] = DIRT
      else if (up === EMPTY && bg[k - W] === EMPTY && rng.next() < 0.02) {
        let nearby = 0
        for (let dx = -2; dx <= 2; dx++) if (isPlantBg(bg[k - W + dx])) nearby++
        if (nearby < 2) bg[k - W] = rng.next() < 0.2 ? rng.pick(FLOWERS) : TUFT
      }
    } else if (c !== EMPTY && isPlantBg(bg[k])) {
      bg[k] = EMPTY
    } else if (c === EMPTY && isPlantBg(bg[k]) && grid[k + W] !== TURF) {
      bg[k] = EMPTY
    }
  }
}

// Leaves and trunks use these bg ids
export const TREE_BG = new Uint8Array(64)
for (const t of [TREE, BIRCH, LEAF, PINE, BLOSSOM, AUTUMN, BIRCH_LEAF]) TREE_BG[t] = 1
