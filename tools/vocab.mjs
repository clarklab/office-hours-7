#!/usr/bin/env node
/**
 * OFFICE HOURS VII — prints the episode-authoring vocabulary.
 *
 * An episode is one self-contained file. The hard part of writing one is not
 * the structure, it is knowing what already exists to build from: which marks
 * the office names, which camera set-ups it ships, what each character can be
 * asked to do, and which verbs the Director understands.
 *
 * Every list below is read out of the LIVE objects in a real browser, not
 * scraped from source or copied into a doc. That is deliberate: a hand-written
 * list of shot names goes stale the moment somebody renames one, and an episode
 * written against a stale list fails with `unknown shot "deskCloseB"` — which is
 * exactly how one of these episodes was first written.
 *
 *   node tools/vocab.mjs           # human-readable
 *   node tools/vocab.mjs --json    # machine-readable, for another agent
 *
 * @module tools/vocab
 */

import { start, ROOT } from './serve.mjs';
import { launchBrowser } from './check.mjs';

/** Collected in the page, where the real modules live. */
const PROBE = async () => {
  /** @param {*} o */
  const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).sort() : []);

  const office = await import('/js/sets/office.js');
  const chars = await import('/js/characters/index.js');
  const director = await import('/js/core/director.js');

  const built = office.createOffice();
  await chars.loadCast(chars.CAST_IDS);

  /** @type {Object<string, string[]>} */
  const anims = {};
  /** @type {Object<string, Object>} */
  const profiles = {};
  for (const id of chars.CAST_IDS) {
    try {
      const a = chars.spawn(id);
      anims[id] = typeof a.anims === 'function' ? a.anims().sort() : [];
      const p = a.profile || {};
      profiles[id] = {
        name: p.name || id,
        fullName: p.fullName || '',
        role: p.role || '',
        color: p.color || '',
        prop: a.prop ? String(a.prop.name || 'yes') : null,
        triangles: typeof a.triangles === 'function' ? a.triangles() : undefined,
      };
      if (typeof a.dispose === 'function') a.dispose();
    } catch (err) {
      anims[id] = [`<spawn failed: ${(err && err.message) || err}>`];
    }
  }

  // The Director's surface, taken from an instance rather than the module, so
  // what is listed is what an episode can actually call on `d`.
  let verbs = [];
  try {
    const stub = { scene: null, camera: null, onUpdate: () => () => {} };
    const d = director.createDirector(stub, null, {});
    verbs = Object.keys(d).filter((k) => typeof d[k] === 'function').sort();
  } catch (err) {
    verbs = [`<could not instantiate: ${(err && err.message) || err}>`];
  }

  return {
    marks: keys(built.marks),
    shots: keys(built.shots),
    bounds: office.BOUNDS || null,
    cast: chars.CAST_IDS,
    profiles,
    anims,
    verbs,
    triangles: typeof built.triangles === 'function' ? built.triangles() : undefined,
  };
};

/**
 * Reads the vocabulary once, in a real browser, and returns it.
 *
 * Exported so `tools/docs.mjs` can publish the same numbers this prints,
 * rather than keeping a second copy that drifts.
 *
 * @returns {Promise<Object>}
 */
export async function readVocab() {
  const server = await start({ port: 0 });
  let browser;
  try {
    browser = await launchBrowser({});
  } catch (err) {
    await server.close();
    throw new Error(`could not launch Chromium: ${(err && err.message) || err}`);
  }
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  try {
    await page.goto(`${server.url}/watch.html?ep=ep1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return await page.evaluate(PROBE);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/**
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<number>} process exit code
 */
export async function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');

  const server = await start({ port: 0 });
  let browser;
  try {
    browser = await launchBrowser({});
  } catch (err) {
    console.error(`FATAL: could not launch Chromium: ${(err && err.message) || err}`);
    await server.close();
    return 2;
  }

  let data;
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  /** @type {string[]} */
  const problems = [];
  page.on('pageerror', (e) => problems.push(String((e && e.message) || e)));
  try {
    // Any page on the origin will do — it just has to be same-origin so the
    // module specifiers and the import map resolve the way an episode sees them.
    await page.goto(`${server.url}/watch.html?ep=ep1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    data = await page.evaluate(PROBE);
  } catch (err) {
    console.error(`FATAL: could not read the vocabulary: ${(err && err.message) || err}`);
    problems.forEach((p) => console.error(`  page error: ${p}`));
    return 2;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }

  const list = (arr, per = 4, pad = 22) => {
    const out = [];
    for (let i = 0; i < arr.length; i += per) {
      out.push('  ' + arr.slice(i, i + per).map((s) => String(s).padEnd(pad)).join('').trimEnd());
    }
    return out.join('\n');
  };

  console.log('OFFICE HOURS VII — episode authoring vocabulary');
  console.log('read live from the modules; nothing here is hand-maintained\n');

  console.log(`MARKS  (${data.marks.length})  — d.place(actor, 'name'), d.walk(actor, 'name')`);
  console.log(list(data.marks));
  console.log('');

  console.log(`SHOTS  (${data.shots.length})  — d.cut('name'), or d.cut({pos,look,fov})`);
  console.log(list(data.shots));
  console.log('');

  console.log(`CAST  (${data.cast.length})  — ctx.cast.<id>`);
  for (const id of data.cast) {
    const p = data.profiles[id] || {};
    const tri = p.triangles === undefined ? '' : `  ${p.triangles} tris`;
    console.log(`  ${id.padEnd(9)}${(p.fullName || p.name || '').padEnd(24)}${(p.role || '').padEnd(22)}${tri}`);
    console.log(`    anims: ${(data.anims[id] || []).join(', ')}`);
  }
  console.log('');

  console.log(`DIRECTOR VERBS  (${data.verbs.length})  — everything an episode may call on \`d\``);
  console.log(list(data.verbs, 5, 18));
  console.log('');

  if (data.bounds) {
    console.log('BOUNDS  — generated camera positions are kept inside this');
    console.log(`  ${JSON.stringify(data.bounds)}`);
    console.log('');
  }

  console.log('LAYOUT CONSTRAINTS — learned the hard way, and not discoverable from the API:');
  console.log('  · The battle HUD owns y >= 129 of the 384x216 frame.');
  console.log('  · A style:\'battle\' command window owns roughly x 8-110 / y 50-126.');
  console.log('  · Together those hide anything under ~0.6m tall unless the camera is on');
  console.log('    the carpet. Battle set-ups want to sit at 0.30-0.38m and stay level.');
  console.log('  · Do NOT tune cps/hold to hit a runtime. dialogue.js gives every line a');
  console.log('    readable minimum for its length; author those two for relative intent.');
  console.log('  · Two boxes on screen at once need distinct ids and keep:true.');
  console.log('');

  if (problems.length) {
    console.log(`(${problems.length} page error(s) while reading: ${problems[0]})`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; });
}
