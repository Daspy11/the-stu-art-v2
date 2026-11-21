// Dialogue box: speaker lines, narration, choices, cues and waits.
// Lives in the UI scene. play(lines, { onCue }) resolves when the lines are done.

import { NAMES, PROMPTS } from "./script.js"
import { C, R, font, place } from "./art.js"
import { RichText } from "./richtext.js"
import { Input } from "./input.js"
import { Sfx } from "./audio.js"
import { SKY, DEV } from "./state.js"

const BOX = { x: 40, y: 374, w: 880, h: 154 }
const CPS = 35

export class Dialogue {
  constructor(ui) {
    this.ui = ui
    const s = ui
    this.root = s.add.container(0, 0).setDepth(500).setAlpha(0)
    const g = s.add.graphics()
    // tarred timber box with a rope rule
    g.fillStyle(0x2b2724, 0.97)
    g.fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 3)
    g.fillStyle(0x3a3531, 1)
    g.fillRect(BOX.x, BOX.y + BOX.h - 4, BOX.w, 4)
    g.fillStyle(0x23201d, 0.5)
    g.fillRect(BOX.x, BOX.y + BOX.h - 1, BOX.w, 1)
    g.fillStyle(0xd7c39a, 0.9)
    g.fillRect(BOX.x + 14, BOX.y + 7, BOX.w - 28, 1)
    this.root.add(g)
    this.portraits = {}
    for (const who of ["mote", "thrum", "tunney", "brick", "harrow", "deputy"]) {
      const b = s.textures.get(`portrait-${who}`)
      if (!b || b.key === "__MISSING") continue
      const info = s.registry.get(`portrait-${who}`)
      const img = place(s, info, BOX.x + 86, BOX.y + BOX.h - 10, 0).setVisible(false)
      this.portraits[who] = img
      this.root.add(img)
    }
    this.name = s.add
      .text(BOX.x + 172, BOX.y + 19, "", { fontFamily: "Fraunces, Georgia, serif", fontSize: "12px", color: "#d7c39a", resolution: R, fontStyle: "600" })
      .setLetterSpacing(2.6)
    this.root.add(this.name)
    this.text = new RichText(s, BOX.x + 172, BOX.y + 40, 680, 108, { size: 19 })
    this.narr = new RichText(s, BOX.x + 70, BOX.y + 18, BOX.w - 140, BOX.h - 34, { size: 19, align: "center", valign: "middle" })
    this.root.add(this.text.img)
    this.root.add(this.narr.img)
    this.next = s.add
      .text(BOX.x + BOX.w - 26, BOX.y + BOX.h - 26, PROMPTS.next, { fontFamily: "Fraunces, Georgia, serif", fontSize: "13px", color: "#d7c39a", resolution: R, fontStyle: "600" })
      .setOrigin(0.5)
      .setAlpha(0)
    this.root.add(this.next)
    // choices
    this.choiceTexts = []
    for (let k = 0; k < 3; k++) {
      const t = s.add.text(BOX.x + 196, BOX.y + 34 + k * 34, "", { fontFamily: "Fraunces, Georgia, serif", fontSize: "19px", color: "#fbf1dc", resolution: R })
      t.setVisible(false)
      this.choiceTexts.push(t)
      this.root.add(t)
    }
    this.marker = s.add.graphics()
    this.marker.fillStyle(0xf0b93a, 1)
    this.marker.fillPoints([{ x: 0, y: -5 }, { x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 }], true)
    this.marker.setVisible(false)
    this.root.add(this.marker)

