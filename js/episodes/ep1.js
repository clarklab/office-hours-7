/**
 * OFFICE HOURS VII — EPISODE ONE: "STANDUP".
 *
 * The pilot. It has one job: establish MULCH, Inc. and hand you all five humans
 * so episodes two and three can start running. Cold open on the floor, five
 * FF7 name-card intros shot in each character's own territory, everybody
 * converges on the meeting room, and the standup collapses into overlapping
 * non-sequiturs before it has technically started.
 *
 * Everything here goes through the Director, so `d.cancel()` unwinds the whole
 * thing cleanly: no `setTimeout`, no bare promises, no timers of our own.
 *
 * BEAT BUDGET (design estimate; MEASURED runtime noted at the end)
 *   cold open .......  3.2 title + 4.0 narration ................ ~7.2s
 *   BRAD ............  2.0 card + 3.2 lines + 0.4 beat .......... ~5.6s
 *   DEZ .............  2.0 card + 4.8 lines ..................... ~7.0s
 *   KIKI ............  2.0 card + 3.2 triple + 1.4 turn ......... ~6.5s
 *   ROOP ............  2.0 card + 2.2 line + 1.8 ceiling gag .... ~6.2s
 *   MARGE ...........  2.0 card + 3.0 lines ..................... ~5.0s
 *   convergence .....  2.1 call + 1.7 + 1.8 walks .............. ~5.6s
 *   the standup .....  1.7 slab + 2.1 + 2.4 menu + 6.4 overlap .. ~14.6s
 *   button ..........  2.1 optimism + 2.2 silence + 1.1 fade .... ~5.4s
 *   ------------------------------------------------------------------
 *   design total ~63s, MEASURED 63.4s (tools/check.mjs --ep=ep1)
 *
 * @module episodes/ep1
 */

/**
 * @typedef {import('../core/director.js').Director} Director
 * @typedef {{stage:Object, ui:Object, d:Director, office:Object, cast:Object<string,Object>, THREE:Object}} EpisodeCtx
 */

/** Brad's teal. Also the episode's chrome colour. @type {string} */
const ACCENT = '#39c7b5';

/**
 * Framing the set does not name. `office.shots` covers the standard coverage;
 * these are the angles this episode needs on top of it — a heroic low angle on
 * Brad, a desk-level three-quarter on Dez, a floor-level shot for Roop, the
 * binder wall, and the two clean singles the button is built on.
 * @type {Object<string, {pos:number[], look:number[], fov:number}>}
 */
const CAM = {
  /** Low and close, looking up at the founder. The word STANDUP lands here. */
  bradLow: { pos: [-2.55, 0.62, 3.35], look: [-3.55, 1.60, 1.95], fov: 60 },
  /** Over the monitor at Dez, mid-call. The partition sits just under frame. */
  dezDesk: { pos: [1.55, 1.45, -2.45], look: [0.05, 1.38, -4.45], fov: 48 },
  /** Tight on reception, MULCH logo wall behind her. */
  reception: { pos: [-9.90, 1.55, -2.25], look: [-11.85, 1.42, -2.72], fov: 44 },
  /** Carpet height. Roop is down there with the cables. */
  roopFloor: { pos: [-0.35, 0.50, 0.35], look: [-1.62, 0.98, -1.55], fov: 55 },
  /** Low, through the archive boxes, at the only person still counting. */
  margeBoxes: { pos: [1.90, 1.05, 6.95], look: [0.25, 1.38, 5.15], fov: 50 },
  /** The bullpen watching three people file toward the meeting room. */
  toMeeting: { pos: [2.20, 1.62, 1.05], look: [5.55, 1.28, 3.35], fov: 55 },
  /** Two-shot: Brad at the head of the table, Marge quiet on the left. */
  bradMed: { pos: [7.60, 1.55, 2.90], look: [9.35, 1.52, 1.28], fov: 48 },
  /** The single the button needs: Marge, alone, holding a number. */
  margeClose: { pos: [7.20, 1.50, 3.60], look: [7.50, 1.45, 2.30], fov: 34 },
  /** Poster: the whole company in one frame, Brad mid-gesture. */
  poster: { pos: [7.15, 1.78, 6.25], look: [9.60, 1.15, 2.60], fov: 58 },
};

