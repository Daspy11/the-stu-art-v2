// Latchford: hand-authored layout + all of its programmatic art.
// Tile (i,j) covers tx in [i,i+1], ty in [j,j+1]. +i runs down-right on screen,
// +j runs down-left. World screen coords come from iso.toScreen.

import { C, P, face, prism, cylinder, shadow, rope, mix, rng, Painter, place, R } from "./art.js"
import { Grid, toScreen } from "./iso.js"

export const N = 40
export const MAT = { none: 0, turf: 1, plank: 2, slate: 3 }

// ---------------------------------------------------------------- layout
export const L = {
  square: { i0: 17, j0: 18, i1: 21, j1: 22 },
  bell: { i: 19, j: 20 },
  hatch: { i: 21, j: 22 },
  moteHouse: { i0: 10, j0: 20, w: 3, d: 3 },
  step: { i: 13, j: 21 },
  tunney: { i: 20, j: 15 },
  desk: { i: 20, j: 14 },
  cistern: { x: 22.4, y: 13.2 },
  box: { i: 22, j: 15 },
  harrowHouse: { i0: 24, j0: 14, w: 3, d: 3 },
  harrow: { i: 24, j: 17 },
  brick: { i: 29, j: 17 },
  tub: { x: 29.2, y: 15.6 },
  rail: { i: 31, j: 18 },
}

export function tileC(i, j) {
  return toScreen(i + 0.5, j + 0.5)
}

const ISL = { cx: 0, cy: (N + 1) * 16, rx: 470, ry: 262 }

export function buildGrid() {
  const g = new Grid(N, N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const c = tileC(i, j)
      const dx = (c.x - ISL.cx) / ISL.rx,
        dy = (c.y - ISL.cy) / ISL.ry
      const a = Math.atan2(dy, dx)
      const edge = 1 + 0.06 * Math.sin(3 * a + 1.2) + 0.045 * Math.sin(5 * a + 0.4) + 0.03 * Math.sin(8 * a + 2)
      if (Math.hypot(dx, dy) < edge) {
        g.walk[g.idx(i, j)] = 1
        g.mat[g.idx(i, j)] = MAT.turf
      }
    }
  const setMat = (i, j, m) => g.isDeck(i, j) && (g.mat[g.idx(i, j)] = m)
  const sq = L.square
  for (let j = sq.j0; j <= sq.j1; j++) for (let i = sq.i0; i <= sq.i1; i++) setMat(i, j, MAT.plank)
  // paths (planks along tile axes)
  for (let i = 14; i < sq.i0; i++) setMat(i, 21, MAT.plank) // home -> square
  for (let j = 16; j < sq.j0; j++) setMat(19, j, MAT.plank) // square -> Tally
  for (let i = sq.i1 + 1; i <= 31; i++) setMat(i, 18, MAT.plank) // square -> east rail
  for (let j = 17; j <= 19; j++) setMat(30, j, MAT.plank)
  // slate yards
  for (let j = 13; j <= 16; j++) for (let i = 18; i <= 23; i++) if (!(j === 16 && i === 19)) setMat(i, j, MAT.slate)
  setMat(13, 20, MAT.slate)
  setMat(13, 21, MAT.slate)
  setMat(13, 22, MAT.slate)
  for (let i = 23; i <= 27; i++) setMat(i, 17, MAT.slate)
  return g
}

// ---------------------------------------------------------------- ground
export function drawGround(p, g) {
  const R0 = rng(7)
  // rim faces first (behind nothing; they hang below the surface)
  const D = 11
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (!g.isDeck(i, j)) continue
      const m = g.mat[g.idx(i, j)]
      const band = m === MAT.plank ? [C.plankLit, C.plankShade] : m === MAT.slate ? [C.slateLit, C.slateShade] : [C.mossLit, C.moss2]
      if (!g.isDeck(i, j + 1)) {
        face(p, [[i, j + 1, 0], [i + 1, j + 1, 0], [i + 1, j + 1, -D], [i, j + 1, -D]], C.soilLit)
        face(p, [[i, j + 1, 0], [i + 1, j + 1, 0], [i + 1, j + 1, -3], [i, j + 1, -3]], band[0])
      }
      if (!g.isDeck(i + 1, j)) {
        face(p, [[i + 1, j, 0], [i + 1, j + 1, 0], [i + 1, j + 1, -D], [i + 1, j, -D]], C.soilShade)
        face(p, [[i + 1, j, 0], [i + 1, j + 1, 0], [i + 1, j + 1, -3], [i + 1, j, -3]], band[1])
      }
    }
  // tops
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (!g.isDeck(i, j)) continue
      const m = g.mat[g.idx(i, j)]
      const e = 0.012
      if (m === MAT.turf) {
        face(p, [[i - e, j - e, 0], [i + 1 + e, j - e, 0], [i + 1 + e, j + 1 + e, 0], [i - e, j + 1 + e, 0]], C.moss)
      } else if (m === MAT.plank) {
        face(p, [[i - e, j - e, 0], [i + 1 + e, j - e, 0], [i + 1 + e, j + 1 + e, 0], [i - e, j + 1 + e, 0]], C.plankTop)
      } else {
        face(p, [[i - e, j - e, 0], [i + 1 + e, j - e, 0], [i + 1 + e, j + 1 + e, 0], [i - e, j + 1 + e, 0]], mix(C.slateShade, C.slateTop, 0.45))
      }
    }
  // details on top
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (!g.isDeck(i, j)) continue
      const m = g.mat[g.idx(i, j)]
      if (m === MAT.plank) {
        // boards run along the path direction; seams as thin dark gaps
        const alongJ = i === 19 && j < 18
        const alongI = !alongJ
        for (let k = 1; k < 4; k++) {
          const t = k / 4
          if (alongI) face(p, [[i, j + t - 0.012, 0], [i + 1, j + t - 0.012, 0], [i + 1, j + t + 0.012, 0], [i, j + t + 0.012, 0]], C.plankShade, 0.55)
          else face(p, [[i + t - 0.012, j, 0], [i + t + 0.012, j, 0], [i + t + 0.012, j + 1, 0], [i + t - 0.012, j + 1, 0]], C.plankShade, 0.55)
        }
        // staggered butt joints
        const off = ((i * 7 + j * 3) % 4) / 4
        for (let k = 0; k < 4; k++) {
          const a = (off + k * 0.37) % 1
          if (alongI) face(p, [[i + a, j + k / 4, 0], [i + a + 0.025, j + k / 4, 0], [i + a + 0.025, j + (k + 1) / 4, 0], [i + a, j + (k + 1) / 4, 0]], C.plankShade, 0.4)
          else face(p, [[i + k / 4, j + a, 0], [i + (k + 1) / 4, j + a, 0], [i + (k + 1) / 4, j + a + 0.025, 0], [i + k / 4, j + a + 0.025, 0]], C.plankShade, 0.4)
        }
        // lighter board here and there (worn)
        if ((i * 13 + j * 5) % 5 === 0) {
          const k = (i + j) % 4
          if (alongI) face(p, [[i, j + k / 4 + 0.02, 0], [i + 1, j + k / 4 + 0.02, 0], [i + 1, j + (k + 1) / 4 - 0.02, 0], [i, j + (k + 1) / 4 - 0.02, 0]], C.plankLit, 0.45)
          else face(p, [[i + k / 4 + 0.02, j, 0], [i + (k + 1) / 4 - 0.02, j, 0], [i + (k + 1) / 4 - 0.02, j + 1, 0], [i + k / 4 + 0.02, j + 1, 0]], C.plankLit, 0.45)
        }
      } else if (m === MAT.slate) {
        // flags of slate on dark grout
        const sub = 2
        for (let b = 0; b < sub; b++)
          for (let a = 0; a < sub; a++) {
            const x0 = i + a / sub + 0.035,
              y0 = j + b / sub + 0.035,
              s = 1 / sub - 0.07
            const v = (i * 3 + j * 5 + a * 7 + b * 11) % 3
            const col = v === 0 ? C.slateTop : v === 1 ? mix(C.slateTop, C.slateLit, 0.35) : mix(C.slateTop, C.slateShade, 0.2)
            face(p, [[x0, y0, 0], [x0 + s, y0, 0], [x0 + s, y0 + s, 0], [x0, y0 + s, 0]], col)
          }
      } else {
        // turf: occasional darker patches and grass tufts, deliberate and sparse
        const h = (i * 92821 + j * 68917) % 97
        if (h < 22) {
          const [sx, sy] = P(i + 0.5, j + 0.5)
          p.ellipse(sx + ((h % 7) - 3) * 3, sy + ((h % 5) - 2) * 1.5, 14 + (h % 4) * 3, 6 + (h % 3), C.moss2, 0.35)
        }
        if (h > 80) {
          const [sx, sy] = P(i + 0.3 + (h % 4) * 0.1, j + 0.6)
          tuft(p, sx, sy, 1)
        }
        if (h > 60 && h < 64) {
          const [sx, sy] = P(i + 0.6, j + 0.4)
          flower(p, sx, sy, h)
        }
      }
    }
  void R0
}

