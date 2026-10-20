// Navigation for guys. A node is a cell a guy's feet can occupy: free, with room for
// the body above and something to stand on (solid ground, the top of a ladder, a ladder
// to hang on, or the surface of water). Paths are found with Dijkstra over those nodes.

import { SOLID, CLIMB, WATER } from "./cells"
import type { World } from "./world"

export const BODY_H = 8 // feet cell + 7 cells of headroom
export const MAX_STEP = 7 // tallest ledge a guy will climb up onto
export const MAX_DROP = 30

export function solidAt(w: World, x: number, y: number): boolean {
  if (x < 0 || x >= w.W || y >= w.H) return true
  if (y < 0) return false
  return SOLID[w.grid[y * w.W + x]] === 1
}

export function climbAt(w: World, x: number, y: number): boolean {
  if (x < 0 || x >= w.W || y < 0 || y >= w.H) return false
  return CLIMB[w.grid[y * w.W + x]] === 1
}

export function waterAt(w: World, x: number, y: number): boolean {
  if (x < 0 || x >= w.W || y < 0 || y >= w.H) return false
  return w.grid[y * w.W + x] === WATER
}

export function headroom(w: World, x: number, y: number, n = BODY_H): boolean {
  for (let i = 0; i < n; i++) if (solidAt(w, x, y - i)) return false
  return true
}

// Something under the feet: directly below, or the corner of a ledge beside us
// (but not the face of a wall, or guys would cling to cliffs)
export function supported(w: World, x: number, y: number): boolean {
  if (solidAt(w, x, y + 1) || climbAt(w, x, y + 1)) return true
  for (let dx = -1; dx <= 1; dx += 2) {
    if ((solidAt(w, x + dx, y + 1) || climbAt(w, x + dx, y + 1)) && !solidAt(w, x + dx, y))
      return true
  }
  return false
}

export function standable(w: World, x: number, y: number): boolean {
  if (x < 1 || x >= w.W - 1 || y < 1 || y >= w.H) return false
  if (solidAt(w, x, y) || !headroom(w, x, y)) return false
  if (waterAt(w, x, y)) return !waterAt(w, x, y - 1) // swim at the surface
  return supported(w, x, y) || climbAt(w, x, y)
}

// Dijkstra with a reusable binary heap and generation-stamped arrays
export class Nav {
  W: number
  H: number
  dist: Float32Array
  prev: Int32Array
  seen: Uint32Array
  goal: Uint32Array
  goalId: Int32Array
  gen = 1
  goalGen = 1
  heapN: Int32Array
  heapD: Float32Array
  heapSize = 0
  popD = 0
  visited: number[] = []
  lastGoalId = -1
  expanded = 0

  constructor(W: number, H: number) {
    this.W = W
    this.H = H
    const n = W * H
    this.dist = new Float32Array(n)
    this.prev = new Int32Array(n)
    this.seen = new Uint32Array(n)
    this.goal = new Uint32Array(n)
    this.goalId = new Int32Array(n)
    this.heapN = new Int32Array(1 << 14)
    this.heapD = new Float32Array(1 << 14)
  }

