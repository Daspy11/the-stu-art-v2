// Canvas-backed text with *italic* runs, word wrap, and partial reveal.
// Renders at 2x into its own texture so it stays sharp under the 2x camera.

import { R, FONT, canvasTexture } from "./art.js"

let n = 0

export class RichText {
  constructor(scene, x, y, w, h, o = {}) {
    this.scene = scene
    this.w = w
    this.h = h
    this.size = o.size ?? 19
    this.lineH = o.lineH ?? Math.round(this.size * 1.4)
    this.color = o.color ?? "#fbf1dc"
    this.align = o.align ?? "left"
    this.valign = o.valign ?? "top"
    this.weight = o.weight ?? 400
    this.key = `__rt${n++}`
    this.tex = canvasTexture(scene, this.key, w * R, h * R)
    this.img = scene.add.image(x, y, this.key).setOrigin(0, 0).setScale(1 / R)
    this.runs = []
    this.total = 0
    this.shown = -1
  }
  font(italic, size = this.size) {
    return `${italic ? "italic " : ""}${this.weight} ${size}px ${FONT}`
  }
  // parse "*a* b" into chars with italic flags; italicAll inverts (narration)
  setText(str, italicAll = false) {
    const ctx = this.tex.context
    const chars = []
    let it = false
    for (const ch of str) {
      if (ch === "*") {
        it = !it
        continue
      }
      chars.push({ ch, it: italicAll ? !it : it })
    }
    // words
    const words = []
    let cur = null
    for (const c of chars) {
      if (c.ch === " ") {
        if (cur) words.push(cur)
        cur = null
        words.push(null) // space marker
        continue
      }
      if (!cur) cur = []
      cur.push(c)
    }
    if (cur) words.push(cur)
    let size = this.size
    let lines
    // shrink if it would not fit
    for (;;) {
      lines = this._wrap(ctx, words, size)
      const lh = Math.round(size * 1.4)
      if (lines.length * lh <= this.h + 2 || size <= 14) {
        this.lineHUsed = lh
        break
      }
      size -= 1
    }
    this.sizeUsed = size
    // positioned runs with char indices
    this.runs = []
    let idx = 0
    const lh = this.lineHUsed
    const totalH = lines.length * lh
    const y0 = this.valign === "middle" ? Math.max(0, (this.h - totalH) / 2) : 0
    lines.forEach((line, li) => {
      let x = this.align === "center" ? (this.w - line.width) / 2 : 0
      line.items.forEach((item, k) => {
        if (item === null) {
          if (k > 0 && k < line.items.length - 1) {
            ctx.font = this.font(false, size)
            x += ctx.measureText(" ").width
          }
          idx += 1
          return
        }
        for (const run of item.runs) {
          this.runs.push({ text: run.text, it: run.it, x, y: y0 + li * lh, start: idx })
          x += run.w
          idx += run.text.length
        }
      })
      // the space that wrapped away still counts as a char
    })
    this.total = idx
    this.lines = lines.length
    this.shown = -1
    this.charList = chars.map((c) => c.ch)
    this.draw(0)
    return this
  }
  _wrap(ctx, words, size) {
    const measured = words.map((wd) => {
      if (!wd) return null
      const runs = []
      let r = null
      for (const c of wd) {
        if (!r || r.it !== c.it) {
          r = { it: c.it, text: "" }
          runs.push(r)
        }
        r.text += c.ch
      }
      let w = 0
      for (const r of runs) {
        ctx.font = this.font(r.it, size)
        r.w = ctx.measureText(r.text).width
        w += r.w
      }
      return { runs, w }
    })
    ctx.font = this.font(false, size)
    const sp = ctx.measureText(" ").width
    const lines = []
    let line = { items: [], width: 0 }
    for (const m of measured) {
      if (m === null) {
        line.items.push(null)
        continue
      }
      const add = (line.width > 0 ? sp : 0) + m.w
      if (line.width > 0 && line.width + add > this.w) {
        // trailing space marker stays at line end (counts as a char)
        lines.push(line)
        line = { items: [], width: 0 }
      }
      line.width += (line.width > 0 ? sp : 0) + m.w
      line.items.push(m)
    }
    lines.push(line)
    // normalise: leading null in a line belongs to the previous line's end
    for (let i = 1; i < lines.length; i++) {
      while (lines[i].items[0] === null) {
        lines[i].items.shift()
        lines[i - 1].items.push(null)
      }
    }
    return lines
  }
  draw(n) {
    if (n === this.shown) return
    this.shown = n
    const ctx = this.tex.context
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.tex.width, this.tex.height)
    ctx.setTransform(R, 0, 0, R, 0, 0)
    ctx.fillStyle = this.color
    ctx.textBaseline = "alphabetic"
    const size = this.sizeUsed
    for (const r of this.runs) {
      if (r.start >= n) break
      const t = r.start + r.text.length <= n ? r.text : r.text.slice(0, n - r.start)
      ctx.font = this.font(r.it, size)
      ctx.fillText(t, r.x, r.y + size * 1.02)
    }
    this.tex.refresh()
  }
  charAt(i) {
    return this.charList[i] ?? ""
  }
  setVisible(v) {
    this.img.setVisible(v)
    return this
  }
  setAlpha(a) {
    this.img.setAlpha(a)
    return this
  }
  setPosition(x, y) {
    this.img.setPosition(x, y)
    return this
  }
  setDepth(d) {
    this.img.setDepth(d)
    return this
  }
  destroy() {
    this.img.destroy()
    this.scene.textures.remove(this.key)
  }
}
