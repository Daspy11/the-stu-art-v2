// Rendering shared by the page and the offline video tools. Cells are drawn one pixel
// per cell (the page scales the canvas up); guys are drawn at screen resolution.

import { cellColor, PAL, EMPTY } from "./cells"
import type { World } from "./world"
import { drawFurniture } from "./furniture"

// Draw background then foreground cells (and furniture between them) into a W*H buffer.
export function renderCells(w: World, out: Uint32Array) {
  const { W, H, grid, bg } = w
  for (let y = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, k++) {
      const b = bg[k]
      out[k] = b === EMPTY ? 0 : cellColor(b, x, y)
    }
  }
  drawFurniture(w, out)
  for (let y = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, k++) {
      const c = grid[k]
      if (c === EMPTY || !PAL[c]) continue
      const col = cellColor(c, x, y)
      if (col !== 0) out[k] = col
    }
  }
}