export function tuft(p, x, y, s = 1) {
  p.poly([x - 3 * s, y, x - 1.6 * s, y - 5 * s, x - 0.4 * s, y], C.moss2)
  p.poly([x - 1 * s, y, x + 0.6 * s, y - 7 * s, x + 1.6 * s, y], C.moss2)
  p.poly([x + 0.8 * s, y, x + 3 * s, y - 4.5 * s, x + 3.2 * s, y], C.mossLit)
}
function flower(p, x, y, h) {
  const cols = [C.wax, C.cream, "#d98b6a"]
  p.line([x, y, x, y - 5], 0.8, C.moss2)
  p.circle(x, y - 6, 1.6, cols[h % 3])
}

// ---------------------------------------------------------------- underside
// bottom silhouette of the deck rim (screen y of rim bottom at each screen x)
export function rimProfile(g) {
  const pts = new Map()
  const D = 11
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (!g.isDeck(i, j)) continue
      const segs = []
      if (!g.isDeck(i, j + 1)) segs.push([P(i, j + 1, -D), P(i + 1, j + 1, -D)])
      if (!g.isDeck(i + 1, j)) segs.push([P(i + 1, j, -D), P(i + 1, j + 1, -D)])
      for (const [[x0, y0], [x1, y1]] of segs) {
        for (let x = Math.ceil(Math.min(x0, x1)); x <= Math.floor(Math.max(x0, x1)); x++) {
          const t = (x - x0) / (x1 - x0 || 1)
          const y = y0 + (y1 - y0) * t
          if (!pts.has(x) || pts.get(x) < y) pts.set(x, y)
        }
      }
    }
  const xs = [...pts.keys()].sort((a, b) => a - b)
  return { xs, y: (x) => pts.get(Math.round(x)) ?? null, minX: xs[0], maxX: xs[xs.length - 1] }
}

export function drawUnderside(p, g, prof) {
  const r = rng(31)
  const x0 = prof.minX + 6,
    x1 = prof.maxX - 6
  const W = x1 - x0
  const cx = (x0 + x1) / 2
  const yAt = (x) => {
    for (let d = 0; d < 12; d++) {
      const v = prof.y(x + d) ?? prof.y(x - d)
      if (v != null) return v
    }
    return 0
  }
  // depth profile
  const depth = (x) => {
    const u = (x - cx) / (W / 2)
    return Math.max(0, Math.pow(Math.max(0, 1 - u * u), 0.75)) * 300
  }
  // columns of facets
  const cols = []
  let x = x0
  while (x < x1) {
    cols.push(x)
    x += 22 + r() * 30
  }
  cols.push(x1)
  const top = cols.map((x) => yAt(x) - 1)
  const mid = cols.map((x, k) => top[k] + 12 + depth(x) * (0.32 + r() * 0.12))
  const bot = cols.map((x, k) => top[k] + 16 + depth(x) * (0.72 + r() * 0.3) * (k % 2 ? 0.86 : 1))
  // upper band (cool, top tone): rim to mid
  for (let k = 0; k < cols.length - 1; k++) {
    const a = [cols[k], top[k]],
      b = [cols[k + 1], top[k + 1]]
    const m0 = [cols[k], mid[k]],
      m1 = [cols[k + 1], mid[k + 1]]
    const mx = (cols[k] + cols[k + 1]) / 2
    const mm = [mx + (r() - 0.5) * 10, (mid[k] + mid[k + 1]) / 2 + 6 + r() * 10]
    p.poly([...a, ...b, ...m1, ...mm, ...m0], C.rockTop)
    // facet split for a crisp cut
    p.poly([...a, ...mm, ...m0], mix(C.rockTop, C.rockShade, 0.45))
  }
  // lower mass: warm lit facets alternating with shade
  for (let k = 0; k < cols.length - 1; k++) {
    const mx = (cols[k] + cols[k + 1]) / 2
    const m0 = [cols[k], mid[k] - 2],
      m1 = [cols[k + 1], mid[k + 1] - 2]
    const tip = [mx + (r() - 0.5) * 14, Math.max(bot[k], bot[k + 1]) + 4 + r() * 16]
    p.poly([...m0, ...m1, ...tip], C.rockShade)
    // lit facet on the left (light comes up from below-left)
    p.poly([...m0, mx + (r() - 0.5) * 6, (mid[k] + mid[k + 1]) / 2 + 2, ...tip], C.rockLit)
    // warm underside near the tip
    const tt = 0.62
    const lx = m0[0] + (tip[0] - m0[0]) * tt,
      ly = m0[1] + (tip[1] - m0[1]) * tt
    const rx2 = m1[0] + (tip[0] - m1[0]) * tt,
      ry2 = m1[1] + (tip[1] - m1[1]) * tt
    p.poly([lx, ly, rx2, ry2, ...tip], C.rockWarm, 0.75)
  }
  // root-like tapers hanging from the deepest part
  const roots = []
  for (let k = 0; k < 9; k++) {
    const u = (k / 8 - 0.5) * 1.3
    const rx0 = cx + u * W * 0.42 + (r() - 0.5) * 30
    const base = yAt(rx0) + depth(rx0) * 0.78
    const len = 50 + depth(rx0) * (0.35 + r() * 0.55)
    roots.push([rx0, base, len])
  }
  for (const [rx0, base, len] of roots) {
    const w = 10 + r() * 12
    const bend = (r() - 0.5) * 18
    const tipx = rx0 + bend,
      tipy = base + len
    p.poly([rx0 - w, base - 6, rx0 + bend * 0.4, base + len * 0.5, tipx, tipy, rx0 - w * 0.2, base + len * 0.35], C.rockLit)
    p.poly([rx0 + w, base - 6, rx0 - w * 0.2, base + len * 0.35, tipx, tipy, rx0 + bend * 0.4 + w * 0.3, base + len * 0.55], C.rockShade)
    p.poly([rx0 - w * 0.2, base + len * 0.55, rx0 + bend * 0.5 + 2, base + len * 0.62, tipx, tipy], C.rockWarm)
  }
  return { cx, x0, x1, depth, yAt }
}

