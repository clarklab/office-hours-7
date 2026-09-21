/**
 * OFFICE HOURS VII — the viewer-episode runtime.
 *
 * A hand-written episode is a JavaScript module. A viewer-submitted one is NOT,
 * and must never be: a generated `.js` file, stored and then executed on a
 * public site, is arbitrary code execution by anyone who can type into a form,
 * and it would force us to weaken the CSP that exists to stop exactly that.
 *
 * So a viewer episode is DATA — a JSON spec — and this module is the interpreter
 * that turns it into the same Director calls a hand-written episode makes. The
 * spec can be validated field by field before anything is stored or played,
 * which is the other half of the point: a generated module can be perfectly
 * valid JavaScript and still call `d.cut('lobby')` and die halfway through.
 *
 * `validateSpec()` is deliberately dependency-free so the generator function can
 * run it server-side, in Node, before it writes anything.
 *
 * @module episodes/runtime
 */

/** Step verbs a viewer episode may use. Anything else is rejected. */
export const STEP_TYPES = Object.freeze([
  'title', 'cut', 'place', 'walk', 'anim', 'face', 'say', 'nameCard',
  'wait', 'beat', 'sfx', 'music', 'toast', 'emote', 'shake', 'flash',
  'fadeOut', 'fadeIn',
]);

/**
 * The battle HUD, the command menu, damage numbers and the target cursor are
 * deliberately NOT here. They carry hard layout constraints — the HUD owns
 * y >= 129, a battle menu owns roughly x 8-110 / y 50-126, and between them
 * they hide anything under about 0.6m tall — which a hand-written episode
 * solves by choosing camera heights to suit. A generated episode cannot be
 * trusted to, and the failure mode is a scene where the thing being talked
 * about is completely covered up.
 */
export const EXCLUDED_NOTE = 'battle HUD / menu / damage are not available to viewer episodes';

/** Sound effect names a spec may ask for. */
const SFX = Object.freeze(['bark', 'fanfare', 'chime', 'thud', 'beep', 'error']);
/** Music cues a spec may ask for. `null` stops the music. */
const MUSIC = Object.freeze(['lobby', 'chase', 'victory', 'tension']);
/** Emotes a spec may ask for. */
const EMOTES = Object.freeze(['sweat', 'note', 'anger', 'idea', 'love', 'shock']);

const MAX_STEPS = 140;
const MAX_LINE = 84;
const MAX_TITLE = 48;

