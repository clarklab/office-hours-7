# OFFICE HOURS — Technical & Creative Spec
_A PS1-era 3D comedy-shorts show. Read this in full before writing code._

## 0. What we are building
A static website hosting three ~60-second "episodes". Each episode is a **live Three.js
scene**, not a video: pressing play runs a directed cutscene with camera cuts, character
animation, FF7-style dialogue boxes, and gibberish voice synthesis.

Target look: **Final Fantasy VII / PlayStation 1, 1997.** Low-poly untextured-ish
primitives, chunky vertex wobble, affine texture warping, 15-bit dithered color,
384x216 internal resolution upscaled with nearest-neighbour, heavy fog, Gouraud vertex
lighting. It should look *deliberately* like a PS1 game, not like a modern low-poly game.

## 1. Hard technical constraints
- **No build step. No bundler. No npm at runtime.** Plain ES modules loaded by the browser.
- Three.js is **vendored** at `/vendor/three.module.js` (r160). Every module imports it via
  the import map alias: `import * as THREE from 'three';`
  The import map lives in the HTML pages:
  `<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>`
  **Never** import from a CDN. **Never** import `three/addons/*` (not vendored).
- All paths are **root-absolute** (`/js/...`, `/css/...`). Netlify serves from repo root.
- Target: modern Chrome/Safari/Firefox. WebGL2. No polyfills.
- Zero external network requests at runtime. All art is procedural (code-drawn canvas
  textures + primitive geometry). No image/audio/model files to load.
- Keep it fast: whole site should be < 2MB excluding three.js.
- Code style: ES2022, 2-space indent, single quotes, semicolons, `const`/`let`.
  JSDoc on every exported symbol. No TypeScript. No classes-with-inheritance towers.

## 2. Virtual resolution
```
export const VIRTUAL_W = 384;
export const VIRTUAL_H = 216;   // 16:9, PS1 pixel density
```
The 3D scene renders into a 384x216 render target and is upscaled with `NearestFilter`
into the display canvas. The DOM dialogue/UI layer is laid out in the **same 384x216
design space** and CSS-scaled by an integer-ish factor so UI pixels match scene pixels.

## 3. File ownership (do not write outside your assigned files)
```
/vendor/three.module.js        [DONE — do not touch]
/docs/SPEC.md                  [DONE — do not touch]

/js/core/ps1.js                [Agent: RENDER]
/js/core/engine.js             [Agent: RENDER]
/js/core/audio.js              [Agent: AUDIO]
/js/core/dialogue.js           [Agent: DIALOGUE]
/css/dialogue.css              [Agent: DIALOGUE]
/js/core/director.js           [Agent: DIRECTOR]
/js/characters/rig.js          [Agent: CAST]
/js/characters/brad.js         [Agent: CAST]
/js/characters/dez.js          [Agent: CAST]
/js/characters/kiki.js         [Agent: CAST]
/js/characters/roop.js         [Agent: CAST]
/js/characters/marge.js        [Agent: CAST]
/js/characters/tuesday.js      [Agent: CAST]   (the dog)
/js/characters/index.js        [Agent: CAST]
/js/sets/office.js             [Agent: SET]
/js/sets/props.js              [Agent: SET]
/js/episodes/ep1.js            [Agent: EP1]
/js/episodes/ep2.js            [Agent: EP2]
/js/episodes/ep3.js            [Agent: EP3]
/js/episodes/index.js          [Agent: SITE]
/js/player.js                  [Agent: SITE]
/js/gallery.js                 [Agent: SITE]
/index.html                    [Agent: SITE]
/watch.html                    [Agent: SITE]
/css/site.css                  [Agent: SITE]
/netlify.toml                  [Agent: SITE]
```

## 4. Module contracts (exact signatures — other agents code against these)

