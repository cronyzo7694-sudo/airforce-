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
  t('bank files: english 25 + gs 25 + math 25 + reasoning 25', raw.english.length === 25 && raw.gs.length === 25 && raw.mathematics.length === 25 && raw.reasoning.length === 25,
    JSON.stringify(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.length]))));
  const rfig = raw.reasoning.filter(q => q.figureBased);
  t('reasoning: 7 figure Qs RESTORED (HTML export se) — sab ke paas image + option-images', rfig.length === 7 && rfig.every(q => q.image && q.options.every(o => o.img || o.text)),
    'fig:' + rfig.length);
  const pyq = f => f.every(q => q.correctAnswer && q.explanation && /2024/.test(String(q.year || '')) && /Shift/.test(q.source || ''));
  t('english PYQ: sab keyed + explained + paper-tagged', pyq(raw.english), 'checks fail');
  t('gs PYQ: sab keyed + explained + paper-tagged', pyq(raw.gs), 'checks fail');
  t('gs file AS-IS: subject=ga (import-time gs routing)', raw.gs.every(q => q.subject === 'ga'), 'subject drift');
  t('math PYQ: sab keyed + explained + paper-tagged', pyq(raw.mathematics), 'checks fail');
  t('math DI images: 4 figure Qs, sab Cloudinary URL', raw.mathematics.filter(q => q.figureBased).length === 4
    && raw.mathematics.filter(q => q.figureBased).every(q => /^\[https:\/\/res\.cloudinary\.com\/[^)]+\)$/.test(q.image)), 'img wrap fail');

  const rep = await Seed.seedIfNeeded(true, 'ssc-chsl');
  t('seed: 100 imported (25×4)', rep.imported === 100, 'got ' + rep.imported);
  t('seed: bySubject 25/25/25/25', rep.bySubject.english === 25 && rep.bySubject.gs === 25 && rep.bySubject.mathematics === 25 && rep.bySubject.reasoning === 25,
    JSON.stringify(rep.bySubject));
  const meta = await Store.getMeta('seeded_ssc-chsl', false);
  t('seed: seeded flag exam-scoped set', meta === true);
  const sscQ = (await DB.getAll('questions')).filter(q => q.exam === 'ssc-chsl');
  t('seed: DB me 100 SSC Q (25×4 — ga alias routed)', sscQ.length === 100
    && sscQ.filter(q => q.subject === 'english').length === 25 && sscQ.filter(q => q.subject === 'gs').length === 25
    && sscQ.filter(q => q.subject === 'mathematics').length === 25 && sscQ.filter(q => q.subject === 'reasoning').length === 25, 'got ' + sscQ.length);

  /* generate: empty bank par crash NAHI — graceful {ok:false,error} */
  let fm;
  try { fm = await Generator.fullMock(); } catch (e) { fm = { ok: false, error: 'THREW: ' + e.message }; }
  t('fullMock: 100 Qs — 4 sections × 25 (poora CHSL pattern, reasoning sahit)', fm && fm.ok === true && fm.test && fm.test.sections.length === 4 && fm.test.sections.every(s => s.questionIds.length === 25), JSON.stringify(fm && fm.error || 'ok'));
  let st;
  try { st = await Generator.subjectTest('reasoning'); } catch (e) { st = { ok: false, error: 'THREW: ' + e.message }; }
  t('subjectTest(reasoning): OK — 25 Qs ab bank me (7 figure-Qs sahit)', st && st.ok === true && st.test && st.test.sections[0].questionIds.length === 25, st && st.error || 'ok');
  let bs;
  try { bs = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 }); } catch (e) { bs = { ok: false, error: 'THREW: ' + e.message }; }
  t('buildSeries: bank exhausted (fullMock 100 + reasoning subject-test ne reserve kiya) — made 0, graceful', bs && bs.ok === true && bs.made === 0 && bs.full === 0, JSON.stringify(bs));
  let et;
  try { et = await Generator.subjectTest('english'); } catch (e) { et = { ok: false, error: 'THREW: ' + e.message }; }
  t('subjectTest(english): OK — 25 PYQ se test banta hai', et && et.ok === true && et.test && et.test.sections[0].questionIds.length === 25, et && et.error || 'ok');
  let gt;
  try { gt = await Generator.subjectTest('gs'); } catch (e) { gt = { ok: false, error: 'THREW: ' + e.message }; }
  t('subjectTest(gs): OK — ga-aliased 25 PYQ se test banta hai', gt && gt.ok === true && gt.test && gt.test.sections[0].questionIds.length === 25, gt && gt.error || 'ok');
  let mt;
  try { mt = await Generator.subjectTest('mathematics'); } catch (e) { mt = { ok: false, error: 'THREW: ' + e.message }; }
  const mtQs = (mt && mt.ok) ? await DB.getMany('questions', mt.test.sections[0].questionIds) : [];
  t('subjectTest(math): OK — 25 Qs (4 DI image Qs sahit)', mt && mt.ok === true && mtQs.length === 25 && mtQs.filter(q => q.image).length === 4, mt && mt.error || 'img count ' + mtQs.filter(q => q.image).length);

  /* heal: empty bank par bhi graceful — missing detect, made 0, tries guard */
  const h = await Seed.healSeries('ssc-chsl');
  t('healSeries: complete — sab subjects ke KHULE (unattempted) tests hain, healed 0, insufficient []', h && (h.healed || 0) === 0 && h.complete === true && Array.isArray(h.insufficient) && h.insufficient.length === 0, JSON.stringify(h));

  /* v1.4.78 REPEAT POLICY: GS test attempt karo → heal naya GS test banae
     (attempted Qs wapas pool me) — "GS ka test nahi bana" bug ka regression */
  const allT = await DB.getAll('tests');
  const gsT = allT.find(x => x.type === 'subject' && x.sections && x.sections[0] && x.sections[0].subjectId === 'gs');
  t('repeat-setup: GS test library me hai', !!gsT, gsT ? 'ok' : 'missing');
  if (gsT) {
    await DB.put('attempts', { id: 'a_cv_gs1', testId: gsT.id, startedAt: Date.now(), finishedAt: Date.now(), status: 'done' });
    /* unattempted full mock bhi GS Qs reserve karta hai — usse bhi attempt
       karo (real-user scenario: pura pending khel liya) */
    const fullT = (await DB.getAll('tests')).find(x => x.type === 'full');
    if (fullT) await DB.put('attempts', { id: 'a_cv_full1', testId: fullT.id, startedAt: Date.now(), finishedAt: Date.now(), status: 'done' });
    const h2 = await Seed.healSeries('ssc-chsl');
    const gsCount = (await DB.getAll('tests')).filter(x => x.type === 'subject' && x.sections && x.sections[0] && x.sections[0].subjectId === 'gs').length;
    t('repeat-policy: GS (+full) attempt ke baad heal ne GS Test 2 banaya (attempted Qs freed)', h2 && h2.healed === 1 && gsCount === 2, JSON.stringify(h2) + ' gsCount=' + gsCount);
    const h3 = await Seed.healSeries('ssc-chsl');
    const gsCount3 = (await DB.getAll('tests')).filter(x => x.type === 'subject' && x.sections && x.sections[0] && x.sections[0].subjectId === 'gs').length;
    t('repeat-policy: pending GS#2 khula hai to heal aur NAHI banata (self-limiting)', h3 && (h3.healed || 0) === 0 && gsCount3 === 2, JSON.stringify(h3) + ' gsCount=' + gsCount3);
  }

  /* marking config — shell hamesha sahi (naye questions aane par turant ready) */
  t('SSC marking config: +2 / −0.5 / maxMarks 200', SSC.marking.correct === 2 && SSC.marking.wrong === -0.5 && SSC.maxMarks === 200,
    JSON.stringify({ m: SSC.marking, max: SSC.maxMarks }));
  t('SSC subjects: reasoning,gs,mathematics,english × 25Q × 15-min', SSC.subjects.map(s => s.id).join(',') === 'reasoning,gs,mathematics,english'
    && SSC.subjects.every(s => s.questions === 25 && s.duration === 900), JSON.stringify(SSC.subjects));

  console.log(`\n${passed}/${passed + failed} pass${failed ? ' — FIX NEEDED' : ' ✓ ALL GREEN'}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
