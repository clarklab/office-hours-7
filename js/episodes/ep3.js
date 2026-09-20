/**
 * OFFICE HOURS VII — EPISODE THREE: "TUESDAY"
 *
 * A dog is in the office. Nobody knows how. The whole thing is staged as a
 * JRPG random encounter: the battle HUD slides up, the amber cursor drops on
 * the dog, and five adults take a command menu to a labrador.
 *
 * The humans are ridiculous. The dog is not. That is the entire joke.
 *
 * ---------------------------------------------------------------------------
 * BEAT SHEET / RUNNING ESTIMATE
 * ---------------------------------------------------------------------------
 *  ACT 0  TITLE                                  ~2.5s  ( 3 beats,  1 set-up)
 *    logo card over a held establishing wide, a dog at the water cooler
 *  ACT 1  A NORMAL TUESDAY                       ~8.5s  ( 6 beats,  4 set-ups)
 *    Marge's line item, Roop's water bowl, Dez's call, then FLOOR LEVEL:
 *    something walks into a 28cm-high lens and sniffs it
 *  ACT 2  THE ENCOUNTER                          ~9.0s  ( 9 beats,  5 set-ups)
 *    bark / flash / shake / battle music / HUD / amber cursor /
 *    "! TUESDAY APPEARED" -> Kiki has already named her, and made a badge
 *  ACT 3  THE BATTLE MENU                       ~30.0s  (23 beats,  9 set-ups)
 *    TALK  -> Brad misses; Dez puts her on a sales call, misses
 *    FEED  -> she ate at nine; she is on the org chart (ceiling shot)
 *    ADOPT -> Marge's per-head cost OVER Roop's denial, two boxes at once
 *    RUN   -> TUESDAY USED ZOOMIES: 8.5s, one camera, no cuts, she leaves
 *             frame twice and comes back
 *  ACT 4  THE ONE CORRECT THING                  ~9.5s  ( 9 beats,  5 set-ups)
 *    Brad says sit. She sits. Fanfare, 9999, and five boxes of credit at once
 *  ACT 5  BUTTON                                 ~7.5s  ( 7 beats,  3 set-ups)
 *    the chair, the party deferring to it, HP ???, GOOD 10/10, fade
 *  ---------------------------------------------------------------------------
 *  57 timed beats / 27 camera set-ups / longest hold = the 8.5s zoomies shot.
 *  ESTIMATED 62s of scene time, MEASURED 62.4s wall clock by tools/check.mjs.
 * ---------------------------------------------------------------------------
 *
 * @module episodes/ep3
 */

/** @typedef {import('../core/director.js').Director} Director */
/** @typedef {import('../characters/rig.js').Actor} Actor */
/** @typedef {{stage:Object, ui:Object, d:Director, office:Object, cast:Object<string,Actor>, THREE:Object}} EpisodeCtx */

/** EP3's accent, per SPEC section 7. @type {string} */
const ACCENT = '#c98a4b';

/** Dialogue hold, tightened from the 750ms default to keep inside 70s. */
const HOLD = 540;

/**
 * Floor positions this episode needs that `office.marks` does not name. Every
 * one is checked clear of the desks, the cubicle partitions at x=+-2.5 and the
 * row-A chairs at z=-1.85 — see the floor plan in `/js/sets/office.js`.
 * @type {Object<string, number[]>}
 */
const SPOT = {
  /* The argument semicircle: five adults in an arc, all facing the dog. */
  roop: [-2.80, 0, -0.70],
  kiki: [-1.55, 0, -1.10],
  brad: [-0.45, 0, -1.25],
  dez: [0.95, 0, -1.15],
  marge: [2.05, 0, -0.80],

  /** Where the dog stands for most of it — downstage of the whole company. */
  dogMark: [0.55, 0, 0.75],
  /** Where she first noses into the floor-level shot. */
  dogEnter: [2.55, 0, 1.30],
  /** Poster only: downstage of everyone, broadside to the lens. */
  posterMark: [0.60, 0, 0.90],
  /** Downstage, past the lens: what the dog looks at when she looks at us. */
  downstage: [1.40, 0, 3.60],
  /** Where she is looking when she sits: past Brad, broadside to the camera. */
  sitLook: [-1.20, 0, -0.20],

  /** The chair the founder is about to lose. Seat top is at y=0.49. */
  chair: [0.02, 0.49, -1.85],
  /** Standing beside that chair, for the man who no longer has one. */
  bradByChair: [-0.95, 0, -1.00],
  /** Act 5 only: the wings close in so all five fit the reverence shot. */
  roopClose: [-2.10, 0, -0.55],
  margeClose: [1.85, 0, -0.70],

  /** Zoomies waypoints. The lane runs downstage of the party, wall to wall. */
  zoomA: [-3.90, 0, 0.35],
  zoomB: [4.00, 0, 1.15],
  zoomC: [-2.60, 0, 0.15],
  zoomD: [1.10, 0, 1.00],
};

