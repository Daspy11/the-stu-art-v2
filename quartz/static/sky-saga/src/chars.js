// People: chess-piece simple. Rounded coat, round head, two dot eyes, no mouth.
// Every draw function puts the feet at (0,0). opts:
//   view: "front" | "back"   look: -1..1 (eye shift)   up: eyes raised
// Light comes up: the right side is in shade, the hem catches a warm rim.

import { C, Painter, mix, R } from "./art.js"

const SKIN = "#e8cdaa"
const SKIN_SHADE = "#cfae8a"
const HAIR = "#2b2421"

function eyes(p, x, y, look, up, spread = 2.1, r = 0.95) {
  const dx = look * 1.2,
    dy = up ? -1.3 : 0
  p.circle(x - spread + dx, y + dy, r, C.inkText)
  p.circle(x + spread + dx, y + dy, r, C.inkText)
}

function head(p, x, y, r, o, hair = true) {
  p.circle(x, y, r, SKIN)
  p.clipPoly([x - r - 1, y - r - 1, x + r + 1, y - r - 1, x + r + 1, y + r + 1, x - r - 1, y + r + 1])
  p.ellipse(x + r * 0.55, y + r * 0.1, r * 0.6, r * 1.1, SKIN_SHADE)
  p.unclip()
  if (o.view === "back") {
    if (hair) p.circle(x, y, r, HAIR)
    return
  }
}

// -------------------------------------------------------------- Mote
export function drawMote(p, o = {}) {
  const look = o.look || 0
  const coat = [-5.2, -19, 5.2, -19, 9, -9, 10.5, -1.2, 0, 0.6, -10.5, -1.2, -9, -9]
  // sleeves hang past the hands
  p.blob([-9.5, -15, -6, -16.5, -5.6, -8, -8.6, -6.4, -10.6, -8.5], C.wax)
  p.blob([9.5, -15, 6, -16.5, 5.6, -8, 8.6, -6.4, 10.6, -8.5], C.waxShade)
  p.blob(coat, C.wax)
  p.clipBlob(coat)
  p.poly([2.2, -24, 14, -24, 14, 2, 4.2, 2], C.waxShade)
  p.poly([-14, -2.6, 14, -2.6, 14, 3, -14, 3], C.glow)
  p.unclip()
  // collar
  p.ellipse(0, -18.6, 5, 1.6, C.waxShade)
  head(p, 0, -24, 5.6, o)
  if (o.view === "back") {
    p.circle(0, -24.4, 5.9, HAIR)
  } else {
    // bowl of hair
    p.ellipse(0, -25.2, 6.1, 5.2, HAIR, 1, 0, Math.PI, Math.PI * 2)
    p.poly([-6.1, -25.4, 6.1, -25.4, 6.1, -24.2, -6.1, -24.2], HAIR)
    eyes(p, 0, -22.4, look, o.up, 2.1)
  }
}

// -------------------------------------------------------------- Thrum
export function drawThrum(p, o = {}) {
  const look = o.look || 0
  const coat = [-17, -1, -18, -18, -14, -33, -5, -39, 5, -39, 14, -33, 18, -18, 17, -1, 0, 0.8]
  p.blob(coat, C.felt)
  p.clipBlob(coat)
  p.poly([5, -44, 22, -44, 22, 3, 8, 3], C.feltShade)
  p.poly([-22, -3.2, 22, -3.2, 22, 4, -22, 4], mix(C.felt, C.glow, 0.45))
  // coat seam
  p.poly([-0.6, -30, 0.6, -30, 0.6, -2, -0.6, -2], C.feltShade, 0.6)
  p.unclip()
  // tiny bell at the belt
  p.line([-6, -18, -6, -16], 0.6, C.rope)
  p.ellipse(-6, -14.2, 1.7, 2, C.wax)
  p.ellipse(-6, -12.6, 2.1, 0.7, C.waxShade)
  head(p, 0, -41, 7, o)
  if (o.view !== "back") eyes(p, 0, -40, look, o.up, 2.6, 1.05)
  // hat: flat brim, low crown
  p.ellipse(0, -46, 13.5, 3.4, "#2a2622")
  p.ellipse(0, -46.6, 13.5, 3.0, "#3b3530")
  p.rrect(-7.2, -55, 14.4, 9, 3, "#2a2622")
  p.rrect(-7.2, -55, 7.2, 9, 3, "#3b3530")
  p.rect(-3, -55, 3, 9, "#3b3530")
  p.rect(-7.2, -48.5, 14.4, 1.6, "#47403a")
}

