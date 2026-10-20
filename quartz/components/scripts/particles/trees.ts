// Trees are entities: a root cell, a height and a kind. Their trunk and canopy are
// painted into the background layer from a deterministic shape, so growing, felling
// and burning are exact and cheap.

import {
  EMPTY,
  TREE,
  BIRCH,
  LEAF,
  PINE,
  BLOSSOM,
  AUTUMN,
  BIRCH_LEAF,
  TUFT,
  FLOWER_RED,
  FLOWER_GOLD,
  FLOWER_BLUE,
  SOLID,
  SOIL,
} from "./cells"
import { hash2 } from "./rng"
import type { World } from "./world"

export const OAK = 0,
  PINE_T = 1,
  BIRCH_T = 2,
  AUTUMN_T = 3,
  BLOSSOM_T = 4

export interface Tree {
  id: number
  x: number // trunk column
  y: number // lowest trunk cell (the soil is at y + 1)
  h: number
  maxH: number
  kind: number
  seed: number
  claim: number // guy id that is going to fell it
}

const TRUNK = [TREE, TREE, BIRCH, TREE, TREE]
const LEAVES = [LEAF, PINE, BIRCH_LEAF, AUTUMN, BLOSSOM]

export function isMature(t: Tree): boolean {
  return t.h >= 6 && t.h >= t.maxH - 2
}

// Calls cb for every cell of the tree's current shape. Trunk cells come last.
export function forEachTreeCell(t: Tree, cb: (x: number, y: number, type: number) => void) {
  const { x, y, h, kind } = t
  const leaf = LEAVES[kind]
  const trunk = TRUNK[kind]
  const top = y - h + 1
  if (h >= 3) {
    if (kind === PINE_T) {
      const bottom = y - Math.max(2, Math.floor(h * 0.28))
      for (let row = top - 1; row <= bottom; row++) {
        const j = row - (top - 1)
        const hw = Math.floor(j * 0.42) + (j % 4 < 2 ? 0 : 1) - (j > 3 && j % 4 === 0 ? 1 : 0)
        for (let dx = -hw; dx <= hw; dx++) {
          if (Math.abs(dx) === hw && hash2(x + dx, row, t.seed) < 0.3) continue
          cb(x + dx, row, leaf)
        }
      }
    } else {
      const birch = kind === BIRCH_T
      const r = birch ? 1 + h * 0.16 : 1.3 + h * 0.23
      const rx = birch ? r * 0.9 : r * 1.35
      const ry = birch ? r * 1.5 : r
      const cy = top + ry * (birch ? 0.75 : 0.35)
      const blob = (cx: number, cy: number, rx: number, ry: number) => {
        const ix = Math.ceil(rx),
          iy = Math.ceil(ry)
        for (let dy = -iy; dy <= iy; dy++) {
          for (let dx = -ix; dx <= ix; dx++) {
            const v = (dx / rx) ** 2 + (dy / ry) ** 2
            const px = Math.round(cx) + dx,
              py = Math.round(cy) + dy
            if (v < 1 + (hash2(px, py, t.seed) - 0.5) * 0.7) cb(px, py, leaf)
          }
        }
      }
      blob(x, cy, rx, ry)
      if (!birch && h >= 10) {
        blob(x - rx * 0.65, cy + ry * 0.45, rx * 0.55, ry * 0.6)
        blob(x + rx * 0.65, cy + ry * 0.4, rx * 0.55, ry * 0.6)
      }
    }
  }
  // trunk: hidden inside the upper canopy, thicker at the base of big trees
  const trunkTop = h >= 3 && kind !== PINE_T ? top + Math.floor(h * 0.2) : top
  for (let i = y; i >= trunkTop; i--) cb(x, i, trunk)
  if (h >= 13 && kind !== BIRCH_T && kind !== PINE_T) {
    for (let i = y; i >= y - Math.floor(h * 0.45); i--) cb(x + 1, i, trunk)
  }
  if (h >= 8) {
    cb(x - 1, y, trunk)
    cb(x + (h >= 13 && kind !== BIRCH_T && kind !== PINE_T ? 2 : 1), y, trunk)
  }
}

const paintable = (b: number) =>
  b === EMPTY || b === TUFT || b === FLOWER_RED || b === FLOWER_GOLD || b === FLOWER_BLUE

export function paintTree(w: World, t: Tree) {
  const leaf = LEAVES[t.kind]
  forEachTreeCell(t, (x, y, type) => {
    if (!w.inBounds(x, y)) return
    const k = y * w.W + x
    if (w.noBuild[k]) return
    if (SOLID[w.grid[k]] && type === leaf) return
    const b = w.bg[k]
    if (paintable(b) || (type !== leaf && b === leaf)) w.bg[k] = type
  })
}

export function unpaintTree(w: World, t: Tree): number {
  let wood = 0
  const trunk = TRUNK[t.kind]
  forEachTreeCell(t, (x, y, type) => {
    if (!w.inBounds(x, y)) return
    const k = y * w.W + x
    if (w.bg[k] === type) {
      w.bg[k] = EMPTY
      wood += type === trunk ? 16 : 2
    }
  })
  return wood
}

