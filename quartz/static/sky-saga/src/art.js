// Programmatic art core: palette, a vector "Painter" that records flat shapes,
// tracks its own bounds and bakes into a 2x canvas texture, plus iso helpers.

export const R = 2 // texture/camera resolution multiplier

export const C = {
  skyTop: "#8fa9b8",
  skyMid: "#ecd3b8",
  skyPale: "#fff4dc",
  slateTop: "#55616d",
  slateLit: "#6f6a66",
  slateShade: "#333a43",
  plankTop: "#8d7359",
  plankLit: "#a5876a",
  plankShade: "#5e4b3b",
  tar: "#2b2724",
  tar2: "#3a3531",
  tarTop: "#45444a",
  moss: "#7f9c6b",
  moss2: "#5d7a52",
  mossLit: "#93ab78",
  soil: "#5a4334",
  soilLit: "#7d5f48",
  soilShade: "#3e2f25",
  rope: "#d7c39a",
  wax: "#f0b93a",
  waxShade: "#c98d1f",
  glow: "#ffe6a0",
  felt: "#2f5d50",
  feltLit: "#3d7363",
  feltShade: "#22453b",
  ink: "#2b3a67",
  inkLit: "#3c4f85",
  inkShade: "#1f2a4c",
  scarf: "#c8452f",
  scarfShade: "#9c3322",
  grey: "#9a9690",
  greyLit: "#aca8a1",
  greyShade: "#77746f",
  cream: "#fbf1dc",
  inkText: "#23201d",
  brick: "#7b5a41",
  brickLit: "#93704f",
  brickShade: "#5a412f",
  rockTop: "#4b5560",
  rockLit: "#8b7a6d",
  rockWarm: "#b8977f",
  rockShade: "#2f353d",
  bronze: "#7d6644",
  bronzeLit: "#9a8158",
  bronzeShade: "#54442e",
}

export const FONT = "Fraunces, Georgia, serif"
export const font = (size, { italic = false, weight = 400 } = {}) =>
  `${italic ? "italic " : ""}${weight} ${size}px ${FONT}`

// -------------------------------------------------------------- colour utils
export function hex(c) {
  return parseInt(c.slice(1), 16)
}
export function mix(a, b, t) {
  const x = hex(a),
    y = hex(b)
  const r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t)
  const g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t)
  const bl = Math.round((x & 255) * (1 - t) + (y & 255) * t)
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)
}

// deterministic random
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

// CPU-backed canvas texture (avoids GPU readback stalls when uploading to WebGL)
export function canvasTexture(scene, key, w, h) {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  c.getContext("2d", { willReadFrequently: true })
  return scene.textures.addCanvas(key, c)
}

