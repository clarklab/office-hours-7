# Writing an episode

An episode is **one file**: `js/episodes/epN.js`. Script, shot list, floor
marks, pacing, staging and the thumbnail pose all live in it. It imports
nothing — everything it needs arrives as `ctx`.

That is the whole contract. If you are an agent being asked to write an
episode, you are being asked to write one file.

## Before you write a line: read the vocabulary

```sh
node tools/vocab.mjs          # human-readable
node tools/vocab.mjs --json   # if you would rather parse it
```

It prints, **read live out of the running modules**:

- every **mark** the office names (50) — the floor positions `d.place()` and
  `d.walk()` accept by name
- every **camera set-up** the office ships (27) — what `d.cut()` accepts by name
- every **character**, their role, and the exact **animation vocabulary** each one
  accepts in `d.anim()`
- every **verb** the Director exposes on `d` (38)
- the layout constraints that are not discoverable from the API

Nothing in that output is hand-maintained, so it cannot drift from the code.
A hand-copied list of shot names is how the first draft of one of these
episodes ended up calling `deskCloseB`, which had been renamed to `deskRowB`.

**Use what is already there.** The coherence of the show comes from every
episode drawing on the same room, the same six people and the same camera
grammar. Invent a new angle only where the set genuinely has no coverage, and
when you do, put it in a documented `CAM` table at the top of your file the way
the existing episodes do.

## The file's shape

```js
/**
 * OFFICE HOURS VII — EPISODE FOUR: "TITLE".
 * ... what it is, and a beat budget ...
 * @module episodes/ep4
 */

const ACCENT = '#39c7b5';            // the episode's chrome colour

const CAM = { ... };                 // angles the set does not name
const SPOT = { ... };                // floor positions the set does not name

function setDressing(d, cast) { ... } // shared by run() and poster()

export default {
  async run(ctx) { ... },            // the episode
  async poster(ctx) { ... },         // a frozen frame for the thumbnail
};
```

`ctx` is `{ stage, ui, d, office, cast, THREE }`. `d` is the Director; `cast` is
keyed by character id; `office` has `.marks` and `.shots`.

### `run(ctx)`

Everything goes through the Director. **No `setTimeout`, no bare promises, no
timers of your own** — `d.cancel()` has to be able to unwind the episode
cleanly when someone hits Back mid-scene, and it can only do that for awaits it
owns. Every `d.*` await resolves (never rejects) after a cancel, so an episode
unwinds through its own `finally` blocks within a frame.

### `poster(ctx)`

Pose the scene for the thumbnail and return. `tools/shoot.mjs` calls it, renders
~30 frames and screenshots. Re-use `setDressing()` so the thumbnail and the
episode agree about where people live.

## Sound, slides and faces

All of these are listed, live, by `node tools/vocab.mjs`.

- **Music.** `d.music('intrigue')` crossfades to one of ~14 synthesised beds,
  each with a mood line (happy, breezy muzak, corporate, intrigue, tense, goofy,
  sad, triumph, dreamy flashback, 80s party, birthday…). `d.music(null)` stops.
  Give each scene a bed and change it when the mood turns.
- **Sound effects.** `d.sfx('boing')` — boing, bonk, plunk, pop, ding, success,
  cheer, applause, rimshot, sadTrombone, slideWhistle, recordScratch, gasp,
  chomp, honk, drumroll and the rest. To land a punchline, hang one on the line
  itself: `d.say(a, 'Closed him. OUT.', { sfx: 'rimshot', sfxAt: 'end' })`.
  Audition everything at `/tools/audio-audition.html`.
- **Slides.** `d.slide('projector' | 'meetingBoard' | 'whiteboard', 'barChart', opts)`
  puts a MUNCH deck slide on a surface: title, agenda, lineChart, barChart,
  pieChart, spreadsheet, meme, billboard, social, orgChart, roadmap, kpi, venn,
  quote, announcement, thanks. Most take text opts (`title`, `text`, `items`…).
  Preview them at `/tools/slides-preview.html`.
- **Faces.** Every character has `neutral`, `happy`, `shocked` and `squint`, and
  a mouth that flaps while they talk. `d.expression(a, 'squint')` holds one;
  `d.mouth(a, true)` holds the mouth open; `null` hands either back.
- **Guest stars.** A character in `GUEST_IDS` (`gary`) is only built for an
  episode whose registry entry lists it in `guests: ['gary']`.

## Registering it

One entry in `js/episodes/index.js`:

```js
Object.freeze({
  id: 'ep4', number: 4, ordinal: 'FOUR', numeral: 'IV',
  title: 'TITLE',
  logline: 'One line, present tense.',
  runtime: '2:00',                    // measured, see below
  accent: '#39c7b5',
  starring: Object.freeze(['brad', 'dez']),
  thumb: '/assets/thumbs/ep4.png',
}),
```

This is the one thing that is not in your episode file, and it is deliberate:
the landing page renders its cards from this registry **without loading any
episode module**. The episodes are 66KB of script between them, against a
46KB gallery bundle — moving this metadata into the episode files would more
than double what the landing page has to parse, purely to render six lines of
text. The registry is the site's table of contents, not part of your episode.

## Pacing

**Do not tune `cps` and `hold` to hit a runtime.** `dialogue.js` gives every
line a guaranteed minimum time on screen proportional to its length
(`readableMs()`: a 1.3s floor plus a second per 14 characters). Author `cps` and
`hold` for *relative* comic intent — this beat snappier than that one — and let
the floor set the absolute pace. An authored hold that is already longer than
the floor is kept, so a deliberate silence still works.

The target is **95–150 seconds**, asserted by the harness. Budget roughly 30–40
dialogue beats.

## Layout constraints

These are not discoverable from the API and they will cost you a rewrite:

- The **battle HUD owns `y >= 129`** of the 384×216 frame.
- A `style:'battle'` **command window owns roughly `x 8-110 / y 50-126`**.
- Together they hide anything under about **0.6m tall** unless the camera is
  literally on the carpet. Battle set-ups want to sit at 0.30–0.38m and stay
  level.
- Two dialogue boxes on screen at once need **distinct ids and `keep: true`**.
- A second line from the same character **replaces** the first unless you do
  that.
- Keep simultaneous lines short. A box that grows a third row pushes the bottom
  row of a multi-box chorus into the HUD.

## Verifying

```sh
node tools/check.mjs --ep=ep4    # plays it in a real browser, start to finish
node tools/shoot.mjs ep4         # writes assets/thumbs/ep4.png
```

The harness fails on any console error, stall, lost WebGL context, blank frame,
frame-rate collapse, or a runtime outside the window. It also writes a contact
sheet to `/tmp/oh7-check/ep4-grid.png` — **look at it**. It is the only way to
catch a character standing in a wall, a camera inside a desk, or a dialogue box
sitting on top of the one thing the shot was supposed to show.

A pass is not the same as it being good. Watch it.
