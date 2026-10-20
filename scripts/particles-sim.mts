// Runs the landing-page world headlessly and reports how the colony is doing.
// Usage: npm run simulate -- [seed] [ticks] [--size 480x300] [--png out.png]
import sharp from "sharp"
import { createWorld, step, checksum, CELL } from "../quartz/components/scripts/particles/sim"
import { renderCells } from "../quartz/components/scripts/particles/render"
import { drawGuy } from "../quartz/components/scripts/particles/guys"
import { TIER_NAMES } from "../quartz/components/scripts/particles/colony"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : undefined
}
const [W, H] = (flag("--size") ?? "480x300").split("x").map(Number)
const png = flag("--png")
const seed = Number(args[0] ?? 1)
const ticks = Number(args[1] ?? 20000)
// roughly where the landing page's text sits on a 1440x900 screen
const s = W / 480
const rects = [
  [107, 36, 362, 46],
  [107, 54, 362, 72],
  [107, 77, 212, 85],
  [120, 92, 312, 117],
  [107, 124, 192, 134],
].map((r) => r.map((v) => v * s))

const w = createWorld(W, H, seed, rects)
const t0 = performance.now()
for (let i = 1; i <= ticks; i++) {
  step(w)
  if (i % 10000 === 0 || i === ticks) {
    const c = w.colony
    console.log(
      `tick ${i}: ${TIER_NAMES[c.tier]}, ${w.guys.length} guys, ${c.towers.filter((t) => t.complete).length} towers, ` +
        `${c.bridges.length} bridges, ${c.furniture.length} furniture, wood ${c.stock[1]}, stone ${c.stock[2]}, ` +
        `${((performance.now() - t0) / i).toFixed(2)}ms/tick, checksum ${checksum(w).toString(16)}`,
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
      const c = cells[((y / CELL) | 0) * W + ((x / CELL) | 0)]
      if (c) img[y * PW + x] = c
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
  console.log("wrote", png)
}