/**
 * Floor positions the set does not name. Everything else in the episode uses
 * `office.marks`; these are the gaps — the standing formation for a meeting
 * nobody is allowed to sit down in, and the walk-ons for the convergence.
 * All are `[x, y, z]` because that is what the Director resolves.
 * @type {Object<string, number[]>}
 */
const SPOT = {
  // the standup formation: clear of every chair, all five inside both wides
  standMarge: [7.55, 0, 2.15],
  standDez: [11.20, 0, 2.90],
  standKiki: [11.10, 0, 4.30],
  standRoop: [7.50, 0, 4.35],
  // convergence: where people start and stop walking
  kikiDoorFrom: [-9.20, 0, -0.30],
  kikiDoorTo: [-6.90, 0, -0.20],
  dezGoFrom: [3.60, 0, 1.90],
  dezGoTo: [5.50, 0, 3.15],
  margeGoFrom: [3.30, 0, 3.30],
  margeGoTo: [5.25, 0, 4.05],
  roopGoFrom: [2.90, 0, 2.60],
  roopGoTo: [4.50, 0, 3.45],
  // Brad's poster position, in front of the meeting-room whiteboard
  posterBrad: [8.55, 0, 1.35],
  // the dog is not in this episode. She is outside the building. She knows.
  offstage: [0, 0, 12.5],
};

/** Box width that keeps a spoken line from re-wrapping under ~36 chars. */
const WIDE_BOX = 300;
/** Narrow boxes, so two of them fit on screen side by side (ref 04). */
const TWIN_BOX = 200;

/**
 * The party, as the battle HUD sees them. Stats are the profiles' joke stats
 * translated into gauges: Kiki's patience is a limit break waiting to happen.
 * @type {Array<Object>}
 */
const PARTY = [
  { name: 'BRAD', hp: 40, maxHp: 40, mp: 9, limit: 0.97, time: 0.9 },
  { name: 'DEZ', hp: 88, maxHp: 88, mp: 4, limit: 0.62, time: 0.7 },
  { name: 'KIKI', hp: 62, maxHp: 62, mp: 0, limit: 1, time: 1 },
  { name: 'ROOP', hp: 31, maxHp: 31, mp: 402, limit: 0.18, time: 0.35 },
  { name: 'MARGE', hp: 55, maxHp: 55, mp: 12, limit: 0.74, time: 0.55 },
];

/**
 * Puts the whole company on its marks. Called by both `run` and `poster`, so
 * the thumbnail and the episode always agree about where people live.
 *
 * @param {Director} d
 * @param {Object<string, Object>} cast
 * @returns {void}
 */
function setDressing(d, cast) {
  // Brad is at the whiteboard because Brad is always at a whiteboard.
  d.place(cast.brad, 'whiteboard', [-4.55, 0, 1.95]);
  d.anim(cast.brad, 'point');

  // Dez stands at his desk. Dez does not close sitting down.
  d.place(cast.dez, 'deskDez', 0);
  d.anim(cast.dez, 'talk');

  // Kiki behind the reception counter, headset on, phone in hand.
  d.place(cast.kiki, 'deskKiki', 90);
  d.anim(cast.kiki, 'idle');

  // Roop on the carpet at his own desk, facing the cable side of the world.
  d.place(cast.roop, 'deskRoop', 200);
  d.sit(cast.roop, true);

  // Marge in the back hallway, behind the boxes, doing the only real maths.
  d.place(cast.marge, 'boxes', [1.90, 0, 6.95]);
  d.anim(cast.marge, 'idle');

  // Not this episode.
  d.place(cast.tuesday, SPOT.offstage, 0);
}

