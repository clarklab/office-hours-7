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
 * BEAT BUDGET — 38 beats (24 dialogue boxes, 5 name cards, 14 camera setups,
 * 4 walks, 1 menu, 1 encounter slab, 1 damage number), measured at 1x:
 *   cold open .......  title + 2 narration boxes ................ ~7s
 *   BRAD ............  card + 2 lines, two setups ................ ~6s
 *   DEZ .............  card + 4 lines ............................ ~7s
 *   KIKI ............  card + the triple + 1 turn ................ ~6s
 *   ROOP ............  card + 1 line + the ceiling answers ....... ~6s
 *   MARGE ...........  card + 3 lines ............................ ~5s
 *   convergence .....  Brad's call + 2 walk setups ............... ~6s
 *   the standup .....  slab + Brad + menu + 4 overlapping lines .. ~15s
 *   button ..........  optimism + silence + the number + fade .... ~6s
 *   ------------------------------------------------------------------
 *   MEASURED 58.6s end to end (tools/check.mjs --ep=ep1), target 55-70s.
 *   Repeat runs land between 56s and 65s: the dialogue layer types and holds
 *   on real time while the Director waits on stage time, so a machine having
 *   a bad afternoon stretches the waits and not the typing. Both ends are
 *   inside the window; do not spend the margin.
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
  dezDesk: { pos: [1.45, 1.50, -2.60], look: [0.05, 1.36, -4.45], fov: 44 },
  /** Reception, close: Kiki left of frame, MULCH wall behind, boxes stack right. */
  reception: { pos: [-10.45, 1.40, -2.00], look: [-11.75, 1.47, -2.90], fov: 38 },
  /** Carpet height, close enough to see he is sitting on it. */
  roopFloor: { pos: [-1.00, 0.60, -0.55], look: [-1.58, 0.95, -1.90], fov: 50 },
  /** The back hallway: Marge walled in by archive boxes on both sides. */
  margeBoxes: { pos: [-1.40, 1.50, 3.30], look: [0.15, 1.40, 5.00], fov: 46 },
  /** The bullpen watching three people file toward the meeting room. */
  toMeeting: { pos: [2.20, 1.62, 1.05], look: [5.55, 1.28, 3.35], fov: 55 },
  /** The standup, wide: all five, tight enough that faces still read. */
  standupWide: { pos: [6.75, 1.82, 6.30], look: [9.55, 1.10, 3.20], fov: 54 },
  /** Down the table at the whole party. Tilted so the HUD has the floor. */
  standupHead: { pos: [9.40, 1.92, 7.00], look: [9.40, 1.00, 1.15], fov: 52 },
  /** Brad down the table, Marge and Dez flanking him, whiteboard behind. */
  bradMed: { pos: [9.90, 1.62, 4.30], look: [9.40, 1.48, 1.55], fov: 42 },
  /** The single the button needs: Marge, alone, holding a number. */
  margeClose: { pos: [7.45, 1.46, 2.85], look: [7.58, 1.34, 1.45], fov: 40 },
  /** Poster: the whole company in one frame, Brad mid-gesture. */
  poster: { pos: [6.95, 1.72, 6.00], look: [9.39, 1.40, 2.86], fov: 50 },
};

/**
 * Floor positions the set does not name. Everything else in the episode uses
 * `office.marks`; these are the gaps — the standing formation for a meeting
 * nobody is allowed to sit down in, and the walk-ons for the convergence.
 * All are `[x, y, z]` because that is what the Director resolves.
 * @type {Object<string, number[]>}
 */
