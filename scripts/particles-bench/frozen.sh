#!/bin/bash
# Runs the benchmark against a frozen copy of the simulation, so you can keep editing
# while it runs. Usage: [REF=<commit>] scripts/particles-bench/frozen.sh --label genN [bench options]
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SNAP=$(mktemp -d /tmp/particles-bench-XXXX)
mkdir -p "$SNAP/quartz/components/scripts" "$SNAP/scripts" "$ROOT/bench-out"
# REF=<commit> benchmarks that commit's simulation with today's benchmark scripts
if [ -n "$REF" ]; then
  (cd "$ROOT" && git archive "$REF" quartz/components/scripts/particles) | tar -x -C "$SNAP"
else
  cp -r "$ROOT/quartz/components/scripts/particles" "$SNAP/quartz/components/scripts/"
fi
cp -r "$ROOT/scripts/particles-bench" "$SNAP/scripts/"
ln -s "$ROOT/node_modules" "$SNAP/node_modules"
ln -s "$ROOT/bench-out" "$SNAP/bench-out"
cp "$ROOT/package.json" "$SNAP/"
cd "$SNAP" && npx tsx scripts/particles-bench/bench.mts "$@"
rm -rf "$SNAP"
