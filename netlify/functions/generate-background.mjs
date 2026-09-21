/**
 * OFFICE HOURS VII — turns a viewer's prompt into a validated episode spec.
 *
 * A background function, because generation takes far longer than the ~10s a
 * synchronous one gets. Background functions answer with an empty 202, so the
 * CLIENT mints the job id and polls it; there is nothing to hand back here.
 *
 * What comes out is a JSON spec, never JavaScript. A generated module stored
 * and executed on a public site is arbitrary code execution by anyone who can
 * type into a form, and it would mean weakening the CSP that exists to stop
 * exactly that. See js/episodes/runtime.js.
 *
 * @module netlify/functions/generate-background
 */

import { getStore } from '@netlify/blobs';
import { validateSpec, estimateRuntime, STEP_TYPES } from '../../js/episodes/runtime.js';
import {
  EPISODE_STORE, JOB_STORE, checkRate, clientIp, setJob, json,
} from './_shared.mjs';

export const config = {
  background: true,
  path: '/api/generate',
};

/** Sonnet: strong enough for a long constrained spec, fast enough to wait for. */
const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_PROMPT = 500;

/** @param {string} id @returns {boolean} */
const validId = (id) => typeof id === 'string' && /^u_[a-z0-9]{6,12}$/.test(id);

/**
 * @param {*} v the vocabulary snapshot
 * @returns {string}
 */
function systemPrompt(v) {
  const castLines = v.cast
    .map((id) => `  ${id} — ${v.profiles[id].fullName} (${v.profiles[id].role}); animations: ${v.anims[id].join(', ')}`)
    .join('\n');

  return `You write episodes of OFFICE HOURS VII, a PS1-era 3D workplace comedy set at MULCH, Inc. — a startup with eleven days of money left. The tone is dry, deadpan and affectionate. Nobody is punching down; everybody is doing their best and it is not working.

You output ONE JSON object and nothing else. No markdown fence, no commentary.

THE HARD RULE: use only what exists below. Do not invent a character, a location, a camera angle, an animation or a prop. Anything not on these lists is rejected outright and the viewer gets nothing.

CHARACTERS (use the id, not the name):
${castLines}

FLOOR MARKS for place/walk:
${v.marks.join(', ')}

CAMERA SET-UPS for cut:
${v.shots.join(', ')}

SOUND: sfx = bark, fanfare, chime, thud, beep, error. music = lobby, chase, tension, victory, or null to stop.
EMOTES: sweat, note, anger, idea, love, shock.

SHAPE:
{
  "title": "SHORT TITLE",          // uppercase, max 48 chars
  "logline": "One line, present tense.",
  "starring": ["brad", "marge"],   // character ids actually used
  "steps": [ ... ]                 // 40-90 steps
}

STEP TYPES — ${STEP_TYPES.join(', ')}:
  {"type":"title","subtitle":"A VIEWER EPISODE"}
  {"type":"cut","shot":"bullpenWide"}
  {"type":"place","actor":"brad","mark":"whiteboard"}
  {"type":"walk","actor":"kiki","mark":"meetingRoom"}
  {"type":"anim","actor":"brad","name":"point"}
  {"type":"emote","actor":"roop","name":"sweat"}
  {"type":"face","actor":"dez","target":"marge"}
  {"type":"say","actor":"brad","text":"We are going offsite."}
  {"type":"say","actor":null,"text":"Narration, no speaker."}
  {"type":"nameCard","actor":"marge"}
  {"type":"wait","ms":600} {"type":"beat","ms":400}
  {"type":"sfx","name":"chime"} {"type":"music","name":"lobby"}
  {"type":"toast","text":"SHORT ALL-CAPS"}
  {"type":"shake"} {"type":"flash"} {"type":"fadeOut"} {"type":"fadeIn"}

CRAFT:
- Open with a title step, then a cut, then place everyone who appears before they speak.
- Cut to a new set-up every 3-6 lines. A scene on one camera goes dead.
- Spoken lines are at most 84 characters. Short lines land harder.
- Aim for 95-150 seconds. Roughly: each line costs 1.3s plus a second per 14 characters.
- End on a button: a small, flat, deflating line. Not a moral.
- Nobody says the company is doomed out loud. They talk about parking, or a chair.`;
}

