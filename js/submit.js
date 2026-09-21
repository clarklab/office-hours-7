/**
 * OFFICE HOURS VII — "make your own episode".
 *
 * Two independent jobs on the landing page, both of which must fail quietly:
 *
 * 1. The submission form. It posts to `/api/submit`, a SYNCHRONOUS function that
 *    checks the daily allowance and takes a slot before any generation starts, so
 *    an out-of-allowance viewer gets an immediate 429 instead of a loader. On a
 *    202 it hands back the job id, which is polled at `/api/job?id=` until the job
 *    reaches a terminal state. Next to the button, `/api/quota` drives a small
 *    "N prompts left today" meter; the name only picks the allowance, and the
 *    server decides what it is.
 * 2. The "Made by viewers" strip, from `/api/recent`. Empty or broken means the
 *    whole section hides itself — an empty box or an error panel on the landing
 *    page is worse than no section at all.
 *
 * Every `localStorage` touch goes through {@link readStore}/{@link writeStore},
 * which swallow the SecurityError that some privacy modes throw on *access* —
 * not on write, on merely reading the property. The device id and the in-flight
 * job id are conveniences; nothing here may depend on storage existing.
 *
 * @module submit
 */

/* ------------------------------------------------------------------ *
 * contract
 * ------------------------------------------------------------------ */

/** The id shape the backend accepts: job ids (minted server-side) and device ids (minted here). */
const ID_RE = /^u_[a-z0-9]{6,12}$/;

/** How often the job is polled, in ms. */
const POLL_MS = 2000;

/** How long to keep polling before giving up politely, in ms. */
const GIVE_UP_MS = 4 * 60 * 1000;

/** Longest prompt the backend will read. Mirrored by the textarea's maxlength. */
const MAX_PROMPT = 500;

/** Longest name the backend keeps. Mirrored by the input's maxlength. */
const MAX_NAME = 40;

/** How long to wait after the last keystroke in the name before asking for the allowance. */
const QUOTA_DEBOUNCE_MS = 450;

/** localStorage keys. */
const DEVICE_KEY = 'oh7:device';
const JOB_KEY = 'oh7:job';
const NAME_KEY = 'oh7:name';

/* ------------------------------------------------------------------ *
 * storage — every access wrapped, on purpose
 * ------------------------------------------------------------------ */

/**
 * Reads a string from localStorage, or null. Reading `window.localStorage` at all
 * throws in some privacy modes, so the property access is inside the try too.
 *
 * @param {string} key
 * @returns {string|null}
 */
function readStore(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} whether it stuck
 */
function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} key */
function dropStore(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do and nothing worth saying */
  }
}

/* ------------------------------------------------------------------ *
 * ids
 * ------------------------------------------------------------------ */

/**
 * Mints an id of the shape the backend validates. Base-36 bytes, so the output is
 * always `[a-z0-9]` — the same recipe `netlify/functions/_shared.mjs` uses, kept in
 * step deliberately.
 *
 * @returns {string} e.g. `u_3f0a9c17b2`
 */
export function mintId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(36).padStart(2, '0');
  return `u_${out.slice(0, 10)}`;
}

/**
 * This browser's device id, minted on first use and remembered. If storage is
 * unavailable it is minted per page load, which the backend treats as a new device —
 * acceptable, because the IP counter is the limit that actually holds.
 *
 * @returns {string}
 */
let deviceIdCache = '';
export function deviceId() {
  if (deviceIdCache) return deviceIdCache;
  const saved = readStore(DEVICE_KEY);
  deviceIdCache = saved && ID_RE.test(saved) ? saved : mintId();
  if (deviceIdCache !== saved) writeStore(DEVICE_KEY, deviceIdCache);
  return deviceIdCache;
}

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

/**
 * @param {string} tag
 * @param {string|null} [cls]
 * @param {string|Node|Array<string|Node|null|undefined>|null} [kids]
 * @returns {HTMLElement}
 */
function el(tag, cls, kids) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    if (k === null || k === undefined) continue;
    node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return node;
}

/**
 * Seconds as `m:ss`. Anything unusable reads as an em dash rather than `NaN:aN`.
 *
 * @param {*} seconds
 * @returns {string}
 */
