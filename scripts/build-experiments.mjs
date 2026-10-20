#!/usr/bin/env node
// Builds the apps listed in experiments.json and places them in public/experiments/<slug>-app/,
// next to the Quartz output (the Quartz page for an experiment is public/experiments/<slug>.html,
// so the app gets its own folder beside it). Each experiment is a separate repository with its own build; this
// script clones it (shallow) and runs its build command with OUT set to the target directory.
//
// Usage: node scripts/build-experiments.mjs [slug ...]   (run after `npx quartz build`)
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const experiments = JSON.parse(fs.readFileSync(path.join(root, "experiments.json"), "utf8"))
const only = process.argv.slice(2)
// Clone outside this repository, so the experiments' builds don't pick up this site's
// configuration files (PostCSS, Tailwind) by searching parent directories.
const cache = path.join(os.tmpdir(), "stu-art-experiments")
fs.mkdirSync(cache, { recursive: true })

for (const exp of experiments) {
  if (only.length > 0 && !only.includes(exp.slug)) continue
  const src = path.join(cache, exp.slug)
  const out = path.join(root, "public", "experiments", `${exp.slug}-app`)
  console.log(`\n▶ ${exp.slug}: ${exp.repo}@${exp.ref}`)
  fs.rmSync(src, { recursive: true, force: true })
  execSync(`git clone --depth 1 --branch ${exp.ref} https://github.com/${exp.repo}.git "${src}"`, {
    stdio: "inherit",
  })
  fs.rmSync(out, { recursive: true, force: true })
  execSync(exp.build, { cwd: src, stdio: "inherit", env: { ...process.env, OUT: out } })
  console.log(`✓ ${exp.slug} → public/experiments/${exp.slug}-app/`)
}
