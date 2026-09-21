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

/** @typedef {'brad'|'dez'|'kiki'|'roop'|'marge'|'tuesday'|'gary'|'narrator'} VoiceId */

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
  // GARY. Guest client, 1987 forever. Doubled sawtooth driven into a soft
  // clipper, a boxy nasal honk (notch at 650, peaks at 1.25k and 2.7k), and a
  // pitch that jumps up and then FALLS on every syllable — shouted, not sung.
  // Every blip is a little "HEY!". Wide spread, fast rate: a car-lot bark.
  gary: { kind: 'huckster', base: 232, spread: 5.5, rate: 0.074, dur: 0.13, gain: 0.27 },
  narrator: { kind: 'neutral', base: 300, spread: 2.5, rate: 0.086, dur: 0.11, gain: 0.34 },
};

/**
 * Every voice profile id, for tooling and authoring validation.
 * @type {ReadonlyArray<VoiceId>}
 */
export const VOICE_IDS = Object.freeze(/** @type {VoiceId[]} */ (Object.keys(VOICES)));

/** @type {Float32Array|null} */
let driveCurveCache = null;

/**
 * Soft-clip (tanh) curve for a WaveShaper. Built once, shared.
 * @returns {Float32Array}
 */
function driveCurve() {
  if (driveCurveCache) return driveCurveCache;
  const n = 1024;
  const c = new Float32Array(n);
  const k = 3.2;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  driveCurveCache = c;
  return c;
}

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
      // "wah wah" — bandpass centre rises to ~7.5x then falls back, plus a slow
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
      // The body path sweeps with the bandpass, not against it — a plunger mute
      // opens the whole timbre, so a static lowpass here just floods the low end
      // and flattens the wah out.
      const lp = filt('lowpass', f * 1.6, 0.9);
      lp.frequency.setValueAtTime(f * 1.6, t);
      lp.frequency.exponentialRampToValueAtTime(f * 5.5, t + d * 0.42);
      lp.frequency.exponentialRampToValueAtTime(f * 1.7, t + d);
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
    case 'huckster': {
      // Two slightly detuned saws, jump-then-fall pitch, driven, then carved
      // into a honk: hollow at 650 Hz, loud at 1.25k / 2.7k. Nothing else in
      // the cast has a falling contour AND a driven edge.
      const pre = ctx.createGain();
      pre.gain.value = 0.55;
      const oscs = [];
      for (const cents of [-9, 11]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = cents;
        o.frequency.setValueAtTime(f * 1.22, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.028);
        o.frequency.exponentialRampToValueAtTime(f * 0.78, t + d);
        o.connect(pre);
        oscs.push(o);
      }
      const drive = ctx.createWaveShaper();
      drive.curve = driveCurve();
      const hp = filt('highpass', 230, 0.7);
      const notch = filt('notch', 650, 1.6);
      const nose = filt('peaking', 1250, 4.5);
      nose.gain.value = 11;
      const nose2 = filt('peaking', 2700, 3.5);
      nose2.gain.value = 6;
      const lp = filt('lowpass', 4600, 0.7);
      chain([pre, drive, hp, notch, nose, nose2, lp, g]);
      env(g.gain, t, p.gain, 0.004, d * 0.4, d * 0.45);
      for (const o of oscs) { o.start(t); o.stop(t + d + 0.06); }
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

/** @typedef {'cursor'|'confirm'|'cancel'|'error'|'chime'|'fanfare'|'bark'|'phone'|'crash'|'stamp'|'whoosh'|'shred'|'typewriter'|'boing'|'bonk'|'plunk'|'pop'|'ding'|'success'|'cheer'|'applause'|'rimshot'|'sadTrombone'|'slideWhistle'|'slideDown'|'recordScratch'|'gasp'|'chomp'|'thud'|'beep'|'honk'|'sparkle'|'drumroll'} SfxId */

/**
 * Every id {@link playSfx} accepts, UI/menu sounds first, then the comedy
 * foley pack. Frozen; use it for validation and tooling.
 * @type {ReadonlyArray<SfxId>}
 */
export const SFX_IDS = Object.freeze(/** @type {SfxId[]} */ ([
  'cursor', 'confirm', 'cancel', 'error', 'chime', 'fanfare', 'bark', 'phone',
  'crash', 'stamp', 'whoosh', 'shred', 'typewriter',
  'boing', 'bonk', 'plunk', 'pop', 'ding', 'success', 'cheer', 'applause',
  'rimshot', 'sadTrombone', 'slideWhistle', 'slideDown', 'recordScratch',
  'gasp', 'chomp', 'thud', 'beep', 'honk', 'sparkle', 'drumroll',
]));

/**
 * Loudness trims (measured) so the busy, spread-out foley sounds land at the
 * same perceived level as the menu triad instead of being tuned note-by-note.
 * @type {Object<string, number>}
 */
const SFX_TRIM = {
  applause: 3.5, cheer: 3, gasp: 3, sadTrombone: 2.5, recordScratch: 2.2,
  success: 1.8, sparkle: 2.5, beep: 1.6, drumroll: 1.5,
};

/**
 * Small deterministic PRNG (LCG) so crowd sounds are varied inside one hit but
 * identical on every replay.
 * @param {number} seed
 * @returns {() => number} 0..1
 */
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One hand clap: a short band of noise at a slightly random centre.
 * @param {number} t
 * @param {number} gain
 * @param {() => number} rand
 * @returns {void}
 */
function clap(t, gain, rand) {
  hiss({ t, filter: 'bandpass', cutoff: 900 + rand() * 1400, q: 1.2 + rand() * 0.8, gain,
    atk: 0.001, hold: 0.004, rel: 0.03 + rand() * 0.03 });
}

/**
 * One crowd voice going "yaaay": a vibrato saw through two formant bands, the
 * second sliding up (a -> ay) while the pitch lifts and settles.
 * @param {number} t
 * @param {number} f fundamental
 * @param {number} dur
 * @param {number} gain
 * @param {() => number} rand
 * @returns {void}
 */
function crowdVoice(t, f, dur, gain, rand) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 0.85, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.18, t + 0.25);
  o.frequency.exponentialRampToValueAtTime(f, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5 + rand() * 2;
  const lg = ctx.createGain();
  lg.gain.value = 22;
  lfo.connect(lg); lg.connect(o.detune);
  const f1 = filt('bandpass', 760, 5);
  const f2 = filt('bandpass', 1100, 7);
  f2.frequency.setValueAtTime(1100, t);
  f2.frequency.exponentialRampToValueAtTime(1950, t + dur * 0.55);
  const g = ctx.createGain();
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(sfxBus);
  const end = env(g.gain, t, gain, 0.08, dur * 0.45, dur * 0.5);
  o.start(t); o.stop(end + 0.03);
  lfo.start(t); lfo.stop(end + 0.03);
}

/**
 * One plunger-muted trombone note for `sadTrombone`: saw through a bandpass
 * that opens and closes ("wah"), with an optional sagging vibrato.
 * @param {number} t
 * @param {number} f
 * @param {number} d
 * @param {number} gain
 * @param {boolean} vib
 * @returns {void}
 */
