/**
 * OFFICE HOURS VII — EPISODE THREE: "GOOD GIRL"
 *
 * The lore. How an old, three-legged dachshund came to run MUNCH, Inc.: she
 * arrived on Take Your Dog To Work Day as a bonus nobody ordered, bit the
 * worst client in the building, was thrown a party with a hamburger and a
 * candle in it, and was made the office dog. Then she bit somebody else.
 *
 * GARY STRAUB is a guest star (see GUEST_IDS in /js/characters/index.js); the
 * registry books him for this episode only.
 *
 * ---------------------------------------------------------------------------
 * BEAT SHEET
 * ---------------------------------------------------------------------------
 *  ACT 0  TITLE                 dreamy flashback card: "LAST MARCH."
 *  ACT 1  THE ANNOUNCEMENT      meeting room, the slide, nobody owns a dog
 *  ACT 2  THE BONUS DOG         reception at noon: zero dogs, then one
 *  ACT 3  GARY                  80s client, 80s material; Kiki: "Tuesday. Yes."
 *  ACT 4  THE HERO              bullpen, the post, the numbers
 *  ACT 5  THE BURGER            break room, a candle, a wish, a job offer
 *  ACT 6  BUTTON                "Who's a good girl?" — she is. She bites Brad.
 * ---------------------------------------------------------------------------
 *
 * Every sound, bed and slide here is from the shared vocabularies
 * (/js/core/audio.js, /js/sets/slides.js); nothing is bespoke to the episode
 * except the hamburger, which is from /js/sets/props.js.
 *
 * @module episodes/ep3
 */

import { birthdayBurger } from '/js/sets/props.js';

/** @typedef {import('../core/director.js').Director} Director */
/** @typedef {import('../characters/rig.js').Actor} Actor */
/** @typedef {{stage:Object, ui:Object, d:Director, office:Object, cast:Object<string,Actor>, THREE:Object}} EpisodeCtx */

/** EP3's accent: Tuesday's collar. @type {string} */
const ACCENT = '#d05a4a';

const CPS = 36;
const HOLD = 520;

/**
 * Floor positions this episode needs that `office.marks` does not name.
 * @type {Object<string, number[]>}
 */
const SPOT = {
  /* meeting room: Brad presents from beside the screen */
  bradPitch: [10.55, 0, 1.55],
  meetingMid: [9.40, 0, 3.60],

  /* reception: everybody on one line at x≈-9.2 so a camera from the
     doorway side never has a head between it and whoever is talking */
  bradRecep: [-9.20, 0, -3.30],
  roopRecep: [-9.35, 0, 1.05],
  dezRecep: [-9.15, 0, 0.35],
  margeRecep: [-9.25, 0, -0.45],
  dogIn: [-5.90, 0, -0.10],
  dogRecep: [-8.70, 0, -1.25],
  garyIn: [-5.60, 0, -1.80],
  gary: [-9.30, 0, -2.10],
  /** a dachshund's-length off Gary's ankle */
  dogBite: [-8.95, 0, -1.85],
  garyOut: [-5.40, 0, -1.20],
  /** everyone looks here: the middle of the room */
  recepMid: [-7.20, 0, -1.00],

  /* bullpen: the arc, as in EP3, with the dog downstage */
  roop: [-2.80, 0, -0.70],
  kiki: [-1.55, 0, -1.10],
  brad: [-0.45, 0, -1.25],
  dez: [0.95, 0, -1.15],
  marge: [2.05, 0, -0.80],
  dogMark: [0.55, 0, 0.75],

  /* break room: the dog and her burger downstage, the company in a line
     behind her against the meeting-room wall, the camera by the table */
  burger: [9.35, 0, -1.38],
  dogBurger: [9.35, 0, -0.92],
  bradBreak: [8.15, 0, -0.72],
  margeBreak: [8.75, 0, -0.38],
  roopBreak: [9.40, 0, -0.28],
  dezBreak: [10.05, 0, -0.38],
  kikiBreak: [10.65, 0, -0.72],
  /** at Brad's ankle, for the button */
  dogBrad: [8.52, 0, -0.98],
};

/**
 * Hand-built set-ups for what the office does not cover: a dog's-eye camera,
 * and the break room from across the table.
 * @type {Object<string, {pos:number[], look:number[], fov?:number}>}
 */