function repaintNear(w: World, t: Tree) {
  for (const o of w.trees) if (o !== t && Math.abs(o.x - t.x) < 16) paintTree(w, o)
}

export function removeTree(w: World, t: Tree): number {
  const i = w.trees.indexOf(t)
  if (i >= 0) w.trees.splice(i, 1)
  const wood = unpaintTree(w, t)
  repaintNear(w, t)
  return wood
}

export function treeAt(w: World, x: number, y: number): Tree | undefined {
  for (const t of w.trees) if (t.x === x && t.y === y) return t
  return undefined
}

// Is (x, y) a good place for a new tree to root?
export function canPlant(w: World, x: number, y: number, spacing = 4): boolean {
  if (x < 3 || x >= w.W - 3 || y < 8 || y >= w.H - 1) return false
  const k = y * w.W + x
  if (w.grid[k] !== EMPTY || !SOIL[w.grid[k + w.W]]) return false
  if (w.noBuild[k] || w.reserved[k]) return false
  for (let i = 0; i < 8; i++) {
    const kk = k - i * w.W
    if (w.grid[kk] !== EMPTY || !paintable(w.bg[kk]) || w.noBuild[kk] || w.reserved[kk])
      return false
  }
  for (const t of w.trees) if (Math.abs(t.x - x) < spacing && Math.abs(t.y - y) < 12) return false
  return true
}

export function plantTree(w: World, x: number, y: number, h = 1, kind = -1, maxH = -1): Tree {
  const rng = w.rng
  if (kind < 0) kind = pickKind(w, x, y)
  if (maxH < 0)
    maxH =
      kind === PINE_T ? 12 + rng.int(14) : kind === BIRCH_T ? 12 + rng.int(10) : 8 + rng.int(14)
  const t: Tree = {
    id: w.nextTreeId++,
    x,
    y,
    h: Math.min(h, maxH),
    maxH,
    kind,
    seed: rng.int(1 << 30),
    claim: 0,
  }
  // don't start out taller than the room under the text allows
  const room = (hh: number) => {
    const top = y - hh - Math.ceil(2 + hh * 0.32)
    for (let yy = Math.max(0, top); yy <= y; yy++) if (w.noBuild[yy * w.W + x]) return false
    return top > 2
  }
  while (t.h > 1 && !room(t.h)) t.h--
  if (!room(t.maxH)) t.maxH = t.h
  w.trees.push(t)
  paintTree(w, t)
  return t
}

// Local flavour: pines up high, blossoms and autumn colours in patches
export function pickKind(w: World, x: number, y: number): number {
  const n = w.noise.n2(x * 0.02, 3.7)
  const alt = 1 - y / w.H
  const r = w.rng.next()
  if (alt > 0.45 && r < 0.6) return PINE_T
  if (n > 0.35) return r < 0.6 ? AUTUMN_T : OAK
  if (n < -0.4) return r < 0.5 ? BIRCH_T : PINE_T
  if (r < 0.06) return BLOSSOM_T
  if (r < 0.2) return BIRCH_T
  return OAK
}

function canGrow(w: World, t: Tree): boolean {
  const ny = t.y - t.h - 1
  if (ny < 4) return false
  const k = ny * w.W + t.x
  if (SOLID[w.grid[k]] || w.noBuild[k] || w.reserved[k]) return false
  const b = w.bg[k]
  if (!paintable(b) && b !== LEAVES[t.kind]) return false
  // keep the future canopy clear of text and structures
  const r = Math.ceil(2 + t.h * 0.32)
  for (let dx = -r; dx <= r; dx += r) {
    const kk = Math.max(0, ny - 2) * w.W + Math.min(w.W - 1, Math.max(0, t.x + dx))
    if (w.noBuild[kk] || w.reserved[kk]) return false
  }
  return true
}

export function stepTrees(w: World) {
  const rng = w.rng
  const cap = Math.max(6, Math.floor(w.W / 7))
  for (let i = w.trees.length - 1; i >= 0; i--) {
    const t = w.trees[i]
    if ((t.id + w.tick) % 20 !== 0) continue
    // dead if the soil went away, the trunk burned, or it got buried
    const base = t.y * w.W + t.x
    if (!SOLID[w.grid[base + w.W]] || SOLID[w.grid[base]] || w.bg[base] !== TRUNK[t.kind]) {
      removeTree(w, t)
      continue
    }
    if (t.h < t.maxH && rng.next() < 0.35) {
      if (canGrow(w, t)) {
        // the canopy shape shifts as it grows: repaint from scratch
        unpaintTree(w, t)
        t.h++
        paintTree(w, t)
      } else t.maxH = t.h
    }
    // forests spread, faster when they've been thinned out
    const spread = w.trees.length < cap * 0.5 ? 0.04 : 0.012
    if (isMature(t) && w.trees.length < cap && rng.next() < spread) {
      const dx = (rng.next() < 0.5 ? -1 : 1) * (4 + rng.int(12))
      const x = t.x + dx
      for (let y = t.y - 6; y <= t.y + 8; y++) {
        if (canPlant(w, x, y)) {
          plantTree(w, x, y, 1)
          break
        }
      }
    }
  }
}
