// Entry point for the simulation: build a world for a screen size, seed and text
// layout, then step it. Used by the page script, the tests and the video tools.

import { World, stepParticles, stepLiving } from "./world"
import { generateTerrain } from "./terrain"
import { stepTrees, canPlant, plantTree } from "./trees"
import { newColony, spawnInitialGuys, stepColony } from "./colony"
import { TEXT, WATER } from "./cells"
import { loadWorld, SavedWorld } from "./save"

export { saveWorld } from "./save"
export type { SavedWorld } from "./save"

export { World, CELL } from "./world"

function hook(w: World) {
  w.onSprout = (w, x, y) => {
    if (canPlant(w, x, y, 3)) plantTree(w, x, y, 1)
  }
}

export function createWorld(W: number, H: number, seed: number, textRects: number[][] = []): World {
  const w = new World(W, H, seed)
  w.setText(textRects)
  hook(w)
  const info = generateTerrain(w)
  const [hx, hy] = pickHome(w, info.homeX, info.homeY, info.surface)
  w.colony = newColony(w, hx, hy)
  spawnInitialGuys(w)
  return w
}

export function restoreWorld(saved: SavedWorld, textRects: number[][] = []): World | null {
  const w = loadWorld(saved)
  if (!w) return null
  w.setText(textRects)
  hook(w)
  return w
}

// Settle where the most ground can be walked to and back from
function pickHome(w: World, hx: number, hy: number, surface: Int16Array): [number, number] {
  const cands: [number, number][] = [[hx, hy]]
  for (let i = 1; i <= 7; i++) {
    const x = Math.floor((w.W * i) / 8)
    let y = 0
    while (y < w.H - 1 && (w.grid[y * w.W + x] === 0 || w.grid[y * w.W + x] === TEXT)) y++
    if (w.grid[y * w.W + x] !== WATER) cands.push([x, y - 1])
  }
  let best = cands[0],
    bestScore = -1
  for (const [x, y] of cands) {
    const k = w.nav.snap(w, x, y, 6)
    if (k < 0) continue
    w.nav.computeSafe(w, k)
    // the terrain's own pick gets a head start; it's flat and dry
    const score = w.nav.safeCount * (x === hx ? 1.25 : 1) - Math.abs(x - w.W / 2) * 2
    if (score > bestScore) {
      bestScore = score
      best = [k % w.W, Math.floor(k / w.W)]
    }
  }
  void surface
  return best
}

export function step(w: World) {
  w.tick++
  stepParticles(w)
  stepLiving(w)
  stepTrees(w)
  stepColony(w)
}

// Cheap fingerprint of the whole state, for determinism checks
export function checksum(w: World): number {
  let h = 2166136261
  const mix = (v: number) => {
    h ^= v
    h = Math.imul(h, 16777619)
  }
  for (let i = 0; i < w.grid.length; i += 1) mix(w.grid[i] | (w.bg[i] << 8))
  for (const g of w.guys) {
    mix(Math.round(g.x * 100))
    mix(Math.round(g.y * 100))
  }
  mix(w.colony.furniture.length)
  return h >>> 0
}
