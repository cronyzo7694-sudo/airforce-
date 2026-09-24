/* v1.4.62 — purgeBankReplace (BANK-REPLACE) unit test (fake-indexeddb)
   v2 model: bank-meta _bundleKind "v2". Purana bank devices se GAYAB,
   naya v2 bank (400 Q) akela rehta hai. Ye test LIVE v2 transition
   simulate karta hai: seed v2 → stale demo Q + user manual Q + airforce Q
   inject → purgeBankReplace → sirf v2 real + user manual + airforce bache.
   Unattempted series tests bhi saaf, attempted history safe. */
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
global.Generator = require('../js/generator.js');
const Seed = require('../js/seed.js');

const passed = [], failed = [];
const t = (name, cond) => (cond ? (passed.push(name), console.log('  ✓', name)) : (failed.push(name), console.error('  ✗', name)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);

  /* ── 1) v2 seed: 4 banks × 100 Q ── */
  console.log('━━━ seed v2 bank (4 × 100)');
  const rep = await Seed.seedIfNeeded(false, 'ssc-chsl');
  t('seed: imported 400 (4 v2 banks)', rep.imported === 400, 'got ' + rep.imported);
  t('seed: bySubject exact (math 100 / reasoning 100 / english 100 / gs 100)',
    rep.bySubject.mathematics === 100 && rep.bySubject.reasoning === 100 && rep.bySubject.english === 100 && rep.bySubject.gs === 100,
    JSON.stringify(rep.bySubject));
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped', meta === true);
  const sscQ0 = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: sab 400 keyed + explained', sscQ0.every(q => q.correctAnswer && q.explanation));
  t('seed: koi demo-temp tag NAHI', !sscQ0.some(q => (q.tags || []).includes('demo-temp')));

  /* ── 2) stale + user manual + airforce Q inject ── */
  console.log('━━━ inject: stale demo Q + user manual Q + airforce Q');
  const staleQs = [];
  for (let i = 1; i <= 5; i++) {
    staleQs.push({
      id: 'q_sscchsl_stale_' + i, subject: 'gs', subjectName: 'General Awareness', chapter: 'General', topic: 'General',
      difficulty: 'easy', questionText: 'STALE demo question number ' + i + '?', questionTextHi: null, image: null,
      options: [{ id: 'A', text: 'a' + i, textHi: 'a' + i }, { id: 'B', text: 'b' + i, textHi: 'b' + i }, { id: 'C', text: 'c' + i, textHi: 'c' + i }, { id: 'D', text: 'd' + i, textHi: 'd' + i }],
      correctAnswer: 'A', explanation: 'stale', explanationHi: null, source: 'demo', year: 2024,
      tags: ['demo-temp'], dupeHash: 'stale_dh_' + i, figureBased: false, paper: null, exam: 'ssc-chsl'
    });
  }
  const userQ = {
    id: 'q_ssc_mathematics_90001', subject: 'mathematics', subjectName: 'Mathematics', chapter: 'Arithmetic', topic: 'Arithmetic',
    difficulty: 'medium', questionText: 'USER ka khud ka question 2+2?', questionTextHi: null, image: null,
    options: [{ id: 'A', text: '3', textHi: '3' }, { id: 'B', text: '4', textHi: '4' }, { id: 'C', text: '5', textHi: '5' }, { id: 'D', text: '6', textHi: '6' }],
    correctAnswer: 'B', explanation: 'basic', explanationHi: null, source: 'Manual entry', year: 2026,
    tags: ['manual'], dupeHash: 'user_dh_1', figureBased: false, paper: null, exam: 'ssc-chsl'
  };
  const afQ = {
    id: 'q_af_90002', subject: 'physics', subjectName: 'Physics', chapter: 'General', topic: 'General',
    difficulty: 'medium', questionText: 'AIRFORCE question 1+1?', questionTextHi: null, image: null,
    options: [{ id: 'A', text: '1', textHi: '1' }, { id: 'B', text: '2', textHi: '2' }, { id: 'C', text: '3', textHi: '3' }, { id: 'D', text: '4', textHi: '4' }],
    correctAnswer: 'B', explanation: 'basic', explanationHi: null, source: 'test', year: 2026,
    tags: [], dupeHash: 'af_dh_1', figureBased: false, paper: null, exam: 'airforce'
  };
  await DB.bulkPut('questions', [...staleQs, userQ, afQ]);
  const all1 = await DB.getAll('questions');
  t('inject: 400 + 5 stale + 1 user + 1 af = 407', all1.length === 407, 'got ' + all1.length);

  /* unattempted series test jo stale Q ko refer karta hai + attempted test */
  const staleId = staleQs[0].id;
  const seriesTestId = 'test_series_stale_' + Date.now();
  await DB.put('tests', { id: seriesTestId, series: true, exam: 'ssc-chsl', sections: [{ subject: 'gs', questionIds: [staleId] }], createdAt: Date.now() });
  const attTestId = 'test_att_' + Date.now();
  await DB.put('tests', { id: attTestId, series: true, exam: 'ssc-chsl', sections: [{ subject: 'gs', questionIds: [staleId] }], createdAt: Date.now() });
  await DB.put('attempts', { id: 'att_1', testId: attTestId, exam: 'ssc-chsl', submittedAt: Date.now(), result: { score: 1 } });

  /* ── 3) purgeBankReplace — v2 transition ── */
  console.log('━━━ purgeBankReplace (v2)');
  const pr = await Seed.purgeBankReplace('ssc-chsl');
  t('purge: stale 5 + v2 400 = 405 deleted (manual user SAFE)', pr.questions === 405, 'got ' + pr.questions);
  t('purge: unattempted stale series test dropped (seed series samet)', pr.tests >= 1, 'got ' + pr.tests);
  const all2 = await DB.getAll('questions');
  const ssc2 = all2.filter(q => q.exam === 'ssc-chsl');
  /* v2 bank bhi delete hota hai (replace model) — syncBundled isi sync me
     naya v2 bank turant re-import karta hai; yahan standalone purge hai */
  t('purge: sirf user manual ssc bacha (1) — v2 re-import sync me hoga', ssc2.length === 1, 'got ' + ssc2.length);
  t('purge: non-manual ssc ZERO bache', ssc2.every(q => (q.tags || []).includes('manual')));
  t('purge: user q_ssc_mathematics_90001 SAFE (manual tag)', all2.some(q => q.id === 'q_ssc_mathematics_90001'));
  t('purge: airforce Q SAFE', all2.some(q => q.id === 'q_af_90002'));
  t('purge: koi demo-temp/stale bacha? NAHI', !all2.some(q => (q.tags || []).includes('demo-temp') || (q.id || '').startsWith('q_sscchsl_')));
  t('purge: seriesRebuild flag set', (await Store.getMeta('seriesRebuild_ssc-chsl', false)) === true);
  const attempts2 = await DB.getAll('attempts');
  t('purge: attempted history SAFE', attempts2.some(a => a.id === 'att_1'));
  const tests2 = await DB.getAll('tests');
  t('purge: attempted test SAFE', tests2.some(x => x.id === attTestId));
  t('purge: unattempted stale test GAYAB', !tests2.some(x => x.id === seriesTestId));

  /* ── 4) sync jaisa flow: v2 re-import → dobara purge (400 non-manual) → wapas ── */
  console.log('━━━ replace-cycle: re-import → purge → re-import');
  let readd = 0;
  for (const s of ['gs', 'mathematics', 'english', 'reasoning'])
    readd += (await Seed.importBatch(JSON.parse(fs.readFileSync(path.join(ROOT, `data/ssc-chsl/bank-${s}.json`), 'utf8')), null, 'ssc-chsl')).imported;
  t('re-import v2: 400 wapas', readd === 400, 'got ' + readd);
  const pr2 = await Seed.purgeBankReplace('ssc-chsl');
  t('re-purge: 400 deleted (user manual protected)', pr2.questions === 400, 'got ' + pr2.questions);
  for (const s of ['gs', 'mathematics', 'english', 'reasoning'])
    await Seed.importBatch(JSON.parse(fs.readFileSync(path.join(ROOT, `data/ssc-chsl/bank-${s}.json`), 'utf8')), null, 'ssc-chsl');
  const finalQs = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('final: v2 400 + user 1 = 401', finalQs.length === 401, 'got ' + finalQs.length);

  /* ── 5) v1.4.69 SERIES SELF-HEAL: subject tests missing → auto top-up ── */
  console.log('━━━ healSeries: adhoori library (0 subject tests) auto-fix');
  await DB.delete('questions', 'q_ssc_mathematics_90001');   // manual tag wala bina distractor ke
  const pre = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('heal setup: 400 ssc Q', pre.length === 400, 'got ' + pre.length);
  /* seed khud series bana chuka (2 fulls + 7 subject — en pool 99 figureBased).
     Sab series SUBJECT tests delete karo (v1.4.62-era jaisa tootan) → heal */
  let lib = (await DB.getAll('tests')).filter(t => t.exam === 'ssc-chsl');
  const fullsBefore = lib.filter(t => t.series && t.type === 'full').length;
  for (const t of lib.filter(t => t.series && t.type === 'subject')) await DB.delete('tests', t.id);
  const h1 = await Seed.healSeries('ssc-chsl');
  t('heal: missing detect + unused bank se top-up (path-a, made>0)', (h1.healed || 0) >= 4 && h1.healed >= (4 - 0), JSON.stringify(h1));
  lib = (await DB.getAll('tests')).filter(t => t.exam === 'ssc-chsl' && t.series);
  const perSub = {};
  lib.filter(t => t.type === 'subject').forEach(t => { perSub[t.sections[0].subjectId] = (perSub[t.sections[0].subjectId] || 0) + 1; });
  t('heal: chaaron subjects ke subject tests wapas', ['gs', 'mathematics', 'reasoning', 'english'].every(s => (perSub[s] || 0) >= 1), JSON.stringify(perSub));
  t('heal: mocks chhue-bina (path-a me delete NAHI)', lib.filter(t => t.type === 'full').length === fullsBefore, 'got ' + lib.filter(t => t.type === 'full').length);
  const h2 = await Seed.healSeries('ssc-chsl');
  t('heal: complete library par no-op (idempotent)', h2.complete === true && h2.healed === 0, JSON.stringify(h2));

  console.log(`\n${passed.length}/${passed.length + failed.length} pass`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
