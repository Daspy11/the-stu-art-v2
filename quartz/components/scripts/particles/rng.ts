// Seeded randomness for the particle world. Everything in the simulation draws from
// these so a given seed, screen size and text layout always plays out the same way.

// mulberry32: tiny, fast, good enough for games
export class Rng {
  s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(n: number): number {
    return Math.floor(this.next() * n)
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
}

// Stateless integer hash → [0, 1). Used for per-cell texture and shape jitter.
export function hash2(x: number, y: number, seed = 0): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) |
    0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// 2D gradient (Perlin) noise with a seeded permutation table. Output roughly in [-1, 1].
export class Noise {
  private perm = new Uint8Array(512)
  private gx = new Float32Array(256)
  private gy = new Float32Array(256)
  constructor(seed: number) {
    const rng = new Rng(seed ^ 0x9e3779b9)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = rng.int(i + 1)
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * Math.PI * 2
      this.gx[i] = Math.cos(a)
      this.gy[i] = Math.sin(a)
    }
  }
  n2(x: number, y: number): number {
    const xi = Math.floor(x),
      yi = Math.floor(y)
    const xf = x - xi,
      yf = y - yi
    const X = xi & 255,
      Y = yi & 255
    const p = this.perm
    const g00 = p[X + p[Y]],
      g10 = p[X + 1 + p[Y]]
    const g01 = p[X + p[Y + 1]],
      g11 = p[X + 1 + p[Y + 1]]
    const d00 = this.gx[g00] * xf + this.gy[g00] * yf
    const d10 = this.gx[g10] * (xf - 1) + this.gy[g10] * yf
    const d01 = this.gx[g01] * xf + this.gy[g01] * (yf - 1)
    const d11 = this.gx[g11] * (xf - 1) + this.gy[g11] * (yf - 1)
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    const a = d00 + u * (d10 - d00)
    const b = d01 + u * (d11 - d01)
    return (a + v * (b - a)) * 1.414
  }
  n1(x: number): number {
    return this.n2(x, 17.31)
  }
  fbm1(x: number, octaves = 4): number {
    let sum = 0,
      amp = 1,
      norm = 0,
      f = 1
    for (let i = 0; i < octaves; i++) {
      sum += this.n2(x * f, i * 31.7) * amp
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
  fbm2(x: number, y: number, octaves = 3): number {
    let sum = 0,
      amp = 1,
      norm = 0,
      f = 1
    for (let i = 0; i < octaves; i++) {
      sum += this.n2(x * f + i * 19.1, y * f - i * 7.3) * amp
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
}