    this.active = false
    this.mode = null
    this.visible = false
  }

  show(on) {
    if (on === this.visible) return
    this.visible = on
    this.ui.tweens.killTweensOf(this.root)
    this.ui.tweens.add({ targets: this.root, alpha: on ? 1 : 0, duration: on ? 160 : 200, ease: "Sine.easeOut" })
    if (on) this.root.y = 0
  }

  async play(lines, opts = {}) {
    this.active = true
    SKY.dialogue = true
    try {
      await this._run(lines, opts)
    } finally {
      this.show(false)
      this.active = false
      SKY.dialogue = false
      this.mode = null
      Input.clear()
    }
  }

  async _run(lines, opts) {
    for (const line of lines) {
      if (line.cue) {
        this.show(false)
        if (opts.onCue) await opts.onCue(line.cue)
      } else if (line.wait) {
        this.show(false)
        await this.ui.wait(DEV.fast ? 80 : line.wait)
      } else if (line.choice) {
        const idx = await this.choose(line.options.map((o) => o.label))
        SKY.flags[line.choice] = idx
        if (opts.onChoice) opts.onChoice(line.choice, idx)
        const reply = line.options[idx].reply || []
        if (reply.length) await this._run(reply, opts)
      } else if (line.text !== undefined) {
        if (opts.onLine) opts.onLine(line)
        await this.say(line.who, line.text)
      }
    }
  }

  _portrait(who) {
    for (const k in this.portraits) this.portraits[k].setVisible(k === who)
    const img = this.portraits[who]
    if (img) {
      this.ui.tweens.killTweensOf(img)
      img.y = BOX.y + BOX.h - 6
      img.setScale(1 / R)
      this.ui.tweens.add({ targets: img, y: BOX.y + BOX.h - 10, duration: 220, ease: "Back.easeOut" })
    }
  }

  say(who, str) {
    return new Promise((resolve) => {
      const isNarr = who === "narr"
      this.mode = "line"
      this.who = who
      this.choiceTexts.forEach((t) => t.setVisible(false))
      this.marker.setVisible(false)
      if (isNarr) {
        this._portrait(null)
        this.name.setText("")
        this.text.setVisible(false)
        this.narr.setVisible(true).setText(str, true)
        this.rt = this.narr
      } else {
        this._portrait(who)
        this.name.setText((NAMES[who] || "").toUpperCase())
        this.narr.setVisible(false)
        this.text.setVisible(true).setText(str, false)
        this.rt = this.text
      }
      this.show(true)
      this.next.setAlpha(0)
      this.revealed = DEV.fast ? this.rt.total : 0
      this.rt.draw(this.revealed)
      this.clock = 0
      this.nextAt = 0
      this.blipCount = 0
      this.lineAge = 0
      this.resolve = resolve
      if (who === "deputy") Sfx.blip("deputy")
    })
  }

  choose(labels) {
    return new Promise((resolve) => {
      this.mode = "choice"
      this._portrait("mote")
      this.name.setText("")
      this.text.setVisible(false)
      this.narr.setVisible(false)
      this.next.setAlpha(0)
      this.labels = labels
      const top = BOX.y + (BOX.h - labels.length * 34) / 2 + 2
      this.choiceTexts.forEach((t, k) => {
        t.setVisible(k < labels.length)
        if (k < labels.length) {
          t.setText(labels[k])
          t.setFontStyle(labels[k].startsWith("(") ? "italic" : "normal")
          t.setY(top + k * 34)
        }
      })
      this.sel = 0
      this._paintChoice()
      this.marker.setVisible(true)
      this.show(true)
      this.lineAge = 0
      this.resolveChoice = resolve
    })
  }

  _paintChoice() {
    this.choiceTexts.forEach((t, k) => {
      t.setAlpha(k === this.sel ? 1 : 0.5)
      t.setX(BOX.x + 196 + (k === this.sel ? 8 : 0))
    })
    const t = this.choiceTexts[this.sel]
    this.marker.setPosition(BOX.x + 192, t.y + 13)
  }

  // pointer support
  pointerDown(x, y) {
    if (!this.active) return false
    if (this.mode === "choice") {
      const k = this.choiceAt(x, y)
      if (k >= 0) {
        this.sel = k
        this._paintChoice()
        this._confirm()
      }
      return true
    }
    if (this.mode === "line") this._advance()
    return true
  }
  pointerMove(x, y) {
    if (this.mode !== "choice") return
    const k = this.choiceAt(x, y)
    if (k >= 0 && k !== this.sel) {
      this.sel = k
      this._paintChoice()
      Sfx.select()
    }
  }
  choiceAt(x, y) {
    for (let k = 0; k < this.labels.length; k++) {
      const t = this.choiceTexts[k]
      if (x > BOX.x + 150 && x < BOX.x + BOX.w - 20 && y > t.y - 6 && y < t.y + 30) return k
    }
    return -1
  }

  _advance() {
    if (this.lineAge < 0.12) return
    if (this.revealed < this.rt.total) {
      this.revealed = this.rt.total
      this.rt.draw(this.revealed)
      return
    }
    const r = this.resolve
    this.resolve = null
    this.mode = "wait"
    if (r) r()
  }
  _confirm() {
    if (this.lineAge < 0.15) return
    Sfx.confirm()
    const r = this.resolveChoice
    this.resolveChoice = null
    this.mode = "wait"
    this.marker.setVisible(false)
    if (r) r(this.sel)
  }

  update(dt) {
    if (!this.active) return
    this.lineAge += dt
    if (this.mode === "line") {
      if (Input.takeAct()) this._advance()
      if (this.mode !== "line") return
      if (this.revealed < this.rt.total) {
        this.clock += dt
        while (this.revealed < this.rt.total && this.clock >= this.nextAt) {
          const ch = this.rt.charAt(this.revealed)
          this.revealed++
          let d = 1 / CPS
          if (".!?".includes(ch)) d += this.rt.charAt(this.revealed) === "." ? 0.12 : 0.2
          else if (",;:—".includes(ch)) d += 0.1
          this.nextAt += d
          if (ch !== " " && this.who !== "narr" && this.who !== "deputy") {
            if (this.blipCount++ % 3 === 0) Sfx.blip(this.who)
          }
        }
        this.rt.draw(this.revealed)
      } else {
        this.next.setAlpha(0.55 + 0.45 * Math.sin(this.lineAge * 4))
      }
    } else if (this.mode === "choice") {
      if (Input.upPressed()) {
        this.sel = (this.sel + this.labels.length - 1) % this.labels.length
        this._paintChoice()
        Sfx.select()
      }
      if (Input.downPressed()) {
        this.sel = (this.sel + 1) % this.labels.length
        this._paintChoice()
        Sfx.select()
      }
      if (Input.takeAct()) this._confirm()
    }
  }
}
