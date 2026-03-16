#!/usr/bin/env node
// Headless particle simulation via Playwright
// Usage: npm run simulate <scene.json> [ticks] [--log logfile.txt]
//
// Loads a scene into the real particle engine running in a headless browser,
// ticks the simulation, then reports tile counts and guy states.

import { chromium } from "playwright"
import { readFileSync, writeFileSync } from "fs"
import { execSync } from "child_process"
import { resolve } from "path"

const args = process.argv.slice(2)
const sceneFile = args[0]
const ticks = parseInt(args[1] || "1000", 10)
const logIdx = args.indexOf("--log")
const logFile = logIdx >= 0 ? args[logIdx + 1] : `simulate-${Date.now()}.log`

if (!sceneFile) {
  console.error("Usage: npm run simulate <scene.json> [ticks] [--log logfile.txt]")
  process.exit(1)
}

// Load scene JSON (handle the {key: scene} wrapper format)
const raw = readFileSync(sceneFile, "utf8")
let scene
try {
  const parsed = JSON.parse(raw)
  // If it has a single key with w/h/p, unwrap it
  const keys = Object.keys(parsed)
  if (keys.length === 1 && parsed[keys[0]].w) {
    scene = parsed[keys[0]]
  } else if (parsed.w) {
    scene = parsed
  } else {
    // Try the "{" + raw + "}" wrapper from debug scripts
    const wrapped = JSON.parse("{" + raw + "}")
    const wkeys = Object.keys(wrapped)
    scene = wrapped[wkeys[0]]
  }
} catch {
  // Try the wrapper format
  const wrapped = JSON.parse("{" + raw + "}")
  const wkeys = Object.keys(wrapped)
  scene = wrapped[wkeys[0]]
}

console.log(`Loading scene: ${scene.w}x${scene.h}, ${scene.p.length} particles, ${scene.g?.length || 0} guys`)
console.log(`Running ${ticks} ticks...`)

// Build the site first so we have a page with the particle engine
console.log("Building site...")
try {
  execSync("npx quartz build", { stdio: "pipe", cwd: resolve(".") })
} catch (e) {
  console.error("Build failed:", e.message)
  process.exit(1)
}

// Launch headless browser — viewport sized to match scene so no rescaling
const CELL = 3
const vpWidth = scene.w * CELL
const vpHeight = scene.h * CELL
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: vpWidth, height: vpHeight } })

// Serve the built site and navigate to test page
const { createServer } = await import("http")
const handler = (await import("serve-handler")).default
const server = createServer((req, res) => handler(req, res, { public: "public" }))
await new Promise(r => server.listen(0, r))
const port = server.address().port

await page.goto(`http://localhost:${port}/test`, { waitUntil: "networkidle" })

// Forward browser console to node
page.on("console", msg => { if (msg.type() !== "warning") console.log(`[browser] ${msg.text()}`) })

// Clear localStorage to prevent loading old state
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: "networkidle" })

// Wait for the simulation to initialize
await page.waitForFunction(() => (window).__sim?.grid, { timeout: 10000 })

// Stop the animation loop, load our scene, run ticks manually
const result = await page.evaluate(({ scene, ticks }) => {
  const sim = (window).__sim
  sim.stop() // cancel requestAnimationFrame loop
  sim.debug = true
  sim.loadScene(scene)
  console.log(`Grid: ${sim.W}x${sim.H}, scene: ${scene.w}x${scene.h}, guys: ${sim.guys.length}`)

  const names = {
    [sim.EMPTY]: "empty", [sim.SAND]: "sand", [sim.WATER]: "water",
    [sim.FIRE]: "fire", [sim.WALL]: "wall", [sim.WOOD]: "wood",
    [sim.SMOKE]: "smoke", [sim.GUY]: "guy", [sim.MUD]: "mud",
    [sim.SEED]: "seed", [sim.LEAF]: "leaf", [sim.BRICK]: "brick",
    [sim.DOOR]: "door", [sim.STONE]: "stone", [sim.TREE]: "tree", [sim.KILN_FIRE]: "kiln_fire", [sim.KILN_STONE]: "kiln_stone",
  }

  function tileCounts() {
    const fg = {}, bg = {}
    for (let i = 0; i < sim.W * sim.H; i++) {
      const fc = sim.grid[i], bc = sim.bgGrid[i]
      if (fc !== sim.EMPTY) fg[names[fc] || fc] = (fg[names[fc] || fc] || 0) + 1
      if (bc !== sim.EMPTY) bg[names[bc] || bc] = (bg[names[bc] || bc] || 0) + 1
    }
    return { fg, bg }
  }

  function guyStates() {
    return sim.guys.map((g, i) => ({
      id: i,
      x: Math.round(g.px[2]), y: Math.round(g.py[5] > g.py[6] ? g.py[5] : g.py[6]),
      job: g.job, task: g.task, carrying: g.carrying,
      targetX: g.targetX, targetY: g.targetY,
      placeX: g.placeX, placeY: g.placeY, placeType: g.placeType,
      kilnX: g.kilnX, kilnY: g.kilnY,
      buildX: g.buildX, buildY: g.buildY,
      terraformFills: g.terraformFills.length,
      terraformClears: g.terraformClears.length,
      state: g.state, pathLen: g.path.length,
    }))
  }

  const logEntries = []
  const initial = tileCounts()
  logEntries.push({ tick: 0, tiles: initial, guys: guyStates() })

  // Run simulation
  const logInterval = Math.max(1, Math.floor(ticks / 20)) // ~20 log snapshots
  const prevTask = sim.guys.map(() => "")
  const prevCarry = sim.guys.map(() => "")
  const prevJob = sim.guys.map(() => "")
  for (let t = 1; t <= ticks; t++) {
    sim.simulate()
    sim.simulateGuys()
    // Trace task/job/carry changes
    for (let gi = 0; gi < sim.guys.length; gi++) {
      const g = sim.guys[gi]
      if (g.task !== prevTask[gi] || g.carrying !== prevCarry[gi] || g.job !== prevJob[gi]) {
        console.log(`t=${t} #${gi} job=${g.job} task=${g.task} carry=${g.carrying} target=(${g.targetX},${g.targetY}) pos=(${Math.round(g.px[2])},${Math.round(g.py[2])})`)
        prevTask[gi] = g.task; prevCarry[gi] = g.carrying; prevJob[gi] = g.job
      }
    }
    if (t % logInterval === 0 || t === ticks) {
      logEntries.push({
        tick: t,
        tiles: tileCounts(),
        guys: guyStates(),
      })
    }
  }

  const final = tileCounts()
  return {
    logEntries,
    summary: {
      ticks,
      tiles: final,
      guys: guyStates(),
    }
  }
}, { scene, ticks })

await browser.close()
server.close()

// Write log
writeFileSync(logFile, JSON.stringify(result.logEntries, null, 2))
console.log(`\nLog written to ${logFile}`)

// Print summary
const s = result.summary
console.log(`\n=== SIMULATION COMPLETE: ${s.ticks} ticks ===\n`)

console.log("FOREGROUND TILES:")
for (const [k, v] of Object.entries(s.tiles.fg).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}
console.log("\nBACKGROUND TILES:")
for (const [k, v] of Object.entries(s.tiles.bg).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}

console.log("\nGUYS:")
for (const g of s.guys) {
  console.log(`  #${g.id} (${g.x},${g.y}) job=${g.job} task=${g.task} carrying=${g.carrying || "none"} state=${g.state} target=(${g.targetX},${g.targetY}) place=(${g.placeX},${g.placeY}) placeType=${g.placeType}`)
}

