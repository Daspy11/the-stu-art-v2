// Isometric 2:1 projection, tile grid with collision, and grid A*.

export const TILE_W = 64
export const TILE_H = 32

// tile-space (continuous) -> world screen position (top surface)
export function toScreen(tx, ty) {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) }
}
export function toTile(x, y) {
  const a = x / (TILE_W / 2),
    b = y / (TILE_H / 2)
  return { tx: (a + b) / 2, ty: (b - a) / 2 }
}
// screen-space direction -> tile-space direction (unnormalised)
export function screenDirToTile(dx, dy) {
  return { x: dx / 32 / 2 + dy / 16 / 2, y: dy / 16 / 2 - dx / 32 / 2 }
}

export class Grid {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.walk = new Uint8Array(w * h) // 1 = deck exists
    this.block = new Uint8Array(w * h) // 1 = blocked by prop
    this.mat = new Uint8Array(w * h) // material id
  }
  idx(i, j) {
    return j * this.w + i
  }
  inb(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h
  }
  isDeck(i, j) {
    return this.inb(i, j) && this.walk[this.idx(i, j)] === 1
  }
  passable(i, j) {
    return this.inb(i, j) && this.walk[this.idx(i, j)] === 1 && this.block[this.idx(i, j)] === 0
  }
  blockRect(i0, j0, i1, j1) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.inb(i, j)) this.block[this.idx(i, j)] = 1
  }
  // circle-ish body at (x,y) tile space radius r
  free(x, y, r = 0.22) {
    const pts = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ]
    for (const [px, py] of pts) if (!this.passable(Math.floor(px), Math.floor(py))) return false
    return true
  }
  // move with sliding along obstacles
  move(pos, dx, dy, r) {
    let moved = false
    if (dx && this.free(pos.x + dx, pos.y, r)) {
      pos.x += dx
      moved = true
    }
    if (dy && this.free(pos.x, pos.y + dy, r)) {
      pos.y += dy
      moved = true
    }
    if (!moved && (dx || dy)) {
      // try nudging around corners
      const s = Math.hypot(dx, dy)
      for (const [ax, ay] of [
        [dx + dy * 0.7, dy - dx * 0.7],
        [dx - dy * 0.7, dy + dx * 0.7],
      ]) {
        const l = Math.hypot(ax, ay) || 1
        const nx = (ax / l) * s * 0.7,
          ny = (ay / l) * s * 0.7
        if (this.free(pos.x + nx, pos.y + ny, r)) {
          pos.x += nx
          pos.y += ny
          return true
        }
      }
    }
    return moved
  }
  nearestPassable(i, j) {
    if (this.passable(i, j)) return { i, j }
    for (let rad = 1; rad < 8; rad++)
      for (let dj = -rad; dj <= rad; dj++)
        for (let di = -rad; di <= rad; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue
          if (this.passable(i + di, j + dj)) return { i: i + di, j: j + dj }
        }
    return null
  }
  // 8-dir A*, no corner cutting. Returns list of tile centres.
  path(si, sj, gi, gj) {
    const g = this.nearestPassable(gi, gj)
    if (!g) return null
    gi = g.i
    gj = g.j
    const W = this.w,
      N = W * this.h
    const cost = new Float32Array(N).fill(Infinity)
    const from = new Int32Array(N).fill(-1)
    const open = [[0, si, sj]]
    cost[this.idx(si, sj)] = 0
    const hfn = (i, j) => {
      const dx = Math.abs(i - gi),
        dy = Math.abs(j - gj)
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy)
    }
    let iter = 0
    while (open.length && iter++ < 6000) {
      let bi = 0
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k
      const [, i, j] = open.splice(bi, 1)[0]
      if (i === gi && j === gj) break
      const c0 = cost[this.idx(i, j)]
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = i + di,
            nj = j + dj
          if (!this.passable(ni, nj)) continue
          if (di && dj && (!this.passable(i + di, j) || !this.passable(i, j + dj))) continue
          const nc = c0 + (di && dj ? 1.414 : 1)
          const k = this.idx(ni, nj)
          if (nc < cost[k]) {
            cost[k] = nc
            from[k] = this.idx(i, j)
            open.push([nc + hfn(ni, nj), ni, nj])
          }
        }
    }
    if (!isFinite(cost[this.idx(gi, gj)])) return null
    const out = []
    let k = this.idx(gi, gj)
    while (k !== -1 && k !== this.idx(si, sj)) {
      out.push({ x: (k % W) + 0.5, y: Math.floor(k / W) + 0.5 })
      k = from[k]
    }
    out.reverse()
    return out
  }
}