/**
 * Lights one room and dims the rest. No-ops if the set has not grown
 * `focusRoom` yet — this episode is never allowed to be the thing that breaks.
 * @param {Object} office
 * @param {string|null} room
 * @returns {void}
 */
function focus(office, room) {
  if (office && typeof office.focusRoom === 'function') {
    try {
      office.focusRoom(room);
    } catch {
      /* the set is somebody else's file; never die on it */
    }
  }
}

/**
 * EPISODE ONE — "STANDUP".
 *
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
  const d = ctx.d;
  const cast = ctx.cast || {};
  const { brad, dez, kiki, roop, marge } = cast;
  const cam = ctx.stage ? ctx.stage.camera : null;

  d.use(ctx.office);

  /** Turns an actor to camera. Cheap, and it fixes every dead eyeline. @param {Object} a */
  const toCam = (a) => d.face(a, cam);

  try {
    /* ============================================================ COLD OPEN */

    setDressing(d, cast);
    focus(ctx.office, null);
    d.cut('establish');
    d.music('lobby');

    await d.title({ logo: true, subtitle: 'EPISODE ONE — "STANDUP"', ms: 2100 });

    await d.say(null, 'MULCH, INC.\nThe Everything Layer.', { maxWidth: WIDE_BOX, hold: 650 });
    await d.say(null, 'Eleven days of runway.\nNobody has said that out loud.', {
      maxWidth: WIDE_BOX,
      hold: 700,
    });

    /* ========================================================= INTRO — BRAD */

    focus(ctx.office, 'bullpen');
    d.cut('whiteboard');
    toCam(brad);
    await d.nameCard(brad, { ms: 1400 });

    await d.say(brad, "I don't believe in meetings.", { maxWidth: WIDE_BOX, hold: 550 });

    // Cut to the low angle for the word itself. Founders are shot from below.
    d.cut(CAM.bradLow);
    d.anim(brad, 'point');
    await d.say(brad, "That's why this is a STANDUP.", { maxWidth: WIDE_BOX, hold: 700 });
    await d.beat(350);

    /* ========================================================== INTRO — DEZ */

    d.cut(CAM.dezDesk);
    d.anim(dez, 'talk');
    d.sfx('phone', { gain: 0.35 });
    await d.nameCard(dez, { ms: 1400 });

    await d.say(dez, "I've got a whale on the hook.", { maxWidth: WIDE_BOX, hold: 300 });
    await d.say(dez, "He doesn't know it yet.", { maxWidth: WIDE_BOX, hold: 300 });
    await d.say(dez, "He doesn't know me.", { maxWidth: WIDE_BOX, hold: 450 });

    d.anim(dez, 'idle');
    await d.beat(300);
    await d.say(dez, "He hung up.\nThat's the first yes.", { maxWidth: WIDE_BOX, hold: 650 });

    /* ========================================================= INTRO — KIKI */

    focus(ctx.office, 'reception');
    d.cut(CAM.reception);
    await d.nameCard(kiki, { ms: 1400 });

    // Three calls. One answer. The boxes stack up because nothing changes.
    const KIKI_LINE = "Front desk. No he's not.";
    await d.say(kiki, KIKI_LINE, { id: 'kiki-1', keep: true, hold: 320 });
    await d.say(kiki, KIKI_LINE, { id: 'kiki-2', keep: true, hold: 320 });
    await d.say(kiki, KIKI_LINE, { id: 'kiki-3', keep: true, hold: 420 });
    d.closeBoxes(null);

    toCam(kiki);
    await d.say(kiki, "That's the whole job.", { maxWidth: WIDE_BOX, hold: 700 });

    /* ========================================================= INTRO — ROOP */

    focus(ctx.office, 'bullpen');
    d.cut(CAM.roopFloor);
    d.face(roop, cam, 420);
    await d.nameCard(roop, { ms: 1400 });

    await d.say(roop, 'Have you tried turning\nyourself off and on again?', {
      maxWidth: WIDE_BOX,
      hold: 700,
    });

    // The building answers. Ceiling shot: the panel maintenance keeps promising
    // to look at, doing exactly what Roop just recommended.
    d.cut('ceiling');
    await d.beat(700);
    await d.say(roop, 'Yeah. It does that.', { maxWidth: WIDE_BOX, hold: 600 });

    /* ======================================================== INTRO — MARGE */

    d.cut(CAM.margeBoxes);
    toCam(marge);
    await d.nameCard(marge, { ms: 1400 });

    await d.say(marge, "I've prepared a slide.", { maxWidth: WIDE_BOX, hold: 380 });
    await d.say(marge, "It's one number.", { maxWidth: WIDE_BOX, hold: 380 });
    await d.say(marge, "It's red.", { maxWidth: WIDE_BOX, hold: 750 });

    /* ======================================================= THE CONVERGENCE */

    d.cut(CAM.bradLow);
    d.anim(brad, 'point');
    await d.say(brad, 'Meeting room. Two minutes.\nBring blockers. Bring energy.', {
      maxWidth: WIDE_BOX,
      hold: 600,
    });

    // Reception empties out: Kiki walks the length of the floor at us.
    focus(ctx.office, null);
    d.cut('doorway');
    d.place(kiki, SPOT.kikiDoorFrom, 90);
    await d.walk(kiki, SPOT.kikiDoorTo);

    // The bullpen empties out behind her.
    d.cut(CAM.toMeeting);
    d.place(dez, SPOT.dezGoFrom, 45);
    d.place(marge, SPOT.margeGoFrom, 70);
    d.place(roop, SPOT.roopGoFrom, 60);
    d.sit(roop, false);
    await d.all(
      d.walk(dez, SPOT.dezGoTo),
      d.walk(marge, SPOT.margeGoTo),
      d.walk(roop, SPOT.roopGoTo),
    );

    /* ========================================================== THE STANDUP */

    focus(ctx.office, 'meeting');
    d.place(brad, 'meetingHead', 0);
    d.place(marge, SPOT.standMarge, [9.20, 0, 4.20]);
    d.place(dez, SPOT.standDez, [9.40, 0, 3.40]);
    d.place(kiki, SPOT.standKiki, [9.40, 0, 4.60]);
    d.place(roop, SPOT.standRoop, [9.40, 0, 4.40]);
    d.anim(brad, 'idle');
    d.anim(marge, 'idle');
    d.anim(dez, 'idle');
    d.anim(kiki, 'idle');
    d.anim(roop, 'idle');

    d.cut('meetingWide');
    await d.encounter('! THE STANDUP BEGINS', { ms: 1000 });
    d.hud(PARTY);

    d.anim(brad, 'point');
    await d.say(brad, 'Nobody sit down.\nSitting is how meetings start.', {
      maxWidth: WIDE_BOX,
      hold: 600,
    });
    d.anim(brad, 'idle');

    // Down the table: the party formation, and a menu where every option loses.
    d.cut('meetingHead');
    const pick = await d.menu({
      prompt: 'HOW SHOULD WE START?',
      options: ['ROUND-ROBIN UPDATES', 'ENERGY CHECK-IN', 'WINS ONLY', 'EVERYONE AT ONCE'],
      pick: 3,
      auto: 2000,
    });
    if (pick >= 0) d.sfx('cursor', { gain: 0.4 });

    // ...EVERYONE AT ONCE. Two boxes on screen, neither of them listening.
    d.anim(dez, 'talk');
    d.anim(roop, 'shrug');
    await d.say(dez, 'The whale has a brother.', {
      id: 'dez-a', keep: true, maxWidth: TWIN_BOX, hold: 260,
    });
    await d.say(roop, 'The printer is plugged\ninto the printer.', {
      id: 'roop-a', keep: true, maxWidth: TWIN_BOX, hold: 520,
    });
    d.closeBoxes(null);
    d.anim(dez, 'idle');
    d.anim(roop, 'idle');

    d.cut('meetingWide');
    d.anim(kiki, 'talk');
    await d.say(kiki, 'The man in reception is\nstill in reception.', {
      id: 'kiki-a', keep: true, maxWidth: TWIN_BOX, hold: 320,
    });
    d.anim(kiki, 'idle');
    d.anim(marge, 'point');
    await d.say(marge, 'That is the auditor.', {
      id: 'marge-a', keep: true, maxWidth: TWIN_BOX, hold: 560,
    });
    await d.beat(320);
    d.closeBoxes(null);
    d.anim(marge, 'idle');
    d.updateHud({ BRAD: { hp: 31 }, KIKI: { hp: 48 } });

    /* ============================================================== BUTTON */

    d.cut(CAM.bradMed);
    d.anim(brad, 'cheer');
    await d.say(brad, 'Great. Great. Love that.', { maxWidth: WIDE_BOX, hold: 400 });
    d.anim(brad, 'idle');
    d.hud(null);

    await d.say(brad, 'Eleven days of runway is\neleven days of upside.', {
      id: 'brad-button',
      keep: true,
      maxWidth: WIDE_BOX,
      hold: 500,
    });

    // Cut to Marge. She says nothing. She holds up the number.
    d.cut(CAM.margeClose);
    d.anim(marge, 'point');
    d.targetOn(marge);
    await d.beat(600);
    d.closeBoxes(null);
    await d.damageOn(marge, '11', { big: true, color: '#ff4d4d' });
    await d.beat(520);

    d.targetOn(null);
    d.music(null);
    await d.fadeOut(650);
    await d.beat(300);
  } finally {
    // Whatever happened — end of episode or a cancel mid-sentence — leave the
    // UI empty so the player's end card is not wearing somebody's dialogue.
    d.hud(null);
    d.targetOn(null);
    d.closeBoxes(null);
    d.subtitle('');
    d.music(null);
  }
}