// -------------------------------------------------------------- Tunney
export function drawTunney(p, o = {}) {
  const look = o.look || 0
  const body = [-7.2, -39, 7.2, -39, 6.6, -18, 3, -0.4, -3, -0.4, -6.6, -18]
  p.blob(body, C.ink)
  p.clipBlob(body)
  p.poly([2, -44, 10, -44, 10, 2, 1, 2], C.inkShade)
  p.poly([-10, -3, 10, -3, 10, 2, -10, 2], mix(C.ink, C.glow, 0.4))
  // umbrella folds
  p.poly([-2.6, -36, -2, -36, -0.6, -4, -1.1, -4], C.inkShade, 0.5)
  p.unclip()
  // ledger held to the chest
  if (o.view !== "back") {
    p.poly([-6.8, -31, 1.2, -32.5, 2.4, -22, -5.6, -20.5], "#6b4c37")
    p.poly([-6.2, -30.3, 0.8, -31.6, 1.2, -29.4, -5.9, -28.2], C.cream)
    // hands
    p.circle(-5.6, -26, 1.7, SKIN)
    p.circle(1.8, -27.2, 1.7, SKIN_SHADE)
  }
  head(p, 0, -44, 5.4, o)
  p.circle(0, -51.2, 3.1, HAIR)
  if (o.view === "back") p.circle(0, -44.4, 5.6, HAIR)
  else {
    p.ellipse(0, -45, 5.7, 4.6, HAIR, 1, 0, Math.PI, Math.PI * 2)
    eyes(p, 0, -42.6, look, o.up, 1.9)
  }
}

// -------------------------------------------------------------- Brick
export function drawBrick(p, o = {}) {
  const look = o.look || 0
  const body = [-8, -16, 8, -16, 8.6, -1, 0, 0.6, -8.6, -1]
  p.blob([-8.5, -15, -4, -17, 4, -17, 8.5, -15, 9, -2, 8, 0.4, -8, 0.4, -9, -2], C.brick)
  p.clipBlob([-8.5, -15, -4, -17, 4, -17, 8.5, -15, 9, -2, 8, 0.4, -8, 0.4, -9, -2])
  p.poly([2.5, -20, 12, -20, 12, 3, 3.5, 3], C.brickShade)
  p.poly([-12, -2.4, 12, -2.4, 12, 3, -12, 3], mix(C.brick, C.glow, 0.45))
  p.unclip()
  head(p, 0, -21, 5.5, o)
  if (o.view === "back") p.circle(0, -21.3, 5.7, "#4a3426")
  else {
    p.ellipse(0, -22.2, 5.9, 4.4, "#4a3426", 1, 0, Math.PI, Math.PI * 2)
    p.poly([-5.9, -22.4, -1, -22.4, -3, -20.6], "#4a3426")
    eyes(p, 0, -20.2, look, o.up, 2)
  }
  // the huge scarf
  p.blob([-8.8, -16.5, 0, -18.4, 8.8, -16.5, 9, -12.6, 0, -11.4, -9, -12.6], C.scarf)
  p.blob([1, -15.5, 8.8, -16.5, 9, -12.6, 2, -11.6], C.scarfShade)
}
// scarf tail (separate so it can move); hangs from (0,0)
export function drawScarfTail(p) {
  p.blob([-1.8, 0, 2, 0, 3.4, 7, 2.2, 11.5, -0.4, 11, -1.2, 6], C.scarf)
  p.blob([0.6, 0, 2, 0, 3.4, 7, 2.2, 11.5, 1.2, 9], C.scarfShade)
  p.rect(-1.2, 10.4, 1, 2.2, C.scarfShade)
  p.rect(0.6, 10.8, 1, 2.2, C.scarf)
}

