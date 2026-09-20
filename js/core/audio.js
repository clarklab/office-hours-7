/**
 * OFFICE HOURS — audio.
 *
 * Every sound in the show is synthesised at runtime with WebAudio. There are no
 * audio files anywhere in this project and there never will be.
 *
 * Three buses hang off one master gain behind a compressor:
 *
 *   voiceBus ─┐
 *   sfxBus   ─┼─► master (0.25) ─► compressor ─► destination
 *   musicBus ─┘
 *
 * The voices are the headline feature: Peanuts-style gibberish blips ("ber ber
 * dar dap"), one profile per cast member, each built from a different oscillator
 * + filter topology so they are distinguishable with your eyes closed.
 *
 * Everything in here no-ops safely if {@link initAudio} was never called, if the
 * AudioContext failed to construct, or if {@link setMuted} was passed true.
 *
 * @module core/audio
 */

/** @typedef {'brad'|'dez'|'kiki'|'roop'|'marge'|'tuesday'|'narrator'} VoiceId */

/* ------------------------------------------------------------------ *
 * Graph state
 * ------------------------------------------------------------------ */

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;
/** @type {GainNode|null} */
let voiceBus = null;
/** @type {GainNode|null} */
let sfxBus = null;
/** @type {GainNode|null} */
let musicBus = null;
/** @type {AudioBuffer|null} */
let noiseBuf = null;
/** @type {PeriodicWave|null} */
let pulseWave = null;
/** @type {boolean} */
let muted = false;
/** @type {boolean} */
let failed = false;

/** Absolute master level. Music sits ~0.08 absolute (MASTER * MUSIC_BUS). */
const MASTER = 0.25;
const MUSIC_BUS = 0.33;

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/**
 * Creates the shared AudioContext and the bus graph. Must be called from a user
 * gesture (a click / keypress) before any sound will play. Idempotent — calling
 * it again just tries to resume a suspended context.
 * @returns {void}
 */
export function initAudio() {
  if (failed) return;
  if (ctx) {
    resume();
    return;
  }
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) {
    failed = true;
    return;
  }
  try {
    ctx = new Ctor();
  } catch (e) {
    failed = true;
    ctx = null;
    return;
  }

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 14;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  master.connect(comp);

  voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_BUS;
  musicBus.connect(master);

  // 2 s of white noise, shared by every noise-based sound.
  const n = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 0x1a2b3c4d;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = (seed / 0x7fffffff) - 1;
  }

  pulseWave = makePulseWave(0.12);
  resume();
}

/**
 * True once the context exists and has not been closed.
 * @returns {boolean}
 */
export function isAudioReady() {
  return !!ctx && ctx.state !== 'closed';
}

/**
 * Mutes or unmutes everything. Safe to call before {@link initAudio}; the flag
 * is remembered and applied when the context is built.
 * @param {boolean} m
 * @returns {void}
 */
export function setMuted(m) {
  muted = !!m;
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(muted ? 0 : MASTER, t + 0.08);
}

/**
 * @returns {boolean} current mute state
 */
export function isMuted() {
  return muted;
}

/** @returns {void} */
function resume() {
  if (!ctx || typeof ctx.resume !== 'function') return;
  if (ctx.state !== 'suspended') return;
  try {
    const p = ctx.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* offline / already running — nothing to do */ }
}

/**
 * Guard used by every sound-producing entry point.
 * @returns {boolean} true when it is worth building nodes
 */
function live() {
  if (failed || muted || !ctx || ctx.state === 'closed') return false;
  resume();
  return true;
}

/* ------------------------------------------------------------------ *
 * Low-level helpers
 * ------------------------------------------------------------------ */

/**
 * Attack / hold / release envelope. Never starts or ends at a hard edge, so
 * nothing in the show ever clicks.
 * @param {AudioParam} param
 * @param {number} t0 start time
 * @param {number} peak
 * @param {number} atk seconds
 * @param {number} hold seconds at peak
 * @param {number} rel seconds
 * @param {boolean} [hard=false] linear (clipped) release instead of exponential
 * @returns {number} the time the envelope reaches silence
 */
function env(param, t0, peak, atk, hold, rel, hard) {
  const p = Math.max(peak, 0.0006);
  const a = Math.max(atk, 0.0012);
  const r = Math.max(rel, hard ? 0.003 : 0.012);
  const susEnd = t0 + a + Math.max(hold, 0);
  const end = susEnd + r;
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(p, t0 + a);
  if (hold > 0) param.setValueAtTime(p, susEnd);
  if (hard) param.linearRampToValueAtTime(0.0001, end);
  else param.exponentialRampToValueAtTime(0.0001, end);
  param.setValueAtTime(0, end + 0.002);
  return end;
}

/**
 * Builds a narrow-pulse PeriodicWave (analytic Fourier series of a duty-cycle
 * square). Gives marge her clipped, joyless buzz without any aliasing mess.
 * @param {number} duty 0..1
 * @returns {PeriodicWave}
 */
