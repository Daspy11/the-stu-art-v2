// Full-viewport particle simulation engine
// Transparent overlay — particles float over the existing page design
// Scenes are saved to quartz/particles.json and loaded per-page

// --- Particle types ---
const EMPTY = 0, SAND = 1, WATER = 2, FIRE = 3, WALL = 4, WOOD = 5, SMOKE = 6, GUY = 7, MUD = 8, SEED = 9, LEAF = 10, BRICK = 11, DOOR = 12, STONE = 13, TREE = 14, KILN_FIRE = 15, GRASS = 16, KILN_STONE = 17, HOUSE_BRICK = 18

// --- Pre-computed ABGR pixel values for Uint32Array rendering ---
function rgba(r: number, g: number, b: number, a = 255) {
  return (a << 24) | (b << 16) | (g << 8) | r
}

// Colors tuned to look good on the cream (#FAF9F6) background
const PIXELS: Record<number, number[]> = {
  [SAND]:  [rgba(194,160,60), rgba(180,148,50), rgba(168,138,44), rgba(186,154,55)],
  [WATER]: [rgba(60,120,200), rgba(45,105,185), rgba(75,130,210), rgba(35,100,190)],
  [FIRE]:  [rgba(232,85,48), rgba(240,100,40), rgba(220,60,30), rgba(246,111,78)],
  [WALL]:  [rgba(140,138,135), rgba(130,128,125), rgba(150,148,145), rgba(135,133,130)],
  [WOOD]:  [rgba(120,80,40), rgba(110,72,35), rgba(130,88,45), rgba(115,76,38)],
  [SMOKE]: [rgba(190,188,185), rgba(180,178,175), rgba(200,198,195), rgba(185,183,180)],
  [MUD]:   [rgba(101,67,33), rgba(92,60,28), rgba(110,75,38), rgba(96,63,30)],
  [SEED]:  [rgba(160,140,60), rgba(148,130,50), rgba(170,150,70), rgba(155,135,55)],
  [LEAF]:  [rgba(60,140,50), rgba(50,125,40), rgba(70,150,60), rgba(55,130,45)],
  [BRICK]: [rgba(180,80,50), rgba(170,72,44), rgba(190,88,56), rgba(175,76,48)],
  [DOOR]:  [rgba(140,100,50), rgba(130,92,44), rgba(150,108,56), rgba(135,96,48)],
  [STONE]: [rgba(160,160,155), rgba(150,150,145), rgba(170,170,165), rgba(155,155,150)],
  [TREE]:  [rgba(120,80,40), rgba(110,72,35), rgba(130,88,45), rgba(115,76,38)],
  [KILN_FIRE]: [rgba(240,140,40), rgba(250,160,50), rgba(230,120,30), rgba(245,150,45)],
  [GRASS]:     [rgba(76,140,50), rgba(66,125,40), rgba(86,150,58), rgba(72,132,46)],
  [KILN_STONE]: [rgba(140,140,135), rgba(130,130,125), rgba(150,150,145), rgba(135,135,130)],
  [HOUSE_BRICK]: [rgba(180,80,50), rgba(170,72,44), rgba(190,88,56), rgba(175,76,48)],
}

const TRANSPARENT = rgba(0, 0, 0, 0)

const MATERIALS = [
  { type: SAND,  name: "Sand",  css: "#c2a03c" },
  { type: WATER, name: "Water", css: "#3c78c8" },
  { type: STONE, name: "Stone", css: "#a0a09b" },
  { type: WALL,  name: "Wall",  css: "#8c8a87" },
  { type: FIRE,  name: "Fire",  css: "#E85530" },
  { type: GUY,   name: "Guy",   css: "#4a4a4a" },
  { type: EMPTY, name: "Erase", css: "transparent" },
]

// --- Configuration ---
const CELL = 3
let BRUSH_RADIUS = 3

// --- Verlet spring-based stick figures ---
// Node indices
const N_HEAD = 0, N_NECK = 1, N_HIP = 2
const N_LKNEE = 3, N_RKNEE = 4, N_LFOOT = 5, N_RFOOT = 6
const N_LELBOW = 7, N_RELBOW = 8, N_LHAND = 9, N_RHAND = 10
const NUM_NODES = 11

// Constraints: [nodeA, nodeB, restLength in grid cells]
const BODY_SPRINGS: [number, number, number][] = [
  [N_HEAD, N_NECK, 1.5],
  [N_NECK, N_HIP, 2.5],
  [N_HIP, N_LKNEE, 2.0],
  [N_HIP, N_RKNEE, 2.0],
  [N_LKNEE, N_LFOOT, 2.0],
  [N_RKNEE, N_RFOOT, 2.0],
  [N_NECK, N_LELBOW, 1.5],
  [N_NECK, N_RELBOW, 1.5],
  [N_LELBOW, N_LHAND, 1.5],
  [N_RELBOW, N_RHAND, 1.5],
  // Structural cross-braces for stability
  [N_HEAD, N_HIP, 4.0],
]

// Min-distance constraints to prevent leg crossing
const MIN_DIST_SPRINGS: [number, number, number][] = [
  [N_LFOOT, N_RFOOT, 0.5],
  [N_LKNEE, N_RKNEE, 0.3],
]
// Max-distance constraints to prevent splits
const MAX_FOOT_SPREAD = 5.0

const VERLET_DAMPING = 0.98
const GRAVITY_ACC = 0.15
const CONSTRAINT_ITERS = 8

// --- Guy task system (extensible behavior tree) ---
// Tasks control what the guy is trying to do. The physics state (walk/idle/fall)
// is separate — tasks drive the physics by setting direction and transitions.
type GuyTask =
  | "wander"          // random walking (default)
  | "idle"            // standing around
  | "mine"            // generic: mine a cell of mineType near position
  | "place"           // generic: place carried item as placeType at placeX,placeY
  | "pour_water"      // pouring carried water at current position
  | "harvest_wood"    // chopping a tree (flood-fill removal)
  | "build_platform"  // placing wood cells for a platform
  | "build_ladder"    // placing wood cells for a ladder
  | "terraform"       // clearing/filling cells to flatten ground for building
  | "decide"          // brain: score and pick highest-priority work

// Radius around the guy in which actions (mine, place, etc.) can execute
const ACTION_RADIUS = 10
const ACTION_RADIUS_MAX = 20
const ACTION_RADIUS_GROW_TICKS = 300 // ticks to reach max radius
function getActionRadius(g: Guy): number {
  const t = Math.min(g.taskTimer, ACTION_RADIUS_GROW_TICKS)
  return ACTION_RADIUS + (ACTION_RADIUS_MAX - ACTION_RADIUS) * (t / ACTION_RADIUS_GROW_TICKS)
}

// Action tasks that walk to targetX before executing
const ACTION_TASKS: GuyTask[] = [
  "mine", "place", "pour_water", "harvest_wood",
  "build_platform", "build_ladder", "terraform",
]

// Jobs determine what a guy focuses on. Evaluated periodically, not every tick.
type GuyJob = "wanderer" | "farm" | "build"

// Tasks that engage climbing mode (zero gravity on climbable surfaces)
const CLIMB_TASKS: GuyTask[] = ["harvest_wood", "build_platform", "build_ladder"]

interface Guy {
  px: number[]; py: number[]   // node positions
  ox: number[]; oy: number[]   // old positions (Verlet)
  dir: 1 | -1
  stepLeg: 0 | 1  // 0 = left stance, 1 = right stance
  stepTimer: number
  state: "walk" | "fall" | "idle" | "dead" | "swim"
  deadTimer: number
  walkTimer: number
  // Task / AI system
  carrying: "water" | "brick" | "wood" | "stone" | "mud" | "sand" | "seed" | null
  task: GuyTask
  targetX: number
  targetY: number
  path: {x: number, y: number}[]  // A* waypoints
  pathTimer: number               // ticks since last path recompute
  taskTimer: number
  job: GuyJob          // current job focus
  jobTimer: number     // ticks since last job evaluation
  platX: number       // X of platform being built (-1 = none)
  platY: number       // Y of platform being built
  platW: number       // target width of platform
  ladderX: number     // X of ladder being built (-1 = none)
  ladderY1: number    // Y top of ladder
  ladderY2: number    // Y bottom of ladder
  mineType: number       // cell type to mine in generic mine task
  placeType: number      // cell type to place in generic place task
  placeX: number         // target X for place task
  placeY: number         // target Y for place task
  terraformFills: {x:number,y:number}[]   // cells to fill with stone/sand
  terraformClears: {x:number,y:number}[]  // cells to clear
}

const guys: Guy[] = []

function spawnGuy(gx: number, gy: number) {
  const px = new Array(NUM_NODES)
  const py = new Array(NUM_NODES)
  // Build from feet up
  px[N_LFOOT] = gx - 1; py[N_LFOOT] = gy
  px[N_RFOOT] = gx + 1; py[N_RFOOT] = gy
  px[N_LKNEE] = gx - 0.5; py[N_LKNEE] = gy - 2
  px[N_RKNEE] = gx + 0.5; py[N_RKNEE] = gy - 2
  px[N_HIP] = gx; py[N_HIP] = gy - 4
  px[N_NECK] = gx; py[N_NECK] = gy - 6.5
  px[N_HEAD] = gx; py[N_HEAD] = gy - 8
  px[N_LELBOW] = gx - 1.2; py[N_LELBOW] = gy - 5.5
  px[N_RELBOW] = gx + 1.2; py[N_RELBOW] = gy - 5.5
  px[N_LHAND] = gx - 1.5; py[N_LHAND] = gy - 4.5
  px[N_RHAND] = gx + 1.5; py[N_RHAND] = gy - 4.5

  guys.push({
    px, py,
    ox: [...px], oy: [...py],
    dir: Math.random() < 0.5 ? 1 : -1,
    stepLeg: 0, stepTimer: 0,
    state: "fall", deadTimer: 0, walkTimer: 0,
    carrying: null, task: "wander",
    targetX: gx, targetY: gy, path: [], pathTimer: 0,
    taskTimer: 0, job: "farm", jobTimer: 0,
    platX: -1, platY: -1, platW: 0,
    ladderX: -1, ladderY1: -1, ladderY2: -1,
    mineType: 0, placeType: 0, placeX: -1, placeY: -1,
    terraformFills: [], terraformClears: [],
  })
}

function cellToCarry(type: number): Guy["carrying"] {
  if (type === STONE) return "stone"
  if (type === SAND) return "sand"
  if (type === MUD || type === GRASS) return "mud"
  if (type === BRICK) return "brick"
  if (type === WATER) return "water"
  return null
}

// --- State ---
let W = 0, H = 0
let grid: Uint8Array
let bgGrid: Uint8Array  // background layer for trees/leaves (non-colliding)
let updated: Uint8Array
let canvas: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let imgData: ImageData
let buf32: Uint32Array
let material: number = SAND
let paused = false
let raf = 0
let toolbarEl: HTMLElement | null = null
let persistTimer = 0
let debugMode = false

const mouse = { x: 0, y: 0, down: false, spawning: false, prevX: 0, prevY: 0 }

// --- Grid helpers ---
const idx = (x: number, y: number) => y * W + x
const inBounds = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H

function getCell(x: number, y: number): number {
  if (!inBounds(x, y)) return WALL
  return grid[idx(x, y)]
}

function setCell(x: number, y: number, v: number) {
  if (inBounds(x, y)) grid[idx(x, y)] = v
}

function getBg(x: number, y: number): number {
  if (!inBounds(x, y)) return EMPTY
  return bgGrid[idx(x, y)]
}

function setBg(x: number, y: number, v: number) {
  if (inBounds(x, y)) bgGrid[idx(x, y)] = v
}

// --- Scene persistence ---
type SceneGuy = { x: number; y: number; dir: 1 | -1 }
type Scene = { w: number; h: number; p: [number, number, number][]; g?: SceneGuy[]; bg?: [number, number, number][] }

function serializeScene(): Scene {
  const particles: [number, number, number][] = []
  const bg: [number, number, number][] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = grid[y * W + x]
      if (cell !== EMPTY) {
        particles.push([x, y, cell])
      }
      const bgCell = bgGrid[y * W + x]
      if (bgCell !== EMPTY) {
        bg.push([x, y, bgCell])
      }
    }
  }
  const g: SceneGuy[] = guys.filter(g => g.state !== "dead").map(g => ({ x: Math.round(g.px[N_HIP]), y: Math.round(g.py[N_LFOOT] > g.py[N_RFOOT] ? g.py[N_LFOOT] : g.py[N_RFOOT]), dir: g.dir }))
  return { w: W, h: H, p: particles, ...(g.length > 0 ? { g } : {}), ...(bg.length > 0 ? { bg } : {}) }
}

function loadScene(scene: Scene) {
  grid.fill(EMPTY)
  bgGrid.fill(EMPTY)
  guys.length = 0
  const scaleX = W / scene.w
  const scaleY = H / scene.h
  const isNewFormat = !!scene.bg
  for (const [sx, sy, type] of scene.p) {
    // Fill the full destination range to avoid gaps when upscaling
    const x0 = Math.floor(sx * scaleX)
    const x1 = Math.floor((sx + 1) * scaleX)
    const y0 = Math.floor(sy * scaleY)
    const y1 = Math.floor((sy + 1) * scaleY)
    for (let dy = y0; dy < y1 || dy === y0; dy++) {
      for (let dx = x0; dx < x1 || dx === x0; dx++) {
        if (inBounds(dx, dy)) {
          if (!isNewFormat && (type === LEAF || type === WOOD)) {
            bgGrid[dy * W + dx] = type === WOOD ? TREE : LEAF
          } else {
            grid[dy * W + dx] = type
          }
        }
      }
    }
  }
  if (scene.bg) {
    for (const [sx, sy, type] of scene.bg) {
      const x0 = Math.floor(sx * scaleX)
      const x1 = Math.floor((sx + 1) * scaleX)
      const y0 = Math.floor(sy * scaleY)
      const y1 = Math.floor((sy + 1) * scaleY)
      for (let dy = y0; dy < y1 || dy === y0; dy++) {
        for (let dx = x0; dx < x1 || dx === x0; dx++) {
          if (inBounds(dx, dy)) {
            bgGrid[dy * W + dx] = type
          }
        }
      }
    }
  }
  if (scene.g) {
    for (const sg of scene.g) {
      spawnGuy(Math.round(sg.x * scaleX), Math.round(sg.y * scaleY))
      if (guys.length > 0) guys[guys.length - 1].dir = sg.dir
    }
  }
}

function loadSceneFromDOM() {
  const mount = document.getElementById("particle-mount")
  if (!mount) return
  const raw = mount.getAttribute("data-scene")
  if (!raw) return
  try {
    const scene = JSON.parse(raw) as Scene
    if (scene.p && scene.p.length > 0) {
      loadScene(scene)
    }
  } catch {}
}

function saveScene() {
  const mount = document.getElementById("particle-mount")
  const slug = mount?.getAttribute("data-slug") || "index"
  const scene = serializeScene()
  const json = JSON.stringify(scene)
  // Copy as a snippet ready to paste into quartz/particles.json
  const snippet = `"${slug}": ${json}`
  navigator.clipboard.writeText(snippet).then(() => {
    showToast("Copied! Paste into quartz/particles.json")
  }).catch(() => {
    // Fallback: log to console
    console.log("Particle scene for " + slug + ":")
    console.log(snippet)
    showToast("Logged to console (clipboard blocked)")
  })
}

function showToast(msg: string) {
  const toast = document.createElement("div")
  toast.textContent = msg
  toast.style.cssText = `
    position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
    padding:6px 16px;background:var(--dark);color:var(--light);
    border-radius:6px;font-size:13px;z-index:101;
    opacity:1;transition:opacity 0.3s ease;
    font-family:var(--bodyFont);
  `
  document.body.appendChild(toast)
  setTimeout(() => { toast.style.opacity = "0" }, 1500)
  setTimeout(() => toast.remove(), 1900)
}

// --- LocalStorage persistence ---
function localStorageKey(): string {
  const mount = document.getElementById("particle-mount")
  const slug = mount?.getAttribute("data-slug") || "index"
  return "particle-state:" + slug
}

function persistToLocalStorage() {
  try {
    const scene = serializeScene()
    localStorage.setItem(localStorageKey(), JSON.stringify(scene))
  } catch {}
}

function loadFromLocalStorage(): boolean {
  try {
    const raw = localStorage.getItem(localStorageKey())
    if (!raw) return false
    const scene = JSON.parse(raw) as Scene
    if (scene.p && scene.p.length > 0) {
      loadScene(scene)
      return true
    }
  } catch {}
  return false
}

