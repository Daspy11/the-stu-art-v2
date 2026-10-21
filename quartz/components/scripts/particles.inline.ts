// Full-viewport falling-sand world, drawn as a transparent layer over the page.
// A little colony lives in it: they fell trees, build towers, ladders, bridges and
// furniture, and more of them move in as the place gets nicer.
// The simulation itself lives in ./particles; this file wires it to the page:
// canvases, the text the guys treat as solid, input, the toolbar and saving.

import {
  createWorld,
  restoreWorld,
  saveWorld,
  step,
  World,
  CELL,
  SavedWorld,
} from "./particles/sim"
import { renderCells } from "./particles/render"
import { drawGuy, guyBounds, makeGuy } from "./particles/guys"
import { EMPTY, SAND, WATER, FIRE, WALL, STONE, GUY, TEXT } from "./particles/cells"
import { TIER_NAMES, popCap } from "./particles/colony"
import { forEachFurnPixel } from "./particles/furniture"

const MATERIALS = [
  { type: SAND, name: "Sand", css: "#c2a03c" },
  { type: WATER, name: "Water", css: "#3c78c8" },
  { type: STONE, name: "Stone", css: "#a0a09b" },
  { type: WALL, name: "Wall", css: "#8c8a87" },
  { type: FIRE, name: "Fire", css: "#E85530" },
  { type: GUY, name: "Guy", css: "#4a4a4a" },
  { type: EMPTY, name: "Erase", css: "transparent" },
]

let BRUSH_RADIUS = 3
const TICKS_PER_FRAME = 0.7 // at 60fps
const SAVE_EVERY_MS = 8000

// --- State ---
let world: World | null = null
let cellCanvas: HTMLCanvasElement | null = null
let guyCanvas: HTMLCanvasElement | null = null
let cellCtx: CanvasRenderingContext2D
let guyCtx: CanvasRenderingContext2D
let cellImg: ImageData
let cellBuf: Uint32Array
let guyImg: ImageData
let guyBuf: Uint32Array
let dirty: [number, number, number, number] | null = null
let canvasTop = 0
let material = SAND
let paused = false
let debugMode = false
let speedMultiplier = 1
let raf = 0
let saveTimer = 0
let toolbarEl: HTMLElement | null = null
let inlineDropdown: HTMLElement | null = null
let textTimer = 0

const mouse = { x: 0, y: 0, down: false, spawning: false }

function slug(): string {
  return document.getElementById("particle-mount")?.getAttribute("data-slug") || "index"
}

// Worlds are fitted to a screen size, so each size keeps its own save. Bump the
// version when world generation changes so visitors get the new terrain.
const SAVE_PREFIX = "particle-world:v4:"
function storageKey(W: number, H: number): string {
  return `${SAVE_PREFIX}${slug()}:${W}x${Math.round(H / 20)}`
}

function dropOldSaves() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith("particle-world:") && !k.startsWith(SAVE_PREFIX))
        localStorage.removeItem(k)
    }
  } catch {}
}

// Things on the page that aren't really there: link previews (Quartz keeps the
// whole linked page in the DOM, hidden), our own menu, and anything not showing
const IGNORED = "script, style, noscript, .particle-dropdown, .popover"
function hidden(el: Element): boolean {
  if (el.closest(IGNORED)) return true
  const v = (el as any).checkVisibility
  return typeof v === "function" && !v.call(el, { opacityProperty: true, visibilityProperty: true })
}

// --- Text the guys stand on and won't build against (document coordinates) ---
function textRects(): number[][] {
  const rects: number[][] = []
  const root = document.getElementById("quartz-body") || document.body
  const sy = window.scrollY - canvasTop
  const add = (r: DOMRect) => {
    if (r.width < 1 || r.height < 1) return
    rects.push([r.left / CELL, (r.top + sy) / CELL, r.right / CELL, (r.bottom + sy) / CELL])
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent || !n.textContent.trim()) continue
    const el = n.parentElement
    if (!el || hidden(el)) continue
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) add(r)
  }
  root.querySelectorAll("img, svg, button, input, li").forEach((el) => {
    if (hidden(el)) return
    if (el.tagName === "LI") {
      // the bullet
      const r = el.getBoundingClientRect()
      add(new DOMRect(r.left - 18, r.top + 6, 8, 10))
    } else add(el.getBoundingClientRect())
  })
  return rects
}

function refreshText() {
  if (!world || !cellCanvas) return
  world.setText(textRects())
}

