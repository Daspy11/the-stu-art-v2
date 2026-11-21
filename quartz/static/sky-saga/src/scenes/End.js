// End card: the Ledger of what you did this morning. E begins again.

import { END } from "../script.js"
import { R, C, Painter, place } from "../art.js"
import { Input } from "../input.js"
import { Sfx } from "../audio.js"
import { SKY, DEV, setState, resetFlags } from "../state.js"

export class End extends Phaser.Scene {
  constructor() {
    super({ key: "End" })
  }

  create() {
    SKY.scene = this
    setState("end")
    this.ui = this.scene.get("UI")
    const ui = this.ui
    const cam = this.cameras.main
    cam.setOrigin(0, 0).setZoom(R)
    cam.setBackgroundColor("#fff1d6")
    ui.hud.show(false)
    ui.hud.setPrompt(null)
    this.ready = false
    this.events.once("shutdown", () => {
      if (SKY.scene === this) SKY.scene = null
    })

    const ink = "#2f2a25"
    const objs = []
    const T = (str, y, o = {}) => {
      const t = this.add
        .text(480, y, str, {
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: `${o.size ?? 16}px`,
          color: o.color ?? ink,
          fontStyle: o.italic ? "italic" : o.weight ?? "normal",
          resolution: R,
        })
        .setOrigin(0.5)
        .setAlpha(0)
      if (o.spacing) t.setLetterSpacing(o.spacing)
      objs.push([t, o.alpha ?? 1])
      return t
    }
    // emblem: a tell whose weight points up, line slack beneath it
    const p = new Painter()
    p.rect(-40, -3, 80, 3, C.tar2)
    p.poly([-6, 0, 6, 0, 4, 5, -4, 5], C.slateLit)
    p.poly([0, 0, 6, 0, 4, 5, 0, 5], C.slateShade)
    const pts = []
    for (let k = 0; k <= 20; k++) {
      const t = k / 20
      pts.push(-3 + Math.sin(t * Math.PI) * -9 + t * 6, Math.sin(t * Math.PI) * 30)
    }
    p.line(pts, 0.9, "#8a7558")
    const em = place(this, p.bake(this, "__endEmblem"), 480, 54, 0).setAlpha(0)
    objs.push([em, 0.9])

    const f = SKY.flags
    T(END.heading.toUpperCase(), 118, { size: 12, spacing: 4, weight: "600", alpha: 0.75 })
    T(END.line, 152, { size: 26, italic: true })
    const rule = this.add.rectangle(480, 190, 120, 1, 0x8a7558, 1).setAlpha(0)
    objs.push([rule, 0.6])
    T(END.ledgerTitle, 220, { size: 15, italic: true, alpha: 0.8 })
    const lines = []
    if (f.mum !== null && f.mum !== undefined) lines.push(END.mum[f.mum])
    if (f.stone !== null && f.stone !== undefined) lines.push(END.stone[f.stone])
    if (f.tell !== null && f.tell !== undefined) lines.push(END.tell[f.tell])
    lines.push(f.lookSeconds === null ? END.lookedNever : END.looked(f.lookSeconds))
    lines.push(f.harrowMet ? END.harrowMet : END.harrowSkipped)
    lines.forEach((l, k) => T(l, 256 + k * 29, { size: 17, alpha: 0.92 }))
    this.ledgerLines = lines
    const again = T(END.again, 470, { size: 14, spacing: 1, alpha: 0.75 })
    window.__sky.ledger = lines.slice()

    ui.setFade(1, 0xfff1d6)
    ui.fade(0, DEV.fast ? 40 : 1600, 0xfff1d6)
    let d = DEV.fast ? 0 : 900
    for (const [o, a] of objs) {
      this.tweens.add({ targets: o, alpha: a, duration: DEV.fast ? 40 : 1200, delay: d, ease: "Sine.easeOut" })
      d += DEV.fast ? 0 : o === again ? 600 : 420
    }
    this.time.delayedCall(d + (DEV.fast ? 50 : 600), () => {
      this.ready = true
      this.tweens.add({ targets: again, alpha: 0.35, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
    })
  }

  onTap() {
    if (this.ready) this.restart()
  }

  restart() {
    if (!this.ready) return
    this.ready = false
    Sfx.stopAll(1.2)
    resetFlags()
    Input.clear()
    this.ui.hud.sync(SKY.flags.rounds)
    this.ui.fade(1, DEV.fast ? 40 : 1200).then(() => {
      this.scene.start("Town", { mode: "cold" })
    })
  }

  update() {
    if (this.ready && Input.takeAct()) this.restart()
  }
}
