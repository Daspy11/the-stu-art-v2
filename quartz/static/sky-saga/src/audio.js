// SKY SAGA — sound engine.
// Everything is synthesised with WebAudio: no samples, no dependencies.
// Mood: quiet dawn on a tiny floating town. Slate, beeswax, rope. Restrained, airy, a little lonely.
//
// Every public method is a silent no-op until unlock() has succeeded, never throws,
// and is safe to call repeatedly at any rate.

const N = {
  D2: 73.416,
  A2: 110.0,
  D3: 146.832,
  "F#3": 184.997,
  A3: 220.0,
  D4: 293.665,
  E4: 329.628,
  "F#4": 369.994,
  A4: 440.0,
  D5: 587.33,
  A5: 880.0,
  D6: 1174.659,
}
const MOTIF = [N.D4, N.A4, N["F#4"], N.E4]
const MOTIF_PAN = [-0.15, 0.15, -0.05, 0.08]

const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
const vary = (amt) => 1 + (Math.random() * 2 - 1) * amt
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Soft percussive envelope: linear attack, exponential decay, then hard zero.
function perc(param, t, attack, peak, decay) {
  const a = Math.max(0.002, attack)
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + a)
  param.exponentialRampToValueAtTime(0.0001, t + a + decay)
  param.setValueAtTime(0, t + a + decay + 0.005)
}

// Ramp a param from wherever it currently is.
function fadeTo(ctx, param, value, dur, at) {
  const t = at ?? ctx.currentTime
  param.cancelScheduledValues(t)
  param.setValueAtTime(param.value, t)
  param.linearRampToValueAtTime(value, t + Math.max(0.02, dur))
}

function makeNoise(ctx, seconds = 4) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

// Gentle room: decaying stereo noise that darkens as it fades.
function makeIR(ctx, seconds = 3.2, tau = 0.75) {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const pre = Math.floor(sr * 0.012)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      if (i < pre) {
        d[i] = 0
        continue
      }
      const t = (i - pre) / sr
      const k = 0.2 + 0.75 * (i / len) // one-pole lowpass, darker over time
      lp += (Math.random() * 2 - 1 - lp) * (1 - k)
      const fadeIn = Math.min(1, t / 0.01)
      d[i] = lp * Math.exp(-t / tau) * fadeIn
    }
  }
  return buf
}

class Engine {
  constructor(ctx, live) {
    const c = (this.ctx = ctx)
    this.live = live
    this.sources = new Set()
    this.pumps = new Set()
    this.layers = [] // ambience layers (current + fading)
    this.ambKind = "none"
    this.hum = null
    this.low = null
    this.rainL = null

    // master chain: mix -> comp -> master -> limiter -> mute -> out
    this.out = c.createGain()
    this.out.gain.value = 1
    this.limiter = c.createDynamicsCompressor()
    this.limiter.threshold.value = -6
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.12
    this.master = c.createGain()
    this.master.gain.value = 0.5
    this.comp = c.createDynamicsCompressor()
    this.comp.threshold.value = -20
    this.comp.knee.value = 12
    this.comp.ratio.value = 3
    this.comp.attack.value = 0.01
    this.comp.release.value = 0.3
    this.mix = c.createGain()
    this.mix.connect(this.comp)
    this.comp.connect(this.master)
    this.master.connect(this.limiter)
    this.limiter.connect(this.out)
    this.out.connect(c.destination)

    // dry and reverb buses
    this.dry = c.createGain()
    this.dry.connect(this.mix)
    this.verbIn = c.createGain()
    const hp = c.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 160
    this.verb = c.createConvolver()
    this.verb.normalize = true
    this.verb.buffer = makeIR(c)
    this.verbOut = c.createGain()
    this.verbOut.gain.value = 0.55
    this.verbIn.connect(hp)
    hp.connect(this.verb)
    this.verb.connect(this.verbOut)
    this.verbOut.connect(this.mix)

    // ambience bus (ducked by lowTone)
    this.amb = c.createGain()
    this.amb.connect(this.mix)
    const ambSend = c.createGain()
    ambSend.gain.value = 0.3
    this.amb.connect(ambSend)
    ambSend.connect(this.verbIn)

    this.noiseBuf = makeNoise(c)

    if (live) {
      this.timer = setInterval(() => {
        try {
          if (this.ctx.state === "running") this.pump(this.ctx.currentTime + 1.5)
        } catch (e) {}
      }, 200)
    }
  }

  now() {
    return this.ctx.currentTime + 0.01
  }

  pump(horizon) {
    for (const p of this.pumps) p(horizon)
  }

