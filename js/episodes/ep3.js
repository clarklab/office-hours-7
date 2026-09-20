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
 * BEAT SHEET / RUNNING ESTIMATE  (measured with `node tools/check.mjs --ep=ep3`)
 * ---------------------------------------------------------------------------
 *  ACT 0  TITLE                                          ~3s   (2 beats)
 *    logo card -> a held establishing wide
 *  ACT 1  A NORMAL TUESDAY                               ~8s   (5 beats)
 *    Marge's line item, Roop's water bowl, Dez's call,
 *    then a floor-level shot of something sniffing past
 *  ACT 2  THE ENCOUNTER                                  ~9s   (8 beats)
 *    flash / shake / battle music / HUD / target cursor /
 *    "! TUESDAY APPEARED" -> Kiki has already named her
 *  ACT 3  THE BATTLE MENU                               ~31s  (22 beats)
 *    TALK  -> Brad misses, Dez puts her on a sales call
 *    FEED  -> Kiki fed her at nine, she is on the org chart
 *    ADOPT -> Marge's per-head cost over Roop's denial (two boxes)
 *    RUN   -> TUESDAY USED ZOOMIES: one long unbroken low wide
 *  ACT 4  THE ONE CORRECT THING                          ~9s   (8 beats)
 *    Brad says sit. She sits. Fanfare. Five boxes of credit.
 *  ACT 5  BUTTON                                         ~7s   (6 beats)
 *    the chair, the party deferring, HP ???, GOOD 10/10
 *  ---------------------------------------------------------------------------
 *  51 timed beats, 21 camera set-ups, longest hold = the 8.5s zoomies shot.
 *  ESTIMATE ~67s / MEASURED 63.6s (see the report at the bottom of this file).
 * ---------------------------------------------------------------------------
 *
 * @module episodes/ep3
 */

/** @typedef {import('../core/director.js').Director} Director */
/** @typedef {import('../characters/rig.js').Actor} Actor */
/** @typedef {{stage:Object, ui:Object, d:Director, office:Object, cast:Object<string,Actor>, THREE:Object}} EpisodeCtx */

/** EP3's accent, per SPEC section 7. @type {string} */
const ACCENT = '#c98a4b';

/**
 * Floor positions this episode needs that `office.marks` does not name.
 * Every one of them is clear of the desks, the cubicle partitions and the
 * row-A chairs — checked against the floor plan in `/js/sets/office.js`.
 * @type {Object<string, number[]>}
 */
const SPOT = {
  /** The argument semicircle: five adults in a rough arc, all facing the dog. */
  roop: [-2.80, 0, -0.70],
  kiki: [-1.55, 0, -1.10],
  brad: [-0.45, 0, -1.25],
  dez: [0.95, 0, -1.15],
  marge: [2.05, 0, -0.80],

  /** Where the dog stands for most of the encounter — downstage of everyone. */
  dogMark: [0.55, 0, 0.75],
  /** Where she first noses into the floor-level shot. */
  dogEnter: [2.55, 0, 1.30],
  /** The chair the founder is about to lose, seat top at y=0.49. */
  chair: [0.02, 0.49, -1.85],
  /** Standing beside that chair, for the man who no longer has one. */
  bradByChair: [-0.85, 0, -1.05],

  /** Zoomies waypoints. The lane runs in front of the party, wall to wall. */
  zoomA: [-3.90, 0, 0.35],
  zoomB: [4.00, 0, 1.15],
  zoomC: [-2.60, 0, 0.15],
  zoomD: [1.10, 0, 1.00],
};

/**
 * Hand-built camera set-ups. `office.shots` covers the room; these cover the
 * dog, who is 62cm tall and therefore invisible to every camera in the set.
 * @type {Object<string, {pos:number[], look:number[], fov?:number}>}
 */