/**
 * Hand-built set-ups. `office.shots` covers the room beautifully but every
 * camera in it is at human eye height, and this episode is mostly about
 * something 62cm tall.
 * @type {Object<string, {pos:number[], look:number[], fov?:number}>}
 */
const SHOT = {
  /**
   * THE BATTLE STANCE. Note the height: the HUD owns the bottom 40% of the
   * frame, so any camera that has to see a 62cm dog at the same time has to
   * sit at roughly her eye level and stay level. Every `battle*` set-up below
   * obeys that, which is also why this episode looks the way it does.
   */
  battle: { pos: [0.10, 0.58, 3.20], look: [0.15, 0.58, -1.00], fov: 56 },
  /** Same stance, swung left — favours Kiki, keeps the dog downstage right. */
  battleLeft: { pos: [-2.30, 0.60, 2.50], look: [-0.30, 0.60, -1.00], fov: 52 },
  /** Swung right — favours Dez and Marge, dog downstage left. */
  battleRight: { pos: [2.70, 0.60, 2.30], look: [0.60, 0.60, -1.00], fov: 52 },
  /** THE DOG'S POINT OF VIEW: over her ears, up at five enormous adults. */
  dogPov: { pos: [0.68, 0.32, 1.75], look: [-0.30, 1.50, -1.25], fov: 60 },
  /** The long one. Low, wide, and she runs clean out of both sides of it. */
  zoomies: { pos: [0.00, 0.45, 3.10], look: [0.20, 0.50, -0.90], fov: 66 },
  /** The party from behind, facing the chair. Backs to us. FF7 to the bone. */
  throne: { pos: [0.20, 1.35, 2.15], look: [0.04, 0.82, -1.85], fov: 58 },
  /** Past Brad's elbow and Dez's shoulder, at the new management. */
  throneClose: { pos: [0.10, 0.62, 0.65], look: [0.02, 0.66, -1.85], fov: 46 },
  /**
   * The poster. Knee height and tilted just enough that the dog's topline,
   * both ears and the tail sit clear against the carpet in the bottom band,
   * with the argument stacked above her.
   */
  poster: { pos: [1.90, 0.85, 2.40], look: [-0.40, 1.15, -1.20], fov: 60 },
};

/**
 * The party roster, in HUD order. Joke stats are SPEC section 6.
 * @returns {Array<Object>}
 */
function partyRows() {
  return [
    { name: 'BRAD', hp: 40, maxHp: 40, mp: '999', limit: 0.92 },
    { name: 'DEZ', hp: 88, maxHp: 88, mp: '4', limit: 0.40 },
    { name: 'KIKI', hp: 62, maxHp: 62, mp: '0', limit: 1.00 },
    { name: 'ROOP', hp: 31, maxHp: 31, mp: '402', limit: 0.18 },
    { name: 'MARGE', hp: 55, maxHp: 55, mp: '12', limit: 0.55 },
  ];
}

/**
 * A clean single on one of the five. Everybody in the arc faces the dog, who
 * is downstage, so a camera in front of them is always over open carpet.
 * @param {Director} d
 * @param {Actor} actor
 * @param {number} angle degrees off world +Z
 * @param {number} [dist=3.0]
 * @param {Object} [o] extra `shotOn` options
 * @returns {Object} a Shot
 */
function single(d, actor, angle, dist = 3.0, o = {}) {
  return d.shotOn(actor, Object.assign({
    absolute: true, angle, dist, height: 1.55, lookHeight: 1.40, fov: 48,
  }, o));
}

/**
 * Coverage of the dog, from the open floor downstage of her.
 * @param {Director} d
 * @param {Actor} dog
 * @param {number} angle degrees off world +Z
 * @param {number} dist
 * @param {number} height camera height in metres
 * @param {Object} [o]
 * @returns {Object} a Shot
 */