const SPOT = {
  // cold open: far enough back that the establishing wide does not clip her
  margeFiling: [1.60, 0, 6.00],
  // Roop's intro: on the carpet, legs under the desk he is fixing
  roopUnderDesk: [-1.60, 0, -1.95],
  // The standup formation: a V opening toward the foot of the table, Brad at
  // the apex. Clear of every chair, nobody within 3m of either wide's lens
  // (people at the edge of a 50-degree frame stretch into blobs), and split
  // left/right so two dialogue boxes never fight for the same corner.
  standMarge: [7.60, 0, 1.30],
  standDez: [10.90, 0, 1.30],
  standRoop: [11.20, 0, 3.30],
  standKiki: [11.05, 0, 4.60],
  // convergence: a queue filing toward the meeting-room door, staggered in
  // depth and across frame so three people read as three people
  kikiDoorFrom: [-8.90, 0, -0.30],
  kikiDoorTo: [-6.95, 0, -0.20],
  dezGoFrom: [4.30, 0, 2.35],
  dezGoTo: [5.55, 0, 3.05],
  margeGoFrom: [3.35, 0, 2.70],
  margeGoTo: [4.85, 0, 3.45],
  roopGoFrom: [2.95, 0, 2.95],
  roopGoTo: [4.30, 0, 3.70],
  // The poster: Brad in profile at the board, mid-gesture, and the company
  // fanned across the frame — every one of them at least 3.6m from the lens,
  // at least 8 degrees off their neighbour, and turned far enough toward the
  // camera that a face reads rather than the back of a head.
  posterBrad: [9.10, 0, 1.40],
  posterBoard: [7.80, 0, 1.10],
  posterMarge: [7.75, 0, 2.45],
  posterKiki: [10.90, 0, 2.20],
  posterDez: [11.35, 0, 3.55],
  posterRoop: [11.45, 0, 4.55],
  // the dog is not in this episode. She is outside the building. She knows.
  offstage: [0, 0, 12.5],
};

