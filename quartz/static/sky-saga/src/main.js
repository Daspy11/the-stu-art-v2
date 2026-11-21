// SKY SAGA — Chapter One, "Hanging True". Entry point.

import { R } from "./art.js"
import { Boot } from "./scenes/Boot.js"
import { Town } from "./scenes/Town.js"
import { Keel } from "./scenes/Keel.js"
import { End } from "./scenes/End.js"
import { UI } from "./scenes/UI.js"
import { SKY } from "./state.js"

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return
  const want = Promise.all([
    document.fonts.load('400 20px "Fraunces"'),
    document.fonts.load('italic 400 20px "Fraunces"'),
    document.fonts.load('600 20px "Fraunces"'),
  ]).catch(() => {})
  await Promise.race([want, new Promise((r) => setTimeout(r, 1500))])
}

fontsReady().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 960 * R,
    height: 540 * R,
    backgroundColor: "#0d0c0b",
    banner: false,
    audio: { noAudio: true },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [Boot, Town, Keel, End, UI],
  })
  SKY.game = game
  window.__sky.game = game
})