function makePulseWave(duty) {
  const N = 26;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    const w = 2 * Math.PI * n * duty;
    const roll = Math.exp(-n / 16);
    real[n] = (2 * Math.sin(w) / (Math.PI * n)) * roll;
    imag[n] = (2 * (1 - Math.cos(w)) / (Math.PI * n)) * roll;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/**
 * @param {number} t start time
 * @param {number} [dur=1] seconds of noise to play
 * @returns {AudioBufferSourceNode}
 */
function noiseSrc(t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  // Deterministic-ish but varied start offset so repeated hits are not identical.
  s.loopStart = 0;
  s.loopEnd = noiseBuf.duration;
  const off = (t * 7.3) % (noiseBuf.duration - 0.05);
  s.start(t, Math.max(0, off));
  s.stop(t + Math.max(dur || 1, 0.02) + 0.02);
  return s;
}

/**
 * @param {BiquadFilterType} type
 * @param {number} freq
 * @param {number} [q=1]
 * @returns {BiquadFilterNode}
 */
function filt(type, freq, q) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q == null ? 1 : q;
  return f;
}

/**
 * Chains an array of nodes together and returns the last one.
 * @param {AudioNode[]} nodes
 * @returns {AudioNode}
 */
function chain(nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/* ------------------------------------------------------------------ *
 * Voices
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} VoiceProfile
 * @property {string} kind synth topology
 * @property {number} base centre frequency in Hz
 * @property {number} spread +/- pitch range in semitones
 * @property {number} rate minimum seconds between blips
 * @property {number} dur note length in seconds
 * @property {number} gain relative level
 */

/** @type {Object<string, VoiceProfile>} */
const VOICES = {
  // Peanuts adult. Sawtooth through a bandpass that sweeps up then back down
  // over the note — that is literally what a plunger mute does to a trombone.
  brad: { kind: 'trombone', base: 180, spread: 2.0, rate: 0.118, dur: 0.21, gain: 0.62 },
  // Brassy square with a hard upward pitch flick on every attack. Fast, loud,
  // never stops talking.
  dez: { kind: 'brass', base: 260, spread: 4.5, rate: 0.062, dur: 0.105, gain: 0.44 },
  // Tiny high deadpan pips. Almost no pitch spread — flat affect on purpose.
  kiki: { kind: 'tiny', base: 520, spread: 0.7, rate: 0.048, dur: 0.06, gain: 0.30 },
  // Mumbling under a desk, behind a hood, through a lowpass.
  roop: { kind: 'mumble', base: 120, spread: 1.0, rate: 0.136, dur: 0.18, gain: 0.58 },
  // Narrow pulse, metronomic, hard attack, hard cutoff. Precise and joyless.
  marge: { kind: 'pulse', base: 340, spread: 1.6, rate: 0.092, dur: 0.075, gain: 0.34 },
  // Not speech. A borf.
  tuesday: { kind: 'borf', base: 265, spread: 3.0, rate: 0.16, dur: 0.19, gain: 0.55 },
  narrator: { kind: 'neutral', base: 300, spread: 2.5, rate: 0.086, dur: 0.11, gain: 0.34 },
};

/**
 * @param {string} id
 * @returns {VoiceProfile}
 */
function profile(id) {
  return VOICES[id] || VOICES.narrator;
}

/**
 * Deterministic pitch for a character. The same letter in the same voice always
 * produces the same note, so a line of dialogue sounds identical every replay.
 * @param {VoiceProfile} p
 * @param {string} ch
 * @returns {number} Hz
 */
function charPitch(p, ch) {
  const code = ch.charCodeAt(0) || 65;
  let h = Math.imul(code, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const u = ((h >>> 9) & 0xffff) / 0xffff;
  return p.base * Math.pow(2, ((u - 0.5) * 2 * p.spread) / 12);
}

/**
 * Plays one gibberish syllable.
 * @param {VoiceProfile} p
 * @param {string} ch character driving the pitch
 * @param {number} t absolute context time
 * @param {AudioNode} [dest=voiceBus]
 * @returns {void}
 */
function blipAt(p, ch, t, dest) {
  const out = dest || voiceBus;
  const f = charPitch(p, ch);
  const d = p.dur;
  const g = ctx.createGain();
  g.connect(out);

  switch (p.kind) {
    case 'trombone': {
      // "wah wah" — bandpass centre rises to ~8x then falls back, plus a slow
      // downward pitch slide. Blended with a little direct body so it has guts.
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.87, t + d);
      const bp = filt('bandpass', f * 2.0, 7);
      bp.frequency.setValueAtTime(f * 2.0, t);
      bp.frequency.exponentialRampToValueAtTime(f * 7.5, t + d * 0.42);
      bp.frequency.exponentialRampToValueAtTime(f * 2.1, t + d);
      const wah = ctx.createGain();
      wah.gain.value = 0.85;
      // A trombone has a strong fundamental; without this body path the
      // bandpass alone reads as a thin mid-range pip rather than a low brass
      // instrument, and he stops being distinguishable from kiki.
      const body = ctx.createGain();
      body.gain.value = 0.62;
      const lp = filt('lowpass', f * 3.4, 0.9);
      o.connect(bp); bp.connect(wah); wah.connect(g);
      o.connect(lp); lp.connect(body); body.connect(g);
      env(g.gain, t, p.gain, 0.022, d * 0.4, d * 0.55);
      o.start(t); o.stop(t + d + 0.1);
      break;
    }
    case 'brass': {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f * 0.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.024);
      o.frequency.exponentialRampToValueAtTime(f * 0.96, t + d);
      const lp = filt('lowpass', f * 10, 3.5);
      lp.frequency.setValueAtTime(f * 11, t);
      lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + d);
      chain([o, lp, g]);
      env(g.gain, t, p.gain, 0.004, d * 0.28, d * 0.6);
      o.start(t); o.stop(t + d + 0.06);
      break;
    }
    case 'tiny': {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.985, t + d);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(f * 2.01, t);
      const g2 = ctx.createGain();
      g2.gain.value = 0.28;
      const hp = filt('highpass', 260, 0.7);
      o.connect(hp); o2.connect(g2); g2.connect(hp); hp.connect(g);
      env(g.gain, t, p.gain, 0.003, d * 0.15, d * 0.7);
      o.start(t); o.stop(t + d + 0.05);
      o2.start(t); o2.stop(t + d + 0.05);
      break;
    }
    case 'mumble': {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.015, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.985, t + d);
      const lp = filt('lowpass', f * 3.2, 1.4);
      const ns = noiseSrc(t, d);
      const nb = filt('bandpass', f * 2.4, 1.1);
      const ng = ctx.createGain();
      ng.gain.value = 0.055;
      o.connect(lp); lp.connect(g);
      ns.connect(nb); nb.connect(ng); ng.connect(g);
      env(g.gain, t, p.gain, 0.028, d * 0.3, d * 0.62);
      o.start(t); o.stop(t + d + 0.1);
      break;
    }
    case 'pulse': {
      const o = ctx.createOscillator();
      o.setPeriodicWave(pulseWave);
      o.frequency.setValueAtTime(f, t);
      const lp = filt('lowpass', 3400, 0.8);
      chain([o, lp, g]);
      // Hard on, hard off. No taper, no warmth.
      env(g.gain, t, p.gain, 0.0015, d * 0.62, 0.004, true);
      o.start(t); o.stop(t + d + 0.04);
      break;
    }
    case 'borf': {
      const ns = noiseSrc(t, d);
      const bp = filt('bandpass', 1900, 1.7);
      bp.frequency.setValueAtTime(1900, t);
      bp.frequency.exponentialRampToValueAtTime(380, t + d * 0.7);
      const ng = ctx.createGain();
      ng.gain.value = 0.85;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.34, t + d * 0.55);
      const lp = filt('lowpass', 1100, 1.2);
      const og = ctx.createGain();
      og.gain.value = 0.6;
      ns.connect(bp); bp.connect(ng); ng.connect(g);
      o.connect(lp); lp.connect(og); og.connect(g);
      env(g.gain, t, p.gain, 0.005, d * 0.18, d * 0.6);
      o.start(t); o.stop(t + d + 0.06);
      break;
    }
    default: {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.99, t + d);
      const lp = filt('lowpass', f * 6, 1);
      chain([o, lp, g]);
      env(g.gain, t, p.gain, 0.007, d * 0.25, d * 0.6);
      o.start(t); o.stop(t + d + 0.05);
      break;
    }
  }
}

