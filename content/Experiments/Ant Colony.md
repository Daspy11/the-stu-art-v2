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

The rules: anything the guys *do* can change, but the terrain generator and the materials can't.

![[Assets/ant-colony/score-chart.png]]

| generation | score | after 40 minutes | worst world |
|---|--:|--:|--:|
| 0: where it started | 18.5 | 25.1 | -52.9 |
| 2: the nest | 24.4 | 45.1 | 13.3 |
| 4: stores and swimmers | 24.7 | 44.9 | 13.3 |
| 6: more diggers, sooner | **27.8** | **51.4** | 6.7 |

![[Assets/ant-colony/gen0-gen6-tablet-706844.png]]

*The same tablet world after 40 minutes, at the start and now.*

## Gen 0: where it started

The guys built a handful of towers and then ran out of things to do, and crowds stood about at home. Phones were worst: the text leaves only a thin strip of sky, so there's barely room for a tower, and one phone world built nothing at all. Meanwhile the whole ground band, a sixth of the screen, sat untouched apart from a single mine.

## Gens 1 and 2: the nest

A finished mine now becomes a **nest**. The guys keep carrying its galleries further and opening new levels off the shaft, always through solid ground, propped up with timber posts and lit with lanterns. Finished stretches of gallery become **rooms** that get furnished with beds and tables, and furniture attracts newcomers, so even a phone can grow a town underground.

They also carry three times as much wood per trip. Before, guys spent 55% of their time walking to building sites, 24% walking to the stockpile and about 1% actually building, because one load was only half a storey.

![[Assets/ant-colony/gen0-gen6-phone-825701.png]]

*A phone world: before, two guys standing on a hill; now towers and a furnished nest.*

## Gens 3 and 4: stores and swimmers

Every mine shaft gets its own little store of wood and stone at the top, so diggers don't trek home for timber. Spreading mines out across the whole screen sounded good but made things worse (crews spent their time walking to far-off shafts), so mines stay near home.

## Gens 5 and 6: more diggers, sooner

The first mine was one enormous job, and the nest didn't open until about 50,000 ticks in. Now a new mine is just a shaft and a short starter gallery, and the nest opens in half the time. From there, lots of small crews of two dig different galleries at once, instead of everyone waiting on one.

![[Assets/ant-colony/gen0-gen6-hd-202618.png]]

*An HD world: the same towers, and now three levels of rooms under the town.*

## Little things fixed along the way

- Stuck builds: a guy who couldn't reach the next step of a build never gave up on it, so whole projects stood still for good. One phone world planned the same unreachable tower 13 times.
- Swimmers flickered between swimming and falling as ripples passed under them, sometimes bobbed in place for thousands of ticks, and couldn't swim across lakes to fetch wood. A swimmer trapped in a pit never asked for rescue.
- Felled trees now topple over and break up instead of vanishing.
- The material menu on the front page opened behind the world instead of on top of it.
- Resizing the window regenerated the world on every pixel of the drag and filled up the browser's storage.
- The benchmark itself got about 4× faster: the falling-sand step was checking every cell of the screen every tick, even though nearly all of it is still ground and empty sky. It now skips rows with nothing loose in them, and plays out exactly the same.

## Still to do

![[Assets/ant-colony/gen6-mountain.png]]

*The weakest world: the colony lives on a mountain top. Nowhere is flat enough for a mine shaft, so nothing gets dug at all, and guys strand themselves on the slopes.*

- Mountains: tunnelling straight into hillsides, not just down from flat ground.
- Wide screens: everything still happens near home.
- Guys still walk far more than they work.
