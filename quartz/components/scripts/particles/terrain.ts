// Procedural terrain. Builds a side-on band of land along the bottom of the page,
// always below the text: a noise heightfield (rolling hills, broad domes, mesas,
// lake basins) with gentle overhangs and caves opening off the surface, layered
// into turf and dirt over stone, flooded into lakes edged with sand, dotted with
// floating islands, and planted with trees and flowers.

import {
  EMPTY,
  WATER,
  SAND,
  DIRT,
  TURF,
  ROCK,
  TEXT,
  TUFT,
  FLOWER_RED,
  FLOWER_GOLD,
  FLOWER_BLUE,
  VINE,
  MUSHROOM,
  DIRT_WALL,
  ROCK_WALL,
  SOLID,
} from "./cells"
import { hash2, Rng } from "./rng"
import { World, TEXT_MARGIN, stepParticles } from "./world"
import { canPlant, plantTree, pickKind, PINE_T, BIRCH_T } from "./trees"

export interface TerrainInfo {
  homeX: number
  homeY: number
  surface: Int16Array // first solid row per column after generation
  features: string[]
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function generateTerrain(w: World): TerrainInfo {
  const { W, H, grid, bg, noise } = w
  const rng = new Rng(w.seed ^ 0x5bd1e995)
  const features: string[] = []
  const N = (x: number, y: number) => noise.n2(x, y)

  // --- Where may the ground reach? Under text, and only gently sloping up beside it ---
  const rawMin = new Float32Array(W)
  for (const k of w.textCells) {
    const x = k % W,
      y = (k - x) / W
    rawMin[x] = Math.max(rawMin[x], y + 1 + TEXT_MARGIN + 3)
  }
  // nothing rises above the text
  const tb = w.textBottom
  const topLimit = tb > 0 ? tb + TEXT_MARGIN + 8 : Math.floor(H * 0.5)
  const effMin = new Float32Array(W)
  for (let x = 0; x < W; x++) effMin[x] = Math.max(rawMin[x], topLimit)
  for (let x = 1; x < W; x++) effMin[x] = Math.max(effMin[x], effMin[x - 1] - 1.15)
  for (let x = W - 2; x >= 0; x--) effMin[x] = Math.max(effMin[x], effMin[x + 1] - 1.15)

  // a thin band of ground along the bottom, leaving sky under the text to build in
  const free = H - tb
  const thickness = Math.max(18, Math.min(H * rng.range(0.17, 0.23), free * 0.55))
  const groundAvg = H - thickness
  const minThick = Math.max(10, Math.floor(thickness * 0.4))

  // --- Style dials: every seed mixes these differently ---
  const hillAmp = rng.range(3, 6) + thickness * rng.range(0.12, 0.25)
  const hillF = rng.range(0.01, 0.022)
  const maxRise = Math.max(0, groundAvg - topLimit)
  const mountainAmp = rng.chance(0.85) ? maxRise * rng.range(0.4, 0.85) : 0
  const knollAmp = thickness * rng.range(0.1, 0.3)
  const mountainOff = rng.range(0, 100)
  const mesa = rng.chance(0.6)
  const mesaStep = 4 + rng.int(5)
  const overhang = rng.range(1.5, 4)
  const wide = W > 260
  if (mountainAmp > 0) features.push("hills")
  if (mesa) features.push("mesas")

  // Lake basins carved into the heightfield
  const lakes: { cx: number; rx: number; depth: number }[] = []
  const lakeCount = 1 + rng.int(wide ? 3 : 2)
  for (let i = 0; i < lakeCount; i++) {
    const cx = W * rng.range(0.15, 0.85)
    lakes.push({
      cx,
      rx: Math.min(W * 0.18, rng.range(10, 30), cx - 6, W - 6 - cx),
      depth: Math.min(thickness * 0.35, rng.range(5, 12)),
    })
  }

  // --- Surface heightfield (y grows downward) ---
  const surf = new Float32Array(W)
  const mountainness = new Float32Array(W)
  for (let x = 0; x < W; x++) {
    let y =
      groundAvg +
      noise.fbm1(x * hillF + 3.1, 3) * hillAmp -
      // rounded knolls
      Math.max(0, noise.n1(x * 0.028 + 9)) ** 2 * knollAmp
    // broad rounded rises in some regions (no spiky ridges)
    const mm = smooth(-0.1, 0.5, noise.n1(x * 0.0055 + mountainOff))
    const ridge = 0.6 + 0.4 * noise.fbm1(x * 0.009 + 40, 2)
    // keep a band of open sky under the text for building in
    const maxRise = Math.max(0, groundAvg - (effMin[x] + 28))
    let m = mm * ridge * mountainAmp
    if (m > maxRise) m = maxRise + (m - maxRise) * 0.15
    mountainness[x] = mm
    y -= m
    if (mesa) {
      const mz = smooth(0, 0.3, noise.n1(x * 0.009 + 77))
      if (mz > 0) {
        const q =
          Math.floor(y / mesaStep) * mesaStep + mesaStep * smooth(0.65, 1, (y / mesaStep) % 1)
        y = y + (q - y) * mz
      }
    }
    for (const l of lakes) {
      const t = (x - l.cx) / l.rx
      if (Math.abs(t) < 1) y += l.depth * Math.pow(1 - t * t, 0.6)
    }
    // soft ceiling: compress toward the allowed line instead of slicing it flat
    const allowed = effMin[x] + 2
    const d = y - allowed
    const S = 10
    if (d < S) y = allowed + S * Math.exp((d - S) / S)
    surf[x] = Math.min(H - minThick * 0.5, y)
  }

  // --- 2D solidity: gentle overhangs ---
  for (let x = 0; x < W; x++) {
    const s = surf[x]
    for (let y = Math.max(0, Math.floor(s - 12)); y < H; y++) {
      const k = y * W + x
      if (grid[k] === TEXT) continue
      const rel = y - s
      let solid = rel >= 0
      if (rel > -12 && rel < 10) {
        const oh = overhang * N(x * 0.06, y * 0.11) * (1 - Math.abs(rel) / 12)
        solid = rel + oh >= 0
      }
      if (y < effMin[x] + 1) solid = false
      if (solid) grid[k] = DIRT
    }
    grid[(H - 1) * W + x] = DIRT
  }

  // Caves that open off the surface: worms carved from the surface downward
  const worms = 1 + rng.int(wide ? 5 : 3)
  const carved: number[] = []
  for (let i = 0; i < worms; i++) {
    let x = 10 + rng.next() * (W - 20)
    // keep cave mouths away from lakes so they don't drain them
    if (lakes.some((l) => Math.abs(x - l.cx) < l.rx + 14)) continue
    let y = surf[Math.floor(x)] + 1
    let ang = Math.PI * 0.5 + rng.range(-0.6, 0.6)
    const len = 25 + rng.int(60)
    const y0 = y
    const r0 = rng.range(3, 4.5)
    for (let s = 0; s < len; s++) {
      ang += N(i * 13.1, s * 0.08) * 0.35
      ang = Math.min(Math.PI * 0.8, Math.max(Math.PI * 0.2, ang))
      if (y - y0 > thickness * 0.6) break
      x += Math.cos(ang)
      y += Math.sin(ang) * 0.8
      const r = r0 * (0.8 + 0.4 * (N(s * 0.1, i) + 1) * 0.5)
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const cx = Math.round(x + dx),
            cy = Math.round(y + dy)
          if (cx < 1 || cx >= W - 1 || cy < 0 || cy >= H - 2) continue
          if (grid[cy * W + cx] === DIRT) {
            grid[cy * W + cx] = EMPTY
            if (cy - y0 > 1) carved.push(cy * W + cx)
          }
        }
      }
      if (y > H - 6) break
    }
  }
  if (worms > 0) features.push("caves")

  // Natural arch through a tall ridge
  const arches: number[] = []
  if (mountainAmp > 0 && rng.chance(0.6)) {
    let best = -1,
      bestRise = 0
    for (let x = 12; x < W - 12; x++) {
      const rise = groundAvg - surf[x]
      if (rise > bestRise && rise > 16) {
        bestRise = rise
        best = x
      }
    }
    if (best > 0) {
      const ax = best + rng.int(9) - 4
      const ay = surf[ax] + 7 + rng.int(4)
      const rx = 5 + rng.int(5),
        ry = 4 + rng.int(3)
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue
          const cx = ax + dx,
            cy = Math.round(ay + dy * (dy > 0 ? 1.4 : 1))
          if (cx < 1 || cx >= W - 1 || cy < 0 || cy >= H - 2) continue
          grid[cy * W + cx] = EMPTY
          arches.push(cy * W + cx)
        }
      }
      features.push("arch")
    }
  }

  // --- Cleanup: drop floating crumbs, fill every enclosed air pocket (caves only
  // where they open to the sky) ---
  removeFloating(w)
  fillPockets(w, Infinity)

  // --- Materials ---
  const fs = new Int16Array(W)
  for (let x = 0; x < W; x++) {
    let y = 0
    while (y < H && !(grid[y * W + x] === DIRT)) y++
    fs[x] = y
  }
  const archSet = new Set(arches)
  const thick = H - groundAvg
  for (let x = 0; x < W; x++) {
    // stone starts about halfway down the ground band, regardless of hills above it
    // mostly dirt; the stone underneath rises partway into hills, giving them cores
    const dirtDepth = 10 + 10 * (noise.fbm1(x * 0.02 + 8, 3) + 1) * 0.5
    const floor = groundAvg + thick * (0.5 + 0.1 * noise.fbm1(x * 0.012 + 3, 2))
    const top = Math.min(fs[x], surf[x])
    const stoneTop = Math.max(top + dirtDepth, floor - (floor - top) * 0.45)
    const wallDepth = Math.max(6, stoneTop - fs[x])
    let skyAbove = true
    for (let y = 0; y < H; y++) {
      const k = y * W + x
      const c = grid[k]
      if (c === TEXT) continue
      const d = y - fs[x]
      if (c === EMPTY) {
        if (d > 0 && !archSet.has(k)) bg[k] = d < wallDepth ? DIRT_WALL : ROCK_WALL
        continue
      }
      if (c !== DIRT) continue
      const exposed = skyAbove || (y > 0 && grid[k - W] === EMPTY && bg[k - W] === EMPTY)
      skyAbove = false
      if (exposed) {
        grid[k] = TURF
        continue
      }
      // dirt on top of stone
      if (y + 3 * N(x * 0.07, y * 0.07) >= stoneTop) grid[k] = ROCK
    }
  }

  // cave entrances get back walls even where they open to the sky
  for (const k of carved) if (grid[k] === EMPTY && bg[k] === EMPTY) bg[k] = DIRT_WALL
  // and thin gaps between cave walls (slivers removed as floating) get filled in
  const isWall = (b: number) => b === DIRT_WALL || b === ROCK_WALL
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x
        if (grid[k] !== EMPTY || bg[k] !== EMPTY) continue
        const l = isWall(bg[k - 1]) || SOLID[grid[k - 1]] === 1,
          r = isWall(bg[k + 1]) || SOLID[grid[k + 1]] === 1
        if (
          l &&
          r &&
          (isWall(bg[k - 1]) || isWall(bg[k + 1])) &&
          (isWall(bg[k - W]) || SOLID[grid[k - W]] === 1)
        )
          bg[k] = isWall(bg[k - 1]) ? bg[k - 1] : bg[k + 1]
      }
    }
  }

  // Floating islands (purely scenic) in empty sky
  if (wide && rng.chance(0.45)) {
    const count = 1 + rng.int(2)
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(W * rng.range(0.08, 0.92))
      const iw = 8 + rng.int(10)
      const top = Math.floor(surf[cx] - 22 - rng.int(14))
      if (top - 14 < topLimit) continue
      if (stampIsland(w, cx, top, iw, rng)) features.push("island")
    }
  }

  // --- Water: lakes in the heightfield basins ---
  const left = new Int16Array(W),
    right = new Int16Array(W)
  left[0] = fs[0]
  for (let x = 1; x < W; x++) left[x] = Math.min(left[x - 1], fs[x])
  right[W - 1] = fs[W - 1]
  for (let x = W - 2; x >= 0; x--) right[x] = Math.min(right[x + 1], fs[x])
  const basins: { x0: number; x1: number; lvl: number; depth: number }[] = []
  let x = 0
  while (x < W) {
    if (Math.max(left[x], right[x]) >= fs[x]) {
      x++
      continue
    }
    let x1 = x
    let maxDepth = 0
    while (x1 < W && Math.max(left[x1], right[x1]) < fs[x1]) {
      maxDepth = Math.max(maxDepth, fs[x1] - Math.max(left[x1], right[x1]))
      x1++
    }
    if (maxDepth >= 4 && x1 - x >= 8)
      basins.push({ x0: x, x1, lvl: Math.max(left[x], right[x]), depth: maxDepth })
    x = x1
  }
  basins.sort((a, b) => b.depth * (b.x1 - b.x0) - a.depth * (a.x1 - a.x0))
  // caves would drain a lake next to them
  const caveCol = new Uint8Array(W)
  for (const k of carved) caveCol[k % W] = 1
  let lakeWidth = 0
  for (const b of basins.slice(0, lakeCount)) {
    let nearCave = false
    for (let xx = Math.max(0, b.x0 - 4); xx < Math.min(W, b.x1 + 4); xx++)
      if (caveCol[xx]) nearCave = true
    if (nearCave || lakeWidth > W * 0.3) continue
    let lvl = b.lvl + Math.max(0, b.depth - 14)
    // no lake wider than about a third of the screen: lower it until it fits
    const wet = (l: number) => {
      let n = 0
      for (let xx = b.x0; xx < b.x1; xx++) if (fs[xx] > l) n++
      return n
    }
    while (wet(lvl) > Math.min(W * 0.35, W * 0.32 - lakeWidth + 8) && lvl < H) lvl++
    lakeWidth += wet(lvl)
    for (let xx = b.x0; xx < b.x1; xx++) {
      for (let y = lvl; y < fs[xx]; y++) {
        const k = y * W + xx
        if (grid[k] === EMPTY) grid[k] = WATER
      }
    }
    features.push("lake")
  }

  // --- Sand only where there is water, in a ragged rounded band ---
  const dist = new Float32Array(W * H).fill(99)
  const R = 5
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== WATER) continue
    const wx = k % W,
      wy = (k - wx) / W
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const sx = wx + dx,
          sy = wy + dy
        if (sx < 0 || sx >= W || sy < 0 || sy >= H - 1) continue
        const sk = sy * W + sx
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < dist[sk]) dist[sk] = d
      }
    }
  }
  const toSand: number[] = []
  for (let k = 0; k < W * H; k++) {
    if (dist[k] > R) continue
    const c = grid[k]
    if (c !== DIRT && c !== TURF) continue
    const x = k % W,
      y = (k - x) / W
    const reach =
      1.6 + 2.6 * (N(x * 0.13 + 5, y * 0.13) + 1) * 0.5 + (hash2(x, y, w.seed + 7) - 0.5) * 0.8
    if (dist[k] <= reach) toSand.push(k)
  }
  for (const k of toSand) grid[k] = SAND
  // sand that would fall into a cave stays dirt
  for (let k = W * (H - 2); k >= 0; k--) {
    if (grid[k] === SAND && (grid[k + W] === EMPTY || grid[k + W] === WATER)) grid[k] = DIRT
  }

  // --- Vegetation ---
  for (let x = 0; x < W; x++) {
    let y = 0
    while (y < H && (grid[y * W + x] === EMPTY || grid[y * W + x] === TEXT)) y++
    fs[x] = y
  }
  const forestOff = rng.range(0, 100)
  let nextTree = 3 + rng.int(4)
  for (let x = 3; x < W - 3; x++) {
    const density = (noise.n1(x * 0.02 + forestOff) + 1) * 0.5
    if (x < nextTree) continue
    const y = fs[x] - 1
    nextTree = x + 4 + Math.floor((1 - density) * 9 * rng.next())
    if (density < 0.25 && rng.chance(0.6)) continue
    if (grid[(y + 1) * W + x] !== TURF) continue
    if (!canPlant(w, x, y, 5)) continue
    let wet = false
    for (let dx = -4; dx <= 4 && !wet; dx++) {
      for (let dy = -2; dy <= 3; dy++)
        if (w.get(x + dx, y + dy) === SAND || w.get(x + dx, y + dy) === WATER) wet = true
    }
    if (wet) continue
    const kind = pickKind(w, x, y)
    const maxH =
      kind === PINE_T ? 12 + rng.int(14) : kind === BIRCH_T ? 12 + rng.int(10) : 8 + rng.int(14)
    const h = rng.chance(0.15) ? 1 + rng.int(4) : Math.max(4, Math.floor(maxH * rng.range(0.7, 1)))
    plantTree(w, x, y, h, kind, maxH)
  }
  const flowers = [FLOWER_RED, FLOWER_GOLD, FLOWER_BLUE]
  const flowerKind = rng.pick(flowers)
  for (let x = 1; x < W - 1; x++) {
    for (let y = 1; y < H - 1; y++) {
      const k = y * W + x
      const c = grid[k]
      if (c === TURF && grid[k - W] === EMPTY && bg[k - W] === EMPTY && !w.noBuild[k - W]) {
        const r = rng.next()
        if (r < 0.3) bg[k - W] = TUFT
        else if (r < 0.36) bg[k - W] = rng.chance(0.7) ? flowerKind : rng.pick(flowers)
      } else if (c === EMPTY && (bg[k] === DIRT_WALL || bg[k] === ROCK_WALL)) {
        const above = grid[k - W]
        if ((above === DIRT || above === TURF) && rng.chance(0.18)) {
          const len = 1 + rng.int(5)
          for (let i = 0; i < len && grid[k + i * W] === EMPTY; i++) bg[k + i * W] = VINE
        } else if (SOLID[grid[k + W]] && rng.chance(0.04)) bg[k] = MUSHROOM
      } else if (
        c === EMPTY &&
        bg[k] === EMPTY &&
        grid[k - W] !== EMPTY &&
        SOLID[grid[k - W]] &&
        grid[k - W] !== TEXT &&
        rng.chance(0.12)
      ) {
        // under overhangs
        const len = 1 + rng.int(4)
        for (let i = 0; i < len && grid[k + i * W] === EMPTY; i++) bg[k + i * W] = VINE
      }
    }
  }
  if (w.trees.length > 0) features.push("forest")

  // Let lakes and sand settle before anyone looks
  for (let i = 0; i < 90; i++) stepParticles(w)
  // pools that drained while settling leave their sand behind: turn it back to dirt
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== SAND) continue
    const x = k % W,
      y = (k - x) / W
    let wet = false
    for (let dy = -6; dy <= 6 && !wet; dy++) {
      for (let dx = -6; dx <= 6; dx++) if (w.get(x + dx, y + dy) === WATER) wet = true
    }
    if (!wet) grid[k] = DIRT
  }

  // --- Pick a home for the first guys: flat, dry, near the middle ---
  let homeX = Math.floor(W / 2),
    bestScore = -1e9
  for (let x = 6; x < W - 6; x++) {
    const y = fs[x]
    if (grid[y * W + x] !== TURF && grid[y * W + x] !== DIRT) continue
    let flat = 0
    for (let dx = -5; dx <= 5; dx++) flat += Math.abs(fs[x + dx] - y)
    let wet = 0
    for (let dx = -8; dx <= 8; dx++) {
      const c = w.get(x + dx, fs[x + dx])
      if (c === WATER || c === SAND) wet++
    }
    const score =
      -flat * 2 -
      wet * 6 -
      Math.abs(x - W / 2) * 0.15 -
      (w.noBuild[(y - 9) * W + x] ? 50 : 0) +
      hash2(x, 1, w.seed) * 4
    if (score > bestScore) {
      bestScore = score
      homeX = x
    }
  }
  return { homeX, homeY: fs[homeX] - 1, surface: fs, features }
}

