// Screen-space layer that sits above every game scene: dialogue, HUD, prompt,
// captions, fades, vignette and the start gate. Routes pointer input.

import { PROMPTS } from "../script.js"
import { R, FONT, canvasTexture } from "../art.js"
import { Dialogue } from "../dialogue.js"
import { Hud } from "../hud.js"
import { Input } from "../input.js"
import { Sfx } from "../audio.js"
import { SKY, DEV } from "../state.js"

export class UI extends Phaser.Scene {
  constructor() {
    super({ key: "UI" })
  }

  create() {
    const cam = this.cameras.main
    cam.setOrigin(0, 0).setZoom(R)
    cam.setScroll(0, 0)
    this.dialogue = new Dialogue(this)
    this.hud = new Hud(this)

    // look-low vignette (an effect, so a radial ramp is fine here)
    const vk = "__vignette"
    if (!this.textures.exists(vk)) {
      const t = canvasTexture(this, vk, 960, 540)
      const ctx = t.context
      const grd = ctx.createRadialGradient(480, 270, 140, 480, 270, 560)
      grd.addColorStop(0, "rgba(40,30,22,0)")
      grd.addColorStop(0.55, "rgba(40,30,22,0.12)")
      grd.addColorStop(1, "rgba(30,22,16,0.78)")
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, 960, 540)
      t.refresh()
    }
    this.vignette = this.add.image(0, 0, vk).setOrigin(0).setDisplaySize(960, 540).setDepth(300).setAlpha(0)

    this.fadeRect = this.add.rectangle(0, 0, 960, 540, 0x0d0c0b, 1).setOrigin(0).setDepth(900)
    this.skipHint = this.add
      .text(944, 524, PROMPTS.skip, { fontFamily: FONT, fontSize: "12px", color: "#fbf1dc", resolution: R })
      .setOrigin(1, 1)
      .setDepth(950)
      .setAlpha(0)
      .setLetterSpacing(0.6)
    this.skipBar = this.add.rectangle(944, 528, 0, 1, 0xfbf1dc, 0.7).setOrigin(1, 0.5).setDepth(950)

    // pointer routing
    this.input.on("pointerdown", (p) => {
      const x = p.x / R,
        y = p.y / R
      if (this.gate) {
        this.gate()
        return
      }
      if (this.hud.mute.alpha > 0.1 && this.hud.overMute(x, y)) {
        this.hud.toggleMute()
        return
      }
      if (this.dialogue.pointerDown(x, y)) return
      if (this.hud.overPrompt(x, y)) {
        Input.pointerPressed = true
        Input.pointerHold = true
        return
      }
      if (SKY.scene && SKY.scene.onTap) SKY.scene.onTap(p.x, p.y)
    })
    this.input.on("pointerup", () => {
      Input.pointerHold = false
    })
    this.input.on("pointermove", (p) => {
      this.dialogue.pointerMove(p.x / R, p.y / R)
      if (p.isDown && Input.pointerHold && !this.hud.overPrompt(p.x / R, p.y / R)) Input.pointerHold = false
    })
    Input.onKey((code) => {
      if (code === "KeyM" && SKY.unlocked) this.hud.toggleMute()
    })
    this.game.events.on("poststep", () => Input.endStep())
  }

  // ---------------------------------------------------------------- helpers
  wait(ms) {
    return new Promise((res) => this.time.delayedCall(ms, res))
  }
  tween(cfg) {
    return new Promise((res) => this.tweens.add({ ...cfg, onComplete: () => res() }))
  }
  text(str, o = {}) {
    const t = this.add
      .text(o.x ?? 480, o.y ?? 270, str, {
        fontFamily: FONT,
        fontSize: `${o.size ?? 24}px`,
        color: o.color ?? "#fbf1dc",
        fontStyle: o.italic ? `italic ${o.weight ?? ""}`.trim() : `${o.weight ?? "normal"}`,
        resolution: R,
        align: o.align ?? "center",
        wordWrap: o.wrap ? { width: o.wrap } : undefined,
        lineSpacing: o.lineSpacing ?? 0,
      })
      .setOrigin(o.ox ?? 0.5, o.oy ?? 0.5)
      .setDepth(o.depth ?? 600)
      .setAlpha(o.alpha ?? 0)
    if (o.spacing) t.setLetterSpacing(o.spacing)
    if (o.shadow) t.setShadow(0, 1, o.shadow, 6, false, true)
    return t
  }
  fadeIn(obj, ms = 800, to = 1) {
    return this.tween({ targets: obj, alpha: to, duration: DEV.fast ? 40 : ms, ease: "Sine.easeInOut" })
  }
  fadeOut(obj, ms = 800, destroy = true) {
    return this.tween({ targets: obj, alpha: 0, duration: DEV.fast ? 40 : ms, ease: "Sine.easeInOut" }).then(() => destroy && obj.destroy())
  }
  fade(to, ms = 800, color = 0x0d0c0b) {
    this.fadeRect.setFillStyle(color, 1)
    this.tweens.killTweensOf(this.fadeRect)
    return this.tween({ targets: this.fadeRect, alpha: to, duration: DEV.fast ? 40 : ms, ease: "Sine.easeInOut" })
  }
  setFade(a, color = 0x0d0c0b) {
    this.tweens.killTweensOf(this.fadeRect)
    this.fadeRect.setFillStyle(color, 1)
    this.fadeRect.setAlpha(a)
  }
  say(lines, opts) {
    return this.dialogue.play(lines, opts)
  }

  startGate() {
    return new Promise((resolve) => {
      this.setFade(1)
      const t = this.text(PROMPTS.start, { size: 15, spacing: 1.5, depth: 960, alpha: 0 })
      this.fadeIn(t, 900, 0.82)
      const pulse = this.tweens.add({ targets: t, alpha: 0.45, duration: 1400, yoyo: true, repeat: -1, delay: 900, ease: "Sine.easeInOut" })
      const go = () => {
        if (!this.gate) return
        this.gate = null
        pulse.stop()
        Sfx.unlock()
        SKY.unlocked = true
        Sfx.setMuted(SKY.muted)
        this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() })
        Input.clear()
        resolve()
      }
      this.gate = go
      const onKey = () => go()
      Input.onKey(onKey)
    })
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000
    this.dialogue.update(dt)
  }
}