// The world spans the page: the content, plus a band of ground under it that's at
// least a good chunk of the screen. Short screens scroll down to the ground.
function worldSize(): [number, number] {
  const vw = document.documentElement.clientWidth || window.innerWidth
  const vh = window.innerHeight
  let bottom = 0
  for (const r of textRects()) bottom = Math.max(bottom, r[3] * CELL)
  const h = Math.max(vh, bottom + Math.max(200, vh * 0.28))
  return [Math.floor(vw / CELL), Math.ceil(h / CELL)]
}

// --- Setup ---
function makeCanvas(id: string): HTMLCanvasElement {
  let c = document.getElementById(id) as HTMLCanvasElement | null
  if (!c) {
    c = document.createElement("canvas")
    c.id = id
    document.body.prepend(c)
  }
  return c
}

function sizeCanvases(W: number, H: number) {
  cellCanvas = makeCanvas("particle-canvas")
  guyCanvas = makeCanvas("particle-guys")
  for (const c of [cellCanvas, guyCanvas]) {
    c.style.width = W * CELL + "px"
    c.style.height = H * CELL + "px"
  }
  cellCanvas.width = W
  cellCanvas.height = H
  guyCanvas.width = W * CELL
  guyCanvas.height = H * CELL
  cellCtx = cellCanvas.getContext("2d")!
  guyCtx = guyCanvas.getContext("2d")!
  cellImg = cellCtx.createImageData(W, H)
  cellBuf = new Uint32Array(cellImg.data.buffer)
  guyImg = guyCtx.createImageData(W * CELL, H * CELL)
  guyBuf = new Uint32Array(guyImg.data.buffer)
  dirty = null
}

function seedFromUrl(): number | null {
  const s = new URLSearchParams(location.search).get("seed")
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n >>> 0 : null
}

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
}

// Build (or restore) the world for the current screen
function startWorld(fresh: boolean) {
  if (world) persist()
  const [W, H] = worldSize()
  sizeCanvases(W, H)
  world = null
  const rects = textRects()
  const urlSeed = seedFromUrl()
  if (!fresh && urlSeed === null) {
    dropOldSaves()
    try {
      const raw = localStorage.getItem(storageKey(W, H))
      const saved = raw ? (JSON.parse(raw) as SavedWorld) : null
      if (saved && saved.W === W && saved.H === H) world = restoreWorld(saved, rects)
    } catch {
      world = null
    }
  }
  if (!world) world = createWorld(W, H, fresh || urlSeed === null ? newSeed() : urlSeed, rects)
}

const MAX_SAVES = 4

function persist() {
  // a world only a few seconds old isn't worth keeping (and resizing makes lots of them)
  if (!world || world.tick < 1200) return
  try {
    const key = storageKey(world.W, world.H)
    const data = JSON.stringify(saveWorld(world))
    // keep only a few screen sizes' worlds, so saves can't fill up the storage
    const others: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(SAVE_PREFIX) && k !== key) others.push(k)
    }
    if (others.length >= MAX_SAVES) for (const k of others) localStorage.removeItem(k)
    try {
      localStorage.setItem(key, data)
    } catch {
      // out of room: this screen's world matters most, so make way for it
      for (const k of others) localStorage.removeItem(k)
      localStorage.setItem(key, data)
    }
  } catch {}
}

// --- Drawing ---
function render() {
  if (!world || !cellCanvas || !guyCanvas) return
  renderCells(world, cellBuf)
  cellCtx.putImageData(cellImg, 0, 0)

  const GW = guyCanvas.width,
    GH = guyCanvas.height
  // clear last frame's guys, then draw this frame's, and upload just that region
  if (dirty) {
    const [x0, y0, x1, y1] = dirty
    for (let y = y0; y < y1; y++) guyBuf.fill(0, y * GW + x0, y * GW + x1)
  }
  let bx0 = GW,
    by0 = GH,
    bx1 = 0,
    by1 = 0
  const plot = (x: number, y: number, c: number) => {
    if (x >= 0 && x < GW && y >= 0 && y < GH) guyBuf[y * GW + x] = c
  }
  for (const g of world.guys) {
    const [a, b, c, d] = guyBounds(g, CELL)
    bx0 = Math.min(bx0, a)
    by0 = Math.min(by0, b)
    bx1 = Math.max(bx1, c)
    by1 = Math.max(by1, d)
    drawGuy(g, plot, CELL, 0, 0)
  }
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))
  const cur: [number, number, number, number] = [
    clamp(bx0, GW),
    clamp(by0, GH),
    clamp(bx1, GW),
    clamp(by1, GH),
  ]
  const up = dirty
    ? [
        Math.min(cur[0], dirty[0]),
        Math.min(cur[1], dirty[1]),
        Math.max(cur[2], dirty[2]),
        Math.max(cur[3], dirty[3]),
      ]
    : cur
  if (debugMode) {
    guyCtx.putImageData(guyImg, 0, 0)
    drawDebug()
  } else if (up[2] > up[0] && up[3] > up[1]) {
    guyCtx.putImageData(guyImg, 0, 0, up[0], up[1], up[2] - up[0], up[3] - up[1])
  }
  dirty = cur[2] > cur[0] ? cur : null
}