// Remove solid blobs that aren't connected to the bottom of the world
function removeFloating(w: World) {
  const { W, H, grid } = w
  const seen = new Uint8Array(W * H)
  const q: number[] = []
  for (let x = 0; x < W; x++) {
    const k = (H - 1) * W + x
    if (grid[k] === DIRT) {
      seen[k] = 1
      q.push(k)
    }
  }
  while (q.length) {
    const k = q.pop()!
    const x = k % W
    const nb = [k - W, k + W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1]
    for (const n of nb) {
      if (n < 0 || n >= W * H || seen[n] || grid[n] !== DIRT) continue
      seen[n] = 1
      q.push(n)
    }
  }
  for (let k = 0; k < W * H; k++) if (grid[k] === DIRT && !seen[k]) grid[k] = EMPTY
}

// Fill enclosed air pockets smaller than `min` cells
function fillPockets(w: World, min: number) {
  const { W, H, grid } = w
  const seen = new Uint8Array(W * H)
  const q: number[] = []
  const region: number[] = []
  for (let k0 = 0; k0 < W * H; k0++) {
    if (grid[k0] !== EMPTY || seen[k0]) continue
    region.length = 0
    q.length = 0
    q.push(k0)
    seen[k0] = 1
    let open = false
    while (q.length) {
      const k = q.pop()!
      region.push(k)
      const x = k % W,
        y = (k - x) / W
      if (y === 0) open = true
      const nb = [
        y > 0 ? k - W : -1,
        y < H - 1 ? k + W : -1,
        x > 0 ? k - 1 : -1,
        x < W - 1 ? k + 1 : -1,
      ]
      for (const n of nb) {
        if (n < 0 || seen[n] || grid[n] !== EMPTY) continue
        seen[n] = 1
        q.push(n)
      }
      if (region.length > min && open) break
    }
    if (!open && region.length < min) for (const k of region) grid[k] = DIRT
    // drain anything left in the queue so it isn't revisited as a new region
    while (q.length) region.push(q.pop()!)
  }
}

function stampIsland(w: World, cx: number, top: number, iw: number, rng: Rng): boolean {
  const { W, H, grid, noBuild } = w
  const hw = iw >> 1
  const depth = Math.floor(iw * 0.7)
  if (top < 6 || top + depth >= H) return false
  for (let y = top - 14; y <= top + depth + 2; y++) {
    for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
      if (x < 2 || x >= W - 2 || y < 0) return false
      if (noBuild[y * W + x] || grid[y * W + x] !== EMPTY) return false
    }
  }
  for (let y = top; y <= top + depth; y++) {
    const t = (y - top) / depth
    const half = Math.round(hw * (1 - t * t) + w.noise.n2(y * 0.3, cx) * 1.5)
    for (let x = cx - half; x <= cx + half; x++) {
      const k = y * W + x
      grid[k] = y === top ? TURF : t > 0.5 && hash2(x, y, 3) < 0.5 ? ROCK : DIRT
    }
  }
  for (let x = cx - hw + 2; x <= cx + hw - 2; x += 4 + rng.int(3)) {
    if (canPlant(w, x, top - 1, 4)) plantTree(w, x, top - 1, 4 + rng.int(5))
  }
  return true
}
