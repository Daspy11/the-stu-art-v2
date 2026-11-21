// Latchford, top to bottom: the cold open rise, the rounds, and the square after.

import { SCENES, RHYME, RHYME_LAST, CAPTIONS, PROMPTS } from "../script.js"
import { R, C, Painter, place, P, mix, canvasTexture } from "../art.js"
import { toScreen, toTile, screenDirToTile } from "../iso.js"
import * as TM from "../townmap.js"
import { Actor } from "../actors.js"
import { Smoke, Flock, emitMote, Rain, CloudLayer, rand } from "../fx.js"
import { Input } from "../input.js"
import { Sfx } from "../audio.js"
import { SKY, DEV, T, setState } from "../state.js"

const WORLD_TOP = -2700
const WORLD_BOT = 3300
const Y_BOTTOM = 2420 // cold-open start (scrollY)
const MIND_TIME = 1.6

// sky colour by world y (the only gradient in the game)
const SKY_STOPS = [
  [-2700, "#fff1d4"],
  [-1700, "#f5e3c8"],
  [-800, "#c3c9c6"],
  [150, "#8fa9b8"],
  [560, "#a6b6ba"],
  [960, "#ecd3b8"],
  [1500, "#f8e4c8"],
  [2200, "#fff4dc"],
  [3300, "#fff8ea"],
]

export class Town extends Phaser.Scene {
  constructor() {
    super({ key: "Town" })
  }
  init(data) {
    this.mode = data.mode || "cold"
  }

  create() {
    SKY.scene = this
    this.ui = this.scene.get("UI")
    const cam = this.cameras.main
    cam.setOrigin(0, 0).setZoom(R)
    cam.setBackgroundColor("#fff4dc")
    this.grid = TM.buildGrid()
    this.control = false
    this.holding = null
    this.ringP = 0
    this.looking = null
    this.moved = false
    this.smokes = []
    this.lanternImgs = []
    this.after = this.mode === "after"
    this.buildWorld()
    this.buildActors()
    this.buildInteractables()
    this.ring = this.add.graphics().setDepth(9500)
    this.rain = new Rain(this)
    this.events.once("shutdown", () => this.cleanup())

    if (this.mode === "cold") this.coldOpen()
    else if (this.mode === "rounds") this.startRounds(true)
    else if (this.mode === "after") this.afterSquare()
  }

  cleanup() {
    this.rain.destroy()
    if (SKY.scene === this) SKY.scene = null
  }

  // ================================================================ world
  buildWorld() {
    const g = this.grid
    // sky
    const sk = canvasTexture(this, `skyTown${Math.random()}`, 4, 1024)
    {
      const ctx = sk.context
      const grd = ctx.createLinearGradient(0, 0, 0, 1024)
      for (const [y, c] of SKY_STOPS) grd.addColorStop((y - WORLD_TOP) / (WORLD_BOT - WORLD_TOP), c)
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, 4, 1024)
      sk.refresh()
    }
    this.skyImg = this.add.image(0, WORLD_TOP, sk.key).setOrigin(0, 0).setScrollFactor(0, 1).setDisplaySize(960, WORLD_BOT - WORLD_TOP).setDepth(-40000)

    // clouds: low decks for the cold open (far below), a mid deck that settles
    // behind the island, high wisps above the town, fast foreground wisps
    this.clouds = []
    const atStart = (sy, sf) => sy + Y_BOTTOM * sf
    this.clouds.push(
      new CloudLayer(
        this,
        [
          ["cloudLow2", -420, atStart(468, 0.1), 1.3, 0.9],
          ["cloudLow0", 180, atStart(488, 0.1), 1.2, 0.9],
          ["cloudLow4", 690, atStart(476, 0.1), 1.1, 0.9],
        ],
        0.1,
        -30000,
        { vx: 3, x0: -900, wrap: 2100, sfx: 0.1 },
      ),
      new CloudLayer(
        this,
        [
          ["cloudLow1", -300, atStart(338, 0.24), 1, 1],
          ["cloudLow3", 330, atStart(356, 0.24), 1, 1],
          ["cloudLow0", 860, atStart(344, 0.24), 0.8, 1],
        ],
        0.24,
        -29000,
        { vx: 7, x0: -900, wrap: 2100, sfx: 0.24 },
      ),
      new CloudLayer(
        this,
        [
          ["cloudMid0", -520, 520 + 380 * 0.5, 1, 1],
          ["cloudMid3", 40, 548 + 380 * 0.5, 1, 1],
          ["cloudMid2", 560, 532 + 380 * 0.5, 1, 1],
        ],
        0.5,
        -28000,
        { vx: 5, x0: -1000, wrap: 2200, sfx: 0.5 },
      ),
      new CloudLayer(
        this,
        [
          ["cloudHigh1", -380, -260, 1, 0.9],
          ["cloudHigh4", 300, -520, 1, 0.85],
          ["cloudHigh2", -100, -980, 1.2, 0.8],
          ["cloudHigh0", 420, -1400, 1.1, 0.7],
        ],
        0.85,
        -27000,
        { vx: 4, x0: -900, wrap: 2000 },
      ),
      new CloudLayer(
        this,
        [
          ["cloudMid1", -240, 1260 * 1.35, 1.6, 0.55],
          ["cloudMid4", 330, 1700 * 1.35, 1.8, 0.45],
        ],
        1.35,
        9800,
        { vx: 10, x0: -900, wrap: 2000 },
      ),
    )
    // a far wild island, very small, sinking slowly
    this.farIsland = this.bake((p) => {
      p.poly([-26, 0, 24, 0, 18, 5, 6, 14, -2, 26, -8, 12, -20, 5], "#b7aea4")
      p.poly([-2, 26, -8, 12, -20, 5, -26, 0, -10, 2], "#cbbdae")
      p.rect(-26, -2, 50, 2, "#a9aea6")
      p.ellipse(10, -4, 6, 4, "#a3ab9b")
    }, 760, 760 * 0.3 + 420, -27500)
    this.farIsland.setScrollFactor(0.3, 0.3).setAlpha(0.8)