const SHOT = {
  /** Dez at his desk, shot from the gap between the two row-B desks. */
  dezDesk: { pos: [0.0, 1.62, -1.55], look: [0.0, 1.22, -4.45], fov: 50 },
  /** Marge at hers, from the clear floor east of the partition. */
  margeDesk: { pos: [3.15, 1.62, -1.60], look: [3.30, 1.20, -4.50], fov: 50 },
  /** Over Brad's shoulder, down at a dog who is not impressed. */
  overBrad: { pos: [-0.95, 1.52, -1.90], look: [0.55, 0.50, 0.75], fov: 54 },
  /** THE DOG'S POINT OF VIEW: nose height, looking up at five adults. */
  dogPov: { pos: [0.55, 0.40, 0.58], look: [-0.30, 1.62, -1.30], fov: 62 },
  /** The long one. Low, wide, and she runs clean out of both sides of it. */
  zoomies: { pos: [-2.20, 0.62, 3.90], look: [0.60, 0.85, -0.60], fov: 64 },
  /** The party, from behind, facing the chair. Backs to us. FF7 to the bone. */
  throne: { pos: [0.20, 1.50, 1.70], look: [0.05, 0.80, -1.85], fov: 50 },
  /** Tighter on the chair itself. */
  throneClose: { pos: [0.10, 1.05, 0.55], look: [0.02, 0.72, -1.85], fov: 46 },
};

