// Shared game state: flags (player choices), dev params, and the test hook.

const params = new URLSearchParams(location.search)

export const DEV = {
  skip: params.get("skip") || null, // rounds | keel | after | end
  fast: params.get("fast") === "1",
}

// Cinematic time scale: only ?fast=1 changes it.
export const T = (ms) => (DEV.fast ? Math.min(ms, Math.max(60, ms * 0.08)) : ms)

export function freshFlags() {
  return {
    rounds: { step: false, bell: false, cup: false, box: false, tells: false },
    stone: null, // tunneyAssay choice
    orrin: null,
    mum: null,
    up: null,
    tell: null,
    tunneyMet: false,
    harrowMet: false,
    harrowTalks: 0,
    brickTalks: 0,
    lookSeconds: null, // null = never looked
    lookAfterPlayed: false,
  }
}

export const SKY = {
  flags: freshFlags(),
  state: "boot",
  scene: null,
  muted: false,
  unlocked: false,
  dev: DEV,
  scenes: ["Boot", "Town", "Keel", "End", "UI"],
}

export function resetFlags() {
  SKY.flags = freshFlags()
  window.__sky.flags = SKY.flags
}

export function setState(s) {
  SKY.state = s
  window.__sky.state = s
}

window.__sky = {
  get flags() {
    return SKY.flags
  },
  set flags(v) {},
  state: SKY.state,
  scenes: SKY.scenes,
  dev: DEV,
}