// the built keel: tarred timbers slung under the middle of the island
export function drawKeelFrame(p, u) {
  const { cx, yAt, depth } = u
  const ribs = []
  for (let k = -5; k <= 5; k++) ribs.push(cx + k * 46)
  const keelY = (x) => yAt(x) + depth(x) * 0.6 + 24
  // longitudinal keel beam following a gentle hull curve
  const pts = ribs.map((x) => [x, keelY(x)])
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k],
      [bx, by] = pts[k + 1]
    p.poly([ax, ay, bx, by, bx, by + 9, ax, ay + 9], C.tar2)
    p.poly([ax, ay + 6, bx, by + 6, bx, by + 9, ax, ay + 9], mix(C.tar2, C.wax, 0.25))
  }
  // ribs: posts from the rock down to the keel beam
  for (const x of ribs) {
    const y0 = yAt(x) + depth(x) * 0.25
    const y1 = keelY(x) + 9
    p.poly([x - 3.5, y0, x + 3.5, y0, x + 3.5, y1, x - 3.5, y1], C.tar)
    p.poly([x - 3.5, y0, x - 1, y0, x - 1, y1, x - 3.5, y1], C.tar2)
    p.rect(x - 3.5, y1 - 2.5, 7, 2.5, mix(C.tar2, C.wax, 0.3))
  }
  // a lower stringer
  const sy = (x) => yAt(x) + depth(x) * 0.42 + 12
  for (let k = 0; k < ribs.length - 1; k++) {
    const ax = ribs[k],
      bx = ribs[k + 1]
    p.poly([ax, sy(ax), bx, sy(bx), bx, sy(bx) + 5, ax, sy(ax) + 5], C.tar)
  }
  return { ribs, keelY }
}

// tells, graves, net-bags hanging beneath
export function drawHangings(p, u, kf, g, prof) {
  const r = rng(77)
  const lanterns = []
  const { ribs, keelY } = kf
  // the forty-one tells hanging from the keel beam
  const x0 = ribs[0] + 6,
    x1 = ribs[ribs.length - 1] - 6
  for (let k = 0; k < 41; k++) {
    const x = x0 + ((x1 - x0) * (k + 0.5)) / 41
    const y = keelY(x) + 8
    const len = 70 + r() * 90 + (k % 3) * 20
    const lean = (r() - 0.5) * 0.12
    const ex = x + lean * len,
      ey = y + len
    p.line([x, y, ex, ey], 0.7, C.rope, 0.85)
    // slate weight: small faceted drop
    p.poly([ex - 2.4, ey, ex, ey - 1.4, ex, ey + 5.5], C.slateLit)
    p.poly([ex + 2.4, ey, ex, ey - 1.4, ex, ey + 5.5], C.slateShade)
  }
  // graves: slate slabs in rope cradles, with tiny lanterns
  const graves = [
    [ribs[1] - 10, 120],
    [ribs[3] + 8, 210],
    [ribs[6] - 6, 150],
    [ribs[8] + 14, 250],
    [ribs[9] + 4, 110],
  ]
  for (const [gx, drop] of graves) {
    const top = keelY(gx) + 8
    const sy = top + drop
    const w = 26,
      h = 7
    // cradle ropes converge to a point on the beam
    p.line([gx, top, gx - w / 2, sy - 2], 0.8, C.rope)
    p.line([gx, top, gx + w / 2, sy - 2], 0.8, C.rope)
    p.line([gx, top, gx - w / 4, sy - 4], 0.6, C.rope, 0.7)
    // slab (iso-ish thick slab)
    p.poly([gx - w / 2, sy - 2, gx, sy - 6, gx + w / 2, sy - 2, gx, sy + 2], C.slateTop)
    p.poly([gx - w / 2, sy - 2, gx, sy + 2, gx, sy + 2 + h, gx - w / 2, sy - 2 + h], C.slateLit)
    p.poly([gx + w / 2, sy - 2, gx, sy + 2, gx, sy + 2 + h, gx + w / 2, sy - 2 + h], C.slateShade)
    // rope under the slab
    p.line([gx - w / 2, sy + h - 2, gx, sy + h + 2.4, gx + w / 2, sy + h - 2], 1, C.rope)
    // lantern hanging at the corner
    const lx = gx + w / 2 + 2,
      ly = sy + 12
    p.line([gx + w / 2 - 1, sy - 1, lx, ly - 3], 0.6, C.rope)
    p.rect(lx - 1.6, ly - 3, 3.2, 4.4, C.wax)
    p.rect(lx - 1.8, ly - 3.8, 3.6, 1, C.tar)
    lanterns.push([lx, ly - 1])
  }
  // net-bags of soil down the flanks
  const bagXs = [prof.minX + 40, prof.minX + 70, prof.minX + 115, prof.minX + 160, prof.maxX - 40, prof.maxX - 78, prof.maxX - 120, prof.maxX - 170]
  for (const bx of bagXs) {
    const top = u.yAt(bx) + 4
    const len = 30 + r() * 70
    bag(p, bx + (r() - 0.5) * 6, top, len, r)
  }
  return { lanterns }
}

