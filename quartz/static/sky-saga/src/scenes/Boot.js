// Bakes every shared texture, launches the UI layer, shows the start gate,
// then hands off to the right scene (honouring ?skip= for development).

import { C, Painter, mix, rng, R, canvasTexture } from "../art.js"
import { bakeCharacter, bakePortrait } from "../chars.js"
import { SKY, DEV, setState, resetFlags } from "../state.js"

const PORTRAIT_SCALE = { mote: 4.4, thrum: 2.45, tunney: 2.55, brick: 5, harrow: 3.6, deputy: 6.5 }

export function cloudShape(p, w, h, seed, pal) {
  const r = rng(seed)
  const bumps = []
  let x = -w / 2 + h * 0.3
  while (x < w / 2 - h * 0.3) {
    const t = (x + w / 2) / w
    const env = Math.sin(t * Math.PI)
    const rad = h * (0.28 + env * 0.45) * (0.75 + r() * 0.5)
    bumps.push([x, -rad * 0.55, rad])
    x += rad * (0.7 + r() * 0.5)
  }
  // body
  for (const [bx, by, br] of bumps) p.circle(bx, by, br, pal.body)
  p.rrect(-w / 2, -h * 0.32, w, h * 0.32, h * 0.16, pal.body)
  // cool shade on the upper right of each bump
  for (const [bx, by, br] of bumps) {
    p.clipPoly([bx, by - br - 2, bx + br + 2, by - br - 2, bx + br + 2, by + 2, bx, by + 2])
    p.circle(bx, by, br, pal.shade)
    p.unclip()
    p.circle(bx - br * 0.18, by + br * 0.08, br * 0.86, pal.body)
  }
  // warm, bright underside (light comes up)
  p.rrect(-w / 2 + h * 0.08, -h * 0.13, w - h * 0.16, h * 0.13, h * 0.06, pal.under)
}