// --- Initialization ---
function init() {
  canvas = document.getElementById("particle-canvas") as HTMLCanvasElement
  if (!canvas) {
    canvas = document.createElement("canvas")
    canvas.id = "particle-canvas"
    document.body.prepend(canvas)
  }

  resize()
  // Load state: prefer localStorage, fall back to DOM-embedded scene
  if (!loadFromLocalStorage()) {
    loadSceneFromDOM()
  }
  setupInput()
  createToolbar()
  if (raf) cancelAnimationFrame(raf)
  if (persistTimer) clearInterval(persistTimer)
  persistTimer = window.setInterval(persistToLocalStorage, 5000)
  loop()
}

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight

  canvas.width = w
  canvas.height = h

  const newW = Math.ceil(w / CELL)
  const newH = Math.ceil(h / CELL)

  const oldGrid = grid
  const oldBgGrid = bgGrid
  const oldW = W, oldH = H

  W = newW
  H = newH
  grid = new Uint8Array(W * H)
  bgGrid = new Uint8Array(W * H)
  updated = new Uint8Array(W * H)

  if (oldGrid && oldW > 0 && oldH > 0) {
    // Center the old content in the new grid — symmetric trim/expand
    const offsetX = Math.floor((newW - oldW) / 2)
    const offsetY = Math.floor((newH - oldH) / 2)
    for (let y = 0; y < oldH; y++) {
      const destY = y + offsetY
      if (destY < 0 || destY >= newH) continue
      for (let x = 0; x < oldW; x++) {
        const destX = x + offsetX
        if (destX < 0 || destX >= newW) continue
        grid[destY * newW + destX] = oldGrid[y * oldW + x]
        if (oldBgGrid) bgGrid[destY * newW + destX] = oldBgGrid[y * oldW + x]
      }
    }
    // Shift guys to match the new offset
    for (const g of guys) {
      for (let n = 0; n < NUM_NODES; n++) {
        g.px[n] += offsetX
        g.py[n] += offsetY
        g.ox[n] += offsetX
        g.oy[n] += offsetY
      }
      g.targetX += offsetX
      g.targetY += offsetY
      g.placeX += offsetX
      g.placeY += offsetY
      // Shift path waypoints
      for (const wp of g.path) {
        wp.x += offsetX
        wp.y += offsetY
      }
      // Shift terraform targets
      for (const t of g.terraformFills) { t.x += offsetX; t.y += offsetY }
      for (const t of g.terraformClears) { t.x += offsetX; t.y += offsetY }
    }
  }

  ctx = canvas.getContext("2d")!
  imgData = ctx.createImageData(canvas.width, canvas.height)
  buf32 = new Uint32Array(imgData.data.buffer)
}

// --- Mouse particle spawning ---
let guySpawnedThisClick = false

function spawnFromMouse() {
  if (!mouse.down || !mouse.spawning) return

  const gx = Math.floor(mouse.x / CELL)
  const gy = Math.floor(mouse.y / CELL)

  // Guy: spawn once per click
  if (material === GUY) {
    if (!guySpawnedThisClick) {
      spawnGuy(gx, gy)
      guySpawnedThisClick = true
    }
    return
  }

  const r = BRUSH_RADIUS
  const mat = material

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const px = gx + dx
      const py = gy + dy
      if (!inBounds(px, py)) continue

      if (mat === EMPTY) {
        setCell(px, py, EMPTY)
        setBg(px, py, EMPTY)
      } else if (mat === TREE || mat === LEAF) {
        // Tree and leaf go on background layer
        if (getBg(px, py) === EMPTY) {
          setBg(px, py, mat)
        }
      } else if (getCell(px, py) === EMPTY) {
        if ((mat === FIRE || mat === WATER) ? Math.random() < 0.5 : true) {
          setCell(px, py, mat)
        }
      }
    }
  }
}

let simTick = 0

// --- Physics simulation ---
function simulate() {
  simTick++
  if (simTick % REGION_RECOMPUTE_INTERVAL === 0 || regionMapTick < 0) {
    computeRegionMap()
    regionMapTick = simTick
  }
  updated.fill(0)

  for (let y = H - 1; y >= 0; y--) {
    const ltr = Math.random() < 0.5
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i
      const cell = grid[y * W + x]
      if (cell === EMPTY || cell === WALL || cell === BRICK || cell === DOOR || cell === STONE || cell === WOOD || cell === HOUSE_BRICK || updated[y * W + x]) continue

      if (cell === SAND) {
        if (getCell(x, y + 1) === EMPTY) {
          setCell(x, y, EMPTY); setCell(x, y + 1, SAND)
          updated[(y + 1) * W + x] = 1
        } else if (getCell(x, y + 1) === WATER) {
          setCell(x, y, WATER); setCell(x, y + 1, SAND)
          updated[(y + 1) * W + x] = 1; updated[y * W + x] = 1
        } else {
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x + d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y + 1, SAND)
            updated[(y + 1) * W + (x + d)] = 1
          } else if (getCell(x - d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x - d, y + 1, SAND)
            updated[(y + 1) * W + (x - d)] = 1
          }
        }
      } else if (cell === WATER) {
        if (getCell(x, y + 1) === EMPTY) {
          setCell(x, y, EMPTY); setCell(x, y + 1, WATER)
          updated[(y + 1) * W + x] = 1
        } else {
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x + d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y + 1, WATER)
            updated[(y + 1) * W + (x + d)] = 1
          } else if (getCell(x - d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x - d, y + 1, WATER)
            updated[(y + 1) * W + (x - d)] = 1
          } else if (getCell(x + d, y) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y, WATER)
            updated[y * W + (x + d)] = 1
          } else if (getCell(x - d, y) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x - d, y, WATER)
            updated[y * W + (x - d)] = 1
          }
        }
      } else if (cell === FIRE) {
        // Wild fire: burns out, spreads, rises
        if (Math.random() < 0.08) {
          setCell(x, y, SMOKE); updated[y * W + x] = 1
        } else if (Math.random() < 0.15) {
          setCell(x, y, EMPTY)
        } else {
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nc = getCell(x + fx, y + fy)
            const bc = getBg(x + fx, y + fy)
            if (bc === LEAF && Math.random() < 0.06) {
              setBg(x + fx, y + fy, EMPTY)
            } else if (bc === TREE && Math.random() < 0.02) {
              setBg(x + fx, y + fy, EMPTY)
              setCell(x + fx, y + fy, FIRE); updated[(y + fy) * W + (x + fx)] = 1
            }
            if (nc === WOOD && Math.random() < 0.02) {
              setCell(x + fx, y + fy, FIRE); updated[(y + fy) * W + (x + fx)] = 1
            }
          }
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nc = getCell(x + fx, y + fy)
            if (nc === WATER && Math.random() < 0.02) {
              setCell(x + fx, y + fy, SMOKE); updated[(y + fy) * W + (x + fx)] = 1
            } else if ((nc === MUD || nc === GRASS) && Math.random() < 0.03) {
              setCell(x + fx, y + fy, BRICK)
            }
          }
          // Fire rises
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x, y - 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x, y - 1, FIRE)
            updated[(y - 1) * W + x] = 1
          } else if (getCell(x + d, y - 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y - 1, FIRE)
            updated[(y - 1) * W + (x + d)] = 1
          }
        }
      } else if (cell === KILN_FIRE) {
        // Safe kiln fire: stays in place, only bakes mud into brick
        // Goes out if not enclosed by kiln stone on at least 3 sides (left, right, below)
        let kilnStoneCount = 0
        for (const [fx, fy] of [[-1,0],[1,0],[0,1]]) {
          if (getCell(x + fx, y + fy) === KILN_STONE) kilnStoneCount++
        }
        if (kilnStoneCount < 3) {
          setCell(x, y, SMOKE); updated[y * W + x] = 1
        } else {
          // Water extinguishes it
          let extinguished = false
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nc = getCell(x + fx, y + fy)
            if (nc === WATER) {
              setCell(x, y, SMOKE); updated[y * W + x] = 1
              setCell(x + fx, y + fy, SMOKE); updated[(y + fy) * W + (x + fx)] = 1
              extinguished = true; break
            }
          }
          if (!extinguished) {
            for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nc = getCell(x + fx, y + fy)
              if ((nc === MUD || nc === GRASS) && Math.random() < 0.03) {
                setCell(x + fx, y + fy, BRICK)
              }
            }
          }
        }
      } else if (cell === SMOKE) {
        if (Math.random() < 0.025) {
          setCell(x, y, EMPTY)
        } else {
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x, y - 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x, y - 1, SMOKE)
            updated[(y - 1) * W + x] = 1
          } else if (getCell(x + d, y - 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y - 1, SMOKE)
            updated[(y - 1) * W + (x + d)] = 1
          } else if (getCell(x + d, y) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y, SMOKE)
            updated[y * W + (x + d)] = 1
          }
        }
      } else if (cell === SEED) {
        // Seed falls like sand
        if (getCell(x, y + 1) === EMPTY) {
          setCell(x, y, EMPTY); setCell(x, y + 1, SEED)
          updated[(y + 1) * W + x] = 1
        } else if (getCell(x, y + 1) === WATER) {
          // Seed touching water → becomes tree trunk (on bg layer), water consumed
          setCell(x, y, EMPTY)
          setBg(x, y, TREE)
          setCell(x, y + 1, EMPTY)
          updated[y * W + x] = 1
        } else {
          // Landed — check adjacent water to sprout (high chance so water isn't wasted)
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if (getCell(x + fx, y + fy) === WATER && Math.random() < 0.4) {
              setCell(x, y, EMPTY)
              setBg(x, y, TREE)
              setCell(x + fx, y + fy, EMPTY)
              updated[y * W + x] = 1
              break
            }
          }
        }
      } else if (cell === MUD) {
        // Mud falls like sand, displaces water
        if (getCell(x, y + 1) === EMPTY) {
          setCell(x, y, EMPTY); setCell(x, y + 1, MUD)
          updated[(y + 1) * W + x] = 1
        } else if (getCell(x, y + 1) === WATER) {
          setCell(x, y, WATER); setCell(x, y + 1, MUD)
          updated[(y + 1) * W + x] = 1; updated[y * W + x] = 1
        } else {
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x + d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y + 1, MUD)
            updated[(y + 1) * W + (x + d)] = 1
          } else if (getCell(x - d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x - d, y + 1, MUD)
            updated[(y + 1) * W + (x - d)] = 1
          }
        }
        // Mud touching air slowly becomes grass
        if (Math.random() < 0.002) {
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if (getCell(x + fx, y + fy) === EMPTY) {
              setCell(x, y, GRASS); break
            }
          }
        }
      } else if (cell === GRASS) {
        // Grass falls like mud, displaces water
        if (getCell(x, y + 1) === EMPTY) {
          setCell(x, y, EMPTY); setCell(x, y + 1, GRASS)
          updated[(y + 1) * W + x] = 1
        } else if (getCell(x, y + 1) === WATER) {
          setCell(x, y, WATER); setCell(x, y + 1, GRASS)
          updated[(y + 1) * W + x] = 1; updated[y * W + x] = 1
        } else {
          const d = Math.random() < 0.5 ? -1 : 1
          if (getCell(x + d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x + d, y + 1, GRASS)
            updated[(y + 1) * W + (x + d)] = 1
          } else if (getCell(x - d, y + 1) === EMPTY) {
            setCell(x, y, EMPTY); setCell(x - d, y + 1, GRASS)
            updated[(y + 1) * W + (x - d)] = 1
          }
        }
        // Grass reverts to mud if not exposed to air on any side
        let touchesAir = false
        for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (getCell(x + fx, y + fy) === EMPTY) { touchesAir = true; break }
        }
        if (!touchesAir) setCell(x, y, MUD)
      }
    }
  }

  // Second pass: water + sand → mud (water soaks through mud into sand)
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] !== WATER) continue
      // Check immediate neighbors for sand to convert
      let consumed = false
      for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + fx, ny = y + fy
        if (inBounds(nx, ny) && grid[ny * W + nx] === SAND && Math.random() < 0.01) {
          setCell(nx, ny, MUD)
          setCell(x, y, EMPTY)
          consumed = true
          break
        }
      }
      if (consumed) continue
      // Water adjacent to mud/grass soaks through — trace through mud/grass to find sand on the other side
      for (const [dx, dy] of [[0,1],[0,-1],[-1,0],[1,0]] as const) {
        const adjCell = inBounds(x + dx, y + dy) ? grid[(y + dy) * W + (x + dx)] : EMPTY
        if (!(adjCell === MUD || adjCell === GRASS)) continue
        if (Math.random() >= 0.005) continue
        // Trace in this direction through mud/grass (max depth 5)
        let tx = x + dx, ty = y + dy, depth = 1
        while (depth < 5 && inBounds(tx, ty) && (grid[ty * W + tx] === MUD || grid[ty * W + tx] === GRASS)) { tx += dx; ty += dy; depth++ }
        if (inBounds(tx, ty) && grid[ty * W + tx] === SAND) {
          setCell(tx, ty, MUD)
          setCell(x, y, EMPTY)
          break
        }
      }
    }
  }

  // Tree gravity: trunks fall straight down if unsupported (no piling)
  for (let y = H - 2; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      if (bgGrid[y * W + x] !== TREE) continue
      const belowBg = getBg(x, y + 1)
      if (isSolid(x, y + 1) || belowBg === TREE) continue
      if (belowBg === EMPTY) {
        setBg(x, y + 1, TREE)
        setBg(x, y, EMPTY)
      }
    }
  }

  // Background layer pass: TREE growth and LEAF spreading
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const bgCell = bgGrid[y * W + x]
      if (bgCell === TREE) {
        // Count trunk height below
        let trunkH = 0
        for (let ty = y + 1; ty < H && getBg(x, ty) === TREE; ty++) trunkH++
        // Stable per-tree max height derived from root X position
        const rootX = x
        const maxH = 10 + ((rootX * 2654435761 >>> 0) % 15)  // range: 10–24

        // Check if tree can benefit from water (can grow, sprout, or thicken)
        const canGrowUp = trunkH < maxH && getBg(x, y - 1) === EMPTY
        let hasEmptyForLeaves = false
        if (trunkH >= 2) {
          const spread: [number, number][] = [[-1,0],[1,0],[0,-1],[-1,-1],[1,-1]]
          if (trunkH >= 4) spread.push([-2,-1],[2,-1],[-2,0],[2,0])
          for (const [fx, fy] of spread) {
            if (getBg(x + fx, y + fy) === EMPTY) { hasEmptyForLeaves = true; break }
          }
        }
        const canThicken = trunkH >= 4 && (getBg(x - 1, y) === EMPTY || getBg(x + 1, y) === EMPTY)
        const canBenefit = canGrowUp || hasEmptyForLeaves || canThicken

        // Tree absorbs adjacent water on fg → fuels growth (only if it can benefit)
        let watered = false
        if (canBenefit) {
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if (getCell(x + fx, y + fy) === WATER && Math.random() < 0.3) {
              setCell(x + fx, y + fy, EMPTY)
              watered = true
              break
            }
          }
        }

        // Grow trunk upward — faster when watered
        const growChance = watered ? 0.03 : 0.004
        if (trunkH < maxH && getBg(x, y - 1) === EMPTY && Math.random() < growChance) {
          setBg(x, y - 1, TREE)
        }
        // Sprout leaves on sides and top (once trunk >= 2) — wider canopy when taller
        if (trunkH >= 2) {
          const spread: [number, number][] = [[-1,0],[1,0],[0,-1],[-1,-1],[1,-1]]
          if (trunkH >= 4) spread.push([-2,-1],[2,-1],[-2,0],[2,0])
          const leafChance = watered ? 0.02 : 0.003
          for (const [fx, fy] of spread) {
            if (getBg(x + fx, y + fy) === EMPTY && Math.random() < leafChance) {
              setBg(x + fx, y + fy, LEAF)
            }
          }
        }
        // Thicken trunk — taller trees grow side branches
        if (trunkH >= 4 && Math.random() < (watered ? 0.008 : 0.001)) {
          const side = Math.random() < 0.5 ? -1 : 1
          if (getBg(x + side, y) === EMPTY) {
            setBg(x + side, y, TREE)
          }
        }
      } else if (bgCell === LEAF) {
        // Leaf absorbs adjacent water → spreads more leaves (high chance so water doesn't waste)
        // Cap canopy size: count plant cells in a 5x5 area — stop spreading if too dense
        // Also require a nearby trunk to prevent ground creep
        let plantCount = 0
        let nearTrunk = false
        for (let ly = -2; ly <= 2; ly++) {
          for (let lx = -2; lx <= 2; lx++) {
            if (inBounds(x + lx, y + ly)) {
              const bg = getBg(x + lx, y + ly)
              if (bg === LEAF) plantCount++
              if (bg === TREE) { plantCount++; nearTrunk = true }
            }
          }
        }
        if (plantCount < 16 && nearTrunk) {
          for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if (getCell(x + fx, y + fy) === WATER && Math.random() < 0.15) {
              const wx = x + fx, wy = y + fy
              let waterNeighbors = 0
              for (const [nx, ny] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                if (getCell(wx + nx, wy + ny) === WATER) waterNeighbors++
              }
              if (waterNeighbors >= 2) continue
              setCell(wx, wy, EMPTY)
              setBg(wx, wy, LEAF)
            }
          }
        } else {
          // Canopy is full — don't absorb water, let it flow to other plants
        }
        // Wither: leaves too far from any trunk slowly decay
        if (!nearTrunk && Math.random() < 0.005) {
          // Check wider radius for any trunk
          let hasTrunk = false
          for (let ly = -5; ly <= 5 && !hasTrunk; ly++) {
            for (let lx = -5; lx <= 5 && !hasTrunk; lx++) {
              if (inBounds(x + lx, y + ly) && getBg(x + lx, y + ly) === TREE) hasTrunk = true
            }
          }
          if (!hasTrunk) {
            setBg(x, y, EMPTY)
          }
        }
      }
    }
  }
}

