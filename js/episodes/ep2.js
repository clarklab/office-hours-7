/**
 * OFFICE HOURS VII — EPISODE TWO: "RUNWAY"
 *
 * One room, one chart, one number going down. The budget meeting run as an
 * FF7 battle: the battle HUD carries the company's HP in DAYS OF RUNWAY, the
 * party takes turns proposing fixes through an RPG menu, and every fix costs
 * the company days. Nobody is being stupid. Everybody is trying to help. That
 * is the joke.
 *
 * Camera discipline: one room means coverage is everything. Cut, never drift,
 * and never sit on an angle for more than ~8 seconds. Rough beat budget, in
 * running order (measured against `node tools/check.mjs --ep=ep2`):
 *
 * ```
 *   ACT 1  OPEN                title, chart, the number, HUD up    ~10.5s
 *   ACT 2  THE MENU ESCALATION four menu beats, seven bad ideas    ~34.0s
 *   ACT 3  THE REBRAND         fanfare it does not deserve          ~9.5s
 *   ACT 4  BUTTON              the lights go, the talking does not  ~8.5s
 *                                                            TOTAL ~62.5s
 * ```
 *
 * Beats: 16 camera setups, 33 spoken lines, 4 menus, 8 damage pops, 1 title
 * card, 1 rebrand card, 1 unison stand.
 *
 * @module episodes/ep2
 */

import { burnChartTexture } from '/js/sets/props.js';

/**
 * @typedef {import('../characters/rig.js').Actor} Actor
 * @typedef {{stage:Object, ui:Object, d:Object, office:Object, cast:Object<string,Actor>, THREE:*}} EpisodeCtx
 */

/* ------------------------------------------------------------------ blocking */

/**
 * Where the party sits. The seat marks in office.js are the chair centres;
 * the rig parks its hips 0.26m behind its own origin when seated, so each
 * actor stands 0.22m forward of their chair or they sit inside the backrest.
 * The two z=4.05 seats are the only ones clear of the table's leg panels, so
 * the two widest silhouettes (Dez, Kiki) get them.
 * @type {Object<string, {at:number[], look:number[], back:number[]}>}
 */
const BLOCKING = {
  dez: { at: [8.47, 0, 4.05], look: [10.6, 0, 4.05], back: [7.80, 0, 4.05] },
  roop: { at: [8.47, 0, 5.30], look: [10.6, 0, 5.30], back: [7.80, 0, 5.30] },
  kiki: { at: [10.33, 0, 4.05], look: [8.2, 0, 4.05], back: [11.05, 0, 4.05] },
  brad: { at: [9.35, 0, 5.88], look: [9.4, 0, 1.15], back: [9.35, 0, 6.62] },
};

/** Where damage numbers land: over the table, i.e. over the company. */
const COMPANY = { x: 9.35, y: 1.35, z: 4.0 };

/* --------------------------------------------------------------------- shots */

/**
 * Hand-cut coverage for the meeting room. office.js ships five setups here;
 * a 60-second scene in one room needs more than five. Everything below is
 * checked against the furniture: no camera inside the conference table, no
 * actor parked on the lens axis.
 * @type {Object<string, {pos:number[], look:number[], fov:number}>}
 */