function bag(p, x, top, len, r) {
  const y = top + len
  p.line([x, top, x, y - 9], 0.9, C.rope)
  const rx = 8 + r() * 4,
    ry = 9 + r() * 3
  // greens spilling from the top
  p.circle(x - 3, y - 9, 3.4, C.moss2)
  p.circle(x + 2, y - 10, 3.8, C.moss)
  p.circle(x + 5, y - 8, 2.6, C.moss2)
  p.ellipse(x, y, rx, ry, C.soil)
  p.ellipse(x - rx * 0.35, y + ry * 0.1, rx * 0.55, ry * 0.85, mix(C.soil, C.wax, 0.25))
  // net
  for (let k = -2; k <= 2; k++) p.line([x + k * rx * 0.36, y - ry * 0.85, x + k * rx * 0.2, y + ry * 0.95], 0.6, C.rope, 0.8)
  p.line([x - rx * 0.9, y - ry * 0.2, x + rx * 0.9, y - ry * 0.2], 0.6, C.rope, 0.8)
  p.line([x - rx * 0.8, y + ry * 0.45, x + rx * 0.8, y + ry * 0.45], 0.6, C.rope, 0.8)
}

// ---------------------------------------------------------------- props
// All props are drawn in local coordinates where P(0,0,0) is the footprint's
// min corner; they are placed at toScreen(i0, j0).

const TAR = { top: "#4a4a50", lit: C.tar2, shade: C.tar, roofTop: "#504f55", roofLit: "#46403b", roofBack: "#3a393e", cap: "#2f2b28" }
const GREY = { top: "#b3b0aa", lit: C.greyLit, shade: C.greyShade, roofTop: "#b7b4ae", roofLit: "#a8a49d", roofBack: "#9d9a94", cap: "#85827c" }

// arch-topped opening on a wall plane. plane "y": wall at y=Y, spans x; plane "x": wall at x=X, spans y
function opening(p, plane, at, a0, a1, z0, z1, color, alpha = 1) {
  const pts = []
  const mid = (a0 + a1) / 2,
    hw = (a1 - a0) / 2
  pts.push([a0, z0], [a1, z0], [a1, z1 - hw])
  for (let k = 1; k < 8; k++) {
    const t = (k / 8) * Math.PI
    pts.push([mid + Math.cos(t) * hw, z1 - hw + Math.sin(t) * hw * 1.6])
  }
  pts.push([a0, z1 - hw])
  const q = []
  for (const [a, z] of pts) q.push(...(plane === "y" ? P(a, at, z) : P(at, a, z)))
  p.poly(q, color, alpha)
}
function windowQuad(p, plane, at, a0, a1, z0, z1, color) {
  const q = plane === "y" ? [P(a0, at, z0), P(a1, at, z0), P(a1, at, z1), P(a0, at, z1)] : [P(at, a0, z0), P(at, a1, z0), P(at, a1, z1), P(at, a0, z1)]
  p.poly(q.flat(), color)
}

// round-shouldered house. ridge along x when along="x".
export function drawHouse(p, w, d, o = {}) {
  const pal = o.grey ? GREY : TAR
  const h = o.h ?? 24
  const along = o.along ?? (w >= d ? "x" : "y")
  shadow(p, ...P(w / 2 + 0.15, d / 2 + 0.15), (w + d) * 17, (w + d) * 8.5, 0.16)
  // slate skirt
  const sk = 0.07
  prism(p, -sk, -sk, w + sk, d + sk, 0, 7, C.slateTop, C.slateLit, C.slateShade)
  // walls
  prism(p, 0, 0, w, d, 6, h, pal.top, pal.lit, pal.shade, { noTop: true })
  // warm rim where the lit face meets the skirt (light from below)
  if (!o.grey) face(p, [[0, d, 6], [w, d, 6], [w, d, 7.5], [0, d, 7.5]], mix(pal.lit, C.wax, 0.35))
  // door + windows
  const door = o.door || { face: "x", at: d / 2 }
  const win = o.grey ? "#6e6b66" : C.wax
  const winShade = o.grey ? "#5f5c58" : "#b07a1c"
  if (door.face === "x") {
    if (o.ajar) {
      opening(p, "x", w, door.at - 0.28, door.at + 0.28, 6, 22, "#1d1a18")
      // door swung inward a little: a thin lit sliver
      opening(p, "x", w, door.at - 0.28, door.at - 0.12, 6, 21, mix(C.plankShade, C.grey, 0.4))
    } else {
      opening(p, "x", w, door.at - 0.28, door.at + 0.28, 6, 22, C.plankShade)
      opening(p, "x", w, door.at - 0.22, door.at + 0.22, 6, 20.5, mix(C.plankShade, C.tar, 0.3))
      const [kx, ky] = P(w, door.at + 0.14, 13)
      p.circle(kx, ky, 0.9, C.rope)
    }
    for (const a of door.win ?? [0.45, d - 0.45]) if (Math.abs(a - door.at) > 0.5) windowQuad(p, "x", w, a - 0.16, a + 0.16, 12, 19, winShade)
    for (const a of o.sideWin ?? [w * 0.5]) windowQuad(p, "y", d, a - 0.17, a + 0.17, 12, 19, win)
  } else {
    if (o.ajar) {
      opening(p, "y", d, door.at - 0.28, door.at + 0.28, 6, 22, "#1d1a18")
      opening(p, "y", d, door.at + 0.1, door.at + 0.28, 6, 21, mix(C.plankShade, C.grey, 0.4))
    } else {
      opening(p, "y", d, door.at - 0.28, door.at + 0.28, 6, 22, C.plankLit)
      opening(p, "y", d, door.at - 0.22, door.at + 0.22, 6, 20.5, C.plankTop)
      const [kx, ky] = P(door.at + 0.14, d, 13)
      p.circle(kx, ky, 0.9, C.rope)
    }
    for (const a of door.win ?? [0.45, w - 0.45]) if (Math.abs(a - door.at) > 0.5) windowQuad(p, "y", d, a - 0.17, a + 0.17, 12, 19, win)
    for (const a of o.sideWin ?? [d * 0.5]) windowQuad(p, "x", w, a - 0.16, a + 0.16, 12, 19, winShade)
  }
  // roof
  const rh = o.grey ? 11 : 15
  const ov = 0.14
  roofLoaf(p, w, d, h, rh, ov, along, pal)
  // chimney
  let chim = null
  if (o.chimney !== false) {
    const cxp = o.chimX ?? (along === "x" ? w * 0.72 : d * 0.5)
    const cx = along === "x" ? cxp : w * 0.5
    const cy = along === "x" ? d * 0.5 : o.chimX ?? d * 0.28
    prism(p, cx - 0.16, cy - 0.16, cx + 0.16, cy + 0.16, h + rh - 4, h + rh + 10, C.slateTop, C.slateLit, C.slateShade)
    prism(p, cx - 0.19, cy - 0.19, cx + 0.19, cy + 0.19, h + rh + 10, h + rh + 12.5, C.slateTop, C.slateLit, C.slateShade)
    const [sx, sy] = P(cx, cy, h + rh + 12.5)
    p.ellipse(sx, sy, 6.5, 3.2, "#1d1a18")
    chim = { x: sx, y: sy }
  }
  return { chim }
}