let fpsFrames = 0,
  fpsLast = performance.now(),
  fpsDisplay = 0,
  stepMs = 0

function drawDebug() {
  if (!world || !guyCanvas) return
  fpsFrames++
  const now = performance.now()
  if (now - fpsLast >= 1000) {
    fpsDisplay = Math.round((fpsFrames * 1000) / (now - fpsLast))
    fpsFrames = 0
    fpsLast = now
  }
  const c = world.colony
  const ctx = guyCtx
  ctx.font = "bold 13px monospace"
  ctx.textAlign = "right"
  ctx.fillStyle = "#c00"
  const lines = [
    `${fpsDisplay} fps  ${stepMs.toFixed(2)}ms/tick  tick ${world.tick}  seed ${world.seed}`,
    `${TIER_NAMES[c.tier]}  guys ${world.guys.length}/${popCap(world)}  towers ${c.towers.filter((t) => t.complete).length}  bridges ${c.bridges.length}  furniture ${c.furniture.length}`,
    `wood ${c.stock[1]}  stone ${c.stock[2]}  trees ${world.trees.length}  projects ${c.projects.map((p) => p.kind).join(",")}`,
  ]
  lines.forEach((l, i) => ctx.fillText(l, guyCanvas!.width - 8, 18 + i * 16))
  ctx.font = "9px monospace"
  ctx.textAlign = "center"
  for (const g of world.guys) {
    const label =
      (g.job ? g.job.kind : "idle") +
      (g.carry ? ` ${g.carry === 1 ? "wood" : "stone"}:${g.carryAmt}` : "")
    ctx.fillStyle = "rgba(0,0,0,0.6)"
    ctx.fillText(label, g.px[0] * CELL, (g.py[0] - 3) * CELL)
  }
}

// --- Input ---
function isContentElement(el: HTMLElement): boolean {
  return !!el.closest(
    "article, .sidebar > *, a, button, input, .page-title, nav, .search-container, #particle-toolbar",
  )
}

function cellAt(clientX: number, clientY: number): [number, number] {
  return [Math.floor(clientX / CELL), Math.floor((clientY + window.scrollY - canvasTop) / CELL)]
}

let guySpawnedThisClick = false

function spawnFromMouse() {
  if (!world || !mouse.down || !mouse.spawning) return
  const w = world
  const [gx, gy] = cellAt(mouse.x, mouse.y)
  if (material === GUY) {
    if (!guySpawnedThisClick && w.inBounds(gx, gy)) {
      w.guys.push(makeGuy(w, gx, gy))
      guySpawnedThisClick = true
    }
    return
  }
  const r = BRUSH_RADIUS
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const x = gx + dx,
        y = gy + dy
      if (!w.inBounds(x, y)) continue
      const cur = w.get(x, y)
      if (cur === TEXT) continue
      if (material === EMPTY) {
        w.set(x, y, EMPTY)
        w.setBg(x, y, EMPTY)
      } else if (
        cur === EMPTY &&
        ((material !== FIRE && material !== WATER) || w.rng.next() < 0.5)
      ) {
        w.set(x, y, material)
      }
    }
  }
  if (material === EMPTY) {
    // erasing through furniture removes it
    const c = w.colony
    c.furniture = c.furniture.filter((f) => {
      let hit = false
      forEachFurnPixel(f, (x, y) => {
        if ((x - gx) ** 2 + (y - gy) ** 2 <= r * r) hit = true
      })
      return !hit
    })
  }
  w.colony.safeDirty = true
}

