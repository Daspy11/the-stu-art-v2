// Dev helper: node shot.mjs "<query>" outDir step1 step2 ...
// steps: w:<ms> | s:<name> | k:<code>[:<holdms>] | d:<code> | u:<code> | c:<x>,<y> (logical 960x540) | e:<js>
import { createRequire } from "node:module"
const { chromium } = createRequire(import.meta.url)("playwright")
import fs from "node:fs"

const [, , query = "", out = "/tmp/shots", ...steps] = process.argv
const port = process.env.PORT || 8765
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })
const errors = []
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`)
})
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await page.goto(`http://localhost:${port}/index.html${query}`)
await page.waitForFunction(() => window.__sky && window.__sky.state === "gate", null, { timeout: 15000 })
await page.waitForTimeout(400)
await page.mouse.click(640, 360)
const box = await page.locator("canvas").boundingBox()
for (const st of steps) {
  const [op, ...rest] = st.split(":")
  const arg = rest.join(":")
  if (op === "w") await page.waitForTimeout(+arg)
  else if (op === "s") await page.screenshot({ path: `${out}/${arg}.png` })
  else if (op === "k") {
    const [code, hold] = arg.split(":")
    await page.keyboard.down(code)
    await page.waitForTimeout(+(hold || 60))
    await page.keyboard.up(code)
  } else if (op === "d") await page.keyboard.down(arg)
  else if (op === "u") await page.keyboard.up(arg)
  else if (op === "c") {
    const [x, y] = arg.split(",").map(Number)
    await page.mouse.click(box.x + (x / 960) * box.width, box.y + (y / 540) * box.height)
  } else if (op === "e") console.log(await page.evaluate(arg))
  else if (op === "state") console.log("state:", await page.evaluate(() => window.__sky.state))
}
console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
