/* ============================================================
 * MIGRATION TEST — real-device simulation:
 *   old v1.4.2 bank + 18-Sep-2026 bad push (wrong subjects) +
 *   orphaned series tests → syncBundled() → clean 641-record
 *   fully-bilingual RAGA bank, zero dupes, history preserved.
 * Needs /tmp/old-raga-1221.json (git show c7da952:...) + /tmp/remote-raga.json
 * Run: NODE_PATH=<jsdom dir> node tests/migration.test.js
 * ============================================================ */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');
const ROOT = '/home/user/agniveer-cbt';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 25000) => { for (let i = 0; i < ms / 100; i++) { if (await fn()) return true; await sleep(100); } return await fn(); };
let P = 0, F = 0;
const T = (n, ok, x) => { if (ok) { P++; console.log('  ✓', n); } else { F++; console.error('  ✗', n, x !== undefined ? '→ ' + x : ''); } };

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:8931/index.html', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  const { window } = dom; const doc = window.document;
  window.indexedDB = fakeIDB.indexedDB || fakeIDB;
  window.fetch = async url => {
    const p = path.join(ROOT, String(url).replace('file://', '').replace(/^https?:\/\/[^/]+\//, ''));
    try { const text = fs.readFileSync(p, 'utf-8'); return { ok: true, json: async () => JSON.parse(text), text: async () => text }; }
    catch (e) { return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' }; }
  };
  window.scrollTo = () => {}; window.HTMLElement.prototype.scrollTo = () => {};
  const G = e => window.eval(e);
  await waitFor(() => (doc.getElementById('app') || {}).innerHTML.includes('FULL MOCK TEST'), 60000);
  await waitFor(async () => { try { return (await G('DB.count("questions")')) >= 2700; } catch (e) { return false; } }, 60000);
  console.log('fresh boot:', await G('DB.count("questions")'), 'questions |', await G('DB.count("tests")'), 'tests');

  /* ── turn into a real v1.4.2 device ── */
  await G('DB.clear("questions")'); await G('DB.clear("tests")'); await G('DB.clear("attempts")');
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'old-raga-1221.json'), 'utf-8'));
  const core = ['physics', 'mathematics', 'english'].flatMap(s => JSON.parse(fs.readFileSync('data/bank-' + s + '.json', 'utf-8')));
  window.__oldArr = core.concat(old);
  const rep = await G('(async () => Bank.importBatch(window.__oldArr))()');
  T('old v1.4.2 bank imported (v1.4.17 core 2098 + old raga 1221)', rep && rep.imported > 3300, JSON.stringify(rep && { i: rep.imported, d: rep.duplicates }));

  /* ── bad push pollution (as it really happened: original subjects, direct DB write) ── */
  const his = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'remote-raga-802.json'), 'utf-8'));
  // real devices never got separate rows for questions whose hash matched a real
  // bank record (importBatch deduped/upgraded them) — exclude those from injection
  const AVUtil = require('/home/user/agniveer-cbt/js/util.js');
  const dId = q => AVUtil.hash([q.subject, q.questionText, (q.options||[]).map(o => o.text).join(' | ')].join('␟'));
  const realHashes = new Set(['physics','mathematics','english'].flatMap(s => JSON.parse(fs.readFileSync('data/bank-' + s + '.json', 'utf-8'))).map(dId));
  const valid = his.filter(q => q.options && q.options.length >= 4 && q.questionText && q.correctAnswer).filter(q => !realHashes.has(dId(q)));
  window.__badArr = valid.map((q, i) => Object.assign({}, q, { id: 'bad_' + i }));
  const nBad = await G('(async () => { let n = 0; for (const q of window.__badArr) { q.dupeHash = Bank.dupeId(q); await DB.put("questions", q); n++; } return n; })()');
  T('bad-push pollution injected (' + valid.length + ' records, subjects reasoning/mathematics/general-awareness)', nBad === valid.length);

  /* ── orphaned test scenarios ── */
  const oldMasterQFile = old.find(q => !his.some(h => h.questionText.slice(0, 60) === q.questionText.slice(0, 60))); // retired old-master question
  // importBatch reassigns ids via contentId — take the record's REAL id from the DB
  window.__omf = oldMasterQFile;
  const oldMasterQ = await G('(async () => { const dh = Bank.dupeId(window.__omf); const all = await DB.getAll("questions"); return all.find(x => x.dupeHash === dh) || null; })()');
  T('old-master question present in DB before migration', !!oldMasterQ);
  const newQ = JSON.parse(fs.readFileSync('data/bank-raga.json', 'utf-8'))[0]; // a survivor
  window.__tests = [
    { id: 't_orphan', name: 'Series Test referencing pruned question', series: true, type: 'subject', sections: [{ subjectId: 'raga', questionIds: [oldMasterQ.id] }] },
    { id: 't_custom', name: 'Custom test referencing pruned question', series: false, type: 'subject', sections: [{ subjectId: 'raga', questionIds: [oldMasterQ.id] }] },
    { id: 't_att', name: 'Attempted series test referencing pruned question', series: true, type: 'subject', sections: [{ subjectId: 'raga', questionIds: [oldMasterQ.id] }] },
    { id: 't_ok', name: 'Series test on surviving question', series: true, type: 'subject', sections: [{ subjectId: 'raga', questionIds: [newQ.id] }] }
  ];
  window.__attempt = { id: 'a_1', testId: 't_att', completed: false };
  await G('(async () => { for (const t of window.__tests) await DB.put("tests", t); await DB.put("attempts", window.__attempt); return true; })()');
  T('scenario tests + attempt placed', true);

  /* ── stale fingerprint → run the migration ── */
  await G('Store.setMeta("bundleFP", "stale-v1.4.2-fp")');
  await G('Store.setMeta("retiredV", 0)');
  const r = await G('Bank.syncBundled()');
  console.log('syncBundled →', JSON.stringify(r));
  T('sync ran', r && r.synced === true);
  T('imported new records (' + (r && r.imported) + ')', r && r.imported > 0 && r.imported < 200); // v1.4.15 cleanup: mostly prunes, sirf restored/merged records naye
  T('pruned pollution + retired (' + (r && r.pruned) + ')', r && r.pruned > 1000);

  /* ── verify final state ── */
  const fin = await G('(async () => { const all = await DB.getAll("questions"); return { total: all.length, subjects: [...new Set(all.map(q => q.subject))], raga: all.filter(q => q.subject === "raga").length, ragaBi: all.filter(q => q.subject === "raga" && q.questionTextHi && q.explanationHi).length, bad: all.filter(q => String(q.subject).match(/reasoning|general-awareness/)).length, hashes: new Set(all.map(q => q.dupeHash)).size }; })()');
  console.log('final state:', JSON.stringify(fin));
  T('total questions = 2080 core + 641 raga = 2721 (v1.4.19: english passage-merge + 18 removals)', fin.total === 2721, fin.total);
  T('no foreign subjects left', fin.bad === 0 && fin.subjects.every(s => ['physics','mathematics','english','raga'].includes(s)), JSON.stringify(fin.subjects));
  T('raga pool = 641', fin.raga === 641, fin.raga);
  T('every raga record fully bilingual', fin.ragaBi === 641, fin.ragaBi);
  T('zero duplicate dupeHashes', fin.hashes === fin.total, fin.hashes + ' vs ' + fin.total);
  const tst = await G('(async () => { const ts = await DB.getAll("tests"); const qs = new Set((await DB.getAllKeys("questions"))); const ids = ts.map(t => t.id).sort(); const orphans = ts.filter(t => t.series && t.sections.some(s => (s.questionIds||[]).some(qid => !qs.has(qid)))).map(t => t.id); return { ids, orphans }; })()');
  T('orphaned series test deleted, custom + attempted + clean kept (autoBuild ke naye series tests allowed)',
    ['t_att','t_custom','t_ok'].every(x => tst.ids.includes(x)) && !tst.ids.includes('t_orphan'),
    JSON.stringify(tst.ids));
  const notes = await G('(async () => { await DB.put("notes", { id: "n1", qid: "' + newQ.id + '", text: "mera note" }); return true; })()');
  T('note write ok on survivor', notes === true);
  const rerun = await G('Bank.syncBundled()');
  T('second sync = no-op (fingerprint stable)', rerun && rerun.synced === false, JSON.stringify(rerun));

  console.log('\nPROBE v1.4.3 RESULT: ' + P + ' passed, ' + F + ' failed');
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
