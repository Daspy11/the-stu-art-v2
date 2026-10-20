# Colony benchmark: generations

The goal: leave a randomly generated guy society alone and have it fill the screen
with business, like an ant colony.

## The benchmark

`npx tsx scripts/particles-bench/bench.mts --label genN --shots` leaves 16 worlds alone
for 100,000 ticks each (about 40 minutes of the landing page at its normal speed): 4
fixed random seeds on each of the landing page's real text layouts at 4 screen sizes
(laptop 1440×900, HD 1920×1080, tablet 820×1180, phone 390×844, captured with
`capture-layouts.mjs`).

**Score** is measured every 5,000 ticks, in per mille of the screen:

- cells the colony has changed: anything built (in front or behind) plus natural
  ground dug out (loose sand doesn't count)
- minus a stuck-guy penalty, converted to cells: 25 per emergency teleport home,
  0.02 per tick spent stranded, 0.02 per tick walking without getting anywhere
  (or hopping between the same few cells), 0.02 per tick hanging about in one small
  spot for 3,000+ ticks while neither working nor relaxing

The headline **score** is the average over the whole run (so getting going early
counts as well as where it ends up); **final** is the score at 100k ticks and
**worst** is the weakest of the 16 worlds at 100k, which is the "reliably" part.

Rules: no changes to world generation and no new materials. New structures and
behaviours are fine.

## Generations

Only generations that pushed the frontier are listed.

| gen | score | final | worst | penalty | guys | ms/tick | what changed |
|----:|------:|------:|------:|--------:|-----:|--------:|--------------|
