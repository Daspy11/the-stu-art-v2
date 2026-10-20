// Captures the landing page at a few screen sizes: a screenshot of the page with the
// particle canvases hidden, and the text rectangles and world size the page computed.
// Usage: node scripts/particles-video/capture.mjs <outdir>   (after `npx quartz build`)
import { chromium } from "playwright"
import { createServer } from "http"
import { mkdirSync, writeFileSync, existsSync } from "fs"
import handler from "serve-handler"

const out = process.argv[2] ?? "video-out/capture"
mkdirSync(out, { recursive: true })
const sizes = [
  ["desktop", 1440, 900],
  ["tablet", 820, 1180],
  ["phone", 390, 844],
]
const server = createServer((req, res) => handler(req, res, { public: "public" }))
await new Promise((r) => server.listen(0, r))
const port = server.address().port
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {})
for (const [name, width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(`http://localhost:${port}/?seed=1`, { waitUntil: "networkidle" })
  await page.waitForFunction(() => window.__sim && window.__sim.world)
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const s = window.__sim
    s.stop()
    const w = s.world
    for (const id of ["particle-canvas", "particle-guys"])
      document.getElementById(id).style.display = "none"
    return { W: w.W, H: w.H, rects: s.textRects() }
  })
  await page.screenshot({
    path: `${out}/${name}.png`,
    clip: { x: 0, y: 0, width: info.W * 3, height: info.H * 3 },
    fullPage: true,
  })
  writeFileSync(`${out}/${name}.json`, JSON.stringify(info))
  console.log(name, info.W, info.H, info.rects.length, "rects")
  await page.close()
}
await browser.close()
server.close()