/**
 * Speaks a whole line as gibberish blips, scheduled up front. Mostly for
 * one-shots — the dialogue system should use {@link makeSpeaker} so blips line
 * up with the characters it actually reveals.
 * @param {VoiceId} voiceId
 * @param {string} text
 * @returns {Promise<void>} resolves when the last blip has finished
 */
export function speak(voiceId, text) {
  if (!live()) return Promise.resolve();
  const p = profile(voiceId);
  const s = String(text == null ? '' : text);
  const charDur = 1 / 34;
  const every = Math.max(1, Math.round(p.rate / charDur));
  const start = ctx.currentTime + 0.03;
  let t = start;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!ch.trim()) { t += charDur; continue; }
    if (n % every === 0) blipAt(p, ch, t, voiceBus);
    n++;
    t += charDur;
    if ('.,!?:;…—'.indexOf(ch) >= 0) t += 0.11;
  }
  const ms = Math.max(0, (t - ctx.currentTime) * 1000) + p.dur * 1000 + 40;
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * A per-line voice handle. Call `blip(ch)` for each revealed character (it
 * rate-limits itself to the profile's natural syllable rate, so passing every
 * single character is fine) and `stop()` when the line is cut short.
 * @param {VoiceId} voiceId
 * @returns {{ blip(ch: string): void, stop(): void }}
 */
