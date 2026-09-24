/* v1.4.70 — SSC PERMANENT RESET verify: bank 0-Q state ka contract.
   (Purana avsar: 400 v2 real Q → 15 mocks + 20 subject tests — vo bank
   permanently delete ho chuka hai; ab yahan verify hota hai ki shell
   EMPTY bank par bhi app gracefully kaam karta hai aur marking config
   sahi rehti hai.) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
const fakeIDB = require('fake-indexeddb');
global.indexedDB = fakeIDB.indexedDB || fakeIDB;
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

const ROOT = path.resolve(__dirname, '..');
global.fetch = (url) => {
  const p = path.join(ROOT, String(url).replace(/^https?:\/\/[^/]+\//, '').split('?')[0]);
  try {
    const text = fs.readFileSync(p, 'utf8');
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(text)), text: () => Promise.resolve(text) });
  } catch (e) { return Promise.resolve({ ok: false, status: 404, json: () => { throw new Error('404'); }, text: async () => '' }); }
};

const loadDb = new Function(fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8') + '\n;return { DB: DB, Store: Store };')();
global.DB = loadDb.DB;
global.Store = loadDb.Store;
global.AVUtil = require('../js/util.js');
const cfgMod = require('../js/config.js');
global.EXAM_CONFIG = cfgMod.EXAM_CONFIG;
global.EXAM_CONFIGS = cfgMod.EXAM_CONFIGS;
global.EXAM_LABELS = cfgMod.EXAM_LABELS;
const SSC = { ...cfgMod.EXAM_CONFIGS['ssc-chsl'], exam: 'ssc-chsl' };
global.App = { configCache: SSC, config: async () => SSC };
const Seed = require('../js/seed.js');
const Generator = require('../js/generator.js');

let passed = 0, failed = 0;
const t = (n, ok, x) => { ok ? (passed++, console.log('  ✓', n)) : (failed++, console.error('  ✗', n, x || '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);

  /* v1.4.72: bank = user-supplied REAL PYQ (english 25), baaki khaali */
  const raw = {};
  for (const s of ['mathematics', 'english', 'reasoning', 'gs'])
    raw[s] = JSON.parse(fs.readFileSync(path.join(ROOT, `data/ssc-chsl/bank-${s}.json`), 'utf8'));
  t('bank files: sirf english 25, baaki []', raw.english.length === 25 && raw.mathematics.length === 0 && raw.reasoning.length === 0 && raw.gs.length === 0,
    JSON.stringify(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.length]))));
  t('english PYQ: sab keyed + explained + paper-tagged', raw.english.every(q => q.correctAnswer && q.explanation && /2024/.test(String(q.year || '')) && /Shift/.test(q.source || '')),
    'checks fail');

  const rep = await Seed.seedIfNeeded(true, 'ssc-chsl');
  t('seed: 25 imported (english PYQ batch-1)', rep.imported === 25, 'got ' + rep.imported);
  t('seed: bySubject english 25, baaki 0', ['mathematics', 'reasoning', 'gs'].every(s => rep.bySubject[s] === 0) && rep.bySubject.english === 25,
    JSON.stringify(rep.bySubject));
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped set', meta === true);
  const sscQ = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: DB me 25 SSC Q (sab english)', sscQ.length === 25 && sscQ.every(q => q.subject === 'english'), 'got ' + sscQ.length);

  /* generate: empty bank par crash NAHI — graceful {ok:false,error} */
  let fm;
  try { fm = await Generator.fullMock(); } catch (e) { fm = { ok: false, error: 'THREW: ' + e.message }; }
  t('fullMock: graceful not-ok (no throw)', fm && fm.ok === false && !!fm.error, JSON.stringify(fm && fm.error));
  let st;
  try { st = await Generator.subjectTest('reasoning'); } catch (e) { st = { ok: false, error: 'THREW: ' + e.message }; }
  t('subjectTest: graceful not-ok (no throw)', st && st.ok === false && !!st.error, JSON.stringify(st && st.error));
  let bs;
  try { bs = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 }); } catch (e) { bs = { ok: false, error: 'THREW: ' + e.message }; }
  t('buildSeries: sirf 1 english subject test (0 mocks — baaki subjects khaali)', bs && bs.ok === true && bs.made === 1 && bs.full === 0 && bs.subject === 1, JSON.stringify(bs));
  let et;
  try { et = await Generator.subjectTest('english'); } catch (e) { et = { ok: false, error: 'THREW: ' + e.message }; }
  t('subjectTest(english): OK — 25 PYQ se test banta hai', et && et.ok === true && et.test && et.test.sections[0].questionIds.length === 25, et && et.error || 'ok');

  /* heal: empty bank par bhi graceful — missing detect, made 0, tries guard */
  const h = await Seed.healSeries('ssc-chsl');
  t('healSeries: complete (english covered, khaali subjects skip — koi bekaar rebalance nahi)', h && (h.healed || 0) === 0 && h.complete === true, JSON.stringify(h));

  /* marking config — shell hamesha sahi (naye questions aane par turant ready) */
  t('SSC marking config: +2 / −0.5 / maxMarks 200', SSC.marking.correct === 2 && SSC.marking.wrong === -0.5 && SSC.maxMarks === 200,
    JSON.stringify({ m: SSC.marking, max: SSC.maxMarks }));
  t('SSC subjects: reasoning,gs,mathematics,english × 25Q × 15-min', SSC.subjects.map(s => s.id).join(',') === 'reasoning,gs,mathematics,english'
    && SSC.subjects.every(s => s.questions === 25 && s.duration === 900), JSON.stringify(SSC.subjects));

  console.log(`\n${passed}/${passed + failed} pass${failed ? ' — FIX NEEDED' : ' ✓ ALL GREEN'}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
