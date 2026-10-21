// The colony benchmark, faster: same worlds, same scoring as bench.mts, but the worlds
// run headless in a pool of worker threads instead of one process each.
// Usage: tsx scripts/particles-bench/fast.mts --label genN [--ticks 100000] [--seeds 4]
//          [--layouts laptop,hd,tablet,phone] [--every 5000] [--set main|holdout]
//          [--shots] [--jobs 4]
import { Worker } from "worker_threads"
import { mkdirSync, writeFileSync } from "fs"
import { cpus } from "os"

const args = process.argv.slice(2)
const opt = (name: string, def: string) => {
  const i = args.indexOf("--" + name)
  return i >= 0 ? args[i + 1] : def
}
const has = (name: string) => args.includes("--" + name)
const label = opt("label", "run")
const ticks = Number(opt("ticks", "100000"))
const every = Number(opt("every", "5000"))
const nSeeds = Number(opt("seeds", "4"))
const layouts = opt("layouts", "laptop,hd,tablet,phone").split(",")
const set = opt("set", "main")
const jobs = Number(opt("jobs", String(cpus().length)))
const shots = has("shots")

const base = set === "main" ? 0x51ed : 0xbeef
const seeds = Array.from(
  { length: nSeeds },
  (_, i) => ((Math.imul(base + i, 2654435761) >>> 0) % 900000) + 1000,
)
const dir = `bench-out/${label}`
mkdirSync(`${dir}/shots`, { recursive: true })

type Row = Record<string, number | string>
const rows: Row[] = []
const area: Record<string, number> = { hd: 4, laptop: 3, tablet: 2, phone: 1 }
const todo = layouts
  .flatMap((l) => seeds.map((s) => [s, l] as [number, string]))
  .sort((a, b) => (area[b[1]] ?? 0) - (area[a[1]] ?? 0))
const total = todo.length
const t0 = Date.now()
let done = 0

const boot = new URL("./fast-boot.mjs", import.meta.url)
await Promise.all(
  Array.from({ length: Math.min(jobs, todo.length) }, async () => {
    const worker = new Worker(boot)
    while (todo.length) {
      const [seed, layout] = todo.shift()!
      const png = shots ? `${dir}/shots/${layout}-${seed}.png` : undefined
      const out: Row[] = await new Promise((resolve, reject) => {
        worker.once("message", resolve)
        worker.once("error", reject)
        worker.postMessage({ seed, layout, ticks, every, png })
      })
      rows.push(...out)
      done++
      process.stderr.write(
        `  ${done}/${total} ${layout} ${seed} (${((Date.now() - t0) / 1000) | 0}s)\n`,
      )
    }
    await worker.terminate()
  }),
)

writeFileSync(`${dir}/runs.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const checkpoints = [...new Set(rows.map((r) => r.t as number))].sort((a, b) => a - b)
const final = rows.filter((r) => r.t === ticks)
const byRun = new Map<string, Row[]>()
for (const r of rows) {
  const k = `${r.layout}-${r.seed}`
  byRun.set(k, [...(byRun.get(k) ?? []), r])
}
const weighted = (rs: Row[], key: string) => {
  let sw = 0,
    s = 0
  for (const r of rs) {
    const wt = 1.5 - (r.t as number) / ticks
    sw += wt
    s += wt * (r[key] as number)
  }
  return sw ? s / sw : 0
}
const summary = {
  label,
  ticks,
  runs: final.length,
  score: +mean([...byRun.values()].map((rs) => weighted(rs, "score"))).toFixed(2),
  flatScore: +mean([...byRun.values()].map((rs) => mean(rs.map((r) => r.score as number)))).toFixed(
    2,
  ),
  oldMetricScore: +mean(
    [...byRun.values()].map((rs) => mean(rs.map((r) => r.scoreOld as number))),
  ).toFixed(2),
  final: +mean(final.map((r) => r.score as number)).toFixed(2),
  worstFinal: +Math.min(...final.map((r) => r.score as number)).toFixed(2),
  penalty: +mean(
    final.map((r) => (1000 * (r.penalty as number)) / ((r.W as number) * (r.H as number))),
  ).toFixed(2),
  teleports: +mean(final.map((r) => r.teleports as number)).toFixed(1),
  guys: +mean(final.map((r) => r.guys as number)).toFixed(1),
  msPerTick: +mean(final.map((r) => r.ms as number)).toFixed(2),
  byLayout: Object.fromEntries(
    layouts.map((l) => [
      l,
      +mean(final.filter((r) => r.layout === l).map((r) => r.score as number)).toFixed(2),
    ]),
  ),
  curve: checkpoints.map((t) => [
    t,
    +mean(rows.filter((r) => r.t === t).map((r) => r.score as number)).toFixed(2),
  ]),
  wallSeconds: ((Date.now() - t0) / 1000) | 0,
}
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify({ ...summary, curve: undefined }))
console.log("curve", summary.curve.map(([t, s]) => `${t / 1000}k:${s}`).join(" "))