### 4.1 `/js/core/ps1.js` — the PS1 look
```js
export const VIRTUAL_W: number            // 384
export const VIRTUAL_H: number            // 216

/**
 * Creates a PS1 material. Vertex-snapped, affine-UV, Gouraud-lit, fogged, dithered.
 * @param {Object} o
 * @param {number|string|THREE.Color} [o.color=0xffffff]
 * @param {THREE.Texture|null} [o.map=null]
 * @param {number} [o.emissive=0x000000]  self-lit amount (for screens/lights)
 * @param {number} [o.jitter=1]           0 = no vertex snapping, 1 = full PS1 wobble
 * @param {boolean} [o.affine=true]       affine (warping) texture mapping
 * @param {boolean} [o.transparent=false]
 * @param {number} [o.opacity=1]
 * @param {THREE.Side} [o.side=THREE.FrontSide]
 * @param {number} [o.unlit=0]            1 = ignore lighting entirely
 * @returns {THREE.ShaderMaterial}
 */
export function ps1Material(o = {})

/**
 * Canvas-drawn texture, nearest-filtered, no mipmaps. Use for ALL textures.
 * @param {number} w @param {number} h
 * @param {(ctx: CanvasRenderingContext2D, w:number, h:number) => void} draw
 * @returns {THREE.Texture}
 */
export function makeTexture(w, h, draw)

/**
 * Wires the PS1 post chain onto a renderer: renders scene->384x216 RT, then a
 * fullscreen pass doing 15-bit color quantization + 4x4 Bayer dither, then
 * nearest-upscales to the canvas.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ render(scene: THREE.Scene, camera: THREE.Camera): void,
 *             setDisplaySize(w:number,h:number): void,
 *             dispose(): void }}
 */
export function createPS1Pipeline(renderer)

/** Call once per frame BEFORE render so materials see current light state. */
export function updatePS1Lights(scene)

/** Optional: nudges global wobble strength, 0..2. Default 1. */
export function setJitterScale(s)
```
Implementation notes for RENDER agent:
- **Vertex snap**: in the vertex shader, after computing `gl_Position`, snap the NDC xy to
  the virtual-resolution grid:
  `vec2 grid = vec2(VIRTUAL_W, VIRTUAL_H) * 0.5; pos.xy = floor(pos.xy / pos.w * grid + 0.5) / grid * pos.w;`
  Scale by `uJitter * uJitterScale` (lerp between snapped and unsnapped) so it can be dialled down.
- **Affine UV**: vertex: `vUv = uv * gl_Position.w; vUvW = gl_Position.w;`
  fragment: `vec2 auv = vUv / vUvW;` — this defeats the GPU's perspective correction and
  produces the signature PS1 texture swim.
- **Gouraud**: compute lighting per-vertex in the vertex shader from up to 4 point lights
  + 1 hemisphere/ambient term, pass as a single `vColor` varying. Read the lights from
  uniforms populated by `updatePS1Lights(scene)` (walk the scene for `THREE.PointLight`
  and `THREE.AmbientLight`/`HemisphereLight`). Do NOT use three's built-in lighting chunks.
- **Fog**: exponential, per-vertex, color from `scene.fog.color`, density from `scene.fog.density`.
  Respect `scene.fog` being null.
- **Post pass**: quantize to 5 bits/channel with a 4x4 Bayer threshold added before the
  floor. Also apply a very subtle horizontal chroma smear (optional, tasteful).
- Materials must be **reused/cached** where possible; expose them on a module-level registry
  so `updatePS1Lights` can push uniforms to all of them in one pass.
- The pipeline's RT is fixed at 384x216. `setDisplaySize` only changes the output canvas size.
- IMPORTANT: geometry must be reasonably tessellated for vertex lighting to look right —
  but keep poly counts PS1-low. Use `BoxGeometry(w,h,d,1,1,1)` mostly; add segments only
  where lighting demands it.

### 4.2 `/js/core/engine.js` — the runtime shell
```js
/**
 * @typedef {Object} Stage
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.WebGLRenderer} renderer
 * @property {HTMLCanvasElement} canvas
 * @property {number} time            seconds since start()
 * @property {(fn:(dt:number,t:number)=>void)=>()=>void} onUpdate  returns unsubscribe
 * @property {()=>void} start
 * @property {()=>void} stop
 * @property {()=>void} dispose
 * @property {(w:number,h:number)=>void} resize
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Stage}
 */
export function createStage(canvas)
```
- Camera: `PerspectiveCamera(55, 384/216, 0.1, 200)`.
- `start()` runs a rAF loop: advance clock (clamp dt to 1/20s), run update callbacks in
  registration order, `updatePS1Lights(scene)`, then `pipeline.render(scene, camera)`.