// --- Guy simulation (Verlet spring physics) ---
// Probe downward from (x, startY) to find ground surface. Returns Y just above first solid cell.
function findGround(x: number, startY: number, maxDist = 12): number {
  const gx = Math.round(x)
  const sy = Math.round(startY)
  for (let dy = 0; dy < maxDist; dy++) {
    if (isSolid(gx, sy + dy)) return sy + dy - 0.5
  }
  return startY + maxDist  // no ground found — cliff
}

function isSolid(x: number, y: number): boolean {
  const c = getCell(Math.round(x), Math.round(y))
  return c === WALL || c === SAND || c === MUD || c === GRASS || c === SEED || c === BRICK || c === STONE || c === WOOD || c === KILN_STONE || c === HOUSE_BRICK
}

// Cell is reachable — at least one neighbor is empty or water (not fully encased)
function isAccessible(x: number, y: number): boolean {
  for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const c = getCell(x + fx, y + fy)
    if (c === EMPTY || c === WATER) return true
  }
  return false
}

// --- Coarse region map for fast reachability checks ---
// Divides the grid into REGION_SIZE×REGION_SIZE chunks. Each chunk gets a region ID
// via flood-fill through walkable chunks. Two cells are reachable iff their chunks
// share the same region ID. Recomputed every REGION_RECOMPUTE_INTERVAL ticks.
const REGION_SIZE = 10
let regionCols = 0, regionRows = 0
let regionMap: Int16Array = new Int16Array(0) // region ID per chunk (-1 = impassable)
let regionMapTick = -1
const REGION_RECOMPUTE_INTERVAL = 60

// A cell is "standable" if a guy could occupy it: water, or (empty/guy with solid ground below), or climbable bg
function isStandable(gx: number, gy: number): boolean {
  if (gx < 0 || gx >= W || gy < 0 || gy >= H) return false
  const c = grid[gy * W + gx]
  if (c === WATER) return true
  if (c !== EMPTY && c !== GUY) return false
  // Check ground below
  if (gy + 1 < H && isSolid(gx, gy + 1)) return true
  // Check climbable (tree/leaf bg)
  const b = bgGrid[gy * W + gx]
  if (b === TREE || b === LEAF) return true
  return false
}

// Check if a guy could physically cross from chunk A to adjacent chunk B
// at their shared boundary. Horizontal: any standable cell at the edge can step across.
// Vertical down: always possible (falling). Vertical up: need climbable or step-up.
function chunksConnected(cc1: number, cr1: number, cc2: number, cr2: number): boolean {
  const dc = cc2 - cc1, dr = cr2 - cr1
  if (dc !== 0) {
    // Horizontal neighbor — check boundary column
    const edgeX1 = dc > 0 ? (cc2 * REGION_SIZE) - 1 : (cc1 * REGION_SIZE) - 1
    const edgeX2 = edgeX1 + 1
    const y0 = Math.min(cr1, cr2) * REGION_SIZE
    const y1 = Math.min(y0 + REGION_SIZE, H)
    for (let gy = y0; gy < y1; gy++) {
      // Can step from edgeX1 to edgeX2 or vice versa if both standable,
      // or one is standable and the other is empty (guy walks into air and falls)
      if (edgeX1 >= 0 && edgeX2 < W) {
        const s1 = isStandable(edgeX1, gy)
        const s2 = isStandable(edgeX2, gy)
        if (s1 || s2) return true
        // Step-up: standable one row higher
        if (gy > 0 && (isStandable(edgeX1, gy - 1) || isStandable(edgeX2, gy - 1))) return true
      }
    }
    return false
  }
  if (dr !== 0) {
    // Vertical neighbor
    const x0 = cc1 * REGION_SIZE
    const x1 = Math.min(x0 + REGION_SIZE, W)
    if (dr > 0) {
      // Downward — guy can always fall, just need standable cells in both chunks
      return true
    } else {
      // Upward — need climbable surface or step-up at boundary
      const boundaryY = cr1 * REGION_SIZE // top of lower chunk
      for (let gx = x0; gx < x1; gx++) {
        // Climbable at boundary
        if (boundaryY > 0 && boundaryY < H) {
          const b = bgGrid[boundaryY * W + gx]
          const bAbove = boundaryY > 0 ? bgGrid[(boundaryY - 1) * W + gx] : EMPTY
          if (b === TREE || b === LEAF || bAbove === TREE || bAbove === LEAF) return true
          // Step-up: solid at boundary, empty above
          if (isSolid(gx, boundaryY) && boundaryY > 0 && !isSolid(gx, boundaryY - 1)) return true
        }
      }
      return false
    }
  }
  return false
}

function computeRegionMap() {
  regionCols = Math.ceil(W / REGION_SIZE)
  regionRows = Math.ceil(H / REGION_SIZE)
  if (regionMap.length !== regionCols * regionRows) {
    regionMap = new Int16Array(regionCols * regionRows)
  }
  regionMap.fill(-1)

  // Determine which chunks have any standable cell
  const passable = new Uint8Array(regionCols * regionRows)
  for (let cr = 0; cr < regionRows; cr++) {
    for (let cc = 0; cc < regionCols; cc++) {
      const x0 = cc * REGION_SIZE, y0 = cr * REGION_SIZE
      let found = false
      for (let dy = 0; dy < REGION_SIZE && !found; dy++) {
        for (let dx = 0; dx < REGION_SIZE && !found; dx++) {
          if (isStandable(x0 + dx, y0 + dy)) found = true
        }
      }
      passable[cr * regionCols + cc] = found ? 1 : 0
    }
  }

  // Flood-fill connected components using physical connectivity
  let nextRegion = 0
  const queue: number[] = []
  for (let i = 0; i < passable.length; i++) {
    if (!passable[i] || regionMap[i] >= 0) continue
    const rid = nextRegion++
    regionMap[i] = rid
    queue.length = 0
    queue.push(i)
    let qi = 0
    while (qi < queue.length) {
      const ci = queue[qi++]
      const cr = (ci / regionCols) | 0, cc = ci % regionCols
      for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nc = cc + dc, nr = cr + dr
        if (nc < 0 || nc >= regionCols || nr < 0 || nr >= regionRows) continue
        const ni = nr * regionCols + nc
        if (passable[ni] && regionMap[ni] < 0 && chunksConnected(cc, cr, nc, nr)) {
          regionMap[ni] = rid
          queue.push(ni)
        }
      }
    }
  }
}

function getRegion(x: number, y: number): number {
  const cc = Math.min((Math.round(x) / REGION_SIZE) | 0, regionCols - 1)
  const cr = Math.min((Math.round(y) / REGION_SIZE) | 0, regionRows - 1)
  if (cc < 0 || cr < 0) return -1
  return regionMap[cr * regionCols + cc]
}

function isReachable(fromX: number, fromY: number, toX: number, toY: number): boolean {
  const rFrom = getRegion(fromX, fromY)
  const rTo = getRegion(toX, toY)
  if (rFrom < 0 || rTo < 0) return false
  return rFrom === rTo
}

function isClimbable(x: number, y: number): boolean {
  const rx = Math.round(x), ry = Math.round(y)
  const b = getBg(rx, ry)
  if (b === TREE || b === LEAF) return true
  // Ladder: WOOD on fg with an adjacent WOOD cell vertically (ladder side rail)
  const f = getCell(rx, ry)
  if (f === WOOD) return true
  // Also climbable if adjacent to WOOD (inside the ladder gap)
  if (f === EMPTY && (getCell(rx - 1, ry) === WOOD || getCell(rx + 1, ry) === WOOD) &&
      (getCell(rx, ry - 1) === WOOD || getCell(rx, ry + 1) === WOOD)) return true
  return false
}

function nodeHitsFire(nx: number, ny: number): boolean {
  const gx = Math.round(nx), gy = Math.round(ny)
  return getCell(gx, gy) === FIRE || getCell(gx - 1, gy) === FIRE || getCell(gx + 1, gy) === FIRE
}

function nodeInWater(nx: number, ny: number): boolean {
  return getCell(Math.round(nx), Math.round(ny)) === WATER
}

function solveConstraints(g: Guy, applyPosture: boolean) {
  for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
    // Distance constraints (springs)
    for (const [a, b, restLen] of BODY_SPRINGS) {
      const dx = g.px[b] - g.px[a]
      const dy = g.py[b] - g.py[a]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.001) continue
      const diff = (restLen - dist) / dist * 0.5
      g.px[a] -= dx * diff
      g.py[a] -= dy * diff
      g.px[b] += dx * diff
      g.py[b] += dy * diff
    }

    // Min distance: keep feet/knees from crossing
    for (const [a, b, minLen] of MIN_DIST_SPRINGS) {
      const dx = g.px[b] - g.px[a]
      const dy = g.py[b] - g.py[a]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minLen && dist > 0.001) {
        const diff = (minLen - dist) / dist * 0.5
        g.px[a] -= dx * diff
        g.py[a] -= dy * diff
        g.px[b] += dx * diff
        g.py[b] += dy * diff
      }
    }

    // Max distance: prevent splits — pull feet together if too far apart
    {
      const dx = g.px[N_RFOOT] - g.px[N_LFOOT]
      const dy = g.py[N_RFOOT] - g.py[N_LFOOT]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > MAX_FOOT_SPREAD) {
        const diff = (MAX_FOOT_SPREAD - dist) / dist * 0.5
        g.px[N_LFOOT] -= dx * diff
        g.py[N_LFOOT] -= dy * diff
        g.px[N_RFOOT] += dx * diff
        g.py[N_RFOOT] += dy * diff
      }
    }

    // Postural constraint: keep spine vertical when alive and grounded
    if (applyPosture) {
      // Head should be directly above hip
      const spineX = g.px[N_HIP]
      // Gently pull head and neck toward being above hip
      g.px[N_HEAD] += (spineX - g.px[N_HEAD]) * 0.3
      g.px[N_NECK] += (spineX - g.px[N_NECK]) * 0.3

      // Head should be above neck, neck above hip (enforce vertical ordering)
      if (g.py[N_HEAD] > g.py[N_NECK]) {
        const mid = (g.py[N_HEAD] + g.py[N_NECK]) * 0.5
        g.py[N_HEAD] = mid - 0.75
        g.py[N_NECK] = mid + 0.75
      }
      if (g.py[N_NECK] > g.py[N_HIP]) {
        const mid = (g.py[N_NECK] + g.py[N_HIP]) * 0.5
        g.py[N_NECK] = mid - 1.25
        g.py[N_HIP] = mid + 1.25
      }

      // Keep knees below hip
      if (g.py[N_LKNEE] < g.py[N_HIP] + 0.5) g.py[N_LKNEE] = g.py[N_HIP] + 0.5
      if (g.py[N_RKNEE] < g.py[N_HIP] + 0.5) g.py[N_RKNEE] = g.py[N_HIP] + 0.5
      // Keep feet below knees
      if (g.py[N_LFOOT] < g.py[N_LKNEE] + 0.5) g.py[N_LFOOT] = g.py[N_LKNEE] + 0.5
      if (g.py[N_RFOOT] < g.py[N_RKNEE] + 0.5) g.py[N_RFOOT] = g.py[N_RKNEE] + 0.5
    }

    // Ground collision — try up first (2 cells max), fall back to horizontal
    for (let n = 0; n < NUM_NODES; n++) {
      const nx = Math.round(g.px[n]), ny = Math.round(g.py[n])
      if (isSolid(nx, ny)) {
        // Try pushing up (small cap to avoid overhang launches)
        let pushY = ny, pushes = 0
        while (isSolid(nx, pushY) && pushes < 2) { pushY--; pushes++ }
        if (!isSolid(nx, pushY)) {
          // Up worked within 2 cells
          g.py[n] = pushY
        } else {
          // Overhang — push horizontally in guy's facing direction
          let pushX = nx, hPushes = 0
          while (isSolid(pushX, ny) && hPushes < 3) { pushX += g.dir; hPushes++ }
          if (!isSolid(pushX, ny)) {
            g.px[n] = pushX; g.py[n] = ny
          } else {
            // Try opposite direction
            pushX = nx; hPushes = 0
            while (isSolid(pushX, ny) && hPushes < 3) { pushX -= g.dir; hPushes++ }
            if (!isSolid(pushX, ny)) {
              g.px[n] = pushX; g.py[n] = ny
            } else {
              // Last resort: push up further
              while (isSolid(nx, pushY) && pushes < 6) { pushY--; pushes++ }
              g.py[n] = pushY
            }
          }
        }
        g.ox[n] = g.px[n]
        g.oy[n] = g.py[n]
      }
    }
  }
}

// --- Resource scanning for guy AI ---
// Scan nearby cells for a particle type. Returns {x, y} of nearest match or null.
function scanForCell(fromX: number, fromY: number, cellType: number, radius = 200, requireAccessible = true, skipFilter?: (x: number, y: number) => boolean): {x: number, y: number} | null {
  // Expanding ring search — finds nearest match without scanning entire radius
  const cx = Math.round(fromX), cy = Math.round(fromY)
  for (let r = 1; r <= radius; r++) {
    // Scan the perimeter of a square at distance r
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of (Math.abs(dx) === r ? Array.from({length: 2 * r + 1}, (_, i) => i - r) : [-r, r])) {
        const nx = cx + dx, ny = cy + dy
        if (inBounds(nx, ny) && grid[ny * W + nx] === cellType) {
          if (requireAccessible && !isAccessible(nx, ny)) continue
          if (skipFilter && skipFilter(nx, ny)) continue
          if (requireAccessible && !isReachable(fromX, fromY, nx, ny)) continue
          return { x: nx, y: ny }
        }
      }
    }
  }
  return null
}

function scanForBgCell(fromX: number, fromY: number, cellType: number, radius = 200): {x: number, y: number} | null {
  const cx = Math.round(fromX), cy = Math.round(fromY)
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of (Math.abs(dx) === r ? Array.from({length: 2 * r + 1}, (_, i) => i - r) : [-r, r])) {
        const nx = cx + dx, ny = cy + dy
        if (inBounds(nx, ny) && bgGrid[ny * W + nx] === cellType && isReachable(fromX, fromY, nx, ny)) {
          return { x: nx, y: ny }
        }
      }
    }
  }
  return null
}

// Find surface sand (empty above, not adjacent to water) — for inland farming
function scanForInlandSand(fromX: number, fromY: number, radius = 200): {x: number, y: number} | null {
  const cx = Math.round(fromX), cy = Math.round(fromY)
  for (let r = 3; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of (Math.abs(dx) === r ? Array.from({length: 2 * r + 1}, (_, i) => i - r) : [-r, r])) {
        const nx = cx + dx, ny = cy + dy
        if (!inBounds(nx, ny) || grid[ny * W + nx] !== SAND) continue
        // Must have empty space above (surface sand only)
        if (!inBounds(nx, ny - 1) || grid[(ny - 1) * W + nx] !== EMPTY) continue
        // Reject if any neighbor is water (this is beach sand)
        let nearWater = false
        for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          if (inBounds(nx+fx, ny+fy) && grid[(ny+fy) * W + (nx+fx)] === WATER) { nearWater = true; break }
        }
        if (!nearWater && isReachable(fromX, fromY, nx, ny)) return { x: nx, y: ny }
      }
    }
  }
  return null
}