/** @param {*} v @returns {boolean} */
const isStr = (v) => typeof v === 'string' && v.length > 0;
/** @param {*} v @returns {boolean} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a spec against the vocabulary the set and cast actually expose.
 *
 * Returns every problem rather than the first, so a repair pass can be given
 * the whole list in one go instead of discovering them one round trip at a
 * time.
 *
 * @param {*} spec the parsed JSON
 * @param {{marks:string[], shots:string[], cast:string[], anims:Object<string,string[]>}} vocab
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateSpec(spec, vocab) {
  /** @type {string[]} */
  const errors = [];
  const push = (m) => { if (errors.length < 60) errors.push(m); };

  if (!spec || typeof spec !== 'object') return { ok: false, errors: ['spec is not an object'] };

  if (!isStr(spec.title)) push('title: required, non-empty string');
  else if (spec.title.length > MAX_TITLE) push(`title: longer than ${MAX_TITLE} characters`);

  if (!isStr(spec.logline)) push('logline: required, non-empty string');

  const marks = new Set(vocab.marks || []);
  const shots = new Set(vocab.shots || []);
  const cast = new Set(vocab.cast || []);
  const anims = vocab.anims || {};

  if (!Array.isArray(spec.starring) || spec.starring.length === 0) {
    push('starring: required, non-empty array of character ids');
  } else {
    for (const id of spec.starring) {
      if (!cast.has(id)) push(`starring: unknown character "${id}"`);
    }
  }

  if (!Array.isArray(spec.steps)) return { ok: false, errors: errors.concat('steps: required array') };
  if (spec.steps.length === 0) push('steps: empty');
  if (spec.steps.length > MAX_STEPS) push(`steps: ${spec.steps.length} exceeds the ${MAX_STEPS} limit`);

  const types = new Set(STEP_TYPES);
  spec.steps.forEach((st, i) => {
    const at = `steps[${i}]`;
    if (!st || typeof st !== 'object') { push(`${at}: not an object`); return; }
    if (!types.has(st.type)) {
      push(`${at}: unknown type "${st.type}" (allowed: ${STEP_TYPES.join(', ')})`);
      return;
    }

    /** @param {string} key */
    const actorOk = (key) => {
      const id = st[key];
      if (!isStr(id)) { push(`${at}: ${key} is required`); return false; }
      if (!cast.has(id)) { push(`${at}: unknown character "${id}"`); return false; }
      return true;
    };

    switch (st.type) {
      case 'cut':
        if (!isStr(st.shot)) push(`${at}: shot is required`);
        else if (!shots.has(st.shot)) push(`${at}: unknown shot "${st.shot}"`);
        break;
      case 'place':
      case 'walk':
        if (actorOk('actor')) {
          if (!isStr(st.mark)) push(`${at}: mark is required`);
          else if (!marks.has(st.mark)) push(`${at}: unknown mark "${st.mark}"`);
        }
        break;
      case 'anim':
        if (actorOk('actor')) {
          const list = anims[st.actor] || [];
          if (!isStr(st.name)) push(`${at}: name is required`);
          else if (!list.includes(st.name)) {
            push(`${at}: "${st.actor}" has no animation "${st.name}" (has: ${list.join(', ')})`);
          }
        }
        break;
      case 'emote':
        if (actorOk('actor')) {
          if (!EMOTES.includes(st.name)) push(`${at}: unknown emote "${st.name}"`);
        }
        break;
      case 'face':
        if (actorOk('actor')) {
          if (isStr(st.target) && !cast.has(st.target) && !marks.has(st.target)) {
            push(`${at}: target "${st.target}" is not a character or a mark`);
          }
        }
        break;
      case 'say': {
        if (st.actor !== null && st.actor !== undefined && !actorOk('actor')) break;
        if (!isStr(st.text)) { push(`${at}: text is required`); break; }
        if (st.text.length > MAX_LINE) push(`${at}: line is ${st.text.length} characters, over ${MAX_LINE}`);
        break;
      }
      case 'nameCard':
        actorOk('actor');
        break;
      case 'wait':
      case 'beat':
        if (!isNum(st.ms) || st.ms < 0 || st.ms > 6000) push(`${at}: ms must be a number 0-6000`);
        break;
      case 'sfx':
        if (!SFX.includes(st.name)) push(`${at}: unknown sfx "${st.name}" (allowed: ${SFX.join(', ')})`);
        break;
      case 'music':
        if (st.name !== null && !MUSIC.includes(st.name)) {
          push(`${at}: unknown music "${st.name}" (allowed: ${MUSIC.join(', ')}, or null to stop)`);
        }
        break;
      case 'toast':
      case 'title':
        if (!isStr(st.text) && !isStr(st.subtitle)) push(`${at}: text is required`);
        break;
      default:
        break; // shake / flash / fadeIn / fadeOut take no required fields
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Rough runtime estimate in seconds, so a spec can be checked against the
 * 95-150s window before it is stored rather than after somebody watches it.
 *
 * Mirrors dialogue.js's readable floor: 1.3s plus a second per 14 characters.
 *
 * @param {*} spec
 * @returns {number} seconds
 */
export function estimateRuntime(spec) {
  if (!spec || !Array.isArray(spec.steps)) return 0;
  let ms = 0;
  for (const st of spec.steps) {
    if (!st || typeof st !== 'object') continue;
    switch (st.type) {
      case 'say': ms += 1300 + (String(st.text || '').length / 14) * 1000; break;
      case 'nameCard': ms += 1750; break;
      case 'title': ms += 2600; break;
      case 'walk': ms += 1400; break;
      case 'wait': case 'beat': ms += Number(st.ms) || 0; break;
      case 'toast': ms += 1600; break;
      case 'fadeOut': case 'fadeIn': ms += 600; break;
      default: ms += 120; break;
    }
  }
  return Math.round(ms / 100) / 10;
}

/**
 * Plays a validated spec.
 *
 * Every step goes through the Director, so `d.cancel()` unwinds a viewer
 * episode exactly as it unwinds a hand-written one. An unknown step is skipped
 * rather than thrown on: the spec was validated before it was stored, so
 * anything odd here means the vocabulary moved underneath a saved episode, and
 * skipping one beat is better than ending someone's episode on an error.
 *
 * @param {{d:Object, cast:Object<string,Object>, office:Object}} ctx
 * @param {*} spec
 * @returns {Promise<void>}
 */
export async function runSpec(ctx, spec) {
  const { d, cast } = ctx;
  const who = (id) => (id && cast[id]) || null;

  for (const st of spec.steps) {
    if (d.cancelled && d.cancelled()) return;
    if (!st || typeof st !== 'object') continue;
    const a = who(st.actor);

    switch (st.type) {
      case 'title':
        await d.title({ subtitle: st.subtitle || st.text || spec.title, ms: 2200 });
        break;
      case 'cut': d.cut(st.shot); break;
      case 'place': if (a) d.place(a, st.mark); break;
      case 'walk': if (a) await d.walk(a, st.mark); break;
      case 'anim': if (a) d.anim(a, st.name); break;
      case 'emote': if (a) d.emote(a, st.name); break;
      case 'face': if (a) d.face(a, who(st.target) || st.target); break;
      case 'say':
        await d.say(a, st.text, st.at ? { at: st.at } : {});
        break;
      case 'nameCard': if (a) await d.nameCard(a, { ms: 1750 }); break;
      case 'wait': await d.wait(st.ms); break;
      case 'beat': await d.beat(st.ms); break;
      case 'sfx': d.sfx(st.name); break;
      case 'music': d.music(st.name); break;
      case 'toast': d.toast(st.text); break;
      case 'shake': d.shake(); break;
      case 'flash': d.flash(); break;
      case 'fadeOut': await d.fadeOut(); break;
      case 'fadeIn': await d.fadeIn(); break;
      default: break;
    }
  }
}

/**
 * Wraps a spec in the same `{ run, poster }` shape the player loads for a
 * hand-written episode, so nothing downstream has to know the difference.
 *
 * @param {*} spec
 * @returns {{run:(ctx:Object)=>Promise<void>, poster:(ctx:Object)=>Promise<void>, meta:Object}}
 */
export function episodeFromSpec(spec) {
  return {
    meta: {
      id: spec.id,
      title: spec.title,
      logline: spec.logline,
      starring: spec.starring,
    },
    async run(ctx) {
      await runSpec(ctx, spec);
    },
    async poster(ctx) {
      // Stand the cast up somewhere sensible and take the set's own wide.
      const { d, cast, office } = ctx;
      const marks = ['deskBrad', 'deskDez', 'deskMarge', 'deskRoop', 'bullpenCenter', 'waterCooler'];
      (spec.starring || []).forEach((id, i) => {
        if (cast[id]) d.place(cast[id], marks[i % marks.length]);
      });
      const shots = (office && office.shots) || {};
      d.cut(shots.bullpenWide ? 'bullpenWide' : 'establish');
    },
  };
}