/**
 * The party roster, in HUD order. Stats are SPEC section 6.
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
 * One leg of the zoomies. `walk()` forces the `walk` pose, so the real pose
 * goes on immediately afterwards and rides the same tween.
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
 * EP3.
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);

  const dog = c.tuesday;

  /* ===================================================== ACT 0 — TITLE === */

  d.hud(null);
  d.subtitle('');
  if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom('bullpen');

  // Everyone at their station. Row A works facing the room; Roop faces his
  // desk, which is the only relationship in his life that returns his calls.
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
  await d.title({ logo: true, subtitle: 'EPISODE THREE — "TUESDAY"', ms: 1500 });

  /* ========================================== ACT 1 — A NORMAL TUESDAY === */

  // A held wide. Somewhere at frame right, small, something is sniffing a
  // water cooler. Nobody in this building has noticed.
  await d.beat(700);

  d.cut(SHOT.margeDesk);
  d.face(c.marge, 'bullpenCenter');
  await d.say(c.marge, 'Line item forty-one.\nSnacks.');

  d.cut('deskCloseB');
  d.anim(c.roop, 'type');
  await d.say(c.roop, 'Who filled the water bowl\nby the copier?');

  d.cut(SHOT.dezDesk);
  d.anim(c.dez, 'talk');
  await d.say(c.dez, 'Not me. I am on a call.');

  // FLOOR LEVEL. The camera is 28cm off the carpet and a dog walks into it.
  d.cut('floorLevel');
  d.place(dog, SPOT.dogEnter, SPOT.dogMark);
  await d.walk(dog, SPOT.dogMark, 1500);
  d.anim(dog, 'sniff');
  d.face(dog, [2.2, 0, 2.6]);
  await d.beat(750);

  /* ========================================== ACT 2 — THE ENCOUNTER ====== */

  d.sfx('bark');
  d.anim(dog, 'bark');
  d.shake(0.34, 460);
  d.music('chase');
  await d.flash('#ffffff', 260);

  // The white frame covers the reposition: five people who were at their
  // desks are now standing in a semicircle, which is how offices work.
  formTheArc(d, c);
  d.anim(c.brad, 'panic');
  d.anim(c.dez, 'panic');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'panic');
  d.anim(c.marge, 'shrug');
  d.anim(dog, 'idle');
  d.face(dog, SPOT.brad);
  d.cut(d.shotOn(dog, { dist: 2.9, height: 1.15, angle: 14, absolute: true, fov: 52 }));
  d.hud(partyRows());
  await d.beat(420);

  d.targetOn(dog);
  await d.encounter('! TUESDAY APPEARED', { ms: 1200 });

  d.cut(SHOT.overBrad);
  d.anim(c.brad, 'point');
  await d.say(c.brad, 'What is that.');

  d.cut(d.shotOn(c.kiki, { dist: 2.4, height: 1.5, angle: 22, fov: 50 }));
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'That is Tuesday.');

  d.cut(d.shotOn(c.brad, { dist: 2.5, height: 1.58, angle: -20, fov: 50 }));
  await d.say(c.brad, 'Today is Thursday.');

  d.cut(d.shotOn(c.kiki, { dist: 2.6, height: 1.5, angle: 26, fov: 52 }));
  await d.say(c.kiki, 'Her name is Tuesday.\nI made her a badge.');

  /* ========================================= ACT 3 — THE BATTLE MENU ===== */

  /* ---- TALK ---- */

  d.cut('bullpenLow');
  d.anim(c.dez, 'point');
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'shrug');
  await d.menu({
    prompt: 'WHAT DO WE DO',
    options: ['TALK', 'FEED', 'ADOPT', 'RUN'],
    style: 'battle',
    pick: 0,
    auto: 1200,
  });

  d.cut(SHOT.overBrad);
  d.anim(c.brad, 'point');
  await d.say(c.brad, 'Hey. Hey buddy. Hey.');

  // The dog's reply. Routed as narration with a speaker so she gets her box
  // and her voice without the rig throwing a bark over the top of it.
  d.cut(SHOT.dogPov);
  await d.say(null, '......', {
    speaker: 'TUESDAY', voice: 'tuesday', at: [200, 118], maxWidth: 120,
  });
  await d.damageOn(c.brad, 'MISS');

  d.cut(d.shotOn(c.dez, { dist: 2.4, height: 1.55, angle: 24, fov: 50 }));
  d.anim(c.dez, 'talk');
  await d.say(c.dez, 'Ron. Ron, say hi to Tuesday.');

  d.sfx('bark');
  d.anim(dog, 'bark');
  d.anim(c.dez, 'cheer');
  await d.damageOn(c.dez, 'MISS');

  /* ---- FEED ---- */

  d.cut('bullpenLow');
  d.anim(c.dez, 'slump');
  await d.menu({
    prompt: 'WHAT DO WE DO',
    options: ['TALK', 'FEED', 'ADOPT', 'RUN'],
    style: 'battle',
    pick: 1,
    auto: 1200,
  });

  d.cut(d.shotOn(c.kiki, { dist: 2.3, height: 1.48, angle: 20, fov: 50 }));
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'She has eaten. I fed her\nat nine.');

  d.cut(d.shotOn(c.brad, { dist: 2.6, height: 1.6, angle: -22, fov: 50 }));
  d.anim(c.brad, 'panic');
  await d.say(c.brad, 'You have had her\nsince NINE?');

  // CEILING SHOT — up past the party at the drop tiles. From down here the
  // org chart is a very tall thing.
  d.cut('ceiling');
  d.anim(c.kiki, 'point');
  await d.say(c.kiki, 'She is on the org chart.');

  d.cut(d.shotOn(c.roop, { dist: 2.2, height: 1.5, angle: 26, fov: 50 }));
  d.anim(c.roop, 'panic');
  d.emote(c.roop, 'sweat');
  await d.say(c.roop, 'HKKTCH.');

  /* ---- ADOPT ---- */

  d.cut('bullpenLow');
  d.anim(c.roop, 'idle');
  await d.menu({
    prompt: 'WHAT DO WE DO',
    options: ['TALK', 'FEED', 'ADOPT', 'RUN'],
    style: 'battle',
    pick: 2,
    auto: 1300,
  });

  // TWO BOXES AT ONCE (ref 04): the arithmetic and the denial, talking over
  // each other. Distinct ids + keep:true or the second one eats the first.
  d.cut('bullpenWide');
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'shrug');
  d.anim(dog, 'sniff');
  const arithmetic = d.say(c.marge, 'Fully loaded, per head,\nshe is $41.20 a day.', {
    id: 'marge-cost', keep: true, at: [268, 60], maxWidth: 152,
  });
  await d.beat(280);
  const denial = d.say(c.roop, 'I am not allergic.', {
    id: 'roop-denial', keep: true, at: [104, 120], maxWidth: 132,
  });
  await d.all(arithmetic, denial);

  await d.damageOn(c.brad, '41.20', { color: ACCENT, big: true });
  d.updateHud({ BRAD: { hp: 26 } });
  d.closeBoxes(['marge-cost', 'roop-denial']);

  d.cut(d.shotOn(c.roop, { dist: 2.1, height: 1.48, angle: 24, fov: 50 }));
  d.anim(c.roop, 'panic');
  d.emote(c.roop, 'sweat');
  await d.say(c.roop, 'HKKTCH. Dust.');
  d.updateHud({ ROOP: { hp: 19 } });
  await d.damageOn(c.roop, 'MISS');

  /* ---- RUN ---- */

  d.cut('bullpenLow');
  d.anim(c.roop, 'idle');
  await d.menu({
    prompt: 'WHAT DO WE DO',
    options: ['TALK', 'FEED', 'ADOPT', 'RUN'],
    style: 'battle',
    pick: 3,
    auto: 1300,
  });

  /* ------------------------------------------------------------------ *
   * THE ZOOMIES. ONE SHOT. NO CUTS. She goes off the left of frame and
   * comes back, twice, while five adults fail to finish a sentence.
   * ------------------------------------------------------------------ */

  d.cut(SHOT.zoomies);
  d.anim(c.brad, 'shrug');
  d.anim(c.dez, 'point');
  d.anim(c.marge, 'type');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'panic');
  d.sfx('bark');
  await d.toast('TUESDAY USED ZOOMIES', 1100);

  await dash(d, dog, SPOT.zoomA, 1500);
  await d.all(
    dash(d, dog, SPOT.zoomB, 2150),
    d.say(c.kiki, 'Zoomies.'),
  );
  await d.all(
    dash(d, dog, SPOT.zoomC, 1850),
    d.say(c.marge, 'That is four laps.'),
  );
  await dash(d, dog, SPOT.zoomD, 1150);
  d.anim(dog, 'shake');
  d.sfx('bark');
  await d.beat(950);
  d.anim(dog, 'idle');
  d.face(dog, SPOT.brad);
  await d.beat(450);

  /* ================================ ACT 4 — THE ONE CORRECT THING ======= */

  d.cut(d.shotOn(c.brad, { dist: 2.4, height: 1.3, angle: -18, fov: 50 }));
  d.anim(c.brad, 'slump');
  await d.say(c.brad, 'Sit.');

  d.cut(SHOT.overBrad);
  await d.beat(800);

  d.anim(dog, 'sit');
  d.sfx('fanfare');
  d.music('victory');
  await d.beat(900);

  await d.damageOn(c.brad, '9999', { big: true });

  d.cut(d.shotOn(c.brad, { dist: 2.3, height: 1.58, angle: -16, fov: 50 }));
  d.anim(c.brad, 'idle');
  await d.say(c.brad, '......');
  await d.say(c.brad, 'Nothing in this building\nhas ever listened to me.');

  // THE CHORUS. Five boxes, five ids, all kept, all at once, hand-placed so
  // they tile the frame above the HUD instead of dodging each other.
  d.cut('bullpenWide');
  d.anim(c.kiki, 'cheer');
  d.anim(c.dez, 'point');
  d.anim(c.marge, 'point');
  d.anim(c.roop, 'shrug');
  d.anim(c.brad, 'panic');

  const chorus = [
    d.say(c.kiki, 'Team effort.', { id: 'cr-kiki', keep: true, at: [62, 52], maxWidth: 118 }),
  ];
  await d.beat(170);
  chorus.push(d.say(c.brad, 'I said sit.', { id: 'cr-brad', keep: true, at: [192, 52], maxWidth: 118 }));
  await d.beat(170);
  chorus.push(d.say(c.dez, 'I closed it.', { id: 'cr-dez', keep: true, at: [322, 52], maxWidth: 118 }));
  await d.beat(170);
  chorus.push(d.say(c.roop, 'I allowed it', { id: 'cr-roop', keep: true, at: [125, 98], maxWidth: 118 }));
  await d.beat(170);
  chorus.push(d.say(c.marge, 'Unbudgeted.', { id: 'cr-marge', keep: true, at: [257, 98], maxWidth: 118 }));
  await d.all(chorus);
  await d.beat(420);
  d.closeBoxes(null);

  /* =============================================== ACT 5 — THE BUTTON === */

  d.music('lobby');
  d.place(dog, SPOT.chair, SPOT.brad);
  d.anim(dog, 'sit');
  d.place(c.brad, SPOT.bradByChair, SPOT.chair);
  d.anim(c.brad, 'idle');
  d.anim(c.kiki, 'idle');
  d.anim(c.dez, 'idle');
  d.anim(c.marge, 'idle');
  d.anim(c.roop, 'idle');
  d.face(c.kiki, SPOT.chair);
  d.face(c.dez, SPOT.chair);
  d.face(c.marge, SPOT.chair);
  d.face(c.roop, SPOT.chair);

  d.cut(SHOT.throneClose);
  await d.beat(700);

  d.cut(d.shotOn(c.brad, { dist: 2.2, height: 1.55, angle: 34, fov: 50 }));
  await d.say(c.brad, '......that is my chair.');

  d.cut(SHOT.throne);
  d.anim(c.kiki, 'talk');
  await d.say(c.kiki, 'It is her chair now.');

  // She is not the enemy any more. Cursor off, roster amended, founder cut.
  d.targetOn(null);
  d.hud([
    { name: 'TUESDAY', hp: '???', mp: '10/10', limit: 1 },
    { name: 'DEZ', hp: 88, maxHp: 88, mp: '4', limit: 0.4 },
    { name: 'KIKI', hp: 62, maxHp: 62, mp: '0', limit: 1 },
    { name: 'ROOP', hp: 19, maxHp: 31, mp: '402', limit: 0.18 },
    { name: 'MARGE', hp: 55, maxHp: 55, mp: '12', limit: 0.55 },
  ]);
  d.subtitle('TUESDAY  —  GOOD 10/10');
  d.sfx('chime');
  await d.beat(700);

  d.anim(c.marge, 'talk');
  await d.say(c.marge, 'Motion carries.');

  d.anim(c.marge, 'idle');
  d.anim(c.kiki, 'idle');
  await d.beat(1300);

  d.music(null);
  await d.fadeOut(900);
}

/**
 * The thumbnail: floor level, the dog downstage and in focus, five humans
 * behind her having an argument she is not part of.
 * @param {EpisodeCtx} ctx
 * @returns {void}
 */
function poster(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);
  if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom('bullpen');

  formTheArc(d, c);
  d.place(c.tuesday, SPOT.dogMark, [2.2, 0, 2.6]);

  d.anim(c.tuesday, 'idle');
  d.anim(c.brad, 'point');
  d.anim(c.dez, 'talk');
  d.anim(c.kiki, 'cheer');
  d.anim(c.roop, 'shrug');
  d.anim(c.marge, 'point');

  d.hud(partyRows());
  d.cut('floorLevel');
  d.targetOn(c.tuesday);
}

export default /** @type {Object} */ ({
  id: 'ep3',
  number: 3,
  title: 'TUESDAY',
  logline: 'A dog is in the office. Nobody agrees what to do.',
  runtime: '1:04',
  starring: ['tuesday', 'kiki', 'brad', 'dez', 'roop', 'marge'],
  accent: ACCENT,
  run,
  poster,
});