let listenersBound = false
function setupInput() {
  if (listenersBound) return
  listenersBound = true
  const down = (x: number, y: number, target: HTMLElement) => {
    mouse.down = true
    mouse.spawning = !isContentElement(target)
    mouse.x = x
    mouse.y = y
  }
  const up = () => {
    mouse.down = false
    mouse.spawning = false
    guySpawnedThisClick = false
  }
  document.addEventListener("mousedown", (e) => down(e.clientX, e.clientY, e.target as HTMLElement))
  document.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  })
  document.addEventListener("mouseup", up)
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0]
      if (!t) return
      down(t.clientX, t.clientY, e.target as HTMLElement)
      if (mouse.spawning) e.preventDefault()
    },
    { passive: false },
  )
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0]
      if (!t) return
      mouse.x = t.clientX
      mouse.y = t.clientY
      if (mouse.spawning) e.preventDefault()
    },
    { passive: false },
  )
  document.addEventListener("touchend", up)

  // wait for the window to stop changing size (dragging its edge fires dozens of these)
  let resizeTimer = 0
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0
      if (!particlesActive || !world) return
      // a new width (or a much taller/shorter window) gets its own world; small height
      // changes, like a phone's address bar sliding away, keep this one
      const [W, H] = worldSize()
      if (W !== world.W || Math.abs(H - world.H) > world.H * 0.25) startWorld(false)
      else scheduleText()
    }, 250)
  })
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist()
  })
  window.addEventListener("pagehide", persist)
}

function scheduleText() {
  if (textTimer) return
  textTimer = window.setTimeout(() => {
    textTimer = 0
    refreshText()
  }, 120)
}