export function makeSpeaker(voiceId) {
  const p = profile(voiceId);
  /** @type {GainNode|null} */
  let bus = null;
  let last = -1e9;

  /** @returns {GainNode|null} */
  const getBus = () => {
    if (bus && bus.context === ctx) return bus;
    if (!ctx) return null;
    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(voiceBus);
    return bus;
  };

  return {
    /**
     * Plays one syllable for this character, if enough time has passed.
     * @param {string} ch
     * @returns {void}
     */
    blip(ch) {
      if (!live()) return;
      const c = String(ch == null ? '' : ch);
      if (!c || !c.trim()) return;
      const now = ctx.currentTime;
      if (now - last < p.rate) return;
      last = now;
      const b = getBus();
      if (b) blipAt(p, c, now + 0.004, b);
    },
    /**
     * Silences anything still ringing from this speaker and re-arms it.
     * @returns {void}
     */
    stop() {
      last = -1e9;
      if (!ctx || !bus) return;
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.02);
      bus.gain.setValueAtTime(1, t + 0.06);
    },
  };
}

/* ------------------------------------------------------------------ *
 * SFX
 * ------------------------------------------------------------------ */

/**
 * One oscillator voice with an optional filter and pitch glide.
 * @param {Object} o
 * @returns {OscillatorNode}
 */
function tone(o) {
  const t = o.t;
  const osc = ctx.createOscillator();
  if (o.pulse) osc.setPeriodicWave(pulseWave);
  else osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(Math.max(o.f0, 1), t);
  if (o.f1 && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t + (o.glide == null ? o.dur : o.glide));
  }
  const g = ctx.createGain();
  let node = osc;
  if (o.filter) {
    const f = filt(o.filter, o.cutoff || 1200, o.q);
    if (o.cutoff1) {
      f.frequency.setValueAtTime(o.cutoff, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(o.cutoff1, 1), t + (o.fglide == null ? o.dur : o.fglide));
    }
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(o.dest || sfxBus);
  const end = env(g.gain, t, o.gain == null ? 0.3 : o.gain, o.atk == null ? 0.005 : o.atk,
    o.hold == null ? 0 : o.hold, o.rel == null ? o.dur : o.rel, o.hard);
  osc.start(t);
  osc.stop(end + 0.03);
  return osc;
}

/**
 * One filtered noise burst.
 * @param {Object} o
 * @returns {void}
 */
function hiss(o) {
  const t = o.t;
  const dur = (o.atk || 0.005) + (o.hold || 0) + (o.rel || 0.1) + 0.05;
  const s = noiseSrc(t, dur);
  const f = filt(o.filter || 'bandpass', o.cutoff || 1200, o.q == null ? 1 : o.q);
  if (o.cutoff1) {
    f.frequency.setValueAtTime(o.cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(o.cutoff1, 1), t + (o.fglide == null ? dur : o.fglide));
  }
  const g = ctx.createGain();
  s.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
  env(g.gain, t, o.gain == null ? 0.3 : o.gain, o.atk == null ? 0.005 : o.atk,
    o.hold == null ? 0 : o.hold, o.rel == null ? 0.1 : o.rel, o.hard);
}

/**
 * Plays a one-shot sound effect.
 *
 * `cursor` / `confirm` / `cancel` are the 32-bit JRPG menu triad and get used
 * constantly, so they are the most carefully tuned sounds in the file.
 *
 * @param {'cursor'|'confirm'|'cancel'|'error'|'chime'|'fanfare'|'bark'|'phone'|'crash'|'stamp'|'whoosh'|'shred'|'typewriter'} id
 * @param {Object} [opts]
 * @param {number} [opts.gain=1] level multiplier
 * @param {number} [opts.when=0] delay in seconds
 * @param {number} [opts.rate=1] pitch multiplier
 * @param {number} [opts.duration] length override, honoured by `shred` and `whoosh`
 * @returns {void}
 */
