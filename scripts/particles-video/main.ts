// Renders the brag video: many seeded worlds simulated in parallel, a timelapse,
// zooms into individual colonies, every screen size, and a determinism check.
//
//   npx quartz build
//   node scripts/particles-video/capture.mjs video-out/capture
//   npx tsx scripts/particles-video/main.ts video-out/capture video-out/particles.mp4
//
// Needs ffmpeg on the PATH.

import { Worker } from "worker_threads"
import { spawn } from "child_process"
import { readFileSync } from "fs"
import { cpus } from "os"
import sharp from "sharp"

const [capDir = "video-out/capture", outFile = "video-out/particles.mp4"] = process.argv.slice(2)
const FW = 1920,
  FH = 1080,
  FPS = 30
const CELL = 3
const BG = 0xff1a1714 // ABGR: #14171a
const QUICK = process.env.QUICK === "1" // short dry run

type Size = "desktop" | "tablet" | "phone"
const cap: Record<Size, { W: number; H: number; rects: number[][] }> = {
  desktop: JSON.parse(readFileSync(`${capDir}/desktop.json`, "utf8")),
  tablet: JSON.parse(readFileSync(`${capDir}/tablet.json`, "utf8")),
  phone: JSON.parse(readFileSync(`${capDir}/phone.json`, "utf8")),
}

// --- Worlds ---
interface Spec {
  id: number
  size: Size
  seed: number
  worker: number
}
const NW = Math.max(2, Math.min(8, cpus().length))
const specs: Spec[] = []
const GRID_SEEDS = Array.from({ length: 16 }, (_, i) => i + 1)
GRID_SEEDS.forEach((seed, i) => specs.push({ id: i, size: "desktop", seed, worker: i % NW }))
const SIZE_SEED = 21
const sizeIds = { phone: 100, tablet: 101, desktop: 102 } as const
specs.push({ id: 100, size: "phone", seed: SIZE_SEED, worker: 0 })
specs.push({ id: 101, size: "tablet", seed: SIZE_SEED, worker: 1 % NW })
specs.push({ id: 102, size: "desktop", seed: SIZE_SEED, worker: 2 % NW })
const TWIN_SEED = 42
specs.push({ id: 200, size: "desktop", seed: TWIN_SEED, worker: 3 % NW })
specs.push({ id: 201, size: "desktop", seed: TWIN_SEED, worker: ((3 % NW) + 1) % NW })
const specById = new Map(specs.map((s) => [s.id, s]))

// --- Workers ---
const frameBuf = new SharedArrayBuffer(FW * FH * 4)
const frame32 = new Uint32Array(frameBuf)
const workers: Worker[] = []
type Stats = {
  tick: number
  guys: number
  tier: number
  towers: number
  bridges: number
  furniture: number
  sum: number
  towerBox: number[] | null
}
const stats = new Map<number, Stats>()

function call(wk: Worker, msg: any): Promise<any> {
  return new Promise((res) => {
    const on = (m: any) => {
      wk.off("message", on)
      res(m)
    }
    wk.on("message", on)
    wk.postMessage(msg)
  })
}

async function startWorkers() {
  for (let i = 0; i < NW; i++) {
    workers.push(
      new Worker(new URL("./worker-boot.mjs", import.meta.url), {
        workerData: { frame: frameBuf, FW, FH },
      }),
    )
  }
  await Promise.all(
    workers.map((wk, i) =>
      call(wk, {
        type: "init",
        worlds: specs
          .filter((s) => s.worker === i)
          .map((s) => ({
            id: s.id,
            W: cap[s.size].W,
            H: cap[s.size].H,
            seed: s.seed,
            rects: cap[s.size].rects,
            bg: `${capDir}/${s.size}.png`,
          })),
      }),
    ),
  )
}

interface Draw {
  world: number
  tick: number
  dx: number
  dy: number
  dw: number
  dh: number
  sx: number
  sy: number
  sw: number
  sh: number
}

// Draw layers in order (later layers on top); each layer runs on all workers at once
async function renderLayers(layers: Draw[][], advance: [number, number][] = []) {
  frame32.fill(BG)
  for (let li = 0; li < layers.length; li++) {
    const draws = layers[li]
    const res = await Promise.all(
      workers.map((wk, i) =>
        call(wk, {
          type: "frame",
          draws: draws.filter((d) => specById.get(d.world)!.worker === i),
          advance: li === 0 ? advance.filter(([id]) => specById.get(id)!.worker === i) : [],
        }),
      ),
    )
    for (const r of res)
      for (const [id, s] of Object.entries(r.stats)) stats.set(Number(id), s as Stats)
  }
}

// --- Layout helpers ---
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
type Rect = [number, number, number, number] // x, y, w, h