  // ---- node helpers
  g(v = 0) {
    const n = this.ctx.createGain()
    n.gain.value = v
    return n
  }
  filt(type, f, Q = 0.7, gainDb = 0) {
    const n = this.ctx.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = Q
    if (gainDb) n.gain.value = gainDb
    return n
  }
  pan(p, dest) {
    if (!p || !this.ctx.createStereoPanner) return dest
    const n = this.ctx.createStereoPanner()
    n.pan.value = Math.max(-1, Math.min(1, p))
    n.connect(dest)
    return n
  }
  // A voice output: gain -> (pan) -> dry + reverb send.
  bus(wet = 0.3, pan = 0, level = 1) {
    const gn = this.g(level)
    const head = this.pan(pan, this.dry)
    if (head !== this.dry) gn.connect(head)
    else gn.connect(this.dry)
    if (wet > 0) {
      const s = this.g(wet)
      gn.connect(s)
      s.connect(this.verbIn)
    }
    return gn
  }
  track(src) {
    this.sources.add(src)
    src.onended = () => {
      this.sources.delete(src)
      try {
        src.disconnect()
      } catch (e) {}
    }
    return src
  }
  osc(type, freq, t0, t1, dest) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    o.connect(dest)
    o.start(t0)
    if (t1) o.stop(t1)
    return this.track(o)
  }
  noise(t0, t1, dest) {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    s.connect(dest)
    s.start(t0, rand(0, this.noiseBuf.duration - 0.5))
    if (t1) s.stop(t1)
    return this.track(s)
  }
  stopSrcs(list, t) {
    for (const s of list) {
      try {
        s.stop(t)
      } catch (e) {}
    }
  }

  // ---- voices
  pluck(freq, t, { gain = 0.16, decay = 2.6, bright = 0, wet = 0.55, pan = 0 } = {}) {
    const out = this.bus(wet, pan, gain)
    const end = t + decay + 0.1
    const g1 = this.g(0)
    g1.connect(out)
    perc(g1.gain, t, 0.006, 1, decay)
    this.osc("sine", freq, t, end, g1)

    const g2 = this.g(0)
    g2.connect(out)
    perc(g2.gain, t, 0.006, 0.16 + 0.14 * bright, decay * 0.35)
    this.osc("sine", freq * 2.003, t, end, g2)

    const g3 = this.g(0) // tine partial, inharmonic, short
    g3.connect(out)
    perc(g3.gain, t, 0.003, 0.05 + 0.05 * bright, 0.12 + 0.08 * bright)
    this.osc("sine", freq * 5.42, t, t + 0.4, g3)

    const g4 = this.g(0) // breath of the thumb
    const bp = this.filt("bandpass", Math.min(8000, freq * 4), 2)
    bp.connect(g4)
    g4.connect(out)
    perc(g4.gain, t, 0.002, 0.08, 0.04)
    this.noise(t, t + 0.1, bp)
  }

  chime(freq, t, level = 0.045) {
    const out = this.bus(0.65, rand(-0.2, 0.2), level)
    const parts = [
      [1, 1, 2.4],
      [2.756, 0.22, 0.8],
      [5.404, 0.07, 0.3],
    ]
    for (const [r, a, d] of parts) {
      const gn = this.g(0)
      gn.connect(out)
      perc(gn.gain, t, 0.01, a, d)
      this.osc("sine", freq * r, t, t + d + 0.1, gn)
    }
  }

  padNote(freq, t, att, hold, rel, level, pan = 0, cutoff = 900, wet = 0.6) {
    const out = this.bus(wet, pan, 1)
    const lp = this.filt("lowpass", cutoff, 0.5)
    lp.connect(out)
    const e = this.g(0)
    e.connect(lp)
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(level, t + att)
    e.gain.setValueAtTime(level, t + att + hold)
    e.gain.linearRampToValueAtTime(0, t + att + hold + rel)
    const end = t + att + hold + rel + 0.05
    const half = this.g(0.5)
    half.connect(e)
    const o1 = this.osc("triangle", freq, t, end, half)
    const o2 = this.osc("triangle", freq, t, end, half)
    o1.detune.value = -4
    o2.detune.value = 4
  }

  // ---- ambience
  ambience(kind, fade = 2) {
    if (kind !== "top" && kind !== "keel") kind = "none"
    if (kind === this.ambKind) return
    this.ambKind = kind
    fade = Math.max(0.05, +fade || 0)
    const t = this.ctx.currentTime
    for (const L of this.layers) this.killLayer(L, fade)
    this.layers = this.layers.filter((L) => !L.dead)
    if (kind === "none") return
    const L = this.makeWind(kind, fade)
    this.layers.push(L)
  }

  killLayer(L, fade) {
    if (L.dead) return
    L.dead = true
    this.pumps.delete(L.pump)
    const t = this.ctx.currentTime
    fadeTo(this.ctx, L.gain.gain, 0, fade, t)
    this.stopSrcs(L.srcs, t + fade + 0.1)
  }

  makeWind(kind, fade) {
    const c = this.ctx
    const t = c.currentTime
    const top = kind === "top"
    const cfg = top
      ? { lo: 480, hi: 950, Q: 0.8, lp: 2400, level: 0.2 }
      : { lo: 180, hi: 340, Q: 1.6, lp: 750, level: 0.25 }
    const L = { kind, gain: this.g(0), srcs: [], parts: [], dead: false }
    L.gain.connect(this.amb)
    for (const side of [-0.55, 0.55]) {
      const bp = this.filt("bandpass", rand(cfg.lo, cfg.hi), cfg.Q)
      const lp = this.filt("lowpass", cfg.lp, 0.5)
      const swell = this.g(0.6)
      bp.connect(lp)
      let tail = lp
      if (!top) {
        const hollow = this.filt("peaking", 300, 5, 7)
        lp.connect(hollow)
        tail = hollow
      }
      tail.connect(swell)
      swell.connect(this.pan(side, L.gain))
      L.srcs.push(this.noise(t, 0, bp))
      L.parts.push({ bp, swell, next: t })
    }
    L.gain.gain.setValueAtTime(0, t)
    L.gain.gain.linearRampToValueAtTime(cfg.level, t + fade)

    L.nextCreak = t + rand(2, 6)
    L.nextDrip = t + rand(3, 9)
    L.pump = (h) => {
      for (const p of L.parts) {
        let guard = 0
        while (p.next < h && guard++ < 50) {
          const nt = p.next + rand(1.5, 5)
          p.swell.gain.linearRampToValueAtTime(rand(0.3, 1), nt)
          p.bp.frequency.exponentialRampToValueAtTime(rand(cfg.lo, cfg.hi), nt)
          p.next = nt
        }
      }
      if (top) return
      let guard = 0
      while (L.nextCreak < h && guard++ < 20) {
        const ct = Math.max(L.nextCreak, c.currentTime + 0.01)
        const f = rand(150, 240)
        this.creak(ct, this.pan(rand(-0.7, 0.7), this.amb), {
          dur: rand(0.35, 1.0),
          f0: f,
          f1: f * rand(0.85, 1.1),
          level: rand(0.02, 0.04),
          rate0: rand(30, 55),
          rate1: rand(25, 50),
          bpf0: rand(700, 1200),
          bpf1: rand(600, 1100),
        })
        if (Math.random() < 0.3) L.nextCreak = ct + rand(0.5, 1.4)
        else L.nextCreak = ct + rand(5, 14)
      }
      guard = 0
      while (L.nextDrip < h && guard++ < 20) {
        const dt = Math.max(L.nextDrip, c.currentTime + 0.01)
        this.drip(dt, this.pan(rand(-0.5, 0.5), this.amb))
        L.nextDrip = dt + rand(6, 16)
      }
    }
    this.pumps.add(L.pump)
    L.pump(t + 1.5)
    return L
  }

  // Stick-slip creak: a buzzy source chopped into irregular grains.
  creak(t, dest, o = {}) {
    const {
      dur = 0.6,
      f0 = 180,
      f1 = 150,
      level = 0.05,
      rate0 = 30,
      rate1 = 30,
      bpf0 = 900,
      bpf1 = 900,
      jitter = 0.35,
      shape = (p) => Math.sin(Math.PI * p),
    } = o
    const out = this.g(level)
    out.connect(dest)
    const am = this.g(0)
    am.connect(out)
    const bp = this.filt("bandpass", bpf0, 3)
    bp.frequency.setValueAtTime(bpf0, t)
    bp.frequency.exponentialRampToValueAtTime(bpf1, t + dur)
    const lp = this.filt("lowpass", 2600, 0.5)
    bp.connect(lp)
    lp.connect(am)
    const end = t + dur + 0.15
    const s = this.osc("sawtooth", f0, t, end, bp)
    s.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const nbp = this.filt("bandpass", bpf0 * 1.6, 2)
    const ng = this.g(0.5)
    nbp.connect(ng)
    ng.connect(am)
    this.noise(t, end, nbp)

    am.gain.setValueAtTime(0, t)
    let tt = t
    let guard = 0
    while (tt < t + dur && guard++ < 400) {
      const p = (tt - t) / dur
      const rate = rate0 + (rate1 - rate0) * p
      const period = 1 / rate
      const a = Math.max(0, shape(p)) * rand(0.45, 1)
      am.gain.linearRampToValueAtTime(a, tt + 0.004)
      am.gain.linearRampToValueAtTime(a * 0.12, tt + period * 0.7)
      tt += period * (1 + jitter * rand(-1, 1))
    }
    am.gain.linearRampToValueAtTime(0, t + dur + 0.03)
  }

  drip(t, dest) {
    const f = rand(1000, 1500)
    const gn = this.g(0)
    gn.connect(dest)
    perc(gn.gain, t, 0.002, rand(0.03, 0.05), 0.09)
    const o = this.osc("sine", f, t, t + 0.15, gn)
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.04)
  }

  // ---- motif & chords
  motif(i) {
    i = ((Math.floor(+i) || 0) % 4 + 4) % 4
    this.pluck(MOTIF[i], this.now(), { pan: MOTIF_PAN[i] })
  }
  motifResolve() {
    const t = this.now()
    this.pluck(N.D5, t, { gain: 0.15, decay: 4.5, bright: 1, wet: 0.7 })
    this.padNote(N.D3, t, 1.6, 0.8, 4, 0.03, -0.25, 700, 0.7)
    this.padNote(N.A3, t + 0.1, 1.6, 0.8, 4, 0.022, 0.25, 700, 0.7)
  }
  titleChord() {
    const t = this.now()
    const notes = [N.D2, N.A2, N.D3, N["F#3"], N.A3, N.E4]
    const pans = [-0.5, 0.5, -0.25, 0.3, -0.45, 0.45]
    const lv = [0.05, 0.045, 0.04, 0.032, 0.03, 0.022]
    notes.forEach((f, k) => this.padNote(f, t + k * 0.09, 2.2, 1.2, 2.6, lv[k], pans[k], 950))
  }

  // ---- stay hum
  humStart() {
    if (this.hum) return
    const t = this.ctx.currentTime
    const h = { g: this.g(0), lp: this.filt("lowpass", 350, 0.6), srcs: [] }
    h.lp.connect(h.g)
    h.g.connect(this.bus(0.35, 0, 1))
    const notes = [
      [N.D2, 0.5],
      [N.A2, 0.35],
      [N["F#3"], 0.22],
    ]
    for (const [f, lv] of notes) {
      const gn = this.g(lv * 0.5)
      gn.connect(h.lp)
      const p = this.pan(rand(-0.3, 0.3), gn)
      h.srcs.push(this.osc("triangle", f, t, 0, p))
      h.srcs.push(this.osc("triangle", f + rand(0.12, 0.3), t, 0, p))
    }
    const sub = this.g(0.25)
    sub.connect(h.g)
    h.srcs.push(this.osc("sine", N.D2, t, 0, sub))
    h.g.gain.setValueAtTime(0, t)
    h.g.gain.linearRampToValueAtTime(0.035, t + 1.5)
    this.hum = h
  }
  humSet(p) {
    if (!this.hum) return
    p = clamp01(+p || 0)
    const t = this.ctx.currentTime
    const h = this.hum
    h.g.gain.cancelScheduledValues(t)
    h.g.gain.setTargetAtTime(0.03 + 0.09 * p, t, 0.15)
    h.lp.frequency.cancelScheduledValues(t)
    h.lp.frequency.setTargetAtTime(300 + 1600 * p, t, 0.2)
  }
  humEnd(completed) {
    const h = this.hum
    if (!h) return
    this.hum = null
    const t = this.ctx.currentTime
    const fade = completed ? 3.2 : 0.5
    fadeTo(this.ctx, h.g.gain, 0, fade, t)
    this.stopSrcs(h.srcs, t + fade + 0.1)
    if (completed) {
      this.chime(N.A5, t + 0.2, 0.04)
      this.chime(N.D6, t + 0.8, 0.035)
    }
  }

  // ---- voices for text
  blip(who) {
    const t = this.now()
    if (who === "thrum") {
      const f = 110 * vary(0.04)
      const out = this.bus(0.12, -0.05, 1)
      const lp = this.filt("lowpass", 600, 0.5)
      lp.connect(out)
      const e = this.g(0)
      e.connect(lp)
      perc(e.gain, t, 0.008, 0.16, 0.09)
      const o = this.osc("sine", f, t, t + 0.15, e)
      o.frequency.exponentialRampToValueAtTime(f * 0.97, t + 0.09)
      const tg = this.g(0.3)
      tg.connect(e)
      this.osc("triangle", f, t, t + 0.15, tg)
    } else if (who === "tunney") {
      const f = 330 * vary(0.035)
      const out = this.bus(0.05, 0.08, 1)
      const bp = this.filt("bandpass", 900, 0.7)
      bp.connect(out)
      const e = this.g(0)
      e.connect(bp)
      perc(e.gain, t, 0.004, 0.35, 0.045)
      this.osc("triangle", f, t, t + 0.08, e)
    } else if (who === "brick") {
      const f = 520 * vary(0.04)
      const out = this.bus(0.1, 0.12, 1)
      const e = this.g(0)
      e.connect(out)
      perc(e.gain, t, 0.003, 0.12, 0.035)
      const o = this.osc("sine", f, t, t + 0.06, e)
      o.frequency.linearRampToValueAtTime(f * 1.03, t + 0.03)
      const tg = this.g(0.25)
      tg.connect(e)
      this.osc("triangle", f, t, t + 0.06, tg)
    } else if (who === "harrow") {
      const out = this.bus(0.2, -0.1, 1)
      const bp = this.filt("bandpass", 700 * vary(0.1), 1.2)
      bp.connect(out)
      const e = this.g(0)
      e.connect(out)
      const ne = this.g(0)
      ne.connect(bp)
      perc(ne.gain, t, 0.015, 0.45, 0.09)
      this.noise(t, t + 0.15, ne)
      perc(e.gain, t, 0.015, 0.04, 0.08)
      this.osc("sine", 200 * vary(0.04), t, t + 0.15, e)
    } else if (who === "deputy") {
      this.cooVoice(t, 0.75, 0.022)
    }
    // 'narr' and anything else: silent
  }

  cooVoice(t, len = 1, level = 0.06) {
    const k = vary(0.04)
    const out = this.bus(0.3, 0.2, 1)
    const lp = this.filt("lowpass", 900, 1)
    lp.connect(out)
    const e = this.g(0)
    e.connect(lp)
    const s1 = 0.17 * len
    const gap = 0.05 * len
    const s2 = 0.32 * len
    const t2 = t + s1 + gap
    const end = t2 + s2
    // two humps
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(level * 0.8, t + 0.035 * len)
    e.gain.linearRampToValueAtTime(level * 0.6, t + s1 - 0.03 * len)
    e.gain.linearRampToValueAtTime(level * 0.05, t + s1 + gap * 0.5)
    e.gain.linearRampToValueAtTime(level, t2 + 0.06 * len)
    e.gain.linearRampToValueAtTime(level * 0.7, end - 0.1 * len)
    e.gain.linearRampToValueAtTime(0, end)
    const tg = this.g(0.3)
    tg.connect(e)
    const o = this.osc("sine", 340 * k, t, end + 0.05, e)
    const o2 = this.osc("triangle", 340 * k, t, end + 0.05, tg)
    const vib = this.ctx.createOscillator()
    vib.frequency.value = 7
    const vg = this.g(6 * k)
    vib.connect(vg)
    for (const f of [o.frequency, o2.frequency]) {
      f.linearRampToValueAtTime(410 * k, t + s1 * 0.5)
      f.linearRampToValueAtTime(380 * k, t + s1)
      f.linearRampToValueAtTime(400 * k, t2)
      f.linearRampToValueAtTime(432 * k, t2 + s2 * 0.3)
      f.linearRampToValueAtTime(330 * k, end)
      vg.connect(f)
    }
    vib.start(t2)
    vib.stop(end + 0.05)
    this.track(vib)
    // breathy edge
    const nb = this.filt("bandpass", 1100, 1)
    const ng = this.g(0.04)
    nb.connect(ng)
    ng.connect(e)
    this.noise(t, end + 0.05, nb)
  }

  coo() {
    this.cooVoice(this.now(), 1.7, 0.07)
  }

  // ---- props
  tunk() {
    const t = this.now()
    const out = this.bus(0.35, 0.1, 1.5)
    const th = this.g(0)
    th.connect(out)
    perc(th.gain, t, 0.004, 0.22, 0.18)
    const o = this.osc("sine", 120, t, t + 0.3, th)
    o.frequency.exponentialRampToValueAtTime(65, t + 0.08)
    const lp = this.filt("lowpass", 500, 0.7)
    const ng = this.g(0)
    lp.connect(ng)
    ng.connect(out)
    perc(ng.gain, t, 0.003, 0.3, 0.05)
    this.noise(t, t + 0.1, lp)
    const partials = [
      [431, 0.05, 0.28],
      [689, 0.035, 0.2],
      [1053, 0.025, 0.14],
      [1447, 0.015, 0.1],
    ]
    for (const [f, a, d] of partials) {
      const gn = this.g(0)
      gn.connect(out)
      perc(gn.gain, t + 0.002, 0.004, a, d)
      this.osc("sine", f * vary(0.01), t, t + d + 0.05, gn)
    }
  }

  chalk() {
    const t = this.now()
    const out = this.bus(0.08, rand(-0.2, 0.2), 0.12)
    const hp = this.filt("highpass", 2200, 0.7)
    const bp = this.filt("bandpass", 3800 * vary(0.1), 1.2)
    const am = this.g(0)
    hp.connect(bp)
    bp.connect(am)
    am.connect(out)
    const dur = rand(0.05, 0.08)
    this.noise(t, t + dur + 0.05, hp)
    am.gain.setValueAtTime(0, t)
    let tt = t
    while (tt < t + dur) {
      const a = rand(0.4, 1)
      am.gain.linearRampToValueAtTime(a, tt + 0.002)
      am.gain.linearRampToValueAtTime(a * 0.1, tt + rand(0.003, 0.007))
      tt += rand(0.006, 0.012)
    }
    am.gain.linearRampToValueAtTime(0, t + dur + 0.01)
  }

  select() {
    const t = this.now()
    const out = this.bus(0.15, 0, 1)
    const e = this.g(0)
    e.connect(out)
    perc(e.gain, t, 0.002, 0.08, 0.03)
    this.osc("sine", 1250 * vary(0.02), t, t + 0.06, e)
    const e2 = this.g(0)
    e2.connect(out)
    perc(e2.gain, t, 0.002, 0.018, 0.015)
    this.osc("triangle", 2500, t, t + 0.04, e2)
  }

  confirm() {
    const t = this.now()
    const out = this.bus(0.2, 0, 1)
    const e = this.g(0)
    e.connect(out)
    perc(e.gain, t, 0.003, 0.1, 0.06)
    this.osc("sine", 820 * vary(0.01), t, t + 0.1, e)
    const e2 = this.g(0)
    e2.connect(out)
    perc(e2.gain, t, 0.003, 0.02, 0.03)
    this.osc("sine", 1640, t, t + 0.06, e2)
  }

  step(surface) {
    const t = this.now()
    const lv = rand(1.4, 2)
    const out = this.bus(surface === "keel" ? 0.3 : 0.12, rand(-0.15, 0.15), lv)
    const nf = surface === "slate" ? 2400 : surface === "keel" ? 320 : 700
    const nq = surface === "slate" ? 1.0 : surface === "keel" ? 3 : 1.2
    const na = surface === "slate" ? 0.06 : surface === "keel" ? 0.1 : 0.07
    const nd = surface === "slate" ? 0.03 : surface === "keel" ? 0.1 : 0.05
    const bp = this.filt("bandpass", nf * vary(0.12), nq)
    const ng = this.g(0)
    bp.connect(ng)
    ng.connect(out)
    perc(ng.gain, t, 0.003, na, nd)
    this.noise(t, t + nd + 0.05, bp)
    const tf = (surface === "slate" ? 110 : surface === "keel" ? 85 : 140) * vary(0.08)
    const th = this.g(0)
    th.connect(out)
    const ta = surface === "slate" ? 0.025 : 0.045
    const td = surface === "keel" ? 0.09 : 0.06
    perc(th.gain, t, 0.004, ta, td)
    const o = this.osc("sine", tf, t, t + td + 0.05, th)
    o.frequency.exponentialRampToValueAtTime(tf * 0.65, t + td)
  }

  ladder() {
    const t0 = this.now()
    const n = Math.random() < 0.5 ? 3 : 4
    const dir = Math.random() < 0.5 ? -1 : 1
    const base = 260 * vary(0.05)
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.12 + rand(0, 0.02)
      const f = base * (1 + dir * 0.07 * i)
      const out = this.bus(0.25, rand(-0.1, 0.1), rand(0.75, 1))
      const e = this.g(0)
      e.connect(out)
      perc(e.gain, t, 0.003, 0.07, 0.07)
      const o = this.osc("sine", f, t, t + 0.12, e)
      o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.04)
      const bp = this.filt("bandpass", f * 3, 2)
      const ng = this.g(0)
      bp.connect(ng)
      ng.connect(out)
      perc(ng.gain, t, 0.002, 0.08, 0.03)
      this.noise(t, t + 0.08, bp)
    }
  }

  lowTone(on) {
    const c = this.ctx
    const t = c.currentTime
    if (on) {
      if (this.low) return
      const L = { g: this.g(0), srcs: [] }
      L.g.connect(this.dry)
      const parts = [
        [46, 0.5],
        [47, 0.5],
        [92, 0.05],
      ]
      for (const [f, lv] of parts) {
        const gn = this.g(lv)
        gn.connect(L.g)
        L.srcs.push(this.osc("sine", f, t, 0, gn))
      }
      L.g.gain.setValueAtTime(0, t)
      L.g.gain.linearRampToValueAtTime(0.18, t + 3)
      fadeTo(c, this.amb.gain, 0.03, 2, t)
      this.low = L
    } else {
      const L = this.low
      if (!L) return
      this.low = null
      fadeTo(c, L.g.gain, 0, 0.8, t)
      this.stopSrcs(L.srcs, t + 0.9)
      fadeTo(c, this.amb.gain, 1, 1.5, t)
    }
  }

  groan() {
    const t = this.now()
    const out = this.bus(0.5, rand(-0.15, 0.15), 1)
    const dur = 3.5
    this.creak(t, out, {
      dur,
      f0: 150,
      f1: 55,
      level: 0.13,
      rate0: 22,
      rate1: 8,
      bpf0: 900,
      bpf1: 280,
      jitter: 0.5,
      shape: (p) => (p < 0.08 ? p / 0.08 : 1 - 0.55 * p) * (0.75 + 0.25 * Math.sin(p * 17)),
    })
    // the soft thump at the end
    const tt = t + dur + 0.12
    const th = this.g(0)
    th.connect(out)
    perc(th.gain, tt, 0.012, 0.25, 0.5)
    const o = this.osc("sine", 70, tt, tt + 0.6, th)
    o.frequency.exponentialRampToValueAtTime(38, tt + 0.25)
    const lp = this.filt("lowpass", 220, 0.7)
    const ng = this.g(0)
    lp.connect(ng)
    ng.connect(out)
    perc(ng.gain, tt, 0.01, 0.35, 0.3)
    this.noise(tt, tt + 0.4, lp)
  }

  rain(on) {
    const c = this.ctx
    const t = c.currentTime
    if (on) {
      if (this.rainL) return
      const R = { g: this.g(0), srcs: [], start: t, next: t + rand(0.1, 0.6) }
      R.g.connect(this.bus(0.35, 0, 1))
      R.g.gain.setValueAtTime(0, t)
      R.g.gain.linearRampToValueAtTime(1, t + 1.5)
      const hp = this.filt("highpass", 4500, 0.7)
      const lp = this.filt("lowpass", 9000, 0.7)
      const wash = this.g(0)
      hp.connect(lp)
      lp.connect(wash)
      wash.connect(R.g)
      wash.gain.setValueAtTime(0.003, t)
      wash.gain.linearRampToValueAtTime(0.014, t + 15)
      R.srcs.push(this.noise(t, 0, hp))
      R.pump = (h) => {
        let guard = 0
        while (R.next < h && guard++ < 200) {
          const tt = Math.max(R.next, c.currentTime + 0.005)
          this.rainTick(tt, R.g)
          const el = tt - R.start
          const density = 0.6 + 5.4 * Math.min(1, el / 15)
          R.next = tt - Math.log(1 - Math.random() * 0.999) / density
        }
      }
      this.pumps.add(R.pump)
      R.pump(t + 1.5)
      this.rainL = R
    } else {
      const R = this.rainL
      if (!R) return
      this.rainL = null
      this.pumps.delete(R.pump)
      fadeTo(c, R.g.gain, 0, 2, t)
      this.stopSrcs(R.srcs, t + 2.1)
    }
  }

  rainTick(t, dest) {
    const out = this.pan(rand(-0.8, 0.8), dest)
    const bp = this.filt("bandpass", rand(2500, 6000), rand(1.5, 3))
    const gn = this.g(0)
    bp.connect(gn)
    gn.connect(out)
    const d = rand(0.02, 0.05)
    perc(gn.gain, t, 0.002, rand(0.04, 0.12), d)
    this.noise(t, t + d + 0.03, bp)
    if (Math.random() < 0.2) {
      const pg = this.g(0)
      pg.connect(out)
      perc(pg.gain, t, 0.002, rand(0.006, 0.015), 0.04)
      this.osc("sine", rand(1800, 3200), t, t + 0.07, pg)
    }
  }

  cough() {
    const t = this.now()
    const out = this.bus(0.25, -0.1, 0.8)
    const burst = (tt, dur, f, lvl, gurgle) => {
      const bp = this.filt("bandpass", f * vary(0.06), 0.9)
      const lp = this.filt("lowpass", 1800, 0.7)
      const pk = this.filt("peaking", f * 0.5, 1.5, 6)
      const e = this.g(0)
      bp.connect(lp)
      lp.connect(pk)
      pk.connect(e)
      let tail = e
      if (gurgle) {
        const am = this.g(0.6)
        e.connect(am)
        const lfo = this.ctx.createOscillator()
        lfo.frequency.value = rand(24, 32)
        const lg = this.g(0.4)
        lfo.connect(lg)
        lg.connect(am.gain)
        lfo.start(tt)
        lfo.stop(tt + dur + 0.05)
        this.track(lfo)
        tail = am
      }
      tail.connect(out)
      e.gain.setValueAtTime(0, tt)
      e.gain.linearRampToValueAtTime(lvl, tt + 0.012)
      e.gain.exponentialRampToValueAtTime(lvl * 0.3, tt + dur * 0.4)
      e.gain.exponentialRampToValueAtTime(0.0001, tt + dur)
      e.gain.setValueAtTime(0, tt + dur + 0.005)
      this.noise(tt, tt + dur + 0.05, bp)
    }
    burst(t, 0.17, 520, 0.5, false)
    burst(t + 0.25, 0.13, 420, 0.38, true)
    const v = this.g(0) // a little voiced "uh" under the first
    v.connect(out)
    perc(v.gain, t, 0.012, 0.025, 0.12)
    this.osc("triangle", 160 * vary(0.05), t, t + 0.2, v)
  }

  // ---- global
  setMuted(m, instant) {
    const c = this.ctx
    if (instant) this.out.gain.value = m ? 0 : 1
    else fadeTo(c, this.out.gain, m ? 0 : 1, 0.15)
  }

  stopAll(fade = 1) {
    const c = this.ctx
    fade = Math.max(0.02, +fade || 0)
    const t = c.currentTime
    fadeTo(c, this.mix.gain, 0, fade, t)
    for (const L of this.layers) this.killLayer(L, fade)
    this.layers = []
    this.ambKind = "none"
    if (this.hum) {
      this.stopSrcs(this.hum.srcs, t + fade + 0.05)
      this.hum = null
    }
    if (this.low) {
      this.stopSrcs(this.low.srcs, t + fade + 0.05)
      this.low = null
    }
    if (this.rainL) {
      this.pumps.delete(this.rainL.pump)
      this.stopSrcs(this.rainL.srcs, t + fade + 0.05)
      this.rainL = null
    }
    this.stopSrcs([...this.sources], t + fade + 0.05)
    const back = t + fade + 0.1
    this.amb.gain.cancelScheduledValues(t)
    this.amb.gain.setValueAtTime(this.amb.gain.value, t)
    this.amb.gain.setValueAtTime(1, back)
    this.mix.gain.setValueAtTime(0, back)
    this.mix.gain.linearRampToValueAtTime(1, back + 0.3)
  }
}

