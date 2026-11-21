# SKY SAGA — Chapter One, "Hanging True": playable tutorial design

Target: five minutes. Story first. One verb. All text lives in `quartz/static/sky-saga/src/script.js` and is final; code must not add, cut or reword any of it.

## What the player should walk away knowing (without being told)

1. The town stays up because people do the same small things every day. (They did it themselves, with one key.)
2. It is habit, not affection. (The toll-box.)
3. Down is bright, bottomless and a swear word. (They chose to look, or didn't.)
4. A tell that hangs straight means someone fell. Mote's mother's has hung straight for two years, and the adults have been arguing about it over Mote's head.
5. This morning it points up. So does the bell she took the clapper from. Then it rains.

## The one verb: mind

**Hold E** on a kept thing to mind it. A ring fills over ~1.6 s, a hum swells, slate-dust lifts off the stone. Releasing early drains the ring. Completing it ticks a chalk mark on the rounds slate. **Press E** to talk or advance text. Movement is WASD/arrows (screen-relative: up key = up the screen). Tap/click also works: tap ground to walk there, tap a prompt to do it, tap text to advance.

Nothing else. No inventory, no combat, no fail state.

## Beat sheet

| t | Beat | Player does | What it shows |
|---|---|---|---|
| 0:00 | **Cold open.** Black, wind. The rhyme, one line per soft note. The fifth line small and italic. | watches (hold Esc skips) | the rules |
| 0:18 | The game immediately disobeys the fifth line: fade up on **nothing but pale light**. Two decks of cloud far below drift. Hold. | — | the Long Way |
| 0:24 | Camera **rises**. Into frame from above: hanging lines with slate weights, grave slabs in rope cradles with lanterns, net-bags of soil, the tarred timbers of the keel, the rock flank, then over the lip — Latchford at dawn, smoke, fog-nets, pigeons. Title fades in the sky, then place caption. | — | where we live, and on top of what |
| 0:48 | **Wake.** Thrum outside Mote's door. "Mind the step." | first input: hold E on own doorstep | the verb; the trade |
| 1:15 | **Rounds, alone.** Bell (*tunk*; the missing clapper), then Tunney: the cup, the assay, the proposal about the stone (choice), the toll-box. | walk, mind ×3, talk, 1 choice | scarcity; the law; the bind |
| 2:30 | **Optional:** Mr. Harrow outside his spent house (on the path east). Brick and the bathtub at the east rail. The rail: hold E to look low. | optional talk; optional look | cost of rendering; play; the taboo |
| 3:10 | **Under.** Hatch by the square opens when bell/cup/box are done. Keel-walk with Thrum: tell one (leaning), Orrin's grave (choice), tell forty-one. | walk, 2 choices | tells; the dead; the reveal |
| 4:10 | **Reveal.** Slack line. Camera tilts up to the weight pressed against the planks. Thrum confesses. Timber groans overhead. | 1 choice | the lie; the unknown |
| 4:30 | **Square.** Bell stands mouth-up. Rain. Deputy's message. A sail on the bright horizon. Tunney asks what the tells said (choice: lie / deflect / tell). | 1 choice | stakes |
| 4:50 | **Home.** Walk to your own step in the rain. Mind it. It lifts. Camera rises through the rain; the rhyme returns, four lines, and the fifth doesn't come. Title. Ledger of what you did. | walk, hold E | — |

The opening must be watchable with zero input and must be over in 48 seconds. Hold Esc skips it.

## Staging notes

- **The world is one tall scene.** The cold open is not a separate illustration: the isometric town sits at the top of a tall world whose lower 1,500 px are the keel underside, hanging lines and cloud decks. The opening shot is simply the game camera starting far below the island and rising to its gameplay position. The keel-walk interior is a second scene.
- **Light comes up.** The signature look: the screen is *brighter at the bottom*. Sky runs from a cool blue-grey at the top through peach to white-gold at the bottom. Top faces of things are cool; undersides and lower side-faces catch warm light. In the keel, figures are near-silhouettes rim-lit from beneath.
- **Mote's doorstep** has a visible chip out of one corner from the first frame. Nobody mentions why until the keel.
- **The bell** hangs mouth-down in a timber frame in the square, with a mallet on a peg. After the keel it stands mouth-up, its ropes taut *upward*, swaying slightly.
- **Harrow's house** is the same shape as the others but a shade greyer and flatter, no smoke, door ajar. He sits outside it.
- **Brick's bathtub** bobs a hand's breadth off the deck with a broom mast and a bedsheet sail. It bobs higher in the final scene. Nobody remarks on it.
- **Looking low:** the camera slides out past the rail and down until the island leaves the frame and the screen is only pale light and slow cloud. Wind drops out. A single very low tone comes in. Text fragments fade in and out, centred. A thin vignette creeps in over ten seconds. Releasing snaps gently back. At 10.5 s Brick pulls you back.
- **The reveal** is a camera move, not a text box: the line is seen slack first, then the camera travels *up* it.
- **Thrum leaves** for the hatch after the step; he walks, slowly, and is gone under by the time the player reaches the square.
- **Rain** falls from the first cue to the end. Fine, straight, sparse; it is rare here and everyone has stopped to look at it.
- **Last shot:** after the step lifts, camera drifts up past the roofs into the rain toward the pale-gold top of the sky. The rhyme's four lines appear one at a time with their notes. Where the fifth line was, a long rest, then the motif resolves up an octave and the title comes in: SKY SAGA / Chapter One / Hanging True.

## Art direction

Flat, geometric, generous. Drawn in code and never pretending otherwise: no outlines, no gradients inside shapes, no texture noise, no faux hand-drawn wobble. Three tones per material (top / lit side / shade side). Rounded where things are soft (felt, people, smoke), hard-edged where they are slate. Big simple silhouettes that read at a glance.

**Palette**

| | |
|---|---|
| sky top / mid / pale | `#8fa9b8` / `#ecd3b8` / `#fff4dc` |
| slate (top, lit, shade) | `#55616d` / `#6f6a66` / `#333a43` |
| deck plank | `#8d7359` / `#a5876a` / `#5e4b3b` |
| tarred timber | `#2b2724` / `#3a3531` |
| moss / terrace green | `#7f9c6b` / `#5d7a52` |
| soil | `#5a4334` |
| rope / silk | `#d7c39a` |
| wax yellow (Mote, lanterns, cake) | `#f0b93a`, glow `#ffe6a0` |
| Thrum's felt | `#2f5d50` |
| Tunney's ink | `#2b3a67` |
| Brick's scarf | `#c8452f` |
| Harrow / spent grey | `#9a9690` |
| text cream / ink | `#fbf1dc` / `#23201d` |

**People** are chess-piece simple: a rounded coat shape, a round head, two dot eyes, no mouth. They are told apart by silhouette and one colour.
- Mote: small; a yellow coat like a bell that reaches the ankles; sleeves past the hands; dark bowl of hair.
- Thrum: very wide and tall, a green dome; flat-brimmed hat; a pigeon on the hat; a tiny bell at the belt.
- Deputy: grey pigeon, pale chest, one orange dot of eye. Faces away from whoever is talking.
- Tunney: tall, narrow, ink-blue, like a closed umbrella; hair in a tight knot; a ledger held to the chest.
- Brick: small, squarish, brown; huge red scarf with a tail that moves.
- Harrow: stooped grey lozenge on a stool; a cap.

Two-frame idle bob. Walking is a small hop. Each has a simple large portrait (same shapes, bigger) beside the text box.

**Text box**: bottom of the screen, tarred-timber dark with a cream serif, a thin rope-coloured rule on top, speaker name in small caps. Narration has no name and is set italic, centred, without a portrait. Typewriter reveal with a soft per-voice blip; E completes the line, then advances. Choices appear as a short stacked list with a wax-yellow marker.

**HUD**: a small slate tablet top-right titled ROUNDS with the five items in chalk; each gets a chalk tick with a tiny scratch sound. One contextual prompt, bottom centre, above the text box area. Nothing else on screen.

**Type**: Fraunces (Google Fonts) for everything; fall back to Georgia.

## Audio direction (all synthesised, no samples)

- **Wind bed**: filtered noise, slow swell. Lower and hollower in the keel. Cuts to nothing when looking low.
- **Stay hum**: when minding — a soft stacked drone (D2, A2, F♯3) that swells with the ring and settles into a small chime on completion.
- **Motif** (plucked, kalimba-like, lots of air): D4 · A4 · F♯4 · E4, one note per rhyme line. Unresolved. At the very end it resolves: … E4, rest, D5.
- **Bell**: a dead *tunk* (short thud, a little inharmonic ring that dies at once).
- **Voices**: one short blip per few characters — Thrum low and round, Tunney mid and dry, Brick high and quick, Harrow breathy, Deputy a single coo per line. Narration silent.
- **Keel**: rope creaks at random; a drip.
- **Look low**: one sine at ~46 Hz with a very slow beat against 47 Hz.
- **Groan**: the bell turning over above — a long descending timber creak, then silence.
- **Rain**: sparse soft ticks on slate, building slightly.