const SHOTS = {
  /** Down the table past Brad's head at Marge and the chart. The master. */
  master: { pos: [10.10, 1.78, 6.95], look: [9.30, 1.45, 1.10], fov: 54 },
  /** Low, off the table's near corner, looking up at the chart. */
  chartLow: { pos: [8.60, 0.48, 2.35], look: [8.25, 1.78, 0.45], fov: 56 },
  /** Marge, medium — the start of the push. */
  margeMed: { pos: [9.42, 1.62, 4.20], look: [9.40, 1.50, 1.25], fov: 46 },
  /** Marge, tight. Glasses and no expression. */
  margeTight: { pos: [9.42, 1.58, 2.55], look: [9.40, 1.54, 1.30], fov: 38 },
  /** Over Brad's shoulder, down the table. */
  otsBrad: { pos: [8.95, 1.62, 6.60], look: [9.42, 1.35, 1.60], fov: 48 },
  /** Across the table at Dez, seated. */
  dezSeated: { pos: [9.95, 1.36, 3.05], look: [8.55, 1.28, 4.05], fov: 46 },
  /** Across the table at Kiki, seated. */
  kikiSeated: { pos: [9.35, 1.34, 5.00], look: [10.40, 1.26, 4.10], fov: 46 },
  /** Across the table at Roop, seated. */
  roopSeated: { pos: [10.25, 1.34, 4.85], look: [8.55, 1.26, 5.30], fov: 48 },
  /** Dez, standing, after the chairs go. */
  dezUp: { pos: [9.90, 1.62, 3.10], look: [7.95, 1.56, 4.05], fov: 48 },
  /** Kiki, standing. */
  kikiUp: { pos: [9.35, 1.48, 4.95], look: [10.95, 1.44, 4.10], fov: 48 },
  /** Roop, standing. */
  roopUp: { pos: [9.85, 1.62, 4.50], look: [7.95, 1.58, 5.30], fov: 50 },
  /** Brad, standing, from below. A hero angle for a bad idea. */
  bradHero: { pos: [9.40, 1.15, 4.75], look: [9.36, 1.72, 6.40], fov: 46 },
  /** High on the table. The empty-chair shot. */
  chairs: { pos: [9.40, 2.30, 1.70], look: [9.35, 0.62, 4.40], fov: 62 },
  /** Straight up at the drop ceiling. */
  ceiling: { pos: [7.10, 1.05, 4.20], look: [8.70, 2.70, 3.10], fov: 62 },
  /** Wide from the far corner, clear of everyone's stand-back marks. */
  wideEast: { pos: [11.90, 1.90, 6.60], look: [8.60, 1.05, 2.60], fov: 62 },
};

/* ----------------------------------------------------------------- the HUD */

/**
 * The party, as a set of things that can die. `hp` is a string, which the
 * dialogue layer allows precisely so this joke works.
 * @returns {Array<Object>} fresh rows — battleHud() takes ownership of them
 */
function hudRows() {
  return [
    { name: 'MULCH', hp: '11/11 DAYS', mp: '$0', limit: 0.06, time: 0.35 },
    { name: 'PAYROLL', hp: 'FRIDAY', limit: 0.52, time: 0.08 },
    { name: 'MORALE', hp: '6/10', mp: '2', limit: 0.28, time: 0.60 },
  ];
}

/* ------------------------------------------------------------------ helpers */

/**
 * Puts the real hockey-stick-pointing-down burn chart on the meeting room
 * whiteboard. `setDrawing` is the board's own API and its material is
 * uncached, so this touches nothing else in the set.
 * @param {Object} office
 * @returns {void}
 */
function dressTheChart(office) {
  const board = office && office.props && office.props.whiteboardMeeting;
  const set = board && board.userData && board.userData.setDrawing;
  if (typeof set === 'function') set(burnChartTexture());
}

/**
 * Kills the lights for real, in the scene, rather than fading a DOM overlay —
 * the director's fade sits ABOVE the dialogue layer, and this episode's button
 * needs the boxes to keep coming over a near-black frame.
 *
 * `office.update()` rewrites every point light's *intensity* each frame but
 * never its colour, so colour is the one handle that stays put. The ceiling
 * diffusers are `unlit`, so they have to be dimmed through their own
 * `setLevel()`; that material is shared between panels, which is exactly what
 * we want here and exactly why this returns a restore function.
 *
 * @param {Object} office
 * @returns {() => void} puts everything back
 */
function cutThePower(office) {
  /** @type {Array<() => void>} */
  const undo = [];
  if (!office) return () => {};

  const lights = office.lights || {};
  for (const l of lights.points || []) {
    const was = l.color.clone();
    undo.push(() => l.color.copy(was));
    l.color.setRGB(0.014, 0.014, 0.022);
  }
  if (lights.ambient) {
    const amb = lights.ambient;
    const was = amb.intensity;
    undo.push(() => { amb.intensity = was; });
    amb.intensity = 0.11;
  }

  /** @type {Array<Object>} */
  const panels = [];
  if (office.group && typeof office.group.traverse === 'function') {
    office.group.traverse((o) => {
      if (o.name === 'ceilingPanel' && o.userData && typeof o.userData.setLevel === 'function') {
        panels.push(o);
      }
    });
  }
  // One call per panel, but they share a cached material, so this is cheap and
  // it reaches the whole floor.
  for (const p of panels) p.userData.setLevel(0.04);
  if (panels.length) undo.push(() => { panels[0].userData.setLevel(1); });

  return () => { for (const fn of undo) fn(); };
}

