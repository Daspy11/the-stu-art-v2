// Characters in the world: two-frame idle bob, hop when walking, facing,
// look-up, and promise-based walking (iso tile paths or side-view x targets).

import { R } from "./art.js"
import { toScreen } from "./iso.js"
import { Sfx } from "./audio.js"

export class Actor {
  constructor(scene, who, o = {}) {
    this.scene = scene
    this.who = who
    this.variant = o.variant || "day"
    this.mode = o.mode || "iso" // iso | side
    this.views = scene.registry.get(`char-${who}-${this.variant}`)
    this.pos = { x: o.x ?? 0, y: o.y ?? 0 } // iso: tile space; side: world px (y = ground)
    this.speed = o.speed ?? (this.mode === "iso" ? 3.3 : 120)
    this.view = who === "deputy" ? "side" : "front"
    this.face = o.face ?? 1
    this.lookUp = false
    this.lift = 0 // extra height (px)
    this.hop = 0
    this.walkT = 0
    this.idleT = Math.random() * 2
    this.moving = false
    this.depthBias = o.depthBias ?? 0
    this.stepSurface = o.surface || (() => "plank")
    this.hidden = false
    this.shadow = scene.add.image(0, 0, "shadow").setScale(1 / R)
    const v = this.views[this.view]
    this.sprite = scene.add.image(0, 0, v.key).setScale(1 / R)
    if (o.noShadow) this.shadow.setVisible(false)
    this.shadowScale = o.shadowScale ?? (who === "thrum" ? 1.9 : who === "tunney" ? 0.9 : who === "deputy" ? 0.5 : 1.05)
    this.applyView()
    this.update(0)
  }
  applyView() {
    const name = this.lookUp && this.who !== "deputy" ? "up" : this.view
    const v = this.views[name] || this.views.front
    this.sprite.setTexture(v.key)
    this.sprite.setOrigin(-v.ox / v.w, -v.oy / v.h)
  }
  setView(view) {
    if (this.view !== view) {
      this.view = view
      this.applyView()
    }
  }
  setLookUp(on) {
    this.lookUp = on
    this.applyView()
  }
  faceTo(dx) {
    if (dx > 0.01) this.face = 1
    else if (dx < -0.01) this.face = -1
  }
  screen() {
    if (this.mode === "iso") {
      const s = toScreen(this.pos.x, this.pos.y)
      return { x: s.x, y: s.y }
    }
    return { x: this.pos.x, y: this.pos.y }
  }
  setVisible(v) {
    this.hidden = !v
    this.sprite.setVisible(v)
    this.shadow.setVisible(v && !this.noShadow)
  }
  update(dt) {
    this.idleT += dt
    const s = this.screen()
    let bobY = 0,
      sx = 1,
      sy = 1
    if (this.moving) {
      this.walkT += dt * (this.mode === "iso" ? 9.5 : 8.5)
      const ph = Math.sin(this.walkT)
      const h = Math.abs(ph)
      bobY = -h * (this.who === "thrum" ? 1.6 : 2.6)
      if (this.lastPh !== undefined && Math.sign(ph) !== Math.sign(this.lastPh)) {
        if (this.footsteps !== false && this.who !== "deputy") Sfx.step(this.stepSurface(this))
      }
      this.lastPh = ph
      sy = 1 + h * 0.03
      sx = 1 - h * 0.02
    } else {
      // two-frame idle bob
      const f = Math.floor(this.idleT / 0.55) % 2
      sy = f ? 0.975 : 1
      sx = f ? 1.015 : 1
      this.lastPh = undefined
    }
    this.sprite.setPosition(s.x, s.y + bobY - this.lift - (this.baseLift || 0) - this.hop)
    this.sprite.setScale((sx / R) * this.face, sy / R)
    this.shadow.setPosition(s.x, s.y + 0.5)
    const sh = this.shadowScale * (1 - Math.min(0.5, (this.lift + this.hop) / 60))
    this.shadow.setScale(sh / R, sh / R)
    const d = s.y + this.depthBias
    this.sprite.setDepth(d)
    this.shadow.setDepth(d - 0.5)
  }
  setDepthOverride(d) {
    this.depthBias = d
  }

  // iso: follow a list of tile-space points; side: walk to x
  walkPath(pts, speed) {
    return new Promise((resolve) => {
      this._path = pts.slice()
      this._pathSpeed = speed || this.speed
      this._pathDone = resolve
    })
  }
  walkTo(x, y, speed) {
    return this.walkPath([{ x, y: y ?? this.pos.y }], speed)
  }
  stopPath() {
    this._path = null
    this.moving = false
    const r = this._pathDone
    this._pathDone = null
    if (r) r()
  }
  stepPath(dt, grid) {
    if (!this._path) return false
    const tgt = this._path[0]
    if (!tgt) {
      this.stopPath()
      return false
    }
    const dx = tgt.x - this.pos.x,
      dy = tgt.y - this.pos.y
    const d = Math.hypot(dx, dy)
    const step = this._pathSpeed * dt
    if (d <= step) {
      this.pos.x = tgt.x
      this.pos.y = tgt.y
      this._path.shift()
      if (!this._path.length) {
        this.stopPath()
        return true
      }
    } else {
      this.pos.x += (dx / d) * step
      this.pos.y += (dy / d) * step
    }
    this.moving = true
    if (this.mode === "iso") {
      const sdx = (dx - dy) * 32,
        sdy = (dx + dy) * 16
      this.faceTo(sdx)
      if (this.who !== "deputy") this.setView(sdy < -Math.abs(sdx) * 0.35 ? "back" : "front")
    } else this.faceTo(dx)
    void grid
    return true
  }
  destroy() {
    this.sprite.destroy()
    this.shadow.destroy()
  }
}