/**
 * @param {string} key @param {string} base @param {Array} messages @param {string} system
 * @returns {Promise<string>} raw model text
 */
async function callModel(key, base, system, messages) {
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gateway ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) throw new Error('gateway returned no text');
  return text;
}

/**
 * Pulls the JSON object out of a model reply, tolerating a stray fence or a
 * sentence of preamble rather than failing the whole generation over it.
 *
 * @param {string} text
 * @returns {*}
 */
function parseSpec(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(raw.slice(start, end + 1));
}

/** @type {import('@netlify/functions').Handler} */
export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad JSON' });
  }

  const id = String(body.id || '');
  const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT);
  const deviceId = String(body.deviceId || '').slice(0, 64);

  if (!validId(id)) return json(400, { error: 'bad id' });
  if (prompt.length < 4) return json(400, { error: 'prompt too short' });

  const jobs = getStore(JOB_STORE);
  const existing = await jobs.get(id, { type: 'json' }).catch(() => null);
  if (existing) return json(409, { error: 'id already used' });

  await setJob(id, { status: 'queued', stage: 'Checking your allowance' });

  const rate = await checkRate(deviceId, clientIp(req, context));
  if (!rate.ok) {
    await setJob(id, { status: 'rejected', error: rate.reason });
    return json(429, { error: rate.reason });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  const base = process.env.ANTHROPIC_BASE_URL;
  if (!key || !base) {
    await setJob(id, { status: 'failed', error: 'The generator is not configured.' });
    return json(500, { error: 'gateway not configured' });
  }

  try {
    await setJob(id, { status: 'working', stage: 'Reading the brief' });

    // The vocabulary is fetched from the deployed site rather than bundled, so
    // it is always the snapshot this exact deploy ships — the same one /docs
    // shows a human, written by the same tool run.
    const vres = await fetch(`${process.env.URL}/js/episodes/vocab.json`);
    if (!vres.ok) throw new Error(`vocab ${vres.status}`);
    const vocab = await vres.json();
    const system = systemPrompt(vocab);

    await setJob(id, { status: 'working', stage: 'Writing the episode' });
    const messages = [{ role: 'user', content: `Write an episode about: ${prompt}` }];
    let text = await callModel(key, base, system, messages);
    let spec;
    let check;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        spec = parseSpec(text);
      } catch (err) {
        check = { ok: false, errors: [`output was not valid JSON: ${err.message}`] };
        spec = null;
      }
      if (spec) check = validateSpec(spec, vocab);
      if (check.ok) break;
      if (attempt === 1) break;

      // One repair round. Every error message names the valid options, so the
      // model is being handed the fix rather than just the complaint.
      await setJob(id, { status: 'working', stage: 'Checking it against the set' });
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content: `That spec did not validate. Fix every problem and return the whole corrected JSON object, nothing else:\n\n${check.errors.map((e) => `- ${e}`).join('\n')}`,
      });
      text = await callModel(key, base, system, messages);
    }

    if (!check.ok) {
      await setJob(id, {
        status: 'failed',
        error: 'That one did not come out right. Try a different idea.',
        detail: check.errors.slice(0, 6).join('; '),
      });
      return json(200, { ok: false });
    }

    const seconds = estimateRuntime(spec);
    const record = {
      ...spec,
      id,
      prompt,
      seconds,
      createdAt: new Date().toISOString(),
    };

    await setJob(id, { status: 'working', stage: 'Building the office' });
    // Title and date go in the blob's metadata as well as its body, so the
    // listing endpoint can build the gallery from one list() call instead of
    // fetching every episode to read its title.
    await getStore(EPISODE_STORE).setJSON(id, record, {
      metadata: { title: spec.title, logline: spec.logline, createdAt: record.createdAt, seconds },
    });
    await setJob(id, { status: 'ready', title: spec.title, seconds });
    return json(200, { ok: true });
  } catch (err) {
    await setJob(id, {
      status: 'failed',
      error: 'The generator had a bad afternoon. Try again in a minute.',
      detail: String((err && err.message) || err).slice(0, 300),
    });
    return json(200, { ok: false });
  }
};
