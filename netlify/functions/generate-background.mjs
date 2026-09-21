/**
 * OFFICE HOURS VII — turns a viewer's prompt into a validated episode spec.
 *
 * A background function, because generation takes far longer than the ~10s a
 * synchronous one gets. Background functions answer with an empty 202 no matter
 * what they return, so NOTHING here can refuse a viewer — the daily limit is
 * checked and the slot taken up front, synchronously, by /api/submit
 * (submit.mjs), which then calls this with nothing but a job id. The prompt
 * comes from the private ticket submit.mjs wrote, and a ticket runs once: an
 * id without one, or whose ticket is already claimed, does nothing. So a direct
 * POST here cannot get round the limit.
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
  EPISODE_STORE, TICKET_STORE, refund, setJob, json,
} from './_shared.mjs';

export const config = {
  background: true,
  path: '/api/generate',
};

/** Sonnet: strong enough for a long constrained spec, fast enough to wait for. */
const MODEL = 'claude-sonnet-4-5-20250929';

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

  return `You write episodes of OFFICE HOURS VII, a PS1-era 3D workplace comedy set at MULCH, Inc. — a startup with eleven days of money left. Dry, deadpan, affectionate. Nobody is punching down; everybody is doing their best and it is not working.

You output ONE JSON object and nothing else. No markdown fence, no commentary.

WHAT YOU ARE GIVEN: a single line. "Someone is stealing from the group fridge." "The printer is haunted." That is a premise, not a script — it is your job to develop it into two minutes. Do not ask for more. Do not restate it and stop. Build the episode the line implies.

HOW TO DEVELOP ONE:
Run the premise through these people and the episode writes itself. Ask: who noticed? who denies it? who makes it worse? who says what it costs?

  BRAD   Founder. Reframes every problem as an opportunity and will not say a bad
         word out loud. Answers a crisis with a whiteboard. Believes the team is
         crushing it. Never admits the company is in trouble.
  DEZ    Sales. Permanently mid-call, closing nobody. Treats every situation as a
         deal to be worked. Sunglasses indoors. Enormous confidence, 4% close rate.
  KIKI   Front of house. Sees everything from reception and is the only one who
         actually knows what happened. Out of patience. Tangled in her headset cord.
  ROOP   IT. Under a desk, hood up, 402 open tickets. Deflects, denies, and knows
         more than he is saying. Answers a direct question with a different question.
  MARGE  Finance. The only one holding real numbers, in one red ledger. Ramrod
         straight. Says the actual cost out loud, flatly, and ends the argument.
  TUESDAY An unauthorised dog. Does not speak. Present, unbothered, and usually the
         closest thing to a resolution anyone gets.

SHAPE THAT WORKS:
  1. Cold open — the office, before anyone knows. One or two lines.
  2. The discovery — somebody finds it. Usually Kiki, because Kiki sees everything.
  3. Denial — Brad reframes it. Roop deflects. Nothing is resolved.
  4. Escalation — it becomes a meeting it did not need to be.
  5. The number — Marge says what it actually costs. Everyone goes quiet.
  6. The button — a small, flat, deflating line. Not a moral, not a lesson.

Worked example, "someone is stealing from the group fridge": Kiki has been labelling
her lunch for three weeks. Brad calls it a sign of a high-trust culture. Dez tries to
sell the thief a solution. Roop gets defensive about a sandwich nobody accused him of.
Marge points out the fridge costs more to run than the food in it. Tuesday is under the
table. Nobody finds the thief. Somebody labels a yoghurt.

THE HARD RULE: use only what exists below. Do not invent a character, a location, a
camera angle, an animation or a prop. Anything not on these lists is rejected outright
and the viewer gets nothing back.

CHARACTERS (use the id, not the name):
${castLines}

FLOOR MARKS for place/walk:
${v.marks.join(', ')}

CAMERA SET-UPS for cut:
${v.shots.join(', ')}

SOUND: sfx = bark, fanfare, chime, thud, beep, error. music = lobby, chase, tension, victory, or null to stop.
EMOTES: sweat, note, anger, idea, love, shock.

OUTPUT SHAPE:
{
  "title": "SHORT TITLE",          // uppercase, max 48 chars
  "logline": "One line, present tense.",
  "starring": ["brad", "marge"],   // character ids actually used
  "steps": [ ... ]                 // 40-90 steps
}

STEP TYPES — ${STEP_TYPES.join(', ')}:
  {"type":"title","subtitle":"MADE BY A VIEWER"}
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
- Spoken lines are at most 84 characters. Short lines land harder than long ones.
- Aim for 95-150 seconds. Roughly: each line costs 1.3s plus a second per 14 characters.
- Use three to five characters. All six in two minutes is a crowd, not a cast.
- Nobody says the company is doomed out loud. They talk about parking, or a chair.
- If the premise is rude, cruel or about a real person, write the MULCH version of it
  instead: keep the shape, drop the target, aim it at the office. Never refuse — a
  viewer typed one line and is waiting for something.`;
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

/**
 * Claims a ticket so it runs exactly once, even if this function is invoked
 * twice for the same id (a retry, or someone replaying the request).
 *
 * @param {string} id
 * @returns {Promise<*|null>} the ticket, or null if there is none to run
 */
async function claimTicket(id) {
  const store = getStore(TICKET_STORE, { consistency: 'strong' });
  const rec = await store.getWithMetadata(id, { type: 'json' });
  if (!rec || !rec.data || rec.data.claimed) return null;
  const ticket = rec.data;
  const res = await store.setJSON(id, { ...ticket, claimed: true, claimedAt: new Date().toISOString() },
    rec.etag ? { onlyIfMatch: rec.etag } : undefined);
  if (res && res.modified === false) return null;
  return ticket;
}

/** @type {import('@netlify/functions').Handler} */
export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad JSON' });
  }

  const id = String((body && body.id) || '');
  if (!validId(id)) return json(400, { error: 'bad id' });

  const ticket = await claimTicket(id).catch(() => null);
  // No ticket: not a submission that passed the limit, or already running.
  if (!ticket) return json(404, { error: 'no such ticket' });

  const prompt = String(ticket.prompt || '');
  const name = String(ticket.name || '');

  // Our failures hand the slot back; see refund() in _shared.mjs. A spec that
  // comes back invalid after a repair round does NOT — the model was called,
  // and a refund there would let one viewer loop bad prompts for free.
  const ourFault = async (error, detail) => {
    await refund(ticket.keys).catch(() => {});
    await setJob(id, { status: 'failed', error, refunded: true, ...(detail ? { detail } : {}) });
  };

  const key = process.env.ANTHROPIC_API_KEY;
  const base = process.env.ANTHROPIC_BASE_URL;
  if (!key || !base) {
    await ourFault('The generator is not configured. That one did not count against your allowance.');
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
    const messages = [{
      role: 'user',
      // Named as a premise, not a brief. What arrives is one line — "someone is
      // stealing from the group fridge" — and the model has to develop it
      // rather than transcribe it.
      content: `Premise: ${prompt}\n\nDevelop this into a full episode.`,
    }];
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
      // `by` rides in the metadata only: /api/recent whitelists what it serves, so
      // the submitter's name is stored with the episode without being published.
      metadata: {
        title: spec.title, logline: spec.logline, createdAt: record.createdAt, seconds, by: name,
      },
    });
    await setJob(id, { status: 'ready', title: spec.title, seconds });
    return json(200, { ok: true });
  } catch (err) {
    await ourFault(
      'The generator had a bad afternoon. That one did not count — try again in a minute.',
      String((err && err.message) || err).slice(0, 300),
    );
    return json(200, { ok: false });
  }
};