function roofLoaf(p, w, d, h, rh, ov, along, pal) {
  // profile across the ridge: [u, z]
  const prof = [
    [0, 0],
    [0.12, 0.55],
    [0.3, 0.92],
    [0.5, 1],
    [0.7, 0.92],
    [0.88, 0.55],
    [1, 0],
  ]
  if (along === "x") {
    const span = d + 2 * ov
    const X0 = -ov,
      X1 = w + ov
    const pt = (k, x) => [x, -ov + prof[k][0] * span, h + prof[k][1] * rh]
    for (let k = 0; k < prof.length - 1; k++) {
      const dz = prof[k + 1][1] - prof[k][1]
      const col = dz > 0.2 ? pal.roofBack : dz < -0.2 ? pal.roofLit : pal.roofTop
      face(p, [pt(k, X0), pt(k + 1, X0), pt(k + 1, X1), pt(k, X1)], k === 2 || k === 3 ? pal.roofTop : col)
    }
    // warm eave on the lit front edge
    face(p, [pt(5, X0), pt(6, X0), pt(6, X1), pt(5, X1)], pal.roofLit)
    face(p, [[X0, d + ov, h], [X1, d + ov, h], [X1, d + ov, h - 2], [X0, d + ov, h - 2]], mix(pal.roofLit, C.wax, 0.3))
    // end cap at +x (faces down-right, shade)
    face(p, prof.map((_, k) => pt(k, X1)), pal.cap)
    face(p, [pt(0, X1), pt(6, X1), [X1, d + ov, h - 2], [X1, -ov, h - 2]], mix(pal.cap, C.wax, 0.15))
  } else {
    const span = w + 2 * ov
    const Y0 = -ov,
      Y1 = d + ov
    const pt = (k, y) => [-ov + prof[k][0] * span, y, h + prof[k][1] * rh]
    for (let k = 0; k < prof.length - 1; k++) {
      const dz = prof[k + 1][1] - prof[k][1]
      const col = dz > 0.2 ? pal.roofBack : dz < -0.2 ? mix(pal.cap, pal.roofLit, 0.35) : pal.roofTop
      face(p, [pt(k, Y0), pt(k + 1, Y0), pt(k + 1, Y1), pt(k, Y1)], k === 2 || k === 3 ? pal.roofTop : col)
    }
    face(p, [[w + ov, Y0, h], [w + ov, Y1, h], [w + ov, Y1, h - 2], [w + ov, Y0, h - 2]], mix(pal.cap, C.wax, 0.15))
    // end cap at +y (faces down-left, lit)
    face(p, prof.map((_, k) => pt(k, Y1)), pal.roofLit)
    face(p, [pt(0, Y1), pt(6, Y1), [w + ov, Y1, h - 2], [-ov, Y1, h - 2]], mix(pal.roofLit, C.wax, 0.3))
  }
}

// Mote's doorstep, with a chip out of one corner. Origin = tile corner.
export function drawStep(p) {
  const x0 = 0.18,
    x1 = 0.82,
    y0 = 0.14,
    y1 = 0.86,
    z = 5
  const c = 0.17 // chip
  shadow(p, ...P(0.52, 0.52), 24, 11, 0.18)
  // sides
  face(p, [[x0, y1, 0], [x1 - c, y1, 0], [x1 - c, y1, z], [x0, y1, z]], C.slateLit)
  face(p, [[x1 - c, y1, 0], [x1, y1 - c, 0], [x1, y1 - c, z], [x1 - c, y1, z]], mix(C.slateLit, C.slateShade, 0.5))
  face(p, [[x1, y0, 0], [x1, y1 - c, 0], [x1, y1 - c, z], [x1, y0, z]], C.slateShade)
  // top with the chipped corner
  face(p, [[x0, y0, z], [x1, y0, z], [x1, y1 - c, z], [x1 - c, y1, z], [x0, y1, z]], C.slateTop)
  // worn hollow where feet go every morning
  const [hx, hy] = P(0.44, 0.48, z)
  p.ellipse(hx, hy, 10, 4.4, mix(C.slateTop, C.slateLit, 0.45))
  // the break: a pale fresh face
  face(p, [[x1 - c, y1, z], [x1, y1 - c, z], [x1, y1 - c, z - 1.5], [x1 - c, y1, z - 1.5]], "#8d8780")
}

export function drawTerrace(p, w, d, o = {}) {
  shadow(p, ...P(w / 2, d / 2), (w + d) * 16, (w + d) * 8, 0.12)
  prism(p, 0, 0, w, d, 0, 8, C.soil, C.plankLit, C.plankShade)
  // furrows
  for (let k = 0; k < d; k++) {
    const y = k + 0.5
    face(p, [[0.08, y - 0.18, 8], [w - 0.08, y - 0.18, 8], [w - 0.08, y + 0.18, 8], [0.08, y + 0.18, 8]], mix(C.soil, C.wax, 0.12))
  }
  // bean rows: poles with leaves, back to front
  const r = rng(o.seed || 5)
  for (let k = 0; k < d; k++) {
    const y = k + 0.5
    for (let x = 0.25; x < w; x += 0.42) {
      const [bx, by] = P(x, y, 8)
      const hgt = 16 + r() * 5
      p.line([bx, by, bx + 0.6, by - hgt], 0.9, C.rope)
      for (let t = 0.2; t < 1; t += 0.2) {
        const lx = bx + 0.6 * t + (r() - 0.5) * 3,
          ly = by - hgt * t
        p.circle(lx - 1.5, ly, 2.4 + r(), C.moss2)
        p.circle(lx + 1.4, ly - 1, 2.2 + r(), C.moss)
      }
      if (r() < 0.35) p.ellipse(bx + 2.4, by - hgt * 0.45, 0.9, 2.6, C.mossLit)
    }
  }
}