/**
 * The gallery thumbnail: all five of them in the meeting room, Brad mid-gesture
 * at the whiteboard, the company arranged around a table nobody is allowed to
 * sit at.
 *
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function poster(ctx) {
  const d = ctx.d;
  const cast = ctx.cast || {};

  d.use(ctx.office);
  focus(ctx.office, 'meeting');

  d.place(cast.brad, SPOT.posterBrad, [10.60, 0, 3.40]);
  d.place(cast.marge, SPOT.standMarge, [9.20, 0, 4.20]);
  d.place(cast.dez, SPOT.standDez, [9.40, 0, 3.40]);
  d.place(cast.kiki, SPOT.standKiki, [9.40, 0, 4.60]);
  d.place(cast.roop, SPOT.standRoop, [9.40, 0, 4.40]);
  d.place(cast.tuesday, SPOT.offstage, 0);

  d.anim(cast.brad, 'point');
  d.anim(cast.dez, 'talk');
  d.anim(cast.kiki, 'shrug');
  d.anim(cast.marge, 'idle');
  d.anim(cast.roop, 'idle');

  d.cut(CAM.poster);

  // Let the procedural poses settle so nobody is frozen halfway into a gesture.
  await d.wait(420);
}

/**
 * @type {{id:string, number:number, title:string, logline:string, runtime:string,
 *   starring:string[], accent:string, run:(ctx:EpisodeCtx)=>Promise<void>,
 *   poster:(ctx:EpisodeCtx)=>Promise<void>}}
 */
export default {
  id: 'ep1',
  number: 1,
  title: 'STANDUP',
  logline: 'Five people introduce themselves. It does not help.',
  runtime: '1:03',
  starring: ['brad', 'dez', 'kiki', 'roop', 'marge'],
  accent: ACCENT,
  run,
  poster,
};
