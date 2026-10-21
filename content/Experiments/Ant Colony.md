---
created: 2026-10-21
updated: 2026-10-21
share: true
ai: true
title: Turning the front page into an ant farm
description: Benchmarking the little stick-figure society on this site's front page, and making it busier one generation at a time.
tags:
  - experiment
---

There's a little world under the text on this site's [front page](/): sand, water, trees and a crowd of stick-figure guys who fell trees, dig and build towers. The goal is to be able to leave a random world alone and come back to a screen full of business, like an ant farm.

To make "busier" something I can measure, there's a benchmark. It takes 32 random worlds (8 seeds, each laid out like the real front page at laptop, HD, tablet and phone sizes) and leaves each alone for 100,000 ticks, about 40 minutes on the page. The **score** is how much of the screen the guys have changed (built on or dug out), in thousandths of the screen, minus a penalty whenever a guy gets stuck: stranded somewhere, walking without getting anywhere, or going round in a loop. A guy who simply has nothing left to do isn't counted as stuck. The headline number averages the whole run, with the early part counting a bit more, so getting going quickly matters.

The rules: anything the guys _do_ can change, but the terrain generator and the materials can't.

![[Assets/ant-colony/score-chart.png]]

| generation              |    score | after 40 minutes | worst world |
| ----------------------- | -------: | ---------------: | ----------: |
| 0: where it started     |     18.5 |             25.1 |       -52.9 |
| 2: the nest             |     24.4 |             45.1 |        13.3 |
| 4: stores and swimmers  |     24.7 |             44.9 |        13.3 |
| 6: more diggers, sooner |     27.8 |             51.4 |         6.7 |
| 7: into the hills       |     28.5 |             52.4 |    **16.2** |
| 8: everyone pitches in  |     50.3 |             88.5 |        20.6 |
| 9: the long way round   |     55.8 |             99.0 |        21.4 |
| 10: winzes              |     64.1 |            118.1 |        47.8 |
| 11: nobody left behind  | **66.9** |        **121.5** |    **49.8** |

![[Assets/ant-colony/gen0-gen6-tablet-706844.png]]

_The same tablet world after 40 minutes, at the start and now._

## Gen 0: where it started

The guys built a handful of towers and then ran out of things to do, and crowds stood about at home. Phones were worst: the text leaves only a thin strip of sky, so there's barely room for a tower, and one phone world built nothing at all. Meanwhile the whole ground band, a sixth of the screen, sat untouched apart from a single mine.

## Gens 1 and 2: the nest

A finished mine now becomes a **nest**. The guys keep carrying its galleries further and opening new levels off the shaft, always through solid ground, propped up with timber posts and lit with lanterns. Finished stretches of gallery become **rooms** that get furnished with beds and tables, and furniture attracts newcomers, so even a phone can grow a town underground.

They also carry three times as much wood per trip. Before, guys spent 55% of their time walking to building sites, 24% walking to the stockpile and about 1% actually building, because one load was only half a storey.

![[Assets/ant-colony/gen0-gen6-phone-825701.png]]

_A phone world: before, two guys standing on a hill; now towers and a furnished nest._

## Gens 3 and 4: stores and swimmers

Every mine shaft gets its own little store of wood and stone at the top, so diggers don't trek home for timber. Spreading mines out across the whole screen sounded good but made things worse (crews spent their time walking to far-off shafts), so mines stay near home.

## Gens 5 and 6: more diggers, sooner

The first mine was one enormous job, and the nest didn't open until about 50,000 ticks in. Now a new mine is just a shaft and a short starter gallery, and the nest opens in half the time. From there, lots of small crews of two dig different galleries at once, instead of everyone waiting on one.

![[Assets/ant-colony/gen0-gen6-hd-202618.png]]

_An HD world: the same towers, and now three levels of rooms under the town._

## Gen 7: into the hills

The weakest worlds were mountain tops: nowhere flat enough for a mine shaft, so nothing got dug at all. When no shaft fits, the guys now drive an **adit**, a tunnel straight into the hillside from a ledge they can stand on. It starts as an open cutting, gets roofed over and propped with timber as it goes deeper, and once it's done it becomes a nest like any other, with its own store and rooms. The worst of the 32 worlds now scores 16 instead of 7.

![[Assets/ant-colony/gen6-gen7-tablet-34153.png]]

_A mountain-top tablet world: before, one tower and nothing dug; now a tunnel through the hill, with a store at its mouth._

## Gen 8: everyone pitches in

Watching where the guys' time actually went was eye-opening: over a third of it was spent wandering about with nothing to do, while the stores held thousands of planks and stone. Three things were holding them back:

