// The keel-walk: a long plank walkway slung under the town. Side elevation,
// tarred ceiling above, bright pale below, figures rim-lit from beneath.

import { SCENES, PROMPTS } from "../script.js"
import { R, C, Painter, place, mix, rng } from "../art.js"
import { Actor } from "../actors.js"
import { Input } from "../input.js"
import { Sfx } from "../audio.js"
import { SKY, DEV, T, setState } from "../state.js"
import { CloudLayer, rand } from "../fx.js"

const DECK_Y = 300
const LOW_Y = 520
const RAMP0 = 1320,
  RAMP1 = 1560
const END_X = 2300
const STOPS = { tell1: 560, grave: 1100, tell41: 1880 }
const THRUM_AT = { arrive: 230, tell1: 650, grave: 1190, tell41: 1975 }
const TELL41 = { hole: 1858, weight: 1884, loopX: 1846, loopY: 446 }

export function groundY(x) {
  if (x <= RAMP0) return DECK_Y
  if (x >= RAMP1) return LOW_Y
  // stairs: 6 treads
  const n = 6
  const k = Math.min(n - 1, Math.floor(((x - RAMP0) / (RAMP1 - RAMP0)) * n))
  const t = ((x - RAMP0) / (RAMP1 - RAMP0)) * n - k
  const y0 = DECK_Y + ((LOW_Y - DECK_Y) * k) / n
  const y1 = DECK_Y + ((LOW_Y - DECK_Y) * (k + 1)) / n
  return t < 0.8 ? y0 : y0 + (y1 - y0) * ((t - 0.8) / 0.2)
}

const DARK = "#221d1a"
const SIL = (c, k = 0.8) => mix(c, DARK, k)

export class Keel extends Phaser.Scene {
  constructor() {
    super({ key: "Keel" })
  }

  create() {
    SKY.scene = this
    this.ui = this.scene.get("UI")
    const cam = this.cameras.main
    cam.setOrigin(0, 0).setZoom(R)
    cam.setBackgroundColor("#f6e2c4")
    this.control = false
    this.stage = "arrive"
    this.lanterns = []
    this.dust = []
    this.build()
    this.mote = new Actor(this, "mote", { variant: "sil", mode: "side", x: 112, y: DECK_Y, speed: 118, surface: () => "keel" })
    this.thrum = new Actor(this, "thrum", { variant: "sil", mode: "side", x: THRUM_AT.arrive, y: DECK_Y, speed: 70, face: -1, surface: () => "keel" })
    this.deputy = new Actor(this, "deputy", { variant: "sil", mode: "side", x: 0, y: 0, noShadow: true })
    this.deputy.footsteps = false
    this.deputyOn = true
    for (const a of [this.mote, this.thrum, this.deputy]) {
      a.shadow.setVisible(false)
      a.noShadow = true
      a.depthBias = 1800
    }
    this.mote.depthBias = 1820
    this.actors = { mote: this.mote, thrum: this.thrum, deputy: this.deputy }
    this.events.once("shutdown", () => {
      if (SKY.scene === this) SKY.scene = null
    })
    this.run()
  }

  // ================================================================ art
  bake(fn, x, y, depth, sf = 1) {
    const p = new Painter()
    fn(p)
    const b = p.bake(this, `__k${Math.random().toString(36).slice(2)}`)
    const img = place(this, b, x, y, depth)
    if (sf !== 1) img.setScrollFactor(sf)
    return img
  }