// -------------------------------------------------------------- Harrow (on his stool)
export function drawHarrow(p, o = {}) {
  const look = o.look || 0
  // stool
  p.rect(-6.5, -9, 1.6, 9, C.plankShade)
  p.rect(4.9, -9, 1.6, 9, C.plankShade)
  p.rect(-1.2, -8, 1.6, 8.6, "#4a3a2e")
  p.rrect(-8, -11, 16, 3, 1, C.plankLit)
  p.rect(-8, -9, 16, 1.2, C.plankShade)
  // stooped lozenge
  const body = [-8, -10, -9.4, -19, -5, -29, 3, -31, 8.4, -24, 7.4, -11, 0, -9.4]
  p.blob(body, C.grey)
  p.clipBlob(body)
  p.poly([3, -36, 14, -36, 14, -6, 4.6, -6], C.greyShade)
  p.poly([-14, -12.6, 14, -12.6, 14, -6, -14, -6], mix(C.grey, C.glow, 0.35))
  p.unclip()
  // knees / hands
  p.ellipse(4.5, -12.6, 4.2, 2.4, C.greyShade)
  p.circle(6.6, -14.4, 1.7, SKIN_SHADE)
  head(p, 4.6, -31.5, 5, o)
  if (o.view !== "back") eyes(p, 4.6, -30.2, look + 0.5, o.up, 1.8)
  // cap
  p.ellipse(4.2, -33.6, 5.6, 4, "#5d5a56", 1, 0, Math.PI, Math.PI * 2)
  p.poly([-1.4, -33.8, 9.8, -33.8, 12.8, -32.4, -1.4, -32.6], "#4b4845")
}

// -------------------------------------------------------------- Deputy (pigeon) faces right
export function drawPigeon(p, o = {}) {
  const wing = o.wing || 0 // 0 folded, 1 up, -1 down
  const g = "#8b8f97",
    gl = "#a3a7ae",
    gs = "#6a6e76"
  // tail
  p.poly([-4.2, -3.6, -9, -2.2, -8.6, -0.8, -3.6, -2], gs)
  p.ellipse(0, -3.6, 5, 3.3, g)
  p.ellipse(1.6, -2.8, 3.2, 2.2, "#d9d4cb") // pale chest
  p.ellipse(-0.8, -4.3, 3.4, 1.8, gl)
  if (wing === 1) p.poly([-1, -5, 2, -5.4, -3, -12.5, -5.2, -11], gl)
  else if (wing === -1) p.poly([-1, -4, 2, -4, -2.4, 2.6, -4.6, 1.4], gs)
  else p.ellipse(-1.2, -3.2, 3.2, 1.6, gs)
  p.circle(3.6, -6.8, 2.3, g)
  p.poly([5.6, -7.2, 7.4, -6.6, 5.6, -6.1], "#3a3531")
  p.circle(4.4, -7.3, 0.7, "#e2792b")
  if (!o.flying) {
    p.line([0, -0.6, -0.4, 0.4], 0.7, "#c9806a")
    p.line([1.6, -0.6, 1.8, 0.4], 0.7, "#c9806a")
  }
}

// -------------------------------------------------------------- baking helpers
export const CHAR_DRAW = {
  mote: drawMote,
  thrum: drawThrum,
  tunney: drawTunney,
  brick: drawBrick,
  harrow: drawHarrow,
  deputy: drawPigeon,
}

// silhouette: dark body, warm rim from beneath
export function silhouette(p, fn, o) {
  p.cf = () => C.glow
  p.setT(0, 1.4)
  fn(p, o)
  p.cf = () => mix(C.wax, C.glow, 0.5)
  p.setT(-0.9, 0.7)
  fn(p, o)
  p.cf = (c) => mix(c, "#211c19", 0.8)
  p.setT(0, 0)
  fn(p, o)
  p.cf = null
}

// Bake every view of a character. Keys: `${who}-${variant}-${view}[-up]`.
export function bakeCharacter(scene, who, variant = "day") {
  const fn = CHAR_DRAW[who]
  const out = {}
  const views = who === "deputy" ? ["side", "w1", "w-1"] : ["front", "back", "up"]
  for (const v of views) {
    const p = new Painter()
    const o = { view: v === "back" ? "back" : "front", up: v === "up", look: 0.6 }
    if (who === "deputy") {
      o.wing = v === "w1" ? 1 : v === "w-1" ? -1 : 0
      o.flying = v !== "side"
    }
    if (variant === "sil") silhouette(p, fn, o)
    else fn(p, o)
    const key = `${who}-${variant}-${v}`
    out[v] = p.bake(scene, key, { symmetric: true, pad: 3 })
  }
  return out
}

export function bakePortrait(scene, who, scale) {
  const p = new Painter()
  p.setT(0, 0, scale)
  CHAR_DRAW[who](p, { view: "front", look: 0.5 })
  return p.bake(scene, `portrait-${who}`, { symmetric: true, pad: 4 })
}
