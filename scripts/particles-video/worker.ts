// Video worker: owns some worlds, steps them to the tick each frame asks for, and
// draws them into the shared output frame through a camera (source rect -> dest rect).

import { parentPort, workerData } from "worker_threads"
import sharp from "sharp"
import {
  createWorld,
  step,
  checksum,
  World,
  CELL,
} from "../../quartz/components/scripts/particles/sim"
import { renderCells } from "../../quartz/components/scripts/particles/render"
import { drawGuy } from "../../quartz/components/scripts/particles/guys"

interface WorldSpec {
  id: number
  W: number
  H: number
  seed: number
  rects: number[][]
  bg: string
}
interface Draw {
  world: number
  tick: number
  dx: number
  dy: number
  dw: number
  dh: number
  // source rect in world pixels (CELL px per cell)
  sx: number
  sy: number
  sw: number
  sh: number
}

const { frame: shared, FW, FH } = workerData as { frame: SharedArrayBuffer; FW: number; FH: number }
const out = new Uint32Array(shared)

interface Slot {
  w: World
  bg3: Uint32Array // page screenshot at CELL scale
  bg1: Uint32Array // ... and at one pixel per cell
  cells: Uint32Array
  comp: Map<number, { buf: Uint32Array; tick: number }>
}
const slots = new Map<number, Slot>()

async function loadBg(path: string, W: number, H: number, s: number): Promise<Uint32Array> {
  const { data } = await sharp(path)
    .resize(W * s, H * s, { fit: "fill", kernel: s === CELL ? "nearest" : "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return new Uint32Array(data.buffer, data.byteOffset, data.length / 4).slice()
}

async function init(specs: WorldSpec[]) {
  for (const s of specs) {
    const w = createWorld(s.W, s.H, s.seed, s.rects)
    slots.set(s.id, {
      w,
      bg3: await loadBg(s.bg, s.W, s.H, CELL),
      bg1: await loadBg(s.bg, s.W, s.H, 1),
      cells: new Uint32Array(s.W * s.H),
      comp: new Map(),
    })
  }
}

// The world composited over the page at s pixels per cell
function composite(slot: Slot, s: number): Uint32Array {
  const w = slot.w
  const cached = slot.comp.get(s)
  if (cached && cached.tick === w.tick) return cached.buf
  const cw = w.W * s,
    ch = w.H * s
  const buf = cached?.buf ?? new Uint32Array(cw * ch)
  buf.set(s === CELL ? slot.bg3 : slot.bg1)
  renderCells(w, slot.cells)
  const cells = slot.cells
  for (let y = 0; y < ch; y++) {
    const cy = (y / s) | 0
    for (let x = 0; x < cw; x++) {
      const c = cells[cy * w.W + ((x / s) | 0)]
      if (c) buf[y * cw + x] = c
    }
  }
  const plot = (x: number, y: number, c: number) => {
    if (x >= 0 && x < cw && y >= 0 && y < ch) buf[y * cw + x] = c
  }
  for (const g of w.guys) drawGuy(g, plot, s, 0, 0)
  slot.comp.set(s, { buf, tick: w.tick })
  return buf
}

function draw(d: Draw) {
  const slot = slots.get(d.world)!
  const w = slot.w
  const scale = d.dw / d.sw // output px per world px
  const s = scale * CELL > 1.6 ? CELL : 1 // which composite to sample from
  const src = composite(slot, s)
  const cw = w.W * s,
    ch = w.H * s
  const k = s / CELL // world px -> composite px
  const x0 = Math.max(0, Math.floor(d.dx)),
    x1 = Math.min(FW, Math.ceil(d.dx + d.dw))
  const y0 = Math.max(0, Math.floor(d.dy)),
    y1 = Math.min(FH, Math.ceil(d.dy + d.dh))
  const step = (d.sw * k) / d.dw // composite px per output px
  const box = step > 1.3 ? Math.round(step) : 1
  for (let oy = y0; oy < y1; oy++) {
    const syf = (d.sy + ((oy + 0.5 - d.dy) * d.sh) / d.dh) * k
    const sy0 = Math.floor(syf - box / 2 + 0.5)
    for (let ox = x0; ox < x1; ox++) {
      const sxf = (d.sx + ((ox + 0.5 - d.dx) * d.sw) / d.dw) * k
      if (box === 1) {
        const sx = sxf | 0,
          sy = syf | 0
        if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) continue
        out[oy * FW + ox] = src[sy * cw + sx] | 0xff000000
      } else {
        const sx0 = Math.floor(sxf - box / 2 + 0.5)
        let r = 0,
          g = 0,
          b = 0,
          n = 0
        for (let yy = sy0; yy < sy0 + box; yy++) {
          if (yy < 0 || yy >= ch) continue
          for (let xx = sx0; xx < sx0 + box; xx++) {
            if (xx < 0 || xx >= cw) continue
            const c = src[yy * cw + xx]
            r += c & 255
            g += (c >>> 8) & 255
            b += (c >>> 16) & 255
            n++
          }
        }
        if (n)
          out[oy * FW + ox] =
            (0xff000000 | (((b / n) | 0) << 16) | (((g / n) | 0) << 8) | ((r / n) | 0)) >>> 0
      }
    }
  }
}

function stats(id: number) {
  const w = slots.get(id)!.w
  const c = w.colony
  return {
    tick: w.tick,
    guys: w.guys.length,
    tier: c.tier,
    towers: c.towers.filter((t) => t.complete).length,
    bridges: c.bridges.length,
    furniture: c.furniture.length,
    sum: checksum(w),
    // where the buildings are, for the camera
    towerBox: c.towers.length
      ? [
          Math.min(...c.towers.map((t) => t.x0)),
          Math.min(...c.towers.map((t) => t.roofTop)),
          Math.max(...c.towers.map((t) => t.x1)),
          Math.max(...c.towers.map((t) => t.base)),
        ]
      : null,
  }
}

parentPort!.on("message", async (msg) => {
  if (msg.type === "init") {
    await init(msg.worlds)
    parentPort!.postMessage({ type: "ready" })
  } else if (msg.type === "frame") {
    const targets = new Map<number, number>()
    for (const d of msg.draws as Draw[])
      if (slots.has(d.world)) targets.set(d.world, Math.max(targets.get(d.world) ?? 0, d.tick))
    for (const [id, t] of msg.advance as [number, number][])
      if (slots.has(id)) targets.set(id, Math.max(targets.get(id) ?? 0, t))
    for (const [id, t] of targets) {
      const w = slots.get(id)!.w
      while (w.tick < t) step(w)
    }
    for (const d of msg.draws as Draw[]) if (slots.has(d.world)) draw(d)
    const st: Record<number, ReturnType<typeof stats>> = {}
    for (const id of slots.keys()) st[id] = stats(id)
    parentPort!.postMessage({ type: "done", stats: st })
  }
})