// Check if mud at (mx, my) has a valid planting spot above it (empty, no seed/tree within 3)
function isPlantableMud(mx: number, my: number): boolean {
  // Need an empty cell on top of the mud
  if (!inBounds(mx, my - 1) || grid[(my - 1) * W + mx] !== EMPTY) return false
  // Check no seed or tree/leaf within 3 cells of the planting spot
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = mx + dx, ny = (my - 1) + dy
      if (!inBounds(nx, ny)) continue
      if (grid[ny * W + nx] === SEED) return false
      if (bgGrid[ny * W + nx] === TREE || bgGrid[ny * W + nx] === LEAF) return false
    }
  }
  return true
}

// Scan for mud/grass that has a valid planting location
function scanForPlantableMud(fromX: number, fromY: number, radius = 200): {x: number, y: number} | null {
  const cx = Math.round(fromX), cy = Math.round(fromY)
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of (Math.abs(dx) === r ? Array.from({length: 2 * r + 1}, (_, i) => i - r) : [-r, r])) {
        const nx = cx + dx, ny = cy + dy
        if (inBounds(nx, ny) && (grid[ny * W + nx] === MUD || grid[ny * W + nx] === GRASS) && isPlantableMud(nx, ny) && isReachable(fromX, fromY, nx, ny)) {
          return { x: nx, y: ny }
        }
      }
    }
  }
  return null
}

// Check if there's a specific cell type near a position (within a few cells)
function hasCellNear(x: number, y: number, cellType: number, r = 2): boolean {
  const cx = Math.round(x), cy = Math.round(y)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(cx + dx, cy + dy) && grid[(cy + dy) * W + (cx + dx)] === cellType) return true
    }
  }
  return false
}

function hasBgCellNear(x: number, y: number, cellType: number, r = 2): boolean {
  const cx = Math.round(x), cy = Math.round(y)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(cx + dx, cy + dy) && bgGrid[(cy + dy) * W + (cx + dx)] === cellType) return true
    }
  }
  return false
}

// --- Platform & ladder helpers ---
// Next wood cell to place for a platform (left to right)
function nextPlatformCell(g: Guy): { x: number, y: number } | null {
  if (g.platX < 0) return null
  for (let dx = 0; dx < g.platW; dx++) {
    const px = g.platX + dx, py = g.platY
    if (inBounds(px, py) && getCell(px, py) === EMPTY) {
      return { x: px, y: py }
    }
  }
  return null // platform complete
}

// Next wood cell to place for a ladder (4 wide, top to bottom)
// Pattern: sides solid (col 0,3), middle alternating (col 1,2)
function nextLadderCell(g: Guy): { x: number, y: number } | null {
  if (g.ladderX < 0) return null
  const top = Math.min(g.ladderY1, g.ladderY2)
  const bot = Math.max(g.ladderY1, g.ladderY2)
  for (let y = top; y <= bot; y++) {
    for (let dx = 0; dx < 4; dx++) {
      const lx = g.ladderX + dx
      if (!inBounds(lx, y)) continue
      const isSide = dx === 0 || dx === 3
      const isRung = (dx === 1 || dx === 2) && ((y - top) % 2 === 0) // rung every other row
      if (isSide || isRung) {
        if (getCell(lx, y) === EMPTY) return { x: lx, y }
      }
    }
  }
  return null // ladder complete
}

// --- A* pathfinding ---
// Can a guy mine through this cell? (anything solid except WALL)
function isMineable(x: number, y: number): boolean {
  const c = getCell(x, y)
  return isSolid(x, y) && c !== WALL
}
const MINE_COST = 10 // expensive but cheaper than building

// Guys walk on top of solid cells — a walkable position is (x, y) where
// the cell at (x, y) is not solid (EMPTY/WATER/GUY) and (x, y+1) is solid (ground).
// They can also walk through water at any depth.
function findPath(fromX: number, fromY: number, toX: number, toY: number): {x: number, y: number}[] {
  const sx = Math.round(fromX), sy = Math.round(fromY)
  const tx = Math.round(toX), ty = Math.round(toY)
  if (sx === tx && sy === ty) return []

  // Walkable: non-solid cell with solid or water below (standing surface)
  // Bottom edge of canvas counts as ground (guys can stand on it)
  function isWalkable(x: number, y: number): boolean {
    if (!inBounds(x, y)) return false
    const c = getCell(x, y)
    if (c === WATER) return true
    if (isSolid(x, y)) return false
    // Bottom of canvas is ground
    if (y + 1 >= H) return true
    if (isSolid(x, y + 1) || getCell(x, y + 1) === WATER) return true
    return false
  }

  // If start isn't walkable (mid-air, on a tree, etc.), find nearest walkable cell
  let startX = sx, startY = sy
  if (!isWalkable(startX, startY)) {
    let found = false
    for (let r = 1; r <= 8 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          if (isWalkable(sx + dx, sy + dy)) {
            startX = sx + dx; startY = sy + dy; found = true; break
          }
        }
      }
    }
    if (!found) return []
  }
  // Same for target
  let endX = tx, endY = ty
  if (!isWalkable(endX, endY)) {
    let found = false
    for (let r = 1; r <= 8 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          if (isWalkable(tx + dx, ty + dy)) {
            endX = tx + dx; endY = ty + dy; found = true; break
          }
        }
      }
    }
    if (!found) return []
  }

  const key = (x: number, y: number) => y * W + x
  const heuristic = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY)

  // Binary min-heap for open set
  const heap: {x: number, y: number, f: number}[] = []
  function heapPush(node: {x: number, y: number, f: number}) {
    heap.push(node)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent].f <= heap[i].f) break
      const tmp = heap[parent]; heap[parent] = heap[i]; heap[i] = tmp
      i = parent
    }
  }
  function heapPop(): {x: number, y: number, f: number} {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      while (true) {
        let smallest = i
        const l = 2 * i + 1, r = 2 * i + 2
        if (l < heap.length && heap[l].f < heap[smallest].f) smallest = l
        if (r < heap.length && heap[r].f < heap[smallest].f) smallest = r
        if (smallest === i) break
        const tmp = heap[smallest]; heap[smallest] = heap[i]; heap[i] = tmp
        i = smallest
      }
    }
    return top
  }

  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const closed = new Set<number>()

  const sk = key(startX, startY)
  gScore.set(sk, 0)
  heapPush({x: startX, y: startY, f: heuristic(startX, startY)})

  const MAX_STEPS = 4000
  const MAX_CLIFF = 20 // max cells to scan up/down a cliff
  let steps = 0

  while (heap.length > 0 && steps < MAX_STEPS) {
    steps++
    const cur = heapPop()
    const ck = key(cur.x, cur.y)

    // Skip if already visited
    if (closed.has(ck)) continue
    closed.add(ck)

    // Close enough to target?
    if (Math.abs(cur.x - endX) <= 1 && Math.abs(cur.y - endY) <= 2) {
      // Reconstruct path
      const path: {x: number, y: number}[] = []
      let k = ck
      while (cameFrom.has(k)) {
        path.push({x: k % W, y: Math.floor(k / W)})
        k = cameFrom.get(k)!
      }
      path.reverse()
      // Thin path: keep only direction changes
      if (path.length <= 1) return path
      const thinned: {x: number, y: number}[] = [path[0]]
      for (let i = 1; i < path.length - 1; i++) {
        const dx1 = path[i].x - path[i-1].x, dy1 = path[i].y - path[i-1].y
        const dx2 = path[i+1].x - path[i].x, dy2 = path[i+1].y - path[i].y
        if (dx1 !== dx2 || dy1 !== dy2) thinned.push(path[i])
      }
      thinned.push(path[path.length - 1])
      return thinned
    }

    const curG = gScore.get(ck) ?? Infinity

    // Generate neighbors
    const neighbors: {x: number, y: number, cost: number}[] = []
    for (const dx of [-1, 1]) {
      const nx = cur.x + dx
      // Walk flat
      if (isWalkable(nx, cur.y)) {
        neighbors.push({x: nx, y: cur.y, cost: 1})
      } else if (inBounds(nx, cur.y) && isMineable(nx, cur.y)) {
        neighbors.push({x: nx, y: cur.y, cost: MINE_COST})
      }
      // Step up — scan up cliff face, capped at MAX_CLIFF
      for (let dy = -1; dy >= -MAX_CLIFF; dy--) {
        const ny = cur.y + dy
        if (!inBounds(nx, ny)) break
        if (isWalkable(nx, ny)) {
          const absDy = -dy
          const cost = absDy <= 2 ? 1.5 : absDy <= 4 ? 2.5 : absDy <= 6 ? 4 : 3 + absDy * 0.5
          neighbors.push({x: nx, y: ny, cost})
          break
        }
        // Stop scanning if we hit open air on both columns (no cliff here)
        if (!isSolid(nx, ny) && !isSolid(cur.x, ny)) break
      }
      // Step down — fall until landing, capped at MAX_CLIFF
      if (!isWalkable(nx, cur.y)) {
        for (let dy = 1; dy <= MAX_CLIFF; dy++) {
          const ny = cur.y + dy
          if (!inBounds(nx, ny)) break
          if (isWalkable(nx, ny)) {
            neighbors.push({x: nx, y: ny, cost: 1 + dy * 0.3})
            break
          }
          if (isSolid(nx, ny)) break
        }
      } else {
        // Short drops from walkable neighbor
        for (let dy = 1; dy <= 6; dy++) {
          if (isWalkable(nx, cur.y + dy)) {
            neighbors.push({x: nx, y: cur.y + dy, cost: 1 + dy * 0.2})
          }
        }
      }
    }
    // Vertical: straight up/down (ladders, swimming)
    for (const dy of [-1, 1]) {
      if (isWalkable(cur.x, cur.y + dy)) {
        neighbors.push({x: cur.x, y: cur.y + dy, cost: 1.5})
      } else if (dy === -1 && inBounds(cur.x, cur.y + dy) && isMineable(cur.x, cur.y + dy)) {
        neighbors.push({x: cur.x, y: cur.y + dy, cost: MINE_COST})
      }
    }

    for (const n of neighbors) {
      const nk = key(n.x, n.y)
      if (closed.has(nk)) continue
      const tentG = curG + n.cost
      if (tentG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentG)
        cameFrom.set(nk, ck)
        heapPush({x: n.x, y: n.y, f: tentG + heuristic(n.x, n.y)})
      }
    }
  }
  return [] // no path found
}

// Construction-aware A*: like findPath but can "build" walkable cells at high cost.
// Returns { path, fills, clears } where fills/clears are cells that need construction.
function findPathWithConstruction(fromX: number, fromY: number, toX: number, toY: number): {
  path: {x: number, y: number}[], fills: {x: number, y: number}[], clears: {x: number, y: number}[]
} | null {
  const sx = Math.round(fromX), sy = Math.round(fromY)
  const tx = Math.round(toX), ty = Math.round(toY)
  if (sx === tx && sy === ty) return null

  // A cell is "buildable-walkable" if we could place a block below it to make it walkable
  function couldBeWalkable(x: number, y: number): boolean {
    if (!inBounds(x, y)) return false
    const c = getCell(x, y)
    if (c === WATER) return true
    if (isSolid(x, y)) return false // already solid, can't stand here
    // Already walkable normally?
    if (inBounds(x, y + 1) && isSolid(x, y + 1)) return true
    if (inBounds(x, y + 1) && getCell(x, y + 1) === WATER) return true
    // Could place a block at (x, y+1) to make this walkable
    if (inBounds(x, y + 1) && !isSolid(x, y + 1)) return true
    return false
  }

  function isCurrentlyWalkable(x: number, y: number): boolean {
    if (!inBounds(x, y)) return false
    const c = getCell(x, y)
    if (c === WATER) return true
    if (isSolid(x, y)) return false
    if (y + 1 >= H) return true
    if (isSolid(x, y + 1) || getCell(x, y + 1) === WATER) return true
    return false
  }

  // Could we stand here if we cleared the solid block?
  function couldClearToWalk(x: number, y: number): boolean {
    if (!inBounds(x, y)) return false
    const c = getCell(x, y)
    if (!isSolid(x, y) || c === WALL || c === WATER) return false
    // If we clear this cell, we need ground below
    if (inBounds(x, y + 1) && isSolid(x, y + 1)) return true
    return false
  }

  const BUILD_COST = 20 // expensive — only used when no normal path exists
  const CLEAR_COST = 15

  const key = (x: number, y: number) => y * W + x
  const heuristic = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty)

  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const buildFlags = new Set<number>() // cells where we'd need to place a fill block below
  const clearFlags = new Set<number>() // cells where we'd need to clear the block
  const closed = new Set<number>()
  const open: {x: number, y: number, f: number}[] = []

  const sk = key(sx, sy)
  gScore.set(sk, 0)
  open.push({x: sx, y: sy, f: heuristic(sx, sy)})

  const MAX_STEPS = 3000
  let steps = 0

  while (open.length > 0 && steps < MAX_STEPS) {
    steps++
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i
    }
    const cur = open[bestIdx]
    open.splice(bestIdx, 1)
    const ck = key(cur.x, cur.y)

    if (closed.has(ck)) continue
    closed.add(ck)

    if (Math.abs(cur.x - tx) <= 1 && Math.abs(cur.y - ty) <= 2) {
      // Reconstruct path and collect build/clear cells
      const path: {x: number, y: number}[] = []
      const fills: {x: number, y: number}[] = []
      const clears: {x: number, y: number}[] = []
      let k = ck
      while (cameFrom.has(k)) {
        const px = k % W, py = Math.floor(k / W)
        path.push({x: px, y: py})
        if (buildFlags.has(k)) fills.push({x: px, y: py + 1}) // fill the block BELOW to make walkable
        if (clearFlags.has(k)) clears.push({x: px, y: py})
        k = cameFrom.get(k)!
      }
      if (fills.length === 0 && clears.length === 0) return null // no construction needed, normal path should work
      path.reverse(); fills.reverse(); clears.reverse()
      // Thin path
      if (path.length <= 1) return { path, fills, clears }
      const thinned: {x: number, y: number}[] = [path[0]]
      for (let i = 1; i < path.length - 1; i++) {
        const dx1 = path[i].x - path[i-1].x, dy1 = path[i].y - path[i-1].y
        const dx2 = path[i+1].x - path[i].x, dy2 = path[i+1].y - path[i].y
        if (dx1 !== dx2 || dy1 !== dy2) thinned.push(path[i])
      }
      thinned.push(path[path.length - 1])
      return { path: thinned, fills, clears }
    }

    const curG = gScore.get(ck) ?? Infinity
    const neighbors: {x: number, y: number, cost: number, build?: boolean, clear?: boolean}[] = []

    for (const dx of [-1, 1]) {
      const nx = cur.x + dx
      // Normal moves
      if (isCurrentlyWalkable(nx, cur.y)) {
        neighbors.push({x: nx, y: cur.y, cost: 1})
      } else if (couldBeWalkable(nx, cur.y) && !isSolid(nx, cur.y)) {
        // Could build a platform here
        neighbors.push({x: nx, y: cur.y, cost: BUILD_COST, build: true})
      } else if (couldClearToWalk(nx, cur.y)) {
        neighbors.push({x: nx, y: cur.y, cost: CLEAR_COST, clear: true})
      }
      // Step up 1-4
      for (const dy of [-1, -2, -3, -4]) {
        const ny = cur.y + dy
        if (isCurrentlyWalkable(nx, ny)) {
          neighbors.push({x: nx, y: ny, cost: dy <= -3 ? 2.5 : 1.5})
        }
      }
      // Step down 1-3
      for (const dy of [1, 2, 3]) {
        if (isCurrentlyWalkable(nx, cur.y + dy)) {
          neighbors.push({x: nx, y: cur.y + dy, cost: 1 + dy * 0.2})
        }
      }
    }
    // Vertical
    for (const dy of [-1, 1]) {
      const ny = cur.y + dy
      if (isCurrentlyWalkable(cur.x, ny)) {
        neighbors.push({x: cur.x, y: ny, cost: 1.5})
      } else if (dy === -1 && couldBeWalkable(cur.x, ny) && !isSolid(cur.x, ny)) {
        // Build a ladder step upward
        neighbors.push({x: cur.x, y: ny, cost: BUILD_COST, build: true})
      }
    }

    for (const n of neighbors) {
      const nk = key(n.x, n.y)
      if (closed.has(nk)) continue
      const tentG = curG + n.cost
      if (tentG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentG)
        cameFrom.set(nk, ck)
        if (n.build) buildFlags.add(nk); else buildFlags.delete(nk)
        if (n.clear) clearFlags.add(nk); else clearFlags.delete(nk)
        open.push({x: n.x, y: n.y, f: tentG + heuristic(n.x, n.y)})
      }
    }
  }
  return null // truly unreachable even with construction
}