const SHOT = {
  /** The door, at dachshund height, square on — the doorway fills the frame. */
  dogDoor: { pos: [-8.40, 0.34, -0.10], look: [-5.90, 0.34, -0.10], fov: 56 },
  /** Her walk from the door to reception, from inside the room. */
  dogWalk: { pos: [-7.30, 0.62, -2.75], look: [-7.40, 0.30, -0.70], fov: 62 },
  /** The hold: low and close, three-quarters, so the whole dog reads. */
  dogHello: { pos: [-7.75, 0.42, -2.05], look: [-8.70, 0.30, -1.25], fov: 50 },
  /** Reception, wide enough for five people, a client and a dog — from well
      inside the room, so the doorway wall never crowds the frame. */
  recepWide: { pos: [-6.70, 1.70, -4.20], look: [-9.30, 1.00, -0.90], fov: 62 },
  /** Meeting room: Brad at the screen, from over the middle of the table. */
  meetBrad: { pos: [9.40, 1.95, 3.70], look: [10.55, 1.95, 1.55], fov: 44 },
  /** Meeting room: Marge in her seat, from beside the screen. */
  meetMarge: { pos: [9.70, 1.55, 1.45], look: [8.25, 1.40, 2.95], fov: 46 },
  /** Kiki behind her desk, from past Gary's shoulder — nobody in the way. */
  kiki: { pos: [-9.60, 1.50, -1.05], look: [-12.05, 1.45, -2.75], fov: 46 },
  /** The ankle. Knee height, level, facing the incident. */
  ankle: { pos: [-7.55, 0.34, -1.55], look: [-9.30, 0.30, -2.05], fov: 54 },
  /** The break room from the table's edge, looking back at the party. */
  party: { pos: [9.35, 1.30, -2.20], look: [9.35, 0.80, -0.50], fov: 62 },
  /** The burger, the candle and the dog: low, from the table side. */
  burger: { pos: [9.35, 0.36, -2.10], look: [9.35, 0.24, -1.00], fov: 50 },
  /** The poster: burger and dog big in the foreground, the party behind. */
  poster: { pos: [9.35, 0.32, -2.30], look: [9.35, 0.80, -0.40], fov: 68 },
};

/**
 * A single on somebody, from the open side of the room. Aimed at the face, not
 * the chest, so the head sits just above centre and the top third of the frame
 * is free for the dialogue box — which otherwise lands on the speaker.
 * @param {Director} d @param {Actor} actor @param {number} angle @param {number} [dist]
 * @returns {Object}
 */
function single(d, actor, angle, dist = 2.5) {
  const h = (actor && actor.profile && actor.profile.height) || 1.75;
  return d.shotOn(actor, { absolute: true, angle, dist, height: h - 0.05, lookHeight: h - 0.14, fov: 48 });
}

/**
 * A single in the break room, from the table side. The room is too tight for
 * shotOn's generated cameras, so this one is placed by hand: a couple of
 * metres off, head just above the centre of frame, the box above it.
 * @param {Actor} actor @param {number[]} at where they stand
 * @returns {Object}
 */
function breakSingle(actor, at) {
  const h = (actor && actor.profile && actor.profile.height) || 1.75;
  return { pos: [at[0] + 0.25, h - 0.05, at[2] - 2.20], look: [at[0], h - 0.14, at[2]], fov: 48 };
}

/**
 * Coverage of the dog, low.
 * @param {Director} d @param {Actor} dog @param {number} angle @param {number} dist @param {number} height
 * @returns {Object}
 */
function onDog(d, dog, angle, dist, height) {
  return d.shotOn(dog, { absolute: true, angle, dist, height, lookHeight: 0.32, fov: 52 });
}

/**
 * Walks, but with a different pose riding the tween (walk() forces `walk`).
 * @param {Director} d @param {Actor} a @param {number[]|string} to @param {number} ms @param {string} pose
 * @returns {Promise<void>}
 */
function move(d, a, to, ms, pose) {
  const p = d.walk(a, to, ms);
  d.anim(a, pose);
  return p;
}

/**
 * The break-room tableau, shared by the episode and the poster.
 * @param {Director} d @param {Object<string, Actor>} c @param {Object} burger
 * @returns {void}
 */
