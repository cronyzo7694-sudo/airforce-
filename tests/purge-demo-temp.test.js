/* v1.4.70 — purgeBankReplace + healSeries unit test (fake-indexedb)
   SSC PERMANENT RESET ke baad: bundled bank 0-Q hai. Ye test purge MECHANICS
   synthetic data se verify karta hai: stale/demo Q inject → purgeBankReplace
   → sirf user 'manual' + airforce bache; unattempted series tests saaf,
   attempted history safe; replace-cycle (import → purge) sahi; healSeries
   synthetic pool se missing subject tests top-up kare. */
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

/* synthetic question factory */
const mkQ = (id, exam, subject, subjectName, tags, i, extra) => Object.assign({
  id, subject, subjectName, chapter: 'SynChapter ' + (i % 6), topic: 'SynTopic ' + (i % 5),
  difficulty: 'easy', questionText: 'SYNTH ' + id + ' value of ' + i + '?', questionTextHi: null, image: null,
  options: [{ id: 'A', text: 'a' + i, textHi: 'a' + i }, { id: 'B', text: 'b' + i, textHi: 'b' + i }, { id: 'C', text: 'c' + i, textHi: 'c' + i }, { id: 'D', text: 'd' + i, textHi: 'd' + i }],
  correctAnswer: 'A', explanation: 'syn', explanationHi: null, source: 'test', year: 2026,
  tags, dupeHash: 'dh_' + id, figureBased: false, paper: null, exam
}, extra || {});