- **One mine at a time.** Mines could only go near home, the shaft had to reach the very bottom of the screen, and only one could be dug at once. Now there's a mine on the go for every dozen guys, anywhere on the screen, near a store but away from the other nests, and as deep as the ground allows. That's how the colony spreads out.
- **Crews with nothing to do.** Guys signed up to big tower crews even when every job within sight was already taken, then wandered off. Now they only join a project that has work going.
- **Pointless trips to the store.** A guy with an armful of wood whose next job was digging would carry it all the way back to the store, dig, then fetch it again. Or they'd run off to whichever project happened to be first on the list, often the far side of the map. Now they keep it while their own job still needs it, and otherwise takes it to the nearest job that does.

With all that, there's enough work for a bigger town, so wide screens can now grow to 72 guys.

![[Assets/ant-colony/gen7-gen8-hd-765688.png]]

_An HD world: twice the score, with the nest dug the whole way across._

![[Assets/ant-colony/gen7-gen8-laptop-202618.png]]

_A laptop world: a second village is going up on the right, over its own nest._

## Gen 9: the long way round

With everyone busy, the next waste was walking. A few things were sending guys the long way round:

- **Lakes over the nest.** A gallery wasn't allowed anywhere with water or sand anywhere above it, even with solid ground in between, so a lake on the surface cut the nest in two. Now it only needs a solid roof, and the galleries run right under lakes.
- **Swimmers turning back.** Every ripple on a lake made a swimming guy think the way ahead had gone, so they'd stop, rethink, swim a few strokes and stop again. Crossing a lake could take a thousand ticks.
- **Picking the emptiest job, not the nearest.** A guy finishing up would trek across the map to a project with one more free slot, instead of joining the one next to him. Now they join the nearest job that wants hands, and mine shafts don't take more diggers than fit.
- **Wood.** The woodpile kept running dry, so every store now gets its own wood lot planted around it.

![[Assets/ant-colony/gen8-gen9-tablet-538379.png]]

_A tablet world: the hill is now an ant hill, hollowed out level after level._

![[Assets/ant-colony/gen8-gen9-phone-538379.png]]

_A phone world: from a couple of towers to a village over two levels of nest._

## Gen 10: winzes

New levels of the nest could only be opened off the main shaft, every twelve rows. A cave, a lake or just the shaft being in the wrong place left whole stretches of ground out of reach, and small screens ran out of digging by about a third of the way through.

Now a gallery can sink a **winze**, a little ladder shaft of its own, twelve rows up or down to start a new level, as long as there's solid ground all the way. So the nest grows in every direction, a level at a time, like a real ant nest. Rooms it cuts through are split around the hole, and no winze goes where there's furniture.

![[Assets/ant-colony/gen9-gen10-tablet-34153.png]]

_The mountain-top world that used to be the weakest: now the whole mountain is a nest._

![[Assets/ant-colony/gen9-gen10-laptop-261462.png]]

_A laptop world: the far shore of the lake finally gets dug, and there are levels all the way along._

## Gen 11: nobody left behind

A generation of bug fixes, found by hunting down where the stuck-guy penalty came from:

- **A tower that cut the colony in two.** A tower's stone foundation went down right across the only path to a whole nest, and dozens of guys found themselves stranded underground and gave up. Towers were checked for this when they were planned, but nests grow, and a path that didn't matter then can matter a lot by the time the stone goes down. Now every solid block is checked as it's placed, and if it would wall off part of the colony the builders leave a doorway instead.
- **Five guys frozen at a lake's edge.** A tower went up over the next spot on their path while they were treading water, and they flicked between "falling" and "hopping" forever, so they never stopped to think again.
- **Swimmers who couldn't be rescued.** A guy stranded in a lake would plan a rope ladder down to the lake bed, which they couldn't reach. The ladder now stops at the water.

![[Assets/ant-colony/gen10-gen11-laptop-706844.png]]

_The laptop world with the five frozen guys: nobody is stuck now, and it shows._

## Little things fixed along the way

- Swimmers stopped and turned around every time a ripple passed under the next stroke.
- An abandoned mine kept its place on the to-do list, and its ground, forever, so that world never tried another one.
- Stuck builds: a guy who couldn't reach the next step of a build never gave up on it, so whole projects stood still for good. One phone world planned the same unreachable tower 13 times.
- Swimmers flickered between swimming and falling as ripples passed under them, sometimes bobbed in place for thousands of ticks, and couldn't swim across lakes to fetch wood. A swimmer trapped in a pit never asked for rescue.
- Felled trees now topple over and break up instead of vanishing.
- The material menu on the front page opened behind the world instead of on top of it.
- Resizing the window regenerated the world on every pixel of the drag and filled up the browser's storage.
- The benchmark itself got about 4× faster: the falling-sand step was checking every cell of the screen every tick, even though nearly all of it is still ground and empty sky. It now skips rows with nothing loose in them, and plays out exactly the same.

## Still to do

- Stone piles up by the tonne with not much to spend it on.
- Some towers stand as bare frames for a long time; crews start more than they finish.
- Phones are still the weakest screens: there's barely any flat ground to dig a mine from.
- Guys still walk far more than they work.
