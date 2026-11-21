// Small living things: chimney smoke, wheeling pigeons, slate-dust motes,
// rain, sifting dust, and drifting cloud layers.

import { R } from "./art.js"

const rand = (a, b) => a + Math.random() * (b - a)

export class Smoke {
  constructor(scene, x, y, depth, o = {}) {
    this.scene = scene
    this.x = x
    this.y = y
    this.depth = depth
    this.t = Math.random()
    this.rate = o.rate ?? 0.75
    this.scale = o.scale ?? 1
    this.on = true
  }
  update(dt, wind = 1) {
    if (!this.on) return
    this.t -= dt
    if (this.t > 0) return
    this.t = this.rate * rand(0.8, 1.25)
    const s = this.scene
    const img = s.add.image(this.x + rand(-1, 1), this.y, Math.random() < 0.5 ? "puff" : "puffShade")
    img.setDepth(this.depth).setAlpha(0).setScale((0.22 * this.scale) / R)
    const life = rand(4200, 5600)
    s.tweens.add({ targets: img, alpha: { from: 0.0, to: 0.85 }, duration: 500, ease: "Sine.easeOut" })
    s.tweens.add({
      targets: img,
      x: this.x + rand(26, 46) * wind,
      y: this.y - rand(44, 64),
      scale: (rand(0.9, 1.25) * this.scale) / R,
      duration: life,
      ease: "Sine.easeOut",
    })
    s.tweens.add({ targets: img, alpha: 0, delay: life * 0.45, duration: life * 0.55, ease: "Sine.easeIn", onComplete: () => img.destroy() })
  }
}

export class Flock {
  constructor(scene, cx, cy, n, o = {}) {
    this.scene = scene
    this.cx = cx
    this.cy = cy
    this.rx = o.rx ?? 120
    this.ry = o.ry ?? 40
    this.depth = o.depth ?? 5000
    this.speed = o.speed ?? 0.55
    this.birds = []
    for (let k = 0; k < n; k++) {
      const img = scene.add.image(0, 0, "bird1").setScale(0.75 / R).setDepth(this.depth)
      if (o.scrollFactor !== undefined) img.setScrollFactor(o.scrollFactor)
      this.birds.push({ img, a: (k / n) * Math.PI * 2 + rand(-0.3, 0.3), r: rand(0.75, 1.15), f: Math.random() * 3, h: rand(-12, 12), sp: rand(0.85, 1.15) })
    }
    this.t = 0
  }
  update(dt) {
    this.t += dt
    for (const b of this.birds) {
      b.a += dt * this.speed * b.sp
      b.f += dt * 9
      const x = this.cx + Math.cos(b.a) * this.rx * b.r
      const y = this.cy + Math.sin(b.a) * this.ry * b.r + b.h + Math.sin(this.t * 0.7 + b.r * 5) * 8
      b.img.setPosition(x, y)
      const glide = Math.sin(b.a * 2 + b.r) > 0.3
      const fr = glide ? 3 : (Math.floor(b.f) % 3) + 1
      b.img.setTexture(`bird${fr}`)
      // nearer birds (lower on the ellipse) are a touch larger
      const near = (Math.sin(b.a) + 1) / 2
      b.img.setScale((0.6 + near * 0.35) / R)
    }
  }
  setAlpha(a) {
    for (const b of this.birds) b.img.setAlpha(a)
  }
  destroy() {
    for (const b of this.birds) b.img.destroy()
  }
}

// slate-dust lifting off a kept thing while it is minded
export function emitMote(scene, x, y, depth) {
  const img = scene.add.image(x + rand(-14, 14), y + rand(-3, 3), "mote-dust")
  img.setDepth(depth).setScale(rand(0.6, 1.2) / R).setAlpha(0)
  const life = rand(1100, 1700)
  scene.tweens.add({ targets: img, alpha: 0.9, duration: 260 })
  scene.tweens.add({ targets: img, y: img.y - rand(18, 34), x: img.x + rand(-5, 5), angle: rand(-90, 90), duration: life, ease: "Sine.easeOut" })
  scene.tweens.add({ targets: img, alpha: 0, delay: life * 0.5, duration: life * 0.5, onComplete: () => img.destroy() })
}

// fine straight sparse rain in screen space
export class Rain {
  constructor(scene, depth = 8000) {
    this.scene = scene
    this.drops = []
    this.on = false
    this.density = 0
    this.depth = depth
    this.splashT = 0
  }
  start() {
    this.on = true
  }
  update(dt, cam) {
    if (this.on) this.density = Math.min(1, this.density + dt * 0.12)
    const want = Math.floor(this.density * 70)
    while (this.drops.length < want) {
      const img = this.scene.add.image(0, 0, "drop").setScrollFactor(0).setDepth(this.depth).setScale(1 / R)
      img.setAlpha(rand(0.35, 0.7))
      this.drops.push({ img, x: rand(0, 960), y: rand(-540, 0), v: rand(520, 680) })
    }
    const z = cam.zoom / R
    for (const d of this.drops) {
      d.y += d.v * dt
      if (d.y > 560) {
        d.y = rand(-40, -10)
        d.x = rand(0, 960)
      }
      // scrollFactor 0 objects are still zoomed around the camera origin (0,0)
      d.img.setPosition(d.x / z, d.y / z)
    }
  }
  destroy() {
    for (const d of this.drops) d.img.destroy()
    this.drops = []
  }
}

// a parallax cloud
export class CloudLayer {
  constructor(scene, items, sf, depth, o = {}) {
    this.items = items.map(([key, x, y, s = 1, a = 1]) => {
      const info = scene.registry.get(key)
      const img = scene.add.image(x, y, key).setScale(s / R).setDepth(depth).setScrollFactor(o.sfx ?? sf, sf).setAlpha(a)
      img.setOrigin(-info.ox / info.w, -info.oy / info.h)
      return { img, vx: o.vx ?? 4 }
    })
    this.wrap = o.wrap ?? 1600
    this.x0 = o.x0 ?? -800
  }
  update(dt) {
    for (const it of this.items) {
      it.img.x += it.vx * dt
      if (it.img.x > this.x0 + this.wrap) it.img.x -= this.wrap + 400
    }
  }
}

export { rand }