- `stop()` cancels rAF. `dispose()` frees GL resources and the pipeline.
- `resize(w,h)` fits the 16:9 output into w x h and calls `pipeline.setDisplaySize`.
- Scene default: `scene.fog = new THREE.FogExp2(0x101822, 0.020)` and matching background.
  Episodes may override.

### 4.3 `/js/core/audio.js` — Peanuts-gibberish voices, SFX, music
```js
/** @typedef {'brad'|'dez'|'kiki'|'roop'|'marge'|'tuesday'|'narrator'} VoiceId */

/** Must be called from a user gesture before anything else. Idempotent. */
export function initAudio()
/** @returns {boolean} */
export function isAudioReady()
export function setMuted(m)      /** @param {boolean} m */
export function isMuted()

/**
 * Speak a line as gibberish blips. Resolves when the blips finish.
 * The dialogue system calls `blip()` per revealed character instead, so this is
 * mainly for one-shots; PREFER `makeSpeaker`.
 */
export function speak(voiceId, text)

/**
 * @param {VoiceId} voiceId
 * @returns {{ blip(ch: string): void, stop(): void }}
 * `blip` plays one syllable tone appropriate to the character for that letter.
 * Callers should call it roughly every 2-3 revealed characters, skipping whitespace.
 */
export function makeSpeaker(voiceId)

/** @param {'cursor'|'confirm'|'cancel'|'error'|'chime'|'fanfare'|'bark'|'phone'|'crash'|'stamp'|'whoosh'|'shred'|'typewriter'} id */
export function playSfx(id, opts = {})

/** Simple looping chiptune bed. @param {'lobby'|'tense'|'chase'|'victory'|null} id */
export function playMusic(id)
export function stopMusic()
```
Implementation notes for AUDIO agent:
- Pure WebAudio, **no audio files**. One shared `AudioContext`, created lazily in `initAudio()`.
- Voice profiles must be **strongly distinct** — this is a core comedy beat:
  - `brad`  — Peanuts-adult trombone wah: sawtooth through a sweeping bandpass ("wah wah"),
              low (~180Hz), slow, confident, slight downward slide.
  - `dez`   — brassy square wave, fast, high energy, ~260Hz, upward pitch flicks.
  - `kiki`  — tiny high sine/triangle blips ~520Hz, very fast, flat, deadpan, short decay.
  - `roop`  — low mumbling triangle ~120Hz through a lowpass, slow, minimal pitch variance.
  - `marge` — clipped narrow pulse ~340Hz, precise, metronomic, sharp attack/decay.
  - `tuesday` — not speech: short filtered-noise + pitch-drop "borf" barks.
  - `narrator` — neutral mid square, moderate.
- Pitch per blip should derive deterministically from the character code so the same line
  always sounds the same (`ch.charCodeAt(0)`), scaled by the profile's `spread`.
- Every note needs an attack/decay envelope — no clicks. Keep master gain modest (~0.25).
- `playMusic` builds a short scheduled loop of simple oscillator notes (minor-key,
  PS1 menu music vibes). Must be stoppable and must not stack if called twice.
- Everything must no-op gracefully if `initAudio()` was never called or audio is muted.

