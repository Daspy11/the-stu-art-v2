// A worker for fast.mts: runs benchmark worlds headless (no stick-figure animation,
// which is only for looks and doesn't change what happens) and scores them exactly
// like run-one.mts does.
import { parentPort } from "worker_threads"
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

const layouts = JSON.parse(readFileSync(new URL("./layouts.json", import.meta.url), "utf8"))
const TELEPORT = 25,
  STRANDED_TICK = 0.02,
  STUCK_TICK = 0.02

type Track = {
  px: number
  py: number
  pf: boolean
  hist: Float64Array // last 20 samples, x then y
  hn: number
  hi: number
  quiet: number
  qx0: number
  qx1: number
  qy0: number
  qy1: number
  job: unknown
  worked: boolean
  fails: number
}

async function run(job: {
  seed: number
  layout: string
  ticks: number
  every: number
  png?: string
}) {
  const { seed, layout, ticks, every, png } = job
  const { W, H, rects } = layouts[layout]
  const w = createWorld(W, H, seed, rects)
  w.headless = true
  const natural = new Uint8Array(W * H)
  for (let k = 0; k < W * H; k++) {
    const c = w.grid[k]
    natural[k] = SOLID[c] && c !== TEXT && !DYNAMIC[c] && !BUILT[c] ? 1 : 0
  }
  let teleports = 0,
    stranded = 0,
    stuck = 0,
    stuckOld = 0
  const track = new Map<number, Track>()
  const rows: Record<string, number | string>[] = []
  const t0 = performance.now()
  for (let i = 1; i <= ticks; i++) {
    // let the skeletons settle before the final screenshot
    if (png && i === ticks - 300) w.headless = false
    step(w)
    const sample = i % 30 === 0
    for (const g of w.guys) {
      if (g.mode === "dead") continue
      let t = track.get(g.id)
      if (!t) {
        t = {
          px: g.x,
          py: g.y,
          pf: g.mode === "fall",
          hist: new Float64Array(40),
          hn: 0,
          hi: 0,
          quiet: 0,
          qx0: g.x,
          qx1: g.x,
          qy0: g.y,
          qy1: g.y,
          job: null,
          worked: false,
          fails: 0,
        }
        track.set(g.id, t)
      } else if (!t.pf && Math.abs(g.x - t.px) + Math.abs(g.y - t.py) > 6) teleports++
      t.px = g.x
      t.py = g.y
      t.pf = g.mode === "fall"
      if (g.job?.kind === "escape") stranded++
      if (g.job !== t.job) {
        if (t.job && !t.worked) t.fails++
        t.job = g.job
        t.worked = false
      }
      if (g.job && g.job.phase === "work") t.worked = true
      if (!sample) continue
      t.hist[t.hi * 2] = g.x
      t.hist[t.hi * 2 + 1] = g.y
      t.hi = (t.hi + 1) % 20
      if (t.hn < 20) t.hn++
      const going = g.job && g.job.phase === "go" && g.job.kind !== "escape"
      if (going && t.hn === 20) {
        let x0 = 1e9,
          x1 = -1e9,
          y0 = 1e9,
          y1 = -1e9
        for (let j = 0; j < 20; j++) {
          const x = t.hist[j * 2],
            y = t.hist[j * 2 + 1]
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
        if (x1 - x0 < 3 && y1 - y0 < 3) {
          stuck += 30
          stuckOld += 30
        }
      }
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
    if (i % every === 0 || i === ticks) {
      let built = 0,
        dug = 0
      for (let k = 0; k < W * H; k++) {
        if (BUILT[w.grid[k]] || BUILT_BG[w.bg[k]]) built++
        else if (natural[k] && !SOLID[w.grid[k]]) dug++
      }
      const penalty = teleports * TELEPORT + stranded * STRANDED_TICK + stuck * STUCK_TICK
      const penaltyOld = teleports * TELEPORT + stranded * STRANDED_TICK + stuckOld * STUCK_TICK
      const c = w.colony
      rows.push({
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
      })
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
        if (w.grid[k] === TEXT) img[y * PW + x] = 0xffd8d8d8
        else if (cells[k]) img[y * PW + x] = cells[k]
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
  return rows
}

parentPort!.on("message", async (job) => parentPort!.postMessage(await run(job)))
