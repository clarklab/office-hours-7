#!/usr/bin/env node
/**
 * OFFICE HOURS VII — publishes /docs, the episode-authoring instructions.
 *
 * The vocabulary tables on that page are generated from the LIVE modules, the
 * same read `npm run vocab` does. A hand-written page listing 50 marks and 27
 * camera set-ups is wrong the first time anybody renames one, and an agent
 * writing against a wrong page produces an episode that fails at run time.
 *
 *   node tools/docs.mjs          # writes docs/index.html
 *   npm run docs
 *
 * @module tools/docs
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './serve.mjs';
import { readVocab } from './vocab.mjs';

/** @param {string} s @returns {string} */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** @param {string[]} items @returns {string} */
const chips = (items) => `<ul class="chips">${items.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;

/**
 * @param {Object} v vocabulary from readVocab()
 * @returns {string} the whole page
 */
function page(v) {
  const castRows = v.cast.map((id) => {
    const p = v.profiles[id] || {};
    return `<tr>
      <td><code>${esc(id)}</code></td>
      <td>${esc(p.fullName || p.name || id)}</td>
      <td>${esc(p.role || '')}</td>
      <td class="anims">${(v.anims[id] || []).map((a) => `<code>${esc(a)}</code>`).join(' ')}</td>
    </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Writing an episode — OFFICE HOURS VII</title>
<meta name="description" content="Everything needed to write a single-file episode of OFFICE HOURS VII: the marks, camera set-ups, characters, animations and Director verbs that already exist.">
<meta name="robots" content="index, follow">
<link rel="icon" href="/assets/mark.png">
<link rel="stylesheet" href="/css/brand.css">
<link rel="stylesheet" href="/css/site.css">
<style>
  .doc { max-width: 60rem; margin: 0 auto; padding: clamp(18px, 4vw, 44px) var(--gutter) 80px; }
  .doc h1 { margin: 0 0 6px; }
  .doc h2 { margin: 42px 0 10px; padding-top: 14px; border-top: 1px solid var(--edge); }
  .doc h3 { margin: 24px 0 6px; font-size: 13px; letter-spacing: var(--track-mid); text-transform: uppercase; color: var(--oh-silver); }
  .doc p, .doc li { line-height: 1.65; }
  .doc code { background: rgba(5,7,12,.7); border: 1px solid var(--edge); padding: 1px 5px; font-size: .92em; }
  .doc pre { background: rgba(5,7,12,.8); border: 1px solid var(--edge); padding: 14px 16px; overflow-x: auto; }
  .doc pre code { background: none; border: 0; padding: 0; }
  .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 8px 0 0; }
  .chips li { font-family: var(--mono, monospace); font-size: 11px; border: 1px solid var(--edge); padding: 3px 7px; color: var(--oh-dim); }
  /* The cast table cannot shrink below its animation column, so it scrolls
     inside its own box rather than pushing the whole page sideways. */
  .tablewrap { overflow-x: auto; margin-top: 10px; -webkit-overflow-scrolling: touch; }
  .doc table { width: 100%; min-width: 34rem; border-collapse: collapse; font-size: 13px; }
  .doc th, .doc td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--edge); vertical-align: top; }
  .doc th { color: var(--oh-silver); font-size: 11px; letter-spacing: var(--track-mid); text-transform: uppercase; }
  .anims code { font-size: 11px; margin-right: 2px; }
  .rule { border: 1px solid var(--oh-silver); padding: 14px 16px; margin: 18px 0; }
  .rule strong { color: var(--oh-silver-hi); }
  .count { color: var(--oh-dim); font-weight: 400; }
  .doc .back { display: inline-block; margin-bottom: 26px; font-size: 12px; letter-spacing: var(--track-mid); text-transform: uppercase; }
</style>
</head>
<body class="docs">
<main class="doc">
<a class="back" href="/">&larr; Office Hours VII</a>

<h1>Writing an episode</h1>
<p>An episode is <strong>one file</strong>: <code>js/episodes/epN.js</code>. Script, shot
list, floor marks, pacing, staging and the thumbnail pose all live in it. It imports
nothing &mdash; everything it needs arrives as <code>ctx</code>.</p>
<p>If you are an agent being asked to write an episode, you are being asked to write one file.</p>

<div class="rule">
<strong>Use only what is already here.</strong> Every character, room, camera set-up, prop and
floor mark you need already exists and is listed on this page. Do not invent a character, do
not invent a location, do not reference an object the set does not have. The show reads as one
show because every episode is built from the same pieces. An episode that names something not
on this page does not fail politely &mdash; it throws at run time, or it renders a person
standing inside a wall.
</div>

<h2>The vocabulary</h2>
<p>Everything below is read out of the live modules, so it is what the code actually exposes
right now. You can print the same thing locally with <code>npm run vocab</code>, or get it as
JSON with <code>npm run vocab -- --json</code>.</p>

<h3>Floor marks <span class="count">(${v.marks.length})</span></h3>
<p>Named positions on the floor. Use with <code>d.place(actor, 'name')</code> and
<code>d.walk(actor, 'name')</code>.</p>
${chips(v.marks)}

<h3>Camera set-ups <span class="count">(${v.shots.length})</span></h3>
<p>Framings the set ships. Use with <code>d.cut('name')</code>. If the set genuinely has no
coverage for what you need, define the angle in a documented <code>CAM</code> table at the top
of your file and pass the object to <code>d.cut()</code> &mdash; but reach for a named shot first.</p>
${chips(v.shots)}