// -------------------------------------------------------------- Painter
export class Painter {
  constructor() {
    this.ops = []
    this.minX = Infinity
    this.minY = Infinity
    this.maxX = -Infinity
    this.maxY = -Infinity
    this.tx = 0
    this.ty = 0
    this.s = 1
    this.fx = 1 // horizontal flip
    this.cf = null // colour transform
  }
  col(c) {
    return this.cf ? this.cf(c) : c
  }
  clipBlob(pts) {
    const q = []
    for (let i = 0; i < pts.length; i += 2) q.push(this.X(pts[i]), this.Y(pts[i + 1]))
    this.ops.push({ k: "clip", q, smooth: true })
    return this
  }
  clipPoly(pts) {
    const q = []
    for (let i = 0; i < pts.length; i += 2) q.push(this.X(pts[i]), this.Y(pts[i + 1]))
    this.ops.push({ k: "clip", q, smooth: false })
    return this
  }
  unclip() {
    this.ops.push({ k: "restore" })
    return this
  }
  setT(x = 0, y = 0, s = 1, fx = 1) {
    this.tx = x
    this.ty = y
    this.s = s
    this.fx = fx
    return this
  }
  X(x) {
    return this.tx + x * this.s * this.fx
  }
  Y(y) {
    return this.ty + y * this.s
  }
  _b(x, y, r = 0) {
    if (x - r < this.minX) this.minX = x - r
    if (y - r < this.minY) this.minY = y - r
    if (x + r > this.maxX) this.maxX = x + r
    if (y + r > this.maxY) this.maxY = y + r
  }
  poly(pts, color, alpha = 1) {
    const q = []
    for (let i = 0; i < pts.length; i += 2) {
      const x = this.X(pts[i]),
        y = this.Y(pts[i + 1])
      q.push(x, y)
      this._b(x, y)
    }
    this.ops.push({ k: "poly", q, color: this.col(color), alpha })
    return this
  }
  circle(x, y, r, color, alpha = 1) {
    return this.ellipse(x, y, r, r, color, alpha)
  }
  ellipse(x, y, rx, ry, color, alpha = 1, rot = 0, a0 = 0, a1 = Math.PI * 2) {
    const X = this.X(x),
      Y = this.Y(y),
      RX = rx * this.s,
      RY = ry * this.s
    this._b(X, Y, Math.max(RX, RY))
    this.ops.push({ k: "ell", X, Y, RX, RY, rot: rot * this.fx, color: this.col(color), alpha, a0, a1, fx: this.fx })
    return this
  }
  rect(x, y, w, h, color, alpha = 1) {
    return this.poly([x, y, x + w, y, x + w, y + h, x, y + h], color, alpha)
  }
  rrect(x, y, w, h, r, color, alpha = 1) {
    const X = this.fx > 0 ? this.X(x) : this.X(x + w)
    const Y = this.Y(y)
    const W = w * this.s,
      H = h * this.s
    this._b(X, Y)
    this._b(X + W, Y + H)
    this.ops.push({ k: "rrect", X, Y, W, H, r: r * this.s, color: this.col(color), alpha })
    return this
  }
  // stroked polyline (ropes, lines)
  line(pts, width, color, alpha = 1, cap = "round") {
    const q = []
    const w = width * this.s
    for (let i = 0; i < pts.length; i += 2) {
      const x = this.X(pts[i]),
        y = this.Y(pts[i + 1])
      q.push(x, y)
      this._b(x, y, w)
    }
    this.ops.push({ k: "line", q, w, color: this.col(color), alpha, cap })
    return this
  }
  // quadratic curve stroke
  curve(x0, y0, cx, cy, x1, y1, width, color, alpha = 1) {
    const pts = []
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1
      pts.push(x, y)
    }
    return this.line(pts, width, color, alpha)
  }
  // closed shape from a path of points with optional rounded corners (soft shapes)
  blob(pts, color, alpha = 1) {
    const q = []
    for (let i = 0; i < pts.length; i += 2) {
      const x = this.X(pts[i]),
        y = this.Y(pts[i + 1])
      q.push(x, y)
      this._b(x, y)
    }
    this.ops.push({ k: "blob", q, color: this.col(color), alpha })
    return this
  }
  // custom path: fn(ctx, X, Y, S) in already-transformed space
  bounds(x0, y0, x1, y1) {
    this._b(this.X(x0), this.Y(y0))
    this._b(this.X(x1), this.Y(y1))
    return this
  }

  replay(ctx) {
    const smoothPath = (q) => {
      const n = q.length / 2
      const mx = (i) => (q[(i % n) * 2] + q[((i + 1) % n) * 2]) / 2
      const my = (i) => (q[(i % n) * 2 + 1] + q[((i + 1) % n) * 2 + 1]) / 2
      ctx.moveTo(mx(0), my(0))
      for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(q[(i % n) * 2], q[(i % n) * 2 + 1], mx(i), my(i))
      ctx.closePath()
    }
    for (const o of this.ops) {
      if (o.k === "clip") {
        ctx.save()
        ctx.beginPath()
        if (o.smooth) smoothPath(o.q)
        else {
          ctx.moveTo(o.q[0], o.q[1])
          for (let i = 2; i < o.q.length; i += 2) ctx.lineTo(o.q[i], o.q[i + 1])
          ctx.closePath()
        }
        ctx.clip()
        continue
      }
      if (o.k === "restore") {
        ctx.restore()
        continue
      }
      ctx.globalAlpha = o.alpha
      if (o.k === "line") {
        ctx.strokeStyle = o.color
        ctx.lineWidth = o.w
        ctx.lineCap = o.cap
        ctx.lineJoin = "round"
        ctx.beginPath()
        ctx.moveTo(o.q[0], o.q[1])
        for (let i = 2; i < o.q.length; i += 2) ctx.lineTo(o.q[i], o.q[i + 1])
        ctx.stroke()
        continue
      }
      ctx.fillStyle = o.color
      ctx.beginPath()
      if (o.k === "poly") {
        ctx.moveTo(o.q[0], o.q[1])
        for (let i = 2; i < o.q.length; i += 2) ctx.lineTo(o.q[i], o.q[i + 1])
        ctx.closePath()
      } else if (o.k === "ell") {
        let a0 = o.a0,
          a1 = o.a1
        if (o.fx < 0 && (a1 - a0) < Math.PI * 2 - 1e-6) {
          const b0 = Math.PI - a1,
            b1 = Math.PI - a0
          a0 = b0
          a1 = b1
        }
        ctx.ellipse(o.X, o.Y, o.RX, o.RY, o.rot, a0, a1)
        if (a1 - a0 < Math.PI * 2 - 1e-6) ctx.closePath()
      } else if (o.k === "rrect") {
        ctx.roundRect(o.X, o.Y, o.W, o.H, o.r)
      } else if (o.k === "blob") {
        smoothPath(o.q)
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // Bake into a texture. Returns { key, ox, oy, w, h } in logical px; ox/oy is
  // where the texture's top-left sits relative to the painter's origin.
  bake(scene, key, { pad = 2, symmetric = false } = {}) {
    if (!isFinite(this.minX)) this._b(0, 0)
    let minX = Math.floor(this.minX - pad),
      maxX = Math.ceil(this.maxX + pad)
    if (symmetric) {
      const m = Math.max(-minX, maxX)
      minX = -m
      maxX = m
    }
    const minY = Math.floor(this.minY - pad),
      maxY = Math.ceil(this.maxY + pad)
    const w = maxX - minX,
      h = maxY - minY
    const tex = canvasTexture(scene, key, w * R, h * R)
    const ctx = tex.context
    ctx.setTransform(R, 0, 0, R, -minX * R, -minY * R)
    this.replay(ctx)
    tex.refresh()
    return { key, ox: minX, oy: minY, w, h }
  }
}

// Place a baked texture as an image so that the painter origin lands on (x, y).
export function place(scene, baked, x, y, depth = 0) {
  const img = scene.add.image(x, y, baked.key)
  img.setOrigin(-baked.ox / baked.w, -baked.oy / baked.h)
  img.setScale(1 / R)
  img.setDepth(depth)
  return img
}

let uid = 0
export function bakePlace(scene, fn, x, y, depth, opts) {
  const p = new Painter()
  fn(p)
  const b = p.bake(scene, `__art${uid++}`, opts)
  return place(scene, b, x, y, depth)
}
export function bakeKey(scene, key, fn, opts) {
  const p = new Painter()
  fn(p)
  return p.bake(scene, key, opts)
}

// -------------------------------------------------------------- iso helpers
export const TW = 64,
  TH = 32
// iso point in local tile units (x, y) and height z (px) -> screen offsets
export const P = (x, y, z = 0) => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z]

// a 3D polygon face
export function face(p, pts3, color, alpha = 1) {
  const q = []
  for (const [x, y, z] of pts3) q.push(...P(x, y, z))
  p.poly(q, color, alpha)
}

// axis-aligned iso prism: footprint [x0,x1]x[y0,y1] (tile units), z0..z1 (px)
export function prism(p, x0, y0, x1, y1, z0, z1, top, lit, shade, { noTop = false } = {}) {
  // SW face (+y side) faces down-left: lit; SE face (+x side) faces down-right: shade
  face(p, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], lit)
  face(p, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade)
  if (!noTop) face(p, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top)
}

