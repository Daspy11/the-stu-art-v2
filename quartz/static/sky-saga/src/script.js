// SKY SAGA — Chapter One: "Hanging True"
// Every word the player reads lives in this file. Code must not invent text.
//
// Line forms:
//   { who, text }                 who: narr | thrum | tunney | brick | harrow | deputy
//   { choice: id, options: [ { label, reply: [lines] } ] }   -> flags[id] = option index
//   { cue: name }                 stage direction handled by the scene (camera, sound, props)
//   { wait: ms }
// *asterisks* mark italics.

export const NAMES = {
  thrum: "Sexton Thrum",
  tunney: "Mrs. Tunney, the Tally",
  brick: "Brick",
  harrow: "Mr. Harrow",
  deputy: "Deputy",
  narr: "",
}

// ---------------------------------------------------------------- cold open
export const RHYME = ["Old holds.", "Used holds.", "Left lets go.", "Parted pulls —"]
export const RHYME_LAST = "and don't look low."

export const CAPTIONS = {
  place: "Latchford",
  sub: "Forty-one doorsteps. Two hundred and thirty years since the ground gave.",
  title: "SKY SAGA",
  chapter: "Chapter One",
  chapterName: "Hanging True",
}

// ---------------------------------------------------------------- HUD
export const ROUNDS = [
  { id: "step", label: "the step" },
  { id: "bell", label: "the bell" },
  { id: "cup", label: "the cup" },
  { id: "box", label: "the box" },
  { id: "tells", label: "the tells" },
]

export const PROMPTS = {
  move: "WASD / arrows — walk",
  talk: "E — talk",
  mind: "hold E — mind",
  read: "E — read the tell",
  ladderDown: "E — go under",
  lookLow: "hold E — look low",
  next: "E",
  skip: "hold Esc — skip",
  start: "click to begin",
}