export function drawFogNet(p, L, o = {}) {
  // spars along x from 0..L at y=0
  const H = o.h ?? 70
  const poleAt = (x) => {
    prism(p, x - 0.07, -0.07, x + 0.07, 0.07, 0, H, C.tarTop, C.tar2, C.tar)
  }
  // guy ropes to the ground
  const [ax, ay] = P(0, 0, H - 4)
  const [gx, gy] = P(-0.6, 0.5, 0)
  p.line([ax, ay, gx, gy], 0.7, C.rope, 0.7)
  const [bx, by] = P(L, 0, H - 4)
  const [hx, hy] = P(L + 0.6, -0.5, 0)
  p.line([bx, by, hx, hy], 0.7, C.rope, 0.7)
  poleAt(0)
  // net panel
  const z0 = 18,
    z1 = H - 6
  const q = [P(0.07, 0, z0), P(L - 0.07, 0, z0), P(L - 0.07, 0, z1), P(0.07, 0, z1)].flat()
  p.poly(q, C.skyPale, 0.2)
  // mesh
  const cols = Math.round(L * 7)
  for (let k = 1; k < cols; k++) {
    const x = (L * k) / cols
    p.line([...P(x, 0, z0), ...P(x, 0, z1)], 0.5, C.rope, 0.45)
  }
  for (let z = z0; z <= z1; z += 5) p.line([...P(0.07, 0, z), ...P(L - 0.07, 0, z)], 0.5, C.rope, 0.45)
  // silk catching the light
  p.line([...P(L * 0.15, 0, z1), ...P(L * 0.55, 0, z0)], 0.8, "#fff8ea", 0.9)
  p.line([...P(L * 0.4, 0, z1), ...P(L * 0.85, 0, z0 + 8)], 0.6, "#fff8ea", 0.7)
  p.line([...P(L * 0.62, 0, z1 - 4), ...P(L * 0.95, 0, z1 - 22)], 0.7, C.glow, 0.85)
  // top spar
  p.line([...P(0, 0, z1 + 1), ...P(L, 0, z1 + 1)], 2.2, C.tar2)
  p.line([...P(0, 0, z0 - 1), ...P(L, 0, z0 - 1)], 1.4, C.rope)
  // drip trough
  prism(p, 0.05, -0.08, L - 0.05, 0.08, z0 - 6, z0 - 2, C.slateTop, C.slateLit, C.slateShade)
  poleAt(L)
}

export function drawCistern(p) {
  shadow(p, 0, 4, 44, 20, 0.16)
  const c = cylinder(p, 0, 0, 0.82, 0, 20, null, C.slateLit, C.slateShade)
  // rim and water
  p.ellipse(c.sx, c.yt, c.rx, c.ry, C.slateTop)
  p.ellipse(c.sx, c.yt + 0.6, c.rx - 4, c.ry - 2, "#3c4a55")
  p.ellipse(c.sx - 6, c.yt - 1, c.rx * 0.38, c.ry * 0.28, "#6e8794", 0.7)
  // rope bands
  for (const z of [6, 14]) {
    p.ellipse(c.sx, c.sy - z, c.rx + 0.5, c.ry + 0.5, C.rope, 1, 0, 0.1, Math.PI - 0.1)
    p.ellipse(c.sx, c.sy - z - 1.3, c.rx + 0.5, c.ry + 0.5, C.slateLit, 1, 0, 0.12, Math.PI - 0.12)
  }
  // fix lower band shading on the shade half
  // half lid (plank)
  p.poly([c.sx + 2, c.yt - c.ry + 1, c.sx + c.rx - 2, c.yt - 3, c.sx + c.rx * 0.6, c.yt + c.ry * 0.6, c.sx + 2, c.yt + c.ry - 1], C.plankTop)
  p.poly([c.sx + 2, c.yt + c.ry - 1, c.sx + c.rx * 0.6, c.yt + c.ry * 0.6, c.sx + c.rx * 0.6, c.yt + c.ry * 0.6 + 2.2, c.sx + 2, c.yt + c.ry + 1.2], C.plankShade)
  // the cup on its chain, hooked on the rim
  p.line([c.sx - c.rx + 6, c.yt + 2, c.sx - c.rx + 4, c.yt + 9], 0.6, C.rope)
  p.rrect(c.sx - c.rx + 1.5, c.yt + 9, 5, 5, 1.2, C.cream)
  p.rect(c.sx - c.rx + 4.5, c.yt + 9, 2, 5, "#cfc2a6")
}

export function drawDesk(p) {
  // tall standing desk, slanted top
  shadow(p, ...P(0.5, 0.5), 20, 9, 0.14)
  for (const [x, y] of [
    [0.15, 0.2],
    [0.85, 0.2],
    [0.15, 0.8],
    [0.85, 0.8],
  ])
    prism(p, x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0, 24, C.plankTop, C.plankLit, C.plankShade)
  prism(p, 0.1, 0.15, 0.9, 0.85, 22, 27, C.plankTop, C.plankLit, C.plankShade, { noTop: true })
  // slanted top, high at back
  face(p, [[0.06, 0.12, 31], [0.94, 0.12, 31], [0.94, 0.9, 26], [0.06, 0.9, 26]], C.plankLit)
  // open ledger
  face(p, [[0.2, 0.25, 30.2], [0.5, 0.25, 30.2], [0.5, 0.78, 27.2], [0.2, 0.78, 27.2]], C.cream)
  face(p, [[0.52, 0.25, 30.2], [0.82, 0.25, 30.2], [0.82, 0.78, 27.2], [0.52, 0.78, 27.2]], "#efe2c6")
  for (let k = 1; k < 5; k++) {
    const y = 0.28 + k * 0.09
    p.line([...P(0.24, y, 30.2 - k * 0.55), ...P(0.46, y, 30.2 - k * 0.55)], 0.5, C.ink, 0.6)
    p.line([...P(0.56, y, 30.2 - k * 0.55), ...P(0.74, y, 30.2 - k * 0.55)], 0.5, C.ink, 0.45)
  }
  // ink pot
  const [ix, iy] = P(0.9, 0.2, 31)
  p.rect(ix - 1.8, iy - 3, 3.6, 3.4, C.inkText)
  p.line([ix + 0.5, iy - 3, ix + 3.5, iy - 9], 0.6, C.cream)
}

export function drawTollBox(p) {
  shadow(p, ...P(0.5, 0.5), 12, 6, 0.16)
  prism(p, 0.42, 0.42, 0.58, 0.58, 0, 18, C.tarTop, C.tar2, C.tar)
  prism(p, 0.24, 0.26, 0.76, 0.74, 18, 30, C.slateTop, C.slateLit, C.slateShade)
  prism(p, 0.2, 0.22, 0.8, 0.78, 30, 32, C.slateTop, C.slateLit, C.slateShade)
  // coin slot and a wax seal
  face(p, [[0.38, 0.47, 32], [0.62, 0.47, 32], [0.62, 0.53, 32], [0.38, 0.53, 32]], "#1d1a18")
  const [sx, sy] = P(0.5, 0.74, 24)
  p.circle(sx - 4, sy, 1.8, C.wax)
}