function onDog(d, dog, angle, dist, height, o = {}) {
  return d.shotOn(dog, Object.assign({
    absolute: true, angle, dist, height, lookHeight: 0.42, fov: 52,
  }, o));
}

/**
 * Cut, and park the amber cursor only where the camera can actually see it.
 * A target triangle clamped to the edge of frame, pointing at a dog who is
 * two rooms of screen space away, is worse than no cursor at all.
 * @param {Director} d
 * @param {Object} shot a Shot, or the name of a registered one
 * @param {Actor|null} [target]
 * @returns {void}
 */
function cutTo(d, shot, target) {
  d.cut(shot);
  d.targetOn(target || null);
}

/**
 * Puts everyone where the poster and the argument both want them: the dog
 * downstage, the five of them in an arc behind her, all facing in.
 * @param {Director} d
 * @param {Object<string, Actor>} c
 * @returns {void}
 */
function formTheArc(d, c) {
  d.place(c.roop, SPOT.roop, SPOT.dogMark);
  d.place(c.kiki, SPOT.kiki, SPOT.dogMark);
  d.place(c.brad, SPOT.brad, SPOT.dogMark);
  d.place(c.dez, SPOT.dez, SPOT.dogMark);
  d.place(c.marge, SPOT.marge, SPOT.dogMark);
}

/**
 * One leg of the zoomies. `walk()` forces the `walk` pose on the way out, so
 * the real pose goes on immediately afterwards and rides the same tween.
 * @param {Director} d
 * @param {Actor} dog
 * @param {number[]} to
 * @param {number} ms
 * @returns {Promise<void>}
 */
function dash(d, dog, to, ms) {
  const p = d.walk(dog, to, ms);
  d.anim(dog, 'zoomies');
  return p;
}

/**
 * The command window. Same prompt, same four options, every time — the
 * ceremony is the joke.
 * @param {Director} d
 * @param {number} pick
 * @param {number} auto
 * @returns {Promise<number>}
 */
function command(d, pick, auto) {
  return d.menu({
    prompt: 'WHAT DO WE DO',
    options: ['TALK', 'FEED', 'ADOPT', 'RUN'],
    style: 'battle',
    pick,
    auto,
  });
}