function wahNote(t, f, d, gain, vib) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 0.97, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  if (vib) o.frequency.exponentialRampToValueAtTime(f * 0.96, t + d);
  const bp = filt('bandpass', f * 2, 5);
  bp.frequency.setValueAtTime(f * 2, t);
  bp.frequency.exponentialRampToValueAtTime(f * 6, t + Math.min(0.16, d * 0.45));
  bp.frequency.exponentialRampToValueAtTime(f * 2.4, t + d);
  const lp = filt('lowpass', f * 3, 0.8);
  const body = ctx.createGain();
  body.gain.value = 0.5;
  const g = ctx.createGain();
  o.connect(bp); bp.connect(g);
  o.connect(lp); lp.connect(body); body.connect(g);
  g.connect(sfxBus);
  const end = env(g.gain, t, gain, 0.03, d * 0.55, d * 0.4);
  o.start(t); o.stop(end + 0.03);
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, t + 0.18);
    lg.gain.linearRampToValueAtTime(45, t + 0.45);
    lfo.connect(lg); lg.connect(o.detune);
    lfo.start(t); lfo.stop(end + 0.03);
  }
}

/**
 * Plays a one-shot sound effect.
 *
 * `cursor` / `confirm` / `cancel` are the 32-bit JRPG menu triad and get used
 * constantly, so they are the most carefully tuned sounds in the file. From
 * `boing` on is the comedy foley pack for scenes and dialogue triggers.
 * Unknown ids are ignored. See {@link SFX_IDS}.
 *
 * @param {SfxId} id
 * @param {Object} [opts]
 * @param {number} [opts.gain=1] level multiplier
 * @param {number} [opts.when=0] delay in seconds
 * @param {number} [opts.rate=1] pitch multiplier
 * @param {number} [opts.duration] length override, honoured by `shred`, `whoosh`,
 *   `drumroll`, `applause`, `cheer`, `beep`, `slideWhistle` and `slideDown`
 * @returns {void}
 */
