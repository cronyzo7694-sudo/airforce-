/* v1.4.56 — 15 full-mock + 20 subject-test count/diversity verify (purge-harness pattern) */
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

/* id → chapter map (diversity check) — seed REGENERATES ids, so map from DB */
let chapterOf = {};

let passed = 0, failed = 0;
const t = (n, ok, x) => { ok ? (passed++, console.log('  ✓', n)) : (failed++, console.error('  ✗', n, x || '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);
  const rep = await Seed.seedIfNeeded(false, 'ssc-chsl');
  t('seed: 10,296 real Q (gs 3,579)', rep.imported === 10296 && rep.bySubject.gs === 3579, JSON.stringify(rep.bySubject));
  for (const s of ['mathematics', 'reasoning', 'english', 'gs'])
    for (const q of await DB.byIndex('questions', 'subject', s)) chapterOf[q.id] = q.chapter;

  /* 15 full mocks: 4×25Q, SSC order, 15-min sections, chapter diversity ≥3 */
  let mockOK = 0, mockErr = 0;
  for (let i = 0; i < 15; i++) {
    try {
      const r = await Generator.fullMock();
      const tst = r.test;
      const counts = tst.sections.map(s => s.questionIds.length);
      const order = tst.sections.map(s => s.subjectId).join(',');
      const chap = tst.sections.map(s => new Set(s.questionIds.map(id => chapterOf[id])).size);
      const durs = tst.sections.map(s => s.duration);
      const ok = counts.length === 4 && counts.every(c => c === 25) && chap.every(c => c >= 3)
        && durs.every(d => d === 900) && tst.timerMode === 'section' && tst.sectionLock === true
        && tst.duration === 3600 && order === 'reasoning,gs,mathematics,english';
      if (ok) mockOK++; else console.log(`   mock${i}: counts=${counts} order=${order} chap=${chap} durs=${durs} tm=${tst.timerMode} lock=${tst.sectionLock} dur=${tst.duration}`);
    } catch (e) { mockErr++; console.log(`   mock${i} ERROR ${e.message}`); }
  }
  t('15 full mocks: 4×25Q, SSC order, 15-min/section lock, diversity ≥3', mockOK === 15 && mockErr === 0, `${mockOK}/15 err=${mockErr}`);

  /* 20 subject tests: 25Q + diversity ≥3 */
  const subs = ['mathematics', 'reasoning', 'english', 'gs'];
  let subOK = 0, subErr = 0;
  for (let i = 0; i < 20; i++) {
    const sid = subs[i % 4];
    try {
      const r = await Generator.subjectTest(sid);
      const qs = r.test.sections[0].questionIds;
      const chap = new Set(qs.map(id => chapterOf[id])).size;
      if (qs.length === 25 && chap >= 3) subOK++;
      else console.log(`   sub${i} ${sid}: n=${qs.length} chap=${chap}`);
    } catch (e) { subErr++; console.log(`   sub${i} ${sid} ERROR ${e.message}`); }
  }
  t('20 subject tests: 25Q + chapter diversity ≥3', subOK === 20 && subErr === 0, `${subOK}/20 err=${subErr}`);

  /* marking */
  const r = await Generator.fullMock();
  t('marking 2 / -0.5, maxScore 200', r.test.marking.correct === 2 && r.test.marking.wrong === -0.5 && r.test.maxScore === 200, JSON.stringify(r.test.marking));

  console.log(`\n${passed}/${passed + failed} pass${failed ? ' — FIX NEEDED' : ' ✓ ALL GREEN'}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