// Set target and trigger path recompute
function setTarget(g: Guy, x: number, y: number) {
  // Clamp targets away from edges so A* can reach them
  g.targetX = Math.max(2, Math.min(W - 3, Math.round(x)))
  g.targetY = Math.max(2, Math.min(H - 3, Math.round(y)))
  g.path = []; g.pathTimer = 0 // path will be computed on next walk tick
}

// --- Farming AI: task state machine ---
function updateGuyTask(g: Guy) {
  if (g.state === "fall" || g.state === "dead") return
  const ar = Math.round(getActionRadius(g))

  g.taskTimer++
  const hipX = g.px[N_HIP], hipY = g.py[N_HIP]
  // When swimming, feet dangle far below — use hip+3 instead so actions still work
  const footY = g.state === "swim" ? hipY + 3 : Math.max(g.py[N_LFOOT], g.py[N_RFOOT])

  // Walk toward target before executing action tasks — follow A* path
  if (ACTION_TASKS.includes(g.task)) {
    const dx = Math.abs(g.targetX - hipX), dy = Math.abs(g.targetY - hipY)
    const dist = dx + dy
    // Bail out if stuck too long trying to reach target
    if (g.taskTimer > 400 && dist > 3) {
      g.task = "decide"; g.taskTimer = 0; return
    }
    // Compute path if we don't have one, or recompute periodically
    g.pathTimer++
    if (dist > 3 && (g.path.length === 0 || g.pathTimer > 200)) {
      g.path = findPath(hipX, hipY, g.targetX, g.targetY)
      g.pathTimer = 0
      // If pathfinding failed, try construction or give up
      if (g.path.length === 0) {
        const constructionResult = findPathWithConstruction(hipX, hipY, g.targetX, g.targetY)
        if (constructionResult) {
          g.terraformFills.push(...constructionResult.fills)
          g.terraformClears.push(...constructionResult.clears)
        }
        g.task = "decide"; g.taskTimer = 0
        return
      }
    }
    // Follow path waypoints if we have them — even if manhattan dist is small
    if (g.path.length > 0) {
      // Skip waypoints we've reached or passed
      while (g.path.length > 0) {
        const wp = g.path[0]
        const dxWp = wp.x - hipX, dyWp = wp.y - hipY
        if (Math.abs(dxWp) < 3 && Math.abs(dyWp) < 4) {
          g.path.shift() // close enough
        } else if (g.path.length > 1) {
          // Check if we've passed this waypoint (next wp is closer)
          const nwp = g.path[1]
          const distCur = Math.abs(dxWp) + Math.abs(dyWp)
          const distNext = Math.abs(nwp.x - hipX) + Math.abs(nwp.y - hipY)
          if (distNext < distCur) { g.path.shift() } else { break }
        } else { break }
      }
      if (g.path.length > 0) {
        const nextWp = g.path[0]
        if (Math.abs(nextWp.x - hipX) > 1) {
          g.dir = nextWp.x > hipX ? 1 : -1
        }
        return
      }
    } else if (dist > 3) {
      // Have no path but target isn't adjacent — give up
      g.task = "decide"; g.taskTimer = 0
      return
    }
  }

  switch (g.task) {
    case "wander":
      // After wandering a bit, try to farm
      if (g.taskTimer > 60 + Math.random() * 80) {
        g.task = "decide"
        g.taskTimer = 0
      }
      break

    case "decide": {
      // --- Job evaluation: periodically reassess what job to focus on ---
      // Wanderers eval immediately on entering decide (they visit infrequently).
      // Farmers/builders only re-eval every 300 visits.
      g.jobTimer++
      const evalInterval = g.job === "wanderer" ? 0 : 300
      if (g.jobTimer > evalInterval) {
        g.jobTimer = 0
        const hasPlantableMud = !!scanForPlantableMud(hipX, hipY)
        const hasSeed = !!scanForCell(hipX, hipY, SEED)
        const hasInlandSand = !!scanForInlandSand(hipX, hipY)
        const hasWater = !!scanForCell(hipX, hipY, WATER)
        const hasFarmWork = hasPlantableMud ||
          ((hasSeed || hasInlandSand) && hasWater)
        const hasBuildWork = g.terraformFills.length > 0 || g.terraformClears.length > 0 || g.platX >= 0 || g.ladderX >= 0

        if (debugMode) console.log(`[eval] job=${g.job} farm=${hasFarmWork} build=${hasBuildWork}`)
        if (g.job === "farm" && !hasFarmWork) {
          g.job = hasBuildWork ? "build" : "wanderer"
        } else if (g.job === "build" && !hasBuildWork) {
          g.job = hasFarmWork ? "farm" : "wanderer"
        } else if (g.job === "wanderer") {
          if (hasFarmWork) g.job = "farm"
          else if (hasBuildWork) g.job = "build"
        }
      }

      // --- Deliver carried items first (highest priority) ---
      if (g.carrying === "water") {
        const nearestSeed = scanForCell(hipX, hipY, SEED)
        if (nearestSeed) {
          setTarget(g, nearestSeed.x, nearestSeed.y); g.task = "pour_water"; g.taskTimer = 0; break
        }
        // Pour on sand to make mud
        const sand = scanForInlandSand(hipX, hipY)
        if (sand) {
          setTarget(g, sand.x, sand.y); g.task = "pour_water"; g.taskTimer = 0; break
        }
        // Pour on any surface sand as last resort
        const anySand = scanForCell(hipX, hipY, SAND)
        if (anySand) {
          setTarget(g, anySand.x, anySand.y); g.task = "pour_water"; g.taskTimer = 0; break
        }
        g.carrying = null
      }
      if (g.carrying === "brick") {
        g.carrying = null
      }
      if (g.carrying === "stone") {
        if (g.terraformFills.length > 0) {
          const target = g.terraformFills[0]
          setTarget(g, target.x, target.y); g.task = "terraform"; g.taskTimer = 0; break
        }
        g.carrying = null
      }
      if (g.carrying === "sand") {
        if (g.terraformFills.length > 0) {
          const target = g.terraformFills[0]
          setTarget(g, target.x, target.y); g.task = "terraform"; g.taskTimer = 0; break
        }
        g.carrying = null
      }
      if (g.carrying === "mud") {
        g.carrying = null
      }
      if (g.carrying === "wood") {
        if (g.platX >= 0) {
          const platCell = nextPlatformCell(g)
          if (platCell) {
            setTarget(g, platCell.x, platCell.y); g.task = "build_platform"; g.taskTimer = 0; break
          }
        }
        if (g.ladderX >= 0) {
          const ladderCell = nextLadderCell(g)
          if (ladderCell) {
            setTarget(g, ladderCell.x, ladderCell.y); g.task = "build_ladder"; g.taskTimer = 0; break
          }
        }
        g.carrying = null
      }

      // --- Wanderer: just wander, job eval will reassign if work appears ---
      if (g.job === "wanderer" && !g.carrying) {
        g.task = "wander"; g.taskTimer = 0; break
      }

      // --- Score available work and pick highest priority ---
      const work: { score: number; name: string; run: () => void }[] = []

      // Farmer work items — plant seeds and water them everywhere
      if (g.job === "farm") {
        const mud = scanForPlantableMud(hipX, hipY)
        if (mud) work.push({ score: 80, name: "plant", run: () => {
          g.carrying = "seed"; g.placeX = mud.x; g.placeY = mud.y - 1; g.placeType = SEED
          setTarget(g, mud.x, mud.y); g.task = "place"; g.taskTimer = 0
        }})
        const seed = scanForCell(hipX, hipY, SEED)
        const farmSand = scanForInlandSand(hipX, hipY)
        // Fetch water if there's a seed to sprout OR sand to convert to mud
        if (seed || farmSand) {
          const water = scanForCell(hipX, hipY, WATER)
          if (water) work.push({ score: seed ? 70 : 60, name: seed ? "fetch-water" : "fetch-water-for-mud", run: () => {
            g.mineType = WATER
            setTarget(g, water.x, water.y); g.task = "mine"; g.taskTimer = 0
          }})
        }
      }

      // Builder work items (infrastructure: ladders, platforms, mining)
      if (g.job === "build" && !g.carrying) {
        // Terraform (highest builder priority)
        if (g.terraformClears.length > 0) {
          const target = g.terraformClears[0]
          work.push({ score: 110, name: "terraform-clear", run: () => {
            setTarget(g, target.x, target.y); g.task = "terraform"; g.taskTimer = 0
          }})
        }
        if (g.terraformFills.length > 0) {
          const stone = scanForCell(hipX, hipY, STONE, 200, true)
          const sand = scanForCell(hipX, hipY, SAND, 200, true)
          const stoneDist = stone ? Math.abs(stone.x - hipX) + Math.abs(stone.y - hipY) : Infinity
          const sandDist = sand ? Math.abs(sand.x - hipX) + Math.abs(sand.y - hipY) : Infinity
          if (stoneDist <= sandDist && stoneDist < Infinity) {
            work.push({ score: 105, name: "terraform-mine-stone", run: () => {
              g.mineType = STONE; setTarget(g, stone!.x, stone!.y); g.task = "mine"; g.taskTimer = 0
            }})
          } else if (sandDist < Infinity) {
            work.push({ score: 105, name: "terraform-mine-sand", run: () => {
              g.mineType = SAND; setTarget(g, sand!.x, sand!.y); g.task = "mine"; g.taskTimer = 0
            }})
          }
        }

        // Ladder/platform building — harvest wood for construction
        if (g.platX >= 0 || g.ladderX >= 0) {
          const wood = scanForBgCell(hipX, hipY, TREE)
          if (wood) work.push({ score: 90, name: "harvest-wood-build", run: () => {
            setTarget(g, wood.x, wood.y); g.task = "harvest_wood"; g.taskTimer = 0
          }})
        }
      }

      // Execute highest scored work item
      if (work.length > 0) {
        work.sort((a, b) => b.score - a.score)
        if (debugMode) console.log(`[decide] ${work.map(w => `${w.name}:${w.score}`).join(', ')}`)
        work[0].run()
        break
      }

      // Nothing actionable right now — switch job
      if (g.job === "farm") {
        g.job = "wanderer"; g.jobTimer = 0
      } else if (g.job === "build") {
        const plantable2 = !!scanForPlantableMud(hipX, hipY)
        const hasWater2 = !!scanForCell(hipX, hipY, WATER)
        const hasSand2 = !!scanForInlandSand(hipX, hipY)
        g.job = (plantable2 || (hasWater2 && hasSand2)) ? "farm" : "wanderer"
        g.jobTimer = 0
      }
      g.task = "wander"; g.taskTimer = 0
      break
    }


    case "mine": {
      // Generic mine: expanding ring search from guy's position for nearest mineType
      const cx = Math.round(hipX), cy = Math.round(hipY)
      let picked = false
      for (let r = 1; r <= ar && !picked; r++) {
        for (let dx = -r; dx <= r && !picked; dx++) {
          for (const dy of (Math.abs(dx) === r ? Array.from({length: 2 * r + 1}, (_, i) => i - r) : [-r, r])) {
            const mx = cx + dx, my = cy + dy
            if (!inBounds(mx, my)) continue
            const cell = grid[my * W + mx]
            const matches = cell === g.mineType || (g.mineType === MUD && cell === GRASS)
            if (!matches) continue
            setCell(mx, my, EMPTY)
            g.carrying = cellToCarry(cell)
            picked = true
          }
        }
      }
      if (!picked && (g.mineType === STONE || g.mineType === SAND)) {
        g.terraformFills = []
        g.terraformClears = []
      }
      g.task = "decide"; g.taskTimer = 0; break
    }

    case "place": {
      // Generic place: place carried item at placeX,placeY as placeType
      if (g.carrying && g.placeX >= 0 && g.placeY >= 0) {
        const px = g.placeX, py = g.placeY
        if (inBounds(px, py)) {
          const existing = getCell(px, py)
          if (existing !== EMPTY && existing !== g.placeType) {
            setCell(px, py, EMPTY)
          }
          if (getBg(px, py) !== EMPTY) {
            setBg(px, py, EMPTY)
          }
          setCell(px, py, g.placeType)
          g.carrying = null
        }
      }
      g.task = "decide"; g.taskTimer = 0; break
    }

case "pour_water": {
      // Place water near target — sprout seeds or convert sand to mud
      if (g.carrying === "water") {
        const cx = Math.round(hipX), cy = Math.round(footY)
        let used = false
        // Look for a seed to sprout within action radius
        for (let dy = -ar; dy <= ar && !used; dy++) {
          for (let dx = -ar; dx <= ar && !used; dx++) {
            const px = cx + dx, py = cy + dy
            if (inBounds(px, py) && grid[py * W + px] === SEED) {
              setCell(px, py, EMPTY)
              setBg(px, py, TREE)
              used = true
            }
          }
        }
        // Convert nearest sand to mud directly (like seed→tree)
        if (!used) {
          for (let r = 0; r <= ar && !used; r++) {
            for (let dy = -r; dy <= r && !used; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r && r > 0) continue
                const px = cx + dx, py = cy + dy
                if (inBounds(px, py) && grid[py * W + px] === SAND) {
                  setCell(px, py, MUD)
                  used = true; break
                }
              }
            }
          }
        }
        // Last resort: pour at feet
        if (!used) {
          const py = Math.round(footY) - 1
          if (inBounds(Math.round(hipX), py)) {
            if (grid[py * W + Math.round(hipX)] === EMPTY) setCell(Math.round(hipX), py, WATER)
          }
        }
        g.carrying = null
      }
      g.task = "decide"
      g.taskTimer = 0
      break
    }


    case "harvest_wood": {
      g.taskTimer++
      // Climb up for a bit before chopping — gives time to reach the top
      const onTree = isClimbable(hipX, hipY)
      const treeAbove = isClimbable(hipX, hipY - 1)
      if (onTree && treeAbove && g.taskTimer < 40) {
        break  // still climbing up, don't chop yet
      }
      // Find any tree cell within action radius, then flood-fill remove the whole trunk
      const cx = Math.round(hipX), cy = Math.round(hipY)
      let seedX = -1, seedY = -1
      for (let dy = -ar; dy <= ar && seedX < 0; dy++) {
        for (let dx = -ar; dx <= ar && seedX < 0; dx++) {
          if (inBounds(cx + dx, cy + dy) && bgGrid[(cy + dy) * W + (cx + dx)] === TREE) {
            seedX = cx + dx; seedY = cy + dy
          }
        }
      }
      if (seedX >= 0) {
        // Flood-fill remove all connected TREE cells
        const stack: [number, number][] = [[seedX, seedY]]
        while (stack.length > 0) {
          const [tx, ty] = stack.pop()!
          if (!inBounds(tx, ty) || bgGrid[ty * W + tx] !== TREE) continue
          setBg(tx, ty, EMPTY)
          stack.push([tx-1, ty], [tx+1, ty], [tx, ty-1], [tx, ty+1])
        }
        g.carrying = "wood"
      }
      g.task = "decide"; g.taskTimer = 0; break
    }


    case "build_platform": {
      // Place wood cells for a platform — one cell per visit, force-place
      if (g.carrying === "wood") {
        const cell = nextPlatformCell(g)
        if (cell) {
          if (getCell(cell.x, cell.y) !== EMPTY) setCell(cell.x, cell.y, EMPTY)
          setCell(cell.x, cell.y, WOOD)
          g.carrying = null
        } else {
          g.carrying = null // platform done
        }
      }
      g.task = "decide"; g.taskTimer = 0; break
    }

    case "terraform": {
      // Clear or fill one cell to flatten ground for building
      const cx = Math.round(hipX), cy = Math.round(hipY)
      // Skip terraform targets that are water cells themselves
      while (g.terraformClears.length > 0 && inBounds(g.terraformClears[0].x, g.terraformClears[0].y) && getCell(g.terraformClears[0].x, g.terraformClears[0].y) === WATER) g.terraformClears.shift()
      while (g.terraformFills.length > 0 && inBounds(g.terraformFills[0].x, g.terraformFills[0].y) && getCell(g.terraformFills[0].x, g.terraformFills[0].y) === WATER) g.terraformFills.shift()
      if (g.terraformClears.length > 0) {
        const target = g.terraformClears[0]
        if (Math.abs(target.x - cx) <= ar && Math.abs(target.y - cy) <= ar) {
          if (inBounds(target.x, target.y)) {
            if (getCell(target.x, target.y) !== EMPTY) setCell(target.x, target.y, EMPTY)
            if (getBg(target.x, target.y) !== EMPTY) setBg(target.x, target.y, EMPTY)
          }
          g.terraformClears.shift()
          g.task = "decide"; g.taskTimer = 0; break
        }
        // Not close enough — keep walking toward it
        setTarget(g, target.x, target.y); g.task = "terraform"; g.taskTimer = 0; break
      }
      if (g.terraformFills.length > 0 && (g.carrying === "stone" || g.carrying === "sand")) {
        const target = g.terraformFills[0]
        if (Math.abs(target.x - cx) <= ar && Math.abs(target.y - cy) <= ar) {
          if (inBounds(target.x, target.y)) {
            // Force-fill: clear any obstruction first
            if (getCell(target.x, target.y) !== EMPTY) setCell(target.x, target.y, EMPTY)
            setCell(target.x, target.y, g.carrying === "stone" ? STONE : SAND)
            g.carrying = null
          }
          g.terraformFills.shift()
          g.task = "decide"; g.taskTimer = 0; break
        }
        // Not close enough — keep walking toward it
        setTarget(g, target.x, target.y); g.task = "terraform"; g.taskTimer = 0; break
      }
      g.task = "decide"; g.taskTimer = 0; break
    }

    case "build_ladder": {
      // Place wood cells for a ladder — one cell per visit, force-place
      if (g.carrying === "wood") {
        const cell = nextLadderCell(g)
        if (cell) {
          if (getCell(cell.x, cell.y) !== EMPTY) setCell(cell.x, cell.y, EMPTY)
          setCell(cell.x, cell.y, WOOD)
          g.carrying = null
        } else {
          g.carrying = null // ladder done
        }
      }
      g.task = "decide"; g.taskTimer = 0; break
    }

    case "idle":
      if (g.taskTimer > 30 + Math.random() * 60) {
        g.task = "decide"
        g.taskTimer = 0
      }
      break
  }
}

