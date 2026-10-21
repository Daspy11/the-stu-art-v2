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

To make "busier" something I can measure, there's a benchmark. It takes 16 random worlds (4 seeds, each laid out like the real front page at laptop, HD, tablet and phone sizes) and leaves each alone for 100,000 ticks, about 40 minutes on the page. The **score** is how much of the screen the guys have changed (built on or dug out), in thousandths of the screen, minus a penalty whenever a guy is stuck in one place or going round in a loop. The headline number is the average over the whole run, so getting going quickly counts too.

The rules: anything the guys *do* can change, but the terrain generator and the materials can't.

![[Assets/ant-colony/score-chart.png]]

| generation | score | after 40 minutes | worst world |
|---|--:|--:|--:|
| 0: where it started | 14.9 | 9.5 | -135.6 |
| 1: the nest | 25.0 | 41.1 | -20.3 |
| 2: more hands, bigger loads | **28.1** | **46.8** | **22.3** |

## Gen 0: where it started

The guys built a handful of towers and then ran out of things to do. About half an hour in, crowds stood about at home, which the stuck penalty counts, so the score went *down*. Phones were worst: the text leaves only a thin strip of sky, so there's barely room for a tower, and one phone world built nothing at all. Meanwhile the whole ground band, a sixth of the screen, sat untouched apart from a single mine.

## Gen 1: the nest

A finished mine now becomes a **nest**. The guys keep carrying its galleries further and opening new levels off the shaft, always through solid ground, propped up with timber posts and lit with lanterns. Finished stretches of gallery become **rooms** that get furnished with beds and tables, and furniture attracts newcomers, so even a phone can grow a town underground.

Fixes found along the way:

- **Unreachable steps stalled projects forever.** A guy who couldn't reach the next step of a build never gave up on it, so the whole project stood still. Now steps nobody can get to are skipped.
- **Doomed towers were planned over and over.** One phone world planned the same unreachable tower 13 times. Now abandoned sites are remembered for a while.

## Gen 2: more hands, bigger loads

Late in a run the guys spent 55% of their time walking to building sites, 24% walking to and from the stockpile, and just over 1% actually building, because a guy carried at most 400 wood (half a storey). Now they carry three times as much, and the more guys there are, the more tunnels get dug at once.

![[Assets/ant-colony/gen0-gen2-phone-825701.png]]

*The same phone world after 40 minutes: before, two guys standing on a hill; now two towers and a furnished nest.*

![[Assets/ant-colony/gen0-gen2-laptop-429927.png]]

*A laptop world: much the same town, now with four storeys of rooms underneath.*

![[Assets/ant-colony/gen0-gen2-tablet-261462.png]]

*The tablet world that used to come last.*

## Still to do

- On wide screens everything happens near home, and half the world is never touched.
- Stone piles up in the tens of thousands while towers wait for wood, standing as bare frames.
- Guys still walk far more than they work.
