// Furniture: little pixel sprites that guys build inside tower rooms. Each item makes
// the colony more attractive, which brings more guys.

import { rgba } from "./cells"
import { hash2 } from "./rng"
import type { World } from "./world"

export interface Furniture {
  x: number // left column
  y: number // bottom row
  kind: number
  variant: number
  flip: boolean
  room: number // room id
}

export interface FurnDef {
  name: string
  rows: string[] // top row first; "." is transparent
  wall?: boolean // hangs on the wall instead of standing on the floor
  tier: number
  cost: number
  stone?: boolean
  seat?: boolean
}

export const FURN: FurnDef[] = [
  { name: "workbench", tier: 1, cost: 60, rows: [".ks..", "wwwww", "d...d", "d...d"] },
  { name: "table", tier: 1, cost: 50, rows: [".l...", ".p...", "wwwww", "..d..", ".ddd."] },
  { name: "chair", tier: 1, cost: 20, seat: true, rows: ["d..", "d..", "dww", "d.d"] },
  { name: "bed", tier: 1, cost: 70, rows: ["d.......", "dpXXXXXd", "dmmmmmmd", "d......d"] },
  { name: "chest", tier: 1, cost: 30, rows: ["mmm", "dyd", "ddd"] },
  {
    name: "lamp",
    tier: 2,
    cost: 30,
    stone: true,
    rows: ["ooo", ".l.", ".k.", ".k.", ".k.", "kkk"],
  },
  {
    name: "bookshelf",
    tier: 2,
    cost: 60,
    rows: ["dddd", "dXbd", "dddd", "dgyd", "dddd", "dvXd", "dddd"],
  },
  { name: "plant", tier: 2, cost: 15, rows: ["g.g", "ggg", ".g.", "ttt"] },
  { name: "painting", tier: 2, cost: 25, wall: true, rows: ["yyyy", "yXqy", "yyyy"] },
  { name: "sofa", tier: 2, cost: 60, seat: true, rows: ["X....X", "XXXXXX", "d....d"] },
  { name: "clock", tier: 3, cost: 70, rows: [".d.", "dpd", "ddd", "dyd", "dyd", "ddd", "d.d"] },
  { name: "banner", tier: 3, cost: 30, wall: true, rows: ["kk", "XX", "XX", "XX", "X."] },
  { name: "anvil", tier: 3, cost: 50, stone: true, rows: ["kkkk", ".kk.", "kkkk"] },
]
export const F_WORKBENCH = 0,
  F_CHAIR = 2,
  F_TABLE = 1,
  F_BED = 3

const COLORS: Record<string, number> = {
  w: rgba(178, 128, 76),
  m: rgba(152, 106, 62),
  d: rgba(108, 72, 42),
  k: rgba(72, 72, 78),
  s: rgba(156, 156, 160),
  l: rgba(255, 220, 120),
  o: rgba(232, 150, 70),
  p: rgba(242, 238, 228),
  y: rgba(224, 182, 64),
  g: rgba(80, 150, 70),
  t: rgba(180, 92, 60),
  b: rgba(70, 100, 180),
  v: rgba(140, 90, 170),
  q: rgba(70, 150, 150),
  r: rgba(190, 60, 60),
}
const VARIANTS = [
  rgba(190, 60, 60),
  rgba(70, 100, 180),
  rgba(80, 150, 90),
  rgba(200, 150, 60),
  rgba(140, 90, 170),
]

export function furnWidth(kind: number): number {
  return FURN[kind].rows[0].length
}
export function furnHeight(kind: number): number {
  return FURN[kind].rows.length
}

export function forEachFurnPixel(f: Furniture, cb: (x: number, y: number, color: number) => void) {
  const def = FURN[f.kind]
  const h = def.rows.length
  const wd = def.rows[0].length
  const vc = VARIANTS[f.variant % VARIANTS.length]
  for (let r = 0; r < h; r++) {
    const row = def.rows[r]
    for (let i = 0; i < wd; i++) {
      const ch = row[f.flip ? wd - 1 - i : i]
      if (ch === ".") continue
      const col = ch === "X" ? vc : COLORS[ch]
      if (col === undefined) continue
      cb(f.x + i, f.y - (h - 1 - r), col)
    }
  }
}

const LOG = rgba(140, 92, 52),
  LOG_END = rgba(196, 150, 96),
  ROCKS = [rgba(150, 150, 146), rgba(128, 128, 126)]

// The woodpile and stone heap at the colony's home
function drawStock(w: World, out: Uint32Array) {
  const c = w.colony
  const { W, H } = w
  const put = (x: number, y: number, col: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H && w.grid[y * W + x] === 0) out[y * W + x] = col
  }
  const logs = Math.min(4, Math.ceil(c.stock[1] / 150))
  for (let r = 0; r < logs; r++) {
    const wd = 6 - r
    for (let i = 0; i < wd; i++)
      put(c.homeX - 3 + i + (r >> 1), c.homeY - r, i === 0 || i === wd - 1 ? LOG_END : LOG)
  }
  const rocks = Math.min(3, Math.ceil(c.stock[2] / 100))
  for (let r = 0; r < rocks; r++)
    for (let i = 0; i < 3 - r; i++) put(c.homeX + 4 + i, c.homeY - r, ROCKS[(i + r) & 1])
  // and a smaller store at the head of each mine shaft
  for (const n of c.nests ?? []) {
    const x = n.lx - 6,
      y = n.s - 1
    if (c.stock[1] > 0) for (let i = 0; i < 3; i++) put(x + i, y, i === 0 ? LOG_END : LOG)
    if (c.stock[1] > 300) for (let i = 0; i < 2; i++) put(x + i, y - 1, i === 0 ? LOG_END : LOG)
    if (c.stock[2] > 0) put(x + 3, y, ROCKS[0])
  }
}

export function drawFurniture(w: World, out: Uint32Array) {
  if (!w.colony) return
  drawStock(w, out)
  const { W, H } = w
  for (const f of w.colony.furniture) {
    forEachFurnPixel(f, (x, y, col) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return
      // candle flames and lamps flicker a touch
      if (col === COLORS.l && hash2(x, y, w.tick >> 3) < 0.25) col = COLORS.o
      out[y * W + x] = col
    })
  }
}