### 4.4 `/js/core/dialogue.js` + `/css/dialogue.css` — FF7 dialogue UI
```js
/**
 * @param {HTMLElement} host  a positioned container sized to the 384x216 design space
 * @returns {DialogueUI}
 */
export function createDialogue(host)

/**
 * @typedef {Object} DialogueUI
 * @property {(o: SayOpts) => Promise<void>} say
 * @property {(o: MenuOpts) => Promise<number>} menu
 * @property {(o: TitleOpts) => Promise<void>} title      big episode title card
 * @property {(o: NameCardOpts) => Promise<void>} nameCard character intro placard
 * @property {(text: string, ms?: number) => Promise<void>} toast   small top-of-screen banner
 * @property {(text: string) => void} setSubtitle          persistent bottom-left caption, '' clears
 * @property {() => void} clear
 * @property {() => void} dispose
 * @property {(v:boolean)=>void} setSkippable
 */

/**
 * @typedef {Object} SayOpts
 * @property {string} [speaker]      name plate text; omit for narration
 * @property {string} text           may contain \n for explicit line breaks
 * @property {import('./audio.js').VoiceId} [voice]
 * @property {string} [color]        CSS color for the name plate accent
 * @property {number} [cps=34]       characters per second
 * @property {number} [hold=750]     ms to hold after the text completes
 * @property {'bottom'|'top'} [pos='bottom']
 * @property {boolean} [auto=true]   auto-advance after hold (episodes run unattended)
 */

/** @typedef {{prompt?:string, options:string[], voice?:string, auto?:number, pick?:number}} MenuOpts */
/** `auto` = ms before auto-selecting `pick` (default 0 index). Cursor visibly walks to it. */

/** @typedef {{title:string, subtitle?:string, ms?:number}} TitleOpts */
/** @typedef {{name:string, role:string, color?:string, stats?:string[], ms?:number}} NameCardOpts */
```
Visual requirements (this is the single most recognisable FF7 element — get it right):
- Dialogue box: rounded-ish rectangle, **vertical gradient from #1c3a8c (top) to #050a30
  (bottom)**, ~85% opaque, with a **1px white/light-blue double border** and slightly
  darker inner bevel. Sits across the bottom with a small margin. Fixed height for 3
  lines of text at the virtual resolution.
- Text: white, 1px hard black offset shadow, monospace pixel-ish font stack
  (`'Courier New', monospace` is fine but tighten letter-spacing; better: a CSS-drawn
  pixel look via `font-family: ui-monospace, 'Courier New', monospace; font-weight:700`).
  Type on character-by-character.
- Name plate: small box above/inset at the top-left of the dialogue box, in the character's
  accent color, uppercase.
- Advance cursor: a small **white triangle** bottom-right of the box that blinks once the
  line is fully revealed.
- Menu: a separate right-aligned FF7-style box with a `▶` cursor that steps between rows,
  plays `cursor` sfx on each step and `confirm` on select.
- Name card: large slab that slides in from the left with the character's name, role, and
  2-3 fake RPG stats (e.g. `HP 40/40`, `LV 3`, `MP —`), in an FF7 menu-box style.
- Title card: centered, letter-spaced, with a slow fade.
- ALL layout in the 384x216 design space using px units; the host element is CSS-scaled.
- `image-rendering: pixelated` on the host; no anti-aliased rounded corners bigger than 2px;
  no CSS blur/backdrop filters (they break the pixel look).
- Every promise-returning method must resolve even if `setSkippable(true)` and the user
  clicks — clicking completes the current reveal immediately, second click advances.

### 4.5 `/js/core/director.js` — cutscene scripting
```js
/**
 * @param {import('./engine.js').Stage} stage
 * @param {DialogueUI} ui
 * @returns {Director}
 */
export function createDirector(stage, ui)

/**
 * @typedef {Object} Director
 * // --- time ---
 * @property {(ms:number)=>Promise<void>} wait
 * @property {()=>boolean} cancelled
 * @property {()=>void} cancel                 aborts the running script ASAP
 * // --- camera ---
 * @property {(shot: Shot) => void} cut        instant camera cut
 * @property {(shot: Shot, ms:number, ease?:string) => Promise<void>} move  smooth camera move
 * @property {(target: THREE.Object3D|THREE.Vector3, o?: {dist?:number, height?:number, angle?:number, fov?:number}) => Shot} shotOn
 * @property {(amount?:number, ms?:number)=>void} shake
 * @property {(ms?:number, color?:string)=>Promise<void>} fadeOut
 * @property {(ms?:number)=>Promise<void>} fadeIn
 * // --- actors ---
 * @property {(actor: Actor, to: THREE.Vector3|[number,number,number], ms?:number)=>Promise<void>} walk
 * @property {(actor: Actor, target: THREE.Object3D|THREE.Vector3|null)=>void} face
 * @property {(actor: Actor, anim: string)=>void} anim
 * @property {(actor: Actor, emote: string)=>Promise<void>} emote
 * // --- dialogue passthrough (adds auto-voice + auto-face-camera) ---
 * @property {(actor: Actor|null, text: string, o?: object)=>Promise<void>} say
 * @property {(o: MenuOpts)=>Promise<number>} menu
 * @property {(o: TitleOpts)=>Promise<void>} title
 * @property {(actor: Actor)=>Promise<void>} nameCard
 * // --- misc ---
 * @property {(id:string, o?:object)=>void} sfx
 * @property {(id:string|null)=>void} music
 */

/** @typedef {{pos:[number,number,number]|THREE.Vector3, look:[number,number,number]|THREE.Vector3, fov?:number}} Shot */
```
- `move` must run off the stage's update loop (not setInterval) and honour `cancel()`.
- Every awaitable in the Director must reject-free-resolve immediately once `cancel()` is
  called, so `dispose()` never leaves a dangling script.
