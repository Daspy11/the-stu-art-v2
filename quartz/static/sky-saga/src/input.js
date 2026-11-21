// Keyboard state shared by all scenes (DOM-level so every scene sees the same thing).
// Presses are edge events cleared once per game step (after all scenes update).

const held = new Set()
let pressed = new Set()
let released = new Set()
const listeners = []

const GAME_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "KeyE",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Escape",
  "KeyM",
])

window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.has(e.code)) e.preventDefault()
  if (e.repeat) return
  held.add(e.code)
  pressed.add(e.code)
  for (const fn of listeners) fn(e.code)
})
window.addEventListener("keyup", (e) => {
  held.delete(e.code)
  released.add(e.code)
})
window.addEventListener("blur", () => {
  for (const k of held) released.add(k)
  held.clear()
  Input.pointerHold = false
})

const ACT = ["KeyE", "Space", "Enter"]

export const Input = {
  pointerHold: false, // pointer held on the prompt
  pointerPressed: false, // pointer tapped the prompt this step
  onKey(fn) {
    listeners.push(fn)
  },
  isDown(code) {
    return held.has(code)
  },
  wasPressed(code) {
    return pressed.has(code)
  },
  take(code) {
    if (pressed.has(code)) {
      pressed.delete(code)
      return true
    }
    return false
  },
  // interact (E / Space / Enter)
  actHeld() {
    return ACT.some((k) => held.has(k)) || Input.pointerHold
  },
  actPressed() {
    return ACT.some((k) => pressed.has(k)) || Input.pointerPressed
  },
  takeAct() {
    let hit = Input.pointerPressed
    Input.pointerPressed = false
    for (const k of ACT) if (pressed.delete(k)) hit = true
    return hit
  },
  axis() {
    let x = 0,
      y = 0
    if (held.has("ArrowLeft") || held.has("KeyA")) x -= 1
    if (held.has("ArrowRight") || held.has("KeyD")) x += 1
    if (held.has("ArrowUp") || held.has("KeyW")) y -= 1
    if (held.has("ArrowDown") || held.has("KeyS")) y += 1
    return { x, y }
  },
  upPressed() {
    return pressed.has("ArrowUp") || pressed.has("KeyW")
  },
  downPressed() {
    return pressed.has("ArrowDown") || pressed.has("KeyS")
  },
  endStep() {
    pressed = new Set()
    released = new Set()
    Input.pointerPressed = false
  },
  clear() {
    pressed = new Set()
    Input.pointerPressed = false
  },
}