/**
 * Seats the party and stands Marge at the chart.
 * @param {EpisodeCtx} ctx
 * @returns {void}
 */
function setTheRoom(ctx) {
  const { d, cast, office } = ctx;
  d.use(office);
  dressTheChart(office);
  if (office && typeof office.focusRoom === 'function') office.focusRoom('meeting');

  for (const id of Object.keys(BLOCKING)) {
    const a = cast[id];
    if (!a) continue;
    const b = BLOCKING[id];
    d.place(a, b.at, b.look);
    d.sit(a, true);
    d.anim(a, 'sit');
  }
  if (cast.marge) {
    d.place(cast.marge, 'meetingHead', [9.4, 0, 6.0]);
    d.anim(cast.marge, 'idle');
  }
  // The dog is not in this one. Keep her out of the corner of frame.
  if (cast.tuesday) d.place(cast.tuesday, 'receptionChairs', 'reception');
}

/* -------------------------------------------------------------------- menus */

/** Four command windows. The options are half the gag; read them. */
const MENUS = [
  {
    prompt: 'IDEAS',
    options: [
      'ASK THE INVESTORS AGAIN',
      'HIRING FREEZE (ALREADY ON)',
      'SELL THE ESPRESSO MACHINE',
      'RUN',
    ],
    pick: 2,
  },
  {
    prompt: 'IDEAS',
    options: [
      'SUBLET THE MEETING ROOM',
      'BECOME A NONPROFIT, LEGALLY',
      'INVOICE OURSELVES',
      'RUN',
    ],
    pick: 1,
  },
  {
    prompt: 'IDEAS',
    options: [
      'LOWER THE THERMOSTAT',
      'DELETE THE STAGING SERVER',
      'SELL THE OFFICE CHAIRS',
      'RUN',
    ],
    pick: 2,
  },
  {
    prompt: 'IDEAS',
    options: [
      'EAT THE PLANTS',
      'CHARGE FOR THE WIFI WE CUT',
      'MINE CRYPTO ON THE PRINTERS',
      'RUN',
    ],
    pick: 2,
  },
];

/**
 * Opens a command window and lets the cursor walk to the pick. The walk is a
 * beat in its own right — time the cut before it, not after.
 * @param {Object} d
 * @param {number} i index into {@link MENUS}
 * @returns {Promise<number>}
 */
function ideas(d, i) {
  return d.menu(Object.assign({ style: 'battle', auto: 1600 }, MENUS[i]));
}

/* ------------------------------------------------------------------- the run */