    // island underside + keel + hangings
    const prof = TM.rimProfile(g)
    this.prof = prof
    const und = new Painter()
    const u = TM.drawUnderside(und, g, prof)
    const kf = TM.drawKeelFrame(und, u)
    this.place(und, 0, 0, -12000)
    const hang = new Painter()
    const hg = TM.drawHangings(hang, u, kf, g, prof)
    this.place(hang, 0, 0, -12500)
    for (const [lx, ly] of hg.lanterns) {
      const gl = this.add.circle(lx, ly, 9, 0xffe6a0, 0.28).setDepth(-12400)
      const gl2 = this.add.circle(lx, ly, 4.5, 0xffe6a0, 0.45).setDepth(-12400)
      this.tweens.add({ targets: [gl, gl2], alpha: "*=0.7", duration: rand(900, 1500), yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    // ground
    const gp = new Painter()
    TM.drawGround(gp, g)
    this.place(gp, 0, 0, -10000)
    this.islandBounds = { x0: prof.minX, x1: prof.maxX, y0: toScreen(0, 0).y, y1: 0 }
    let ymin = Infinity,
      ymax = -Infinity
    for (let j = 0; j < TM.N; j++)
      for (let i = 0; i < TM.N; i++)
        if (g.isDeck(i, j)) {
          const c = TM.tileC(i, j)
          ymin = Math.min(ymin, c.y)
          ymax = Math.max(ymax, c.y)
        }
    this.islandBounds.y0 = ymin
    this.islandBounds.y1 = ymax

    this.buildRails()
    this.buildProps()
  }

  bake(fn, x, y, depth) {
    const p = new Painter()
    fn(p)
    return this.place(p, x, y, depth)
  }
  place(p, x, y, depth) {
    const b = p.bake(this, `__t${Math.random().toString(36).slice(2)}`)
    return place(this, b, x, y, depth)
  }
  // place a footprint prop; origin = tile corner (i0, j0)
  prop(fn, i0, j0, w, d, o = {}) {
    const p = new Painter()
    const ret = fn(p)
    const s = toScreen(i0, j0)
    const c = toScreen(i0 + w / 2, j0 + d / 2)
    const img = this.place(p, s.x, s.y, o.depth ?? c.y + (o.bias ?? 0))
    if (o.block !== false) this.grid.blockRect(Math.floor(i0 + 0.01), Math.floor(j0 + 0.01), Math.ceil(i0 + w - 0.01) - 1, Math.ceil(j0 + d - 0.01) - 1)
    return { img, ret, s }
  }

  buildRails() {
    const g = this.grid
    const segs = []
    for (let j = 0; j < TM.N; j++)
      for (let i = 0; i < TM.N; i++) {
        if (!g.isDeck(i, j)) continue
        if (!g.isDeck(i, j - 1)) segs.push([i, j, i + 1, j])
        if (!g.isDeck(i, j + 1)) segs.push([i, j + 1, i + 1, j + 1])
        if (!g.isDeck(i - 1, j)) segs.push([i, j, i, j + 1])
        if (!g.isDeck(i + 1, j)) segs.push([i + 1, j, i + 1, j + 1])
      }
    const rs = TM.L.rail
    for (const [a, b, c, d] of segs) {
      const A = toScreen(a, b),
        B = toScreen(c, d)
      const isSpot = Math.abs((a + c) / 2 - (rs.i + 1)) < 0.6 && Math.abs((b + d) / 2 - (rs.j + 0.5)) < 0.6
      const p = new Painter()
      TM.drawRailSeg(p, 0, 0, B.x - A.x, B.y - A.y, isSpot ? 6 : 2.5)
      this.place(p, A.x, A.y, (A.y + B.y) / 2 + 2)
    }
    // the look-low spot: a chalk ring on the planks and a worn slate stud
    const sc = TM.tileC(rs.i, rs.j)
    this.bake((p) => {
      p.ellipse(10, 2, 13, 6, "#efe9dc", 0.75)
      p.ellipse(10, 2, 11, 4.8, C.plankTop)
      p.ellipse(10, 2, 8, 3.4, mix(C.plankTop, C.plankLit, 0.5))
    }, sc.x, sc.y, -5000)
  }

  buildProps() {
    const L = TM.L
    const g = this.grid
    const smoke = (r, i0, j0) => {
      if (r && r.chim) {
        const s = toScreen(i0, j0)
        this.smokes.push(new Smoke(this, s.x + r.chim.x, s.y + r.chim.y - 2, 9000))
      }
    }
    // ---- houses
    const H = (i0, j0, w, d, o) => {
      const r = this.prop((p) => TM.drawHouse(p, w, d, o), i0, j0, w, d)
      if (!o.grey && o.smoke !== false) smoke(r.ret, i0, j0)
      return r
    }
    const mh = L.moteHouse
    H(mh.i0, mh.j0, mh.w, mh.d, { door: { face: "x", at: 1.5, win: [0.45, 2.55] }, sideWin: [0.8, 2.2], along: "y", chimX: 0.9 })
    const hh = L.harrowHouse
    H(hh.i0, hh.j0, hh.w, hh.d, { grey: true, ajar: true, h: 21, door: { face: "y", at: 1.4, win: [2.4] }, sideWin: [1.5], along: "x" })
    H(13, 12, 3, 2, { door: { face: "y", at: 1.0, win: [2.2] }, sideWin: [1], chimX: 2.3 })
    H(26, 20, 2, 3, { door: { face: "y", at: 1.0, win: [] }, sideWin: [0.7, 2.2], along: "y", chimX: 0.8 })
    H(11, 15, 2, 2, { door: { face: "x", at: 1.0, win: [] }, sideWin: [1], chimX: 0.9, along: "y" })
    H(16, 26, 3, 2, { door: { face: "x", at: 1.0, win: [] }, sideWin: [0.7, 2.3], chimX: 0.6 })
    H(23, 9.6, 2, 2, { door: { face: "y", at: 1.0, win: [] }, sideWin: [1], along: "x", chimX: 1.4 })
    H(28, 11, 2, 2, { door: { face: "y", at: 0.9, win: [] }, sideWin: [1], along: "y" })
    // ---- the doorstep
    const st = this.prop((p) => TM.drawStep(p), L.step.i, L.step.j, 1, 1, { block: false, bias: -26 })
    this.stepImg = st.img
    this.stepBase = st.img.y
    // ---- square: bell frame + bell
    const bf = this.prop((p) => TM.drawBellFrame(p, false), L.bell.i, L.bell.j, 1.6, 1, { block: false })
    g.blockRect(L.bell.i, L.bell.j, L.bell.i + 1, L.bell.j)
    const piv = toScreen(L.bell.i + TM.BELL_PIVOT.x, L.bell.j + TM.BELL_PIVOT.y)
    this.bellPivot = { x: piv.x, y: piv.y - TM.BELL_PIVOT.z }
    const bellDepth = bf.img.depth + 0.5
    if (!this.after) {
      this.bell = this.bake((p) => TM.drawBell(p, false), this.bellPivot.x, this.bellPivot.y, bellDepth)
    } else {
      this.bell = this.bake((p) => {
        // ropes taut upward, out of frame
        p.line([-5, -16, -6, -420], 0.9, C.rope)
        p.line([5, -16, 6, -420], 0.9, C.rope)
        TM.drawBell(p, true)
      }, this.bellPivot.x, this.bellPivot.y, bellDepth)
      this.tweens.add({ targets: this.bell, angle: { from: -1.6, to: 1.6 }, duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    }
    // ---- hatch
    const ht = TM.tileC(L.hatch.i, L.hatch.j)
    this.prop((p) => TM.drawHatch(p), L.hatch.i, L.hatch.j, 1, 1, { depth: -5000 })
    this.prop((p) => TM.drawHatchLadder(p), L.hatch.i, L.hatch.j, 1, 1, { block: false, bias: 2 })
    this.hatchPos = ht
    // ---- the Tally's corner
    this.prop((p) => TM.drawFogNet(p, 3.2, { h: 74 }), 18.6, 11.4, 3.2, 0.2, { block: false, bias: -6 })
    g.blockRect(18, 11, 21, 11)
    const cs = toScreen(L.cistern.x, L.cistern.y)
    this.bake((p) => TM.drawCistern(p), cs.x, cs.y, cs.y + 4)
    g.blockRect(21, 12, 22, 13)
    this.prop((p) => TM.drawDesk(p), L.desk.i, L.desk.j, 1, 1)
    this.prop((p) => TM.drawTollBox(p), L.box.i, L.box.j, 1, 1)
    this.prop((p) => TM.drawSlates(p), 23, 13, 1, 1)
    // ---- other fog-nets
    this.prop((p) => TM.drawFogNet(p, 2.6, { h: 66 }), 12.4, 11.2, 2.6, 0.2, { block: false, bias: -6 })
    this.prop((p) => TM.drawFogNet(p, 2.4, { h: 62 }), 25.6, 9.8, 2.4, 0.2, { block: false, bias: -6 })
    // ---- terraces with bean rows
    this.prop((p) => TM.drawTerrace(p, 3, 2, { seed: 3 }), 20, 25, 3, 2)
    this.prop((p) => TM.drawTerrace(p, 2, 3, { seed: 9 }), 12, 24, 2, 3)
    this.prop((p) => TM.drawTerrace(p, 3, 2, { seed: 12 }), 26.5, 13.4, 2.5, 1.6)
    // ---- pigeon loft
    const lf = this.prop((p) => TM.drawLoft(p), 15.2, 16.2, 1.3, 1.1)
    const ls = lf.s
    this.loftAt = { x: ls.x + P(0.65, 0.55)[0], y: ls.y + P(0.65, 0.55)[1] - 60 }
    for (const [px, py] of TM.LOFT_PERCH().slice(0, 3)) {
      const v = this.registry.get("char-deputy-day").side
      const img = this.add.image(ls.x + px, ls.y + py + 1, v.key).setScale(0.8 / R).setDepth(lf.img.depth + 1)
      img.setOrigin(-v.ox / v.w, -v.oy / v.h)
      if (Math.random() < 0.5) img.setFlipX(true)
    }
    // ---- clutter that says people live here
    const bar = (x, y) => {
      const s = toScreen(x, y)
      this.bake((p) => TM.drawBarrel(p), s.x, s.y, s.y)
      g.blockRect(Math.floor(x), Math.floor(y), Math.floor(x), Math.floor(y))
    }
    bar(12.8, 23.7)
    bar(16.6, 14.6)
    bar(27.6, 23.4)
    bar(18.6, 27.6)
    const sack = (x, y) => {
      const s = toScreen(x, y)
      this.bake((p) => TM.drawSack(p), s.x, s.y, s.y)
    }
    sack(13.6, 24.3)
    sack(24.2, 13.3)
    sack(16.3, 28.3)
    this.prop((p) => TM.drawWashing(p, 2.4), 23.4, 23.2, 2.4, 0.2, { block: false })
    this.prop((p) => TM.drawSlates(p), 27, 19, 1, 1)
    // goats on the far terrace edge
    for (const [x, y, f] of [
      [24.2, 27.4, false],
      [25.1, 26.6, true],
    ]) {
      const s = toScreen(x, y)
      const img = this.bake((p) => TM.drawGoat(p), s.x, s.y, s.y)
      if (f) img.setFlipX(true)
      this.tweens.add({ targets: img, y: s.y - 0.6, duration: 600, yoyo: true, repeat: -1, delay: rand(0, 600) })
    }
    // ---- Brick's bathtub
    const ts = toScreen(L.tub.x, L.tub.y)
    this.tubShadow = this.add.image(ts.x, ts.y + 2, "shadow").setScale(2.3 / R).setDepth(-4000)
    this.tub = this.bake((p) => TM.drawTub(p), ts.x, ts.y, ts.y + 6)
    this.tubBase = ts.y
    g.blockRect(28, 15, 29, 15)
    // pigeons wheeling over the loft
    this.flock = new Flock(this, this.loftAt.x + 40, this.loftAt.y - 40, 6, { rx: 150, ry: 46, depth: 9600, speed: 0.5 })
  }

  // ================================================================ actors
  buildActors() {
    const L = TM.L
    const surf = (a) => {
      const i = Math.floor(a.pos.x),
        j = Math.floor(a.pos.y)
      const m = this.grid.mat[this.grid.idx(i, j)]
      return m === TM.MAT.plank ? "plank" : "slate"
    }
    this.mote = new Actor(this, "mote", { x: L.step.i + 0.26, y: L.step.j + 0.5, surface: surf })
    this.actors = { mote: this.mote }
    if (!this.after) {
      this.thrum = new Actor(this, "thrum", { x: L.step.i + 1.55, y: L.step.j + 0.75, speed: 1.9, face: -1, surface: surf })
      this.deputy = new Actor(this, "deputy", { x: 0, y: 0, noShadow: true })
      this.deputy.footsteps = false
      this.tunney = new Actor(this, "tunney", { x: L.tunney.i + 0.5, y: L.tunney.j + 0.3, face: -1 })
      this.harrow = new Actor(this, "harrow", { x: L.harrow.i + 0.5, y: L.harrow.j + 0.5, face: 1 })
      this.brick = new Actor(this, "brick", { x: L.brick.i + 0.4, y: L.brick.j + 0.5, face: -1, surface: surf })
      this.actors = { mote: this.mote, thrum: this.thrum, deputy: this.deputy, tunney: this.tunney, harrow: this.harrow, brick: this.brick }
      this.grid.blockRect(L.tunney.i, L.tunney.j, L.tunney.i, L.tunney.j)
      this.grid.blockRect(L.harrow.i, L.harrow.j, L.harrow.i, L.harrow.j)
      this.grid.blockRect(L.brick.i, L.brick.j, L.brick.i, L.brick.j)
      this.deputyOn = "thrum"
    } else {
      // gathered in the square
      this.tunney = new Actor(this, "tunney", { x: 18.3, y: 19.0, face: 1 })
      this.harrow = new Actor(this, "harrow", { x: 17.6, y: 20.9, face: 1 })
      this.brick = new Actor(this, "brick", { x: 20.9, y: 19.2, face: -1, surface: surf })
      this.deputy = new Actor(this, "deputy", { x: 0, y: 0, noShadow: true })
      this.deputy.setVisible(false)
      this.deputyOn = null
      this.actors = { mote: this.mote, deputy: this.deputy, tunney: this.tunney, harrow: this.harrow, brick: this.brick }
      for (const [i, j] of [
        [18, 19],
        [17, 20],
        [20, 19],
      ])
        this.grid.blockRect(i, j, i, j)
    }
    // scarf tail on Brick
    this.scarf = this.add.image(0, 0, this.bakeTail()).setScale(1 / R)
    this.scarf.setOrigin(0.36, 0.06)
  }
  bakeTail() {
    const k = "__scarfTail"
    if (!this.textures.exists(k)) {
      const p = new Painter()
      p.bounds(-3, 0, 5, 13)
      p.blob([-1.8, 0, 2, 0, 3.4, 7, 2.2, 11.5, -0.4, 11, -1.2, 6], C.scarf)
      p.blob([0.6, 0, 2, 0, 3.4, 7, 2.2, 11.5, 1.2, 9], C.scarfShade)
      p.bake(this, k, { pad: 1 })
    }
    return k
  }

  // ================================================================ interactables
  buildInteractables() {
    const L = TM.L
    const f = () => SKY.flags
    const at = (x, y, z = 0) => {
      const s = toScreen(x, y)
      return { x: s.x, y: s.y - z }
    }
    this.inter = [
      {
        id: "step",
        x: L.step.i + 0.5,
        y: L.step.j + 0.5,
        r: 0.95,
        kind: "mind",
        ring: at(L.step.i + 0.5, L.step.j + 0.5, 6),
        dust: at(L.step.i + 0.5, L.step.j + 0.5, 5),
        avail: () => (this.phase === "wake" && !f().rounds.step) || this.phase === "home",
        done: () => this.onStepMinded(),
      },
      {
        id: "bell",
        x: L.bell.i + 0.8,
        y: L.bell.j + 1.25,
        r: 1.15,
        kind: "mind",
        ring: { x: this.bellPivot.x, y: this.bellPivot.y + 12 },
        dust: at(L.bell.i + 0.8, L.bell.j + 0.6, 0),
        avail: () => this.phase === "rounds" && !f().rounds.bell,
        done: () => this.onBell(),
      },
      {
        id: "tunney",
        x: L.tunney.i + 0.5,
        y: L.tunney.j + 0.8,
        r: 1.3,
        kind: "talk",
        avail: () => this.phase === "rounds",
        run: () => this.talkTunney(),
      },
      {
        id: "cup",
        x: L.cistern.x - 0.5,
        y: L.cistern.y + 1.25,
        r: 1.1,
        kind: "mind",
        ring: at(L.cistern.x, L.cistern.y, 30),
        dust: at(L.cistern.x, L.cistern.y, 2),
        avail: () => this.phase === "rounds" && f().tunneyMet && !f().rounds.cup,
        done: () => this.onCup(),
      },
      {
        id: "box",
        x: L.box.i + 0.6,
        y: L.box.j + 1.2,
        r: 1.0,
        kind: "mind",
        ring: at(L.box.i + 0.5, L.box.j + 0.5, 44),
        dust: at(L.box.i + 0.5, L.box.j + 0.5, 2),
        avail: () => this.phase === "rounds" && f().rounds.cup && !f().rounds.box,
        done: () => this.onBox(),
      },
      {
        id: "hatch",
        x: L.hatch.i + 0.3,
        y: L.hatch.j - 0.3,
        r: 1.05,
        kind: "talk",
        prompt: PROMPTS.ladderDown,
        avail: () => this.phase === "rounds",
        run: () => this.onHatch(),
      },
      {
        id: "harrow",
        x: L.harrow.i + 0.5,
        y: L.harrow.j + 0.9,
        r: 1.25,
        kind: "talk",
        avail: () => this.phase === "rounds",
        run: () => this.talkHarrow(),
      },
      {
        id: "brick",
        x: L.brick.i + 0.4,
        y: L.brick.j + 0.9,
        r: 1.25,
        kind: "talk",
        avail: () => this.phase === "rounds",
        run: () => this.talkBrick(),
      },
      {
        id: "rail",
        x: L.rail.i + 0.55,
        y: L.rail.j + 0.5,
        r: 0.8,
        kind: "look",
        prompt: PROMPTS.lookLow,
        avail: () => this.phase === "rounds",
      },
    ]
  }

  // a mask that hides whatever is below the hatch opening (for ladders)
  hatchMask() {
    if (this._hatchMask) return this._hatchMask
    const L = TM.L
    const o = toScreen(L.hatch.i, L.hatch.j)
    const pt = (x, y) => {
      const [a, b] = P(x, y)
      return { x: o.x + a, y: o.y + b }
    }
    const l = pt(0.2, 0.8),
      b = pt(0.8, 0.8),
      r = pt(0.8, 0.2)
    const g = this.make.graphics({ add: false })
    g.fillStyle(0xffffff)
    g.fillPoints([{ x: l.x, y: l.y - 400 }, { x: r.x, y: r.y - 400 }, r, b, l], true)
    this._hatchMask = g.createGeometryMask()
    return this._hatchMask
  }

  // ================================================================ helpers
  wait(ms) {
    return new Promise((res) => {
      const ev = this.time.delayedCall(ms, res)
      ;(this._waits ||= []).push({ ev, res })
    })
  }
  tween(cfg) {
    return new Promise((res) => this.tweens.add({ ...cfg, onComplete: () => res() }))
  }
  camTo(x, y, ms, ease = "Sine.easeInOut") {
    const cam = this.cameras.main
    this.camFollow = false
    this.tweens.killTweensOf(cam)
    if (ms <= 0) {
      cam.setScroll(x, y)
      return Promise.resolve()
    }
    return this.tween({ targets: cam, scrollX: x, scrollY: y, duration: ms, ease })
  }
  camFor(sx, sy, oy = 290) {
    // scroll that puts world (sx,sy) at screen (480, oy), clamped
    const b = this.islandBounds
    let x = sx - 480,
      y = sy - oy
    x = Phaser.Math.Clamp(x, b.x0 - 140, b.x1 + 140 - 960)
    y = Phaser.Math.Clamp(y, b.y0 - 200, b.y1 - 330)
    return { x, y }
  }
  say(lines, extra = {}) {
    return this.ui.say(lines, {
      onCue: (c) => this.onCue(c),
      onLine: (line) => this.onLine(line),
      ...extra,
    })
  }
  onLine(line) {
    const a = this.actors[line.who]
    if (a && a !== this.deputy) {
      // speaker gives a small bob; others turn to them
      this.tweens.add({ targets: a, hop: 2.2, duration: 110, yoyo: true, ease: "Sine.easeOut" })
      for (const k of ["tunney", "brick", "thrum", "mote"]) {
        const o = this.actors[k]
        if (o && o !== a && !o.hidden && !o._path) o.faceTo(a.screen().x - o.screen().x)
      }
    }
    // Deputy faces away from whoever is talking
    if (this.deputy && !this.deputy.hidden && a && a !== this.deputy) this.deputy.face = a.screen().x > this.deputy.screen().x ? -1 : 1
  }
  async onCue(c) {
    if (c === "thrumLeaves") this.thrumLeaves()
    else if (c === "tunk") this.tunk()
    else if (c === "rainStart") this.rainStart()
    else if (c === "deputyArrives") await this.deputyArrives()
    else if (c === "sail") await this.sail()
  }

  // ================================================================ cold open
  async coldOpen() {
    setState("cold")
    this.phase = "cold"
    const ui = this.ui
    const cam = this.cameras.main
    cam.setScroll(-480 + 40, Y_BOTTOM)
    ui.setFade(1)
    ui.hud.show(false)
    Sfx.ambience("top", 4)
    this.skippable = true
    this.escT = 0
    this.coldObjs = []
    ui.fadeIn(ui.skipHint, 1500, 0.32)
    const S = () => this.skipped
    await this.wait(T(1300))
    if (S()) return
    // the rhyme, one line per soft note
    const lines = []
    const y0 = 196
    for (let i = 0; i < 4; i++) {
      const t = ui.text(RHYME[i], { y: y0 + i * 38, size: 25, spacing: 0.8, depth: 960 })
      lines.push(t)
      this.coldObjs.push(t)
      Sfx.motif(i)
      ui.fadeIn(t, 1300, 0.95)
      await this.wait(T(3000))
      if (S()) return
    }
    const last = ui.text(RHYME_LAST, { y: y0 + 4 * 38 + 12, size: 16, italic: true, spacing: 0.6, depth: 960 })
    this.coldObjs.push(last)
    ui.fadeIn(last, 1500, 0.7)
    await this.wait(T(2800))
    if (S()) return
    for (const t of [...lines, last]) ui.fadeOut(t, 1200)
    await this.wait(T(1300))
    if (S()) return
    // 0:18 — nothing but pale light
    ui.fade(0, T(2600))
    await this.wait(T(6000))
    if (S()) return
    // 0:24 — rise
    setState("rise")
    const est = this.camFor(-60, 560, 330)
    est.y = this.islandBounds.y0 - 175
    this.riseTween = this.tweens.add({ targets: cam, scrollY: est.y, duration: T(19500), ease: "Sine.easeInOut" })
    this.tweens.add({ targets: cam, scrollX: est.x, duration: T(19500), ease: "Sine.easeInOut" })
    await this.wait(T(12800))
    if (S()) return
    const title = ui.text(CAPTIONS.title, { y: 92, size: 58, spacing: 22, depth: 700, weight: 400 })
    this.coldObjs.push(title)
    ui.fadeIn(title, 3200, 0.96)
    await this.wait(T(6900))
    if (S()) return
    const place = ui.text(CAPTIONS.place, { y: 150, size: 24, italic: true, spacing: 2, depth: 700 })
    const sub = ui.text(CAPTIONS.sub, { y: 180, size: 14, spacing: 0.8, depth: 700 })
    this.coldObjs.push(place, sub)
    ui.fadeIn(place, 1400, 0.95)
    await this.wait(T(700))
    ui.fadeIn(sub, 1400, 0.85)
    await this.wait(T(2700))
    if (S()) return
    for (const t of [title, place, sub]) ui.fadeOut(t, 1300)
    ui.fadeOut(ui.skipHint, 600, false)
    this.skippable = false
    const door = this.camFor(this.mote.screen().x + 60, this.mote.screen().y, 250)
    await this.camTo(door.x, door.y, T(2600))
    if (S()) return
    this.wake()
  }

  skipCold() {
    if (this.skipped) return
    this.skipped = true
    this.skippable = false
    const ui = this.ui
    this.tweens.killTweensOf(this.cameras.main)
    for (const o of this.coldObjs || []) {
      ui.tweens.killTweensOf(o)
      if (o.active) ui.fadeOut(o, 300)
    }
    ui.fadeOut(ui.skipHint, 300, false)
    ui.skipBar.width = 0
    ui.fade(1, 250).then(() => {
      const door = this.camFor(this.mote.screen().x + 60, this.mote.screen().y, 250)
      this.cameras.main.setScroll(door.x, door.y)
      ui.fade(0, 900)
      this.wake()
    })
  }

  // ================================================================ wake + step
  async wake() {
    setState("wake")
    this.phase = "wakeTalk"
    this.ui.hud.show(true)
    this.ui.hud.sync(SKY.flags.rounds)
    this.mote.face = 1
    this.thrum.face = -1
    await this.wait(T(500))
    await this.say(SCENES.wake)
    this.phase = "wake"
    this.control = true
    this.camFollow = true
  }

  async onStepMinded() {
    const f = SKY.flags
    if (this.phase === "home") return this.onFinalStep()
    f.rounds.step = true
    this.ui.hud.tick("step")
    this.control = false
    this.phase = "stepDone"
    await this.wait(T(500))
    await this.say(SCENES.stepDone)
    this.startRounds(false)
  }

  thrumLeaves() {
    const L = TM.L
    const th = this.thrum
    const path = this.grid.path(Math.floor(th.pos.x), Math.floor(th.pos.y), L.hatch.i, L.hatch.j - 1) || []
    path.push({ x: L.hatch.i + 0.45, y: L.hatch.j + 0.4 })
    th.walkPath(path, 1.7).then(async () => {
      // down the ladder: sink into the hatch
      Sfx.ladder()
      th.sprite.setMask(this.hatchMask())
      th.setDepthOverride(-4990 - th.screen().y)
      th.shadow.setVisible(false)
      await this.tween({ targets: th, lift: -46, duration: 1500, ease: "Sine.easeIn" })
      th.setVisible(false)
      this.deputyOn = null
      this.deputy.setVisible(false)
    })
  }

  startRounds(fromSkip) {
    setState("rounds")
    this.phase = "rounds"
    this.ui.hud.show(true)
    this.ui.hud.sync(SKY.flags.rounds)
    if (fromSkip) {
      this.ui.setFade(0)
      this.thrum.setVisible(false)
      this.deputy.setVisible(false)
      this.deputyOn = null
      const c = this.camFor(this.mote.screen().x, this.mote.screen().y)
      this.cameras.main.setScroll(c.x, c.y)
    }
    this.control = true
    this.camFollow = true
    this.showMoveHint = !this.moved
  }

  // ================================================================ round handlers
  tunk() {
    Sfx.tunk()
    this.tweens.add({ targets: this.bell, angle: { from: 0, to: 4 }, duration: 120, yoyo: true, ease: "Sine.easeOut", onComplete: () => this.tweens.add({ targets: this.bell, angle: { from: 0, to: -1.5 }, duration: 160, yoyo: true }) })
  }
  async onBell() {
    SKY.flags.rounds.bell = true
    this.ui.hud.tick("bell")
    await this.say(SCENES.bell)
  }
  async talkTunney() {
    const f = SKY.flags
    this.mote.faceTo(this.tunney.screen().x - this.mote.screen().x)
    this.tunney.faceTo(this.mote.screen().x - this.tunney.screen().x)
    if (!f.tunneyMet) {
      f.tunneyMet = true
      await this.say(SCENES.tunneyHello)
    } else await this.say(SCENES.tunneyAgain)
  }
  async onCup() {
    SKY.flags.rounds.cup = true
    this.ui.hud.tick("cup")
    await this.say(SCENES.cup)
    this.tunney.faceTo(this.mote.screen().x - this.tunney.screen().x)
    await this.say(SCENES.tunneyAssay)
  }
  async onBox() {
    SKY.flags.rounds.box = true
    this.ui.hud.tick("box")
    await this.say(SCENES.box)
  }
  async talkHarrow() {
    const f = SKY.flags
    this.mote.faceTo(this.harrow.screen().x - this.mote.screen().x)
    if (!f.harrowMet) {
      f.harrowMet = true
      let first = true
      await this.say(SCENES.harrow, {
        onLine: (line) => {
          this.onLine(line)
          if (first) {
            first = false
            Sfx.cough()
            this.tweens.add({ targets: this.harrow, hop: 1.5, duration: 90, yoyo: true, repeat: 3 })
          }
        },
      })
    } else await this.say(SCENES.harrowAgain)
  }
  async talkBrick() {
    const f = SKY.flags
    this.mote.faceTo(this.brick.screen().x - this.mote.screen().x)
    this.brick.faceTo(this.mote.screen().x - this.brick.screen().x)
    const n = f.brickTalks++
    if (n === 0) await this.say(SCENES.brick)
    else if (f.lookSeconds === null && !f.lookAfterPlayed) {
      f.lookAfterPlayed = true
      await this.say(SCENES.lookLowAfter.none)
    } else await this.say(SCENES.brickAgain)
  }
  async onHatch() {
    const r = SKY.flags.rounds
    if (!(r.bell && r.cup && r.box)) {
      await this.say(SCENES.hatchEarly)
      return
    }
    this.control = false
    this.phase = "goingUnder"
    setState("hatch")
    const L = TM.L
    await this.mote.walkPath([{ x: L.hatch.i + 0.45, y: L.hatch.j + 0.4 }], 2.4)
    Sfx.ladder()
    this.mote.sprite.setMask(this.hatchMask())
    this.mote.setDepthOverride(-4990 - this.mote.screen().y)
    this.mote.shadow.setVisible(false)
    this.tween({ targets: this.mote, lift: -34, duration: T(1100), ease: "Sine.easeIn" })
    await this.ui.fade(1, T(1100))
    Sfx.ambience("keel", 2)
    this.ui.hud.sync(SKY.flags.rounds)
    this.scene.start("Keel")
  }

  // ================================================================ looking low
  startLook() {
    const cam = this.cameras.main
    this.looking = { t: 0, frag: -1, fragObj: null, base: { x: cam.scrollX, y: cam.scrollY } }
    this.camFollow = false
    this.tweens.killTweensOf(cam)
    const tx = cam.scrollX + 260,
      ty = this.islandBounds.y1 + 760
    this.looking.tw = this.tweens.add({ targets: cam, scrollX: tx, scrollY: ty, duration: T(3600), ease: "Cubic.easeInOut" })
    Sfx.ambience("none", 1.2)
    Sfx.lowTone(true)
    this.ui.tweens.killTweensOf(this.ui.vignette)
    this.ui.tweens.add({ targets: this.ui.vignette, alpha: 0.95, duration: T(10000), ease: "Sine.easeIn" })
    this.mote.faceTo(1)
    this.tweens.add({ targets: this.mote, hop: -1, duration: 400 })
    setState("lookLow")
  }
  updateLook(dt) {
    const lk = this.looking
    lk.t += dt
    const frags = SCENES.lookLow
    let idx = -1
    for (let k = 0; k < frags.length; k++) if (lk.t >= frags[k].t) idx = k
    if (idx !== lk.frag) {
      lk.frag = idx
      if (lk.fragObj) this.ui.fadeOut(lk.fragObj, 700)
      const t = this.ui.text(frags[idx].text, { y: 262, size: 21, italic: true, color: "#4a3d33", spacing: 0.6, depth: 650 })
      lk.fragObj = t
      this.ui.fadeIn(t, 900, 0.85)
    }
    const max = SCENES.lookLowMax
    if (lk.t >= max) return this.endLook("pulled")
    if (!Input.actHeld()) return this.endLook(lk.t >= 4 ? "long" : "short")
  }
  async endLook(kind) {
    const lk = this.looking
    this.looking = null
    const seconds = lk.t
    if (lk.fragObj) this.ui.fadeOut(lk.fragObj, 500)
    Sfx.lowTone(false)
    Sfx.ambience("top", 1.6)
    this.ui.tweens.killTweensOf(this.ui.vignette)
    this.ui.tweens.add({ targets: this.ui.vignette, alpha: 0, duration: 900 })
    this.tweens.killTweensOf(this.cameras.main)
    this.tweens.add({ targets: this.mote, hop: 0, duration: 300 })
    const counted = seconds >= 0.6
    const f = SKY.flags
    this.control = false
    if (kind === "pulled") {
      // Brick hauls you back from the rail
      this.brick.walkPath([{ x: TM.L.rail.i - 0.2, y: TM.L.rail.j + 0.2 }], 3.2)
    }
    const c = this.camFor(this.mote.screen().x, this.mote.screen().y)
    await this.camTo(c.x, c.y, T(kind === "pulled" ? 1300 : 950), "Cubic.easeOut")
    if (kind === "pulled") {
      await this.mote.walkPath([{ x: this.mote.pos.x - 0.45, y: this.mote.pos.y - 0.1 }], 2.2)
      this.mote.faceTo(-1)
    }
    if (counted) {
      f.lookSeconds = Math.max(1, Math.round(Math.min(seconds, SCENES.lookLowMax)))
      if (!f.lookAfterPlayed) {
        f.lookAfterPlayed = true
        this.brick.faceTo(this.mote.screen().x - this.brick.screen().x)
        this.mote.faceTo(this.brick.screen().x - this.mote.screen().x)
        await this.say(SCENES.lookLowAfter[kind])
      }
    }
    if (kind === "pulled") {
      const L = TM.L
      this.brick.walkPath([{ x: L.brick.i + 0.4, y: L.brick.j + 0.5 }], 2.6)
    }
    setState("rounds")
    this.control = true
    this.camFollow = true
  }

  // ================================================================ after
  async afterSquare() {
    setState("after")
    this.phase = "afterTalk"
    const L = TM.L
    const ui = this.ui
    ui.hud.show(true)
    ui.hud.sync(SKY.flags.rounds)
    this.mote.pos.x = L.hatch.i + 0.45
    this.mote.pos.y = L.hatch.j + 0.4
    this.mote.lift = -30
    this.mote.sprite.setMask(this.hatchMask())
    this.mote.setDepthOverride(-4990 - this.mote.screen().y)
    this.mote.shadow.setVisible(false)
    for (const a of [this.tunney, this.brick, this.harrow]) a.setLookUp(true)
    this.tunney.face = 1
    this.brick.face = -1
    const c = this.camFor(toScreen(19.4, 20.4).x, toScreen(19.4, 20.4).y, 300)
    this.cameras.main.setScroll(c.x, c.y)
    Sfx.ambience("top", 2)
    await ui.fade(0, T(1400))
    Sfx.ladder()
    await this.tween({ targets: this.mote, lift: 0, duration: T(1200), ease: "Sine.easeOut" })
    this.mote.setDepthOverride(0)
    this.mote.sprite.clearMask()
    this.mote.shadow.setVisible(true)
    await this.mote.walkPath([{ x: 20.6, y: 21.4 }], 2.4)
    this.mote.setView("back")
    this.mote.setLookUp(false)
    await this.wait(T(400))
    for (const a of [this.tunney, this.brick]) {
      a.setLookUp(false)
      a.faceTo(this.mote.screen().x - a.screen().x)
    }
    await this.say(SCENES.bellUp)
    for (const a of [this.tunney, this.brick, this.harrow]) a.setLookUp(true)
    this.mote.setView("front")
    this.phase = "home"
    setState("home")
    this.control = true
    this.camFollow = true
  }
  rainStart() {
    this.rain.start()
    Sfx.rain(true)
    for (const a of [this.tunney, this.brick, this.harrow, this.mote]) a.setLookUp(true)
    this.raining = true
  }
  async deputyArrives() {
    const dp = this.deputy
    const desk = toScreen(TM.L.desk.i + 0.5, TM.L.desk.j + 0.4)
    const land = toTile(desk.x, desk.y)
    dp.mode = "iso"
    dp.pos.x = land.tx + 4
    dp.pos.y = land.ty - 4
    dp.lift = 150
    dp.setVisible(true)
    dp.face = -1
    dp.flying = true
    this.deputyOn = null
    Sfx.coo()
    // swoop in
    await this.tween({ targets: dp.pos, x: land.tx, y: land.ty, duration: T(2200), ease: "Sine.easeInOut" })
    await this.wait(0)
    this.tweens.add({ targets: dp, lift: 31, duration: T(2200), ease: "Sine.easeOut" })
    await this.wait(T(2300))
    dp.flying = false
    Sfx.coo()
    for (const a of [this.tunney, this.brick]) a.setLookUp(false)
    this.tunney.faceTo(desk.x - this.tunney.screen().x)
  }
  async sail() {
    const cam = this.cameras.main
    const sf = 0.12
    const back = { x: cam.scrollX, y: cam.scrollY }
    const tgt = this.camFor(330, 740, 300)
    await this.camTo(tgt.x, tgt.y, T(2200))
    const sx = cam.scrollX * sf + 860,
      sy = cam.scrollY * sf + 300
    this.sailImg = this.bake((p) => {
      p.poly([0, -16, 9, -2, 0, 0], "#3a3531")
      p.poly([0, -16, -6, -3, 0, 0], "#2b2724")
      p.poly([-8, 0, 9, 0, 6, 3, -6, 3], "#2b2724")
    }, sx, sy, -26000)
    this.sailImg.setScrollFactor(sf).setAlpha(0)
    await this.tween({ targets: this.sailImg, alpha: 0.9, duration: T(2600) })
    this.tweens.add({ targets: this.sailImg, x: sx - 30, duration: 60000 })
    await this.wait(T(900))
    await this.camTo(back.x, back.y, T(1800))
  }

  async onFinalStep() {
    this.control = false
    this.phase = "risen"
    setState("stepRises")
    Sfx.humEnd(true)
    const img = this.stepImg
    this.risen = true
    this.tween({ targets: this, riseLift: 5, duration: T(2200), ease: "Sine.easeInOut" })
    await this.wait(T(900))
    await this.say(SCENES.stepRises)
    await this.wait(T(800))
    this.finalRise()
    void img
  }

  async finalRise() {
    setState("final")
    const ui = this.ui
    ui.hud.show(false)
    ui.hud.setPrompt(null)
    const cam = this.cameras.main
    this.camFollow = false
    this.tweens.add({ targets: cam, scrollY: -1900, duration: T(20000), ease: "Sine.easeInOut" })
    await this.wait(T(3200))
    const objs = []
    for (let i = 0; i < 4; i++) {
      const t = ui.text(RHYME[i], { y: 168 + i * 40, size: 26, spacing: 0.8, depth: 700, color: "#2f2a25" })
      objs.push(t)
      Sfx.motif(i)
      ui.fadeIn(t, 1400, 0.9)
      await this.wait(T(3000))
    }
    // the long rest where the fifth line would be
    await this.wait(T(4200))
    Sfx.motifResolve()
    for (const t of objs) ui.fadeOut(t, 1800)
    await this.wait(T(2200))
    Sfx.titleChord()
    const title = ui.text(CAPTIONS.title, { y: 214, size: 60, spacing: 22, depth: 700, color: "#2f2a25" })
    const ch = ui.text(CAPTIONS.chapter, { y: 284, size: 15, spacing: 5, depth: 700, color: "#2f2a25" })
    const nm = ui.text(CAPTIONS.chapterName, { y: 314, size: 26, italic: true, spacing: 1.2, depth: 700, color: "#2f2a25" })
    ui.fadeIn(title, 2600, 0.95)
    await this.wait(T(1600))
    ui.fadeIn(ch, 1600, 0.8)
    await this.wait(T(900))
    ui.fadeIn(nm, 1800, 0.95)
    await this.wait(T(5200))
    await ui.fade(1, T(2400), 0xfff1d6)
    for (const t of [title, ch, nm]) t.destroy()
    Sfx.rain(false)
    this.scene.start("End")
  }

  // ================================================================ input
  onTap(px, py) {
    if (!this.control || this.holding || this.looking || this.ui.dialogue.active) return
    const w = this.cameras.main.getWorldPoint(px, py)
    // tapping a character or object walks to it
    let tx, ty
    let best = null
    for (const it of this.inter) {
      if (!it.avail()) continue
      const s = toScreen(it.x, it.y)
      const d = Math.hypot(s.x - w.x, (s.y - 20 - w.y) * 1.2)
      if (d < 34 && (!best || d < best.d)) best = { it, d }
    }
    if (best) {
      tx = best.it.x
      ty = best.it.y
    } else {
      const t = toTile(w.x, w.y)
      tx = t.tx
      ty = t.ty
    }
    const path = this.grid.path(Math.floor(this.mote.pos.x), Math.floor(this.mote.pos.y), Math.floor(tx), Math.floor(ty))
    if (!path) return
    if (path.length) path[path.length - 1] = this.grid.passable(Math.floor(tx), Math.floor(ty)) ? { x: tx, y: ty } : path[path.length - 1]
    this.mote.walkPath(path, this.mote.speed)
    this.moved = true
  }

  // ================================================================ update
  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000
    const cam = this.cameras.main
    const ui = this.ui
    // skip the cold open with a held Esc
    if (this.skippable) {
      if (Input.isDown("Escape")) {
        this.escT += dt
        ui.skipBar.width = Math.min(1, this.escT / 0.6) * ui.skipHint.width
        if (this.escT >= 0.6) this.skipCold()
      } else if (this.escT > 0) {
        this.escT = 0
        ui.skipBar.width = 0
      }
    }
    // player movement
    if (this.control && !ui.dialogue.active && !this.holding && !this.looking) {
      const ax = Input.axis()
      if (ax.x || ax.y) {
        this.mote.stopPath()
        const l = Math.hypot(ax.x, ax.y)
        const td = screenDirToTile(ax.x / l, ax.y / l)
        const tl = Math.hypot(td.x, td.y)
        const sp = this.mote.speed * dt
        this.grid.move(this.mote.pos, (td.x / tl) * sp, (td.y / tl) * sp, 0.24)
        this.mote.moving = true
        this.mote.faceTo(ax.x)
        this.mote.setView(ax.y < 0 && Math.abs(ax.y) >= Math.abs(ax.x) * 0.5 ? "back" : "front")
        this.moved = true
      } else if (!this.mote._path) this.mote.moving = false
    } else if (!this.mote._path) this.mote.moving = false
    for (const k in this.actors) {
      const a = this.actors[k]
      if (a._path) a.stepPath(dt, this.grid)
    }
    // standing on the step lifts Mote by its height
    const L = TM.L
    const onStep = Math.floor(this.mote.pos.x) === L.step.i && Math.floor(this.mote.pos.y) === L.step.j
    const rl = this.riseLift || 0
    this.mote.baseLift = onStep ? 5 + rl + (this.risen ? Math.sin(time / 900) * 1.2 : 0) : 0
    if (this.risen) this.stepImg.y = this.stepBase - rl - Math.sin(time / 900) * 1.2
    // deputy riding on Thrum's hat
    if (this.deputyOn === "thrum" && this.thrum && !this.thrum.hidden) {
      const dp = this.deputy
      dp.pos.x = this.thrum.pos.x
      dp.pos.y = this.thrum.pos.y
      dp.lift = 55 + this.thrum.lift + this.thrum.hop
      dp.depthBias = 1 + this.thrum.depthBias
    }
    if (this.deputy && this.deputy.flying) {
      this.deputy.flapT = (this.deputy.flapT || 0) + dt * 12
      const fr = Math.floor(this.deputy.flapT) % 2 ? "w1" : "w-1"
      this.deputy.setView(fr)
    } else if (this.deputy && this.deputy.view !== "side") this.deputy.setView("side")
    for (const k in this.actors) this.actors[k].update(dt)
    // Brick's scarf tail
    if (this.brick && this.scarf) {
      const b = this.brick.sprite
      this.scarf.setPosition(b.x + 5 * this.brick.face, b.y - 14.5)
      this.scarf.setDepth(b.depth + 0.2)
      this.scarf.setScale(this.brick.face / R, 1 / R)
      this.scarf.angle = (-18 + Math.sin(time / 260) * 12) * this.brick.face
    }
    // bathtub bob (higher after)
    if (this.tub) {
      const amp = this.after ? 5 : 2
      const base = this.after ? 10 : 6
      const y = this.tubBase - base - Math.sin(time / 700) * amp
      this.tub.y = y
      this.tubShadow.setScale((2.3 - (this.tubBase - y) * 0.04) / R, (2.3 - (this.tubBase - y) * 0.04) / R)
    }
    for (const s of this.smokes) s.update(dt, 1)
    if (this.flock) this.flock.update(dt)
    for (const c of this.clouds) c.update(dt)
    this.rain.update(dt, cam)

    // interactions
    this.updateInteract(dt)

    // camera follow
    if (this.camFollow) {
      const s = this.mote.screen()
      const c = this.camFor(s.x, s.y)
      const k = 1 - Math.exp(-dt * 3.2)
      cam.scrollX += (c.x - cam.scrollX) * k
      cam.scrollY += (c.y - cam.scrollY) * k
    }
  }

  updateInteract(dt) {
    const ui = this.ui
    const f = SKY.flags
    if (this.looking) {
      this.updateLook(dt)
      ui.hud.setPrompt(null)
      return
    }
    const ringDraw = () => {
      const g = this.ring
      g.clear()
      if (this.ringP <= 0.001 || !this.ringAt) return
      const { x, y } = this.ringAt
      const a = Math.min(1, this.ringP * 4)
      g.lineStyle(3.2, 0x23201d, 0.28 * a)
      g.strokeCircle(x, y, 15)
      g.lineStyle(2.2, 0xfbf1dc, 0.45 * a)
      g.strokeCircle(x, y, 15)
      g.lineStyle(3, 0xf0b93a, 1 * a)
      g.beginPath()
      g.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.ringP), false)
      g.strokePath()
    }
    if (!this.control || ui.dialogue.active) {
      ui.hud.setPrompt(null)
      if (this.holding) this.releaseHold()
      if (this.ringP > 0 && !this.holding) this.ringP = Math.max(0, this.ringP - dt * 2)
      ringDraw()
      return
    }
    // first-time Tunney greeting on approach
    if (this.phase === "rounds" && !f.tunneyMet) {
      const d = Math.hypot(this.mote.pos.x - (TM.L.tunney.i + 0.5), this.mote.pos.y - (TM.L.tunney.j + 0.6))
      if (d < 2.3) {
        this.mote.stopPath()
        this.talkTunney()
        return
      }
    }
    // nearest available interactable
    let focus = null,
      bd = Infinity
    for (const it of this.inter) {
      if (!it.avail()) continue
      const d = Math.hypot(this.mote.pos.x - it.x, this.mote.pos.y - it.y)
      if (d < it.r && d < bd) {
        bd = d
        focus = it
      }
    }
    if (this.holding && focus !== this.holding) this.releaseHold()
    this.focus = focus
    let prompt = null
    if (focus) prompt = focus.prompt || (focus.kind === "mind" ? PROMPTS.mind : PROMPTS.talk)
    else if (this.showMoveHint && !this.moved) prompt = PROMPTS.move
    if (this.moved) this.showMoveHint = false
    ui.hud.setPrompt(this.holding ? PROMPTS.mind : prompt)

    if (focus && !this.holding) {
      if (focus.kind === "talk" && Input.takeAct()) {
        this.mote.stopPath()
        focus.run()
        return
      }
      if (focus.kind === "mind" && Input.actPressed()) {
        Input.takeAct()
        this.mote.stopPath()
        this.mote.moving = false
        this.holding = focus
        this.ringAt = focus.ring
        Sfx.humStart()
        this.dustT = 0
      }
      if (focus.kind === "look" && Input.actPressed()) {
        Input.takeAct()
        this.mote.stopPath()
        this.mote.moving = false
        this.startLook()
        return
      }
    }
    if (this.holding) {
      if (Input.actHeld()) {
        this.ringP += dt / (DEV.fast ? 0.4 : MIND_TIME)
        Sfx.humSet(Math.min(1, this.ringP))
        this.dustT -= dt
        if (this.dustT <= 0) {
          this.dustT = 0.09 - this.ringP * 0.05
          const d = this.holding.dust
          emitMote(this, d.x, d.y, 9400)
        }
        if (this.ringP >= 1) {
          const it = this.holding
          this.holding = null
          this.ringP = 1
          if (!(it.id === "step" && this.phase === "home")) Sfx.humEnd(true)
          this.tweens.add({ targets: this, ringP: 0, duration: 500, delay: 250 })
          // a little ring of dust on completion
          for (let k = 0; k < 10; k++) emitMote(this, it.dust.x, it.dust.y, 9400)
          it.done()
        }
      } else this.releaseHold()
    } else if (this.ringP > 0 && !this.tweens.isTweening(this)) {
      this.ringP = Math.max(0, this.ringP - dt * 1.6)
    }
    ringDraw()
  }
  releaseHold() {
    if (!this.holding) return
    this.holding = null
    Sfx.humEnd(false)
  }
}