function simulateGuys() {
  for (let i = guys.length - 1; i >= 0; i--) {
    const g = guys[i]

    if (g.state === "dead") {
      g.deadTimer++
      // Dead guys still fall with gravity via Verlet
      for (let n = 0; n < NUM_NODES; n++) {
        const vx = (g.px[n] - g.ox[n]) * 0.95
        const vy = (g.py[n] - g.oy[n]) * 0.95
        g.ox[n] = g.px[n]; g.oy[n] = g.py[n]
        g.px[n] += vx; g.py[n] += vy + GRAVITY_ACC
      }
      solveConstraints(g, false)
      if (g.deadTimer > 120) guys.splice(i, 1)
      continue
    }

    // Check fire on any node
    for (let n = 0; n < NUM_NODES; n++) {
      if (nodeHitsFire(g.px[n], g.py[n])) {
        g.state = "dead"; g.deadTimer = 0; break
      }
    }
    if (g.state === "dead") continue

    // Verlet integration: apply gravity & damping to all nodes
    for (let n = 0; n < NUM_NODES; n++) {
      let vx = (g.px[n] - g.ox[n]) * VERLET_DAMPING
      let vy = (g.py[n] - g.oy[n]) * VERLET_DAMPING

      // Cap velocity to prevent runaway acceleration
      const maxV = 0.8
      if (Math.abs(vx) > maxV) vx = Math.sign(vx) * maxV
      if (Math.abs(vy) > maxV) vy = Math.sign(vy) * maxV

      g.ox[n] = g.px[n]
      g.oy[n] = g.py[n]

      // Zero gravity in water / on climbable surfaces
      const climbTask = CLIMB_TASKS.includes(g.task)
      let gravMod = GRAVITY_ACC
      if (nodeInWater(g.px[n], g.py[n])) {
        gravMod = 0
      } else if (climbTask && isClimbable(g.px[n], g.py[n])) {
        gravMod = 0 // no gravity while on climbable surface
      }

      g.px[n] += vx
      g.py[n] += vy + gravMod
    }

    // Check if submerged — hip in water means swimming
    const hipInWater = nodeInWater(g.px[N_HIP], g.py[N_HIP])
    const bodyInWater = hipInWater || nodeInWater(g.px[N_NECK], g.py[N_NECK])

    if (bodyInWater) {
      g.state = "swim"
      g.walkTimer++

      const hipX = g.px[N_HIP], hipY = g.py[N_HIP]
      const swimTimer = g.walkTimer

      // Upright posture — head and neck straight above hip
      g.px[N_HEAD] += (hipX - g.px[N_HEAD]) * 0.15
      g.py[N_HEAD] += (hipY - 4.0 - g.py[N_HEAD]) * 0.15
      g.px[N_NECK] += (hipX - g.px[N_NECK]) * 0.15
      g.py[N_NECK] += (hipY - 2.5 - g.py[N_NECK]) * 0.12

      // Arms flail — frantic alternating splashing strokes
      const stroke = Math.sin(swimTimer * 0.5)
      const stroke2 = Math.sin(swimTimer * 0.5 + Math.PI)
      // Left arm — big sweeping flail
      g.px[N_LELBOW] += (hipX - 1.5 + stroke * 2.0 - g.px[N_LELBOW]) * 0.2
      g.py[N_LELBOW] += (hipY - 3.0 + stroke * 1.5 - g.py[N_LELBOW]) * 0.2
      g.px[N_LHAND] += (hipX - 2.0 + stroke * 3.0 - g.px[N_LHAND]) * 0.18
      g.py[N_LHAND] += (hipY - 3.5 + stroke * 2.5 - g.py[N_LHAND]) * 0.18
      // Right arm — opposite phase
      g.px[N_RELBOW] += (hipX + 1.5 + stroke2 * 2.0 - g.px[N_RELBOW]) * 0.2
      g.py[N_RELBOW] += (hipY - 3.0 + stroke2 * 1.5 - g.py[N_RELBOW]) * 0.2
      g.px[N_RHAND] += (hipX + 2.0 + stroke2 * 3.0 - g.px[N_RHAND]) * 0.18
      g.py[N_RHAND] += (hipY - 3.5 + stroke2 * 2.5 - g.py[N_RHAND]) * 0.18

      // Legs kick frantically — big alternating kicks
      const kick = Math.sin(swimTimer * 0.6)
      const kick2 = Math.sin(swimTimer * 0.6 + Math.PI)
      g.px[N_LKNEE] += (hipX - 0.5 + kick * 0.5 - g.px[N_LKNEE]) * 0.15
      g.py[N_LKNEE] += (hipY + 1.5 + kick * 1.5 - g.py[N_LKNEE]) * 0.15
      g.px[N_RKNEE] += (hipX + 0.5 + kick2 * 0.5 - g.px[N_RKNEE]) * 0.15
      g.py[N_RKNEE] += (hipY + 1.5 + kick2 * 1.5 - g.py[N_RKNEE]) * 0.15
      g.px[N_LFOOT] += (hipX - 0.8 + kick * 1.0 - g.px[N_LFOOT]) * 0.12
      g.py[N_LFOOT] += (hipY + 3.5 + kick * 2.0 - g.py[N_LFOOT]) * 0.12
      g.px[N_RFOOT] += (hipX + 0.8 + kick2 * 1.0 - g.px[N_RFOOT]) * 0.12
      g.py[N_RFOOT] += (hipY + 3.5 + kick2 * 2.0 - g.py[N_RFOOT]) * 0.12

      // Pull in facing direction
      g.px[N_HIP] += g.dir * 0.18

      // Run AI even while swimming (they might be heading somewhere)
      updateGuyTask(g)
      if (ACTION_TASKS.includes(g.task)) {
        const wp = g.path.length > 0 ? g.path[0] : {x: g.targetX, y: g.targetY}
        g.dir = wp.x > hipX ? 1 : wp.x < hipX ? -1 : g.dir
      } else if (g.task === "wander" && Math.random() < 0.01) {
        g.dir = (g.dir === 1 ? -1 : 1) as 1 | -1
      }

      // Solve constraints with posture off (swimming pose is different)
      solveConstraints(g, false)

      // Sync old positions for pose-driven limbs so they don't create phantom
      // velocity on the frame the guy leaves water (verlet velocity = px - ox).
      // Skip hip — it has intentional propulsion that should carry over.
      for (let n = 0; n < NUM_NODES; n++) { if (n !== N_HIP) { g.ox[n] = g.px[n]; g.oy[n] = g.py[n] } }

      // Bounds check
      if (g.px[N_HIP] < 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.max(1, g.px[n]) }; g.dir = 1 }
      if (g.px[N_HIP] > W - 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.min(W - 1, g.px[n]) }; g.dir = -1 }
      continue  // skip the ground-based logic below
    }

    // Check if body is on climbable surface (tree trunk / leaves on bg layer)
    const hipClimb = isClimbable(g.px[N_HIP], g.py[N_HIP])
    const feetClimb = isClimbable(g.px[N_LFOOT], g.py[N_LFOOT]) || isClimbable(g.px[N_RFOOT], g.py[N_RFOOT])
    const climbing = hipClimb || feetClimb

    // Only enter climbing mode when the guy is intentionally interacting with a tree:
    // actively harvesting wood/leaves, or navigating to do so
    const wantsToClimb = CLIMB_TASKS.includes(g.task)
    if (climbing && wantsToClimb) {
      g.state = "walk"
      g.walkTimer++

      const hipX = g.px[N_HIP], hipY = g.py[N_HIP]

      // Run AI
      updateGuyTask(g)

      // Move toward target — including upward
      if (CLIMB_TASKS.includes(g.task)) {
        g.px[N_HIP] += g.dir * 0.04

        // Climb up/down toward target Y (scan for target height)
        // When chopping, prefer going up; otherwise neutral
        const wantUp = g.task === "harvest_wood"
        if (wantUp) {
          // Move up through the tree
          if (isClimbable(hipX, hipY - 1)) {
            g.py[N_HIP] -= 0.06
          }
        }
      }

      // Climbing posture — body tight against trunk
      const climbTimer = g.walkTimer
      const climbCycle = Math.sin(climbTimer * 0.2)

      // Hands grip above head
      g.px[N_LHAND] += (hipX - 0.5 - g.px[N_LHAND]) * 0.15
      g.py[N_LHAND] += (hipY - 3.5 + climbCycle * 0.5 - g.py[N_LHAND]) * 0.15
      g.px[N_RHAND] += (hipX + 0.5 - g.px[N_RHAND]) * 0.15
      g.py[N_RHAND] += (hipY - 3.5 - climbCycle * 0.5 - g.py[N_RHAND]) * 0.15

      // Elbows out slightly
      g.px[N_LELBOW] += (hipX - 1.0 - g.px[N_LELBOW]) * 0.12
      g.py[N_LELBOW] += (hipY - 2.5 + climbCycle * 0.3 - g.py[N_LELBOW]) * 0.12
      g.px[N_RELBOW] += (hipX + 1.0 - g.px[N_RELBOW]) * 0.12
      g.py[N_RELBOW] += (hipY - 2.5 - climbCycle * 0.3 - g.py[N_RELBOW]) * 0.12

      // Legs alternating grip
      g.px[N_LFOOT] += (hipX - 0.3 - g.px[N_LFOOT]) * 0.1
      g.py[N_LFOOT] += (hipY + 2.5 + climbCycle * 0.8 - g.py[N_LFOOT]) * 0.1
      g.px[N_RFOOT] += (hipX + 0.3 - g.px[N_RFOOT]) * 0.1
      g.py[N_RFOOT] += (hipY + 2.5 - climbCycle * 0.8 - g.py[N_RFOOT]) * 0.1

      g.px[N_LKNEE] += (hipX - 0.8 - g.px[N_LKNEE]) * 0.1
      g.py[N_LKNEE] += (hipY + 1.0 + climbCycle * 0.4 - g.py[N_LKNEE]) * 0.1
      g.px[N_RKNEE] += (hipX + 0.8 - g.px[N_RKNEE]) * 0.1
      g.py[N_RKNEE] += (hipY + 1.0 - climbCycle * 0.4 - g.py[N_RKNEE]) * 0.1

      solveConstraints(g, false)

      // Sync old positions for pose-driven limbs so they don't create phantom
      // velocity on the frame the guy leaves the tree (verlet velocity = px - ox).
      // Skip hip — it has intentional propulsion that should carry over.
      for (let n = 0; n < NUM_NODES; n++) { if (n !== N_HIP) { g.ox[n] = g.px[n]; g.oy[n] = g.py[n] } }

      // Bounds check
      if (g.px[N_HIP] < 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.max(1, g.px[n]) }; g.dir = 1 }
      if (g.px[N_HIP] > W - 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.min(W - 1, g.px[n]) }; g.dir = -1 }
      continue  // skip ground-based logic
    }

    // Check if either foot is on ground
    const lFootGround = isSolid(Math.round(g.px[N_LFOOT]), Math.round(g.py[N_LFOOT]) + 1)
    const rFootGround = isSolid(Math.round(g.px[N_RFOOT]), Math.round(g.py[N_RFOOT]) + 1)
    const onGround = lFootGround || rFootGround

    if (onGround) {
      if (g.state === "fall") {
        g.state = "idle"
        g.walkTimer = 0
        g.stepTimer = 0
      }

      // Run the AI task system
      updateGuyTask(g)

      // Task system drives walk/idle state
      const isAction = ACTION_TASKS.includes(g.task)
      const isWalking = isAction && (Math.abs(g.targetX - g.px[N_HIP]) + Math.abs(g.targetY - g.py[N_HIP])) >= 2

      if (isWalking || g.task === "wander") {
        g.state = "walk"
      } else if (isAction || g.task === "idle" || g.task === "decide") {
        g.state = "idle"
      }

      // Walking behavior
      if (g.state === "walk" || g.state === "idle") {
        g.walkTimer++

        // Only randomly change direction when wandering
        if (g.task === "wander" && Math.random() < 0.006) {
          g.dir = (g.dir === 1 ? -1 : 1) as 1 | -1
        }

        // Random walk/idle transitions only when wandering
        if (g.task === "wander") {
          if (g.state === "idle" && g.walkTimer > 50 + Math.random() * 100) {
            g.state = "walk"; g.walkTimer = 0
          } else if (g.state === "walk" && g.walkTimer > 80 + Math.random() * 180) {
            if (Math.random() < 0.15) { g.state = "idle"; g.walkTimer = 0 }
          }
        }

        if (g.state === "walk") {
          g.stepTimer++
          const hipX = g.px[N_HIP]
          const hipY = g.py[N_HIP]

          // Determine stance and swing legs
          const stFoot = g.stepLeg === 0 ? N_LFOOT : N_RFOOT
          const stKnee = g.stepLeg === 0 ? N_LKNEE : N_RKNEE
          const swFoot = g.stepLeg === 0 ? N_RFOOT : N_LFOOT
          const swKnee = g.stepLeg === 0 ? N_RKNEE : N_LKNEE

          // Stance leg: plant foot firmly, push body upward and forward
          const stFootOnGround = isSolid(Math.round(g.px[stFoot]), Math.round(g.py[stFoot]) + 1)
          if (stFootOnGround) {
            // Plant stance foot — zero its velocity
            g.ox[stFoot] = g.px[stFoot]
            g.oy[stFoot] = g.py[stFoot]

            // Push hip UP — use midpoint of both feet for slope-aware height
            const feetMidY = (g.py[N_LFOOT] + g.py[N_RFOOT]) * 0.5
            const targetHipY = feetMidY - 4.0
            g.py[N_HIP] += (targetHipY - g.py[N_HIP]) * 0.4

            // Also center hip X between feet on slopes
            const feetMidX = (g.px[N_LFOOT] + g.px[N_RFOOT]) * 0.5
            g.px[N_HIP] += (feetMidX - g.px[N_HIP]) * 0.05

            // Straighten stance knee to support body
            const stKneeTargetX = (g.px[stFoot] + hipX) * 0.5
            const stKneeTargetY = (g.py[stFoot] + g.py[N_HIP]) * 0.5
            g.px[stKnee] += (stKneeTargetX - g.px[stKnee]) * 0.2
            g.py[stKnee] += (stKneeTargetY - g.py[stKnee]) * 0.2

            // Push body forward (gentle — velocity cap prevents runaway)
            g.px[N_HIP] += g.dir * 0.05
            g.px[N_NECK] += g.dir * 0.04
            g.px[N_HEAD] += g.dir * 0.03
          }

          // Horizontal friction on grounded feet to prevent sliding
          if (lFootGround) g.ox[N_LFOOT] += (g.px[N_LFOOT] - g.ox[N_LFOOT]) * 0.7
          if (rFootGround) g.ox[N_RFOOT] += (g.px[N_RFOOT] - g.ox[N_RFOOT]) * 0.7

          // Probe ground at swing foot target position
          const strideLen = 1.5
          const targetFootX = hipX + g.dir * strideLen
          const currentFootY = g.py[stFoot]
          const probeGroundY = findGround(targetFootX, hipY - 2)
          const stepProgress = Math.min(g.stepTimer / 15, 1.0)
          const liftArc = Math.sin(stepProgress * Math.PI) * 1.0

          // Limit step-up height per stride
          const maxStepUp = 2.5
          const clampedGroundY = Math.max(probeGroundY, currentFootY - maxStepUp)

          // Swing foot targets probed ground, with lift arc
          const targetFootY = clampedGroundY - liftArc
          g.px[swFoot] += (targetFootX - g.px[swFoot]) * 0.15
          g.py[swFoot] += (targetFootY - g.py[swFoot]) * 0.15

          // Swing knee: between hip and target foot
          const targetKneeX = (hipX + targetFootX) * 0.5
          const targetKneeY = (g.py[N_HIP] + targetFootY) * 0.5 - liftArc * 0.3
          g.px[swKnee] += (targetKneeX - g.px[swKnee]) * 0.12
          g.py[swKnee] += (targetKneeY - g.py[swKnee]) * 0.12

          // Switch legs when swing foot reaches ground or timer expires
          const swFootLanded = isSolid(Math.round(g.px[swFoot]), Math.round(g.py[swFoot]) + 1)
          if ((swFootLanded && g.stepTimer > 6) || g.stepTimer > 20) {
            g.stepLeg = g.stepLeg === 0 ? 1 : 0
            g.stepTimer = 0
          }

          // Wall/cliff detection — check ahead at hip height
          const ax = Math.round(hipX + g.dir * 3)
          const ay = Math.round(hipY)
          const wallAhead = isSolid(ax, ay) || isSolid(ax, ay - 2)
          const groundAhead = findGround(ax, ay, 16)
          const cliffAhead = groundAhead >= ay + 16
          // Too-tall step: ground ahead is more than 3 cells above current feet
          const tooTall = probeGroundY < currentFootY - 3
          // Avoid walking into fire
          const fireAhead = getCell(ax, ay) === FIRE || getCell(ax, ay - 1) === FIRE || getCell(ax, ay - 2) === FIRE

          // Jump! If there's a wall or tall step ahead (but not a cliff/fire),
          // and there's a landable surface up to 4 cells above, jump up to it
          if ((wallAhead || tooTall) && !cliffAhead && !fireAhead && stFootOnGround) {
            // Check if there's a reachable ledge above the wall (up to 6 cells up)
            const jumpX = Math.round(hipX + g.dir * 2)
            let ledgeY = -1
            for (let jy = Math.round(hipY) - 6; jy <= Math.round(hipY); jy++) {
              if (inBounds(jumpX, jy) && !isSolid(jumpX, jy) && inBounds(jumpX, jy + 1) && isSolid(jumpX, jy + 1)) {
                ledgeY = jy; break
              }
            }
            if (ledgeY >= 0) {
              // Apply upward impulse to all nodes — scale with jump height
              const jumpHeight = Math.round(hipY) - ledgeY
              const jumpForce = jumpHeight <= 4 ? -1.2 : -1.8
              for (let n = 0; n < NUM_NODES; n++) {
                g.oy[n] = g.py[n] - jumpForce  // verlet: set old pos below current = upward velocity
                g.ox[n] = g.px[n] - g.dir * 0.3 // slight forward push
              }
            } else {
              g.dir = (g.dir === 1 ? -1 : 1) as 1 | -1
            }
          } else if (cliffAhead || fireAhead) {
            g.dir = (g.dir === 1 ? -1 : 1) as 1 | -1
          }

          // Arms: subtle swing close to body, opposite to legs
          const armSwing = g.dir * (g.stepLeg === 0 ? 0.4 : -0.4)
          const neckY = g.py[N_NECK]
          g.px[N_LELBOW] += (hipX - 0.8 + armSwing - g.px[N_LELBOW]) * 0.1
          g.py[N_LELBOW] += (neckY + 1.2 - g.py[N_LELBOW]) * 0.1
          g.px[N_RELBOW] += (hipX + 0.8 - armSwing - g.px[N_RELBOW]) * 0.1
          g.py[N_RELBOW] += (neckY + 1.2 - g.py[N_RELBOW]) * 0.1
          g.px[N_LHAND] += (hipX - 0.6 + armSwing * 1.5 - g.px[N_LHAND]) * 0.08
          g.py[N_LHAND] += (neckY + 2.5 - g.py[N_LHAND]) * 0.08
          g.px[N_RHAND] += (hipX + 0.6 - armSwing * 1.5 - g.px[N_RHAND]) * 0.08
          g.py[N_RHAND] += (neckY + 2.5 - g.py[N_RHAND]) * 0.08
        }

        // Even when idle, keep body upright with feet apart
        if (g.state === "idle") {
          const lowestFoot = Math.max(g.py[N_LFOOT], g.py[N_RFOOT])
          const midFootX = (g.px[N_LFOOT] + g.px[N_RFOOT]) * 0.5

          // Hip should be directly above the midpoint of the feet
          const targetHipY = lowestFoot - 4.0
          g.py[N_HIP] += (targetHipY - g.py[N_HIP]) * 0.4
          g.px[N_HIP] += (midFootX - g.px[N_HIP]) * 0.15

          // Spread feet apart (target ~1.5 units each side of hip)
          const hipX2 = g.px[N_HIP]
          g.px[N_LFOOT] += (hipX2 - 0.7 - g.px[N_LFOOT]) * 0.05
          g.px[N_RFOOT] += (hipX2 + 0.7 - g.px[N_RFOOT]) * 0.05

          // Straighten both knees (midpoint between foot and hip)
          g.px[N_LKNEE] += ((g.px[N_LFOOT] + hipX2) * 0.5 - g.px[N_LKNEE]) * 0.2
          g.py[N_LKNEE] += ((g.py[N_LFOOT] + g.py[N_HIP]) * 0.5 - g.py[N_LKNEE]) * 0.2
          g.px[N_RKNEE] += ((g.px[N_RFOOT] + hipX2) * 0.5 - g.px[N_RKNEE]) * 0.2
          g.py[N_RKNEE] += ((g.py[N_RFOOT] + g.py[N_HIP]) * 0.5 - g.py[N_RKNEE]) * 0.2

          // Arms out to sides
          g.px[N_LELBOW] += (hipX2 - 2.0 - g.px[N_LELBOW]) * 0.08
          g.py[N_LELBOW] += (g.py[N_NECK] + 0.5 - g.py[N_LELBOW]) * 0.08
          g.px[N_RELBOW] += (hipX2 + 2.0 - g.px[N_RELBOW]) * 0.08
          g.py[N_RELBOW] += (g.py[N_NECK] + 0.5 - g.py[N_RELBOW]) * 0.08
          g.px[N_LHAND] += (hipX2 - 3.0 - g.px[N_LHAND]) * 0.06
          g.py[N_LHAND] += (g.py[N_NECK] + 1.5 - g.py[N_LHAND]) * 0.06
          g.px[N_RHAND] += (hipX2 + 3.0 - g.px[N_RHAND]) * 0.06
          g.py[N_RHAND] += (g.py[N_NECK] + 1.5 - g.py[N_RHAND]) * 0.06

          // Plant both feet and add friction
          if (lFootGround) { g.ox[N_LFOOT] = g.px[N_LFOOT]; g.oy[N_LFOOT] = g.py[N_LFOOT] }
          if (rFootGround) { g.ox[N_RFOOT] = g.px[N_RFOOT]; g.oy[N_RFOOT] = g.py[N_RFOOT] }
        }
      }
    } else {
      g.state = "fall"
    }

    // Solve springs + ground collision (posture when alive & not falling)
    solveConstraints(g, g.state === "walk" || g.state === "idle")

    // Bounds check on hip
    if (g.px[N_HIP] < 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.max(1, g.px[n]) }; g.dir = 1 }
    if (g.px[N_HIP] > W - 2) { for (let n = 0; n < NUM_NODES; n++) { g.px[n] = Math.min(W - 1, g.px[n]) }; g.dir = -1 }
    if (g.py[N_HIP] > H + 20) { guys.splice(i, 1); continue }
  }
}