export function playSfx(id, opts = {}) {
  if (!live()) return;
  const v = (opts.gain == null ? 1 : opts.gain) * (SFX_TRIM[id] || 1);
  const r = opts.rate == null ? 1 : opts.rate;
  const t = ctx.currentTime + 0.005 + Math.max(0, opts.when || 0);

  switch (id) {
    case 'cursor':
      // Short bright tick with a tiny downward tail. The menu heartbeat.
      tone({ t, type: 'square', f0: 1320 * r, f1: 1180 * r, glide: 0.035, dur: 0.05,
        gain: 0.36 * v, atk: 0.002, hold: 0.012, rel: 0.038, filter: 'lowpass', cutoff: 5200, q: 0.8 });
      tone({ t, type: 'triangle', f0: 2640 * r, dur: 0.04, gain: 0.11 * v, atk: 0.002, rel: 0.03 });
      break;

    case 'confirm':
      // Two-step rising chirp: the "you picked it" sound.
      tone({ t, type: 'square', f0: 880 * r, dur: 0.055, gain: 0.32 * v, atk: 0.002, hold: 0.02, rel: 0.04,
        filter: 'lowpass', cutoff: 5000, q: 0.8 });
      tone({ t: t + 0.055, type: 'square', f0: 1318.5 * r, dur: 0.12, gain: 0.36 * v, atk: 0.002, hold: 0.03, rel: 0.1,
        filter: 'lowpass', cutoff: 6000, q: 0.8 });
      tone({ t: t + 0.055, type: 'triangle', f0: 2637 * r, dur: 0.1, gain: 0.10 * v, atk: 0.002, rel: 0.09 });
      break;

    case 'cancel':
      // Two-step falling chirp, duller than confirm.
      tone({ t, type: 'square', f0: 660 * r, dur: 0.05, gain: 0.30 * v, atk: 0.002, hold: 0.018, rel: 0.035,
        filter: 'lowpass', cutoff: 2600, q: 0.9 });
      tone({ t: t + 0.05, type: 'square', f0: 392 * r, dur: 0.13, gain: 0.32 * v, atk: 0.002, hold: 0.03, rel: 0.11,
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
          tone({ t: r0 + i * 0.045, type: 'square', f0: f, dur: 0.045, gain: 0.26 * v,
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
      hiss({ t, filter: 'bandpass', cutoff: 2400, q: 1.4, gain: 0.44 * v, atk: 0.001, hold: 0.006, rel: 0.035, hard: true });
      tone({ t, type: 'sine', f0: 190 * r, f1: 70 * r, glide: 0.07, dur: 0.11,
        gain: 0.42 * v, atk: 0.002, hold: 0.012, rel: 0.09 });
      break;
    }

    case 'whoosh': {
      const dur = Math.max(0.15, opts.duration || 0.42);
      const t2 = t + dur * 0.45;
      hiss({ t, filter: 'bandpass', cutoff: 320, cutoff1: 2600, fglide: dur * 0.45,
        q: 1.1, gain: 0.28 * v, atk: dur * 0.4, hold: 0, rel: 0.02 });
      hiss({ t: t2, filter: 'bandpass', cutoff: 2600, cutoff1: 280, fglide: dur * 0.55,
        q: 1.1, gain: 0.28 * v, atk: 0.01, hold: 0, rel: dur * 0.55 });
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
      hiss({ t, filter: 'bandpass', cutoff: 3100, q: 1.1, gain: 0.38 * v, atk: 0.001, hold: 0.007, rel: 0.03, hard: true });
      tone({ t, type: 'triangle', f0: 240 * r, f1: 150 * r, glide: 0.03, dur: 0.05,
        gain: 0.2 * v, atk: 0.001, hold: 0.008, rel: 0.04 });
      break;
    }

    /* ---------------- comedy foley pack ---------------- */

    case 'boing': {
      // Jaw-harp spring: a buzzy saw through a narrow bandpass whose centre is
      // wobbled by a slowing LFO, over a sine body with a decaying vibrato.
      const d = 0.62;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(104 * r, t);
      o.frequency.exponentialRampToValueAtTime(152 * r, t + d);
      const bp = filt('bandpass', 760 * r, 8);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(17, t);
      lfo.frequency.exponentialRampToValueAtTime(8, t + d);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(560 * r, t);
      depth.gain.exponentialRampToValueAtTime(20, t + d);
      lfo.connect(depth); depth.connect(bp.frequency);
      const g = ctx.createGain();
      o.connect(bp); bp.connect(g); g.connect(sfxBus);
      const end = env(g.gain, t, 0.36 * v, 0.003, 0.02, d);
      o.start(t); o.stop(end + 0.03);
      lfo.start(t); lfo.stop(end + 0.03);
      const body = tone({ t, type: 'sine', f0: 210 * r, f1: 300 * r, dur: d, gain: 0.16 * v, atk: 0.003, rel: d });
      const vib = ctx.createOscillator();
      vib.frequency.value = 13;
      const vd = ctx.createGain();
      vd.gain.setValueAtTime(60 * r, t);
      vd.gain.exponentialRampToValueAtTime(1, t + d);
      vib.connect(vd); vd.connect(body.frequency);
      vib.start(t); vib.stop(t + d + 0.05);
      break;
    }

    case 'bonk': {
      // Hollow coconut-on-skull: fast falling sine, a wooden click, a ring.
      tone({ t, type: 'sine', f0: 640 * r, f1: 190 * r, glide: 0.06, dur: 0.17, gain: 0.42 * v, atk: 0.001, rel: 0.16 });
      tone({ t, type: 'triangle', f0: 1280 * r, f1: 900 * r, glide: 0.04, dur: 0.06, gain: 0.12 * v, atk: 0.001, rel: 0.05 });
      tone({ t, type: 'square', f0: 318 * r, dur: 0.14, gain: 0.07 * v, atk: 0.001, rel: 0.13,
        filter: 'bandpass', cutoff: 636 * r, q: 11 });
      hiss({ t, filter: 'bandpass', cutoff: 3000 * r, q: 2, gain: 0.2 * v, atk: 0.001, hold: 0.003, rel: 0.015, hard: true });
      break;
    }

    case 'plunk': {
      // Droplet into a mug: a rising sine blip with a bright ghost partial.
      tone({ t, type: 'sine', f0: 520 * r, f1: 1450 * r, glide: 0.06, dur: 0.14, gain: 0.34 * v, atk: 0.001, hold: 0.01, rel: 0.12 });
      tone({ t, type: 'sine', f0: 1040 * r, f1: 2600 * r, glide: 0.05, dur: 0.08, gain: 0.06 * v, atk: 0.001, rel: 0.07 });
      tone({ t, type: 'triangle', f0: 260 * r, dur: 0.035, gain: 0.1 * v, atk: 0.001, rel: 0.03 });
      break;
    }

    case 'pop': {
      // Bubble / cork: a very short upward sine chirp and a click.
      tone({ t, type: 'sine', f0: 380 * r, f1: 1500 * r, glide: 0.03, dur: 0.06, gain: 0.34 * v, atk: 0.001, rel: 0.05 });
      hiss({ t, filter: 'bandpass', cutoff: 2400 * r, q: 1, gain: 0.18 * v, atk: 0.001, hold: 0.002, rel: 0.012, hard: true });
      break;
    }

    case 'ding': {
      // Front-desk service bell. Higher and purer than `chime`, one strike.
      const f = 2637 * r;
      for (const [m, a] of [[1, 0.15], [1.004, 0.05], [2.32, 0.06], [4.25, 0.025], [6.8, 0.01]]) {
        tone({ t, type: 'sine', f0: f * m, dur: 1.6, gain: a * v, atk: 0.002, hold: 0.01, rel: 1.55 / Math.sqrt(m) });
      }
      hiss({ t, filter: 'highpass', cutoff: 6000, q: 0.7, gain: 0.06 * v, atk: 0.001, hold: 0.002, rel: 0.02, hard: true });
      break;
    }

    case 'success': {
      // Quick major arpeggio up to a sparkling top note. Smaller than fanfare.
      const notes = [1046.5, 1318.5, 1568, 2093];
      notes.forEach((f, i) => {
        const last = i === notes.length - 1;
        const len = last ? 0.5 : 0.1;
        tone({ t: t + i * 0.07, type: 'square', f0: f * r, dur: len, gain: 0.14 * v, atk: 0.003,
          hold: last ? 0.08 : 0.03, rel: last ? 0.42 : 0.07, filter: 'lowpass', cutoff: 5200, q: 0.8 });
        tone({ t: t + i * 0.07, type: 'triangle', f0: f * 2 * r, dur: len, gain: 0.05 * v, atk: 0.003, rel: len });
      });
      tone({ t: t + 0.26, type: 'sine', f0: 4186 * r, dur: 0.7, gain: 0.05 * v, atk: 0.003, rel: 0.7 });
      tone({ t: t + 0.32, type: 'sine', f0: 5274 * r, dur: 0.5, gain: 0.03 * v, atk: 0.003, rel: 0.5 });
      break;
    }

    case 'cheer': {
      // Small crowd "yaaay": formant-filtered saw voices sliding a -> ay, a
      // crowd-noise swell, and a scatter of claps.
      const dur = Math.max(0.6, opts.duration || 1.4);
      const rand = rng(11);
      for (let i = 0; i < 7; i++) crowdVoice(t + i * 0.022 + rand() * 0.03, (190 + ((i * 73) % 170)) * r, dur * (0.8 + rand() * 0.25), 0.075 * v, rand);
      hiss({ t, filter: 'bandpass', cutoff: 1200 * r, q: 0.8, gain: 0.08 * v, atk: 0.12, hold: dur * 0.4, rel: dur * 0.5 });
      for (let i = 0; i < 12; i++) clap(t + 0.18 + rand() * dur * 0.9, (0.1 + rand() * 0.08) * v, rand);
      break;
    }

    case 'applause': {
      // Polite office applause: dense random claps over a hiss bed, swelling
      // in and thinning out. Honours opts.duration.
      const dur = Math.max(0.8, opts.duration || 2.6);
      const rand = rng(29);
      const n = Math.round(dur * 42);
      for (let i = 0; i < n; i++) {
        const u = rand();
        const at = u * dur;
        const shape = Math.min(1, at / 0.25) * (at > dur * 0.6 ? 1 - (at - dur * 0.6) / (dur * 0.45) : 1);
        clap(t + at, (0.05 + rand() * 0.08) * Math.max(0.08, shape) * v, rand);
      }
      hiss({ t, filter: 'bandpass', cutoff: 2000 * r, q: 0.5, gain: 0.06 * v, atk: 0.25, hold: Math.max(0, dur - 0.9), rel: 0.65 });
      break;
    }

    case 'rimshot': {
      // Ba-dum-tss.
      hiss({ t, filter: 'bandpass', cutoff: 2000 * r, q: 0.8, gain: 0.3 * v, atk: 0.001, hold: 0.01, rel: 0.1 });
      tone({ t, type: 'triangle', f0: 330 * r, f1: 250 * r, glide: 0.05, dur: 0.08, gain: 0.15 * v, atk: 0.001, rel: 0.08 });
      const t2 = t + 0.15;
      tone({ t: t2, type: 'sine', f0: 180 * r, f1: 118 * r, glide: 0.12, dur: 0.22, gain: 0.38 * v, atk: 0.001, rel: 0.21 });
      hiss({ t: t2, filter: 'bandpass', cutoff: 1500 * r, q: 0.8, gain: 0.16 * v, atk: 0.001, hold: 0.006, rel: 0.08 });
      const t3 = t + 0.42;
      hiss({ t: t3, filter: 'highpass', cutoff: 6500 * r, q: 0.6, gain: 0.2 * v, atk: 0.002, hold: 0.05, rel: 0.95 });
      hiss({ t: t3, filter: 'bandpass', cutoff: 9000 * r, q: 2, gain: 0.07 * v, atk: 0.002, hold: 0.03, rel: 0.7 });
      tone({ t: t3, type: 'sine', f0: 120 * r, f1: 45 * r, glide: 0.1, dur: 0.18, gain: 0.34 * v, atk: 0.001, rel: 0.17 });
      hiss({ t: t3, filter: 'bandpass', cutoff: 2000 * r, q: 0.8, gain: 0.22 * v, atk: 0.001, hold: 0.01, rel: 0.1 });
      break;
    }

    case 'sadTrombone': {
      // Wah, wah, wah, waaaaah — plunger-muted slide down by semitones, the
      // last one held with a wobbling vibrato.
      const seq = [[0, 233.08, 0.36], [0.42, 220, 0.36], [0.84, 207.65, 0.36], [1.26, 196, 1.15]];
      seq.forEach(([d, f, len], i) => wahNote(t + d, f * r, len, 0.3 * v, i === seq.length - 1));
      break;
    }

    case 'slideWhistle':
    case 'slideDown': {
      const up = id === 'slideWhistle';
      const dur = Math.max(0.2, opts.duration || 0.6);
      const o = tone({ t, type: 'sine', f0: (up ? 480 : 1900) * r, f1: (up ? 1900 : 420) * r, dur,
        gain: 0.26 * v, atk: 0.03, hold: dur - 0.08, rel: 0.06 });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lg = ctx.createGain();
      lg.gain.value = 18;
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start(t); lfo.stop(t + dur + 0.05);
      hiss({ t, filter: 'bandpass', cutoff: (up ? 900 : 3000) * r, cutoff1: (up ? 3000 : 900) * r, fglide: dur,
        q: 3, gain: 0.03 * v, atk: 0.03, hold: dur - 0.08, rel: 0.06 });
      break;
    }

    case 'recordScratch': {
      // Needle dragged back, then forward: two opposed filter sweeps.
      hiss({ t, filter: 'bandpass', cutoff: 2600 * r, cutoff1: 600 * r, fglide: 0.11, q: 2.5, gain: 0.3 * v, atk: 0.005, hold: 0.06, rel: 0.05 });
      tone({ t, type: 'sawtooth', f0: 380 * r, f1: 110 * r, glide: 0.12, dur: 0.12, gain: 0.12 * v, atk: 0.004, hold: 0.06, rel: 0.05,
        filter: 'lowpass', cutoff: 1500, q: 1.5 });
      const t2 = t + 0.13;
      hiss({ t: t2, filter: 'bandpass', cutoff: 700 * r, cutoff1: 3200 * r, fglide: 0.09, q: 2.5, gain: 0.26 * v, atk: 0.005, hold: 0.05, rel: 0.06 });
      tone({ t: t2, type: 'sawtooth', f0: 120 * r, f1: 420 * r, glide: 0.1, dur: 0.1, gain: 0.1 * v, atk: 0.004, hold: 0.05, rel: 0.05,
        filter: 'lowpass', cutoff: 1500, q: 1.5 });
      break;
    }

    case 'gasp': {
      // Crowd sharp inhale: rising breathy bands plus a few voiced "hah"s.
      hiss({ t, filter: 'bandpass', cutoff: 1100 * r, cutoff1: 2100 * r, fglide: 0.3, q: 1.8, gain: 0.22 * v, atk: 0.07, hold: 0.12, rel: 0.14 });
      hiss({ t, filter: 'bandpass', cutoff: 2800 * r, q: 3, gain: 0.08 * v, atk: 0.07, hold: 0.1, rel: 0.12 });
      const rand = rng(5);
      for (let i = 0; i < 4; i++) {
        tone({ t: t + rand() * 0.04, type: 'sawtooth', f0: (260 + i * 37) * r, f1: (330 + i * 40) * r, dur: 0.28,
          gain: 0.03 * v, atk: 0.06, hold: 0.08, rel: 0.14, filter: 'bandpass', cutoff: 1500 * r, q: 4 });
      }
      break;
    }

    case 'chomp': {
      // Dog bite: a hard tooth snap, a clack, a jaw thump and a wet crunch.
      hiss({ t, filter: 'highpass', cutoff: 2200 * r, q: 0.8, gain: 0.45 * v, atk: 0.001, hold: 0.008, rel: 0.03, hard: true });
      tone({ t, type: 'square', f0: 1650 * r, dur: 0.04, gain: 0.22 * v, atk: 0.001, rel: 0.035, filter: 'bandpass', cutoff: 1650 * r, q: 6 });
      tone({ t, type: 'square', f0: 2400 * r, dur: 0.03, gain: 0.1 * v, atk: 0.001, rel: 0.025, filter: 'bandpass', cutoff: 2400 * r, q: 6 });
      tone({ t, type: 'sine', f0: 170 * r, f1: 55 * r, glide: 0.08, dur: 0.14, gain: 0.42 * v, atk: 0.002, rel: 0.12 });
      hiss({ t: t + 0.012, filter: 'bandpass', cutoff: 900 * r, cutoff1: 380 * r, fglide: 0.09, q: 2, gain: 0.2 * v, atk: 0.004, hold: 0.03, rel: 0.08 });
      break;
    }

    case 'thud': {
      // A body, a box, or a binder hitting carpet. Dull and short, no ring.
      tone({ t, type: 'sine', f0: 95 * r, f1: 38 * r, glide: 0.2, dur: 0.35, gain: 0.5 * v, atk: 0.002, hold: 0.02, rel: 0.32 });
      tone({ t, type: 'triangle', f0: 190 * r, f1: 80 * r, glide: 0.06, dur: 0.08, gain: 0.12 * v, atk: 0.002, rel: 0.07 });
      hiss({ t, filter: 'lowpass', cutoff: 700 * r, cutoff1: 200, fglide: 0.15, q: 0.9, gain: 0.25 * v, atk: 0.002, hold: 0.02, rel: 0.15 });
      break;
    }

    case 'beep': {
      // Plain 1 kHz beep. Honours opts.duration, so it doubles as a censor bleep.
      const dur = Math.max(0.04, opts.duration || 0.16);
      tone({ t, type: 'sine', f0: 1000 * r, dur, gain: 0.22 * v, atk: 0.004, hold: Math.max(0, dur - 0.014), rel: 0.01 });
      tone({ t, type: 'square', f0: 1000 * r, dur, gain: 0.05 * v, atk: 0.004, hold: Math.max(0, dur - 0.014), rel: 0.01,
        filter: 'lowpass', cutoff: 3000, q: 0.7 });
      break;
    }

    case 'honk': {
      // Clown / bike horn: two detuned reedy saws scooping up into a nasal band.
      const d = 0.28;
      const g = ctx.createGain();
      const bp = filt('bandpass', 1100 * r, 2.5);
      const lp = filt('lowpass', 3200, 0.7);
      bp.connect(lp); lp.connect(g); g.connect(sfxBus);
      const oscs = [440, 446].map((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.86 * r, t);
        o.frequency.exponentialRampToValueAtTime(f * r, t + 0.04);
        o.frequency.exponentialRampToValueAtTime(f * 0.97 * r, t + d);
        o.connect(bp);
        return o;
      });
      const end = env(g.gain, t, 0.5 * v, 0.01, d * 0.6, d * 0.4);
      for (const o of oscs) { o.start(t); o.stop(end + 0.03); }
      break;
    }

    case 'sparkle': {
      // Magic twinkle: a quick run of high pentatonic pips and a hiss shimmer.
      const steps = [0, 4, 7, 12, 16, 19, 24, 21, 28];
      steps.forEach((k, i) => {
        const f = 2093 * Math.pow(2, k / 12) * r;
        tone({ t: t + i * 0.045, type: 'sine', f0: f, dur: 0.25, gain: 0.09 * v, atk: 0.002, rel: 0.25 });
        tone({ t: t + i * 0.045, type: 'triangle', f0: f * 2, dur: 0.1, gain: 0.025 * v, atk: 0.002, rel: 0.1 });
      });
      hiss({ t, filter: 'highpass', cutoff: 8000, q: 0.7, gain: 0.04 * v, atk: 0.05, hold: 0.2, rel: 0.3 });
      break;
    }

    case 'drumroll': {
      // Snare roll that builds for opts.duration seconds (default 2), then a
      // cymbal crash + kick on the button.
      const dur = Math.max(0.4, opts.duration || 2);
      let i = 0;
      for (let at = 0; at < dur; at += 0.032, i++) {
        const lvl = (0.07 + 0.15 * (at / dur)) * (i % 2 ? 0.78 : 1) * v;
        hiss({ t: t + at, filter: 'bandpass', cutoff: 2200 * r, q: 0.8, gain: lvl, atk: 0.001, hold: 0.004, rel: 0.05 });
      }
      const te = t + dur;
      hiss({ t: te, filter: 'highpass', cutoff: 5500 * r, q: 0.5, gain: 0.22 * v, atk: 0.002, hold: 0.05, rel: 1.2 });
      hiss({ t: te, filter: 'bandpass', cutoff: 3500 * r, q: 1.5, gain: 0.08 * v, atk: 0.002, hold: 0.03, rel: 0.9 });
      hiss({ t: te, filter: 'bandpass', cutoff: 2000 * r, q: 0.8, gain: 0.26 * v, atk: 0.001, hold: 0.01, rel: 0.12 });
      tone({ t: te, type: 'sine', f0: 120 * r, f1: 45 * r, glide: 0.1, dur: 0.2, gain: 0.4 * v, atk: 0.001, rel: 0.19 });
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
 * A music track. Pattern tokens: '.', 'x' (noise hit), 'A3', 'A3:4' (4 steps
 * long), 'A3+C4+E4:6' (chord). A track shorter than the cue repeats, so a
 * one-bar drum pattern can sit under an eight-bar melody.
 * @typedef {Object} MusicTrack
 * @property {string[]} pat
 * @property {number} gain
 * @property {OscillatorType|'pulse'} [wave='triangle']
 * @property {boolean} [noise] play noise hits ('x') instead of notes
 * @property {number} [atk] seconds
 * @property {number} [hold] fixed hold in seconds (default: fills the note)
 * @property {number} [rel] seconds
 * @property {boolean} [hard] linear release (gated)
 * @property {BiquadFilterType} [filter]
 * @property {number} [cutoff]
 * @property {number} [q]
 * @property {number} [detune] cents
 * @property {number} [transpose] semitones
 * @property {number} [glide] start at freq * glide, sliding to the note (kicks, scoops)
 * @property {number} [glideTime=0.05] seconds
 * @property {number} [vib] vibrato depth in cents (fades in)
 * @property {number} [vibRate=5.5] Hz
 */

/**
 * @typedef {Object} MusicDef
 * @property {number} stepDur seconds per sequencer step
 * @property {boolean} loop
 * @property {number} [swing=0] fraction of a step to delay every odd step
 * @property {number} [level=1] cue loudness trim
 * @property {MusicTrack[]} tracks
 */

/* Percussion building blocks shared by the cues. One-bar patterns loop. */

/** @param {string} p @param {number} [gain] @returns {MusicTrack} */
const KICK = (p, gain = 0.3) => ({ wave: 'sine', gain, atk: 0.002, hold: 0.02, rel: 0.13, glide: 3.4, glideTime: 0.06, pat: pat(p) });
/** @param {string} p @param {number} [gain] @returns {MusicTrack} */
const HAT = (p, gain = 0.04) => ({ noise: true, gain, atk: 0.001, rel: 0.025, filter: 'highpass', cutoff: 7200, q: 0.7, pat: pat(p) });
/** @param {string} p @param {number} [gain] @param {Object} [o] overrides @returns {MusicTrack} */
const SNARE = (p, gain = 0.07, o = {}) => ({ noise: true, gain, atk: 0.001, rel: 0.09, filter: 'bandpass', cutoff: 1900, q: 0.7, ...o, pat: pat(p) });

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

  // Bouncy major-key office pop. C major, 124bpm, I-vi-IV-V.
  happy: {
    stepDur: 60 / 124 / 2,
    loop: true,
    tracks: [
      {
        wave: 'triangle', gain: 0.46, atk: 0.005, rel: 0.08, filter: 'lowpass', cutoff: 800, q: 1,
        pat: pat(`
          C2 . G2 . C3 . G2 .
          A1 . E2 . A2 . E2 .
          F1 . C2 . F2 . C2 .
          G1 . D2 . G2 . B1 .`),
      },
      {
        wave: 'pulse', gain: 0.13, atk: 0.003, hold: 0.05, rel: 0.06, filter: 'lowpass', cutoff: 2400, q: 0.8,
        pat: pat(`
          . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4
          . A3+C4+E4 . A3+C4+E4 . A3+C4+E4 . A3+C4+E4
          . A3+C4+F4 . A3+C4+F4 . A3+C4+F4 . A3+C4+F4
          . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4`),
      },
      {
        wave: 'square', gain: 0.14, atk: 0.004, rel: 0.1, filter: 'lowpass', cutoff: 3200, q: 0.8, vib: 8,
        pat: pat(`
          E5:2 . G5 C6 G5:2 . E5 D5
          C5:2 . E5 A5 E5:2 . C5 B4
          A4:2 . C5 F5 A5:2 . G5 F5
          G4:2 . B4 D5 G5:3 . . .`),
      },
      KICK('A1 . . . A1 . . .'),
      SNARE('. . x . . . x .', 0.06),
      HAT('x x x x x x x x', 0.032),
    ],
  },

  // THE muzak. Smooth-jazz elevator: rootless Rhodes voicings, walking bass,
  // a breathy vibrato flute, brushes. C major, 92bpm, swung eighths.
  breezy: {
    stepDur: 60 / 92 / 2,
    loop: true,
    swing: 0.16,
    tracks: [
      {
        wave: 'triangle', gain: 0.16, atk: 0.012, rel: 0.5, filter: 'lowpass', cutoff: 1900, q: 0.7, detune: 6,
        pat: pat(`
          E3+G3+B3+D4:3 . . . . E3+G3+B3+D4:3 . .
          G3+B3+C4+E4:3 . . . . G3+B3+C4+E4:3 . .
          F3+A3+C4+E4:3 . . . . F3+A3+C4+E4:3 . .
          F3+B3+E4:3 . . . . F3+B3+E4:3 . .
          G3+B3+D4+E4:3 . . . . G3+B3+D4+E4:3 . .
          G3+C#4+E4:3 . . . . G3+C#4+E4:3 . .
          F3+A3+C4+E4:3 . . . . F3+A3+C4+E4:3 . .
          F3+B3+E4:3 . . . . F3+B3+E4:3 . .`),
      },
      {
        wave: 'triangle', gain: 0.46, atk: 0.008, rel: 0.12, filter: 'lowpass', cutoff: 650, q: 1,
        pat: pat(`
          C2:2 . E2:2 . G2:2 . A2:2 .
          A1:2 . C2:2 . E2:2 . C#2:2 .
          D2:2 . F2:2 . A2:2 . Ab2:2 .
          G2:2 . F2:2 . D2:2 . B1:2 .
          E2:2 . G2:2 . B2:2 . Bb2:2 .
          A2:2 . G2:2 . E2:2 . C#2:2 .
          D2:2 . F2:2 . A2:2 . C2:2 .
          G1:2 . A1:2 . B1:2 . D2:2 .`),
      },
      {
        wave: 'sine', gain: 0.2, atk: 0.02, rel: 0.3, vib: 14, vibRate: 5,
        pat: pat(`
          . . E5:2 . G5:2 . B5:2 .
          A5:4 . . . G5 E5 C5 .
          D5:3 . . E5 F5:3 . . A5
          G5:5 . . . . . D5 F5
          E5 G5 B5:3 . . D5 E5 G5
          A5:2 . G5 . E5 . C#5 .
          D5:2 . F5 A5 C6:4 . . .
          B5:2 . A5 . G5:4 . . .`),
      },
      HAT('x . x x x . x x', 0.028),
      SNARE('. . x . . . x .', 0.04, { cutoff: 2600, q: 4, rel: 0.03 }),
    ],
  },

  // Upbeat stock-video "synergy". D major, 116bpm, I-V-vi-IV, plucky
  // arpeggios, claps, a hopeful whistled hook.
  corporate: {
    stepDur: 60 / 116 / 2,
    loop: true,
    tracks: [
      {
        wave: 'pulse', gain: 0.1, atk: 0.002, rel: 0.07, filter: 'lowpass', cutoff: 3000, q: 0.8,
        pat: pat(`
          D4 A4 F#5 A4 D5 A4 F#5 A4
          C#4 A4 E5 A4 C#5 A4 E5 A4
          D4 B4 F#5 B4 D5 B4 F#5 B4
          D4 B4 G5 B4 D5 B4 G5 B4`),
      },
      {
        wave: 'triangle', gain: 0.4, atk: 0.004, hold: 0.08, rel: 0.06, filter: 'lowpass', cutoff: 750, q: 1,
        pat: pat(`
          D2 D2 D3 D2 D2 D2 D3 D2
          A1 A1 A2 A1 A1 A1 A2 A1
          B1 B1 B2 B1 B1 B1 B2 B1
          G1 G1 G2 G1 G1 G1 G2 G1`),
      },
      {
        wave: 'sawtooth', gain: 0.07, atk: 0.3, rel: 0.6, filter: 'lowpass', cutoff: 1100, q: 0.7, detune: 7,
        pat: pat(`
          D4+F#4+A4:8 . . . . . . .
          C#4+E4+A4:8 . . . . . . .
          D4+F#4+B4:8 . . . . . . .
          D4+G4+B4:8 . . . . . . .`),
      },
      {
        wave: 'sine', gain: 0.17, atk: 0.015, rel: 0.2, vib: 10,
        pat: pat(`
          F#5:2 . A5:2 . B5 A5 F#5:2 .
          E5:6 . . . . . . .
          F#5:2 . A5:2 . D6 C#6 B5:2 .
          B5:4 . . . A5:4 . . .`),
      },
      KICK('A1 . . . A1 . . .'),
      SNARE('. . x . . . x .', 0.07, { cutoff: 1300, q: 1.2, rel: 0.07 }),
      HAT('. x . x . x . x', 0.04),
    ],
  },

  // Sneaky pizzicato over a staccato chromatic walking bass. E minor, 100bpm,
  // lightly swung, finger snaps on 2 and 4.
  intrigue: {
    stepDur: 60 / 100 / 2,
    loop: true,
    level: 1.45,
    swing: 0.1,
    tracks: [
      {
        wave: 'triangle', gain: 0.5, atk: 0.003, hold: 0.06, rel: 0.07, filter: 'lowpass', cutoff: 800, q: 1,
        pat: pat(`
          E2 . G2 . A2 . Bb2 .
          B2 . A2 . G2 . E2 .
          A1 . C2 . E2 . C2 .
          B1 . D#2 . F#2 . D#2 .`),
      },
      {
        wave: 'triangle', gain: 0.2, atk: 0.002, hold: 0.01, rel: 0.09, filter: 'lowpass', cutoff: 2600, q: 0.8,
        pat: pat(`
          . . E5 . . F#5 G5 .
          . . F#5 . . E5 D#5 .
          . . C5 . . B4 A4 .
          B4 . . . D#5 . F#5 .`),
      },
      {
        wave: 'pulse', gain: 0.09, atk: 0.002, hold: 0.02, rel: 0.05, filter: 'lowpass', cutoff: 1600, q: 0.8,
        pat: pat(`
          . E3+G3+B3 . . . E3+G3+B3 . .
          . E3+G3+B3 . . . E3+G3+B3 . .
          . A3+C4+E4 . . . A3+C4+E4 . .
          . B3+D#4+F#4 . . . B3+D#4+A4 . .`),
      },
      {
        wave: 'square', gain: 0.08, atk: 0.06, rel: 0.2, filter: 'lowpass', cutoff: 1300, q: 1, vib: 10,
        pat: pat(`
          . . . . . . . .
          . . . . . . . .
          E4:4 . . . F#4:2 . G4:2 .
          F#4:8 . . . . . . .`),
      },
      HAT('. x . x . x . x', 0.03),
      SNARE('. . x . . . x .', 0.045, { cutoff: 2800, q: 3, rel: 0.03 }),
    ],
  },

  // Oompah polka: tuba, offbeat accordion-ish stabs, a bassoon doubled by a
  // clarinet. F major, 2/4, 138bpm.
  goofy: {
    stepDur: 60 / 138 / 2,
    loop: true,
    tracks: [
      {
        wave: 'sawtooth', gain: 0.4, atk: 0.015, rel: 0.08, filter: 'lowpass', cutoff: 480, q: 2, glide: 0.92, glideTime: 0.05,
        pat: pat(`
          F2:2 . C2:2 .  F2:2 . C2:2 .
          C2:2 . G2:2 .  C2:2 . G2:2 .
          C2:2 . G2:2 .  C2:2 . G2:2 .
          F2:2 . C2:2 .  F2:2 . C2:2 .`),
      },
      {
        wave: 'square', gain: 0.1, atk: 0.003, hold: 0.04, rel: 0.05, filter: 'lowpass', cutoff: 1800, q: 0.8,
        pat: pat(`
          . A3+C4+F4 . A3+C4+F4  . A3+C4+F4 . A3+C4+F4
          . Bb3+C4+E4 . Bb3+C4+E4  . Bb3+C4+E4 . Bb3+C4+E4
          . Bb3+C4+E4 . Bb3+C4+E4  . Bb3+C4+E4 . Bb3+C4+E4
          . A3+C4+F4 . A3+C4+F4  . A3+C4+F4 . A3+C4+F4`),
      },
      {
        wave: 'pulse', gain: 0.16, atk: 0.01, rel: 0.07, filter: 'lowpass', cutoff: 1200, q: 2, transpose: -12, glide: 0.97, glideTime: 0.03,
        pat: pat(`
          C5 A4 F4 A4  C5:2 . D5 C5
          Bb4 G4 E4 G4  Bb4:2 . C5 Bb4
          E4 G4 Bb4 D5  C5:2 . Bb4 G4
          F5 . C5 .  F4:2 . . .`),
      },
      {
        wave: 'triangle', gain: 0.05, atk: 0.01, rel: 0.07, filter: 'lowpass', cutoff: 3000, q: 0.8,
        pat: pat(`
          C5 A4 F4 A4  C5:2 . D5 C5
          Bb4 G4 E4 G4  Bb4:2 . C5 Bb4
          E4 G4 Bb4 D5  C5:2 . Bb4 G4
          F5 . C5 .  F4:2 . . .`),
      },
      SNARE('. x . x', 0.04, { cutoff: 2200, rel: 0.05 }),
    ],
  },

  // Slow, lonely, minor. Piano-ish arpeggio, low drone, a vibrato line that
  // keeps giving up. D minor, 64bpm, i-VI-iv-V.
  sad: {
    stepDur: 60 / 64 / 2,
    loop: true,
    tracks: [
      {
        wave: 'triangle', gain: 0.13, atk: 0.01, rel: 0.5, filter: 'lowpass', cutoff: 1800, q: 0.7,
        pat: pat(`
          D3 A3 D4 F4 A4 F4 D4 A3
          Bb2 F3 Bb3 D4 F4 D4 Bb3 F3
          G2 D3 G3 Bb3 D4 Bb3 G3 D3
          A2 E3 A3 C#4 E4 C#4 A3 E3`),
      },
      {
        wave: 'sine', gain: 0.28, atk: 0.2, rel: 0.8,
        pat: pat(`
          D2:8 . . . . . . .
          Bb1:8 . . . . . . .
          G1:8 . . . . . . .
          A1:8 . . . . . . .`),
      },
      {
        wave: 'sine', gain: 0.2, atk: 0.06, rel: 0.5, vib: 12, vibRate: 4.5,
        pat: pat(`
          . . . . A4:3 . . G4
          F4:6 . . . . . E4 D4
          D4:4 . . . Bb3 . C4 D4
          C#4:8 . . . . . . .`),
      },
    ],
  },

  // Heroic anthem that LOOPS (unlike the one-shot `victory`). Bb major,
  // 108bpm, brass rhythm, timpani, march snare.
  triumph: {
    stepDur: 60 / 108 / 2,
    loop: true,
    tracks: [
      {
        wave: 'sawtooth', gain: 0.13, atk: 0.02, rel: 0.15, filter: 'lowpass', cutoff: 1700, q: 0.7, detune: 6,
        pat: pat(`
          D4+F4+Bb4:3 . . D4+F4+Bb4 D4+F4+Bb4:4 . . .
          C4+F4+A4:3 . . C4+F4+A4 C4+F4+A4:4 . . .
          D4+G4+Bb4:3 . . D4+G4+Bb4 D4+G4+Bb4:4 . . .
          Eb4+G4+Bb4:3 . . Eb4+G4+Bb4 Eb4+G4+Bb4:4 . . .
          D4+F4+Bb4:3 . . D4+F4+Bb4 D4+F4+Bb4:4 . . .
          C4+F4+A4:3 . . C4+F4+A4 C4+F4+A4:4 . . .
          Eb4+G4+Bb4:3 . . Eb4+G4+Bb4 Eb4+G4+Bb4:4 . . .
          C4+F4+A4:3 . . C4+F4+A4 C4+F4+A4:4 . . .`),
      },
      {
        wave: 'triangle', gain: 0.46, atk: 0.006, rel: 0.15, filter: 'lowpass', cutoff: 700, q: 1,
        pat: pat(`
          Bb1:3 . . Bb1 Bb1:4 . . .
          A1:3 . . A1 A1:4 . . .
          G1:3 . . G1 G1:4 . . .
          Eb2:3 . . Eb2 Eb2:4 . . .
          Bb1:3 . . Bb1 Bb1:4 . . .
          F2:3 . . F2 F2:4 . . .
          Eb2:3 . . Eb2 Eb2:4 . . .
          F2:3 . . F2 F2:4 . . .`),
      },
      {
        wave: 'sawtooth', gain: 0.15, atk: 0.015, rel: 0.12, filter: 'lowpass', cutoff: 2800, q: 0.8, vib: 10,
        pat: pat(`
          F4:3 . . Bb4 D5:4 . . .
          C5:3 . . A4 F4:4 . . .
          G4:2 . Bb4:2 . D5:2 . G5:2 .
          F5:6 . . . . . Eb5 D5
          D5:3 . . C5 Bb4:2 . D5:2 .
          C5:3 . . A4 F4:2 . A4:2 .
          Bb4:2 . Eb5:2 . G5:2 . Bb5:2 .
          A5:6 . . . . . F5 .`),
      },
      KICK('A1 . . . . . . .', 0.32),
      SNARE('. . x . . . x x', 0.055),
    ],
  },

  // Music-box flashback shimmer for lore / memory scenes. 3/4, 72bpm,
  // descending maj7 / min7 chain.
  dreamy: {
    stepDur: 60 / 72 / 2,
    loop: true,
    tracks: [
      {
        wave: 'triangle', gain: 0.14, atk: 0.002, hold: 0.02, rel: 0.9, filter: 'lowpass', cutoff: 5000, q: 0.7,
        pat: pat(`
          F5 A5 C6 E6 C6 A5
          E5 G5 B5 D6 B5 G5
          D5 F5 A5 C6 A5 F5
          C5 E5 G5 B5 G5 E5`),
      },
      {
        wave: 'sine', gain: 0.04, atk: 0.002, hold: 0.01, rel: 1.0, transpose: 12,
        pat: pat(`
          F5 . . E6 . .
          E5 . . D6 . .
          D5 . . C6 . .
          C5 . . B5 . .`),
      },
      {
        wave: 'triangle', gain: 0.12, atk: 0.5, rel: 1.0, filter: 'lowpass', cutoff: 1200, q: 0.7, detune: 8,
        pat: pat(`
          F3+A3+E4:6 . . . . .
          E3+G3+D4:6 . . . . .
          D3+F3+C4:6 . . . . .
          C3+E3+B3:6 . . . . .`),
      },
      {
        wave: 'sine', gain: 0.22, atk: 0.1, rel: 0.8,
        pat: pat(`
          F2:6 . . . . .
          E2:6 . . . . .
          D2:6 . . . . .
          C2:6 . . . . .`),
      },
      {
        wave: 'sine', gain: 0.1, atk: 0.12, rel: 0.6, vib: 10, transpose: -12,
        pat: pat(`
          A5:6 . . . . .
          G5:6 . . . . .
          F5:3 . . A5:3 . .
          E5:6 . . . . .`),
      },
    ],
  },

  // 80s synth-pop: octave-bouncing saw bass, detuned stabs, four-on-the-floor
  // and a big gated snare. A minor, 118bpm, vi-IV-I-V.
  party: {
    stepDur: 60 / 118 / 2,
    loop: true,
    level: 1.3,
    tracks: [
      {
        wave: 'sawtooth', gain: 0.3, atk: 0.003, hold: 0.08, rel: 0.05, filter: 'lowpass', cutoff: 900, q: 3,
        pat: pat(`
          A1 A2 A1 A2 A1 A2 A1 A2
          F1 F2 F1 F2 F1 F2 F1 F2
          C2 C3 C2 C3 C2 C3 C2 C3
          G1 G2 G1 G2 G1 G2 G1 G2`),
      },
      {
        wave: 'square', gain: 0.1, atk: 0.003, rel: 0.12, filter: 'lowpass', cutoff: 3200, q: 0.8, detune: 10,
        pat: pat(`
          A3+C4+E4 . . A3+C4+E4 . . A3+C4+E4 .
          A3+C4+F4 . . A3+C4+F4 . . A3+C4+F4 .
          G3+C4+E4 . . G3+C4+E4 . . G3+C4+E4 .
          G3+B3+D4 . . G3+B3+D4 . . G3+B3+D4 .`),
      },
      {
        wave: 'sawtooth', gain: 0.13, atk: 0.01, rel: 0.12, filter: 'lowpass', cutoff: 3600, q: 0.8, detune: 9, vib: 8,
        pat: pat(`
          A5:2 . G5 . E5:2 . D5 C5
          C5:3 . . A4 C5:2 . F5:2 .
          E5:2 . G5 . C6:2 . B5 G5
          D5:4 . . . B4 . D5 G5`),
      },
      KICK('A1 . A1 . A1 . A1 .', 0.32),
      SNARE('. . x . . . x .', 0.1, { cutoff: 1500, q: 0.5, hold: 0.1, rel: 0.02, hard: true }),
      HAT('. x . x . x . x', 0.03),
    ],
  },

  // Original celebratory birthday-party loop (deliberately NOT the "Happy
  // Birthday to You" tune). G major, 4/4, 132bpm, chiptune lead + glock.
  birthday: {
    stepDur: 60 / 132 / 2,
    loop: true,
    tracks: [
      {
        wave: 'square', gain: 0.14, atk: 0.004, rel: 0.1, filter: 'lowpass', cutoff: 4200, q: 0.8,
        pat: pat(`
          D5 G5 B5:2 . G5 A5 B5 .
          C6:3 . . B5 A5 G5 E5 G5
          F#5 . A5 . D6:2 . C6 A5
          B5:2 . A5 . G5:4 . . .
          E5 G5 B5:2 . E6 D6 B5 .
          C6:2 . E6:2 . C6 B5 A5 G5
          A5:2 . F#5 A5 D6:2 . C6 A5
          G5:2 . D5 . G5 B5 D6 G6`),
      },
      {
        wave: 'sine', gain: 0.05, atk: 0.002, rel: 0.4, transpose: 12,
        pat: pat(`
          D5 G5 B5:2 . G5 A5 B5 .
          C6:3 . . B5 A5 G5 E5 G5
          F#5 . A5 . D6:2 . C6 A5
          B5:2 . A5 . G5:4 . . .
          E5 G5 B5:2 . E6 D6 B5 .
          C6:2 . E6:2 . C6 B5 A5 G5
          A5:2 . F#5 A5 D6:2 . C6 A5
          G5:2 . D5 . G5 B5 D6 G6`),
      },
      {
        wave: 'triangle', gain: 0.44, atk: 0.005, rel: 0.08, filter: 'lowpass', cutoff: 800, q: 1,
        pat: pat(`
          G1 . D2 . G2 . D2 .
          C2 . G2 . C3 . G2 .
          D2 . A2 . D3 . A2 .
          G1 . D2 . G2 . D2 .
          E2 . B2 . E3 . B2 .
          C2 . G2 . C3 . G2 .
          D2 . A2 . D3 . A2 .
          G1 . D2 . G2 . D2 .`),
      },
      {
        wave: 'pulse', gain: 0.1, atk: 0.003, hold: 0.05, rel: 0.06, filter: 'lowpass', cutoff: 2400, q: 0.8,
        pat: pat(`
          . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4
          . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4
          . A3+D4+F#4 . A3+D4+F#4 . A3+D4+F#4 . A3+D4+F#4
          . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4
          . B3+E4+G4 . B3+E4+G4 . B3+E4+G4 . B3+E4+G4
          . C4+E4+G4 . C4+E4+G4 . C4+E4+G4 . C4+E4+G4
          . A3+D4+F#4 . A3+D4+F#4 . A3+D4+F#4 . A3+D4+F#4
          . B3+D4+G4 . B3+D4+G4 . B3+D4+G4 . B3+D4+G4`),
      },
      KICK('A1 . . . A1 . . .'),
      SNARE('. . x . . . x .', 0.07, { cutoff: 1300, q: 1.2, rel: 0.07 }),
      HAT('x x x x x x x x', 0.03),
    ],
  },
};

/**
 * Old / alternate names that resolve to a real cue. `tension` is what the
 * episode runtime's allow-list has always said; the cue is `tense`.
 * @type {Object<string, string>}
 */
const MUSIC_ALIASES = { tension: 'tense' };

/**
 * One-line mood per cue, for docs, authoring prompts and tooling.
 * @type {Readonly<Object<string, string>>}
 */
export const MUSIC_MOODS = Object.freeze({
  lobby: 'Bored minor-key elevator loop. Default office ambience.',
  happy: 'Bouncy major-key office pop. Good news, a nice morning, montage.',
  breezy: 'Smooth-jazz elevator muzak. Waiting, small talk, fake calm.',
  corporate: 'Upbeat stock-video "synergy". Presentations, onboarding, brand speak.',
  intrigue: 'Sneaky pizzicato + walking bass. Snooping, schemes, a suspicious memo.',
  tense: 'Pulsing low ostinato, anxious arpeggio. Deadlines, confrontations.',
  chase: 'Fast comedic gallop. Running, panic, everything on fire.',
  goofy: 'Oompah polka with tuba and bassoon. Slapstick, dumb plans, the dog.',
  sad: 'Slow, lonely minor. Rejection, layoffs, a sad desk lunch.',
  triumph: 'Heroic looping anthem. Rallying the team, the big comeback.',
  victory: 'One-shot JRPG victory sting. Stops itself.',
  dreamy: 'Music-box shimmer. Flashbacks, lore, memories, daydreams.',
  party: '80s synth-pop with a gated snare. Parties, neon, the 80s client.',
  birthday: 'Original celebratory party loop. Birthdays, cake, office celebrations.',
});

/**
 * Every playable music cue id (aliases excluded), frozen.
 * @type {ReadonlyArray<string>}
 */
export const MUSIC_IDS = Object.freeze(Object.keys(MUSIC));

const LOOKAHEAD = 0.18;
const TICK_MS = 25;
const XFADE = 0.35;

/** @type {{id:string, def:MusicDef, gain:GainNode, level:number, step:number, next:number, timer:number, steps:number, done:boolean}|null} */
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
  const hold = track.hold != null ? track.hold : Math.max(0, dur - atk - Math.min(rel, dur * 0.4));

  if (ev.noise) {
    const g = ctx.createGain();
    const s = noiseSrc(t, atk + hold + rel + 0.05);
    const f = filt(track.filter || 'highpass', track.cutoff || 6000, track.q);
    s.connect(f); f.connect(g); g.connect(dest);
    env(g.gain, t, track.gain, atk, track.hold || 0, rel, track.hard);
    return;
  }

  const tr = track.transpose ? Math.pow(2, track.transpose / 12) : 1;
  for (const fb of ev.freqs) {
    const f0 = fb * tr;
    const o = ctx.createOscillator();
    if (track.wave === 'pulse') o.setPeriodicWave(pulseWave);
    else o.type = track.wave || 'triangle';
    if (track.glide) {
      o.frequency.setValueAtTime(f0 * track.glide, t);
      o.frequency.exponentialRampToValueAtTime(f0, t + (track.glideTime || 0.05));
    } else {
      o.frequency.setValueAtTime(f0, t);
    }
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
    const end = env(g.gain, t, track.gain / Math.max(1, ev.freqs.length * 0.7), atk, hold, rel, track.hard);
    o.start(t);
    o.stop(end + 0.03);
    if (track.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = track.vibRate || 5.5;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(track.vib, t + Math.min(0.3, dur * 0.6));
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start(t);
      lfo.stop(end + 0.03);
    }
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
    const at = st.next + (s % 2 && st.def.swing ? st.def.swing * st.def.stepDur : 0);
    for (const tr of st.def.tracks) {
      const ev = parseTok(tr.pat[s % tr.pat.length]);
      if (ev) playNote(tr, ev, at, st.def.stepDur, st.gain);
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
 * Starts a music bed, crossfading out whatever was already playing.
 * Calling it again with the same id is a no-op (apart from applying a new
 * `opts.gain`), so it is safe to call from a per-frame update. Music sits at
 * ~0.08 absolute so voices stay on top. Unknown ids are ignored.
 * See {@link MUSIC_IDS} / {@link MUSIC_MOODS}.
 * @param {string|null} id a {@link MUSIC_IDS} entry (or alias `tension`); null stops the music
 * @param {Object} [opts]
 * @param {number} [opts.gain=1] level multiplier for this cue (e.g. 0.5 under a long speech)
 * @returns {void}
 */
export function playMusic(id, opts = {}) {
  if (id == null) { stopMusic(); return; }
  if (!live()) return;
  const key = MUSIC_ALIASES[id] || id;
  const def = MUSIC[key];
  if (!def) return;
  const level = Math.max(0, (def.level == null ? 1 : def.level) * (opts.gain == null ? 1 : opts.gain));
  if (musicId === key && music && !music.done) {
    if (opts.gain != null && music.level !== level) {
      const t = ctx.currentTime;
      music.level = level;
      music.gain.gain.cancelScheduledValues(t);
      music.gain.gain.setValueAtTime(music.gain.gain.value, t);
      music.gain.gain.linearRampToValueAtTime(Math.max(level, 0.0001), t + 0.25);
    }
    return;
  }

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
  g.gain.linearRampToValueAtTime(Math.max(level, 0.0001), t0 + (def.loop ? XFADE : 0.02));

  const st = { id: key, def, gain: g, level, step: 0, next: t0, timer: 0, steps, done: false };
  music = st;
  musicId = key;
  st.timer = setInterval(() => tick(st), TICK_MS);
  tick(st);
}

/**
 * The id of the cue currently playing (aliases resolved), or null.
 * @returns {string|null}
 */
export function currentMusic() {
  return music && !music.done ? musicId : null;
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
