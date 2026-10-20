// Records the landing page's real text layout (in world cells) at a few screen sizes,
// so the benchmark's worlds are shaped like the ones visitors get.
// Usage: npx quartz build && node scripts/particles-bench/capture-layouts.mjs
import { chromium } from "playwright"
import { createServer } from "http"
import handler from "serve-handler"
import { writeFileSync } from "fs"

const SIZES = {
  laptop: [1440, 900],
  hd: [1920, 1080],
  tablet: [820, 1180],
  phone: [390, 844],
}
const server = createServer((req, res) => handler(req, res, { public: "public" }))
await new Promise((r) => server.listen(0, r))
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
})
const out = {}
for (const [name, [w, h]] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  out[name] = await page.evaluate(() => {
    const s = window.__sim
    return {
      W: s.world.W,
      H: s.world.H,
      rects: s.textRects().map((r) => r.map((v) => +v.toFixed(2))),
    }
  })
  await page.close()
}
await browser.close()
server.close()
writeFileSync("scripts/particles-bench/layouts.json", JSON.stringify(out, null, 1))
console.log(
  Object.entries(out)
    .map(([k, v]) => `${k}: ${v.W}x${v.H}, ${v.rects.length} rects`)
    .join("\n"),
)
