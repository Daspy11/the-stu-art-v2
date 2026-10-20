---
created: 2026-10-20
updated: 2026-10-20
share: true
title: HADES, on the web
description: A Haskell GTK desktop app for safety cases, ported module by module to TypeScript and running in a browser tab.
tags:
  - experiment
---

The [Diametric Safety Case Manager](https://github.com/PaulJohnson/hades) is a desktop app for building safety cases: goal structuring notation, hazard bow ties, risk registers, FMEAs. It was a commercial product written in Haskell with a GTK interface, and was open-sourced when Diametric closed down in 2022.

This is that app running in your browser. All 41,280 lines of the Haskell Diagram Editing System (HADES) were ported one module at a time to TypeScript, keeping the original names, behaviour and look. GTK became a small web toolkit built on React and Radix, and Cairo/Pango drawing goes to a canvas.

<p><a class="internal" href="/experiments/hades-app/" data-router-ignore>Open it full screen →</a></p>

<iframe data-router-ignore src="/experiments/hades-app/?open=1%20Quick%20Guide%20to%20the%20DSM" title="HADES running in the browser" style="width: 100%; height: 75vh; min-height: 520px; border: 1px solid var(--lightgray); border-radius: 8px;" loading="lazy"></iframe>

## Things to try

- Double-click a diagram in the tree on the right, then drag boxes around, double-click one to edit it, and undo with Ctrl+Z.
- *Hazard Log → Bow Tie Analysis → BowTie Diagram* has a hazard bow tie with controls pegged onto the threat lines.
- Your browser's back and forward buttons move between the diagrams you've opened. In the embedded version above that means they navigate the frame, not this page. Weird, as promised.
- *File → Open* takes any `.dsm` file, and *File → Save* hands you one back. You can also drop a file onto the window.

## The launch video

<video controls preload="metadata" poster="/assets/hades-launch.jpg" src="../Assets/hades-launch.mp4" style="width: 100%; border-radius: 8px;"></video>

The source is at [Daspy11/hades-web](https://github.com/Daspy11/hades-web).
