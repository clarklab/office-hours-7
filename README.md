# OFFICE HOURS VII

A PS1-era 3D comedy-shorts show about a startup with eleven days of runway.

Three short episodes (~2 minutes each), each a **live Three.js scene** rather than a video: press play and a
directed cutscene runs in the browser — camera cuts, procedural character animation, Final
Fantasy VII-style dialogue boxes, and gibberish voice synthesis.

Everything is procedural. There are no image, audio, model or font files: every texture is drawn
on a canvas and every voice is synthesised with WebAudio at runtime.

## The show

| # | Title | Logline |
|---|---|---|
| 1 | **STANDUP** | Five people introduce themselves. It does not help. |
| 2 | **RUNWAY** | The budget meeting, run as an escalating RPG menu. |
| 3 | **TUESDAY** | A dog is in the office. Nobody agrees what to do. |

Set at **MUNCH, Inc.** — "The Everything Layer."

## Running it

No build step. It is plain ES modules served as static files.

```sh
node tools/serve.mjs       # serve the repo root
node tools/check.mjs       # Playwright smoke test: loads every page, plays every episode
node tools/shoot.mjs       # regenerate episode thumbnails
node tools/shoot.mjs cast  # regenerate the cast headshots in assets/cast/
```

## Layout

```
vendor/three.module.js   three.js r160, import-map aliased to 'three'
js/brand/logo.js         the flat line-art lockup, drawn procedurally
js/brand/logo3d.js       the lockup as real geometry, staged in the scene
js/core/ps1.js           PS1 material + post pipeline
js/core/engine.js        stage, rAF loop, resize
js/core/audio.js         voices, SFX, music
js/core/dialogue.js      FF7 dialogue boxes, menus, battle HUD
js/core/director.js      cutscene scripting
js/characters/           six characters, procedural animation
js/sets/                 the office
js/episodes/             ep1, ep2, ep3
docs/SPEC.md             the build contract
docs/EPISODE-AUTHORING.md  how to write an episode (one file); `npm run vocab`
docs/ref/                FF7 reference captures
```

## The PS1 look

Five techniques, in a hand-written shader rather than three.js's built-in lighting:

1. **Vertex snapping** — clip-space XY quantized to the 384×216 grid, giving the wobble
2. **Affine texture mapping** — defeats perspective correction, giving the texture swim
3. **Gouraud lighting** — per-vertex only, up to four point lights
4. **384×216 internal resolution**, nearest-neighbour upscaled
5. **15-bit colour** with a 4×4 Bayer dither

## Deploying

Zero-build static site. `netlify.toml` publishes the repo root with no build command.
