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
 *                                                       design total ~59s
 *   MEASURED 59.5 / 60.8 / 65.8s over three 1x runs (tools/check.mjs --ep=ep2).
 *   The stage clock is dt-clamped at 50ms, so a slow renderer stretches every
 *   d.beat(); the beats below are kept short on purpose to hold the window.
 * ```
 *
 * Beats: 19 distinct camera setups over 31 cuts, 31 spoken lines, 4 menus,
 * 8 damage pops, 1 logo card, 1 rebrand card, 1 unison stand.
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
  brad: { at: [10.33, 0, 2.85], look: [8.2, 0, 2.85], back: [11.05, 0, 2.85] },
};

/*
 * Nobody takes the head of the table. The chair at the foot stays empty all
 * episode, which keeps the long lens down the table clear and is its own small
 * joke about a founder who does not want to look like the boss.
 */

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
  /** Down the table over the empty head chair at Marge and the chart. Kept
   *  back and up: Roop's CRT and Kiki's hair loom into any closer lens. */
  master: { pos: [10.42, 1.86, 6.90], look: [9.25, 1.30, 1.10], fov: 54 },
  /** Low, off the table's near corner, looking up at the chart. */
  chartLow: { pos: [8.70, 0.78, 2.55], look: [8.70, 1.45, 0.45], fov: 52 },
  /** Marge, medium — the start of the push. */
  margeMed: { pos: [9.42, 1.55, 4.20], look: [9.40, 1.46, 1.30], fov: 46 },
  /** Marge, tight. Glasses and no expression. */
  margeTight: { pos: [9.42, 1.50, 2.70], look: [9.40, 1.48, 1.25], fov: 36 },
  /** Raised three-quarter from the west corner — all five, nobody looming. */
  wideWest: { pos: [6.75, 1.95, 6.15], look: [9.60, 1.10, 3.00], fov: 60 },
  /** Across the table at Brad, seated. */
  bradSeated: { pos: [8.55, 1.44, 1.95], look: [10.30, 1.40, 2.88], fov: 46 },
  /** Across the table at Dez, seated, with Roop behind him in depth. */
  dezSeated: { pos: [9.90, 1.44, 2.25], look: [8.58, 1.38, 3.95], fov: 46 },
  /** Past Dez's head at Kiki, seated. */
  kikiSeated: { pos: [7.30, 1.36, 4.55], look: [10.30, 1.28, 3.92], fov: 44 },
  /** Across the table at Roop, seated. */
  roopSeated: { pos: [10.50, 1.38, 4.55], look: [8.55, 1.35, 5.32], fov: 46 },
  /** Dez, standing, after the chairs go. */
  dezUp: { pos: [10.10, 1.60, 3.30], look: [7.90, 1.57, 4.02], fov: 46 },
  /** Kiki, standing. */
  kikiUp: { pos: [8.60, 1.42, 4.70], look: [10.98, 1.39, 4.08], fov: 46 },
  /** Roop, standing. */
  roopUp: { pos: [10.30, 1.58, 4.60], look: [7.92, 1.53, 5.26], fov: 48 },
  /** Brad, standing, from below. A hero angle for a bad idea. */
  bradHero: { pos: [9.20, 1.12, 3.90], look: [10.98, 1.58, 2.90], fov: 46 },
  /** High on the table. The empty-chair shot. */
  chairs: { pos: [9.40, 2.30, 1.70], look: [9.35, 0.62, 4.40], fov: 62 },
  /** Straight up at the drop ceiling. */
  ceiling: { pos: [8.30, 1.00, 2.10], look: [9.30, 2.70, 3.60], fov: 62 },
  /** The four of them in one frame, shot past Marge from the board end. Set
   *  at seated eye height so heads land mid-frame, clear of the battle HUD. */
  partyReverse: { pos: [10.60, 1.40, 0.90], look: [9.20, 1.34, 4.60], fov: 54 },
  /** Wide from the foot corner — all five stand-back marks are in it. */
  wideStanding: { pos: [11.60, 1.75, 6.75], look: [8.90, 1.20, 3.10], fov: 62 },
};

/* ----------------------------------------------------------------- the HUD */

/**
 * The party, as a set of things that can die. `hp` is a string, which the
 * dialogue layer allows precisely so this joke works.
 * @returns {Array<Object>} fresh rows — battleHud() takes ownership of them
 */
function hudRows() {
  return [
    { name: 'MUNCH', hp: '11/11 DAYS', mp: '$0', limit: 0.06, time: 0.35 },
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
  if (panels.length) undo.push(() => { for (const p of panels) p.userData.setLevel(1); });

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
    prompt: 'MORE IDEAS',
    options: [
      'SUBLET THE MEETING ROOM',
      'BECOME A NONPROFIT, LEGALLY',
      'INVOICE OURSELVES',
      'RUN',
    ],
    pick: 1,
  },
  {
    prompt: 'IDEAS, CONT.',
    options: [
      'LOWER THE THERMOSTAT',
      'DELETE THE STAGING SERVER',
      'SELL THE OFFICE CHAIRS',
      'RUN',
    ],
    pick: 2,
  },
  {
    prompt: 'FINAL IDEAS',
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
  return d.menu(Object.assign({ style: 'battle', auto: 1300 }, MENUS[i]));
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
    d.updateHud({ MUNCH: { hp: `${days}/11 DAYS` } });
    d.sfx(color ? 'chime' : 'stamp', { gain: 0.7 });
  };

  try {
    /* ================================================== ACT 1 — OPEN (~10.5s) */

    d.cut(SHOTS.master);
    await d.title({ logo: true, subtitle: 'EPISODE TWO — "RUNWAY"', ms: 1500 });

    d.music('tense');
    d.anim(roop, 'slump');
    d.anim(kiki, 'type');
    await d.beat(250);

    d.face(marge, 'meetingFoot');
    await d.say(marge, 'This is the burn chart.', { anchor: 'tm', cps: 46, hold: 330 });

    d.cut(SHOTS.chartLow);
    d.anim(marge, 'point');
    await d.say(marge, 'The line is meant to go up.', { anchor: 'tr', cps: 46, hold: 330 });

    d.cut(SHOTS.margeMed);
    d.anim(marge, 'idle');
    await d.all(
      d.move(SHOTS.margeTight, 1000, 'push'),
      d.say(marge, 'It is doing the other one.', { anchor: 'bm', cps: 30, hold: 670 }),
    );

    d.cut(SHOTS.partyReverse);
    await d.say(marge, 'Runway.\n......Eleven days.', { anchor: 'tm', cps: 26, hold: 350 });

    d.sfx('confirm');
    d.hud(hudRows());
    d.emote(brad, 'sweat');
    await d.beat(550);

    /* ======================================== ACT 2 — THE MENU ESCALATION (~34s) */

    d.cut(SHOTS.bradSeated);
    await d.say(brad, 'Floor is open.\nThere are no bad ideas.', {
      anchor: 'tm', cps: 48, hold: 290,
    });

    d.cut('meetingWide');
    await ideas(d, 0);

    d.cut(SHOTS.kikiSeated);
    d.targetOn(kiki);
    await d.say(kiki, 'We sell the espresso\nmachine.', { anchor: 'tl', cps: 48, hold: 290 });
    d.targetOn(null);

    d.cut(SHOTS.margeTight);
    await d.say(marge, 'It is leased.', { anchor: 'bm', cps: 26, hold: 510 });
    burn('1 DAY', 10);
    d.anim(dez, 'slump');
    await d.beat(250);

    d.cut(SHOTS.roopSeated);
    d.anim(roop, 'idle');
    await d.say(roop, 'Then we stop paying\nfor the internet.', {
      id: 'roop-a', keep: true, anchor: 'tl', cps: 48, hold: 260,
    });
    await d.say(roop, '......I would have to\ngo too.', {
      id: 'roop-b', anchor: 'bl', cps: 30, hold: 550,
    });
    d.closeBoxes();
    burn('2 DAYS', 8);

    d.cut(SHOTS.wideWest);
    await ideas(d, 1);

    d.cut(SHOTS.dezSeated);
    d.targetOn(dez);
    await d.say(dez, 'We become a nonprofit.', { anchor: 'tr', cps: 48, hold: 260 });
    await d.say(dez, 'Legally. To confuse\nthe investors.', { anchor: 'tr', cps: 46, hold: 350 });
    d.targetOn(null);

    d.cut(SHOTS.chartLow);
    d.anim(marge, 'point');
    await d.say(marge, 'The filing fee is\nthree days.', { anchor: 'tr', cps: 44, hold: 350 });
    burn('3 DAYS', 5);
    d.anim(marge, 'idle');
    await d.beat(200);

    /* ---- the chairs ---- */

    d.cut(SHOTS.master);
    await ideas(d, 2);

    d.cut(SHOTS.partyReverse);
    d.targetOn(dez);
    await d.say(dez, 'We sell the office chairs.', { anchor: 'tm', cps: 34, hold: 180 });
    d.targetOn(null);
    await d.beat(650);

    // The rise. All four marks are the same 0.7m, so one duration syncs them
    // to the frame. The face() calls land immediately after walk() has set its
    // travel yaw and overwrite it, so they back away still facing the table
    // instead of turning their backs on it.
    d.sfx('whoosh', { gain: 0.8 });
    const rise = [
      d.walk(dez, BLOCKING.dez.back, 550),
      d.walk(roop, BLOCKING.roop.back, 550),
      d.walk(kiki, BLOCKING.kiki.back, 550),
      d.walk(brad, BLOCKING.brad.back, 550),
    ];
    d.face(dez, [9.4, 0, 4.05], 200);
    d.face(roop, [9.4, 0, 5.30], 200);
    d.face(kiki, [9.4, 0, 4.05], 200);
    d.face(brad, [9.4, 0, 2.85], 200);
    await d.all(rise);

    d.cut(SHOTS.chairs);
    await d.beat(1000);

    d.cut(SHOTS.margeTight);
    await d.say(marge, 'Those are leased as well.', { anchor: 'bm', cps: 32, hold: 550 });
    burn('2 DAYS', 3);
    await d.beat(200);

    /* ---- printers ---- */

    d.cut(SHOTS.wideStanding);
    await ideas(d, 3);

    d.cut(SHOTS.roopUp);
    d.targetOn(roop);
    await d.say(roop, 'We mine crypto\non the printers.', { anchor: 'tl', cps: 46, hold: 300 });
    d.targetOn(null);

    d.cut(SHOTS.kikiUp);
    await d.say(kiki, 'They print one page\na minute.', { anchor: 'tr', cps: 48, hold: 290 });

    d.cut(SHOTS.roopUp);
    await d.say(roop, 'Then we mine slowly.', { anchor: 'tl', cps: 28, hold: 600 });
    burn('2 DAYS', 1);

    d.cut(SHOTS.kikiUp);
    d.anim(kiki, 'point');
    await d.say(kiki, 'We charge the sales team\nfor the chairs they sold.', {
      anchor: 'tr', cps: 50, hold: 290,
    });
    d.anim(kiki, 'idle');
    burn('+1 DAY', 2, '#7ee04a');
    d.emote(dez, 'exclaim');

    d.cut(SHOTS.dezUp);
    await d.say(dez, 'I am the sales team.', { anchor: 'tl', cps: 34, hold: 350 });

    d.cut(SHOTS.kikiUp);
    await d.say(kiki, 'I know.', { anchor: 'tr', cps: 18, hold: 600 });

    d.cut(SHOTS.margeMed);
    await d.say(marge, 'He will expense it.', { anchor: 'tm', cps: 32, hold: 310 });
    burn('1 DAY', 1);

    /* ================================== ACT 3 — BRAD'S REBRAND (~9.5s) */

    d.cut(SHOTS.bradHero);
    d.targetOn(brad);
    await d.say(brad, 'I have been saving this.', { anchor: 'tm', cps: 46, hold: 300 });
    d.anim(brad, 'point');
    await d.say(brad, 'We do not need money.\nWe need a name.', {
      anchor: 'tm', cps: 46, hold: 310,
    });
    d.targetOn(null);
    d.anim(brad, 'cheer');

    d.sfx('fanfare');
    d.flash('#e8a33d', 280);
    await d.title({
      title: 'MLCH',
      subtitle: 'THE EVERYTHING LAYER',
      logo: false,
      ms: 1000,
    });

    d.cut(SHOTS.margeTight);
    d.anim(brad, 'idle');
    d.emote(roop, 'question');
    await d.say(marge, 'That is our name with\nthe vowels taken out.', {
      anchor: 'bm', cps: 48, hold: 350,
    });
    burn('1 DAY', 0);
    d.updateHud({ PAYROLL: { hp: 'FRIDAY?' }, MORALE: { hp: '1/10' } });

    d.cut(SHOTS.bradHero);
    await d.say(brad, 'The domain was available.', { anchor: 'tm', cps: 34, hold: 510 });

    /* ============================================ ACT 4 — BUTTON (~8.5s) */

    d.cut(SHOTS.ceiling);
    const cutOff = d.say(brad, 'And in phase two we—', { anchor: 'bm', cps: 30, hold: 180 });
    await d.wait(500);

    restoreLights = cutThePower(office);
    d.music(null);
    d.sfx('crash', { gain: 0.32, rate: 0.55 });
    d.sfx('cancel', { gain: 0.7, rate: 0.45 });
    d.shake(0.05, 240);
    await cutOff;

    d.cut(SHOTS.wideStanding);
    await d.say(kiki, 'Was that us?', { anchor: 'tr', cps: 34, hold: 400 });
    await d.say(roop, 'That was the power.', { anchor: 'tl', cps: 28, hold: 450 });

    d.cut('meetingReverse');
    await d.say(dez, 'Is this dramatic\nor is this bad?', { anchor: 'tm', cps: 46, hold: 350 });
    d.updateHud({ PAYROLL: { hp: '......' }, MORALE: { hp: '0/10' } });
    await d.say(brad, 'It can be both.', { anchor: 'bm', cps: 28, hold: 550 });

    d.cut(SHOTS.margeTight);
    await d.beat(300);
    await d.say(marge, 'I can still see the chart.', { anchor: 'tm', cps: 26, hold: 900 });

    await d.beat(250);
    d.closeBoxes();
    await d.fadeOut(550);
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