<h3>The cast <span class="count">(${v.cast.length})</span></h3>
<p>Reached as <code>ctx.cast.&lt;id&gt;</code>. The animations listed are the only ones that
character accepts in <code>d.anim(actor, 'name')</code>; asking for anything else does nothing.</p>
<div class="tablewrap">
<table>
<thead><tr><th>id</th><th>name</th><th>role</th><th>animations</th></tr></thead>
<tbody>
${castRows}
</tbody>
</table>
</div>

<h3>Director verbs <span class="count">(${v.verbs.length})</span></h3>
<p>Everything an episode may call on <code>d</code>.</p>
${chips(v.verbs)}

<h2>The file's shape</h2>
<pre><code>/**
 * OFFICE HOURS VII &mdash; EPISODE FOUR: "TITLE".
 * What it is, and a beat budget.
 * @module episodes/ep4
 */

const ACCENT = '#39c7b5';            // the episode's chrome colour
const CAM = { /* angles the set does not name */ };
const SPOT = { /* floor positions the set does not name */ };

function setDressing(d, cast) { /* shared by run() and poster() */ }

export default {
  async run(ctx) { /* the episode */ },
  async poster(ctx) { /* a frozen frame for the thumbnail */ },
};</code></pre>
<p><code>ctx</code> is <code>{ stage, ui, d, office, cast, THREE }</code>. <code>d</code> is the
Director; <code>cast</code> is keyed by character id; <code>office</code> has <code>.marks</code>
and <code>.shots</code>.</p>

<h3>run(ctx)</h3>
<p>Everything goes through the Director. <strong>No <code>setTimeout</code>, no bare promises, no
timers of your own</strong> &mdash; <code>d.cancel()</code> has to be able to unwind the episode
when someone hits Back mid-scene, and it can only do that for awaits it owns. Every
<code>d.*</code> await resolves (never rejects) after a cancel, so an episode unwinds through its
own <code>finally</code> blocks within a frame.</p>

<h3>poster(ctx)</h3>
<p>Pose the scene for the thumbnail and return. Re-use <code>setDressing()</code> so the
thumbnail and the episode agree about where people live.</p>

<h2>Pacing</h2>
<p><strong>Do not tune <code>cps</code> and <code>hold</code> to hit a runtime.</strong> The
dialogue layer gives every line a guaranteed minimum time on screen proportional to its length
(a 1.3s floor plus a second per 14 characters). Author those two for <em>relative</em> comic
intent &mdash; this beat snappier than that one &mdash; and let the floor set the absolute pace.
An authored hold already longer than the floor is kept, so a deliberate silence still works.</p>
<p>The target is <strong>95&ndash;150 seconds</strong>, asserted by the harness. Budget roughly
30&ndash;40 dialogue beats.</p>

<h2>Layout constraints</h2>
<p>These are not discoverable from the API and they will cost you a rewrite:</p>
<ul>
<li>The battle HUD owns <code>y &gt;= 129</code> of the 384&times;216 frame.</li>
<li>A <code>style:'battle'</code> command window owns roughly <code>x 8-110 / y 50-126</code>.</li>
<li>Together they hide anything under about <strong>0.6m tall</strong> unless the camera is on the
carpet. Battle set-ups want to sit at 0.30&ndash;0.38m and stay level.</li>
<li>Two dialogue boxes on screen at once need <strong>distinct ids and <code>keep: true</code></strong>.
A second line from the same character <em>replaces</em> the first otherwise.</li>
<li>Keep simultaneous lines short. A box that grows a third row pushes the bottom row of a
multi-box chorus into the HUD.</li>
</ul>

<h2>Verifying</h2>
<pre><code>node tools/check.mjs --ep=ep4    # plays it in a real browser, start to finish
node tools/shoot.mjs ep4         # writes assets/thumbs/ep4.png</code></pre>
<p>The harness fails on any console error, stall, lost WebGL context, blank frame, frame-rate
collapse, or a runtime outside the window. It also writes a contact sheet &mdash;
<strong>look at it</strong>. It is the only way to catch a character standing in a wall, a camera
inside a desk, or a dialogue box sitting on top of the one thing the shot was supposed to show.</p>
<p>A pass is not the same as it being good. Watch it.</p>

<h2>Viewer-submitted episodes</h2>
<p>Episodes submitted through the form on the home page are <strong>not</strong> files. They are
JSON specs, validated against this same vocabulary and interpreted at run time by
<code>js/episodes/runtime.js</code>. They live in their own grouping, separate from the numbered
episodes, and carry a <code>u_</code> id prefix. Generated JavaScript is never stored or executed
&mdash; a generated module is arbitrary code on a public site, and no prompt is worth that.</p>

<p class="count" style="margin-top:44px">Generated by <code>node tools/docs.mjs</code> from the live modules.</p>
</main>
</body>
</html>
`;
}

/**
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<number>} exit code
 */
export async function main(argv = process.argv.slice(2)) {
  const out = path.join(ROOT, 'docs', 'index.html');
  let v;
  try {
    v = await readVocab();
  } catch (err) {
    console.error(`FATAL: ${(err && err.message) || err}`);
    return 2;
  }
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, page(v), 'utf8');
  console.log(`OFFICE HOURS VII — docs -> ${out}`);
  console.log(`  ${v.marks.length} marks, ${v.shots.length} shots, ${v.cast.length} cast, ${v.verbs.length} verbs`);
  if (argv.includes('--print')) console.log(page(v));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; });
}