// --- Pixel-based rendering helpers (no antialiasing) ---
const GUY_COLOR = rgba(74, 74, 74)
const GUY_DEAD_COLOR = rgba(139, 0, 0)

function drawPixel(screenX: number, screenY: number, color: number) {
  const x = Math.round(screenX)
  const y = Math.round(screenY)
  if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
    buf32[y * canvas.width + x] = color
  }
}

function drawPixelLine(x0: number, y0: number, x1: number, y1: number, color: number, thickness = 1) {
  const ix0 = Math.round(x0), iy0 = Math.round(y0)
  const ix1 = Math.round(x1), iy1 = Math.round(y1)
  const dx = Math.abs(ix1 - ix0), dy = Math.abs(iy1 - iy0)
  const sx = ix0 < ix1 ? 1 : -1, sy = iy0 < iy1 ? 1 : -1
  let err = dx - dy, cx = ix0, cy = iy0
  const half = Math.floor(thickness / 2)
  while (true) {
    for (let t = -half; t <= half; t++) {
      if (dx >= dy) drawPixel(cx, cy + t, color)
      else drawPixel(cx + t, cy, color)
    }
    if (cx === ix1 && cy === iy1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; cx += sx }
    if (e2 < dx) { err += dx; cy += sy }
  }
}

function drawPixelCircle(cx: number, cy: number, r: number, color: number) {
  const ir = Math.round(r)
  const icx = Math.round(cx), icy = Math.round(cy)
  let x = ir, y = 0, d = 1 - ir
  while (x >= y) {
    drawPixel(icx + x, icy + y, color); drawPixel(icx - x, icy + y, color)
    drawPixel(icx + x, icy - y, color); drawPixel(icx - x, icy - y, color)
    drawPixel(icx + y, icy + x, color); drawPixel(icx - y, icy + x, color)
    drawPixel(icx + y, icy - x, color); drawPixel(icx - y, icy - x, color)
    y++
    if (d < 0) d += 2 * y + 1
    else { x--; d += 2 * (y - x) + 1 }
  }
}

// Convert grid coords to screen pixels for a node
function nsx(g: Guy, n: number) { return Math.round(g.px[n] * CELL) }
function nsy(g: Guy, n: number) { return Math.round(g.py[n] * CELL) }

function renderGuys() {
  for (const g of guys) {
    const col = g.state === "dead" ? GUY_DEAD_COLOR : GUY_COLOR

    // Head (circle)
    drawPixelCircle(nsx(g, N_HEAD), nsy(g, N_HEAD), Math.round(1.2 * CELL), col)
    // Neck
    drawPixelLine(nsx(g, N_HEAD), nsy(g, N_HEAD) + Math.round(1.2 * CELL), nsx(g, N_NECK), nsy(g, N_NECK), col, 2)
    // Torso
    drawPixelLine(nsx(g, N_NECK), nsy(g, N_NECK), nsx(g, N_HIP), nsy(g, N_HIP), col, 2)
    // Left leg
    drawPixelLine(nsx(g, N_HIP), nsy(g, N_HIP), nsx(g, N_LKNEE), nsy(g, N_LKNEE), col, 2)
    drawPixelLine(nsx(g, N_LKNEE), nsy(g, N_LKNEE), nsx(g, N_LFOOT), nsy(g, N_LFOOT), col, 2)
    // Right leg
    drawPixelLine(nsx(g, N_HIP), nsy(g, N_HIP), nsx(g, N_RKNEE), nsy(g, N_RKNEE), col, 2)
    drawPixelLine(nsx(g, N_RKNEE), nsy(g, N_RKNEE), nsx(g, N_RFOOT), nsy(g, N_RFOOT), col, 2)
    // Arms — if carrying, draw arms reaching up to hold item (visual only, no physics)
    if (g.carrying && g.state !== "dead") {
      const hx = nsx(g, N_HEAD), hy = nsy(g, N_HEAD)
      const headR = Math.round(1.2 * CELL)
      const itemW = Math.round(CELL * 2.0)
      const itemH = Math.round(CELL * 2.0)
      const itemTop = hy - headR - itemH - 2
      const neckSX = nsx(g, N_NECK), neckSY = nsy(g, N_NECK)

      // Draw arms reaching up (purely visual — don't touch g.px/g.py)
      const lhx = hx - itemW, lhy = itemTop + itemH
      const rhx = hx + itemW, rhy = itemTop + itemH
      const lebx = hx - itemW, leby = hy - headR
      const rebx = hx + itemW, reby = hy - headR
      drawPixelLine(neckSX, neckSY, lebx, leby, col, 2)
      drawPixelLine(lebx, leby, lhx, lhy, col, 2)
      drawPixelLine(neckSX, neckSY, rebx, reby, col, 2)
      drawPixelLine(rebx, reby, rhx, rhy, col, 2)

      // Draw carried item
      const CARRY_COLORS: Record<string, number> = {
        water: WATER, brick: BRICK, wood: WOOD, stone: STONE,
        mud: MUD, sand: SAND, seed: SEED,
      }
      const cellType = CARRY_COLORS[g.carrying]
      if (cellType !== undefined) {
        if (g.carrying === "water") {
          const bucketColor = rgba(100, 80, 50)
          const waterColor = PIXELS[WATER][0]
          for (let dy = 0; dy <= itemH; dy++) {
            drawPixel(hx - itemW, itemTop + dy, bucketColor)
            drawPixel(hx + itemW, itemTop + dy, bucketColor)
          }
          for (let dx = -itemW; dx <= itemW; dx++) drawPixel(hx + dx, itemTop + itemH, bucketColor)
          for (let dy = 1; dy < itemH; dy++)
            for (let dx = -itemW + 1; dx < itemW; dx++) drawPixel(hx + dx, itemTop + dy, waterColor)
        } else if (g.carrying === "wood") {
          const woodColor = PIXELS[WOOD][0]
          for (let dx = -itemW - 1; dx <= itemW + 1; dx++)
            for (let dy = 0; dy <= Math.round(CELL * 1.0); dy++)
              drawPixel(hx + dx, itemTop + dy, woodColor)
        } else {
          const blockColor = PIXELS[cellType][0]
          for (let dy = 0; dy <= itemH; dy++)
            for (let dx = -itemW; dx <= itemW; dx++) drawPixel(hx + dx, itemTop + dy, blockColor)
        }
      }
    } else {
      // Normal arms (not carrying)
      drawPixelLine(nsx(g, N_NECK), nsy(g, N_NECK), nsx(g, N_LELBOW), nsy(g, N_LELBOW), col, 2)
      drawPixelLine(nsx(g, N_LELBOW), nsy(g, N_LELBOW), nsx(g, N_LHAND), nsy(g, N_LHAND), col, 2)
      drawPixelLine(nsx(g, N_NECK), nsy(g, N_NECK), nsx(g, N_RELBOW), nsy(g, N_RELBOW), col, 2)
      drawPixelLine(nsx(g, N_RELBOW), nsy(g, N_RELBOW), nsx(g, N_RHAND), nsy(g, N_RHAND), col, 2)
    }
  }
}