/**
 * EP3.
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);

  const dog = c.tuesday;

  /* ====================================================== ACT 0 — TITLE == */

  d.hud(null);
  d.subtitle('');
  if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom('bullpen');

  // Everyone at their station. Row A works facing the room; Roop faces his
  // desk, the only relationship in his life that returns his calls.
  d.place(c.brad, 'deskBrad', 'bullpenCenter');
  d.place(c.dez, 'deskDez', 'bullpenCenter');
  d.place(c.marge, 'deskMarge', 'bullpenCenter');
  d.place(c.roop, 'deskRoop', 180);
  d.place(c.kiki, 'doorway', 'bullpenCenter');
  d.place(dog, 'waterCooler', 'bullpenCenter');

  d.anim(c.brad, 'type');
  d.anim(c.dez, 'talk');
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'type');
  d.anim(c.kiki, 'idle');
  d.anim(dog, 'sniff');

  d.cut('establish');
  d.music('lobby');
  await d.title({ logo: true, subtitle: 'EPISODE THREE — "TUESDAY"', ms: 1200 });

  /* =========================================== ACT 1 — A NORMAL TUESDAY == */

  // A held wide. Out at frame right, small, something is sniffing a water
  // cooler. Nobody in this building has noticed.
  await d.beat(400);

  d.cut(single(d, c.marge, 20, 3.0));
  d.face(c.marge, 'bullpenCenter');
  await d.say(c.marge, 'Line item forty-one.\nSnacks.', { hold: HOLD });

  // He swivels to ask the room, which is the most social thing he does today.
  d.cut('deskRowB');
  d.face(c.roop, [-3.60, 0, -0.50]);
  d.anim(c.roop, 'shrug');
  await d.say(c.roop, 'Who filled the water bowl\nby the copier?', { hold: HOLD });

  d.cut('windowWall');
  d.anim(c.dez, 'talk');
  await d.say(c.dez, 'Not me. I am on a call.', { hold: HOLD });

  // FLOOR LEVEL. The camera is 28cm off the carpet and a dog walks into it.
  d.cut('floorLevel');
  d.place(dog, SPOT.dogEnter, SPOT.dogMark);
  await d.walk(dog, SPOT.dogMark, 1250);
  d.anim(dog, 'sniff');
  d.face(dog, SPOT.downstage);
  await d.beat(500);

  /* ============================================= ACT 2 — THE ENCOUNTER === */

  d.sfx('bark');
  d.anim(dog, 'bark');
  d.shake(0.34, 460);
  d.music('chase');
  await d.flash('#ffffff', 250);

  // The white frame covers the reposition: five people who were at their
  // desks are now standing in a semicircle, which is how offices work.
  formTheArc(d, c);
  d.anim(c.brad, 'point');
  d.anim(c.dez, 'shrug');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'panic');
  d.anim(c.marge, 'point');
  d.anim(dog, 'idle');
  d.face(dog, SPOT.downstage);
  d.cut(onDog(d, dog, 14, 2.90, 1.15));
  d.hud(partyRows());
  await d.beat(300);

  d.targetOn(dog);
  await d.encounter('! TUESDAY APPEARED', { ms: 950 });

  cutTo(d, single(d, c.brad, 10));
  await d.say(c.brad, 'What is that.', { hold: HOLD });

  cutTo(d, SHOT.battleLeft, dog);
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'That is Tuesday.', { hold: HOLD });

  cutTo(d, single(d, c.brad, 16, 2.8));
  d.anim(c.brad, 'shrug');
  await d.say(c.brad, 'Today is Thursday.', { hold: HOLD });

  cutTo(d, single(d, c.kiki, -26, 2.8));
  d.anim(c.kiki, 'point');
  await d.say(c.kiki, 'Her name is Tuesday.\nI made her a badge.', { hold: HOLD });

  /* ========================================== ACT 3 — THE BATTLE MENU ==== */

  /* ---- TALK ---- */

  cutTo(d, SHOT.battle, dog);
  d.anim(c.brad, 'idle');
  d.anim(c.kiki, 'idle');
  d.anim(c.roop, 'shrug');
  await command(d, 0, 1050);

  cutTo(d, onDog(d, dog, -34, 1.95, 0.62), dog);
  d.face(dog, SPOT.brad);
  d.anim(c.brad, 'point');
  await d.say(c.brad, 'Hey. Hey buddy. Hey.', { hold: HOLD });

  // The dog's reply. Routed as narration with a speaker and her own voice, so
  // she gets the box without the rig throwing a bark over the top of it.
  cutTo(d, SHOT.dogPov);
  await d.say(null, '......', {
    speaker: 'TUESDAY', voice: 'tuesday', at: [206, 112], maxWidth: 120, hold: HOLD,
  });
  await d.damageOn(c.brad, 'MISS');

  cutTo(d, SHOT.battleRight, dog);
  d.anim(c.dez, 'talk');
  await d.say(c.dez, 'Ron. Say hi to Tuesday.', { hold: HOLD });

  d.sfx('bark');
  d.anim(dog, 'bark');
  d.anim(c.dez, 'cheer');
  await d.damageOn(c.dez, 'MISS');

  /* ---- FEED ---- */

  cutTo(d, SHOT.battle, dog);
  d.anim(c.dez, 'slump');
  d.anim(dog, 'idle');
  await command(d, 1, 1050);

  cutTo(d, SHOT.battleLeft, dog);
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'She has eaten. I fed her\nat nine.', { hold: HOLD });

  cutTo(d, single(d, c.brad, 12, 2.8));
  d.anim(c.brad, 'panic');
  await d.say(c.brad, 'You have had her\nsince NINE?', { hold: HOLD });

  // CEILING SHOT — up past the party at the drop tiles. From down here the
  // org chart is a very tall thing.
  cutTo(d, 'ceiling');
  d.anim(c.kiki, 'point');
  d.anim(c.brad, 'slump');
  await d.say(c.kiki, 'She is on the org chart.', { hold: HOLD });

  cutTo(d, single(d, c.roop, -8, 3.2));
  d.anim(c.roop, 'panic');
  d.emote(c.roop, 'sweat');
  await d.say(c.roop, 'HKKTCH.', { hold: HOLD });

  /* ---- ADOPT ---- */

  cutTo(d, SHOT.battle, dog);
  d.anim(c.roop, 'idle');
  d.anim(c.brad, 'idle');
  d.anim(dog, 'sniff');
  await command(d, 2, 1100);

  // TWO BOXES AT ONCE (ref 04): the arithmetic and the denial, talking over
  // each other. Distinct ids and keep:true, or the second one eats the first.
  cutTo(d, SHOT.battleRight, dog);
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'shrug');
  const arithmetic = d.say(c.marge, 'Fully loaded, per head,\nshe is $41.20 a day.', {
    id: 'marge-cost', keep: true, at: [268, 60], maxWidth: 152, hold: HOLD,
  });
  await d.beat(260);
  const denial = d.say(c.roop, 'I am not allergic.', {
    id: 'roop-denial', keep: true, at: [104, 120], maxWidth: 132, hold: HOLD,
  });
  await d.all(arithmetic, denial);

  await d.damageOn(c.brad, '41.20', { color: ACCENT, big: true });
  d.updateHud({ BRAD: { hp: 26 } });
  d.closeBoxes(['marge-cost', 'roop-denial']);

  cutTo(d, single(d, c.roop, -6, 3.0));
  d.anim(c.roop, 'panic');
  d.emote(c.roop, 'sweat');
  await d.say(c.roop, 'HKKTCH. Dust.', { hold: HOLD });
  d.updateHud({ ROOP: { hp: 19 } });
  await d.damageOn(c.roop, 'MISS');

  /* ---- RUN ---- */

  cutTo(d, SHOT.battle, dog);
  d.anim(c.roop, 'idle');
  await command(d, 3, 1100);

  /* -------------------------------------------------------------------- *
   * THE ZOOMIES. ONE SHOT. NO CUTS. She leaves frame left, comes back,
   * leaves frame right, comes back, while five adults fail to finish a
   * sentence about her.
   * -------------------------------------------------------------------- */

  // Cursor off: she stopped being a target the moment she started enjoying
  // herself, and nobody in this room is going to admit they noticed.
  cutTo(d, SHOT.zoomies);
  d.anim(c.brad, 'shrug');
  d.anim(c.dez, 'point');
  d.anim(c.marge, 'type');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'panic');
  d.sfx('bark');
  await d.toast('TUESDAY USED ZOOMIES', 900);

  await dash(d, dog, SPOT.zoomA, 1300);
  await d.all(
    dash(d, dog, SPOT.zoomB, 1850),
    d.say(c.kiki, 'Zoomies.', { hold: HOLD }),
  );
  await d.all(
    dash(d, dog, SPOT.zoomC, 1600),
    d.say(c.marge, 'That is four laps.', { hold: HOLD }),
  );
  await dash(d, dog, SPOT.zoomD, 950);
  d.anim(dog, 'shake');
  d.sfx('bark');
  await d.beat(700);
  d.anim(dog, 'idle');
  d.face(dog, SPOT.brad);
  await d.beat(300);

  /* ================================= ACT 4 — THE ONE CORRECT THING ====== */

  cutTo(d, single(d, c.brad, 8, 2.6, { height: 1.30, lookHeight: 1.45 }));
  d.anim(c.brad, 'slump');
  await d.say(c.brad, 'Sit.', { hold: HOLD });

  // Profile, at her eye level. A sitting dog seen side-on is the single most
  // legible shape in this whole show; seen from behind she is a brown box.
  d.face(dog, SPOT.sitLook);
  cutTo(d, onDog(d, dog, -63, 2.10, 0.80, { fov: 52 }));
  await d.beat(620);

  d.anim(dog, 'sit');
  d.sfx('fanfare');
  d.music('victory');
  await d.beat(750);

  cutTo(d, SHOT.battle);
  d.anim(c.brad, 'panic');
  await d.damageOn(c.brad, '9999', { big: true });

  cutTo(d, single(d, c.brad, 14, 2.7));
  d.anim(c.brad, 'idle');
  await d.say(c.brad, '......', { hold: HOLD });
  await d.say(c.brad, 'Nothing in this building\nhas ever listened to me.', { hold: HOLD });

  // THE CHORUS. Five boxes, five ids, all kept, all at once, hand-placed so
  // they tile the frame above the HUD instead of dodging each other.
  cutTo(d, SHOT.battle);
  d.anim(c.kiki, 'cheer');
  d.anim(c.dez, 'point');
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'shrug');
  d.anim(c.brad, 'point');

  const chorus = [
    d.say(c.kiki, 'Team effort.', { id: 'cr-kiki', keep: true, at: [62, 52], maxWidth: 118, hold: 460 }),
  ];
  await d.beat(150);
  chorus.push(d.say(c.brad, 'I said sit.', { id: 'cr-brad', keep: true, at: [192, 52], maxWidth: 118, hold: 460 }));
  await d.beat(150);
  chorus.push(d.say(c.dez, 'I closed it.', { id: 'cr-dez', keep: true, at: [322, 52], maxWidth: 118, hold: 460 }));
  await d.beat(150);
  chorus.push(d.say(c.roop, 'I allowed it', { id: 'cr-roop', keep: true, at: [125, 98], maxWidth: 118, hold: 460 }));
  await d.beat(150);
  chorus.push(d.say(c.marge, 'Unbudgeted.', { id: 'cr-marge', keep: true, at: [257, 98], maxWidth: 118, hold: 460 }));
  await d.all(chorus);
  await d.beat(260);
  d.closeBoxes(null);

  /* ================================================ ACT 5 — THE BUTTON == */

  d.music('lobby');
  d.place(dog, SPOT.chair, SPOT.brad);
  d.anim(dog, 'sit');
  d.place(c.brad, SPOT.bradByChair, SPOT.chair);
  d.place(c.roop, SPOT.roopClose, SPOT.chair);
  d.place(c.marge, SPOT.margeClose, SPOT.chair);
  for (const a of [c.brad, c.dez, c.kiki, c.roop, c.marge]) d.anim(a, 'idle');
  d.face(c.kiki, SPOT.chair);
  d.face(c.dez, SPOT.chair);
  d.face(c.marge, SPOT.chair);
  d.face(c.roop, SPOT.chair);

  d.cut(SHOT.throneClose);
  await d.beat(520);

  d.cut(single(d, c.brad, 30, 2.6));
  await d.say(c.brad, '......that is my chair.', { hold: HOLD });

  d.cut(SHOT.throne);
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'It is her chair now.', { hold: HOLD });

  // Roster amended. The founder does not make the cut.
  d.hud([
    { name: 'TUESDAY', hp: '???', mp: '10/10', limit: 1 },
    { name: 'DEZ', hp: 88, maxHp: 88, mp: '4', limit: 0.4 },
    { name: 'KIKI', hp: 62, maxHp: 62, mp: '0', limit: 1 },
    { name: 'ROOP', hp: 19, maxHp: 31, mp: '402', limit: 0.18 },
    { name: 'MARGE', hp: 55, maxHp: 55, mp: '12', limit: 0.55 },
  ]);
  d.subtitle('TUESDAY  —  GOOD 10/10');
  d.sfx('chime');
  await d.beat(520);

  d.anim(c.marge, 'talk');
  await d.say(c.marge, 'Motion carries.', { hold: HOLD });
  d.anim(c.marge, 'idle');
  d.anim(c.kiki, 'idle');
  await d.beat(800);

  d.music(null);
  await d.fadeOut(700);
}

/**
 * The thumbnail: floor level, the dog downstage and looking straight down the
 * lens, five humans behind her having an argument she is not part of.
 * @param {EpisodeCtx} ctx
 * @returns {void}
 */
function poster(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);
  if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom('bullpen');

  formTheArc(d, c);
  // Two metres off the lens and three-quartered, so the floppy ear, the up
  // ear and the metronome tail all read. Head-on, a dog is a brown rectangle.
  d.place(c.tuesday, SPOT.posterMark, [3.60, 0, 1.60]);

  d.anim(c.tuesday, 'idle');
  d.anim(c.brad, 'point');
  d.anim(c.dez, 'shrug');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'panic');
  d.anim(c.marge, 'point');

  d.cut(SHOT.poster);
}

export default /** @type {Object} */ ({
  id: 'ep3',
  number: 3,
  title: 'TUESDAY',
  logline: 'A dog is in the office. Nobody agrees what to do.',
  runtime: '1:02',
  starring: ['tuesday', 'kiki', 'brad', 'dez', 'roop', 'marge'],
  accent: ACCENT,
  run,
  poster,
});