function clock(seconds) {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/**
 * The name as the server will see it: whitespace collapsed, trimmed, capped.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

/**
 * A UTC instant as a local wall-clock time, e.g. `7:00 PM`. Empty if unusable.
 *
 * @param {string} iso
 * @returns {string}
 */
function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** @param {string} id @returns {string} the player URL for a viewer episode */
function watchHref(id) {
  return `/watch.html?ep=${encodeURIComponent(id)}`;
}

/* ------------------------------------------------------------------ *
 * the form
 * ------------------------------------------------------------------ */

/**
 * Wires the submission form and its loader.
 *
 * @param {{onReady?: () => void}} [hooks] `onReady` fires when an episode lands, so
 *   the "Made by viewers" strip can refresh itself.
 * @returns {() => void} teardown
 */
export function initForm(hooks = {}) {
  const form = /** @type {HTMLFormElement|null} */ (document.getElementById('make-form'));
  const input = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('make-idea'));
  const counter = document.getElementById('make-count');
  const errorLine = document.getElementById('make-error');
  const status = document.getElementById('make-status');
  const button = /** @type {HTMLButtonElement|null} */ (document.getElementById('make-go'));
  const nameInput = /** @type {HTMLInputElement|null} */ (document.getElementById('make-name'));
  const nameError = document.getElementById('make-name-error');
  const meter = document.getElementById('make-quota');
  const pips = document.getElementById('make-pips');
  const meterText = document.getElementById('make-quota-text');
  if (!form || !input || !status || !button) return () => {};

  /** Whether a job is in flight. */
  let busy = false;
  /**
   * The last allowance the server reported, or null if it has not said (or
   * cannot — `tools/serve.mjs` has no functions, and the form must still work).
   *
   * @type {{limit:number, remaining:number, resetsAt:string}|null}
   */
  let allowance = null;
  /** Bumped per quota request, so a slow reply cannot overwrite a newer one. */
  let quotaSeq = 0;
  /** @type {number} */
  let quotaTimer = 0;

  /** The poll loop currently running, if any. Cancelled by bumping the token. */
  let runToken = 0;
  /** @type {number} */
  let tickTimer = 0;
  /** @type {number} */
  let pollTimer = 0;

  /* --- counter ----------------------------------------------------- */

  const syncCount = () => {
    if (counter) counter.textContent = `${input.value.length} / ${MAX_PROMPT}`;
  };
  syncCount();
  input.addEventListener('input', syncCount);

  /* --- inline validation ------------------------------------------- */

  /** @param {string} msg */
  const showError = (msg) => {
    if (!errorLine) return;
    errorLine.textContent = msg;
    errorLine.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'make-error make-help make-count');
  };

  const clearError = () => {
    if (!errorLine) return;
    errorLine.textContent = '';
    errorLine.hidden = true;
    input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', 'make-help make-count');
  };

  input.addEventListener('input', clearError);

  /* --- the worked examples ------------------------------------------ */

  // A non-technical visitor staring at an empty box is the failure mode this
  // whole section has to survive, and three things they can tap beats any
  // amount of instruction about what a good prompt looks like.
  for (const chip of form.querySelectorAll('[data-eg]')) {
    chip.addEventListener('click', () => {
      input.value = (chip.textContent || '').trim();
      syncCount();
      clearError();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  /* --- the panel --------------------------------------------------- */

  /** The button is off while a job runs, and when the allowance is spent. */
  const syncButton = () => {
    button.disabled = busy || Boolean(allowance && allowance.remaining <= 0);
  };

  /** @param {boolean} on */
  const setBusy = (on) => {
    busy = on;
    input.readOnly = on;
    if (nameInput) nameInput.readOnly = on;
    form.classList.toggle('is-busy', on);
    syncButton();
  };

  /* --- the allowance meter ----------------------------------------- */

  /** @param {{limit:number, remaining:number, resetsAt:string}|null} q */
  const renderQuota = (q) => {
    allowance = q;
    syncButton();
    if (!meter || !pips || !meterText) return;
    if (!q) {
      meter.hidden = true;
      return;
    }
    const limit = Math.max(0, Math.min(50, Math.round(q.limit)));
    const left = Math.max(0, Math.min(limit, Math.round(q.remaining)));

    pips.textContent = '';
    pips.classList.toggle('is-many', limit > 6);
    for (let i = 0; i < limit; i++) pips.appendChild(el('span', i < left ? 'make-pip is-on' : 'make-pip', null));

    meterText.textContent = '';
    if (left > 0) {
      meterText.appendChild(document.createTextNode(`${left} prompt${left === 1 ? '' : 's'} left today`));
    } else {
      meterText.appendChild(document.createTextNode('No prompts left today'));
      const at = localTime(q.resetsAt);
      meterText.appendChild(el('small', null, at ? `Back at ${at}, your time` : 'Back at midnight UTC'));
    }
    meter.classList.toggle('is-last', left === 1);
    meter.classList.toggle('is-out', left === 0);
    meter.setAttribute('aria-label', left > 0
      ? `${left} of ${limit} prompts left today`
      : 'No prompts left today');
    meter.hidden = false;
  };

  /**
   * @param {*} data a response body that may carry the allowance
   * @returns {{limit:number, remaining:number, resetsAt:string}|null}
   */
  const readAllowance = (data) => {
    if (!data || !Number.isFinite(data.limit) || !Number.isFinite(data.remaining)) return null;
    return { limit: data.limit, remaining: data.remaining, resetsAt: String(data.resetsAt || '') };
  };

  /** Asks the server how many are left for this device and name. Never throws. */
  const refreshQuota = async () => {
    quotaSeq += 1;
    const mine = quotaSeq;
    /** @type {*} */
    let q = null;
    try {
      const res = await fetch('/api/quota', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ deviceId: deviceId(), name: cleanName(nameInput ? nameInput.value : '') }),
      });
      if (res.ok) q = readAllowance(await res.json());
      else await res.text().catch(() => '');
    } catch {
      q = null;
    }
    if (mine !== quotaSeq) return;
    renderQuota(q);
  };

  const refreshQuotaSoon = () => {
    if (quotaTimer) clearTimeout(quotaTimer);
    quotaTimer = setTimeout(() => { quotaTimer = 0; refreshQuota(); }, QUOTA_DEBOUNCE_MS);
  };

  /* --- the name ------------------------------------------------------ */

  /** @param {string} msg */
  const showNameError = (msg) => {
    if (!nameInput || !nameError) return;
    nameError.textContent = msg;
    nameError.hidden = false;
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.setAttribute('aria-describedby', 'make-name-error');
  };

  const clearNameError = () => {
    if (!nameInput || !nameError) return;
    nameError.textContent = '';
    nameError.hidden = true;
    nameInput.removeAttribute('aria-invalid');
    nameInput.removeAttribute('aria-describedby');
  };

  if (nameInput) {
    const saved = readStore(NAME_KEY);
    if (saved && !nameInput.value) nameInput.value = cleanName(saved);
    nameInput.addEventListener('input', () => {
      clearNameError();
      refreshQuotaSoon();
    });
    nameInput.addEventListener('change', () => {
      const clean = cleanName(nameInput.value);
      if (clean) writeStore(NAME_KEY, clean);
      if (quotaTimer) clearTimeout(quotaTimer);
      quotaTimer = 0;
      refreshQuota();
    });
  }

  // A tab left open across midnight UTC should not keep saying "none left".
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !busy) refreshQuota();
  };
  document.addEventListener('visibilitychange', onVisible);
  refreshQuota();

  const clearTimers = () => {
    if (tickTimer) clearInterval(tickTimer);
    if (pollTimer) clearTimeout(pollTimer);
    tickTimer = 0;
    pollTimer = 0;
  };

  /**
   * Replaces the status panel's contents.
   *
   * @param {string} kind one of 'wait' | 'done' | 'stop'
   * @param {Node[]} kids
   */
  const panel = (kind, kids) => {
    const wasHidden = status.hidden;
    status.className = `make-status is-${kind}`;
    status.textContent = '';
    for (const k of kids) status.appendChild(k);
    status.hidden = false;
    // On a phone the form fills the screen and the panel opens below the fold,
    // so pressing the button would look like nothing happened. Only on the way
    // out of hidden: the stage updates that follow must not move the page.
    if (wasHidden) {
      try {
        status.scrollIntoView({ block: 'nearest' });
      } catch {
        /* ancient scrollIntoView, no options object — not worth a fallback */
      }
    }
  };

  const hidePanel = () => {
    status.hidden = true;
    status.textContent = '';
  };

  /* --- the loader -------------------------------------------------- */

  /**
   * The waiting state: a sweeping bar, an elapsed clock that ticks every second,
   * and a running list of the stages the backend has reported. The clock is what
   * keeps it alive under `prefers-reduced-motion`, where the site kills animations
   * outright.
   *
   * @param {number} startedAt epoch ms the job began
   * @returns {{stage: (s: string) => void}}
   */
  const loader = (startedAt) => {
    const elapsed = el('span', 'make-elapsed', '0:00');
    const steps = el('ol', 'make-steps');
    /** @type {string} */
    let current = '';

    panel('wait', [
      el('p', 'make-stage-head', [
        el('span', 'make-spin', null),
        'Building your episode',
      ]),
      el('div', 'make-bar', [el('span', null, null)]),
      steps,
      el('p', 'make-note', [
        'This can take a couple of minutes. Leave the page open — the time so far is ',
        elapsed,
        '.',
      ]),
    ]);

    const tick = () => {
      elapsed.textContent = clock(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    };
    tick();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 1000);

    return {
      /** @param {string} s */
      stage(s) {
        const text = String(s || '').trim();
        if (!text || text === current) return;
        const previous = steps.querySelector('.is-now');
        if (previous) previous.className = 'is-done';
        steps.appendChild(el('li', 'is-now', text));
        current = text;
      },
    };
  };

  /* --- terminal states --------------------------------------------- */

  /**
   * @param {string} id
   * @param {{title?: string, seconds?: number}} job
   */
  const showReady = (id, job) => {
    clearTimers();
    setBusy(false);
    const href = watchHref(id);
    const link = el('a', 'make-watch', [el('span', 'tri', '▶'), 'Watch it now']);
    link.setAttribute('href', href);
    link.id = 'make-watch';

    const copy = el('button', 'make-copy-btn', 'Copy link');
    copy.setAttribute('type', 'button');
    copy.id = 'make-copy';

    const again = el('button', 'make-again', 'Write another');
    again.setAttribute('type', 'button');
    again.id = 'make-again';

    const shareUrl = new URL(href, window.location.href).href;
    copy.addEventListener('click', async () => {
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        // Clipboard access is refused outright in a few browsers and in any
        // non-secure context, so fall back to a selection the viewer can copy.
        try {
          const ghost = document.createElement('textarea');
          ghost.value = shareUrl;
          ghost.setAttribute('readonly', '');
          ghost.className = 'make-ghost';
          document.body.appendChild(ghost);
          ghost.select();
          ok = document.execCommand('copy');
          ghost.remove();
        } catch {
          ok = false;
        }
      }
      copy.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      setTimeout(() => { copy.textContent = 'Copy link'; }, 2400);
    });

    again.addEventListener('click', () => {
      hidePanel();
      input.value = '';
      syncCount();
      input.focus();
    });

    panel('done', [
      el('p', 'make-kicker', 'Your episode is ready'),
      el('h3', 'make-title', String(job.title || 'UNTITLED')),
      el('p', 'make-sub', `A viewer episode · ${clock(job.seconds)}`),
      el('div', 'make-actions', [link, copy, again]),
      el('p', 'make-note', 'The link works for anyone, and it is in "Made by viewers" below.'),
    ]);

    input.value = '';
    syncCount();
    link.focus();
    refreshQuota();
    if (typeof hooks.onReady === 'function') hooks.onReady();
  };

  /**
   * `rejected` is the rate limit, and its message is already written for a person.
   * Show it exactly as sent; do not dress it up.
   *
   * @param {string} message
   */
  const showRejected = (message) => {
    clearTimers();
    setBusy(false);
    refreshQuota();
    panel('stop', [
      el('p', 'make-kicker', 'Not this time'),
      el('p', 'make-msg', message || 'That is enough episodes for today.'),
    ]);
  };

  /**
   * @param {string} message the backend's own wording, verbatim
   */
  const showFailed = (message) => {
    clearTimers();
    setBusy(false);
    // A failure on our side hands the slot back, so the meter may have gone up.
    refreshQuota();
    const retry = el('button', 'make-again', 'Try again');
    retry.setAttribute('type', 'button');
    retry.id = 'make-retry';
    retry.addEventListener('click', () => {
      hidePanel();
      input.focus();
    });
    panel('stop', [
      el('p', 'make-kicker', 'That did not work'),
      el('p', 'make-msg', message || 'The office could not put that one on.'),
      el('div', 'make-actions', [retry]),
    ]);
  };

  const showTimeout = () => {
    clearTimers();
    setBusy(false);
    const retry = el('button', 'make-again', 'Start over');
    retry.setAttribute('type', 'button');
    retry.id = 'make-retry';
    retry.addEventListener('click', () => {
      hidePanel();
      input.focus();
    });
    panel('stop', [
      el('p', 'make-kicker', 'Still going'),
      el('p', 'make-msg',
        'This is taking unusually long, so we have stopped watching it. '
        + 'Your episode may still turn up — look for it in "Made by viewers" '
        + 'below in a few minutes.'),
      el('div', 'make-actions', [retry]),
    ]);
  };

  /* --- polling ------------------------------------------------------ */

  /**
   * Polls `/api/job` until the job is terminal or the deadline passes. A transient
   * network blip or a 5xx is not a failure: the background function is still out
   * there working, so the loop keeps going until the deadline says otherwise.
   *
   * @param {string} id
   * @param {number} startedAt epoch ms
   * @param {{stage: (s: string) => void}} [existing] a loader already on screen
   */
  const watchJob = (id, startedAt, existing) => {
    runToken += 1;
    const mine = runToken;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = 0;
    setBusy(true);

    const ui = existing || loader(startedAt);
    const deadline = startedAt + GIVE_UP_MS;

    const step = async () => {
      if (mine !== runToken) return;

      /** @type {*} */
      let job = null;
      try {
        const res = await fetch(`/api/job?id=${encodeURIComponent(id)}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        if (res.ok) job = await res.json();
        else await res.text().catch(() => '');
      } catch {
        job = null;
      }
      if (mine !== runToken) return;

      const state = job && typeof job.status === 'string' ? job.status : '';

      if (state === 'ready') {
        dropStore(JOB_KEY);
        showReady(id, job);
        return;
      }
      if (state === 'rejected') {
        dropStore(JOB_KEY);
        showRejected(String((job && job.error) || ''));
        return;
      }
      if (state === 'failed') {
        dropStore(JOB_KEY);
        showFailed(String((job && job.error) || ''));
        return;
      }

      // The stage strings are the backend's own wording and are shown verbatim,
      // so the loader always says what the server is really doing. The fallback
      // is the same phrase /api/job uses for an id it has not written yet.
      if (job && job.stage) ui.stage(job.stage);
      else if (state === 'queued') ui.stage('Starting up');

      if (Date.now() >= deadline) {
        dropStore(JOB_KEY);
        showTimeout();
        return;
      }
      pollTimer = setTimeout(step, POLL_MS);
    };

    step();
  };

  /* --- submit -------------------------------------------------------- */

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (button.disabled) return;

    const name = cleanName(nameInput ? nameInput.value : '');
    if (nameInput && !name) {
      showNameError('Tell us who you are first — a first name is plenty.');
      nameInput.focus();
      return;
    }
    clearNameError();

    const prompt = input.value.trim().slice(0, MAX_PROMPT);
    if (!prompt) {
      showError('Give us one line first — anything that could go wrong will do.');
      input.focus();
      return;
    }
    clearError();
    if (name) writeStore(NAME_KEY, name);

    // Put the loader up before the request settles, so a slow network does not
    // read as a dead button. The allowance is checked synchronously by the
    // server, so a refusal replaces this within a round trip.
    runToken += 1;
    const mine = runToken;
    const startedAt = Date.now();
    clearTimers();
    setBusy(true);
    const ui = loader(startedAt);
    ui.stage('Checking your allowance');

    /** @type {*} */
    let data = null;
    let code = 0;
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ prompt, name, deviceId: deviceId() }),
      });
      code = res.status;
      data = await res.json().catch(() => null);
    } catch {
      code = 0;
    }
    if (mine !== runToken) return;

    const q = readAllowance(data);
    if (q) renderQuota(q);
    const message = String((data && data.error) || '');

    if (code === 202 && data && ID_RE.test(String(data.id || ''))) {
      writeStore(JOB_KEY, JSON.stringify({ id: data.id, startedAt }));
      watchJob(data.id, startedAt, ui);
      return;
    }
    if (code === 429) {
      showRejected(message);
      return;
    }
    if (code === 400 && data && data.field === 'name') {
      clearTimers();
      setBusy(false);
      hidePanel();
      showNameError(message || 'Tell us who you are first.');
      if (nameInput) nameInput.focus();
      return;
    }
    if (code === 400) {
      clearTimers();
      setBusy(false);
      hidePanel();
      showError(message || 'Give us a little more than that.');
      input.focus();
      return;
    }
    showFailed(code === 0
      ? 'We could not reach the office. Check your connection and try again.'
      : (message || 'The office could not take that just now. Try again in a minute.'));
  });

  // A textarea swallows Enter, which is correct — so give the keyboard the usual
  // long-form shortcut instead of taking newlines away from people.
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !(ev.metaKey || ev.ctrlKey)) return;
    ev.preventDefault();
    if (typeof form.requestSubmit === 'function') form.requestSubmit(button);
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  /* --- resume after a reload ----------------------------------------- */

  const saved = readStore(JOB_KEY);
  if (saved) {
    /** @type {*} */
    let rec = null;
    try {
      rec = JSON.parse(saved);
    } catch {
      rec = null;
    }
    const id = rec && typeof rec.id === 'string' ? rec.id : '';
    const startedAt = rec && Number.isFinite(rec.startedAt) ? rec.startedAt : 0;
    if (ID_RE.test(id) && startedAt && Date.now() - startedAt < GIVE_UP_MS) watchJob(id, startedAt);
    else dropStore(JOB_KEY);
  }

  return () => {
    runToken += 1;
    clearTimers();
    if (quotaTimer) clearTimeout(quotaTimer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/* ------------------------------------------------------------------ *
 * made by viewers
 * ------------------------------------------------------------------ */

/**
 * One viewer episode card. Deliberately plainer than `.ep`: no number, no poster
 * plate, no accent colour, and a kicker that says whose it is. A viewer episode
 * must never be mistakable for one of the three.
 *
 * @param {{id:string, title?:string, logline?:string, seconds?:number}} row
 * @returns {HTMLElement}
 */
function viewerCard(row) {
  const title = String(row.title || 'UNTITLED');
  const logline = String(row.logline || '');

  const link = el('a', 'vep-link', [
    el('p', 'vep-kicker', 'Viewer episode'),
    el('h3', 'vep-title', title),
    logline ? el('p', 'vep-log', logline) : null,
    el('div', 'vep-foot', [
      el('span', 'vep-run', clock(row.seconds)),
      el('span', 'vep-cta', [el('span', 'tri', '▶'), 'Watch']),
    ]),
  ]);
  link.setAttribute('href', watchHref(row.id));
  link.setAttribute(
    'aria-label',
    `Watch ${title}, a viewer episode. ${logline}`.trim(),
  );

  return el('li', 'vep', [link]);
}

/**
 * Fills the "Made by viewers" section from `/api/recent`, or hides it.
 *
 * Nothing about this may produce an error state on the page: an empty list, a 500,
 * a parse failure and an offline browser all take the same route, which is to leave
 * the section hidden exactly as the markup ships it.
 *
 * @returns {Promise<number>} how many cards were rendered
 */
export async function loadRecent() {
  const section = document.getElementById('viewer-eps');
  const grid = document.getElementById('vep-grid');
  const count = document.getElementById('vep-count');
  if (!section || !grid) return 0;

  /** @type {Array<*>} */
  let rows = [];
  try {
    const res = await fetch('/api/recent', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.episodes)) rows = data.episodes;
    } else {
      await res.text().catch(() => '');
    }
  } catch {
    rows = [];
  }

  const clean = rows.filter((r) => r && typeof r.id === 'string' && ID_RE.test(r.id));
  if (!clean.length) {
    section.hidden = true;
    grid.textContent = '';
    return 0;
  }

  grid.textContent = '';
  for (const row of clean) grid.appendChild(viewerCard(row));
  if (count) count.textContent = `${String(clean.length).padStart(2, '0')} so far`;
  section.hidden = false;
  return clean.length;
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

/**
 * Wires both halves of the feature.
 *
 * @returns {() => void} teardown
 */
export function initSubmit() {
  const stop = initForm({ onReady: () => { loadRecent(); } });
  loadRecent();
  return stop;
}

// Page entry point, the same shape gallery.js uses: index.html loads this module
// directly so no inline <script> is needed, and the element check keeps importing
// this module from anywhere else side-effect free.
if (typeof document !== 'undefined' && document.getElementById('make-form')) {
  initSubmit();
}