// ---------------------------------------------------------------- scenes
export const SCENES = {
  // Mote is standing in the doorway. Thrum is outside, waiting, Deputy on his hat.
  wake: [
    { who: "thrum", text: "Morning, Mote." },
    { who: "thrum", text: "Up you come. The town won't keep itself." },
    { who: "deputy", text: "(Deputy looks at you the way a clerk looks at a queue.)" },
    { who: "thrum", text: "Mind the step." },
  ],

  // after the player has held E on their own doorstep
  stepDone: [
    { who: "narr", text: "Both feet. Count of three. The stone hums up through your boots, the way it does every morning." },
    { who: "narr", text: "There is a chip out of one corner. You don't stand on that corner." },
    { who: "thrum", text: "There. Forty-one of those, same feet, same hour, and a town stays where it's put." },
    { who: "thrum", text: "That's the whole trade. Don't let anyone tell you it's clever." },
    { who: "thrum", text: "Bell, cup, box. Then come under and we'll read the tells." },
    { who: "thrum", text: "Don't dawdle. Tunney's counting." },
    { cue: "thrumLeaves" },
  ],

  // the town bell, hanging in its frame. A mallet on a peg.
  bell: [
    { cue: "tunk" },
    { who: "narr", text: "You hit the bell with the mallet. It says *tunk*." },
    { who: "narr", text: "It used to say something else. It's been dumb two years, since the clapper went out with the lead-boat and didn't come home." },
    { who: "narr", text: "A town with no clapper goes where the wind likes. Lately the wind likes *low*." },
  ],

  // Mrs. Tunney at her standing desk, by the cistern, under the fog-net.
  tunneyHello: [
    { who: "tunney", text: "Sixty-three steps from your door, Mote. Yesterday it was fifty-eight. You're wandering." },
    { who: "tunney", text: "I count things. It isn't a hobby, it's a condition." },
    { who: "tunney", text: "Cup." },
  ],

  cup: [
    { who: "narr", text: "One cup, to the line. It tastes of slate and last week's cloud." },
    { who: "narr", text: "That's today's." },
  ],

  tunneyAssay: [
    { who: "tunney", text: "The *Persuasion* was sighted off Cold Pell at first light. Assay vessel. She'll be on us by noon." },
    { who: "tunney", text: "They bring their own plumbs. They'll find what I find." },
    { who: "tunney", text: "We are fourteen years in the red. I have counted it four times, hoping to be bad at my job." },
    { who: "tunney", text: "A town in the red is *relieved*. Every kept stone, for our own safety. Then they find us somewhere nice in a city keel." },
    { who: "tunney", text: "..." },
    { who: "tunney", text: "Your mother's step has hung true for two years, Mote. The law is a year and a day." },
    { who: "tunney", text: "A true stone drags. Cut the thread and the dragging stops. We'd be in the black by dinner." },
    { who: "tunney", text: "Abel has her written down as *away*. I've let him. I shouldn't have." },
    { who: "tunney", text: "It's a good stone." },
    {
      choice: "stone",
      options: [
        {
          label: "It's my step.",
          reply: [{ who: "tunney", text: "It's everybody's floor." }],
        },
        {
          label: "Ask Thrum.",
          reply: [
            { who: "tunney", text: "I have asked Abel. Abel changes the subject." },
            { who: "tunney", text: "He is very large and it is hard to get round him." },
          ],
        },
        {
          label: "(say nothing)",
          reply: [{ who: "tunney", text: "No. I wouldn't know what to say either." }],
        },
      ],
    },
    { who: "tunney", text: "I'm sorry. I'm also right. It's possible to be both; I've checked." },
    { who: "tunney", text: "Mind the box before you go." },
  ],

  // the toll-box: a slate box on a post beside the Tally's desk
  box: [
    { who: "narr", text: "The toll-box. Every quarter-day, everyone in Latchford comes here and pays. Nobody has ever once been glad to." },
    { who: "tunney", text: "Best-holding stone on the island. Sixty years clear of anything else we own." },
    { who: "tunney", text: "Nobody likes it. Everybody comes." },
    { who: "tunney", text: "The College of Weights has a paper explaining why. It's wrong." },
  ],

  tunneyAgain: [{ who: "tunney", text: "Noon, Mote. I'd like the tells read before I have to look anyone in the eye." }],

  // optional. An old man on a stool outside a house that is a shade greyer than the others.
  harrow: [
    { who: "harrow", text: "Morning, Mote. *(He coughs: the long, wet, Damps kind.)*" },
    { who: "harrow", text: "Sold the hearthstone to the last assay. Fair price. Kept us in bread all winter." },
    { who: "harrow", text: "It's my house. I know it's my house. I laid that floor." },
    { who: "harrow", text: "I go in for my boots and I come straight back out." },
  ],
  harrowAgain: [{ who: "harrow", text: "Go on. I'm only sitting." }],

  // east rail. A bathtub with a broom-handle mast and a bedsheet, hovering a hand's breadth up.
  brick: [
    { who: "brick", text: "MOTE. Look at her. A hand and a *half* off the deck. I measured with my hand." },
    { who: "brick", text: "Four generations of Saturday nights in that tub. Nan says that's why. Used holds!" },
    { who: "brick", text: "Thrum says she'd carry a cat. I say what the *down* does Thrum know about boats." },
    { who: "brick", text: "First rain, I'm flying her. Rain means wind. That's science." },
    { who: "brick", text: "..." },
    { who: "brick", text: "Dare you to look low." },
  ],
  brickAgain: [{ who: "brick", text: "The rail's right there. I'm not saying anything. I'm just saying it's right there." }],

  // shown one at a time while the player holds the key at the rail. t = seconds held.
  lookLow: [
    { t: 1.2, text: "It's bright." },
    { t: 3.2, text: "There's cloud. And under the cloud, more cloud." },
    { t: 5.6, text: "Nobody has ever heard anything land." },
    { t: 8.2, text: "..." },
  ],
  lookLowMax: 10.5, // Brick pulls you back
  // Brick, after. Picked by how long the player looked.
  lookLowAfter: {
    none: [{ who: "brick", text: "Yeah. Me neither." }],
    short: [
      { who: "brick", text: "Ha! That was nothing. I did four seconds once." },
      { who: "brick", text: "I was sick after. But I did it." },
    ],
    long: [
      { who: "brick", text: "...I didn't mean that long." },
      { who: "brick", text: "Your mum used to look all the time. Pilots have to." },
      { who: "brick", text: "She told me it's only weather with the lid off." },
    ],
    pulled: [
      { who: "brick", text: "Mote. *Mote.* That's enough. Come on." },
      { who: "brick", text: "..." },
      { who: "brick", text: "Don't tell Thrum I dared you." },
    ],
  },

  // trying the hatch before the rounds are done
  hatchEarly: [{ who: "narr", text: "The keel hatch. Thrum's under there already. Bell, cup, box first — he'll ask." }],

  // ------------------------------------------------------------ the keel
  keelArrive: [
    { who: "narr", text: "Under the town. The light comes from the wrong side here." },
    { who: "thrum", text: "There you are. Lantern's lit. Walk with me." },
  ],

  // Tell one: step seven. The line hangs visibly off plumb.
  tell1: [
    { who: "thrum", text: "Step seven. The Harrows. Their boy Edrin crews a salt barge." },
    { who: "thrum", text: "A flier takes a chip off the step. The step never forgets where the chip went. See the line? Leaning north and a bit east." },
    { who: "thrum", text: "So that's where he is. Further than Tuesday. He'll be eating well." },
  ],

  // A grave: a slate slab in a rope cradle, a lantern, a name.
  grave: [
    { who: "thrum", text: "Sexton Orrin. Taught me the round. Held this town up thirty-one years and has gone on doing it since." },
    { who: "thrum", text: "Say good morning." },
    {
      choice: "orrin",
      options: [
        { label: "Good morning.", reply: [{ who: "thrum", text: "There." }] },
        { label: "Does it matter if I mean it?", reply: [{ who: "thrum", text: "Not even slightly. It matters that you came." }] },
      ],
    },
  ],

  // Tell three. Step forty-one. Approach triggers this; the camera has not shown the line yet.
  tell3Approach: [
    { who: "thrum", text: "Step forty-one." },
    { who: "narr", text: "Yours. Hers. Two years hanging true: line straight, weight still, pulling for the pale." },
    { who: "narr", text: "You come here every morning. It's the job." },
    {
      choice: "mum",
      options: [
        { label: "Morning, Mum.", reply: [] },
        { label: "Morning.", reply: [] },
        { label: "(read the tell and move on)", reply: [] },
      ],
    },
    { cue: "revealTell" }, // camera tilts up: slack line, the weight pressed against the planks overhead
    { wait: 1800 },
    { who: "narr", text: "The line is slack." },
    { who: "narr", text: "The weight isn't at the end of it. The weight is over your head, flat against the underside of the deck, as if something were pulling it up through the floor." },
    { who: "thrum", text: "..." },
    { who: "thrum", text: "Tells lean. Or they hang true. Forty years I've read them and that is all they do." },
    { who: "thrum", text: "I should have cut her thread a year ago. I wrote her down as *away* so you'd keep the step. I told myself that was the reason." },
    { who: "thrum", text: "Nobody has ever left one this long. Everyone cuts. So nobody knows what a thread does after." },
    { who: "thrum", text: "I suppose we do now." },
    {
      choice: "up",
      options: [
        {
          label: "She's up there?",
          reply: [{ who: "thrum", text: "The chip is up there. And the clapper with it. That is all a stone can tell you." }],
        },
        {
          label: "What's up there?",
          reply: [{ who: "thrum", text: "Nothing. There has never been anything. That's what I don't like about it." }],
        },
      ],
    },
    { cue: "bellGroan" }, // long timber groan from above; dust sifts down; lanterns sway
    { wait: 2200 },
    { who: "thrum", text: "...That'll be the bell." },
    { who: "thrum", text: "Mote. Don't tell the Tally. Not yet. Anything strange, the assay takes first." },
    { who: "thrum", text: "Up you go. I'm not quick on ladders." },
    { who: "deputy", text: "(Deputy has already left. Deputy does not wait for people.)" },
  ],

  // ------------------------------------------------------------ the square, after
  // The bell has turned over in its frame and stands mouth-up, straining at its yoke.
  bellUp: [
    { who: "brick", text: "MOTE! The bell's upside—" },
    { who: "brick", text: "It's upside—" },
    { who: "brick", text: "What's the word for when the bottom's at the top?" },
    { who: "tunney", text: "There isn't one." },
    { cue: "rainStart" },
    { wait: 1600 },
    { who: "harrow", text: "That's rain." },
    { who: "brick", text: "I *said*. I said first rain." },
    { cue: "deputyArrives" }, // Deputy lands on the Tally's desk with a message strip
    { who: "deputy", text: "(Deputy has a message. Deputy would like it noted that it was delivered on time.)" },
    { who: "tunney", text: "\"*Persuasion.* One hour.\"" },
    { cue: "sail" }, // a dark sail shows on the bright horizon
    { who: "tunney", text: "We rose. In the night, by my line, we rose eleven feet. Towns don't rise." },
    { who: "tunney", text: "Mote. What did the tells say?" },
    {
      choice: "tell",
      options: [
        {
          label: "Nothing.",
          reply: [
            { who: "tunney", text: "..." },
            { who: "tunney", text: "You count your steps when you lie. I don't think you know you do it." },
          ],
        },
        {
          label: "Ask Thrum.",
          reply: [{ who: "tunney", text: "I intend to. I shall stand in a doorway so he can't get round me." }],
        },
        {
          label: "She's coming back.",
          reply: [
            { who: "tunney", text: "..." },
            { who: "tunney", text: "People don't, Mote." },
            { who: "tunney", text: "*(She looks at the bell for a long time.)*" },
          ],
        },
      ],
    },
    { who: "narr", text: "Everyone is looking up. Nobody in Latchford looks up. There has never been anything to see." },
    { who: "narr", text: "You go home." },
  ],

  // final: the player walks to their own step and minds it. When the hold completes:
  stepRises: [
    { who: "narr", text: "Both feet. Count of three." },
    { who: "narr", text: "The step lifts under you, a finger's width, the way a boat does when someone you know steps aboard." },
  ],
}

// ---------------------------------------------------------------- end card
export const END = {
  heading: "End of the prototype",
  line: "Thank you for minding Latchford.",
  // little "the game noticed" lines, Ledger-style
  ledgerTitle: "Entered in the Ledger, this morning:",
  mum: ["Said: “Morning, Mum.”", "Said: “Morning.”", "Read the tell and moved on."],
  stone: ["Told the Tally: “It's my step.”", "Told the Tally to ask Thrum.", "Told the Tally nothing."],
  tell: ["Lied to the Tally. Counted steps while doing it.", "Left it for Thrum.", "Said it out loud: she's coming back."],
  lookedNever: "Did not look low.",
  looked: (s) => `Looked low for ${s} second${s === 1 ? "" : "s"}.`,
  harrowSkipped: "Walked past Mr. Harrow.",
  harrowMet: "Stopped for Mr. Harrow.",
  again: "E — begin the morning again",
}