// ------------------------------------------------------------------ facade

let ctx = null
let eng = null
let muted = false
let wantAmb = null // ambience asked for before audio could run
let lastBlip = 0

const running = () => !!(eng && ctx && ctx.state === "running")
const nowMs = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()

function call(fn) {
  if (!running()) return
  try {
    fn(eng)
  } catch (e) {
    /* never let sound break the game */
  }
}

function flushWanted() {
  if (running() && wantAmb) {
    const k = wantAmb
    wantAmb = null
    try {
      eng.ambience(k, 2)
    } catch (e) {}
  }
}

export const Sfx = {
  unlock() {
    try {
      if (!ctx) {
        const AC =
          typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)
        if (!AC) return Promise.resolve(false)
        ctx = new AC({ latencyHint: "interactive" })
        eng = new Engine(ctx, true)
        eng.setMuted(muted, true)
        ctx.onstatechange = flushWanted
      }
      if (ctx.state === "closed") return Promise.resolve(false)
      const p = ctx.state === "running" ? Promise.resolve() : ctx.resume()
      return Promise.resolve(p)
        .then(() => {
          flushWanted()
          return ctx.state === "running"
        })
        .catch(() => false)
    } catch (e) {
      return Promise.resolve(false)
    }
  },

  setMuted(m) {
    muted = !!m
    if (eng) {
      try {
        eng.setMuted(muted)
      } catch (e) {}
    }
  },
  get muted() {
    return muted
  },

  ambience(kind, fadeSec = 2) {
    if (!running()) {
      wantAmb = kind === "top" || kind === "keel" ? kind : null
      return
    }
    wantAmb = null
    call((e) => e.ambience(kind, fadeSec))
  },

  motif(i) {
    call((e) => e.motif(i))
  },
  motifResolve() {
    call((e) => e.motifResolve())
  },
  titleChord() {
    call((e) => e.titleChord())
  },

  humStart() {
    call((e) => e.humStart())
  },
  humSet(p) {
    call((e) => e.humSet(p))
  },
  humEnd(completed) {
    call((e) => e.humEnd(!!completed))
  },

  blip(who) {
    if (!running() || who === "narr") return
    const n = nowMs()
    if (n - lastBlip < 35) return
    lastBlip = n
    call((e) => e.blip(who))
  },

  tunk() {
    call((e) => e.tunk())
  },
  chalk() {
    call((e) => e.chalk())
  },
  select() {
    call((e) => e.select())
  },
  confirm() {
    call((e) => e.confirm())
  },
  step(surface = "plank") {
    call((e) => e.step(surface))
  },
  ladder() {
    call((e) => e.ladder())
  },
  lowTone(on) {
    call((e) => e.lowTone(!!on))
  },
  groan() {
    call((e) => e.groan())
  },
  rain(on) {
    call((e) => e.rain(!!on))
  },
  coo() {
    call((e) => e.coo())
  },
  cough() {
    call((e) => e.cough())
  },

  stopAll(fadeSec = 1) {
    wantAmb = null
    call((e) => e.stopAll(fadeSec))
  },

  // Test helper (not used by the game): render one call offline and measure it.
  // Resolves { peak, rms } or null if OfflineAudioContext is unavailable.
  _render(method, args = [], seconds = 4) {
    try {
      const OAC = typeof window !== "undefined" && window.OfflineAudioContext
      if (!OAC) return Promise.resolve(null)
      const sr = 44100
      const oc = new OAC(2, Math.ceil(sr * seconds), sr)
      const e = new Engine(oc, false)
      e[method](...args)
      e.pump(seconds)
      return oc.startRendering().then((buf) => {
        let peak = 0
        let sum = 0
        let n = 0
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch)
          for (let i = 0; i < d.length; i++) {
            const v = Math.abs(d[i])
            if (v > peak) peak = v
            sum += v * v
            n++
          }
        }
        return { peak, rms: Math.sqrt(sum / n) }
      })
    } catch (e) {
      return Promise.reject(e)
    }
  },
}

export default Sfx
