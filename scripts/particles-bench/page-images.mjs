// Images for the Experiments page: a score chart across generations and same-seed
// before/after comparisons. Usage:
//   node scripts/particles-bench/page-images.mjs chart gen0 gen1 gen2
//   node scripts/particles-bench/page-images.mjs compare gen0 gen2 phone-825701 laptop-429927 ...
import sharp from "sharp"
import { readFileSync, mkdirSync } from "fs"

const OUT = "content/Assets/ant-colony"
mkdirSync(OUT, { recursive: true })
const [mode, ...args] = process.argv.slice(2)
const summary = (g) => JSON.parse(readFileSync(`bench-out/${g}/summary.json`, "utf8"))
const runs = (g) =>
  readFileSync(`bench-out/${g}/runs.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l))
// "w8-gen6" -> "6"
const name = (g) => g.replace(/^.*gen/, "")
const FONT = "font-family='DejaVu Sans, Helvetica, Arial, sans-serif'"
const COLORS = ["#b9b2a6", "#d08c4f", "#5b8fd1", "#5aa36b", "#a46cc4", "#d1595b", "#3fa5a0", "#e0b400"]

if (mode === "chart") {
  const gens = args
  const W = 760, H = 360, L = 56, R = 120, T = 24, B = 44
  const all = gens.map((g) => summary(g).curve)
  const ymax = Math.ceil(Math.max(...all.flat().map(([, s]) => s)) / 10) * 10
  const X = (t) => L + ((W - L - R) * t) / 100000
  const Y = (s) => T + (H - T - B) * (1 - Math.max(0, s) / ymax)
  let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><rect width='100%' height='100%' fill='#fbfaf7'/>`
  for (let s = 0; s <= ymax; s += 10)
    svg += `<line x1='${L}' x2='${W - R}' y1='${Y(s)}' y2='${Y(s)}' stroke='#e6e2da'/><text x='${L - 8}' y='${Y(s) + 4}' text-anchor='end' font-size='12' fill='#77736b' ${FONT}>${s}</text>`
  for (let t = 0; t <= 100000; t += 25000)
    svg += `<text x='${X(t)}' y='${H - B + 18}' text-anchor='middle' font-size='12' fill='#77736b' ${FONT}>${t / 1000}k</text>`
  svg += `<text x='${(L + W - R) / 2}' y='${H - 8}' text-anchor='middle' font-size='12' fill='#77736b' ${FONT}>ticks left alone (100k ≈ 40 minutes)</text>`
  gens.forEach((g, i) => {
    const pts = [[0, 0], ...all[i]]
    const c = COLORS[i % COLORS.length]
    svg += `<polyline fill='none' stroke='${c}' stroke-width='${i === gens.length - 1 ? 3.5 : 2.5}' points='${pts.map(([t, s]) => `${X(t)},${Y(s)}`).join(" ")}'/>`
    const [lt, ls] = pts[pts.length - 1]
    svg += `<text x='${X(lt) + 8}' y='${Y(ls) + 4}' font-size='13' fill='${c}' font-weight='bold' ${FONT}>gen ${name(g)}: ${ls.toFixed(0)}</text>`
  })
  svg += `</svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/score-chart.png`)
  console.log(`${OUT}/score-chart.png`)
} else if (mode === "compare") {
  const [a, b, ...worlds] = args
  const ra = runs(a), rb = runs(b)
  for (const w of worlds) {
    const [layout, seed] = w.split("-")
    const score = (rs) => rs.find((r) => r.layout === layout && r.seed === +seed && r.t === 100000)?.score ?? 0
    const shot = (g) => `bench-out/${g}/shots/${layout}-${seed}.png`
    const meta = await sharp(shot(a)).metadata()
    // the ground and what's on it: the bottom of the screen
    const cropH = Math.round(meta.height * (layout === "phone" ? 0.42 : layout === "tablet" ? 0.45 : 0.5))
    const crop = { left: 0, top: meta.height - cropH, width: meta.width, height: cropH }
    const side = layout === "phone" || layout === "tablet"
    const width = side ? 340 : 760
    const img = async (g, s) => {
      const im = await sharp(shot(g)).extract(crop).resize({ width }).png().toBuffer()
      const h = (await sharp(im).metadata()).height
      const label = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${h}'><rect x='8' y='8' rx='4' width='${150}' height='26' fill='#ffffffd9'/><text x='16' y='26' font-size='14' fill='#333' ${FONT}><tspan font-weight='bold'>gen ${name(g)}</tspan>  score ${s.toFixed(0)}</text></svg>`
      return { buf: await sharp(im).composite([{ input: Buffer.from(label) }]).png().toBuffer(), h }
    }
    const A = await img(a, score(ra)), Bm = await img(b, score(rb))
    const gap = 10
    const out = side
      ? { width: width * 2 + gap, height: A.h, parts: [{ input: A.buf, left: 0, top: 0 }, { input: Bm.buf, left: width + gap, top: 0 }] }
      : { width, height: A.h * 2 + gap, parts: [{ input: A.buf, left: 0, top: 0 }, { input: Bm.buf, left: 0, top: A.h + gap }] }
    const file = `${OUT}/gen${name(a)}-gen${name(b)}-${layout}-${seed}.png`
    await sharp({ create: { width: out.width, height: out.height, channels: 3, background: "#ffffff" } })
      .composite(out.parts)
      .png({ palette: true })
      .toFile(file)
    console.log(file)
  }
}
