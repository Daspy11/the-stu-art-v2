// The colony benchmark: leaves many random worlds alone for a long time and scores
// how much of the screen their guys have built on or dug out (minus a penalty for
// guys who get stuck). See run-one.mts for the scoring.
//
// Usage: tsx scripts/particles-bench/bench.mts --label gen3 [--ticks 100000]
//          [--seeds 4] [--layouts laptop,hd,tablet,phone] [--every 5000] [--set main|holdout]
//          [--shots] [--jobs 4]
// Writes bench-out/<label>/runs.jsonl, summary.json and (with --shots) final screenshots.
import { spawn } from "child_process"
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

// fixed, arbitrary seeds so every generation is judged on the same worlds
const base = set === "main" ? 0x51ed : 0xbeef
const seeds = Array.from(
  { length: nSeeds },
  (_, i) => ((Math.imul(base + i, 2654435761) >>> 0) % 900000) + 1000,
)
const dir = `bench-out/${label}`
mkdirSync(`${dir}/shots`, { recursive: true })

type Row = Record<string, number | string>
const rows: Row[] = []
const todo = layouts.flatMap((l) => seeds.map((s) => [s, l] as [number, string]))
// big screens first so the stragglers are small
const area: Record<string, number> = { hd: 4, laptop: 3, tablet: 2, phone: 1 }
todo.sort((a, b) => (area[b[1]] ?? 0) - (area[a[1]] ?? 0))

const t0 = Date.now()
let done = 0
async function worker() {
  while (todo.length) {
    const [seed, layout] = todo.shift()!
    const cmd = [
      "tsx",
      "scripts/particles-bench/run-one.mts",
      String(seed),
      layout,
      String(ticks),
      String(every),
    ]
    if (shots) cmd.push("--png", `${dir}/shots/${layout}-${seed}.png`)
    await new Promise<void>((resolve) => {
      const p = spawn("npx", cmd, { stdio: ["ignore", "pipe", "inherit"] })
      let buf = ""
      p.stdout.on("data", (d) => (buf += d))
      p.on("close", () => {
        for (const line of buf.split("\n")) if (line.startsWith("{")) rows.push(JSON.parse(line))
        done++
        process.stderr.write(
          `  ${done}/${layouts.length * seeds.length} ${layout} ${seed} (${((Date.now() - t0) / 1000) | 0}s)\n`,
        )
        resolve()
      })
    })
  }
}
await Promise.all(Array.from({ length: jobs }, worker))

writeFileSync(`${dir}/runs.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const checkpoints = [...new Set(rows.map((r) => r.t as number))].sort((a, b) => a - b)
const final = rows.filter((r) => r.t === ticks)
const byRun = new Map<string, Row[]>()
for (const r of rows) {
  const k = `${r.layout}-${r.seed}`
  byRun.set(k, [...(byRun.get(k) ?? []), r])
}
// headline: the score averaged over the whole run, with early checkpoints counting a
// bit more (weights fall from 1.5 at the start to 0.5 at the end), so a colony that
// gets going quickly beats one that only catches up at the end
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
const auc = mean([...byRun.values()].map((rs) => weighted(rs, "score")))
const flat = mean([...byRun.values()].map((rs) => mean(rs.map((r) => r.score as number))))
const old = mean(
  [...byRun.values()].map((rs) => mean(rs.map((r) => (r.scoreOld ?? r.score) as number))),
)
const summary = {
  label,
  ticks,
  runs: final.length,
  score: +auc.toFixed(2),
  flatScore: +flat.toFixed(2),
  oldMetricScore: +old.toFixed(2),
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