// vertical cylinder centred at (cx, cy) tile units, radius r (tiles)
export function cylinder(p, cx, cy, r, z0, z1, top, lit, shade) {
  const [sx, sy] = P(cx, cy, 0)
  const rx = r * 45.25,
    ry = r * 22.63
  const yb = sy - z0,
    yt = sy - z1
  // body: left half lit, right half shade
  p.poly([sx - rx, yt, sx, yt, sx, yb + ry, sx - rx, yb], lit)
  p.ellipse(sx, yb, rx, ry, lit, 1, 0, Math.PI / 2, Math.PI)
  p.poly([sx, yt, sx + rx, yt, sx + rx, yb, sx, yb + ry], shade)
  p.ellipse(sx, yb, rx, ry, shade, 1, 0, 0, Math.PI / 2)
  // fill the wedge gaps
  p.poly([sx - rx, yb, sx, yb, sx, yb + ry], lit)
  p.poly([sx, yb, sx + rx, yb, sx, yb + ry], shade)
  if (top) p.ellipse(sx, yt, rx, ry, top)
  return { sx, sy, rx, ry, yt, yb }
}

// soft contact shadow under things
export function shadow(p, x, y, rx, ry, alpha = 0.22) {
  p.ellipse(x, y, rx, ry, "#2a2018", alpha)
}

// rope catenary between two screen points
export function rope(p, x0, y0, x1, y1, sag, width = 1.2, color = C.rope, alpha = 1) {
  const mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2 + sag * 2
  p.curve(x0, y0, mx, my, x1, y1, width, color, alpha)
}
