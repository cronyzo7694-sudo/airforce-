/* v1.4.47 — demo-temp PURGE unit test (fake-indexeddb, no full app boot)
   v1.4.54: REAL GS bank (2827 Q, demo-temp tag NAHI) + 3 demo subjects
   (32×3 = 96, demo-temp tag) → purge sirf 96 delete karega, GS safe.
   User ki q_ssc_* Q + airforce Q → kabhi safe. */
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

  // ── 1) SSC temp bank seed (32×4 = 128) ──
  console.log('━━━ seed SSC temp bank');
  const rep = await Seed.seedIfNeeded(false, 'ssc-chsl');
  t('seed: imported 2923 (2827 GS real + 96 demo)', rep.imported === 2923, 'got ' + rep.imported);
  t('seed: gs 2827 + 3 subjects × 32', rep.bySubject.gs === 2827 && [ 'mathematics', 'reasoning', 'english' ].every(k => rep.bySubject[k] === 32), JSON.stringify(rep.bySubject));
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped', meta === true);

  // sab Q me demo-temp tag + exam
  const sscQ = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: demo-temp tag SIRF 96 demo Q me (GS real me nahi)', sscQ.filter(q => (q.tags || []).includes('demo-temp')).length === 96 && sscQ.filter(q => q.subject === 'gs').every(q => !(q.tags || []).includes('demo-temp')), 'demo-temp=' + sscQ.filter(q => (q.tags || []).includes('demo-temp')).length);

  // ── 2) user ki REAL final Q + airforce Q daalo (SAFE hone chahiye) ──
  await DB.bulkPut('questions', [
    { id: 'q_ssc_mathematics_90001', exam: 'ssc-chsl', subject: 'mathematics', subjectName: 'QA', chapter: 'X', topic: 'X', difficulty: 'easy', questionText: 'user real Q', questionTextHi: 'q', image: null, options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }], correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: ['ssc-chsl'], figureBased: false, paper: 'Tier-I' },
    { id: 'q_af_90002', exam: 'airforce', subject: 'physics', subjectName: 'Physics', chapter: 'X', topic: 'X', difficulty: 'easy', questionText: 'airforce Q', questionTextHi: 'q', image: null, options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }], correctAnswer: 'A', explanation: 'e', explanationHi: 'e', source: 'user', year: '2024', tags: [], figureBased: false, paper: 'P1' }
  ]);

  // ── 3) PURGE ──
  console.log('━━━ purgeDemoTemp(ssc-chsl)');
  const pr = await Seed.purgeDemoTemp('ssc-chsl');
  t('purge: exactly 96 demo deleted (GS 2827 SAFE)', pr.questions === 96, 'got ' + pr.questions);

  // ── 4) survivors ──
  const all = await DB.getAll('questions');
  const sscLeft = all.filter(q => q.exam === 'ssc-chsl');
  const afLeft = all.filter(q => q.exam === 'airforce');
  t('user q_ssc_* SAFE + GS real 2827 SAFE', sscLeft.length === 2828 && sscLeft.some(q => q.id === 'q_ssc_mathematics_90001') && sscLeft.filter(q => q.subject === 'gs').length === 2827, 'left=' + sscLeft.length);
  t('airforce Q SAFE', afLeft.length === 1 && afLeft[0].id === 'q_af_90002', 'left=' + afLeft.map(q => q.id).join(','));
  t('koi q_sscchsl_ bacha? NAHI', !all.some(q => (q.id || '').startsWith('q_sscchsl_')));
  t('koi demo-temp tag bacha? NAHI', !all.some(q => (q.tags || []).includes('demo-temp')));

  // ── 5) re-seed (final files aane jaisa) → 128 wapas + survivors ──
  await Store.setMeta('seeded_ssc-chsl', false);
  const rep2 = await Seed.seedIfNeeded(false, 'ssc-chsl');
  t('re-seed: sirf 96 demo wapas aaye (GS already present — dupe skip)', rep2.imported === 96, 'got ' + rep2.imported);
  const all2 = await DB.getAll('questions');
  t('re-seed: total 2925 (2923+user+af)', all2.length === 2925, 'got ' + all2.length);
  t('re-seed: user Q ab bhi safe', all2.some(q => q.id === 'q_ssc_mathematics_90001'));

  // ════════════════════════════════════════════════════════════
  // ── 6) FINAL TRANSITION: bank-meta _bundleKind "final" aaya →
  //        syncBundled PEHLE demo-temp purge kare, phir final import ──
  console.log('━━━ syncBundled final-transition (auto-purge)');
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('bank-meta.json')) {
      return { ok: true, json: async () => ({ _bundleKind: 'final' }), text: async () => '{"_bundleKind":"final"}' };
    }
    if (u.includes('data/ssc-chsl/bank-')) {
      // "final files" jaisa: q_ssc_* ids, demo-temp tag NAHI
      const arr = JSON.parse(fs.readFileSync(path.join(ROOT, u.replace(/^https?:\/\/[^/]+\//, '')), 'utf8'))
        .map(q => ({ ...q, id: q.id.replace('q_sscchsl_', 'q_ssc_final_'), tags: ['ssc-chsl'], source: 'FINAL BANK' }));
      const text = JSON.stringify(arr);
      return { ok: true, json: async () => arr, text: async () => text };
    }
    return origFetch(url);
  };
  // pehle transition ke pehle state: 2923 seeded + user 1 + af 1 = 2925
  const sync1 = await Seed.syncBundled('ssc-chsl');
  t('transition: synced', sync1.synced === true);
  t('transition: purged 96 temp (GS 2827 already-safe re-import)', sync1.purged && sync1.purged.questions === 96, JSON.stringify(sync1.purged));
  const all3 = await DB.getAll('questions');
  const ssc3 = all3.filter(q => q.exam === 'ssc-chsl');
  t('transition: final 2923 + user 1 = 2924 ssc Q', ssc3.length === 2924, 'got ' + ssc3.length);
  t('transition: final content present — GS 2827 + demo 96 sab (dupes merge)', ssc3.filter(q => q.source === 'FINAL BANK').length === 96 && ssc3.length === 2924, 'imported=' + ssc3.filter(q => q.source === 'FINAL BANK').length);
  t('transition: app-ids q_ssc-chsl_<hash> scheme (2923 = GS+demo, user id alag)', ssc3.filter(q => q.id.startsWith('q_ssc-chsl_')).length === 2923);
  t('transition: koi demo-temp tag nahi', !all3.some(q => (q.tags || []).includes('demo-temp')));
  t('transition: user q_ssc_mathematics_90001 safe', all3.some(q => q.id === 'q_ssc_mathematics_90001'));
  t('transition: airforce safe', all3.filter(q => q.exam === 'airforce').length === 1);
  const kindMeta = await Store.getMeta('bundleKind_ssc-chsl', null);
  t('transition: bundleKind_ssc-chsl = final', kindMeta === 'final');

  // ── 7) dobara sync (fp same ab) → no-op, aur purge bhi nahi ──
  const sync2 = await Seed.syncBundled('ssc-chsl');
  t('re-sync: no-op (fp same)', sync2.synced === false || (sync2.purged && sync2.purged.questions === 0), JSON.stringify(sync2));
  const all4 = await DB.getAll('questions');
  t('re-sync: count stable', all4.filter(q => q.exam === 'ssc-chsl').length === 2924);
  global.fetch = origFetch;

  console.log(`\n${passed.length}/${passed.length + failed.length} pass`);
  if (failed.length) process.exit(1);
  console.log('ALL PURGE TESTS GREEN ✓');
  process.exit(0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