- `say(actor, text)` derives `speaker`, `voice` and `color` from `actor.profile` (§4.6),
  points the actor's head at the camera, and plays a talking animation while typing.
- `walk` moves the actor along the XZ plane at a constant speed, sets the `walk` animation,
  faces the direction of travel, and returns to `idle` on arrival.

### 4.6 `/js/characters/rig.js` + the cast
```js
/**
 * @typedef {Object} CharProfile
 * @property {string} id         'brad'|'dez'|'kiki'|'roop'|'marge'|'tuesday'
 * @property {string} name       display name, e.g. 'BRAD'
 * @property {string} fullName   'BRAD HOLLOWAY'
 * @property {string} role       'FOUNDER / CEO'
 * @property {string} color      accent CSS hex, e.g. '#39c7b5'
 * @property {string} voice      VoiceId
 * @property {string[]} stats    2-3 joke RPG stats
 * @property {number} height     approx world height in metres
 */

/**
 * @typedef {Object} Actor
 * @property {THREE.Group} group        root; place with group.position
 * @property {CharProfile} profile
 * @property {THREE.Object3D} head
 * @property {THREE.Object3D} body
 * @property {Object<string,THREE.Object3D>} parts   named joints: hipL/kneeL/armL/foreL/etc
 * @property {(name:string)=>void} play              'idle'|'walk'|'talk'|'panic'|'point'|'type'|'shrug'|'cheer'|'slump'|'sit'
 * @property {()=>string} current
 * @property {(dt:number, t:number)=>void} update
 * @property {(target:THREE.Object3D|THREE.Vector3|null)=>void} lookAt
 * @property {(name:string)=>Promise<void>} emote    'sweat'|'anger'|'question'|'exclaim'|'heart'|'money'|'zzz'
 * @property {(v:boolean)=>void} setSitting
 * @property {THREE.Object3D|null} prop              the character's signature hand prop
 */

/** rig.js exports */
export function createRig(profile, build)   // build(parts, mat) -> attaches meshes to joints
export function boxMesh(w,h,d, matOpts, segs) // convenience; returns Mesh with ps1Material
export function cylMesh(rt,rb,h,seg, matOpts)
export const SKINS  // a few PS1-palette skin tone colors

/** each character file: */
export function createBrad(): Actor        // brad.js
export function createDez(): Actor         // dez.js
export function createKiki(): Actor        // kiki.js
export function createRoop(): Actor        // roop.js
export function createMarge(): Actor       // marge.js
export function createTuesday(): Actor     // tuesday.js  (quadruped dog rig; anims: idle|walk|run|sit|bark|shake|sniff|zoomies)

/** index.js */
export const CAST = { brad: createBrad, dez: createDez, kiki: createKiki, roop: createRoop, marge: createMarge, tuesday: createTuesday }
export const PROFILES = { brad: {...}, ... }   // the CharProfile objects, importable without building geometry
export function spawn(id): Actor
```
Rig requirements:
- Humanoid skeleton of nested `Object3D` joints: `root > hips > (spine > chest > (neck > head, shoulderL > armL > foreL > handL, shoulderR > ...)), thighL > shinL > footL, thighR > ...`
  Meshes are **children of joints**, offset so the joint is the pivot. Animations rotate joints only.