(async () => {
  await sleep(50);

  /* ── 1) seed: english 25 real PYQ bank ── */
  console.log('━━━ seed PYQ bank (25×4 — reasoning figure Qs restored)');
  const rep = await Seed.seedIfNeeded(true, 'ssc-chsl');
  t('seed: imported 100 (25×4)', rep.imported === 100, 'got ' + rep.imported);
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped', meta === true);
  const sscQ0 = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: 100 SSC Q in DB', sscQ0.length === 100 && sscQ0.filter(q => q.subject === 'english').length === 25 && sscQ0.filter(q => q.subject === 'gs').length === 25 && sscQ0.filter(q => q.subject === 'mathematics').length === 25 && sscQ0.filter(q => q.subject === 'reasoning').length === 25, 'got ' + sscQ0.length);

  /* ── 2) stale demo + user manual + airforce inject ── */
  console.log('━━━ inject: 5 stale demo Q + 1 user manual Q + 1 airforce Q');
  const staleQs = [];
  for (let i = 1; i <= 5; i++)
    staleQs.push(mkQ('q_sscchsl_stale_' + i, 'ssc-chsl', 'gs', 'General Awareness', ['demo-temp'], i, { source: 'demo' }));
  const userQ = mkQ('q_ssc_mathematics_90001', 'ssc-chsl', 'mathematics', 'Mathematics', ['manual'], 1,
    { questionText: 'USER ka khud ka question 2+2?', source: 'Manual entry', correctAnswer: 'B' });
  const afQ = mkQ('q_af_90002', 'airforce', 'physics', 'Physics', [], 1, { questionText: 'AIRFORCE question 1+1?' });
  await DB.bulkPut('questions', [...staleQs, userQ, afQ]);
  const all1 = await DB.getAll('questions');
  t('inject: 100 + 5 stale + 1 user + 1 af = 107', all1.length === 107, 'got ' + all1.length);

  /* unattempted series test (stale Q refer) + attempted test */
  const staleId = staleQs[0].id;
  const seriesTestId = 'test_series_stale_' + Date.now();
  await DB.put('tests', { id: seriesTestId, series: true, exam: 'ssc-chsl', sections: [{ subject: 'gs', questionIds: [staleId] }], createdAt: Date.now() });
  const attTestId = 'test_att_' + Date.now();
  await DB.put('tests', { id: attTestId, series: true, exam: 'ssc-chsl', sections: [{ subject: 'gs', questionIds: [staleId] }], createdAt: Date.now() });
  await DB.put('attempts', { id: 'att_1', testId: attTestId, exam: 'ssc-chsl', submittedAt: Date.now(), result: { score: 1 } });

  /* ── 3) purgeBankReplace — SSC reset purge ── */
  console.log('━━━ purgeBankReplace (reset)');
  const pr = await Seed.purgeBankReplace('ssc-chsl');
  t('purge: non-manual 105 deleted (100 real bank + 5 stale — manual SAFE)', pr.questions === 105, 'got ' + pr.questions);
  t('purge: unattempted stale series test dropped', pr.tests >= 1, 'got ' + pr.tests);
  const all2 = await DB.getAll('questions');
  const ssc2 = all2.filter(q => q.exam === 'ssc-chsl');
  t('purge: sirf user manual ssc bacha (1)', ssc2.length === 1, 'got ' + ssc2.length);
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

  /* ── 4) replace-cycle: synthetic import → purge → manual safe ── */
  console.log('━━━ replace-cycle: import 3 synthetic → purge → re-import');
  const synth = [
    mkQ('q_ssc_synth_1', 'ssc-chsl', 'gs', 'General Awareness', ['bank'], 1),
    mkQ('q_ssc_synth_2', 'ssc-chsl', 'gs', 'General Awareness', ['bank'], 2),
    mkQ('q_ssc_synth_3', 'ssc-chsl', 'english', 'English Language', ['bank'], 3)
  ];
  const re = await Seed.importBatch(synth, null, 'ssc-chsl');
  t('import synthetic bank: 3', re.imported === 3, 'got ' + re.imported);
  const pr2 = await Seed.purgeBankReplace('ssc-chsl');
  t('re-purge: 3 deleted (user manual protected)', pr2.questions === 3, 'got ' + pr2.questions);
  const finalQs = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('final: user manual 1 bacha', finalQs.length === 1 && finalQs[0].id === 'q_ssc_mathematics_90001', 'got ' + finalQs.length);

  /* ── 5) healSeries: synthetic pool se missing subject tests top-up ── */
  console.log('━━━ healSeries: synthetic 160-Q pool (40×4) auto-fix');
  await DB.delete('questions', 'q_ssc_mathematics_90001');
  const pool = [];
  const subs = [['reasoning', 'General Intelligence & Reasoning'], ['gs', 'General Awareness'], ['mathematics', 'Quantitative Aptitude'], ['english', 'English Language']];
  for (const [sid, sname] of subs)
    for (let i = 0; i < 40; i++) pool.push(mkQ('q_ssc_pool_' + sid + '_' + i, 'ssc-chsl', sid, sname, ['bank'], i));
  await DB.bulkPut('questions', pool);
  const pre = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('heal setup: 160 synthetic ssc Q', pre.length === 160, 'got ' + pre.length);
  /* koi series SUBJECT test nahi (attTestId ka type undefined hai → missing) */
  const h1 = await Seed.healSeries('ssc-chsl');
  t('heal: missing detect + synthetic pool se top-up (made>0)', (h1.healed || 0) >= 4, JSON.stringify(h1));
  let lib = (await DB.getAll('tests')).filter(x => x.exam === 'ssc-chsl' && x.series);
  const perSub = {};
  lib.filter(x => x.type === 'subject').forEach(x => { perSub[x.sections[0].subjectId] = (perSub[x.sections[0].subjectId] || 0) + 1; });
  t('heal: chaaron subjects ke subject tests wapas', ['gs', 'mathematics', 'reasoning', 'english'].every(s => (perSub[s] || 0) >= 1), JSON.stringify(perSub));
  t('heal: koi full mock nahi bana (path-a, fullMocks=0)', lib.filter(x => x.type === 'full').length === 0, 'got ' + lib.filter(x => x.type === 'full').length);
  t('heal: attempted history SAFE (att_1 + test)', (await DB.getAll('attempts')).some(a => a.id === 'att_1') && (await DB.getAll('tests')).some(x => x.id === attTestId));
  const h2 = await Seed.healSeries('ssc-chsl');
  t('heal: complete library par no-op (idempotent)', h2.complete === true && h2.healed === 0, JSON.stringify(h2));

  console.log(`\n${passed.length}/${passed.length + failed.length} pass`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