// bell frame (posts + beam); bell is separate. Frame along x from 0..1.6 at y 0.5
export function drawBellFrame(p, front) {
  const H = 60
  const post = (x) => {
    prism(p, x - 0.09, 0.41, x + 0.09, 0.59, 0, H, C.tarTop, C.tar2, C.tar)
    // braces
  }
  if (!front) {
    shadow(p, ...P(0.8, 0.5), 46, 16, 0.14)
    // feet
    prism(p, -0.25, 0.3, 0.25, 0.7, 0, 4, C.tarTop, C.tar2, C.tar)
    prism(p, 1.35, 0.3, 1.85, 0.7, 0, 4, C.tarTop, C.tar2, C.tar)
    post(0)
    // brace
    p.line([...P(0.05, 0.5, 34), ...P(0.4, 0.5, H - 3)], 2.4, C.tar2)
    p.line([...P(1.55, 0.5, 34), ...P(1.2, 0.5, H - 3)], 2.4, C.tar)
    post(1.6)
    prism(p, -0.15, 0.42, 1.75, 0.58, H - 6, H, C.tarTop, C.tar2, C.tar)
    // mallet on a peg (left post, facing viewer)
    const [mx, my] = P(0.02, 0.59, 26)
    p.rect(mx - 0.6, my - 1, 4, 1.3, C.plankShade)
    p.line([mx + 2.8, my - 0.4, mx + 3.2, my + 11], 1.4, C.plankLit)
    p.rrect(mx + 0.4, my + 10, 6, 4.2, 1.4, C.plankTop)
    p.rect(mx + 3.4, my + 10, 3, 4.2, C.plankShade)
  }
}
export const BELL_PIVOT = { x: 0.8, y: 0.5, z: 54 }

// bell, origin at the yoke (pivot). mouthUp flips it above the pivot.
export function drawBell(p, mouthUp = false) {
  const s = mouthUp ? -1 : 1
  const Y = (v) => v * s
  // yoke
  p.rect(-6, Y(-1) - (s < 0 ? 3 : 0), 12, 3, C.tar2)
  const prof = [
    [-3.5, 2],
    [3.5, 2],
    [6.5, 6],
    [7.6, 14],
    [10.6, 19.5],
    [-10.6, 19.5],
    [-7.6, 14],
    [-6.5, 6],
  ]
  const pts = prof.flatMap(([x, y]) => [x, Y(y)])
  p.blob(pts, C.bronzeLit)
  p.clipBlob(pts)
  p.rect(1.5, -30, 20, 60, C.bronze)
  p.rect(5.5, -30, 20, 60, C.bronzeShade)
  // lip band (warm, light from below)
  p.poly([-12, Y(16.8), 12, Y(16.8), 12, Y(22), -12, Y(22)], mix(C.bronzeLit, C.glow, 0.35))
  p.unclip()
  // mouth
  p.ellipse(0, Y(19.4), 10.4, 2.3, mouthUp ? "#2a231b" : C.bronzeShade)
  if (mouthUp) p.ellipse(0, Y(19.4) + 0.6, 8.6, 1.6, "#1c1712")
}

export function drawHatch(p) {
  // open trapdoor, ladder poking up
  face(p, [[0.15, 0.15, 0.5], [0.85, 0.15, 0.5], [0.85, 0.85, 0.5], [0.15, 0.85, 0.5]], C.plankShade)
  face(p, [[0.2, 0.2, 0.5], [0.8, 0.2, 0.5], [0.8, 0.8, 0.5], [0.2, 0.8, 0.5]], "#16130f")
  // pale light coming up from below
  face(p, [[0.2, 0.62, 0.5], [0.8, 0.62, 0.5], [0.8, 0.8, 0.5], [0.2, 0.8, 0.5]], mix("#16130f", C.glow, 0.12))
  // lid laid open on the -x side
  face(p, [[-0.55, 0.18, 0], [0.12, 0.18, 0], [0.12, 0.82, 0], [-0.55, 0.82, 0]], C.plankTop)
  face(p, [[-0.55, 0.82, 0], [0.12, 0.82, 0], [0.12, 0.82, 2], [-0.55, 0.82, 2]], C.plankLit)
  face(p, [[-0.55, 0.18, 2], [0.12, 0.18, 2], [0.12, 0.82, 2], [-0.55, 0.82, 2]], C.plankTop)
  for (const y of [0.4, 0.6]) p.line([...P(-0.5, y, 2), ...P(0.07, y, 2)], 0.6, C.plankShade)
  const [rx, ry] = P(-0.4, 0.5, 2)
  p.ellipse(rx, ry, 2.6, 1.3, C.rope)
}
export function drawHatchLadder(p) {
  // rails above the opening
  for (const x of [0.32, 0.68]) prism(p, x - 0.035, 0.46, x + 0.035, 0.54, -4, 13, C.plankTop, C.plankLit, C.plankShade)
  p.line([...P(0.32, 0.5, 8), ...P(0.68, 0.5, 8)], 1.4, C.plankLit)
}

export function drawTub(p) {
  // oval wooden tub, origin at its centre on the ground plane (it hovers)
  const rx = 22,
    ry = 11,
    h = 11
  p.poly([-rx, -h, rx, -h, rx, 0, -rx, 0], C.plankLit)
  p.ellipse(0, 0, rx, ry, C.plankLit, 1, 0, 0, Math.PI)
  p.clipPoly([0, -h - ry - 2, rx + 2, -h - ry - 2, rx + 2, ry + 2, 0, ry + 2])
  p.poly([-rx, -h, rx, -h, rx, 0, -rx, 0], C.plankShade)
  p.ellipse(0, 0, rx, ry, C.plankShade, 1, 0, 0, Math.PI)
  p.unclip()
  // staves
  for (let k = -3; k <= 3; k++) {
    const x = (k / 3.6) * rx
    const yb = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * ry
    p.line([x, -h + yb * 0.9, x, yb - 0.5], 0.5, C.plankShade, 0.6)
  }
  // rope hoops
  for (const z of [2.5, 8]) {
    const pts = []
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI
      pts.push(Math.cos(a) * (rx + 0.4), Math.sin(a) * (ry + 0.4) - z)
    }
    p.line(pts, 1.3, C.rope)
  }
  p.ellipse(0, -h, rx, ry, C.plankTop)
  p.ellipse(0, -h + 0.8, rx - 2.4, ry - 1.6, C.plankShade)
  p.ellipse(-2, -h + 2, rx - 6, ry - 4.5, "#4a3b2e")
  // broom mast and bedsheet sail
  p.line([3, -h + 2, 4, -h - 44], 1.6, C.plankLit)
  p.ellipse(4.2, -h - 45, 3.2, 1.6, "#c9a35d")
  p.blob([5, -h - 41, 21, -h - 36, 23, -h - 18, 18, -h - 8, 5, -h - 9], C.cream)
  p.blob([12, -h - 38, 21, -h - 36, 23, -h - 18, 18, -h - 8, 14, -h - 10], "#e9dcc2")
  p.line([4.5, -h - 9, 18, -h - 8], 0.6, C.rope)
}

