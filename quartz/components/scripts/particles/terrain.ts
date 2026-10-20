// Procedural terrain. Builds a side-on slice of land under the page's text:
// a noise heightfield (hills, ridged mountains, mesas, lake basins) bent into
// overhangs by 2D noise, hollowed by tunnel networks, caverns and surface caves,
// then layered into turf, dirt, clay, gravel and banded stone with ore, flooded
// into lakes and cave pools, edged with sand, and planted with trees and flowers.

import {
  EMPTY,
  WATER,
  SAND,
  DIRT,
  TURF,
  CLAY,
  ROCK,
  SLATE,
  STONE,
  COPPER,
  GOLD,
  GRAVEL,
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
  const topLimit = Math.floor(H * 0.2)
  const effMin = new Float32Array(W)
  for (let x = 0; x < W; x++) effMin[x] = Math.max(rawMin[x], topLimit)
  for (let x = 1; x < W; x++) effMin[x] = Math.max(effMin[x], effMin[x - 1] - 1.15)
  for (let x = W - 2; x >= 0; x--) effMin[x] = Math.max(effMin[x], effMin[x + 1] - 1.15)

  const tb = w.textBottom
  const free = H - tb
  const minThick = Math.max(16, Math.floor(H * 0.1))
  let groundAvg = tb + free * rng.range(0.5, 0.62)
  groundAvg = Math.min(groundAvg, H - minThick)
  if (tb === 0) groundAvg = H * rng.range(0.55, 0.68)

  // --- Style dials: every seed mixes these differently ---
  const hillAmp = rng.range(2, 6) + free * rng.range(0.03, 0.07)
  const hillF = rng.range(0.012, 0.028)
  const maxRise = Math.max(0, groundAvg - topLimit)
  const mountainAmp = rng.chance(0.8) ? maxRise * rng.range(0.35, 0.85) : 0
  const mountainOff = rng.range(0, 100)
  const mesa = rng.chance(0.45)
  const mesaStep = 4 + rng.int(5)
  const overhang = rng.range(1.5, 7)
  const tunnelW = rng.range(0.04, 0.07)
  const cavernT = rng.range(0.5, 0.65)
  const wide = W > 260
  if (mountainAmp > 0) features.push("mountains")
  if (mesa) features.push("mesas")

  // Lake basins carved into the heightfield
  const lakes: { cx: number; rx: number; depth: number }[] = []
  const lakeCount = 1 + rng.int(wide ? 3 : 2)
  for (let i = 0; i < lakeCount; i++) {
    const cx = W * rng.range(0.15, 0.85)
    lakes.push({
      cx,
      rx: Math.min(W * 0.18, rng.range(10, 30), cx - 6, W - 6 - cx),
      depth: rng.range(6, 15),
    })
  }

  // --- Surface heightfield (y grows downward) ---
  const surf = new Float32Array(W)
  const mountainness = new Float32Array(W)
  for (let x = 0; x < W; x++) {
    let y =
      groundAvg +
      noise.fbm1(x * hillF + 3.1, 4) *
        Math.min(hillAmp, Math.max(3, (groundAvg - effMin[x] - 28) * 0.5))
    // mountains: ridged noise in some regions
    const mm = smooth(-0.05, 0.45, noise.n1(x * 0.0055 + mountainOff))
    const ridge = 1 - Math.abs(noise.fbm1(x * 0.016 + 40, 3))
    // keep a band of open sky under the text for building in
    const maxRise = Math.max(0, groundAvg - (effMin[x] + 28))
    let m = mm * ridge * ridge * mountainAmp
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

  // --- 2D solidity: overhangs + caves ---
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
      if (solid && y < H - 2) {
        const depth = rel - 3 * N(x * 0.05 + 9, y * 0.05)
        if (depth > 10) {
          const t = Math.abs(N(x * 0.011, y * 0.022))
          const width = tunnelW * (0.6 + 1.0 * Math.max(0, N(x * 0.008 + 3, y * 0.008)))
          if (t < width) solid = false
          else if (depth > 16 && N(x * 0.03 + 50, y * 0.045) > cavernT) solid = false
        }
      }
      if (solid) grid[k] = DIRT
    }
    grid[(H - 1) * W + x] = DIRT
  }

  // Surface cave entrances: worms carved from the surface downward
  const worms = rng.int(wide ? 4 : 2) + (rng.chance(0.5) ? 1 : 0)
  const carved: number[] = []
  for (let i = 0; i < worms; i++) {
    let x = 10 + rng.next() * (W - 20)
    let y = surf[Math.floor(x)] + 1
    let ang = Math.PI * 0.5 + rng.range(-0.6, 0.6)
    const len = 25 + rng.int(60)
    const y0 = y
    const r0 = rng.range(3, 4.5)
    for (let s = 0; s < len; s++) {
      ang += N(i * 13.1, s * 0.08) * 0.35
      ang = Math.min(Math.PI * 0.8, Math.max(Math.PI * 0.2, ang))
      if (y - y0 > 40) break
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
            if (cy - y0 > 4) carved.push(cy * W + cx)
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
      if (rise > bestRise && rise > 26) {
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

  // --- Cleanup: drop floating crumbs, fill tiny air pockets ---
  removeFloating(w)
  fillPockets(w, 30)

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
    const slope = Math.abs(fs[Math.min(W - 1, x + 2)] - fs[Math.max(0, x - 2)]) / 4
    // stone starts about halfway down the ground band, regardless of hills above it
    const stoneTop = groundAvg + thick * (0.45 + 0.12 * noise.fbm1(x * 0.015 + 8, 3))
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
        grid[k] = slope > 1.8 && mountainness[x] > 0.3 ? ROCK : TURF
        continue
      }
      const yy = y + 3 * N(x * 0.07, y * 0.07)
      if (yy < stoneTop) {
        // dirt, with clay bands, gravel pockets and rocky outcrops in the mountains
        if (N(x * 0.015 + 20, y * 0.18) > 0.45) grid[k] = CLAY
        else if (N(x * 0.06 + 5, y * 0.06) > 0.62) grid[k] = GRAVEL
        else if (mountainness[x] > 0.35 && d > 3 && N(x * 0.04 + 61, y * 0.05) > 0.38)
          grid[k] = ROCK
      } else {
        const v = N(x * 0.006, y * 0.045 + 0.9 * noise.n1(x * 0.004 + 11))
        let t = ROCK
        if (v > 0.18) t = STONE
        if (v < -0.3 || yy > stoneTop + 25 + 8 * N(x * 0.02, 3)) t = SLATE
        if (N(x * 0.1 + 31, y * 0.1) > 0.62 && hash2(x, y, w.seed) < 0.3) t = COPPER
        if (
          yy > stoneTop + 12 &&
          N(x * 0.09 + 71, y * 0.09) > 0.66 &&
          hash2(x, y, w.seed + 1) < 0.3
        )
          t = GOLD
        grid[k] = t
      }
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
      if (stampIsland(w, cx, top, iw, rng)) features.push("island")
    }
  }

  // --- Water: surface lakes from the heightfield, then pools in caves ---
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
  for (const b of basins.slice(0, lakeCount)) {
    let lvl = b.lvl + Math.max(0, b.depth - 14)
    // no lake wider than about a third of the screen: lower it until it fits
    const wet = (l: number) => {
      let n = 0
      for (let xx = b.x0; xx < b.x1; xx++) if (fs[xx] > l) n++
      return n
    }
    while (wet(lvl) > W * 0.35 && lvl < H) lvl++
    for (let xx = b.x0; xx < b.x1; xx++) {
      for (let y = lvl; y < fs[xx]; y++) {
        const k = y * W + xx
        if (grid[k] === EMPTY) grid[k] = WATER
      }
    }
    features.push("lake")
  }
  const pools = 1 + rng.int(4)
  for (let i = 0; i < pools * 6 && i < 60; i++) {
    const px = 2 + rng.int(W - 4),
      py = fs[px] + 8 + rng.int(Math.max(1, H - fs[px] - 10))
    if (py >= H - 2) continue
    const k = py * W + px
    if (grid[k] !== EMPTY || !SOLID[grid[k + W]] || bg[k] === EMPTY) continue
    if (floodPool(w, px, py, 2 + rng.int(4), 260)) {
      features.push("pool")
      if (features.filter((f) => f === "pool").length >= pools) break
    }
  }

  // --- Sand only where there is water ---
  const toSand: number[] = []
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== WATER) continue
    const wx = k % W,
      wy = (k - wx) / W
    const r = bg[k] === EMPTY ? 2 + Math.floor(hash2(wx, wy, w.seed + 7) * 3) : 1
    for (let dy = -r; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const sx = wx + dx,
          sy = wy + dy
        if (sx < 0 || sx >= W || sy < 0 || sy >= H - 1) continue
        const sk = sy * W + sx
        const c = grid[sk]
        if (c === DIRT || c === TURF || c === CLAY || c === GRAVEL) toSand.push(sk)
      }
    }
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
        if ((above === DIRT || above === TURF || above === CLAY) && rng.chance(0.18)) {
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

function floodPool(w: World, x0: number, y0: number, depth: number, maxCells: number): boolean {
  const { W, grid } = w
  const lvl = y0 - depth
  const seen = new Set<number>()
  const q = [y0 * W + x0]
  seen.add(q[0])
  while (q.length) {
    const k = q.pop()!
    const x = k % W,
      y = (k - x) / W
    for (const n of [k - W, k + W, k - 1, k + 1]) {
      const nx = n % W,
        ny = (n - nx) / W
      if (ny < lvl || ny >= w.H || Math.abs(nx - x) > 1 || seen.has(n) || grid[n] !== EMPTY)
        continue
      seen.add(n)
      if (seen.size > maxCells) return false
      q.push(n)
    }
    void y
  }
  if (seen.size < 12) return false
  for (const k of seen) grid[k] = WATER
  return true
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
