import { readFileSync } from "fs"

// Load scene
const raw = readFileSync("badstate.json", "utf8")
const scene = JSON.parse("{" + raw + "}").index

const EMPTY = 0, SAND = 1, WATER = 2, FIRE = 3, WALL = 4, WOOD = 5, SMOKE = 6, GUY = 7, MUD = 8, SEED = 9, LEAF = 10, BRICK = 11, DOOR = 12, STONE = 13, TREE = 14

const W = scene.w, H = scene.h
const grid = new Uint8Array(W * H)
const bgGrid = new Uint8Array(W * H)

// Load particles
for (const [x, y, type] of scene.p) {
  if (x >= 0 && x < W && y >= 0 && y < H) {
    grid[y * W + x] = type
  }
}
if (scene.bg) {
  for (const [x, y, type] of scene.bg) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      bgGrid[y * W + x] = type
    }
  }
}

// Analyze each guy's surroundings
for (let gi = 0; gi < scene.g.length; gi++) {
  const g = scene.g[gi]
  console.log(`\n=== Guy ${gi} at (${g.x}, ${g.y}) dir=${g.dir} ===`)

  // Check what's near the guy
  const radius = 10
  let waterCount = 0, sandCount = 0, mudCount = 0, seedCount = 0, stoneCount = 0
  let treeCount = 0, leafCount = 0, brickCount = 0
  let inlandSandCount = 0

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = g.x + dx, ny = g.y + dy
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
      const cell = grid[ny * W + nx]
      const bg = bgGrid[ny * W + nx]
      if (cell === WATER) waterCount++
      if (cell === SAND) {
        sandCount++
        // Check if inland (no water neighbor)
        let nearWater = false
        for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const wx = nx+fx, wy = ny+fy
          if (wx >= 0 && wx < W && wy >= 0 && wy < H && grid[wy * W + wx] === WATER) nearWater = true
        }
        if (!nearWater) inlandSandCount++
      }
      if (cell === MUD) mudCount++
      if (cell === SEED) seedCount++
      if (cell === STONE) stoneCount++
      if (cell === BRICK) brickCount++
      if (bg === TREE) treeCount++
      if (bg === LEAF) leafCount++
    }
  }

  console.log(`  Nearby (r=${radius}): water=${waterCount} sand=${sandCount} inlandSand=${inlandSandCount} mud=${mudCount} seed=${seedCount} stone=${stoneCount} brick=${brickCount}`)
  console.log(`  BG: tree=${treeCount} leaf=${leafCount}`)

  // Check what scanForInlandSand would find with larger radius
  let foundInlandSand = null
  for (let r = 3; r <= 200; r++) {
    for (let ddx = -r; ddx <= r; ddx++) {
      for (const ddy of (Math.abs(ddx) === r ? Array.from({length: 2*r+1}, (_, i) => i - r) : [-r, r])) {
        const nx = g.x + ddx, ny = g.y + ddy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || grid[ny * W + nx] !== SAND) continue
        let nearWater = false
        for (const [fx, fy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const wx = nx+fx, wy = ny+fy
          if (wx >= 0 && wx < W && wy >= 0 && wy < H && grid[wy * W + wx] === WATER) nearWater = true
        }
        if (!nearWater) {
          foundInlandSand = { x: nx, y: ny, dist: r }
          r = 999 // break outer
          break
        }
      }
      if (foundInlandSand) break
    }
  }
  console.log(`  scanForInlandSand would find:`, foundInlandSand)

  // Check for seeds near farmX (simulated — use guy X as farmX)
  let foundSeed = null
  for (let r = 1; r <= 8; r++) {
    for (let ddx = -r; ddx <= r; ddx++) {
      for (const ddy of (Math.abs(ddx) === r ? Array.from({length: 2*r+1}, (_, i) => i - r) : [-r, r])) {
        const nx = g.x + ddx, ny = g.y + ddy
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx] === SEED) {
          foundSeed = { x: nx, y: ny }
          r = 999
          break
        }
      }
      if (foundSeed) break
    }
  }
  console.log(`  Seeds near guy:`, foundSeed)

  // Check plantable mud
  let plantableMud = null
  for (let r = 1; r <= 30; r++) {
    for (let ddx = -r; ddx <= r; ddx++) {
      for (const ddy of (Math.abs(ddx) === r ? Array.from({length: 2*r+1}, (_, i) => i - r) : [-r, r])) {
        const mx = g.x + ddx, my = g.y + ddy
        if (mx < 0 || mx >= W || my < 0 || my >= H) continue
        if (grid[my * W + mx] !== MUD) continue
        // Check plantable
        if (my - 1 < 0 || grid[(my-1) * W + mx] !== EMPTY) continue
        let tooClose = false
        for (let sy = -3; sy <= 3 && !tooClose; sy++) {
          for (let sx = -3; sx <= 3 && !tooClose; sx++) {
            if (sx === 0 && sy === 0) continue
            const nx = mx + sx, ny = (my-1) + sy
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
              if (grid[ny * W + nx] === SEED) tooClose = true
              if (bgGrid[ny * W + nx] === TREE || bgGrid[ny * W + nx] === LEAF) tooClose = true
            }
          }
        }
        if (!tooClose) {
          plantableMud = { x: mx, y: my }
          r = 999
          break
        }
      }
      if (plantableMud) break
    }
  }
  console.log(`  Plantable mud:`, plantableMud)

  // What would the farmer do?
  const hasSeed = !!foundSeed
  const hasSand = !!foundInlandSand
  console.log(`  Farmer would fetch water: hasSeed=${hasSeed} hasSand=${hasSand} → ${hasSeed || hasSand}`)

  // If carrying water, what would happen?
  console.log(`  If carrying water: seed=${!!foundSeed}, inlandSand=${!!foundInlandSand}`)
  if (!foundSeed && !foundInlandSand) {
    console.log(`  → Would DROP water (good!)`)
  } else if (foundSeed) {
    console.log(`  → Would pour on seed at (${foundSeed.x}, ${foundSeed.y})`)
  } else {
    console.log(`  → Would pour on sand at (${foundInlandSand.x}, ${foundInlandSand.y})`)
  }
}

// Global stats
let totalWater = 0, totalSand = 0, totalMud = 0, totalSeed = 0, totalTree = 0, totalLeaf = 0
for (let i = 0; i < W * H; i++) {
  if (grid[i] === WATER) totalWater++
  if (grid[i] === SAND) totalSand++
  if (grid[i] === MUD) totalMud++
  if (grid[i] === SEED) totalSeed++
  if (bgGrid[i] === TREE) totalTree++
  if (bgGrid[i] === LEAF) totalLeaf++
}
console.log(`\n=== Global stats ===`)
console.log(`Water: ${totalWater}, Sand: ${totalSand}, Mud: ${totalMud}, Seed: ${totalSeed}`)
console.log(`Trees: ${totalTree}, Leaves: ${totalLeaf}`)