  build() {
    // screen-fixed pale gradient (bright below)
    this.add.image(0, 0, "skyKeel").setOrigin(0).setScrollFactor(0).setDisplaySize(960, 540).setDepth(-50000)
    const r = rng(19)
    // far clouds below, very pale
    this.clouds = [
      new CloudLayer(
        this,
        [
          ["cloudLow0", 200, 760, 1.4, 0.7],
          ["cloudLow2", 1100, 790, 1.5, 0.7],
          ["cloudLow4", 1900, 770, 1.3, 0.7],
        ],
        0.2,
        -45000,
        { vx: 4, x0: -400, wrap: 2800 },
      ),
    ]
    // ---- distant keel structures and graves (parallax, low contrast)
    for (const [sf, k, alpha] of [
      [0.32, 0.72, 0.55],
      [0.55, 0.5, 0.8],
    ]) {
      this.bake((p) => {
        const tint = (c) => mix(c, "#f1dcc0", k)
        p.cf = tint
        // a distant ceiling band
        p.rect(-400, -220, 3600, 170, C.tar)
        for (let x = -400; x < 3200; x += 140 + r() * 60) p.rect(x, -60, 26, 28 + r() * 20, C.tar2)
        for (let x = -300; x < 3200; x += 70 + r() * 90) {
          const len = 120 + r() * 260
          p.line([x, -52, x + (r() - 0.5) * 6, len], 0.8, C.rope)
          p.poly([x - 3, len, x, len - 2, x, len + 7], C.slateLit)
          p.poly([x + 3, len, x, len - 2, x, len + 7], C.slateShade)
        }
        for (let x = -200; x < 3200; x += 260 + r() * 200) {
          const y = 160 + r() * 260
          p.line([x, -52, x - 18, y], 0.8, C.rope)
          p.line([x, -52, x + 18, y], 0.8, C.rope)
          p.rect(x - 22, y, 44, 7, C.slateLit)
          p.rect(x - 22, y + 7, 44, 3, C.slateShade)
          p.cf = null
          p.circle(x + 26, y + 12, 6, C.glow, 0.5 * alpha)
          p.circle(x + 26, y + 12, 2, C.wax, alpha)
          p.cf = tint
        }
        p.cf = null
      }, 0, sf * 200 + 20, -40000 + sf * 1000, sf)
    }
    // ---- the ceiling: the underside of the deck
    this.bake((p) => {
      const x0 = -500,
        x1 = END_X + 600
      p.rect(x0, -520, x1 - x0, 520, C.tar)
      // planks seen from below
      for (let y = -500; y < 0; y += 22) p.rect(x0, y + 19, x1 - x0, 1.6, "#24201d")
      for (let x = x0; x < x1; x += 96) {
        const off = ((x / 96) % 2) * 11
        for (let y = -500 + off; y < 0; y += 44) p.rect(x + ((y * 7) % 60), y, 1.4, 19, "#24201d")
      }
      // warm bounce along the plank edges nearest the light
      p.rect(x0, -3, x1 - x0, 3, mix(C.tar2, C.wax, 0.35))
      // cross beams hanging down; bottom faces lit warm
      for (let x = x0 + 40; x < x1; x += 190) {
        p.rect(x, -40, 30, 66, C.tar2)
        p.rect(x + 20, -40, 10, 66, C.tar)
        p.rect(x, 22, 30, 4, mix(C.tar2, C.wax, 0.45))
      }
      // the hole the ladder comes down through
      p.rect(80, -8, 64, 9, "#14110f")
    }, 0, 0, -20000)
    // ---- ladder from the hatch
    this.bake((p) => {
      for (const x of [94, 128]) {
        p.rect(x - 2, -4, 4, DECK_Y + 4, SIL(C.plankTop, 0.55))
        p.rect(x - 2, -4, 1.5, DECK_Y + 4, SIL(C.plankLit, 0.4))
      }
      for (let y = 18; y < DECK_Y; y += 22) {
        p.rect(94, y, 34, 3, SIL(C.plankTop, 0.5))
        p.rect(94, y + 2, 34, 1, mix(C.plankLit, C.glow, 0.3))
      }
    }, 0, 0, -9000)
    // ---- tells and hanging ropes (main layer, behind the walkway)
    this.bake((p) => {
      // suspension ropes for the walkway
      for (let x = 40; x < END_X; x += 120) {
        const gy = groundY(x)
        p.line([x, 26, x, gy + 4], 1.1, SIL(C.rope, 0.45))
      }
      // scenery tells: slight leans, the job's daily reading
      const tellXs = [330, 760, 900, 1260, 1420, 1650, 2100, 2230]
      for (const x of tellXs) {
        const lean = (r() - 0.5) * 0.05
        const len = groundY(x) - 60 - r() * 30
        tellLine(p, x, len, lean)
      }
      // tell one: leaning, visibly, north and a bit east
      tellLine(p, STOPS.tell1 - 30, DECK_Y - 52, 0.15, true)
      // plumb reference painted on the nearest beam
      // tell forty-one: slack loop, the weight pressed flat against the planks
      const { hole, weight, loopX, loopY } = TELL41
      const pts = []
      for (let k = 0; k <= 24; k++) {
        const t = k / 24
        // descend from the hole, swing low, climb back up to the weight
        const x = hole + (loopX - hole) * Math.sin(t * Math.PI) * 1.0 + (weight - hole) * t + Math.sin(t * Math.PI * 2) * 6
        const y = 2 + Math.sin(t * Math.PI) * (loopY - 2) * (1 - 0.18 * Math.sin(t * Math.PI * 3))
        pts.push(x, y)
      }
      p.line(pts, 0.9, mix(C.rope, C.glow, 0.2))
      p.rect(hole - 3, -1, 6, 3, C.wax) // wax plug
      // the weight, flat against the underside of the deck
      p.poly([weight - 7, 1, weight + 7, 1, weight + 4, 6, weight - 4, 6], C.slateLit)
      p.poly([weight, 1, weight + 7, 1, weight + 4, 6, weight, 6], C.slateShade)
      p.rect(weight - 7, 5, 14, 1.4, mix(C.slateLit, C.glow, 0.5))
    }, 0, 0, -8000)
    // ---- lanterns along the walkway
    for (const x of [200, 470, 820, 1180, 1500, 1760, 2050]) this.lantern(x, groundY(x) - 120)
    // ---- Orrin's grave: a slab in a rope cradle, with a lantern
    const gx = STOPS.grave - 10,
      gy = DECK_Y - 46
    this.bake((p) => {
      p.line([gx - 52, 26, gx - 40, gy], 1, SIL(C.rope, 0.35))
      p.line([gx + 52, 26, gx + 40, gy], 1, SIL(C.rope, 0.35))
      p.line([gx - 30, 26, gx - 34, gy], 0.8, SIL(C.rope, 0.5))
      p.line([gx + 30, 26, gx + 34, gy], 0.8, SIL(C.rope, 0.5))
      // slab: top sliver, front face, warm underside
      p.rect(gx - 44, gy - 3, 88, 4, mix(C.slateTop, DARK, 0.45))
      p.rect(gx - 44, gy, 88, 14, SIL(C.slateShade, 0.35))
      p.rect(gx - 44, gy + 14, 88, 3, mix(C.slateLit, C.glow, 0.45))
      // carved marks (no letters)
      for (let k = 0; k < 5; k++) p.rect(gx - 24 + k * 10, gy + 5, 6, 1.4, mix(C.slateTop, C.glow, 0.25))
      p.rect(gx - 30, gy + 9, 60, 1.2, mix(C.slateTop, C.glow, 0.2))
      // cradle netting under the slab
      p.line([gx - 44, gy + 16, gx, gy + 24, gx + 44, gy + 16], 1, mix(C.rope, C.glow, 0.3))
      for (let k = -3; k <= 3; k++) p.line([gx + k * 13, gy + 15, gx + k * 10, gy + 21 - Math.abs(k)], 0.7, mix(C.rope, C.glow, 0.3))
    }, 0, 0, -7000)
    this.lantern(gx + 50, gy + 6, true)
    // ---- walkway deck with rope rails
    this.bake((p) => {
      const front = (x0, x1, y) => {
        p.rect(x0, y, x1 - x0, 5, SIL(C.plankTop, 0.55)) // top sliver
        p.rect(x0, y + 5, x1 - x0, 11, SIL(C.plankShade, 0.35)) // front face
        p.rect(x0, y + 16, x1 - x0, 3, mix(C.plankLit, C.glow, 0.35)) // lit underside edge
        for (let x = x0; x < x1; x += 34) p.rect(x, y + 5, 1.3, 11, DARK, 0.5)
      }
      front(20, RAMP0, DECK_Y)
      // stairs
      const n = 6
      for (let k = 0; k < n; k++) {
        const x0 = RAMP0 + ((RAMP1 - RAMP0) * k) / n
        const x1 = RAMP0 + ((RAMP1 - RAMP0) * (k + 1)) / n
        const y = DECK_Y + ((LOW_Y - DECK_Y) * k) / n
        front(x0, x1 + 2, y)
        p.rect(x0 + 4, y + 18, 4, (LOW_Y - DECK_Y) / n, SIL(C.plankShade, 0.5))
      }
      front(RAMP1, END_X, LOW_Y)
    }, 0, 0, 1000)
    this.bake((p) => {
      // rails: posts and a sagging rope handrail on the near side
      let prev = null
      for (let x = 30; x <= END_X; x += 64) {
        const y = groundY(x)
        p.rect(x - 1.6, y - 26, 3.2, 27, SIL(C.plankTop, 0.55))
        p.rect(x - 1.6, y - 2, 3.2, 2, mix(C.plankLit, C.glow, 0.3))
        if (prev) {
          const [px, py] = prev
          const mx = (px + x) / 2,
            my = (py + y) / 2 - 22
          p.curve(px, py - 24, mx, my, x, y - 24, 1.2, mix(C.rope, DARK, 0.25))
          p.curve(px, py - 12, mx, my + 12 + 4, x, y - 12, 0.9, mix(C.rope, DARK, 0.35))
        }
        prev = [x, y]
      }
    }, 0, 0, 3000)
    // ---- foreground hanging lines (near, dark, faster parallax)
    this.bake((p) => {
      for (const x of [600, 1450, 2300, 3100]) {
        p.line([x, -200, x + 3, 520], 1.6, "#2a2420")
        p.poly([x - 5, 520, x + 3, 516, x + 10, 520, x + 3, 534], "#2f343b")
      }
    }, 0, 0, 5000, 1.3)
  }