export function drawLoft(p) {
  // pigeon loft on stilts
  const w = 1.3,
    d = 1.1
  shadow(p, ...P(w / 2, d / 2), 34, 16, 0.14)
  for (const [x, y] of [
    [0.12, 0.12],
    [w - 0.12, 0.12],
    [0.12, d - 0.12],
    [w - 0.12, d - 0.12],
  ])
    prism(p, x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 22, C.tarTop, C.tar2, C.tar)
  // ladder
  for (const x of [0.4, 0.62]) p.line([...P(x, d + 0.3, 0), ...P(x, d, 22)], 0.9, C.plankLit)
  for (let z = 3; z < 22; z += 4) p.line([...P(0.4, d + 0.3 - (z / 22) * 0.3, z), ...P(0.62, d + 0.3 - (z / 22) * 0.3, z)], 0.7, C.plankLit)
  prism(p, 0, 0, w, d, 22, 44, C.tarTop, C.tar2, C.tar, { noTop: true })
  // openings
  for (const a of [0.3, 0.65, 1.0]) opening(p, "y", d, a - 0.1, a + 0.1, 32, 40, "#16130f")
  for (const a of [0.35, 0.75]) opening(p, "x", w, a - 0.1, a + 0.1, 32, 40, "#16130f")
  // landing board
  prism(p, 0.05, d, w - 0.05, d + 0.22, 30, 31.5, C.plankTop, C.plankLit, C.plankShade)
  // pitched slate roof, ridge along x
  const ov = 0.12,
    rz = 44,
    rh = 14
  face(p, [[-ov, -ov, rz], [w + ov, -ov, rz], [w + ov, d / 2, rz + rh], [-ov, d / 2, rz + rh]], mix(C.slateTop, C.slateShade, 0.3))
  face(p, [[-ov, d + ov, rz], [w + ov, d + ov, rz], [w + ov, d / 2, rz + rh], [-ov, d / 2, rz + rh]], C.slateLit)
  face(p, [[w + ov, -ov, rz], [w + ov, d + ov, rz], [w + ov, d / 2, rz + rh]], C.slateShade)
  face(p, [[-ov, d + ov, rz], [w + ov, d + ov, rz], [w + ov, d + ov, rz - 1.5], [-ov, d + ov, rz - 1.5]], mix(C.slateLit, C.wax, 0.3))
  // weathervane: a little wax pigeon
  const [vx, vy] = P(w * 0.3, d / 2, rz + rh)
  p.line([vx, vy, vx, vy - 9], 0.7, C.tar)
  p.ellipse(vx + 0.5, vy - 10, 3, 1.5, C.wax)
}
export const LOFT_PERCH = (w = 1.3, d = 1.1) => [P(0.25, d / 2, 58), P(0.7, d / 2, 58), P(1.05, d / 2, 58), P(0.5, d + 0.18, 31.5)]

export function drawBarrel(p) {
  shadow(p, 0, 2, 11, 5, 0.18)
  const c = cylinder(p, 0, 0, 0.22, 0, 13, C.plankTop, C.plankLit, C.plankShade)
  for (const z of [3, 10]) p.ellipse(c.sx, c.sy - z, c.rx + 0.3, c.ry + 0.3, C.rope, 1, 0, 0.05, Math.PI - 0.05)
  p.ellipse(c.sx, c.yt, c.rx, c.ry, C.plankTop)
  p.ellipse(c.sx, c.yt, c.rx - 2, c.ry - 1, mix(C.plankTop, C.plankShade, 0.35))
}
export function drawSlates(p) {
  shadow(p, ...P(0.5, 0.5), 14, 7, 0.16)
  for (let k = 0; k < 4; k++) {
    const o = k * 0.02
    prism(p, 0.25 + o, 0.3 - o, 0.75 + o, 0.7 - o, k * 3, k * 3 + 2.4, C.slateTop, C.slateLit, C.slateShade)
  }
}
export function drawSack(p) {
  shadow(p, 0, 1, 9, 4.5, 0.18)
  p.blob([-6, 0, -7, -6, -3, -11, 3, -11, 7, -6, 6, 0], "#b9a37b")
  p.blob([1, -10.5, 3, -11, 7, -6, 6, 0, 1.5, 0.4], "#9a8562")
  p.line([-2.5, -10.4, 2.5, -10.4], 1.2, C.rope)
}
export function drawWashing(p, L) {
  // line along x between two posts, cloths hanging
  for (const x of [0, L]) prism(p, x - 0.05, -0.05, x + 0.05, 0.05, 0, 26, C.tarTop, C.tar2, C.tar)
  const [ax, ay] = P(0, 0, 24),
    [bx, by] = P(L, 0, 24)
  rope(p, ax, ay, bx, by, 3, 0.7)
  const cols = [C.cream, C.rope, "#c9d3d6", C.cream, "#d98b6a"]
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.7) / 4.4
    const x = ax + (bx - ax) * t,
      y = ay + (by - ay) * t + Math.sin(t * Math.PI) * 6
    const w = 7 + (k % 2) * 3
    p.poly([x - w / 2, y - w / 4, x + w / 2, y + w / 4, x + w / 2, y + w / 4 + 10, x - w / 2, y - w / 4 + 9], cols[k])
  }
}
export function drawGoat(p) {
  shadow(p, 0, 1, 10, 4, 0.2)
  for (const x of [-5, -3, 3.5, 5.5]) p.line([x, -6, x, 0], 1.3, x < 0 ? "#cfc5b2" : "#bdb3a0")
  p.blob([-8, -7, -6, -12, 4, -12.5, 7, -8, 4, -5, -6, -5], "#e8e0cf")
  p.blob([0, -12.4, 4, -12.5, 7, -8, 4, -5, 0, -5], "#d5ccb9")
  p.ellipse(8, -12, 3, 2.4, "#e8e0cf")
  p.poly([7.4, -14, 6, -17.5, 8.4, -14.6], "#8a7a64")
  p.circle(9.4, -12.4, 0.6, C.inkText)
  p.poly([-8, -9, -10, -11, -8.6, -8], "#d5ccb9")
}

export function drawRailSeg(p, ax, ay, bx, by, sag = 2.5) {
  // post at a, rope to b (screen-space local coords)
  p.rect(ax - 1.4, ay - 13, 2.8, 13, C.tar2)
  p.rect(ax + 0.2, ay - 13, 1.2, 13, C.tar)
  p.circle(ax, ay - 13, 1.6, C.tar2)
  rope(p, ax, ay - 11, bx, by - 11, sag, 1.1)
  rope(p, ax, ay - 5.5, bx, by - 5.5, sag * 0.6, 0.9, C.rope, 0.85)
}