function fit(sw: number, sh: number, box: Rect): Rect {
  const s = Math.min(box[2] / sw, box[3] / sh)
  const w = sw * s,
    h = sh * s
  return [box[0] + (box[2] - w) / 2, box[1] + (box[3] - h) / 2, w, h]
}

const TOP = 92
function gridRects(): Rect[] {
  const cols = 4,
    rows = 4,
    gap = 10
  const cw = (FW - 80 - gap * (cols - 1)) / cols
  const ch = (FH - TOP - 24 - gap * (rows - 1)) / rows
  const { W, H } = cap.desktop
  const rects: Rect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      rects.push(fit(W * CELL, H * CELL, [40 + c * (cw + gap), TOP + r * (ch + gap), cw, ch]))
  }
  return rects
}
const GRID = gridRects()

function fullDraw(id: number, tick: number, dest: Rect, src?: Rect): Draw {
  const s = specById.get(id)!
  const { W, H } = cap[s.size]
  const [sx, sy, sw, sh] = src ?? [0, 0, W * CELL, H * CELL]
  return { world: id, tick, dx: dest[0], dy: dest[1], dw: dest[2], dh: dest[3], sx, sy, sw, sh }
}

// --- Text overlays (rendered with sharp from SVG) ---
interface Label {
  x: number
  y: number
  text: string
  size: number
  anchor?: "start" | "middle" | "end"
  weight?: number
  color?: string
  box?: boolean
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
const overlayCache = new Map<string, Buffer>()
async function overlay(labels: Label[], fade = 1) {
  if (!labels.length || fade <= 0) return
  const parts = labels.map((l) => {
    const anchor = l.anchor ?? "start"
    const fill = l.color ?? "#f4efe6"
    const t = `<text x="${l.x}" y="${l.y}" font-family="Inter, DejaVu Sans, sans-serif" font-size="${l.size}" font-weight="${l.weight ?? 500}" fill="${fill}" text-anchor="${anchor}">${esc(l.text)}</text>`
    if (!l.box) return t
    const w = l.text.length * l.size * 0.56 + 16
    const bx = anchor === "end" ? l.x - w + 8 : anchor === "middle" ? l.x - w / 2 : l.x - 8
    return (
      `<rect x="${bx}" y="${l.y - l.size - 2}" width="${w}" height="${l.size + 10}" rx="5" fill="rgba(20,23,26,0.72)"/>` +
      t
    )
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}"><g opacity="${fade.toFixed(3)}">${parts.join("")}</g></svg>`
  let raw = overlayCache.get(svg)
  if (!raw) {
    raw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()
    if (overlayCache.size > 400) overlayCache.clear()
    overlayCache.set(svg, raw)
  }
  const px = new Uint8Array(frameBuf)
  for (let i = 0; i < raw.length; i += 4) {
    const a = raw[i + 3]
    if (!a) continue
    const ia = 255 - a
    px[i] = (raw[i] * a + px[i] * ia) / 255
    px[i + 1] = (raw[i + 1] * a + px[i + 1] * ia) / 255
    px[i + 2] = (raw[i + 2] * a + px[i + 2] * ia) / 255
  }
}

const fmt = (n: number) => n.toLocaleString("en-US")
const TIERS = ["Shelter", "Carpentry", "Masonry", "Engineering"]
function tileLabel(id: number, r: Rect, showStats: boolean): Label[] {
  const s = specById.get(id)!
  const st = stats.get(id)
  const out: Label[] = [{ x: r[0] + 10, y: r[1] + 22, text: `seed ${s.seed}`, size: 15, box: true }]
  if (showStats && st)
    out.push({
      x: r[0] + r[2] - 10,
      y: r[1] + r[3] - 10,
      text: `${st.towers} towers · ${st.guys} guys · ${TIERS[st.tier]}`,
      size: 13,
      anchor: "end",
      box: true,
    })
  return out
}
function caption(title: string, sub = ""): Label[] {
  const out: Label[] = [{ x: 40, y: 50, text: title, size: 32, weight: 700 }]
  if (sub) out.push({ x: 40, y: 80, text: sub, size: 18, color: "#bdb5a8" })
  return out
}

// --- ffmpeg ---
const ff = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${FW}x${FH}`,
    "-r",
    String(FPS),
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outFile,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
)
let frames = 0
async function emit() {
  const buf = Buffer.from(frameBuf.slice(0))
  frames++
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r))
}

// --- The film ---
const sec = (s: number) => Math.round((QUICK ? s * 0.25 : s) * FPS)
const LAPSE_END = QUICK ? 20000 : 100000

async function main() {
  const t0 = Date.now()
  await startWorkers()
  console.log(`workers ready (${NW}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  const gridIds = GRID_SEEDS.map((_, i) => i)
  const gridLayer = (tick: number | ((id: number) => number)) =>
    gridIds.map((id) => fullDraw(id, typeof tick === "number" ? tick : tick(id), GRID[id]))
  const log = (name: string) =>
    console.log(`${name}: ${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`)

  // 1. Sixteen fresh worlds
  for (let f = 0, n = sec(4); f < n; f++) {
    await renderLayers([gridLayer(0)])
    await overlay([
      ...caption(
        "16 worlds, 16 seeds, tick 0",
        "Every landscape is generated from its seed: hills, mesas, caves, lakes, strata, forests",
      ),
      ...gridIds.flatMap((id) => tileLabel(id, GRID[id], false)),
    ])
    await emit()
  }
  log("intro")

  // 2. Timelapse, all sixteen in parallel
  const lapse = sec(19)
  for (let f = 0; f < lapse; f++) {
    const t = Math.round(LAPSE_END * Math.pow((f + 1) / lapse, 1.7))
    await renderLayers([gridLayer(t)])
    await overlay([
      ...caption(
        `Timelapse · tick ${fmt(t)}`,
        "Same rules everywhere: fell trees, build towers, ladders and bridges, furnish rooms, attract more guys",
      ),
      ...gridIds.flatMap((id) => tileLabel(id, GRID[id], true)),
    ])
    await emit()
    if (f % 60 === 0) log(`lapse ${f}/${lapse}`)
  }

  // 3/4. Zoom into the two busiest colonies, let them run live for a bit
  const ranked = [...gridIds].sort((a, b) => {
    const sa = stats.get(a)!,
      sb = stats.get(b)!
    return (
      sb.towers * 3 + sb.bridges * 2 + sb.guys / 5 - (sa.towers * 3 + sa.bridges * 2 + sa.guys / 5)
    )
  })
  for (const id of ranked.slice(0, 2)) {
    const { W, H } = cap.desktop
    const full: Rect = [0, 0, W * CELL, H * CELL]
    const box = stats.get(id)!.towerBox
    // a 16:9 window around the buildings, about a third of the screen wide
    let focus: Rect = full
    if (box) {
      const cx = ((box[0] + box[2]) / 2) * CELL,
        cy = ((box[1] + box[3]) / 2) * CELL
      const fw = Math.min(W * CELL, Math.max((box[2] - box[0] + 30) * CELL, W * CELL * 0.36))
      const fh = (fw * 9) / 16
      focus = [
        Math.max(0, Math.min(W * CELL - fw, cx - fw / 2)),
        Math.max(0, Math.min(H * CELL - fh, cy - fh / 2)),
        fw,
        fh,
      ]
    }
    let tick = stats.get(id)!.tick
    const phases: [number, (u: number) => { dest: Rect; src: Rect }, string][] = [
      [
        sec(2),
        (u) => ({
          dest: lerpRect(GRID[id], [0, 0, FW, FH], ease(u)),
          src: lerpRect(full, fitSrc(full), ease(u)),
        }),
        "zoom in",
      ],
      [sec(2.5), () => ({ dest: [0, 0, FW, FH], src: fitSrc(full) }), "hold"],
      [
        sec(2.5),
        (u) => ({ dest: [0, 0, FW, FH], src: lerpRect(fitSrc(full), focus, ease(u)) }),
        "push",
      ],
      [sec(4), () => ({ dest: [0, 0, FW, FH], src: focus }), "close"],
      [
        sec(2.5),
        (u) => ({
          dest: lerpRect([0, 0, FW, FH], GRID[id], ease(u)),
          src: lerpRect(focus, full, ease(u)),
        }),
        "out",
      ],
    ]
    for (const [n, cam, name] of phases) {
      for (let f = 0; f < n; f++) {
        tick += name === "close" || name === "push" ? 2 : 3 // live speed
        const { dest, src } = cam(f / n)
        await renderLayers([gridLayer((g) => stats.get(g)!.tick), [fullDraw(id, tick, dest, src)]])
        const st = stats.get(id)!
        const fade = name === "out" ? 1 - ease(f / n) : name === "zoom in" ? ease(f / n) : 1
        await overlay(
          [
            {
              x: 40,
              y: FH - 40,
              text: `seed ${specById.get(id)!.seed} · tick ${fmt(st.tick)} · ${TIERS[st.tier]} · ${st.towers} towers · ${st.bridges} bridge${st.bridges === 1 ? "" : "s"} · ${st.furniture} pieces of furniture · ${st.guys} guys`,
              size: 22,
              box: true,
            },
          ],
          fade,
        )
        await emit()
      }
    }
    log(`zoom seed ${specById.get(id)!.seed}`)
  }

  // 5. Every screen size, same seed
  {
    const n = sec(12)
    const end = QUICK ? 15000 : 80000
    const area: Rect = [40, TOP + 10, FW - 80, FH - TOP - 50]
    const sizes: Size[] = ["phone", "tablet", "desktop"]
    // widths proportional to aspect so heights match
    const asp = sizes.map((s) => (cap[s].W * CELL) / (cap[s].H * CELL))
    const gap = 30
    const h = Math.min(area[3], (area[2] - gap * 2) / asp.reduce((a, b) => a + b, 0))
    let x = area[0] + (area[2] - (asp.reduce((a, b) => a + b, 0) * h + gap * 2)) / 2
    const rects: Rect[] = sizes.map((s, i) => {
      const r: Rect = [x, area[1] + (area[3] - h) / 2, asp[i] * h, h]
      x += asp[i] * h + gap
      return r
    })
    for (let f = 0; f < n; f++) {
      const t = Math.round(end * Math.pow((f + 1) / n, 1.5))
      await renderLayers([sizes.map((s, i) => fullDraw(sizeIds[s], t, rects[i]))])
      await overlay([
        ...caption(
          `Any screen: phone, tablet, desktop · seed ${SIZE_SEED} · tick ${fmt(t)}`,
          "Terrain is fitted around the page's text, which the guys treat as solid and never build against",
        ),
        ...sizes.map((s, i) => ({
          x: rects[i][0] + 10,
          y: rects[i][1] + rects[i][3] + 26,
          text: `${s} ${cap[s].W * CELL}×${cap[s].H * CELL}`,
          size: 16,
          color: "#bdb5a8",
        })),
      ])
      await emit()
    }
    log("sizes")
  }

  // 6. Determinism: the same seed on two different threads, side by side
  {
    const n = sec(10)
    const end = QUICK ? 10000 : 50000
    const { W, H } = cap.desktop
    const half = (FW - 120) / 2
    const ra = fit(W * CELL, H * CELL, [40, TOP + 40, half, FH - TOP - 140])
    const rb = fit(W * CELL, H * CELL, [80 + half, TOP + 40, half, FH - TOP - 140])
    for (let f = 0; f < n; f++) {
      const t = Math.round(end * Math.pow((f + 1) / n, 1.4))
      await renderLayers([[fullDraw(200, t, ra), fullDraw(201, t, rb)]])
      const a = stats.get(200)!,
        b = stats.get(201)!
      const same = a.sum === b.sum
      const hex = (v: number) => (v >>> 0).toString(16).padStart(8, "0")
      await overlay([
        ...caption(
          `Reproducible · seed ${TWIN_SEED} simulated twice, on two separate threads`,
          "Same seed and screen in, same world out: a checksum of every cell and every guy, each frame",
        ),
        {
          x: ra[0] + ra[2] / 2,
          y: ra[1] + ra[3] + 40,
          text: `thread ${specById.get(200)!.worker} · tick ${fmt(a.tick)} · checksum ${hex(a.sum)}`,
          size: 20,
          anchor: "middle",
        },
        {
          x: rb[0] + rb[2] / 2,
          y: rb[1] + rb[3] + 40,
          text: `thread ${specById.get(201)!.worker} · tick ${fmt(b.tick)} · checksum ${hex(b.sum)}`,
          size: 20,
          anchor: "middle",
        },
        {
          x: FW / 2,
          y: FH - 24,
          text: same ? "identical ✓" : "MISMATCH",
          size: 22,
          anchor: "middle",
          weight: 700,
          color: same ? "#8fd18f" : "#ff6b6b",
        },
      ])
      await emit()
      if (!same) console.log("checksum mismatch at", t)
    }
    log("twins")
  }

  // 7. Back to the sixteen
  for (let f = 0, n = sec(5); f < n; f++) {
    await renderLayers([gridLayer((g) => stats.get(g)!.tick)])
    const all = gridIds.map((g) => stats.get(g)!)
    const towers = all.reduce((a, s) => a + s.towers, 0),
      guys = all.reduce((a, s) => a + s.guys, 0),
      furn = all.reduce((a, s) => a + s.furniture, 0)
    await overlay([
      ...caption(
        `16 worlds after ${fmt(LAPSE_END)} ticks`,
        `${towers} towers · ${furn} pieces of furniture · ${guys} guys · no seed cherry-picked (seeds 1–16)`,
      ),
      ...gridIds.flatMap((id) => tileLabel(id, GRID[id], true)),
    ])
    await emit()
  }
  log("outro")

  ff.stdin.end()
  await new Promise((r) => ff.on("close", r))
  for (const wk of workers) await wk.terminate()
  console.log(`wrote ${outFile}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]
}
// The source rect for filling a 16:9 frame from the whole world (cropping a little)
function fitSrc(full: Rect): Rect {
  const h = (full[2] * 9) / 16
  return [0, full[3] - h, full[2], h]
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
