// HUD: the ROUNDS slate (top-right), the contextual prompt (bottom centre),
// and a tiny drawn mute toggle (bottom-left).

import { ROUNDS } from "./script.js"
import { R } from "./art.js"
import { Sfx } from "./audio.js"
import { SKY } from "./state.js"

const F = "Fraunces, Georgia, serif"
const CHALK = "#ece6d8"

export class Hud {
  constructor(ui) {
    this.ui = ui
    const s = ui
    // ------------------------------------------------ rounds slate
    const x = 812,
      y = 14,
      w = 134,
      h = 132
    this.slate = s.add.container(0, 0).setDepth(400).setAlpha(0)
    const g = s.add.graphics()
    // timber frame (three tones: top lit, sides, shade)
    g.fillStyle(0x5e4b3b, 1)
    g.fillRoundedRect(x, y, w, h, 3)
    g.fillStyle(0xa5876a, 1)
    g.fillRoundedRect(x, y, w, h - 3, 3)
    g.fillStyle(0x8d7359, 1)
    g.fillRect(x + 3, y + 3, w - 6, h - 9)
    // slate
    g.fillStyle(0x333a43, 1)
    g.fillRect(x + 6, y + 6, w - 12, h - 15)
    g.fillStyle(0x3b434d, 1)
    g.fillRect(x + 6, y + 6, w - 12, 2)
    // hanging cord
    g.lineStyle(1, 0xd7c39a, 0.9)
    this.slate.add(g)
    this.title = s.add
      .text(x + w / 2, y + 21, "ROUNDS", { fontFamily: F, fontSize: "11px", color: CHALK, resolution: R, fontStyle: "600" })
      .setOrigin(0.5)
      .setLetterSpacing(3)
      .setAlpha(0.85)
    this.slate.add(this.title)
    const ug = s.add.graphics()
    ug.fillStyle(0xece6d8, 0.35)
    ug.fillRect(x + 30, y + 31, w - 60, 1)
    this.slate.add(ug)
    this.items = {}
    ROUNDS.forEach((r, k) => {
      const ty = y + 44 + k * 17.5
      const t = s.add.text(x + 38, ty, r.label, { fontFamily: F, fontSize: "13px", color: CHALK, resolution: R, fontStyle: "italic" }).setOrigin(0, 0.5).setAlpha(0.88)
      const tick = s.add.graphics()
      tick.setPosition(x + 24, ty)
      this.slate.add(t)
      this.slate.add(tick)
      this.items[r.id] = { t, tick, done: false, p: 0 }
    })
    this.visible = false

    // ------------------------------------------------ prompt pill
    this.prompt = s.add.container(480, 497).setDepth(450).setAlpha(0)
    this.pillG = s.add.graphics()
    this.promptText = s.add
      .text(0, 0, "", { fontFamily: F, fontSize: "15px", color: "#fbf1dc", resolution: R })
      .setOrigin(0.5)
      .setLetterSpacing(0.6)
    this.prompt.add(this.pillG)
    this.prompt.add(this.promptText)
    this.promptStr = null
    this.promptW = 0

    // ------------------------------------------------ mute toggle
    this.mute = s.add.graphics().setDepth(460).setAlpha(0)
    this.muteHover = false
    this.drawMute()
  }

  drawMute() {
    const g = this.mute
    g.clear()
    const x = 22,
      y = 520
    g.fillStyle(0xfbf1dc, 1)
    g.fillRect(x - 6, y - 3, 4, 6)
    g.fillTriangle(x - 3, y - 3, x + 3, y - 8, x + 3, y + 8)
    g.fillTriangle(x - 3, y - 3, x + 3, y + 8, x - 3, y + 3)
    g.lineStyle(1.4, 0xfbf1dc, 1)
    if (SKY.muted) {
      g.lineBetween(x + 7, y - 4, x + 14, y + 4)
      g.lineBetween(x + 14, y - 4, x + 7, y + 4)
    } else {
      g.beginPath()
      g.arc(x + 4, y, 6, -0.7, 0.7)
      g.strokePath()
      g.beginPath()
      g.arc(x + 4, y, 10, -0.75, 0.75)
      g.strokePath()
    }
  }
  overMute(px, py) {
    return px < 46 && py > 500
  }
  toggleMute() {
    SKY.muted = !SKY.muted
    Sfx.setMuted(SKY.muted)
    this.drawMute()
  }

  show(on) {
    if (this.visible === on) return
    this.visible = on
    this.ui.tweens.add({ targets: this.slate, alpha: on ? 1 : 0, duration: 700 })
    this.ui.tweens.add({ targets: this.mute, alpha: on ? 0.42 : 0, duration: 700 })
  }
  showMute(on) {
    this.ui.tweens.add({ targets: this.mute, alpha: on ? 0.42 : 0, duration: 500 })
  }

  sync(rounds) {
    for (const id in this.items) {
      const it = this.items[id]
      if (rounds[id] && !it.done) {
        it.done = true
        it.p = 1
        this.paintTick(it)
      }
      if (!rounds[id] && it.done) {
        it.done = false
        it.p = 0
        it.tick.clear()
        it.t.setAlpha(0.88)
      }
    }
  }

  tick(id) {
    const it = this.items[id]
    if (!it || it.done) return
    it.done = true
    it.p = 0
    Sfx.chalk()
    this.ui.tweens.add({
      targets: it,
      p: 1,
      duration: 420,
      ease: "Sine.easeOut",
      onUpdate: () => this.paintTick(it),
    })
    // little nudge of the slate
    this.ui.tweens.add({ targets: this.slate, y: 2, duration: 90, yoyo: true, ease: "Sine.easeOut" })
  }
  paintTick(it) {
    const g = it.tick
    g.clear()
    g.lineStyle(1.8, 0xece6d8, 0.95)
    const pts = [
      [-4, 0],
      [-1, 3.5],
      [6, -5],
    ]
    const p = it.p
    const l1 = 0.35
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    if (p < l1) {
      const t = p / l1
      g.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t)
    } else {
      g.lineTo(pts[1][0], pts[1][1])
      const t = (p - l1) / (1 - l1)
      g.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * t, pts[1][1] + (pts[2][1] - pts[1][1]) * t)
    }
    g.strokePath()
    it.t.setAlpha(0.88 - 0.38 * p)
  }

  setPrompt(str) {
    if (str === this.promptStr) return
    this.promptStr = str
    this.ui.tweens.killTweensOf(this.prompt)
    if (!str) {
      this.ui.tweens.add({ targets: this.prompt, alpha: 0, duration: 160 })
      return
    }
    this.promptText.setText(str)
    const w = Math.ceil(this.promptText.width) + 30
    this.promptW = w
    const g = this.pillG
    g.clear()
    g.fillStyle(0x23201d, 0.72)
    g.fillRoundedRect(-w / 2, -14, w, 28, 14)
    g.fillStyle(0xd7c39a, 0.6)
    g.fillRect(-w / 2 + 14, 13, w - 28, 1)
    this.prompt.setY(501)
    this.ui.tweens.add({ targets: this.prompt, alpha: 1, y: 497, duration: 220, ease: "Sine.easeOut" })
  }
  overPrompt(px, py) {
    return this.promptStr && this.prompt.alpha > 0.3 && Math.abs(px - 480) < this.promptW / 2 + 6 && Math.abs(py - 497) < 18
  }
}
