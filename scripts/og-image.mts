// Renders the default link-preview image (quartz/static/og-image.png): a grown landing-page
// world with the site name in the sky. Fetches fonts from Google Fonts.
// Usage: npx tsx scripts/og-image.mts [seed] [ticks] [out.png]
import sharp from "sharp"
import satori from "satori"
import { createWorld, step, CELL } from "../quartz/components/scripts/particles/sim"
import { renderCells } from "../quartz/components/scripts/particles/render"
import { drawGuy } from "../quartz/components/scripts/particles/guys"
import { getSatoriFont } from "../quartz/util/og"

const OUT = process.argv[4] ?? "quartz/static/og-image.png"
const PW = 1200,
  PH = 630
// the world fills the bottom of the image, leaving the sky for the title
const WH = 390
const W = PW / CELL,
  H = WH / CELL
const seed = Number(process.argv[2] ?? 21)
const ticks = Number(process.argv[3] ?? 60000)

const w = createWorld(W, H, seed, [])
for (let i = 0; i < ticks; i++) step(w)

const cells = new Uint32Array(W * H)
renderCells(w, cells)
const img = new Uint32Array(PW * PH).fill(0xfff6f9fa)
const top = PH - WH
for (let y = 0; y < WH; y++)
  for (let x = 0; x < PW; x++) {
    const c = cells[((y / CELL) | 0) * W + ((x / CELL) | 0)]
    if (c) img[(y + top) * PW + x] = c
  }
for (const g of w.guys)
  drawGuy(
    g,
    (x, y, c) => x >= 0 && y >= 0 && x < PW && y < WH && (img[(y + top) * PW + x] = c),
    CELL,
    0,
    0,
  )

const fonts = await getSatoriFont("Source Serif 4", "Crimson Pro")
const el = (type: string, style: object, children: unknown) => ({
  type,
  props: { style, children },
})
const svg = await satori(
  el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: 18,
    },
    [
      el(
        "div",
        { fontFamily: "Source Serif 4", fontSize: 150, lineHeight: 1, color: "#363534" },
        "stu.art",
      ),
      el(
        "div",
        { fontFamily: "Crimson Pro", fontSize: 56, color: "#E85530", marginTop: 6 },
        "Stuart's little internet garden",
      ),
    ],
  ) as any,
  { width: PW, height: PH, fonts },
)

await sharp(Buffer.from(img.buffer), { raw: { width: PW, height: PH, channels: 4 } })
  .composite([{ input: Buffer.from(svg) }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(OUT)
console.log("wrote", OUT)