/**
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
  const { d, cast, office } = ctx;
  const { brad, dez, kiki, roop, marge } = cast;

  /** @type {() => void} */
  let restoreLights = () => {};

  setTheRoom(ctx);

  /** Pops a burn figure over the company and ticks the runway down. */
  const burn = (text, days, color) => {
    d.damageOn(COMPANY, text, color ? { color } : undefined);
    d.updateHud({ MULCH: { hp: `${days}/11 DAYS` } });
    d.sfx(color ? 'chime' : 'stamp', { gain: 0.7 });
  };

  try {
    /* ================================================== ACT 1 — OPEN (~10.5s) */

    d.cut(SHOTS.master);
    await d.title({ logo: true, subtitle: 'EPISODE TWO — "RUNWAY"', ms: 2000 });

    d.music('tense');
    d.anim(roop, 'slump');
    d.anim(kiki, 'type');
    await d.beat(400);

    d.face(marge, 'meetingFoot');
    await d.say(marge, 'This is the burn chart.', { anchor: 'tm', cps: 36 });

    d.cut(SHOTS.chartLow);
    d.anim(marge, 'point');
    await d.say(marge, 'The line is meant to go up.', { anchor: 'tr', cps: 36 });

    d.cut(SHOTS.margeMed);
    d.anim(marge, 'idle');
    await d.all(
      d.move(SHOTS.margeTight, 1100, 'push'),
      d.say(marge, 'It is doing the other one.', { anchor: 'bm', cps: 32, hold: 650 }),
    );

    d.cut('meetingReverse');
    await d.say(marge, 'Runway.\n......Eleven days.', { anchor: 'tm', cps: 26, hold: 500 });

    d.sfx('confirm');
    d.hud(hudRows());
    d.emote(brad, 'sweat');
    await d.beat(900);

    /* ======================================== ACT 2 — THE MENU ESCALATION (~34s) */

    d.cut(SHOTS.otsBrad);
    await d.say(brad, 'The floor is open.\nThere are no bad ideas.', { anchor: 'tm', cps: 38 });

    d.cut('meetingWide');
    await ideas(d, 0);

    d.cut(SHOTS.kikiSeated);
    d.targetOn(kiki);
    await d.say(kiki, 'We sell the espresso\nmachine.', { anchor: 'tl', cps: 36 });
    d.targetOn(null);

    d.cut(SHOTS.margeTight);
    await d.say(marge, 'It is leased.', { anchor: 'bm', cps: 24, hold: 500 });
    burn('1 DAY', 10);
    await d.beat(500);

    d.cut(SHOTS.roopSeated);
    d.anim(roop, 'idle');
    await d.say(roop, 'Then we stop paying\nfor the internet.', {
      id: 'roop-a', keep: true, anchor: 'tl', cps: 36,
    });
    await d.say(roop, '......I would have to\ngo too.', { id: 'roop-b', anchor: 'bl', cps: 26 });
    d.closeBoxes();

    d.cut(SHOTS.margeMed);
    await d.say(marge, 'Eight days.', { anchor: 'tm', cps: 20, hold: 450 });
    burn('2 DAYS', 8);

    d.cut('meetingWide');
    await ideas(d, 1);

    d.cut(SHOTS.dezSeated);
    d.targetOn(dez);
    await d.say(dez, 'We become a nonprofit.', { anchor: 'tr', cps: 38 });
    await d.say(dez, 'Legally. To confuse\nthe investors.', { anchor: 'tr', cps: 36 });
    d.targetOn(null);

    d.cut(SHOTS.chartLow);
    d.anim(marge, 'point');
    await d.say(marge, 'The filing fee is\nthree days.', { anchor: 'tr', cps: 32 });
    burn('3 DAYS', 5);
    d.anim(marge, 'idle');
    await d.beat(400);

    /* ---- the chairs ---- */

    d.cut('meetingWide');
    await ideas(d, 2);

    d.cut('meetingReverse');
    d.targetOn(dez);
    await d.say(dez, 'We sell the office chairs.', { anchor: 'tm', cps: 34, hold: 250 });
    d.targetOn(null);
    await d.beat(1000);

    d.sfx('whoosh', { gain: 0.8 });
    await d.all(
      d.walk(dez, BLOCKING.dez.back, 620),
      d.walk(roop, BLOCKING.roop.back, 620),
      d.walk(kiki, BLOCKING.kiki.back, 620),
      d.walk(brad, BLOCKING.brad.back, 620),
    );
    d.face(dez, [9.4, 0, 4.05]);
    d.face(roop, [9.4, 0, 5.30]);
    d.face(kiki, [9.4, 0, 4.05]);
    d.face(brad, [9.4, 0, 1.15]);

    d.cut(SHOTS.chairs);
    await d.beat(1500);

    d.cut(SHOTS.margeTight);
    await d.say(marge, 'Those are leased as well.', { anchor: 'bm', cps: 30, hold: 600 });
    burn('2 DAYS', 3);
    await d.beat(400);

    /* ---- printers ---- */

    d.cut(SHOTS.wideEast);
    await ideas(d, 3);

    d.cut(SHOTS.roopUp);
    d.targetOn(roop);
    await d.say(roop, 'We mine crypto\non the printers.', { anchor: 'tl', cps: 34 });
    d.targetOn(null);

    d.cut(SHOTS.kikiUp);
    await d.say(kiki, 'They print one page\na minute.', { anchor: 'tr', cps: 38 });

    d.cut(SHOTS.roopUp);
    await d.say(roop, 'Then we mine slowly.', { anchor: 'tl', cps: 28, hold: 600 });
    burn('2 DAYS', 1);

    d.cut(SHOTS.kikiUp);
    d.anim(kiki, 'point');
    await d.say(kiki, 'We charge the sales team\nfor the chairs they sold.', {
      anchor: 'tr', cps: 40,
    });
    d.anim(kiki, 'idle');
    burn('+1 DAY', 2, '#7ee04a');

    d.cut(SHOTS.dezUp);
    await d.say(dez, 'I am the sales team.', { anchor: 'tl', cps: 30 });

    d.cut(SHOTS.kikiUp);
    await d.say(kiki, 'I know.', { anchor: 'tr', cps: 18, hold: 650 });

    d.cut(SHOTS.margeMed);
    await d.say(marge, 'He will expense it.', { anchor: 'tm', cps: 30, hold: 450 });
    burn('1 DAY', 1);

    /* ================================== ACT 3 — BRAD'S REBRAND (~9.5s) */

    d.cut(SHOTS.bradHero);
    d.targetOn(brad);
    await d.say(brad, 'I have been holding\nsomething back.', { anchor: 'tm', cps: 36 });
    d.anim(brad, 'point');
    await d.say(brad, 'We do not need money.\nWe need a name.', { anchor: 'tm', cps: 38 });
    d.targetOn(null);
    d.anim(brad, 'cheer');

    d.sfx('fanfare');
    d.flash('#e8a33d', 280);
    await d.title({
      title: 'MLCH',
      subtitle: 'THE EVERYTHING LAYER',
      logo: false,
      ms: 1300,
    });

    d.cut(SHOTS.margeTight);
    d.anim(brad, 'idle');
    await d.say(marge, 'That is our name with\nthe vowels taken out.', { anchor: 'bm', cps: 36 });
    burn('1 DAY', 0);
    d.updateHud({ PAYROLL: { hp: 'FRIDAY?' }, MORALE: { hp: '1/10' } });

    d.cut(SHOTS.bradHero);
    await d.say(brad, 'The domain was available.', { anchor: 'tm', cps: 34, hold: 550 });

    /* ============================================ ACT 4 — BUTTON (~8.5s) */

    d.cut(SHOTS.ceiling);
    const cutOff = d.say(brad, 'And in phase two we—', { anchor: 'bm', cps: 30, hold: 200 });
    await d.wait(650);

    restoreLights = cutThePower(office);
    d.music(null);
    d.sfx('crash', { gain: 0.55 });
    d.shake(0.05, 240);
    await cutOff;

    d.cut(SHOTS.wideEast);
    await d.say(kiki, 'Was that us?', { anchor: 'tr', cps: 30 });
    await d.say(roop, 'That was the power.', { anchor: 'tl', cps: 26 });

    d.cut('meetingReverse');
    await d.say(dez, 'Is this dramatic\nor is this bad?', { anchor: 'tm', cps: 34 });
    d.updateHud({ PAYROLL: { hp: '......' }, MORALE: { hp: '0/10' } });
    await d.say(brad, 'It can be both.', { anchor: 'bm', cps: 28, hold: 700 });

    d.cut(SHOTS.margeTight);
    await d.beat(400);
    await d.say(marge, 'I can still see the chart.', { anchor: 'tm', cps: 26, hold: 1100 });

    await d.beat(500);
    d.closeBoxes();
    await d.fadeOut(900);
  } finally {
    restoreLights();
  }
}