  // Start a new goal set. Mark cells with markGoal / markBox, then search().
  beginGoals() {
    this.goalGen++
  }
  markGoal(x: number, y: number, id: number) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return
    const k = y * this.W + x
    if (this.goal[k] === this.goalGen) return
    this.goal[k] = this.goalGen
    this.goalId[k] = id
  }
  markBox(cx: number, cy: number, dx: number, dyMin: number, dyMax: number, id: number) {
    for (let y = cy + dyMin; y <= cy + dyMax; y++) {
      for (let x = cx - dx; x <= cx + dx; x++) this.markGoal(x, y, id)
    }
  }
  isGoal(k: number): boolean {
    return this.goal[k] === this.goalGen
  }

  private push(n: number, d: number) {
    if (this.heapSize >= this.heapN.length) {
      const nn = new Int32Array(this.heapN.length * 2)
      nn.set(this.heapN)
      const nd = new Float32Array(this.heapD.length * 2)
      nd.set(this.heapD)
      this.heapN = nn
      this.heapD = nd
    }
    let i = this.heapSize++
    const hn = this.heapN,
      hd = this.heapD
    while (i > 0) {
      const p = (i - 1) >> 1
      if (hd[p] <= d) break
      hn[i] = hn[p]
      hd[i] = hd[p]
      i = p
    }
    hn[i] = n
    hd[i] = d
  }
  private pop(): number {
    const hn = this.heapN,
      hd = this.heapD
    const top = hn[0]
    this.popD = hd[0]
    const n = hn[--this.heapSize]
    const d = hd[this.heapSize]
    let i = 0
    const size = this.heapSize
    while (true) {
      let c = 2 * i + 1
      if (c >= size) break
      if (c + 1 < size && hd[c + 1] < hd[c]) c++
      if (hd[c] >= d) break
      hn[i] = hn[c]
      hd[i] = hd[c]
      i = c
    }
    hn[i] = n
    hd[i] = d
    return top
  }

  // Nearest standable node to (x, y) within r cells
  snap(w: World, x: number, y: number, r = 4): number {
    const ix = Math.round(x),
      iy = Math.round(y)
    if (standable(w, ix, iy)) return iy * w.W + ix
    for (let d = 1; d <= r; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
          if (standable(w, ix + dx, iy + dy)) return (iy + dy) * w.W + ix + dx
        }
      }
    }
    return -1
  }

  // Calls cb(next, cost) for every move out of node k
  edges(w: World, k: number, cb: (n: number, cost: number) => void) {
    const W = this.W
    const x = k % W,
      y = (k - x) / W
    const inWater = waterAt(w, x, y)
    for (let dx = -1; dx <= 1; dx += 2) {
      const nx = x + dx
      if (standable(w, nx, y)) {
        cb(y * W + nx, inWater || waterAt(w, nx, y) ? 7 : 2)
        continue
      }
      // hop up onto a ledge
      let found = false
      for (let up = 1; up <= MAX_STEP; up++) {
        const ny = y - up
        if (solidAt(w, x, ny - BODY_H + 1)) break
        if (standable(w, nx, ny)) {
          cb(ny * W + nx, 2 + up * 1.5)
          found = true
          break
        }
      }
      if (found) continue
      // walk off an edge and drop
      if (!solidAt(w, nx, y) && headroom(w, nx, y)) {
        for (let ny = y + 1; ny <= y + MAX_DROP; ny++) {
          if (solidAt(w, nx, ny)) break
          if (standable(w, nx, ny)) {
            cb(ny * W + nx, 2 + (ny - y) * 0.25)
            break
          }
        }
      }
    }
    // ladders
    // (you can also reach up and grab the bottom rung of a ladder over your head)
    if ((climbAt(w, x, y) || climbAt(w, x, y - 1)) && standable(w, x, y - 1)) cb(k - W, 3)
    if (climbAt(w, x, y + 1) && standable(w, x, y + 1)) cb(k + W, 3)
  }

  // The safe set: nodes reachable from home that can also walk back to it. Searches
  // stay inside it, so nobody wanders down a drop they can't climb back up.
  safe: Uint32Array = new Uint32Array(0)
  safeGoalsOnly = false // goals only count if they're in the safe set
  safeGen = 0
  safeCount = 0
  computeSafe(w: World, home: number) {
    const n = this.W * this.H
    if (this.safe.length !== n) this.safe = new Uint32Array(n)
    this.safeGen++
    this.safeCount = 0
    if (home < 0) return
    // forward flood, recording edges reversed
    this.search(w, home, n, false, false)
    const nodes = this.visited.slice()
    const index = new Map<number, number>()
    for (let i = 0; i < nodes.length; i++) index.set(nodes[i], i)
    const head = new Int32Array(nodes.length).fill(-1)
    const next: number[] = []
    const from: number[] = []
    for (let i = 0; i < nodes.length; i++) {
      this.edges(w, nodes[i], (m) => {
        const j = index.get(m)
        if (j === undefined) return
        from.push(i)
        next.push(head[j])
        head[j] = from.length - 1
      })
    }
    // walk the reversed edges from home
    const seen = new Uint8Array(nodes.length)
    const h = index.get(home)
    if (h === undefined) return
    const q = [h]
    seen[h] = 1
    while (q.length) {
      const j = q.pop()!
      this.safe[nodes[j]] = this.safeGen
      this.safeCount++
      for (let e = head[j]; e >= 0; e = next[e]) {
        const i = from[e]
        if (!seen[i]) {
          seen[i] = 1
          q.push(i)
        }
      }
    }
  }
  isSafe(k: number): boolean {
    return this.safe.length > 0 && this.safe[k] === this.safeGen
  }

  // Returns the node path (excluding the start) to the cheapest goal, or null.
  // With wantGoal=false it just floods outward and fills `visited`.
  // With restrict, the search stays in the safe set (unless it starts outside it).
  search(
    w: World,
    start: number,
    maxExpand = 24000,
    wantGoal = true,
    restrict = true,
    goalSafe = false,
  ): number[] | null {
    this.gen++
    if (this.gen === 0xffffffff) {
      this.seen.fill(0)
      this.gen = 1
    }
    const gen = this.gen
    this.heapSize = 0
    this.visited.length = 0
    this.lastGoalId = -1
    this.dist[start] = 0
    this.prev[start] = -1
    this.seen[start] = gen
    this.push(start, 0)
    const lim = restrict && this.safeGen > 0 && this.isSafe(start)
    let expanded = 0
    let d0 = 0,
      k = 0
    const relax = (n: number, cost: number) => {
      if (lim && this.safe[n] !== this.safeGen) return
      const d = d0 + cost
      if (this.seen[n] === gen) {
        if (d >= this.dist[n]) return
      } else this.seen[n] = gen
      this.dist[n] = d
      this.prev[n] = k
      this.push(n, d)
    }
    while (this.heapSize > 0 && expanded < maxExpand) {
      k = this.pop()
      d0 = this.dist[k]
      if (this.popD > d0) continue // stale heap entry
      expanded++
      if (
        wantGoal &&
        ((this.goal[k] === this.goalGen &&
          (!this.safeGoalsOnly || this.safe[k] === this.safeGen)) ||
          (goalSafe && this.safe[k] === this.safeGen))
      ) {
        this.expanded = expanded
        this.lastGoalId = this.goalId[k]
        const path: number[] = []
        let c = k
        while (c !== start && c >= 0) {
          path.push(c)
          c = this.prev[c]
        }
        path.reverse()
        return path
      }
      this.visited.push(k)
      this.edges(w, k, relax)
    }
    this.expanded = expanded
    return null
  }
}