// --- Rendering (transparent background, only draw particles) ---
function render() {
  buf32.fill(TRANSPARENT)

  // Draw background layer first (trees, leaves — non-colliding)
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const bgCell = bgGrid[gy * W + gx]
      if (bgCell === EMPTY) continue
      const px = PIXELS[bgCell]
      if (!px) continue
      const pixel = px[(gx * 7 + gy * 13) % px.length]
      const startX = gx * CELL
      const startY = gy * CELL
      for (let py = 0; py < CELL; py++) {
        const sy = startY + py
        if (sy >= canvas.height) break
        for (let ppx = 0; ppx < CELL; ppx++) {
          const sx = startX + ppx
          if (sx >= canvas.width) break
          buf32[sy * canvas.width + sx] = pixel
        }
      }
    }
  }

  // Draw foreground layer (sand, water, fire, etc.)
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const cell = grid[gy * W + gx]
      if (cell === EMPTY) continue
      const px = PIXELS[cell]
      if (!px) continue
      const pixel = px[(gx * 7 + gy * 13) % px.length]

      const startX = gx * CELL
      const startY = gy * CELL
      for (let py = 0; py < CELL; py++) {
        const sy = startY + py
        if (sy >= canvas.height) break
        for (let ppx = 0; ppx < CELL; ppx++) {
          const sx = startX + ppx
          if (sx >= canvas.width) break
          buf32[sy * canvas.width + sx] = pixel
        }
      }
    }
  }

  renderGuys()
  ctx.putImageData(imgData, 0, 0)

  if (debugMode) {
    // FPS counter
    fpsFrames++
    const now = performance.now()
    if (now - fpsLast >= 1000) {
      fpsDisplay = Math.round(fpsFrames * 1000 / (now - fpsLast))
      fpsFrames = 0
      fpsLast = now
    }
    ctx.font = "bold 14px monospace"
    ctx.textAlign = "right"
    ctx.fillStyle = "#ff0000"
    ctx.fillText(fpsDisplay + " fps  " + frameMs.toFixed(1) + "ms", canvas.width - 8, 18)

    // Per-guy colors for debug visualization
    const GUY_DEBUG_COLORS = [
      [255, 50, 50],   // red
      [50, 180, 255],  // blue
      [50, 220, 50],   // green
      [255, 180, 0],   // orange
      [200, 50, 255],  // purple
      [255, 255, 50],  // yellow
      [0, 220, 200],   // teal
      [255, 100, 180], // pink
    ]

    // Action radius, path, and target visualization
    for (let gi = 0; gi < guys.length; gi++) {
      const g = guys[gi]
      if (g.state === "dead") continue
      const [cr, cg, cb] = GUY_DEBUG_COLORS[gi % GUY_DEBUG_COLORS.length]
      const rcx = g.px[N_HIP] * CELL, rcy = g.py[N_HIP] * CELL
      // Action radius circle
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(rcx, rcy, getActionRadius(g) * CELL, 0, Math.PI * 2)
      ctx.stroke()
      // Line from current position to target + crosshair
      if (ACTION_TASKS.includes(g.task)) {
        const tx = g.targetX * CELL, ty = g.targetY * CELL
        // Direct line to target
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.25)`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(rcx, rcy); ctx.lineTo(tx, ty)
        ctx.stroke()
        // Target crosshair
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(tx - 5, ty); ctx.lineTo(tx + 5, ty)
        ctx.moveTo(tx, ty - 5); ctx.lineTo(tx, ty + 5)
        ctx.stroke()
        // A* path line
        if (g.path.length > 0) {
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.6)`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(rcx, rcy)
          for (const wp of g.path) {
            ctx.lineTo(wp.x * CELL, wp.y * CELL)
          }
          ctx.lineTo(tx, ty)
          ctx.stroke()
          // Waypoint dots
          ctx.fillStyle = `rgba(${cr},${cg},${cb},0.8)`
          for (const wp of g.path) {
            ctx.fillRect(wp.x * CELL - 1, wp.y * CELL - 1, 3, 3)
          }
        }
      }
    }

    ctx.font = "9px monospace"
    ctx.textAlign = "center"
    for (let gi = 0; gi < guys.length; gi++) {
      const g = guys[gi]
      if (g.state === "dead") continue
      const [cr, cg, cb] = GUY_DEBUG_COLORS[gi % GUY_DEBUG_COLORS.length]
      const sx = g.px[N_HEAD] * CELL
      const sy = g.py[N_HEAD] * CELL - 6
      const lines = [
        "[" + g.job + "] " + g.task,
        g.state + " carry:" + (g.carrying || "none"),
      ]
      ctx.fillStyle = "rgba(0,0,0,0.5)"
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], sx + 1, sy - (lines.length - 1 - i) * 10 + 1)
      }
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], sx, sy - (lines.length - 1 - i) * 10)
      }
    }
  }
}

// --- Input handling ---
function isContentElement(el: HTMLElement): boolean {
  return !!el.closest(
    "article, .sidebar > *, a, button, input, .page-title, nav, .search-container, #particle-toolbar"
  )
}

function updateMousePos(e: MouseEvent | Touch) {
  mouse.prevX = mouse.x
  mouse.prevY = mouse.y
  mouse.x = e.clientX
  mouse.y = e.clientY
}

function setupInput() {
  document.addEventListener("mousedown", (e) => {
    mouse.down = true
    mouse.spawning = !isContentElement(e.target as HTMLElement)
    updateMousePos(e)
  })

  document.addEventListener("mousemove", (e) => {
    updateMousePos(e)
  })

  document.addEventListener("mouseup", () => {
    mouse.down = false
    mouse.spawning = false
    guySpawnedThisClick = false
  })

  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0]
    if (!t) return
    const target = e.target as HTMLElement
    mouse.down = true
    mouse.spawning = !isContentElement(target)
    updateMousePos(t)
    if (mouse.spawning) e.preventDefault()
  }, { passive: false })

  document.addEventListener("touchmove", (e) => {
    const t = e.touches[0]
    if (!t) return
    updateMousePos(t)
    if (mouse.spawning) e.preventDefault()
  }, { passive: false })

  document.addEventListener("touchend", () => {
    mouse.down = false
    mouse.spawning = false
    guySpawnedThisClick = false
  })

  window.addEventListener("resize", () => {
    resize()
  })
}

// --- Toolbar ---
function applyDotStyle(dot: HTMLButtonElement, type: number, css: string) {
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

function createToolbar() {
  if (toolbarEl) toolbarEl.remove()
  // Clean up any previous inline instructions
  const oldInline = document.getElementById("particle-instructions-content")
  if (oldInline) oldInline.remove()

  toolbarEl = document.createElement("div")
  toolbarEl.id = "particle-toolbar"

  // --- Material toggle button (used both inline and in toolbar) ---
  const toggleBtn = document.createElement("button")
  toggleBtn.className = "particle-toggle"
  const toggleDot = document.createElement("span")
  toggleDot.className = "particle-dot"
  const activeMat = MATERIALS.find((m) => m.type === material) || MATERIALS[0]
  applyDotStyle(toggleDot as unknown as HTMLButtonElement, activeMat.type, activeMat.css)
  const toggleLabel = document.createElement("span")
  toggleLabel.className = "particle-toggle-label"
  toggleLabel.textContent = activeMat.name
  const toggleArrow = document.createElement("span")
  toggleArrow.className = "particle-toggle-arrow"
  toggleArrow.textContent = "\u25BC"
  toggleBtn.appendChild(toggleDot)
  toggleBtn.appendChild(toggleLabel)
  toggleBtn.appendChild(toggleArrow)

  // --- Dropdown panel ---
  const dropdown = document.createElement("div")
  dropdown.className = "particle-dropdown"

  // Materials list
  const list = document.createElement("div")
  list.className = "particle-list"

  MATERIALS.forEach(({ type, name, css }) => {
    const pill = document.createElement("button")
    pill.className = "particle-pill" + (type === material ? " active" : "")
    pill.setAttribute("data-type", String(type))

    const swatch = document.createElement("span")
    swatch.className = "particle-swatch"
    applyDotStyle(swatch as unknown as HTMLButtonElement, type, css)

    const label = document.createElement("span")
    label.className = "particle-pill-label"
    label.textContent = name

    pill.addEventListener("click", (e) => {
      e.stopPropagation()
      material = type
      list.querySelectorAll(".particle-pill").forEach((d: Element) => d.classList.remove("active"))
      pill.classList.add("active")
      const mat = MATERIALS.find((m) => m.type === type)!
      toggleDot.className = "particle-dot"
      toggleDot.removeAttribute("style")
      applyDotStyle(toggleDot as unknown as HTMLButtonElement, mat.type, mat.css)
      toggleLabel.textContent = mat.name
      dropdown.classList.remove("open")
      toggleArrow.textContent = "\u25BC"
    })

    pill.appendChild(swatch)
    pill.appendChild(label)
    list.appendChild(pill)
  })

  dropdown.appendChild(list)

  // Divider
  const divider = document.createElement("div")
  divider.className = "particle-divider"
  dropdown.appendChild(divider)

  // Speed slider
  const speedRow = document.createElement("div")
  speedRow.className = "particle-speed"
  const speedLabel = document.createElement("span")
  speedLabel.className = "particle-speed-label"
  speedLabel.textContent = "1x"
  const speedSlider = document.createElement("input")
  speedSlider.type = "range"
  speedSlider.className = "particle-speed-slider"
  speedSlider.min = "-1"
  speedSlider.max = "1"
  speedSlider.step = "0.01"
  speedSlider.value = "0"
  speedSlider.addEventListener("input", (e) => {
    e.stopPropagation()
    const logVal = parseFloat(speedSlider.value)
    speedMultiplier = Math.pow(10, logVal)
    const display = speedMultiplier < 0.95 ? speedMultiplier.toFixed(1)
      : speedMultiplier < 1.05 ? "1"
      : speedMultiplier.toFixed(1)
    speedLabel.textContent = display + "x"
  })
  speedSlider.addEventListener("click", (e) => e.stopPropagation())
  speedRow.appendChild(speedSlider)
  speedRow.appendChild(speedLabel)
  dropdown.appendChild(speedRow)

  // Cursor size slider
  const sizeRow = document.createElement("div")
  sizeRow.className = "particle-speed"
  const sizeLabel = document.createElement("span")
  sizeLabel.className = "particle-speed-label"
  sizeLabel.textContent = "3"
  const sizeSlider = document.createElement("input")
  sizeSlider.type = "range"
  sizeSlider.className = "particle-speed-slider"
  sizeSlider.min = "1"
  sizeSlider.max = "15"
  sizeSlider.step = "1"
  sizeSlider.value = "3"
  sizeSlider.addEventListener("input", (e) => {
    e.stopPropagation()
    BRUSH_RADIUS = parseInt(sizeSlider.value)
    sizeLabel.textContent = String(BRUSH_RADIUS)
  })
  sizeSlider.addEventListener("click", (e) => e.stopPropagation())
  const sizeTitle = document.createElement("span")
  sizeTitle.className = "particle-speed-label"
  sizeTitle.textContent = "Size"
  sizeTitle.style.marginRight = "4px"
  sizeRow.appendChild(sizeTitle)
  sizeRow.appendChild(sizeSlider)
  sizeRow.appendChild(sizeLabel)
  dropdown.appendChild(sizeRow)

  // Second divider
  const divider2 = document.createElement("div")
  divider2.className = "particle-divider"
  dropdown.appendChild(divider2)

  // Action buttons row (regenerate always visible, dev-only tools hidden in production)
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"

  const actions = document.createElement("div")
  actions.className = "particle-actions"

  const regenBtn = document.createElement("button")
  regenBtn.className = "particle-btn"
  regenBtn.title = "Reset to original"
  regenBtn.textContent = "\u21BA"
  regenBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    try { localStorage.removeItem(localStorageKey()) } catch {}
    grid.fill(EMPTY)
    bgGrid.fill(EMPTY)
    guys.length = 0
    loadSceneFromDOM()
  })
  actions.appendChild(regenBtn)

  if (isDev) {
    const pauseBtn = document.createElement("button")
    pauseBtn.className = "particle-btn"
    pauseBtn.title = "Pause"
    pauseBtn.textContent = "\u23F8"
    pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      paused = !paused
      pauseBtn.textContent = paused ? "\u25B6" : "\u23F8"
    })
    actions.appendChild(pauseBtn)

    const saveBtn = document.createElement("button")
    saveBtn.className = "particle-btn"
    saveBtn.title = "Save scene to clipboard"
    saveBtn.textContent = "\uD83D\uDCBE"
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      saveScene()
    })
    actions.appendChild(saveBtn)

    const clearBtn = document.createElement("button")
    clearBtn.className = "particle-btn"
    clearBtn.title = "Clear"
    clearBtn.textContent = "\u2715"
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      grid.fill(EMPTY)
      bgGrid.fill(EMPTY)
      guys.length = 0
    })
    actions.appendChild(clearBtn)
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
    })
    debugRow.appendChild(debugCheck)
    debugRow.appendChild(document.createTextNode(" Debug"))
    dropdown.appendChild(debugRow)
  }

  // --- Inline instructions: inject into page content if placeholder exists ---
  const instructionsEl = document.getElementById("particle-instructions")
  if (instructionsEl) {
    const wrapper = document.createElement("span")
    wrapper.id = "particle-instructions-content"
    wrapper.className = "particle-instructions"

    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0
    const inputText = document.createElement("span")
    if (isTouch) {
      inputText.innerHTML = 'Tap and hold'
    } else {
      inputText.innerHTML = 'Hold <svg class="particle-mouse-icon" viewBox="0 0 16 22" width="14" height="19"><rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="1" x2="8" y2="9" stroke="currentColor" stroke-width="1"/><rect x="1" y="1" width="7" height="8" rx="4" fill="currentColor" opacity="0.25"/></svg>'
    }
    wrapper.appendChild(inputText)

    const addText = document.createElement("span")
    addText.textContent = " to add some "
    wrapper.appendChild(addText)

    // Inline toggle + dropdown wrapper
    const inlineToggleWrap = document.createElement("span")
    inlineToggleWrap.className = "particle-inline-toggle-wrap"
    inlineToggleWrap.appendChild(toggleBtn)
    inlineToggleWrap.appendChild(dropdown)
    wrapper.appendChild(inlineToggleWrap)

    instructionsEl.appendChild(wrapper)

    // The toolbar itself just holds nothing visible (dropdown is inline)
    toolbarEl.style.display = "none"
  } else {
    // Fallback: fixed toolbar (non-index pages, shouldn't happen but just in case)
    toolbarEl.appendChild(toggleBtn)
    toolbarEl.appendChild(dropdown)
  }

  // Toggle dropdown open/close
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    const isOpen = dropdown.classList.toggle("open")
    toggleArrow.textContent = isOpen ? "\u25B2" : "\u25BC"
  })

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    dropdown.classList.remove("open")
    toggleArrow.textContent = "\u25BC"
  })

  toolbarEl.addEventListener("click", (e: Event) => {
    e.stopPropagation()
  })

  document.body.appendChild(toolbarEl)
}

// --- Animation loop ---
const BASE_SIM_RATE = 0.7    // particles run at 70% speed (30% slower)
const BASE_GUY_RATE = 0.4    // guys run at 40% speed (60% slower)
let speedMultiplier = 1.0
let simAccum = 0
let guyAccum = 0
let fpsFrames = 0
let fpsLast = performance.now()
let fpsDisplay = 0
let frameMs = 0

let lastFrameTime = performance.now()

function loop() {
  const now = performance.now()
  const dt = Math.min(now - lastFrameTime, 100) / (1000 / 60) // normalize to 60fps frame units, cap at 100ms
  lastFrameTime = now

  spawnFromMouse()
  if (!paused) {
    simAccum += BASE_SIM_RATE * speedMultiplier * dt
    guyAccum += BASE_GUY_RATE * speedMultiplier * dt
    // Cap ticks per frame to avoid freezing at extreme speeds
    let simTicks = 0
    while (simAccum >= 1 && simTicks < 12) {
      simAccum -= 1
      simulate()
      simTicks++
    }
    if (simAccum > 1) simAccum = 0  // drop excess if capped
    let guyTicks = 0
    while (guyAccum >= 1 && guyTicks < 12) {
      guyAccum -= 1
      simulateGuys()
      guyTicks++
    }
    if (guyAccum > 1) guyAccum = 0
  }
  const t0 = debugMode ? performance.now() : 0
  render()
  if (debugMode) frameMs = performance.now() - t0
  raf = requestAnimationFrame(loop)
}

// --- Lifecycle ---
let particlesActive = false

function teardown() {
  if (!particlesActive) return
  particlesActive = false
  if (raf) { cancelAnimationFrame(raf); raf = 0 }
  if (persistTimer) { clearInterval(persistTimer); persistTimer = 0 }
  persistToLocalStorage()
  canvas?.remove()
  canvas = null as any
  toolbarEl?.remove()
  toolbarEl = null as any
  // Clean up inline instructions
  const inlineContent = document.getElementById("particle-instructions-content")
  if (inlineContent) inlineContent.remove()
}

function startup() {
  const mount = document.getElementById("particle-mount")
  const isIndex = mount?.getAttribute("data-is-index") === "true"
  if (!isIndex) {
    teardown()
    return
  }
  if (particlesActive) return // already running
  particlesActive = true
  init()
}

startup()

// SPA navigation: check if we should start/stop particles
document.addEventListener("nav", () => {
  startup()
})

window.addCleanup?.(() => {
  teardown()
})

// --- Expose internals for headless simulation ---
;(window as any).__sim = {
  simulate, simulateGuys, loadScene, serializeScene,
  get grid() { return grid }, get bgGrid() { return bgGrid },
  get guys() { return guys }, get W() { return W }, get H() { return H },
  stop() { if (raf) { cancelAnimationFrame(raf); raf = 0 } },
  set debug(v: boolean) { debugMode = v },
  EMPTY, SAND, WATER, FIRE, WALL, WOOD, SMOKE, GUY, MUD, SEED, LEAF, BRICK, DOOR, STONE, TREE, KILN_FIRE, GRASS, KILN_STONE,
}