/**
 * The thumbnail: Marge at the burn chart, the room in silhouette between us
 * and her, and the HUD reading 11/11 DAYS.
 * @param {EpisodeCtx} ctx
 * @returns {void}
 */
function poster(ctx) {
  const { d, cast } = ctx;
  setTheRoom(ctx);
  if (cast.marge) {
    d.anim(cast.marge, 'point');
    d.face(cast.marge, 'meetingFoot');
  }
  if (cast.roop) d.anim(cast.roop, 'slump');
  d.hud(hudRows());
  d.cut(SHOTS.master);
}

/**
 * @typedef {Object} EpisodeDef
 * @property {string} id
 * @property {number} number
 * @property {string} title
 * @property {string} logline
 * @property {string} runtime
 * @property {string[]} starring
 * @property {string} accent
 * @property {(ctx: EpisodeCtx) => Promise<void>} run
 * @property {(ctx: EpisodeCtx) => void} poster
 */

export default /** @type {EpisodeDef} */ ({
  id: 'ep2',
  number: 2,
  title: 'RUNWAY',
  logline: 'The budget meeting, run as an escalating RPG menu.',
  runtime: '1:05',
  starring: ['marge', 'brad', 'dez', 'roop', 'kiki'],
  accent: '#e8a33d',
  run,
  poster,
});
