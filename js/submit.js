/**
 * OFFICE HOURS VII — "make your own episode".
 *
 * Two independent jobs on the landing page, both of which must fail quietly:
 *
 * 1. The submission form. `/api/generate` is a Netlify **background** function, so
 *    it answers with an empty 202 and cannot hand an id back. The client therefore
 *    mints the id itself (same shape the backend validates, `/^u_[a-z0-9]{6,12}$/`)
 *    and polls `/api/job?id=` until the job reaches a terminal state.
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

/** The id shape the backend accepts. Minted here; validated there. */
const ID_RE = /^u_[a-z0-9]{6,12}$/;

/** How often the job is polled, in ms. */
const POLL_MS = 2000;

/** How long to keep polling before giving up politely, in ms. */
const GIVE_UP_MS = 4 * 60 * 1000;

/** Longest prompt the backend will read. Mirrored by the textarea's maxlength. */
const MAX_PROMPT = 500;

/** localStorage keys. */
const DEVICE_KEY = 'oh7:device';
const JOB_KEY = 'oh7:job';

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
  if (!form || !input || !status || !button) return () => {};

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

  /** @param {boolean} busy */
  const setBusy = (busy) => {
    button.disabled = busy;
    input.readOnly = busy;
    form.classList.toggle('is-busy', busy);
  };

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
    status.className = `make-status is-${kind}`;
    status.textContent = '';
    for (const k of kids) status.appendChild(k);
    status.hidden = false;
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
   */
  const watchJob = (id, startedAt) => {
    runToken += 1;
    const mine = runToken;
    clearTimers();
    setBusy(true);

    const ui = loader(startedAt);
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

    const prompt = input.value.trim().slice(0, MAX_PROMPT);
    if (!prompt) {
      showError('Give us one line first — anything that could go wrong will do.');
      input.focus();
      return;
    }
    clearError();

    const id = mintId();
    const startedAt = Date.now();
    writeStore(JOB_KEY, JSON.stringify({ id, startedAt }));

    // Put the loader up before the request settles: a background function answers
    // instantly, but a slow network should not read as a dead button.
    watchJob(id, startedAt);

    let sent = false;
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, prompt, deviceId: deviceId() }),
      });
      sent = res.ok || res.status === 202;
      // A background function answers 202 with nothing in it. Draining the body
      // anyway closes the stream then and there — an unread response is cancelled
      // later by the browser, which surfaces as a spurious net::ERR_ABORTED.
      await res.text().catch(() => '');
    } catch {
      sent = false;
    }

    if (!sent) {
      runToken += 1;
      dropStore(JOB_KEY);
      showFailed('We could not reach the office. Check your connection and try again.');
    }
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