// --- Toolbar ---
function applyDotStyle(dot: HTMLElement, type: number, css: string) {
  if (type === EMPTY) {
    dot.style.background = "transparent"
    dot.style.border = "2px solid var(--gray)"
    dot.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><line x1="2" y1="2" x2="8" y2="8" stroke="var(--gray)" stroke-width="1.5"/></svg>`
  } else if (type === GUY) {
    dot.style.background = "transparent"
    dot.style.border = "2px solid var(--gray)"
    dot.innerHTML = `<svg width="12" height="14" viewBox="0 0 12 14" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><circle cx="6" cy="2.5" r="1.8" fill="none" stroke="#4a4a4a" stroke-width="1.2"/><line x1="6" y1="4.3" x2="6" y2="9" stroke="#4a4a4a" stroke-width="1.2"/><line x1="6" y1="9" x2="3.5" y2="13" stroke="#4a4a4a" stroke-width="1.2"/><line x1="6" y1="9" x2="8.5" y2="13" stroke="#4a4a4a" stroke-width="1.2"/><line x1="6" y1="6" x2="3" y2="8" stroke="#4a4a4a" stroke-width="1.2"/><line x1="6" y1="6" x2="9" y2="8" stroke="#4a4a4a" stroke-width="1.2"/></svg>`
  } else {
    dot.style.background = css
  }
}

function slider(
  min: string,
  max: string,
  stepv: string,
  value: string,
  label: string,
  onInput: (v: number) => string,
  title?: string,
) {
  const row = document.createElement("div")
  row.className = "particle-speed"
  if (title) {
    const t = document.createElement("span")
    t.className = "particle-speed-label"
    t.textContent = title
    t.style.marginRight = "4px"
    row.appendChild(t)
  }
  const out = document.createElement("span")
  out.className = "particle-speed-label"
  out.textContent = label
  const input = document.createElement("input")
  input.type = "range"
  input.className = "particle-speed-slider"
  input.min = min
  input.max = max
  input.step = stepv
  input.value = value
  input.addEventListener("input", (e) => {
    e.stopPropagation()
    out.textContent = onInput(parseFloat(input.value))
  })
  input.addEventListener("click", (e) => e.stopPropagation())
  row.appendChild(input)
  row.appendChild(out)
  return row
}

function createToolbar() {
  if (toolbarEl) toolbarEl.remove()
  inlineDropdown?.remove()
  document.getElementById("particle-instructions-content")?.remove()

  toolbarEl = document.createElement("div")
  toolbarEl.id = "particle-toolbar"

  const toggleBtn = document.createElement("button")
  toggleBtn.className = "particle-toggle"
  const toggleDot = document.createElement("span")
  toggleDot.className = "particle-dot"
  const activeMat = MATERIALS.find((m) => m.type === material) || MATERIALS[0]
  applyDotStyle(toggleDot, activeMat.type, activeMat.css)
  const toggleLabel = document.createElement("span")
  toggleLabel.className = "particle-toggle-label"
  toggleLabel.textContent = activeMat.name
  const toggleArrow = document.createElement("span")
  toggleArrow.className = "particle-toggle-arrow"
  toggleArrow.textContent = "▼"
  toggleBtn.append(toggleDot, toggleLabel, toggleArrow)

  const dropdown = document.createElement("div")
  dropdown.className = "particle-dropdown"
  const list = document.createElement("div")
  list.className = "particle-list"
  for (const { type, name, css } of MATERIALS) {
    const pill = document.createElement("button")
    pill.className = "particle-pill" + (type === material ? " active" : "")
    const swatch = document.createElement("span")
    swatch.className = "particle-swatch"
    applyDotStyle(swatch, type, css)
    const label = document.createElement("span")
    label.className = "particle-pill-label"
    label.textContent = name
    pill.addEventListener("click", (e) => {
      e.stopPropagation()
      material = type
      list.querySelectorAll(".particle-pill").forEach((d) => d.classList.remove("active"))
      pill.classList.add("active")
      toggleDot.removeAttribute("style")
      toggleDot.innerHTML = ""
      applyDotStyle(toggleDot, type, css)
      toggleLabel.textContent = name
      dropdown.classList.remove("open")
      toggleArrow.textContent = "▼"
    })
    pill.append(swatch, label)
    list.appendChild(pill)
  }
  dropdown.appendChild(list)

  const divider = () => {
    const d = document.createElement("div")
    d.className = "particle-divider"
    return d
  }
  dropdown.appendChild(divider())
  dropdown.appendChild(
    slider("-1", "1", "0.01", "0", "1x", (v) => {
      speedMultiplier = Math.pow(10, v)
      return (
        (speedMultiplier < 0.95 || speedMultiplier >= 1.05 ? speedMultiplier.toFixed(1) : "1") + "x"
      )
    }),
  )
  dropdown.appendChild(
    slider(
      "1",
      "15",
      "1",
      String(BRUSH_RADIUS),
      String(BRUSH_RADIUS),
      (v) => {
        BRUSH_RADIUS = v
        return String(v)
      },
      "Size",
    ),
  )
  dropdown.appendChild(divider())

  const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  const actions = document.createElement("div")
  actions.className = "particle-actions"
  const button = (label: string, title: string, onClick: (b: HTMLButtonElement) => void) => {
    const b = document.createElement("button")
    b.className = "particle-btn"
    b.title = title
    b.textContent = label
    b.addEventListener("click", (e) => {
      e.stopPropagation()
      onClick(b)
    })
    actions.appendChild(b)
  }
  button("↺", "New world", () => {
    if (world) {
      try {
        localStorage.removeItem(storageKey(world.W, world.H))
      } catch {}
    }
    startWorld(true)
  })
  if (isDev) {
    button("⏸", "Pause", (b) => {
      paused = !paused
      b.textContent = paused ? "▶" : "⏸"
    })
    button("#", "Copy a link to this world's seed", () => {
      if (!world) return
      const url = `${location.origin}${location.pathname}?seed=${world.seed}`
      navigator.clipboard?.writeText(url).catch(() => console.log(url))
    })
  }
  dropdown.appendChild(actions)

  if (isDev) {
    const debugRow = document.createElement("label")
    debugRow.className = "particle-debug-row"
    const debugCheck = document.createElement("input")
    debugCheck.type = "checkbox"
    debugCheck.checked = debugMode
    debugCheck.addEventListener("change", (e) => {
      e.stopPropagation()
      debugMode = debugCheck.checked
      if (!debugMode && guyCanvas) guyCtx.clearRect(0, 0, guyCanvas.width, guyCanvas.height)
      dirty = null
    })
    debugRow.append(debugCheck, document.createTextNode(" Debug"))
    dropdown.appendChild(debugRow)
  }

  // Inline instructions: injected into the page if there's a placeholder for them
  const instructionsEl = document.getElementById("particle-instructions")
  if (instructionsEl) {
    const wrapper = document.createElement("span")
    wrapper.id = "particle-instructions-content"
    wrapper.className = "particle-instructions"
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0
    const inputText = document.createElement("span")
    inputText.innerHTML = isTouch
      ? "Tap and hold"
      : 'Hold <svg class="particle-mouse-icon" viewBox="0 0 16 22" width="14" height="19"><rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="1" x2="8" y2="9" stroke="currentColor" stroke-width="1"/><rect x="1" y="1" width="7" height="8" rx="4" fill="currentColor" opacity="0.25"/></svg>'
    wrapper.appendChild(inputText)
    const addText = document.createElement("span")
    addText.textContent = " to add some "
    wrapper.appendChild(addText)
    const inlineToggleWrap = document.createElement("span")
    inlineToggleWrap.className = "particle-inline-toggle-wrap"
    inlineToggleWrap.append(toggleBtn, dropdown)
    wrapper.appendChild(inlineToggleWrap)
    instructionsEl.appendChild(wrapper)
    toolbarEl.style.display = "none"
    inlineDropdown = dropdown
  } else {
    toolbarEl.append(toggleBtn, dropdown)
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    const isOpen = dropdown.classList.toggle("open")
    toggleArrow.textContent = isOpen ? "▲" : "▼"
    if (isOpen && instructionsEl) {
      // the page text sits under the world, so the menu floats at the top of the page
      const r = toggleBtn.getBoundingClientRect()
      dropdown.classList.add("floating")
      document.body.appendChild(dropdown)
      // keep it on the screen: under the button if it fits, else above it
      const vw = document.documentElement.clientWidth || window.innerWidth
      const dw = dropdown.offsetWidth,
        dh = dropdown.offsetHeight
      const left = Math.max(8, Math.min(r.left, vw - dw - 8))
      const below = r.bottom + 4 + dh <= window.innerHeight - 8 || r.top - 4 - dh < 8
      const top = below ? r.bottom + 4 : r.top - 4 - dh
      dropdown.style.left = `${left + window.scrollX}px`
      dropdown.style.top = `${top + window.scrollY}px`
    }
  })
  dropdown.addEventListener("click", (e: Event) => e.stopPropagation())
  document.addEventListener("click", () => {
    dropdown.classList.remove("open")
    toggleArrow.textContent = "▼"
  })
  toolbarEl.addEventListener("click", (e: Event) => e.stopPropagation())
  document.body.appendChild(toolbarEl)
}

// --- Animation loop ---
let simAccum = 0
let lastFrame = performance.now()

function loop() {
  const now = performance.now()
  const dt = Math.min(now - lastFrame, 100) / (1000 / 60)
  lastFrame = now
  spawnFromMouse()
  if (world && !paused) {
    simAccum += TICKS_PER_FRAME * speedMultiplier * dt
    // never spend more than ~10ms a frame simulating
    const t0 = performance.now()
    let n = 0
    while (simAccum >= 1 && performance.now() - t0 < 10) {
      step(world)
      simAccum -= 1
      n++
    }
    if (n) stepMs = stepMs * 0.9 + ((performance.now() - t0) / n) * 0.1
    if (simAccum > 3) simAccum = 0
  }
  render()
  raf = requestAnimationFrame(loop)
}

// --- Lifecycle ---
let particlesActive = false

function teardown() {
  if (!particlesActive) return
  particlesActive = false
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  if (saveTimer) clearInterval(saveTimer)
  saveTimer = 0
  persist()
  cellCanvas?.remove()
  guyCanvas?.remove()
  cellCanvas = guyCanvas = null
  world = null
  toolbarEl?.remove()
  toolbarEl = null
  inlineDropdown?.remove()
  inlineDropdown = null
  document.getElementById("particle-instructions-content")?.remove()
}

function init() {
  setupInput()
  startWorld(false)
  createToolbar()
  // the toolbar is part of the text, and fonts may still be settling
  refreshText()
  document.fonts?.ready.then(() => refreshText())
  if (raf) cancelAnimationFrame(raf)
  if (saveTimer) clearInterval(saveTimer)
  saveTimer = window.setInterval(persist, SAVE_EVERY_MS)
  lastFrame = performance.now()
  loop()
}

function startup() {
  const mount = document.getElementById("particle-mount")
  if (mount?.getAttribute("data-is-index") !== "true") {
    teardown()
    return
  }
  if (particlesActive) return
  particlesActive = true
  // terrain is fitted around the text, so wait for the web fonts to lay it out
  const go = () => {
    if (particlesActive && !world) init()
  }
  if (document.fonts && document.fonts.status !== "loaded") {
    document.fonts.ready.then(go)
    setTimeout(go, 1500)
  } else go()
}

startup()
document.addEventListener("nav", () => startup())
window.addCleanup?.(() => teardown())

// --- Handle for headless tools (screenshots, the video renderer) ---
;(window as any).__sim = {
  get world() {
    return world
  },
  step: () => world && step(world),
  render,
  textRects,
  stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  },
  newWorld(seed: number) {
    const [W, H] = worldSize()
    sizeCanvases(W, H)
    world = createWorld(W, H, seed >>> 0, textRects())
    return world
  },
  set debug(v: boolean) {
    debugMode = v
  },
}
