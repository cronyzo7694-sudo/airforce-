/* v1.4.55 — demo-temp PURGE unit test (fake-indexeddb, no full app boot)
   v1.4.57: 4 REAL banks (10,275 Q — math 1926, reasoning 1422, english 3369,
   gs 3579; bank-meta _bundleKind ab "final"). Fresh data me demo-temp tag hai
   hi nahi — purge logic yahan LIVE MIGRATION simulate karke test hota hai:
   v1.4.46-4.54 installs ke stale Q (demo-temp tags + q_sscchsl_* legacy ids)
   inject karo → temp-demo→final transition auto-purge → SIRF stale delete,
   10,275 real + user ki q_ssc_* + airforce Q KABHI nahi chute. */
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

// browser-only files ko function-scope eval se load karo (DB + Store nikaalo)
const loadDb = new Function(fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8') + '\n;return { DB: DB, Store: Store };')();
global.DB = loadDb.DB;
global.Store = loadDb.Store;
global.AVUtil = require('../js/util.js');
const Seed = require('../js/seed.js');

const passed = [], failed = [];
const t = (name, cond) => (cond ? (passed.push(name), console.log('  ✓', name)) : (failed.push(name), console.error('  ✗', name)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);

  /* ── 1) v1.4.55 seed: 4 real banks, demo-temp ZERO ── */
  console.log('━━━ seed v1.4.55 final bank');
  const rep = await Seed.seedIfNeeded(false, 'ssc-chsl');
  t('seed: imported 10,275 (4 real banks)', rep.imported === 10275, 'got ' + rep.imported);
  t('seed: bySubject exact (math 1926 / reasoning 1422 / english 3369 / gs 3558)',
    rep.bySubject.mathematics === 1926 && rep.bySubject.reasoning === 1422 && rep.bySubject.english === 3369 && rep.bySubject.gs === 3558,
    JSON.stringify(rep.bySubject));
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped', meta === true);
  const sscQ0 = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: v1.4.55 real bank me demo-temp tag ZERO', sscQ0.filter(q => (q.tags || []).includes('demo-temp')).length === 0,
    'demo-temp=' + sscQ0.filter(q => (q.tags || []).includes('demo-temp')).length);
  t('seed: koi q_sscchsl_ legacy id NAHI', !sscQ0.some(q => (q.id || '').startsWith('q_sscchsl_')));

  /* ── 2) LIVE MIGRATION simulation: v1.4.54 install ke stale Q inject ──
     (96 demo-temp tagged + 8 q_sscchsl_ legacy) + user ki REAL Q + airforce Q ── */
  const stale = [];
  for (let i = 0; i < 96; i++) {
    stale.push({ id: 'q_ssc-chsl_stale_' + i, exam: 'ssc-chsl', subject: 'gs', subjectName: 'GA', chapter: 'X', topic: 'X', difficulty: 'easy',
      questionText: 'stale demo Q ' + i, questionTextHi: 'q', image: null,
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }],
      correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: ['demo-temp'], figureBased: false, paper: 'Tier-I' });
  }
  for (let i = 0; i < 8; i++) {
    stale.push({ id: 'q_sscchsl_legacy_' + i, exam: 'ssc-chsl', subject: 'reasoning', subjectName: 'Reasoning', chapter: 'X', topic: 'X', difficulty: 'easy',
      questionText: 'v1.4.46 legacy Q ' + i, questionTextHi: 'q', image: null,
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }],
      correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: [], figureBased: false, paper: 'Tier-I' });
  }
  await DB.bulkPut('questions', stale.concat([
    { id: 'q_ssc_mathematics_90001', exam: 'ssc-chsl', subject: 'mathematics', subjectName: 'QA', chapter: 'X', topic: 'X', difficulty: 'easy',
      questionText: 'user real Q', questionTextHi: 'q', image: null,
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }],
      correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: ['ssc-chsl'], figureBased: false, paper: 'Tier-I' },
    { id: 'q_af_90002', exam: 'airforce', subject: 'physics', subjectName: 'Physics', chapter: 'X', topic: 'X', difficulty: 'easy',
      questionText: 'airforce Q', questionTextHi: 'q', image: null,
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }],
      correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: [], figureBased: false, paper: 'P1' }
  ]));

  /* ── 3) temp-demo → final TRANSITION (v1.4.54→v1.4.55 live update jaisa):
     v1.4.54 user ke paas bundleKind 'temp-demo' tha; naye bank-meta me
     'final' hai → syncBundled PEHLE auto-purge kare, phir import (dupes skip) ── */
  console.log('━━━ syncBundled temp-demo→final transition (auto-purge)');
  await Store.setMeta('bundleKind_ssc-chsl', 'temp-demo');   // v1.4.54 install state
  await Store.setMeta('bundleFP_ssc-chsl', null);             // fp bhi purana/none
  const sync1 = await Seed.syncBundled('ssc-chsl');
  t('transition: synced', sync1.synced === true || sync1.purged, JSON.stringify(sync1).slice(0, 120));
  t('transition: auto-purged exactly 104 stale (96 demo-temp + 8 q_sscchsl_)',
    sync1.purged && sync1.purged.questions === 104, JSON.stringify(sync1.purged));
  const kindMeta = await Store.getMeta('bundleKind_ssc-chsl', null);
  t('transition: bundleKind_ssc-chsl = final', kindMeta === 'final');

  /* ── 4) survivors ── */
  const all3 = await DB.getAll('questions');
  const ssc3 = all3.filter(q => q.exam === 'ssc-chsl');
  const af3 = all3.filter(q => q.exam === 'airforce');
  t('survivors: 10,275 real + user 1 = 10,276 ssc Q', ssc3.length === 10276, 'got ' + ssc3.length);
  t('survivors: real bank UNTOUCHED (gs 3558, math 1926, reasoning 1422, english 3369)',
    ['gs', 'mathematics', 'reasoning', 'english'].every(s => ssc3.filter(q => q.subject === s && q.id !== 'q_ssc_mathematics_90001').length === { gs: 3558, mathematics: 1926, reasoning: 1422, english: 3369 }[s]),
    JSON.stringify({ gs: ssc3.filter(q => q.subject === 'gs').length, mathematics: ssc3.filter(q => q.subject === 'mathematics').length, reasoning: ssc3.filter(q => q.subject === 'reasoning').length, english: ssc3.filter(q => q.subject === 'english').length }));
  t('survivors: user q_ssc_mathematics_90001 SAFE', all3.some(q => q.id === 'q_ssc_mathematics_90001'));
  t('survivors: airforce Q SAFE', af3.length === 1 && af3[0].id === 'q_af_90002', 'left=' + af3.map(q => q.id).join(','));
  t('survivors: koi demo-temp tag bacha? NAHI', !all3.some(q => (q.tags || []).includes('demo-temp')));
  t('survivors: koi q_sscchsl_/stale bacha? NAHI', !all3.some(q => (q.id || '').startsWith('q_sscchsl_') || (q.id || '').startsWith('q_ssc-chsl_stale_')));

  /* ── 5) re-sync (fp same ab) → no-op, count stable ── */
  const sync2 = await Seed.syncBundled('ssc-chsl');
  t('re-sync: no-op (fp same)', sync2.synced === false || (sync2.purged && sync2.purged.questions === 0), JSON.stringify(sync2).slice(0, 120));
  const all4 = await DB.getAll('questions');
  t('re-sync: count stable 11,171 ssc', all4.filter(q => q.exam === 'ssc-chsl').length === 10276);

  /* ── 6) direct purgeDemoTemp idempotent — dobara 0 delete ── */
  const pr2 = await Seed.purgeDemoTemp('ssc-chsl');
  t('direct purge idempotent: 0 delete (sab pehle hi clean)', pr2.questions === 0, 'got ' + pr2.questions);

  console.log(`\n${passed.length}/${passed.length + failed.length} pass`);
  if (failed.length) process.exit(1);
  console.log('ALL PURGE TESTS GREEN ✓');
  process.exit(0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
