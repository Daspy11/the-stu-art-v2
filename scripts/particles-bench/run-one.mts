// One benchmark run: a world left alone for a long time, scored as it goes.
// Usage: tsx scripts/particles-bench/run-one.mts <seed> <layout> <ticks> <every> [--png out.png]
// Prints one JSON line per checkpoint and a final summary line.
//
// Score (per mille of the screen) = cells the colony has changed (built, in front or
// behind, or dug out of natural ground) minus a stuck-guy penalty, over the screen area.
import { readFileSync } from "fs"
import sharp from "sharp"
import { createWorld, step, CELL } from "../../quartz/components/scripts/particles/sim"
import { renderCells } from "../../quartz/components/scripts/particles/render"
import { drawGuy } from "../../quartz/components/scripts/particles/guys"
import {
  BUILT,
  BUILT_BG,
  SOLID,
  DYNAMIC,
  TEXT,
} from "../../quartz/components/scripts/particles/cells"

const args = process.argv.slice(2)
const pngAt = args.indexOf("--png")
const png = pngAt >= 0 ? args.splice(pngAt, 2)[1] : undefined
const [seed, layout, ticks, every] = [Number(args[0]), args[1], Number(args[2]), Number(args[3])]
const layouts = JSON.parse(readFileSync(new URL("./layouts.json", import.meta.url), "utf8"))
const { W, H, rects } = layouts[layout]
const w = createWorld(W, H, seed, rects)

// penalty weights, in cells
const TELEPORT = 25
const STRANDED_TICK = 0.02
const STUCK_TICK = 0.02

const natural = new Uint8Array(W * H)
for (let k = 0; k < W * H; k++) {
  const c = w.grid[k]
  natural[k] = SOLID[c] && c !== TEXT && !DYNAMIC[c] && !BUILT[c] ? 1 : 0
}
let teleports = 0,
  stranded = 0,
  stuck = 0,
  // the first version of the metric also counted guys standing about with nothing
  // to do, which made getting the work done sooner look bad; kept for comparison
  stuckOld = 0
type Track = {
  hist: number[][]
  quiet: number
  qx0: number
  qx1: number
  qy0: number
  qy1: number
  job: unknown // the job we last saw
  worked: boolean // ...and whether it got anywhere
  fails: number // jobs given up before they got going, while hanging about here
}
const track = new Map<number, Track>()

function changed() {
  let built = 0,
    dug = 0
  for (let k = 0; k < W * H; k++) {
    if (BUILT[w.grid[k]] || BUILT_BG[w.bg[k]]) built++
    else if (natural[k] && !SOLID[w.grid[k]]) dug++
  }
  return { built, dug }
}

const t0 = performance.now()
for (let i = 1; i <= ticks; i++) {
  const before = new Map(w.guys.map((g) => [g.id, [g.x, g.y, g.mode === "fall" ? 1 : 0]]))
  step(w)
  for (const g of w.guys) {
    if (g.mode === "dead") continue
    const b = before.get(g.id)
    if (b && !b[2] && Math.abs(g.x - b[0]) + Math.abs(g.y - b[1]) > 6) teleports++
    if (g.job?.kind === "escape") stranded++
    let t = track.get(g.id)
    if (!t)
      track.set(
        g.id,
        (t = {
          hist: [],
          quiet: 0,
          qx0: g.x,
          qx1: g.x,
          qy0: g.y,
          qy1: g.y,
          job: null,
          worked: false,
          fails: 0,
        }),
      )
    if (g.job !== t.job) {
      if (t.job && !t.worked) t.fails++
      t.job = g.job
      t.worked = false
    }
    if (g.job && g.job.phase === "work") t.worked = true
    if (i % 30 === 0) {
      // walking (or trying to) without getting anywhere, over the last 600 ticks
      t.hist.push([g.x, g.y])
      if (t.hist.length > 20) t.hist.shift()
      const going = g.job && g.job.phase === "go" && g.job.kind !== "escape"
      if (going && t.hist.length === 20) {
        let x0 = 1e9,
          x1 = -1e9,
          y0 = 1e9,
          y1 = -1e9
        for (const [x, y] of t.hist) {
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
          y0 = Math.min(y0, y)
          y1 = Math.max(y1, y)
        }
        if (x1 - x0 < 3 && y1 - y0 < 3) {
          stuck += 30
          stuckOld += 30
        }
      }
      // or going round in a loop: hanging about in one small spot for ages, starting
      // job after job that never gets going (just standing about with nothing to do
      // isn't being stuck)
      const idle = !g.job || (g.job.phase === "go" && g.job.kind !== "escape")
      if (idle) {
        t.qx0 = Math.min(t.qx0, g.x)
        t.qx1 = Math.max(t.qx1, g.x)
        t.qy0 = Math.min(t.qy0, g.y)
        t.qy1 = Math.max(t.qy1, g.y)
        t.quiet += 30
        if (t.qx1 - t.qx0 > 6 || t.qy1 - t.qy0 > 6) {
          t.quiet = 0
          t.fails = 0
          t.qx0 = t.qx1 = g.x
          t.qy0 = t.qy1 = g.y
        } else if (t.quiet >= 3000) {
          stuckOld += 30
          if (t.fails >= 3) stuck += 30
        }
      } else {
        t.quiet = 0
        t.fails = 0
        t.qx0 = t.qx1 = g.x
        t.qy0 = t.qy1 = g.y
      }
    }
  }
  if (i % every === 0 || i === ticks) {
    const { built, dug } = changed()
    const penalty = teleports * TELEPORT + stranded * STRANDED_TICK + stuck * STUCK_TICK
    const penaltyOld = teleports * TELEPORT + stranded * STRANDED_TICK + stuckOld * STUCK_TICK
    const c = w.colony
    console.log(
      JSON.stringify({
        seed,
        layout,
        t: i,
        W,
        H,
        score: +((1000 * (built + dug - penalty)) / (W * H)).toFixed(2),
        scoreOld: +((1000 * (built + dug - penaltyOld)) / (W * H)).toFixed(2),
        built,
        dug,
        penalty: +penalty.toFixed(1),
        teleports,
        stranded,
        stuck,
        stuckOld,
        guys: w.guys.length,
        towers: c.towers.filter((t) => t.complete).length,
        tier: c.tier,
        furniture: c.furniture.length,
        ms: +((performance.now() - t0) / i).toFixed(3),
      }),
    )
  }
}

if (png) {
  const cells = new Uint32Array(W * H)
  renderCells(w, cells)
  const PW = W * CELL,
    PH = H * CELL
  const img = new Uint32Array(PW * PH).fill(0xfff6f9fa)
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      const k = ((y / CELL) | 0) * W + ((x / CELL) | 0)
      const c = cells[k]
      if (w.grid[k] === TEXT) img[y * PW + x] = 0xffd8d8d8
      else if (c) img[y * PW + x] = c
    }
  for (const g of w.guys)
    drawGuy(
      g,
      (x, y, c) => x >= 0 && y >= 0 && x < PW && y < PH && (img[y * PW + x] = c),
      CELL,
      0,
      0,
    )
  await sharp(Buffer.from(img.buffer), { raw: { width: PW, height: PH, channels: 4 } })
    .png()
    .toFile(png)
}
