import test, { describe } from "node:test"
import assert from "node:assert"
import { createWorld, restoreWorld, saveWorld, step, checksum, World } from "./particles/sim"
import { SAND, WATER, TEXT, EMPTY, SOLID, BUILT, BUILT_BG } from "./particles/cells"

// A desktop-ish landing page: a column of text near the top
const W = 300,
  H = 200
const TEXT_RECTS = [
  [70, 24, 230, 30],
  [70, 36, 230, 48],
  [70, 54, 160, 60],
  [80, 66, 200, 82],
  [70, 88, 130, 94],
]

function run(seed: number, ticks: number): World {
  const w = createWorld(W, H, seed, TEXT_RECTS)
  for (let i = 0; i < ticks; i++) step(w)
  return w
}

function nearText(w: World, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx,
        yy = y + dy
      if (w.inBounds(xx, yy) && w.grid[yy * w.W + xx] === TEXT) return true
    }
  }
  return false
}

describe("particle world", () => {
  test("same seed, same world", () => {
    const a = run(11, 3000),
      b = run(11, 3000)
    assert.strictEqual(checksum(a), checksum(b))
    const c = run(12, 3000)
    assert.notStrictEqual(checksum(a), checksum(c))
  })

  test("terrain stays clear of the text and fills the bottom", () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = createWorld(W, H, seed, TEXT_RECTS)
      let ground = 0
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = w.grid[y * W + x]
          if (c === TEXT || c === EMPTY || c === WATER) continue
          if (SOLID[c])
            assert.ok(!nearText(w, x, y, 3), `seed ${seed}: terrain at ${x},${y} touches text`)
          if (y > H * 0.8) ground++
        }
      }
      assert.ok(ground > W * H * 0.2 * 0.5, `seed ${seed}: not much ground`)
    }
  })

  test("sand only appears near water", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = createWorld(W, H, seed, TEXT_RECTS)
      let sand = 0,
        dry = 0
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (w.grid[y * W + x] !== SAND) continue
          sand++
          let wet = false
          for (let dy = -7; dy <= 7 && !wet; dy++) {
            for (let dx = -7; dx <= 7; dx++) if (w.get(x + dx, y + dy) === WATER) wet = true
          }
          if (!wet) dry++
        }
      }
      // a few grains can tumble a little way from the shore while settling
      assert.ok(
        dry <= sand * 0.05 + 5,
        `seed ${seed}: ${dry} of ${sand} sand cells are nowhere near water`,
      )
    }
  })

  test("the colony builds, and never against the text", () => {
    const w = run(5, 25000)
    const c = w.colony
    assert.ok(c.stats.placed > 400, `only placed ${c.stats.placed} blocks`)
    assert.ok(
      c.towers.some((t) => t.complete),
      "no tower finished",
    )
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x
        if (BUILT[w.grid[k]] || BUILT_BG[w.bg[k]])
          assert.ok(!nearText(w, x, y, 2), `structure at ${x},${y} touches text`)
      }
    }
  })

  test("saving and loading keeps the world", () => {
    const w = run(9, 4000)
    const saved = JSON.parse(JSON.stringify(saveWorld(w)))
    const r = restoreWorld(saved, TEXT_RECTS)!
    assert.ok(r)
    assert.strictEqual(r.tick, w.tick)
    assert.deepStrictEqual(Array.from(r.grid), Array.from(w.grid))
    assert.deepStrictEqual(Array.from(r.bg), Array.from(w.bg))
    assert.strictEqual(r.guys.length, w.guys.filter((g) => g.mode !== "dead").length)
    for (let i = 0; i < 2000; i++) step(r)
  })
})