export function playSfx(id, opts = {}) {
  if (!live()) return;
  const v = opts.gain == null ? 1 : opts.gain;
  const r = opts.rate == null ? 1 : opts.rate;
  const t = ctx.currentTime + 0.005 + Math.max(0, opts.when || 0);

  switch (id) {
    case 'cursor':
      // Short bright tick with a tiny downward tail. The menu heartbeat.
      tone({ t, type: 'square', f0: 1320 * r, f1: 1180 * r, glide: 0.035, dur: 0.05,
        gain: 0.20 * v, atk: 0.002, hold: 0.012, rel: 0.038, filter: 'lowpass', cutoff: 5200, q: 0.8 });
      tone({ t, type: 'triangle', f0: 2640 * r, dur: 0.04, gain: 0.07 * v, atk: 0.002, rel: 0.03 });
      break;

    case 'confirm':
      // Two-step rising chirp: the "you picked it" sound.
      tone({ t, type: 'square', f0: 880 * r, dur: 0.055, gain: 0.17 * v, atk: 0.002, hold: 0.02, rel: 0.04,
        filter: 'lowpass', cutoff: 5000, q: 0.8 });
      tone({ t: t + 0.055, type: 'square', f0: 1318.5 * r, dur: 0.12, gain: 0.19 * v, atk: 0.002, hold: 0.03, rel: 0.1,
        filter: 'lowpass', cutoff: 6000, q: 0.8 });
      tone({ t: t + 0.055, type: 'triangle', f0: 2637 * r, dur: 0.1, gain: 0.06 * v, atk: 0.002, rel: 0.09 });
      break;

    case 'cancel':
      // Two-step falling chirp, duller than confirm.
      tone({ t, type: 'square', f0: 660 * r, dur: 0.05, gain: 0.16 * v, atk: 0.002, hold: 0.018, rel: 0.035,
        filter: 'lowpass', cutoff: 2600, q: 0.9 });
      tone({ t: t + 0.05, type: 'square', f0: 392 * r, dur: 0.13, gain: 0.17 * v, atk: 0.002, hold: 0.03, rel: 0.11,
        filter: 'lowpass', cutoff: 2000, q: 0.9 });
      break;

    case 'error': {
      // Low buzz, gated twice. Unambiguously "no".
      for (let i = 0; i < 2; i++) {
        tone({ t: t + i * 0.13, pulse: true, f0: 130 * r, dur: 0.1, gain: 0.22 * v,
          atk: 0.003, hold: 0.06, rel: 0.03, hard: true, filter: 'lowpass', cutoff: 1500, q: 1.2 });
        tone({ t: t + i * 0.13, type: 'square', f0: 98 * r, dur: 0.1, gain: 0.12 * v,
          atk: 0.003, hold: 0.06, rel: 0.03, hard: true });
      }
      break;
    }

    case 'chime': {
      // Bell-ish: a couple of inharmonic sine partials with long decay.
      const f = 1568 * r;
      const parts = [[1, 0.16], [2.76, 0.06], [5.4, 0.025]];
      for (const [m, a] of parts) {
        tone({ t, type: 'sine', f0: f * m, dur: 1.2, gain: a * v, atk: 0.004, hold: 0.02, rel: 1.15 });
      }
      tone({ t: t + 0.06, type: 'sine', f0: 2349 * r, dur: 0.9, gain: 0.07 * v, atk: 0.004, rel: 0.88 });
      break;
    }

    case 'fanfare': {
      // Short major-key victory sting: three stabs and a held resolve, with a
      // flat-6 / flat-7 approach because that is the JRPG cadence.
      const seq = [
        [0.00, 523.25, 0.09], [0.13, 523.25, 0.09], [0.26, 523.25, 0.09],
        [0.39, 523.25, 0.26], [0.70, 415.30, 0.14], [0.86, 466.16, 0.14],
        [1.02, 523.25, 0.62],
      ];
      for (const [d, f, len] of seq) {
        tone({ t: t + d, type: 'square', f0: f * r, dur: len, gain: 0.15 * v,
          atk: 0.006, hold: len * 0.6, rel: len * 0.45, filter: 'lowpass', cutoff: 4200, q: 0.8 });
        tone({ t: t + d, type: 'triangle', f0: f * 1.5 * r, dur: len, gain: 0.09 * v,
          atk: 0.008, hold: len * 0.6, rel: len * 0.45 });
        tone({ t: t + d, type: 'triangle', f0: f * 0.5 * r, dur: len, gain: 0.11 * v,
          atk: 0.008, hold: len * 0.6, rel: len * 0.5 });
      }
      break;
    }

    case 'bark': {
      // Tuesday, at volume.
      const p = VOICES.tuesday;
      const g = ctx.createGain();
      g.gain.value = 1.5 * v;
      g.connect(sfxBus);
      blipAt(p, 'W', t, g);
      blipAt(p, 'o', t + 0.19, g);
      break;
    }

    case 'phone': {
      // Two-tone desk phone: alternating pitches inside each ring, two rings.
      for (let ring = 0; ring < 2; ring++) {
        const r0 = t + ring * 0.62;
        for (let i = 0; i < 8; i++) {
          const f = (i % 2 === 0 ? 880 : 660) * r;
          tone({ t: r0 + i * 0.045, type: 'square', f0: f, dur: 0.045, gain: 0.13 * v,
            atk: 0.003, hold: 0.026, rel: 0.014, hard: true, filter: 'bandpass', cutoff: 1500, q: 2.2 });
        }
        hiss({ t: r0, filter: 'bandpass', cutoff: 2600, q: 3, gain: 0.02 * v, atk: 0.004, hold: 0.3, rel: 0.05 });
      }
      break;
    }

    case 'crash': {
      // Something heavy hits a carpet tile, plus filing-cabinet ring.
      hiss({ t, filter: 'lowpass', cutoff: 5200, cutoff1: 340, fglide: 0.55,
        q: 0.9, gain: 0.34 * v, atk: 0.002, hold: 0.05, rel: 0.7 });
      tone({ t, type: 'sine', f0: 140 * r, f1: 42 * r, glide: 0.3, dur: 0.5,
        gain: 0.34 * v, atk: 0.003, hold: 0.04, rel: 0.45 });
      for (const m of [1, 1.47, 2.13]) {
        tone({ t: t + 0.02, type: 'square', f0: 430 * m * r, dur: 0.45, gain: 0.045 * v,
          atk: 0.002, rel: 0.42, filter: 'bandpass', cutoff: 430 * m * r, q: 9 });
      }
      break;
    }

    case 'stamp': {
      // Rubber stamp: wood click over a short thud. Marge's favourite sound.
      hiss({ t, filter: 'bandpass', cutoff: 2400, q: 1.4, gain: 0.3 * v, atk: 0.001, hold: 0.004, rel: 0.035, hard: true });
      tone({ t, type: 'sine', f0: 190 * r, f1: 70 * r, glide: 0.07, dur: 0.11,
        gain: 0.3 * v, atk: 0.002, hold: 0.012, rel: 0.09 });
      break;
    }

    case 'whoosh': {
      const dur = Math.max(0.15, opts.duration || 0.42);
      const t2 = t + dur * 0.45;
      hiss({ t, filter: 'bandpass', cutoff: 320, cutoff1: 2600, fglide: dur * 0.45,
        q: 1.1, gain: 0.16 * v, atk: dur * 0.4, hold: 0, rel: 0.02 });
      hiss({ t: t2, filter: 'bandpass', cutoff: 2600, cutoff1: 280, fglide: dur * 0.55,
        q: 1.1, gain: 0.16 * v, atk: 0.01, hold: 0, rel: dur * 0.55 });
      break;
    }

    case 'shred': {
      // Paper shredder: broadband hiss chopped by the feed, over a motor hum
      // that sags under load.
      const dur = Math.max(0.3, opts.duration || 1.15);
      hiss({ t, filter: 'bandpass', cutoff: 1900, q: 1.5, gain: 0.2 * v,
        atk: 0.05, hold: dur - 0.15, rel: 0.1 });
      hiss({ t, filter: 'highpass', cutoff: 4200, q: 0.7, gain: 0.08 * v,
        atk: 0.05, hold: dur - 0.15, rel: 0.1 });
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.setValueAtTime(72 * r, t);
      motor.frequency.linearRampToValueAtTime(62 * r, t + dur * 0.5);
      motor.frequency.linearRampToValueAtTime(74 * r, t + dur);
      const mlp = filt('lowpass', 520, 3.5);
      const mg = ctx.createGain();
      motor.connect(mlp); mlp.connect(mg); mg.connect(sfxBus);
      env(mg.gain, t, 0.24 * v, 0.06, dur - 0.16, 0.12);
      motor.start(t); motor.stop(t + dur + 0.2);
      // Feed chatter.
      const chop = ctx.createOscillator();
      chop.type = 'square';
      chop.frequency.value = 26;
      const chopAmt = ctx.createGain();
      chopAmt.gain.value = 0.09 * v;
      chop.connect(chopAmt); chopAmt.connect(mg.gain);
      chop.start(t); chop.stop(t + dur);
      break;
    }

    case 'typewriter': {
      hiss({ t, filter: 'bandpass', cutoff: 3100, q: 2, gain: 0.16 * v, atk: 0.001, hold: 0.002, rel: 0.02, hard: true });
      tone({ t, type: 'triangle', f0: 240 * r, f1: 150 * r, glide: 0.03, dur: 0.045,
        gain: 0.1 * v, atk: 0.001, hold: 0.005, rel: 0.035 });
      break;
    }

    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Music
 * ------------------------------------------------------------------ */

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/;

/**
 * 'A3' / 'F#4' / 'Bb1' -> Hz.
 * @param {string} name
 * @returns {number}
 */
function noteFreq(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return 0;
  const s = SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (parseInt(m[3], 10) + 1) * 12 + s;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parses one pattern token: '.', 'x' (noise hit), 'A3', 'A3:4', 'A3+C4+E4:6'.
 * @param {string} tok
 * @returns {{freqs:number[], len:number, noise:boolean}|null}
 */
function parseTok(tok) {
  if (!tok || tok === '.' || tok === '-') return null;
  const c = tok.indexOf(':');
  const head = c < 0 ? tok : tok.slice(0, c);
  const len = c < 0 ? 1 : Math.max(1, parseInt(tok.slice(c + 1), 10) || 1);
  if (head === 'x') return { freqs: [], len, noise: true };
  const freqs = head.split('+').map(noteFreq).filter((f) => f > 0);
  if (!freqs.length) return null;
  return { freqs, len, noise: false };
}

/** @param {string} s @returns {string[]} */
const pat = (s) => s.trim().split(/\s+/);

/**
 * @typedef {Object} MusicDef
 * @property {number} stepDur seconds per sequencer step
 * @property {boolean} loop
 * @property {Array<Object>} tracks
 */

/** @type {Object<string, MusicDef>} */
const MUSIC = {
  // Bored minor-key elevator loop. A minor, 84bpm, eighth-note grid, four bars.
  lobby: {
    stepDur: 60 / 84 / 2,
    loop: true,
    tracks: [
      {
        wave: 'triangle', gain: 0.5, atk: 0.02, rel: 0.2, filter: 'lowpass', cutoff: 620, q: 1,
        pat: pat(`
          A1:3 . . . E2:3 . . .
          D2:3 . . . A2:3 . . .
          E2:3 . . . B2:3 . . .
          A1:3 . . . E2:2 . G1:1 .`),
      },
      {
        wave: 'triangle', gain: 0.17, atk: 0.09, rel: 0.5, filter: 'lowpass', cutoff: 1500, q: 0.8, detune: 5,
        pat: pat(`
          A3+C4+E4+G4:6 . . . . . . .
          D3+F3+A3+C4:6 . . . . . . .
          E3+G3+B3+D4:6 . . . . . . .
          A3+C4+E4+G4:6 . . . . . . .`),
      },
      {
        wave: 'sine', gain: 0.22, atk: 0.04, rel: 0.45, filter: 'lowpass', cutoff: 2400, q: 0.7,
        pat: pat(`
          . . E5:2 . . D5:3 . .
          . . . . C5:4 . . .
          . . B4:2 . . . . .
          . . . . A4:5 . . .`),
      },
    ],
  },

  // Pulsing bass + anxious 16th arpeggio. D minor, 132bpm.
  tense: {
    stepDur: 60 / 132 / 4,
    loop: true,
    tracks: [
      {
        wave: 'square', gain: 0.42, atk: 0.004, rel: 0.05, filter: 'lowpass', cutoff: 320, q: 2,
        pat: pat(`
          D2:2 . D2:2 . D2:2 . D2:2 . D2:2 . D2:2 . D2:2 . D2:2 .
          Bb1:2 . Bb1:2 . Bb1:2 . Bb1:2 . C2:2 . C2:2 . C2:2 . C2:2 .`),
      },
      {
        wave: 'sawtooth', gain: 0.13, atk: 0.003, rel: 0.07, filter: 'lowpass', cutoff: 2100, q: 5,
        pat: pat(`
          D4 F4 A4 D5 F5 D5 A4 F4 D4 F4 A4 D5 F5 D5 A4 F4
          Bb3 D4 F4 Bb4 D5 Bb4 F4 D4 C4 E4 G4 C5 E5 C5 G4 E4`),
      },
      {
        noise: true, gain: 0.07, atk: 0.001, rel: 0.028, filter: 'highpass', cutoff: 6500, q: 0.7,
        pat: pat(`
          x . . . x . . . x . . . x . . .
          x . . . x . . . x . . . x . . .`),
      },
    ],
  },

  // Fast comedic gallop. E minor, 176bpm.
  chase: {
    stepDur: 60 / 176 / 4,
    loop: true,
    tracks: [
      {
        wave: 'square', gain: 0.38, atk: 0.003, rel: 0.04, filter: 'lowpass', cutoff: 420, q: 2.5,
        pat: pat(`
          E2:2 . E2 E2 E2:2 . E2 E2 G2:2 . G2 G2 G2:2 . G2 G2
          C2:2 . C2 C2 C2:2 . C2 C2 D2:2 . D2 D2 B1:2 . B1 B1`),
      },
      {
        wave: 'square', gain: 0.15, atk: 0.003, rel: 0.06, filter: 'lowpass', cutoff: 3000, q: 1.2, detune: -4,
        pat: pat(`
          E4:2 . G4:2 . B4:2 . A4:2 . G4:2 . E4:2 . F#4:2 . G4:2 .
          A4:2 . C5:2 . B4:2 . A4:2 . G4:2 . F#4:2 . E4:2 . D4:2 .`),
      },
      {
        noise: true, gain: 0.06, atk: 0.001, rel: 0.022, filter: 'highpass', cutoff: 7000, q: 0.7,
        pat: pat(`
          x . x . x . x . x . x . x . x .
          x . x . x . x . x . x . x . x .`),
      },
    ],
  },

  // Short FF-style resolve. Plays once and stops itself.
  victory: {
    stepDur: 0.105,
    loop: false,
    tracks: [
      {
        wave: 'square', gain: 0.26, atk: 0.005, rel: 0.18, filter: 'lowpass', cutoff: 4000, q: 0.8,
        pat: pat(`
          C5:1 . C5:1 . C5:1 . C5:5 . . . . .
          Ab4:2 . Bb4:2 . C5:8 . . . . . . .`),
      },
      {
        wave: 'triangle', gain: 0.17, atk: 0.008, rel: 0.2, filter: 'lowpass', cutoff: 3000, q: 0.7,
        pat: pat(`
          E4+G4:1 . E4+G4:1 . E4+G4:1 . E4+G4:5 . . . . .
          C4+Eb4:2 . D4+F4:2 . E4+G4+C5:8 . . . . . . .`),
      },
      {
        wave: 'triangle', gain: 0.32, atk: 0.006, rel: 0.2, filter: 'lowpass', cutoff: 700, q: 1,
        pat: pat(`
          C3:1 . C3:1 . C3:1 . C3:5 . . . . .
          Ab2:2 . Bb2:2 . C3:8 . . . . . . .`),
      },
    ],
  },
};

const LOOKAHEAD = 0.18;
const TICK_MS = 25;
const XFADE = 0.35;

/** @type {{id:string, def:MusicDef, gain:GainNode, step:number, next:number, timer:number, steps:number, done:boolean}|null} */
let music = null;
/** @type {string|null} */
let musicId = null;

/**
 * Schedules one note (or noise hit) of a music track.
 * @param {Object} track
 * @param {{freqs:number[], len:number, noise:boolean}} ev
 * @param {number} t
 * @param {number} stepDur
 * @param {AudioNode} dest
 * @returns {void}
 */
function playNote(track, ev, t, stepDur, dest) {
  const dur = ev.len * stepDur;
  const atk = track.atk == null ? 0.01 : track.atk;
  const rel = track.rel == null ? 0.12 : track.rel;
  const hold = Math.max(0, dur - atk - Math.min(rel, dur * 0.4));

  if (ev.noise) {
    const g = ctx.createGain();
    const s = noiseSrc(t, atk + hold + rel + 0.05);
    const f = filt(track.filter || 'highpass', track.cutoff || 6000, track.q);
    s.connect(f); f.connect(g); g.connect(dest);
    env(g.gain, t, track.gain, atk, 0, rel);
    return;
  }

  for (const f0 of ev.freqs) {
    const o = ctx.createOscillator();
    o.type = track.wave || 'triangle';
    o.frequency.setValueAtTime(f0, t);
    if (track.detune) o.detune.setValueAtTime(track.detune, t);
    const g = ctx.createGain();
    let node = o;
    if (track.filter) {
      const bf = filt(track.filter, track.cutoff || 1500, track.q);
      o.connect(bf);
      node = bf;
    }
    node.connect(g);
    g.connect(dest);
    const end = env(g.gain, t, track.gain / Math.max(1, ev.freqs.length * 0.7), atk, hold, rel);
    o.start(t);
    o.stop(end + 0.03);
  }
}

/**
 * Lookahead scheduler tick. Pushes any steps falling inside the lookahead
 * window into the WebAudio clock, which is the only clock that keeps time.
 * @param {Object} st
 * @returns {void}
 */
function tick(st) {
  if (!ctx || st.done) return;
  const horizon = ctx.currentTime + LOOKAHEAD;
  while (st.next < horizon) {
    const s = st.step % st.steps;
    for (const tr of st.def.tracks) {
      const ev = parseTok(tr.pat[s]);
      if (ev) playNote(tr, ev, st.next, st.def.stepDur, st.gain);
    }
    st.next += st.def.stepDur;
    st.step++;
    if (!st.def.loop && st.step >= st.steps) {
      st.done = true;
      const tail = st.next + 1.0;
      clearInterval(st.timer);
      st.timer = 0;
      setTimeout(() => {
        if (music === st) { musicId = null; music = null; }
        try { st.gain.disconnect(); } catch (e) { /* already gone */ }
      }, Math.max(0, (tail - ctx.currentTime) * 1000));
      return;
    }
  }
}

/**
 * Fades out and tears down a running cue.
 * @param {Object|null} st
 * @param {number} fade seconds
 * @returns {void}
 */
function killMusic(st, fade) {
  if (!st) return;
  if (st.timer) clearInterval(st.timer);
  st.timer = 0;
  st.done = true;
  if (!ctx) return;
  const t = ctx.currentTime;
  try {
    st.gain.gain.cancelScheduledValues(t);
    st.gain.gain.setValueAtTime(st.gain.gain.value, t);
    st.gain.gain.linearRampToValueAtTime(0, t + fade);
  } catch (e) { /* context gone */ }
  setTimeout(() => {
    try { st.gain.disconnect(); } catch (e) { /* already gone */ }
  }, fade * 1000 + 200);
}

/**
 * Starts a looping music bed, crossfading out whatever was already playing.
 * Calling it twice with the same id is a no-op, so it is safe to call from a
 * per-frame update. Music sits at ~0.08 absolute so voices stay on top.
 * @param {'lobby'|'tense'|'chase'|'victory'|null} id  null stops the music
 * @returns {void}
 */
export function playMusic(id) {
  if (id == null) { stopMusic(); return; }
  if (!live()) return;
  const def = MUSIC[id];
  if (!def) return;
  if (musicId === id && music && !music.done) return;

  killMusic(music, XFADE);
  music = null;
  musicId = null;

  const steps = def.tracks.reduce((m, tr) => Math.max(m, tr.pat.length), 0);
  if (!steps) return;

  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.connect(musicBus);
  const t0 = ctx.currentTime + 0.05;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(1, t0 + (def.loop ? XFADE : 0.02));

  const st = { id, def, gain: g, step: 0, next: t0, timer: 0, steps, done: false };
  music = st;
  musicId = id;
  st.timer = setInterval(() => tick(st), TICK_MS);
  tick(st);
}

/**
 * Fades out and stops the current music bed. Safe to call at any time.
 * @returns {void}
 */
export function stopMusic() {
  killMusic(music, 0.3);
  music = null;
  musicId = null;
}