- **~1.75m tall humans.** World units are metres. Feet at y=0 for `group.position.y = 0`.
- PS1 budget: aim 300-900 triangles per character. Boxes and low-segment cylinders only.
- Faces are **textures**, not geometry — draw them with `makeTexture` (32x32 or 64x64):
  PS1 faces are 2 dark eye blobs, a mouth line, maybe a nose pixel. Give each character a
  face texture with a couple of frames (neutral / talk-open / shocked) packed in a
  2x2 atlas and swap `map.offset` for talking. Affine warping should be ON for faces.
- Animations are **procedural** (sin/cos on joint rotations driven by `update(dt,t)`), with
  a short cross-fade (~0.15s) between poses. No keyframe data files.
- `emote` spawns a small always-camera-facing sprite-ish quad above the head (sweat drop,
  anger vein, `?`, `!`, `$`) using `makeTexture`, animates it up and fades, resolves after ~900ms.
- **Silhouette is the whole point.** Each character must be identifiable as a black
  silhouette at 384x216. See §6 for the mandated designs.

### 4.7 `/js/sets/office.js` + `/js/sets/props.js`
```js
/**
 * @typedef {Object} OfficeSet
 * @property {THREE.Group} group
 * @property {Object<string, THREE.Vector3>} marks     named floor positions for actors
 * @property {Object<string, Shot>} shots              named camera setups
 * @property {Object<string, THREE.Object3D>} props    named interactive props
 * @property {(dt:number,t:number)=>void} update       flicker lights, spin fan, screens
 * @property {(room:'bullpen'|'break'|'meeting'|'reception')=>void} focusRoom  // dims other rooms
 */
/** @returns {OfficeSet} */
export function createOffice()
```
- One continuous floor plan, all four rooms built at once (camera cuts between them —
  cheaper and lets characters walk room to room):
  - **RECEPTION** (around x = -9): desk with a phone, MULCH logo wall, a very sad plant,
    two waiting chairs, a wall clock.
  - **BULLPEN** (x = -4..4, the middle): 4-5 desks with beige CRT monitors, keyboards,
    rolling chairs, waist-high cubicle partitions, a whiteboard on wheels, a water cooler,
    stacked banker's boxes, a dead plant.
  - **BREAK ROOM** (around x = 9, z = -4): fridge covered in magnets, microwave, coffee
    machine, round table + 3 chairs, vending machine (mostly empty), a `LABEL YOUR FOOD`
    poster, a sink.
  - **MEETING ROOM** (around x = 9, z = 5): long table, 6 chairs, big whiteboard,
    pull-down projector screen, a speakerphone starfish in the middle of the table.
- Environment: carpet-tile floor texture, drop ceiling with fluorescent panels (one
  flickers), a window wall with a flat PS1 cityscape backdrop, dado-rail walls.