  lantern(x, y, low = false) {
    const top = low ? y - 18 : 24
    const g = this.add.container(x, top).setDepth(-6000)
    const line = this.add.rectangle(0, 0, 1, y - top, 0x3a3128).setOrigin(0.5, 0)
    const halo = this.add.circle(0, y - top + 4, 16, 0xffe6a0, 0.22)
    const halo2 = this.add.circle(0, y - top + 4, 8, 0xffe6a0, 0.38)
    const cage = this.bake((p) => {
      p.rect(-3.5, 0, 7, 9, C.wax)
      p.rect(-3.5, 0, 2.5, 9, C.glow)
      p.rect(-4.2, -1.6, 8.4, 2, DARK)
      p.rect(-4.2, 8.6, 8.4, 1.6, DARK)
    }, 0, y - top, 0)
    g.add([line, halo, halo2, cage])
    this.tweens.add({ targets: [halo, halo2], alpha: "*=0.75", duration: rand(800, 1300), yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    g.angle = rand(-1.5, 1.5)
    this.lanterns.push(g)
    return g
  }

  // ================================================================ flow
  wait(ms) {
    return new Promise((res) => this.time.delayedCall(ms, res))
  }
  tween(cfg) {
    return new Promise((res) => this.tweens.add({ ...cfg, onComplete: () => res() }))
  }
  camTarget(x, gy) {
    return { x: x - 430, y: gy - 360 }
  }
  camTo(x, y, ms, ease = "Sine.easeInOut") {
    this.camFollow = false
    this.tweens.killTweensOf(this.cameras.main)
    return this.tween({ targets: this.cameras.main, scrollX: x, scrollY: y, duration: ms, ease })
  }
  say(lines) {
    return this.ui.say(lines, {
      onCue: (c) => this.onCue(c),
      onLine: (l) => this.onLine(l),
      onChoice: (id) => {
        if (id === "mum") {
          SKY.flags.rounds.tells = true
          this.ui.hud.tick("tells")
        }
      },
    })
  }
  onLine(line) {
    const a = this.actors[line.who]
    if (a && a !== this.deputy) this.tweens.add({ targets: a, hop: 2, duration: 110, yoyo: true })
    if (this.deputyOn && a) this.deputy.face = a.pos.x > this.deputy.pos.x ? -1 : 1
    if (this.revealUp && line.who === "thrum" && line.text === "...") {
      // come back down to the two of them for the confession
      this.revealUp = false
      const c = this.camTarget(this.mote.pos.x + 60, LOW_Y)
      this.camTo(c.x, c.y, T(2600))
    }
  }
  async onCue(c) {
    if (c === "revealTell") await this.revealTell()
    else if (c === "bellGroan") this.bellGroan()
  }

  async run() {
    setState("keel")
    this.phase = "keel"
    const ui = this.ui
    ui.hud.show(true)
    ui.hud.sync(SKY.flags.rounds)
    Sfx.ambience("keel", 1.5)
    const c = this.camTarget(this.mote.pos.x + 80, DECK_Y)
    this.cameras.main.setScroll(c.x, c.y - 30)
    this.mote.lift = 240
    this.mote.setView("back")
    await ui.fade(0, T(1200))
    // down the ladder
    Sfx.ladder()
    this.tween({ targets: this.cameras.main, scrollY: c.y, duration: T(2400), ease: "Sine.easeInOut" })
    await this.tween({ targets: this.mote, lift: 0, duration: T(2400), ease: "Sine.easeInOut" })
    this.mote.setView("front")
    this.mote.face = 1
    await this.wait(T(300))
    await this.say(SCENES.keelArrive)
    this.thrum.walkTo(THRUM_AT.tell1)
    this.control = true
    this.camFollow = true
    this.stage = "tell1"
  }

  async doTell1() {
    this.control = false
    this.stage = "busy"
    this.mote.faceTo(1)
    this.thrum.faceTo(-1)
    await this.say(SCENES.tell1)
    this.stage = "grave"
    this.thrum.walkTo(THRUM_AT.grave)
    this.control = true
  }
  async doGrave() {
    this.control = false
    this.stage = "busy"
    this.mote.stopPath()
    this.mote.faceTo(1)
    this.thrum.faceTo(-1)
    await this.say(SCENES.grave)
    this.stage = "tell41"
    this.thrum.walkTo(THRUM_AT.tell41)
    this.control = true
  }
  async doTell41() {
    this.control = false
    this.stage = "busy"
    this.mote.stopPath()
    setState("tell41")
    this.mote.faceTo(1)
    this.thrum.faceTo(-1)
    await this.say(SCENES.tell3Approach)
    setState("keelOut")
    await this.wait(T(600))
    await this.ui.fade(1, T(1600))
    this.scene.start("Town", { mode: "after" })
  }

  async revealTell() {
    setState("reveal")
    const { loopX, loopY } = TELL41
    // the line, slack, first
    this.camFollow = false
    await this.camTo(loopX - 520, loopY - 300, T(1600))
    await this.wait(T(900))
    // then up the line to the weight against the planks
    this.revealUp = true
    await this.camTo(loopX - 500, -150, T(4200), "Sine.easeInOut")
  }

  bellGroan() {
    Sfx.groan()
    this.cameras.main.shake(T(2200), 0.0016)
    for (const l of this.lanterns) {
      this.tweens.add({ targets: l, angle: { from: rand(-9, -5), to: rand(5, 9) }, duration: rand(700, 900), yoyo: true, repeat: 2, ease: "Sine.easeInOut", onComplete: () => this.tweens.add({ targets: l, angle: 0, duration: 1200 }) })
    }
    // dust sifting down from the planks
    const cam = this.cameras.main
    for (let k = 0; k < 70; k++) {
      this.time.delayedCall(rand(0, 1800), () => {
        const x = cam.scrollX + rand(40, 920),
          y = cam.scrollY - rand(5, 40)
        const img = this.add.image(x, y, "dust").setDepth(4000).setScale(rand(0.6, 1.4) / R).setAlpha(rand(0.5, 0.9))
        this.tweens.add({ targets: img, y: y + rand(160, 320), x: x + rand(-14, 14), duration: rand(2400, 3600), ease: "Sine.easeIn", onComplete: () => img.destroy() })
        this.tweens.add({ targets: img, alpha: 0, delay: 1800, duration: 1200 })
      })
    }
    // Deputy does not wait for people
    this.deputyOn = false
    this.deputy.flying = true
    this.tween({ targets: this.deputy, lift: this.deputy.lift + 420, duration: T(2600), ease: "Sine.easeIn" })
    this.tween({ targets: this.deputy.pos, x: this.deputy.pos.x + 160, duration: T(2600), ease: "Sine.easeIn" })
  }

  onTap(px, py) {
    if (!this.control || this.ui.dialogue.active) return
    const w = this.cameras.main.getWorldPoint(px, py)
    this.mote.walkTo(Phaser.Math.Clamp(w.x, 60, this.maxX()))
  }
  maxX() {
    return this.thrum.pos.x - 52
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000
    const ui = this.ui
    const m = this.mote
    if (this.control && !ui.dialogue.active) {
      const ax = Input.axis().x
      if (ax) {
        m.stopPath()
        m.pos.x = Phaser.Math.Clamp(m.pos.x + ax * m.speed * dt, 60, this.maxX())
        m.moving = true
        m.faceTo(ax)
      } else if (!m._path) m.moving = false
    } else if (!m._path) m.moving = false
    for (const a of [this.mote, this.thrum, this.deputy]) {
      if (a._path) {
        a.stepPath(dt)
        if (a === this.mote) a.pos.x = Math.min(a.pos.x, this.maxX())
      }
      if (a !== this.deputy) a.pos.y = groundY(a.pos.x)
    }
    if (this.deputyOn) {
      this.deputy.pos.x = this.thrum.pos.x
      this.deputy.pos.y = this.thrum.pos.y
      this.deputy.lift = 55 + this.thrum.hop + (this.thrum.moving ? Math.abs(Math.sin(this.thrum.walkT)) * 1.6 : 0)
    }
    if (this.deputy.flying) {
      this.deputy.flapT = (this.deputy.flapT || 0) + dt * 12
      this.deputy.setView(Math.floor(this.deputy.flapT) % 2 ? "w1" : "w-1")
    }
    for (const a of [this.mote, this.thrum, this.deputy]) a.update(dt)
    for (const c of this.clouds) c.update(dt)

    // stops
    let prompt = null
    if (this.control && !ui.dialogue.active) {
      const x = m.pos.x
      if (this.stage === "tell1" && x > STOPS.tell1 - 110 && !this.thrum._path) {
        prompt = PROMPTS.read
        if (Input.takeAct()) this.doTell1()
      } else if (this.stage === "grave" && x > STOPS.grave - 90 && !this.thrum._path) this.doGrave()
      else if (this.stage === "tell41" && x > STOPS.tell41 - 120 && !this.thrum._path) this.doTell41()
      else if (!this.movedOnce && this.stage === "tell1") prompt = null
    }
    ui.hud.setPrompt(prompt)

    if (this.camFollow) {
      const c = this.camTarget(m.pos.x, m.pos.y)
      const k = 1 - Math.exp(-dt * 3)
      const cam = this.cameras.main
      cam.scrollX += (c.x - cam.scrollX) * k
      cam.scrollY += (c.y - cam.scrollY) * k
    }
  }
}

function tellLine(p, x, len, lean, strong = false) {
  const ex = x + lean * len,
    ey = len
  p.rect(x - 2.5, 24, 5, 3, C.wax)
  p.line([x, 26, ex, ey], strong ? 1.1 : 0.8, mix(C.rope, strong ? C.glow : DARK, strong ? 0.15 : 0.25))
  // slate weight
  const s = strong ? 1.25 : 1
  p.poly([ex - 3.4 * s, ey, ex, ey - 2 * s, ex, ey + 8 * s], SIL(C.slateLit, 0.3))
  p.poly([ex + 3.4 * s, ey, ex, ey - 2 * s, ex, ey + 8 * s], SIL(C.slateShade, 0.3))
  p.poly([ex - 3.4 * s, ey, ex, ey + 8 * s, ex - 1, ey + 6 * s], mix(C.slateLit, C.glow, 0.45))
}

void DEV
void END_X