export class Boot extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" })
  }

  create() {
    const reg = this.registry
    for (const who of ["mote", "thrum", "tunney", "brick", "harrow", "deputy"]) {
      reg.set(`char-${who}-day`, bakeCharacter(this, who, "day"))
      reg.set(`char-${who}-sil`, bakeCharacter(this, who, "sil"))
      reg.set(`portrait-${who}`, bakePortrait(this, who, PORTRAIT_SCALE[who]))
    }
    // shared bits
    const bake = (key, fn, o) => {
      const p = new Painter()
      fn(p)
      reg.set(key, p.bake(this, key, o))
    }
    bake("shadow", (p) => p.ellipse(0, 0, 10, 4.5, "#2a2018", 0.24), { symmetric: true })
    bake("puff", (p) => p.circle(0, 0, 8, "#efe8dc"), { symmetric: true })
    bake("puffShade", (p) => {
      p.circle(0, 0, 8, "#e2d9cc")
      p.circle(-1.6, 1.2, 6.4, "#f6f0e6")
    }, { symmetric: true })
    bake("mote-dust", (p) => p.poly([0, -1.4, 1.4, 0, 0, 1.4, -1.4, 0], "#e9e2d4"), { symmetric: true })
    bake("dust", (p) => p.circle(0, 0, 1, "#cdbfa8"), { symmetric: true })
    bake("drop", (p) => p.line([0, 0, 0, 9], 0.9, "#eef2f2", 0.9))
    bake("splash", (p) => {
      p.line([-2, 0, -3.5, -2], 0.6, "#eef2f2", 0.8)
      p.line([2, 0, 3.5, -2], 0.6, "#eef2f2", 0.8)
    }, { symmetric: true })
    bake("bird1", (p) => {
      p.poly([-7, -2.6, -2, -0.4, 0, 0.6, 2, -0.4, 7, -2.6, 2, 0.8, 0, 2, -2, 0.8], "#5c6068")
    }, { symmetric: true })
    bake("bird2", (p) => {
      p.poly([-6.5, 2.4, -2, -0.2, 0, 0.6, 2, -0.2, 6.5, 2.4, 2, 1.2, 0, 2, -2, 1.2], "#5c6068")
    }, { symmetric: true })
    bake("bird3", (p) => {
      p.poly([-7, -0.2, -2, -0.4, 0, 0.6, 2, -0.4, 7, -0.2, 2, 1, 0, 2, -2, 1], "#5c6068")
    }, { symmetric: true })
    // cloud kits (several shapes; palette for low deck and high deck)
    const low = { body: "#f7ead8", shade: "#e7d9c8", under: "#fffaf0" }
    const mid = { body: "#f3e2cf", shade: "#e2cfbc", under: "#fff6e6" }
    const high = { body: "#d7dee0", shade: "#c3ccd0", under: "#f1ebe2" }
    let k = 0
    for (const [w, h] of [
      [520, 70],
      [380, 56],
      [640, 84],
      [300, 44],
      [460, 62],
    ]) {
      bake(`cloudLow${k}`, (p) => cloudShape(p, w, h, 11 + k * 7, low), { symmetric: true })
      bake(`cloudMid${k}`, (p) => cloudShape(p, w * 0.8, h * 0.85, 41 + k * 5, mid), { symmetric: true })
      bake(`cloudHigh${k}`, (p) => cloudShape(p, w * 0.7, h * 0.55, 71 + k * 3, high), { symmetric: true })
      k++
    }
    // sky gradients (1px wide strips stretched; the sky is the only gradient)
    const sky = (key, stops) => {
      const t = canvasTexture(this, key, 4, 1024)
      const ctx = t.context
      const g = ctx.createLinearGradient(0, 0, 0, 1024)
      for (const [o, c] of stops) g.addColorStop(o, c)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 4, 1024)
      t.refresh()
    }
    // world sky, top of world (far above town) to bottom (far below)
    sky("skyWorld", [
      [0.0, "#fff1d4"],
      [0.12, "#f3e1c6"],
      [0.25, "#b9c3c4"],
      [0.33, "#8fa9b8"],
      [0.42, "#a9b7bb"],
      [0.5, "#ecd3b8"],
      [0.66, "#f8e4c8"],
      [0.82, "#fff4dc"],
      [1.0, "#fff8e8"],
    ])
    sky("skyKeel", [
      [0, "#6f7c84"],
      [0.25, "#c9b8a3"],
      [0.55, "#f3dcbd"],
      [1, "#fff6e2"],
    ])
    sky("skyLook", [
      [0, "#f6e3c8"],
      [0.5, "#fff1d8"],
      [1, "#fff9ea"],
    ])

    this.scene.launch("UI")
    this.time.delayedCall(30, () => this.begin())
  }

  async begin() {
    const ui = this.scene.get("UI")
    setState("gate")
    await ui.startGate()
    const skip = DEV.skip
    resetFlags()
    const f = SKY.flags
    if (skip === "rounds") {
      f.rounds.step = true
      this.scene.start("Town", { mode: "rounds" })
    } else if (skip === "keel") {
      Object.assign(f.rounds, { step: true, bell: true, cup: true, box: true })
      f.stone = 0
      f.tunneyMet = true
      this.scene.start("Keel")
    } else if (skip === "after") {
      Object.assign(f.rounds, { step: true, bell: true, cup: true, box: true, tells: true })
      Object.assign(f, { stone: 1, orrin: 0, mum: 0, up: 0, tunneyMet: true })
      this.scene.start("Town", { mode: "after" })
    } else if (skip === "end") {
      Object.assign(f.rounds, { step: true, bell: true, cup: true, box: true, tells: true })
      Object.assign(f, { stone: 0, orrin: 1, mum: 0, up: 1, tell: 2, lookSeconds: 4, harrowMet: true })
      this.scene.start("End")
    } else {
      this.scene.start("Town", { mode: "cold" })
    }
  }
}

void C
void mix
void R