- Lighting: 3-4 `PointLight`s (that's the cap the PS1 shader supports) + an `AmbientLight`.
  Cold fluorescent (0xbfd4e8) key, a warm (0xffc98a) bounce, keep it slightly grim.
- `marks` MUST include at least: `reception`, `receptionBehindDesk`, `bullpenCenter`,
  `deskBrad`, `deskDez`, `deskKiki`, `deskRoop`, `deskMarge`, `breakRoom`, `breakTable`,
  `fridge`, `meetingRoom`, `meetingHead`, `meetingSeat1..4`, `doorway`, `hallway`,
  `whiteboard`, `waterCooler`, `copier`.
- `shots` MUST include at least: `establish`, `bullpenWide`, `bullpenLow`, `receptionDesk`,
  `breakWide`, `breakTable`, `meetingWide`, `meetingHead`, `meetingReverse`, `doorway`,
  `ceiling`, `floorLevel`, `whiteboard`.
- Props MUST include named handles for: `whiteboard`, `projectorScreen`, `fridge`,
  `vending`, `waterCooler`, `speakerphone`, `plant`, `logoWall`, `clock`, `copier`.
- `props.js` holds the reusable furniture factories (desk, chair, crt, fridge, etc.) so
  `office.js` stays a layout file.
- Poly budget: whole set under ~6000 triangles.

### 4.8 `/js/episodes/epN.js`
```js
/**
 * @typedef {Object} EpisodeDef
 * @property {string} id            'ep1'
 * @property {number} number        1
 * @property {string} title         'STANDUP'
 * @property {string} logline       one line for the gallery card
 * @property {string} runtime       '1:00'
 * @property {string[]} starring    character ids
 * @property {string} accent        CSS hex for the gallery card
 * @property {(ctx: EpisodeCtx) => Promise<void>} run
 * @property {(ctx: EpisodeCtx) => void} [poster]   pose the scene for a thumbnail, no dialogue
 */
/** @typedef {{stage:Stage, ui:DialogueUI, d:Director, office:OfficeSet, cast:Object<string,Actor>, THREE:any}} EpisodeCtx */
export default /** @type {EpisodeDef} */ ({ ... })
```
- The player builds the stage, office, and the full cast, positions nothing, then calls
  `run(ctx)`. The episode is responsible for placing actors and driving everything.
- `run` must complete in **55-70 seconds** with `auto:true` dialogue. Count it: at 34 cps a
  30-character line is ~0.9s + 0.75s hold. Budget ~30-40 dialogue beats max.
- `run` must be **cancellation-safe**: every await goes through the Director, which
  short-circuits after `d.cancel()`.
- `poster(ctx)` sets up a good-looking frozen frame for the thumbnail screenshot.

### 4.9 `/js/episodes/index.js`, `/js/player.js`, `/js/gallery.js`, pages
```js
// index.js
export const EPISODES = [ /* lazily-loaded descriptors */ ]
export async function loadEpisode(id)   // dynamic import()
```
- `index.html`: the show's landing page — hero title, three episode cards with thumbnail
  images (`/assets/thumbs/ep1.png` etc, with a CSS gradient fallback if missing), title,
  logline, runtime, a "▶ WATCH" affordance, plus a cast strip and an about blurb.
  Style: PS1 game-manual / late-90s but tasteful and modern-responsive. Dark, CRT-ish,
  scanlines, chunky type. Must look genuinely good, not like a joke.
- `watch.html?ep=ep1`: the player. Full-bleed 16:9 stage, the dialogue host layer scaled
  over it, a title/idle screen with a big PLAY button (needed anyway for the audio gesture),
  a progress bar, REPLAY / MUTE / BACK controls that auto-hide, and NEXT EPISODE at the end.
  Controls must be keyboard accessible (Enter/Space to play, M to mute, Esc to go back).
- Player responsibilities: create stage, build office + cast, scale the DOM UI layer to
  match the canvas, call `initAudio()` on the play gesture, run the episode, handle
  cancel on navigate-away, show an end card.
- `netlify.toml`: publish the repo root, no build command, plus long cache headers for
  `/vendor/*` and a 200-rewrite-free plain static config.

## 5. The show
**Title:** `OFFICE HOURS` — sub-branded `a Mulch production`.
**Company:** **MULCH, Inc.** — "The Everything Layer." A Series A startup whose product is
never explained. Eleven days of runway. Office is one floor of a business park.
**Tone:** deadpan, absurd, affectionate. Workplace comedy via JRPG grammar. Never mean.
No profanity, no punching down, no real-company names.

## 6. The cast (mandated designs — CAST and EPISODE agents must both honour these)

| id | name | role | accent | silhouette hook |
|---|---|---|---|---|
| `brad` | BRAD HOLLOWAY | FOUNDER / CEO | `#39c7b5` | tallest; hair spike; **puffy vest** over dress shirt |
| `dez` | DEZ VALENTI | HEAD OF SALES | `#e0457b` | **huge shoulder-padded** magenta suit; shades; ponytail |
| `kiki` | KIKI PARK | FRONT OF HOUSE | `#7ee04a` | shortest; **big round hair**; headset with mic boom; coiled phone cord |
| `roop` | RUPERT "ROOP" NG | IT | `#8f7ae0` | **hood up**, hunched, oversized hoodie, cargo shorts, socks+sandals |
| `marge` | MARGUERITE OKONKWO | FINANCE | `#e8a33d` | ramrod straight; **tight bun**; enormous round glasses; red ledger |
| `tuesday` | TUESDAY | UNAUTHORISED DOG | `#c98a4b` | scruffy tan dog, one floppy + one up ear, metronome tail |

Joke stats (use these or equally good ones):
- BRAD — `LV 9`, `HP 40/40`, `VIBES 999`
- DEZ — `LV 12`, `HP 88/88`, `CLOSE RATE 4%`
- KIKI — `LV 7`, `HP 62/62`, `PATIENCE 0`
- ROOP — `LV 14`, `HP 31/31`, `TICKETS 402`
- MARGE — `LV 11`, `HP 55/55`, `MP 12` (`MP` = "Mild Panic")
- TUESDAY — `LV ?`, `HP ???`, `GOOD 10/10`

## 7. Episode briefs (EPISODE agents: this is your story spine; write better jokes than these)

### EP1 — "STANDUP"  (accent `#39c7b5`)
Cold open on the office. Each of the five gets a **name card** intro and one silly line,
delivered in their own space (Brad at the whiteboard, Dez on a call at his desk, Kiki at
reception, Roop under a desk, Marge behind a wall of binders). Then Brad calls everyone
into the meeting room for the standup and all five share one wide shot — overlapping
non-sequiturs, one RPG menu beat, and a button: Brad says something optimistic, Marge
silently holds up a number, cut to black.
Seed jokes: Brad "I don't believe in meetings — that's why this is a *standup*."
Dez "I've got a whale on the hook. He doesn't know it yet. He doesn't know me."
Kiki "Front desk. No he's not. No he's not. No he's not." Roop "Have you tried turning
yourself off and on again?" Marge "I've prepared a slide. It's one number. It's red."

### EP2 — "RUNWAY"  (accent `#e8a33d`)
Meeting room. Marge presents the burn chart; runway is 11 days. Brad asks the room for
ideas. Run it as an escalating **RPG menu** — the player/director picks options that get
progressively more unhinged: sell the espresso machine → stop paying for the internet →
"we become a nonprofit, legally, to confuse investors" → Dez proposes selling the office
chairs while everyone is sitting in them (they all stand up in unison) → Roop suggests
mining crypto on the printers → Kiki suggests charging the sales team for the chairs they
just sold → Brad's final idea is a rebrand. Marge's chart goes *down* every time. Button:
the lights cut out mid-sentence and everyone keeps talking in the dark.

### EP3 — "TUESDAY"  (accent `#c98a4b`)
A dog is in the office. Nobody knows how. Framed like a **JRPG random encounter**: a
"! TUESDAY APPEARED" banner, a battle-style menu of what to do (`TALK`, `FEED`, `ADOPT`,
`RUN`), and everyone disagrees loudly. Kiki has already named it and made it a badge. Dez
wants to put it on a sales call. Roop is allergic but won't say so. Marge is calculating
the dog's per-head cost. Brad declares it the new Head of Culture. The dog does exactly one
correct thing and everyone takes credit. Button: the dog sits in Brad's chair; everyone
defers to it.

## 8. Quality bar
- Every episode must be watchable end-to-end with no console errors and no stalls.
- The camera must never clip through geometry or point at nothing.
- Dialogue must always be readable at 384x216 — no line longer than ~40 characters.
- If a character speaks, their mouth/head must animate. If two characters are in a shot,
  the non-speaking one must still be doing *something*.
- Check your own work in the browser before you report done (see §9).

## 9. Local verification (every agent that writes runtime code)
```
cd /home/user/office-hours-7
python3 -m http.server 8080 &        # or: npx --yes serve -l 8080
node tools/check.mjs                 # Playwright smoke test (created by the INTEGRATION agent)
```
Until `tools/check.mjs` exists, at minimum verify your module parses and its exports are
present, e.g.:
```
node --input-type=module -e "import('file:///home/user/office-hours-7/js/core/audio.js').then(m=>console.log(Object.keys(m)))"
```
(Modules that import `three` will fail under bare node — that is expected; those must be
checked in the browser instead. Do not add a node shim for the bare `three` specifier;
`tools/check.mjs` drives a real browser.)