/** Box width that keeps a spoken line from re-wrapping under ~36 chars. */
const WIDE_BOX = 300;
/** Narrow boxes, so two of them fit on screen at once (ref 04). */
const TWIN_BOX = 220;

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

  // Roop on the carpet with his legs under his own desk, facing the camera
  // he is about to be introduced by.
  d.place(cast.roop, SPOT.roopUnderDesk, [-1.00, 0, -0.55]);
  d.sit(cast.roop, true);

  // Marge is in the back, filing. Deep enough to stay out of the wide.
  d.place(cast.marge, SPOT.margeFiling, [0.60, 0, 4.60]);
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

    await d.title({ logo: true, subtitle: 'EPISODE ONE — "STANDUP"', ms: 1700 });

    await d.say(null, 'MULCH, INC.\nThe Everything Layer.', { maxWidth: WIDE_BOX, hold: 520 });
    await d.say(null, 'Eleven days of runway.\nNobody has said that out loud.', {
      maxWidth: WIDE_BOX,
      hold: 600,
    });

    /* ========================================================= INTRO — BRAD */

    focus(ctx.office, 'bullpen');
    d.cut('whiteboard');
    toCam(brad);
    await d.nameCard(brad, { ms: 1050 });

    // Boxes ride the top of frame, ref 02: the people stay in the lower half.
    await d.say(brad, 'I don\'t believe in meetings.', {
      maxWidth: WIDE_BOX, anchor: 'tr', hold: 500,
    });

    // Cut to the low angle for the word itself. Founders are shot from below.
    d.cut(CAM.bradLow);
    d.anim(brad, 'point');
    await d.say(brad, 'That\'s why this is a STANDUP.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 640,
    });
    await d.beat(420);

    /* ========================================================== INTRO — DEZ */

    d.cut(CAM.dezDesk);
    d.anim(dez, 'talk');
    d.sfx('phone', { gain: 0.35 });
    await d.nameCard(dez, { ms: 1050 });

    await d.say(dez, 'I\'ve got a whale on the hook.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 240,
    });
    await d.say(dez, 'He doesn\'t know it yet.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 240,
    });
    await d.say(dez, 'He doesn\'t know me.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 340,
    });

    d.anim(dez, 'idle');
    await d.beat(260);
    await d.say(dez, 'He hung up.\nThat\'s the first yes.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 620,
    });

    /* ========================================================= INTRO — KIKI */

    focus(ctx.office, 'reception');
    d.cut(CAM.reception);
    await d.nameCard(kiki, { ms: 1050 });

    // Three calls, one answer. The boxes stack down the right of frame because
    // nothing about the call ever changes, and each one types back faster than
    // the last. She does not.
    const KIKI_LINE = 'Front desk. No he\'s not.';
    await d.say(kiki, KIKI_LINE, { id: 'kiki-1', keep: true, at: [268, 52], cps: 34, hold: 240 });
    await d.say(kiki, KIKI_LINE, { id: 'kiki-2', keep: true, at: [268, 98], cps: 46, hold: 220 });
    await d.say(kiki, KIKI_LINE, { id: 'kiki-3', keep: true, at: [268, 144], cps: 58, hold: 340 });
    d.closeBoxes(null);

    toCam(kiki);
    await d.say(kiki, 'That\'s the whole job.', {
      maxWidth: WIDE_BOX, anchor: 'tr', hold: 600,
    });

    /* ========================================================= INTRO — ROOP */

    focus(ctx.office, 'bullpen');
    d.cut(CAM.roopFloor);
    toCam(roop);
    await d.nameCard(roop, { ms: 1050 });

    await d.say(roop, 'Have you tried turning\nyourself off and on again?', {
      maxWidth: WIDE_BOX, anchor: 'tr', hold: 560,
    });

    // The building answers, silently. Ceiling shot: the panel maintenance keeps
    // promising to look at, doing exactly what Roop just recommended.
    d.cut('ceiling');
    await d.beat(1250);

    /* ======================================================== INTRO — MARGE */

    // She was filing at the back of the hallway; now she is between the two
    // stacks, facing the lens, walled in.
    d.place(marge, 'boxes', [-1.40, 0, 3.30]);
    d.cut(CAM.margeBoxes);
    await d.nameCard(marge, { ms: 1050 });

    await d.say(marge, 'I\'ve prepared a slide.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 300,
    });
    await d.say(marge, 'It\'s one number.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 300,
    });
    await d.say(marge, 'It\'s red.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 780,
    });

    /* ======================================================= THE CONVERGENCE */

    d.cut(CAM.bradLow);
    d.anim(brad, 'point');
    await d.say(brad, 'Meeting room. Two minutes.\nBring blockers. Bring energy.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 520,
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
    d.place(marge, SPOT.standMarge, [9.00, 0, 4.20]);
    // Kiki stands with the room but faces the door she still half-belongs to,
    // which is also the one angle where her hair reads as hair and not as a
    // hole in the frame. She is nearest the lens, so she gets the good side.
    d.place(kiki, SPOT.standKiki, [7.60, 0, 6.40]);
    d.place(dez, SPOT.standDez, [9.80, 0, 4.20]);
    d.place(roop, SPOT.standRoop, [9.60, 0, 4.30]);
    d.anim(brad, 'idle');
    d.anim(marge, 'idle');
    d.anim(dez, 'idle');
    d.anim(kiki, 'idle');
    d.anim(roop, 'idle');

    d.cut(CAM.standupWide);
    await d.encounter('! THE STANDUP BEGINS', { ms: 800 });
    d.hud(PARTY);

    d.anim(brad, 'point');
    await d.say(brad, 'Nobody sit down.\nSitting is how meetings start.', {
      maxWidth: WIDE_BOX,
      hold: 480,
    });
    d.anim(brad, 'idle');

    // Down the table: the party formation, and a menu where every option loses.
    d.cut(CAM.standupHead);
    const pick = await d.menu({
      prompt: 'HOW SHOULD WE START?',
      options: ['ROUND-ROBIN UPDATES', 'ENERGY CHECK-IN', 'WINS ONLY', 'EVERYONE AT ONCE'],
      pick: 3,
      auto: 1300,
    });
    if (pick >= 0) d.sfx('cursor', { gain: 0.4 });

    // ...EVERYONE AT ONCE. Two boxes up at once, corner to corner, each on the
    // side of frame its speaker is standing on — and both clear of the HUD,
    // which an `at`-anchored box would happily sit on top of.
    d.anim(dez, 'talk');
    d.anim(kiki, 'shrug');
    await d.say(dez, 'The whale has a brother.', {
      id: 'dez-a', keep: true, maxWidth: TWIN_BOX, anchor: 'tr', hold: 240,
    });
    await d.say(kiki, 'The man in reception is\nstill in reception.', {
      id: 'kiki-a', keep: true, maxWidth: TWIN_BOX, anchor: 'tl', hold: 420,
    });
    d.closeBoxes(null);
    d.anim(dez, 'idle');
    d.anim(kiki, 'idle');

    d.cut(CAM.standupWide);
    d.anim(roop, 'shrug');
    await d.say(roop, 'The printer is plugged\ninto the printer.', {
      id: 'roop-a', keep: true, maxWidth: TWIN_BOX, anchor: 'tr', hold: 280,
    });
    d.anim(roop, 'idle');
    d.anim(marge, 'point');
    await d.say(marge, 'That is the auditor.', {
      id: 'marge-a', keep: true, maxWidth: TWIN_BOX, anchor: 'tl', hold: 440,
    });
    await d.beat(240);
    d.closeBoxes(null);
    d.anim(marge, 'idle');
    d.updateHud({ BRAD: { hp: 31 }, KIKI: { hp: 48 } });

    /* ============================================================== BUTTON */

    d.cut(CAM.bradMed);
    d.anim(brad, 'cheer');
    await d.say(brad, 'Great. Great. Love that.', {
      maxWidth: WIDE_BOX, anchor: 'tm', hold: 280,
    });
    d.anim(brad, 'idle');
    d.hud(null);

    await d.say(brad, 'Eleven days of runway is\neleven days of upside.', {
      id: 'brad-button',
      keep: true,
      anchor: 'tm',
      maxWidth: WIDE_BOX,
      hold: 420,
    });

    // Cut to Marge. She says nothing. She holds up the number.
    d.cut(CAM.margeClose);
    d.anim(marge, 'point');
    d.targetOn(marge);
    await d.beat(700);
    d.closeBoxes(null);
    d.sfx('stamp', { gain: 0.55 });
    // Hand-placed over her raised arm: she is holding the number up, and at
    // this size her head has no room above it for a 33px numeral.
    await d.damageOn(marge, '11', { big: true, color: '#ff4d4d', at: [306, 116] });
    await d.beat(640);

    d.targetOn(null);
    d.music(null);
    await d.fadeOut(600);
    await d.beat(250);
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

  // Brad in profile at the board, arm up; the company staggered in depth so
  // nobody is standing inside anybody and every face is turned to him.
  d.place(cast.brad, SPOT.posterBrad, SPOT.posterBoard);
  d.place(cast.marge, SPOT.posterMarge, SPOT.posterBrad);
  d.place(cast.kiki, SPOT.posterKiki, SPOT.posterBrad);
  d.place(cast.dez, SPOT.posterDez, SPOT.posterBrad);
  d.place(cast.roop, SPOT.posterRoop, SPOT.posterBrad);
  d.place(cast.tuesday, SPOT.offstage, 0);

  d.anim(cast.brad, 'point');
  d.anim(cast.dez, 'talk');
  d.anim(cast.kiki, 'idle');
  d.anim(cast.marge, 'idle');
  d.anim(cast.roop, 'idle');
  // Everyone turns to Brad. Roop turns to the lens, because Roop is holding a
  // monitor and that monitor is the second most interesting thing in the room.
  for (const who of [cast.marge, cast.kiki, cast.dez]) d.face(who, cast.brad, 0);
  d.face(cast.roop, CAM.poster.pos, 0);

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
  runtime: '1:05',
  starring: ['brad', 'dez', 'kiki', 'roop', 'marge'],
  accent: ACCENT,
  run,
  poster,
};