function partyRound(d, c, burger) {
  const b = SPOT.burger;
  burger.position.set(b[0], b[1], b[2]);
  burger.visible = true;
  burger.userData.setLit(true);
  d.place(c.tuesday, SPOT.dogBurger, SPOT.burger);
  d.place(c.brad, SPOT.bradBreak, SPOT.burger);
  d.place(c.kiki, SPOT.kikiBreak, SPOT.burger);
  d.place(c.marge, SPOT.margeBreak, SPOT.burger);
  d.place(c.dez, SPOT.dezBreak, SPOT.burger);
  d.place(c.roop, SPOT.roopBreak, SPOT.burger);
  d.place(c.gary, [-30, 0, -30]);
}

/**
 * Builds the burger into the scene (once), hidden until it is wanted.
 * @param {EpisodeCtx} ctx
 * @returns {Object}
 */
function burgerFor(ctx) {
  const g = birthdayBurger();
  g.visible = false;
  ctx.stage.scene.add(g);
  return g;
}

/**
 * EP3.
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);
  const focus = (room) => {
    if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom(room);
  };
  const dog = c.tuesday;
  const gary = c.gary;
  const burger = burgerFor(ctx);

  try {
    /* ====================================================== ACT 0 — TITLE */
    d.hud(null);
    d.subtitle('');
    focus('meeting');
    d.place(gary, [-30, 0, -30]);
    d.place(dog, [-30, 0, -28]);
    d.place(c.marge, 'meetingSeat1', 'meetingSeat3');
    d.place(c.dez, 'meetingSeat3', 'meetingSeat1');
    d.place(c.roop, 'meetingSeat2', 'meetingSeat4');
    d.place(c.kiki, 'meetingSeat4', 'meetingSeat2');
    for (const a of [c.marge, c.dez, c.roop, c.kiki]) d.sit(a, true);
    d.place(c.brad, SPOT.bradPitch, SPOT.meetingMid);
    d.slide('projector', 'announcement', { text: 'TAKE YOUR DOG TO WORK DAY' });

    d.cut('meetingWide');
    d.music('dreamy');
    await d.title({ logo: true, subtitle: 'EPISODE THREE — "GOOD GIRL"', ms: 1300 });
    await d.toast('LAST MARCH.', 1200);

    /* =========================================== ACT 1 — THE ANNOUNCEMENT */
    d.music('happy');
    d.cut('projector');
    d.anim(c.brad, 'cheer');
    await d.say(c.brad, 'Big news, team.\nTake Your Dog To Work Day!', { cps: CPS, hold: HOLD, sfx: 'sparkle' });

    d.cut(SHOT.meetMarge);
    await d.say(c.marge, 'Nobody here owns a dog.', { cps: CPS, hold: HOLD });

    d.cut(SHOT.meetBrad);
    d.anim(c.brad, 'shrug');
    await d.say(c.brad, 'Then it\'s a stretch goal.', { cps: CPS, hold: HOLD, sfx: 'ding', sfxAt: 'end' });

    d.cut('meetingTable');
    d.anim(c.roop, 'talk');
    await d.say(c.roop, 'I have a Tamagotchi.', { cps: CPS, hold: HOLD });
    await d.say(c.kiki, 'It died in 2004.', { cps: CPS, hold: HOLD });
    d.expression(c.roop, 'squint');
    await d.say(c.roop, 'It\'s resting.', { cps: CPS, hold: 600, sfx: 'sadTrombone', sfxAt: 'end' });
    d.expression(c.roop, null);

    /* ============================================= ACT 2 — THE BONUS DOG */
    await d.fadeOut(240);
    focus('reception');
    for (const a of [c.marge, c.dez, c.roop, c.kiki]) d.sit(a, false);
    d.place(c.kiki, 'seatKiki', 'reception');
    d.sit(c.kiki, true);
    d.place(c.brad, SPOT.bradRecep, SPOT.recepMid);
    d.place(c.dez, SPOT.dezRecep, SPOT.recepMid);
    d.place(c.roop, SPOT.roopRecep, SPOT.recepMid);
    d.place(c.marge, SPOT.margeRecep, SPOT.recepMid);
    d.anim(c.brad, 'slump');
    d.expression(c.brad, 'squint');
    d.anim(c.dez, 'talk');
    d.cut(SHOT.recepWide);
    d.music(null);
    await d.fadeIn(240);
    await d.toast('FRIDAY, 12:00 PM.  DOGS: 0', 1300);

    // the door
    d.sfx('chime');
    d.cut(SHOT.dogDoor);
    d.place(dog, SPOT.dogIn, SPOT.dogRecep);
    d.anim(dog, 'idle');
    d.expression(dog, 'happy');
    await d.beat(900);
    for (const a of [c.brad, c.dez, c.roop, c.marge, c.kiki]) d.face(a, SPOT.dogRecep);
    d.music('goofy');
    d.cut(SHOT.dogWalk);
    await d.walk(dog, SPOT.dogRecep, 1900);
    // she has no lines, so the camera gives her the moment instead
    d.face(dog, SHOT.dogHello.pos, 200);
    d.anim(dog, 'sit');
    d.mouth(dog, true);
    d.cut(SHOT.dogHello);
    await d.beat(900);
    await d.nameCard(dog, { ms: 2300 });
    await d.beat(500);

    d.cut(SHOT.recepWide);
    d.expression(c.brad, null);
    d.anim(c.brad, 'idle');
    d.anim(c.dez, 'idle');
    await d.say(c.kiki, 'Is that anyone\'s dog?', { cps: CPS, hold: HOLD });
    await d.say(c.roop, 'She has three legs.', { cps: CPS, hold: HOLD });
    d.cut(single(d, c.dez, 90, 2.3));
    d.anim(c.dez, 'point');
    d.expression(c.dez, 'happy');
    await d.say(c.dez, 'No owner. No paperwork.\nShe\'s a BONUS.', { cps: CPS, hold: HOLD, sfx: 'boing' });
    d.expression(c.dez, null);

    d.cut(SHOT.kiki);
    await d.say(c.kiki, 'Her tag says "Tuesday."', { cps: CPS, hold: HOLD });
    d.cut(single(d, c.brad, 90, 2.4));
    await d.say(c.brad, 'It\'s Friday.', { cps: CPS, hold: HOLD });
    d.cut(SHOT.dogHello);
    d.anim(dog, 'bark');
    d.sfx('bark');
    await d.beat(900);
    d.anim(dog, 'sit');
    d.cut(SHOT.kiki);
    await d.say(c.kiki, 'It\'s Tuesday.', { cps: CPS, hold: 600, sfx: 'rimshot', sfxAt: 'end' });

    /* ======================================================= ACT 3 — GARY */
    d.sfx('recordScratch');
    d.music('party');
    d.place(gary, SPOT.garyIn, SPOT.gary);
    d.cut(SHOT.recepWide);
    await d.walk(gary, SPOT.gary, 1300);
    d.face(gary, SPOT.recepMid);
    d.anim(gary, 'hey');
    d.cut(single(d, gary, 90, 2.6));
    await d.say(gary, 'HEY!', { cps: CPS, hold: 300, sfx: 'honk' });
    await d.nameCard(gary, { ms: 1500 });
    d.anim(gary, 'fingerGuns');
    await d.say(gary, 'Munch-kins! Who\'s ready\nto PAR-TAY?', { cps: CPS, hold: HOLD, sfx: 'rimshot', sfxAt: 'end' });

    d.face(gary, 'seatKiki');
    d.anim(gary, 'point');
    d.cut(SHOT.kiki);
    await d.say(gary, 'And who\'s this, sweetheart?\nYou take dictation?', { cps: CPS, hold: HOLD });
    d.expression(c.kiki, 'squint');
    await d.say(c.kiki, 'I take names.', { cps: CPS, hold: HOLD });
    d.cut(single(d, gary, 90, 2.6));
    d.anim(gary, 'fingerGuns');
    await d.say(gary, 'Whoa, FEISTY! Smile, doll!', { cps: CPS, hold: HOLD });
    d.emote(c.kiki, 'anger');

    d.face(gary, SPOT.margeRecep);
    d.anim(gary, 'hey');
    await d.say(gary, 'Marge! Still doing the books?\nWHERE\'S THE BEEF?', { cps: CPS, hold: HOLD, sfx: 'rimshot', sfxAt: 'end' });
    d.anim(gary, 'talk');
    await d.say(gary, 'Gag me with a spoon! Let the\nlittle ladies do the math, Brad.', { cps: CPS, hold: HOLD });
    d.emote(c.brad, 'sweat');

    // the dog has been listening
    d.music(null);
    d.cut(SHOT.dogHello);
    d.mouth(dog, false);
    d.expression(dog, 'squint');
    d.anim(dog, 'idle');
    d.face(dog, SPOT.gary);
    d.emote(dog, 'anger');
    await d.beat(550);

    d.cut(SHOT.kiki);
    d.expression(c.kiki, 'neutral');
    await d.say(c.kiki, 'Tuesday. No.', { cps: CPS, hold: 550 });
    d.expression(c.kiki, 'squint');
    await d.beat(380);
    await d.say(c.kiki, '...Tuesday. Yes.', { cps: CPS, hold: 400 });

    // THE BITE
    d.cut(SHOT.ankle);
    d.anim(dog, 'walk');
    await d.walk(dog, SPOT.dogBite, 600);
    d.face(dog, SPOT.gary, 100);
    d.anim(dog, 'bite');
    await d.beat(170);
    d.sfx('chomp');
    d.shake(0.5, 420);
    d.anim(gary, 'hop');
    await d.beat(450);
    d.sfx('chomp', { rate: 1.12 });

    d.cut(single(d, gary, 90, 3.0));
    d.expression(gary, 'shocked');
    await d.say(gary, 'YEOWCH! She BIT me!\nThat is totally BOGUS!', { cps: 44, hold: 380, sfx: 'gasp' });
    d.anim(dog, 'idle');
    d.place(dog, SPOT.dogRecep, SPOT.gary);
    d.cut(SHOT.recepWide);
    d.sfx('slideWhistle');
    await move(d, gary, SPOT.garyOut, 1300, 'hop');
    d.place(gary, [-30, 0, -30]);
    d.sfx('thud', { gain: 0.6 });

    await d.beat(450);
    d.cut(single(d, c.marge, 90, 2.3));
    await d.say(c.marge, 'He was our least\nprofitable account.', { cps: 30, hold: 600 });

    /* ================================================== ACT 4 — THE HERO */
    await d.fadeOut(220);
    focus('bullpen');
    d.sit(c.kiki, false);
    for (const k of ['roop', 'kiki', 'brad', 'dez', 'marge']) d.place(c[k], SPOT[k], SPOT.dogMark);
    d.place(dog, SPOT.dogMark, [0.55, 0, 3.5]);
    d.expression(dog, 'happy');
    d.mouth(dog, null);
    d.anim(dog, 'idle');
    for (const a of [c.brad, c.dez, c.kiki, c.roop, c.marge]) d.anim(a, 'cheer');
    d.slide('whiteboard', 'social', {
      text: 'Our new Chief Morale Officer just handled a client. #goodgirl',
    });
    d.cut('bullpenWide');
    d.music('triumph');
    await d.fadeIn(220);
    d.sfx('cheer');
    await d.say(c.brad, 'She\'s a HERO.', { cps: CPS, hold: HOLD });

    for (const a of [c.brad, c.dez, c.kiki, c.roop, c.marge]) d.anim(a, 'idle');
    d.cut(single(d, c.dez, 0, 2.6));
    d.anim(c.dez, 'point');
    await d.say(c.dez, 'She closed him.\nOUT.', { cps: CPS, hold: HOLD, sfx: 'rimshot', sfxAt: 'end' });
    d.cut('whiteboard');
    await d.say(c.kiki, 'Forty thousand likes.', { cps: CPS, hold: HOLD, sfx: 'ding' });

    /* ================================================ ACT 5 — THE BURGER */
    await d.fadeOut(260);
    focus('break');
    partyRound(d, c, burger);
    d.anim(dog, 'sit');
    d.expression(dog, 'happy');
    d.mouth(dog, true);
    d.cut(SHOT.party);
    d.music('birthday');
    await d.fadeIn(260);
    await d.beat(400);

    d.cut(breakSingle(c.marge, SPOT.margeBreak));
    await d.say(c.marge, 'I expensed a hamburger.', { cps: CPS, hold: HOLD });
    d.cut(breakSingle(c.brad, SPOT.bradBreak));
    await d.say(c.brad, 'And a candle.\nWe are not animals.', { cps: CPS, hold: HOLD });
    d.cut(SHOT.burger);
    await d.say(c.kiki, 'Make a wish, Tuesday.', { cps: CPS, hold: HOLD });
    d.mouth(dog, null);
    d.anim(dog, 'bark');
    d.sfx('bark');
    await d.beat(380);
    burger.userData.setLit(false);
    d.sfx('pop');
    await d.beat(300);
    d.cut(SHOT.party);
    for (const a of [c.brad, c.dez, c.kiki, c.roop, c.marge]) d.anim(a, 'cheer');
    d.sfx('applause');
    await d.beat(900);

    // she eats it. all of it. the candle is somebody else's problem
    d.cut(SHOT.burger);
    d.anim(dog, 'sniff');
    d.sfx('chomp', { gain: 0.8 });
    await d.beat(420);
    d.sfx('chomp', { gain: 0.8, rate: 1.1 });
    await d.beat(420);
    burger.visible = false;
    d.sfx('plunk');
    d.anim(dog, 'sit');
    d.mouth(dog, true);
    await d.beat(500);

    for (const a of [c.brad, c.dez, c.kiki, c.roop, c.marge]) d.anim(a, 'idle');
    d.cut(breakSingle(c.brad, SPOT.bradBreak));
    d.anim(c.brad, 'talk');
    await d.say(c.brad, 'Tuesday. Will you be\nour office dog?', { cps: 30, hold: 700 });
    d.cut(onDog(d, dog, 180, 1.3, 0.40));
    d.mouth(dog, null);
    d.anim(dog, 'bark');
    d.sfx('bark');
    await d.beat(600);
    d.music('victory');
    d.anim(dog, 'zoomies');
    await d.toast('TUESDAY JOINED THE PARTY!', 1600);
    d.anim(dog, 'sit');

    /* ======================================================= ACT 6 — BUTTON */
    d.music('happy');
    d.cut(breakSingle(c.brad, SPOT.bradBreak));
    d.face(c.brad, SPOT.dogBurger);
    d.anim(c.brad, 'point');
    d.expression(c.brad, 'happy');
    await d.say(c.brad, 'Who\'s a good girl?\nWho\'s the best—', { cps: CPS, hold: 200 });

    d.cut(SHOT.party);
    d.expression(dog, 'squint');
    d.mouth(dog, null);
    await d.walk(dog, SPOT.dogBrad, 420);
    d.face(dog, SPOT.bradBreak, 100);
    d.anim(dog, 'bite');
    d.music(null);
    await d.beat(170);
    d.sfx('chomp');
    d.shake(0.45, 380);
    d.anim(c.brad, 'hop');
    d.expression(c.brad, 'shocked');
    await d.beat(900);

    d.cut(breakSingle(c.kiki, SPOT.kikiBreak));
    d.expression(c.kiki, null);
    await d.say(c.kiki, 'Consistent.', { cps: CPS, hold: 700, sfx: 'rimshot', sfxAt: 'end' });

    await d.fadeOut(900);
  } finally {
    burger.removeFromParent();
    for (const a of Object.values(c)) {
      d.expression(a, null);
      d.mouth(a, null);
    }
    d.music(null);
  }
}

/**
 * The thumbnail: the party round the burger, candle lit, dog delighted.
 * @param {EpisodeCtx} ctx
 * @returns {Promise<void>}
 */
async function poster(ctx) {
  const { d, cast: c } = ctx;
  d.use(ctx.office);
  if (ctx.office && typeof ctx.office.focusRoom === 'function') ctx.office.focusRoom('break');
  const burger = burgerFor(ctx);
  partyRound(d, c, burger);
  d.anim(c.tuesday, 'sit');
  d.expression(c.tuesday, 'happy');
  d.mouth(c.tuesday, true);
  for (const a of [c.brad, c.dez, c.kiki, c.roop]) d.anim(a, 'cheer');
  d.anim(c.marge, 'idle');
  d.expression(c.marge, 'happy');
  d.cut(SHOT.poster);
}

export default Object.freeze({
  id: 'ep3',
  title: 'GOOD GIRL',
  starring: ['tuesday', 'kiki', 'brad', 'dez', 'roop', 'marge'],
  guests: ['gary'],
  accent: ACCENT,
  run,
  poster,
});
