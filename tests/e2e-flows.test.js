/* ============================================================
 * E2E FLOWS DEEP-DIVE — the less-travelled user journeys:
 *   time-up auto-submit · section-timer expiry · keyboard nav ·
 *   pause/resume · custom test builder · bank edit · settings
 *   save/JSON · real CSV import · attempts delete/reattempt ·
 *   fresh-retake question swap
 * Run: NODE_PATH=<dir with jsdom+fake-indexeddb> node tests/e2e-flows.test.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => {
  for (let i = 0; i < Math.ceil(ms / 100); i++) { if (await fn()) return true; await sleep(100); }
  return await fn();
};

let passed = 0, failed = 0;
const T = (name, ok, extra) => {
  if (ok) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra !== undefined ? '→ ' + extra : ''); }
};

async function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:8931/index.html', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;
  window.indexedDB = fakeIDB.indexedDB || fakeIDB;
  window.fetch = async url => {
    const p = path.join(ROOT, String(url).replace('file://', '').replace(/^https?:\/\/[^/]+\//, ''));
    try {
      const text = fs.readFileSync(p, 'utf-8');
      return { ok: true, json: async () => JSON.parse(text), text: async () => text };
    } catch (e) { return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' }; }
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  const errs = [];
  window.addEventListener('error', e => errs.push(e.message));
  window.addEventListener('unhandledrejection', e => { errs.push('REJ: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); console.log('    [rejection]', e.reason && (e.reason.stack || e.reason.message || e.reason)); });
  const G = expr => window.eval(expr);

  await waitFor(() => doc.getElementById('app').innerHTML.includes('FULL MOCK TEST'), 60000);
  await waitFor(async () => { try { return (await G('DB.count("tests")')) === 35; } catch (e) { return false; } }, 60000);
  console.log('\n━━━ FLOWS · booted + series ready');
  await G('(function(){ const o = AVUtil.toast.bind(AVUtil); window.__toastLog = []; AVUtil.toast = function(msg, kind){ window.__toastLog.push([Date.now(), String(msg).slice(0, 50), (new Error().stack || "").split("\\n")[2].trim().slice(0, 90)]); return o(msg, kind); }; })()');


  /* ============ 1. custom test builder ============ */
  console.log('\n━━━ FLOWS · custom test builder');
  window.location.hash = '#/tests/new';
  await waitFor(() => doc.getElementById('b-generate'), 15000);
  T('builder renders with 4 section rows', doc.querySelectorAll('.b-section').length === 4);
  doc.getElementById('b-name').value = 'My Physics Blast';
  const physSec = doc.querySelector('.b-section[data-sid="physics"]');
  physSec.querySelector('.b-use').checked = true;
  physSec.querySelector('.b-count').value = '10';
  physSec.querySelector('.b-min').value = '8';
  doc.getElementById('b-generate').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => window.location.hash.includes('/instructions'), 15000);
  const builtId = (window.location.hash.match(/#\/test\/([^/]+)\/instructions/) || [])[1];
  T('builder generates test → instructions', !!builtId);
  const built = await G('DB.get("tests", "' + builtId + '")');
  T('built test: 10 questions, practice mode, global timer',
    built && built.totalQuestions === 10 && built.mode === 'practice' && built.timerMode === 'global');

  // builder validation: absurd count → availability error, no crash
  window.location.hash = '#/tests/new';
  await waitFor(() => doc.getElementById('b-generate'), 15000);
  const mSec = doc.querySelector('.b-section[data-sid="mathematics"]');
  mSec.querySelector('.b-use').checked = true;
  mSec.querySelector('.b-count').value = '5000';
  doc.getElementById('b-generate').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(800);
  T('impossible count → friendly error, stays on builder',
    !window.location.hash.includes('/instructions') &&
    (doc.body.textContent.includes('Not enough') || doc.body.textContent.includes('available') || doc.querySelector('.toast, .av-toast')));
  await G('Router.go("/dashboard")'); await sleep(300);

  /* ============ 2. pause/resume (practice) ============ */
  console.log('\n━━━ FLOWS · pause & resume');
  const p = await G('Generator.generate({ name: "Pause test", type: "subject", mode: "practice", allowPause: true, sections: [{ subjectId: "physics", count: 5 }] })');
  window.location.hash = '#/test/' + p.test.id + '/instructions';
  await sleep(500); // let double-render settle (jsdom fires hashchange twice)
  await waitFor(() => doc.getElementById('ins-agree'), 15000);
  await sleep(300);
  await G('const ag = document.getElementById("ins-agree"); ag.checked = true; ag.dispatchEvent(new Event("change", {bubbles:true})); document.getElementById("ins-begin").disabled = false;');
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.querySelector('.exam-screen'), 20000); await sleep(400);
  const pauseBtn = doc.getElementById('x-pause');
  T('pause button visible (allowed)', !!pauseBtn);
  if (pauseBtn) {
    pauseBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(300);
    T('paused overlay shows', doc.querySelector('.pause-overlay, .x-paused') || doc.body.textContent.includes('Paused'));
    const resumeBtn = doc.getElementById('x-resume') || Array.from(doc.querySelectorAll('button')).find(b => /resume/i.test(b.textContent));
    T('resume button present', !!resumeBtn);
    if (resumeBtn) { resumeBtn.dispatchEvent(new window.Event('click', { bubbles: true })); await sleep(300); }
    T('exam back after resume', !!doc.querySelector('.exam-screen') && !doc.getElementById('pause-veil'));
  }

  /* ============ 3. keyboard navigation ============ */
  console.log('\n━━━ FLOWS · keyboard navigation');
  const before = await G('ExamScreen.attempt.currentQIdx');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(300);
  const after = await G('ExamScreen.attempt.currentQIdx');
  T('ArrowRight → next question', after === before + 1, before + '→' + after);
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await sleep(300);
  T('ArrowLeft → previous question', (await G('ExamScreen.attempt.currentQIdx')) === before);
  // number keys 1-4 select options
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  await sleep(300);
  T('key "2" selects option B', (await G('ExamScreen.attempt.responses[ExamScreen.attempt.sections[ExamScreen.attempt.currentSectionId].questionIds[ExamScreen.attempt.currentQIdx]].sel')) === 'B');

  /* ============ 4. global time-up auto-submit ============ */
  console.log('\n━━━ FLOWS · global time-up auto-submit');
  // shrink remaining time to ~2s
  await G('ExamScreen.attempt.endsAt = Date.now() + 1200; ExamScreen.persist()');
  let done = false;
  for (let i = 0; i < 250 && !done; i++) {
    await sleep(100);
    done = window.location.hash.includes('/result') ||
      !!(await G('(async () => { const a = await DB.getAll("attempts"); return a.find(x => x.testId === "' + p.test.id + '" && x.completed); })()'));
  }
  T('time-up → auto-submitted', done);

  /* ============ 5. section-timer expiry (exam mode) ============ */
  console.log('\n━━━ FLOWS · section-timer expiry');
  const f = await G('Generator.fullMock()');
  window.location.hash = '#/test/' + f.test.id + '/instructions';
  await sleep(500);
  const insUp = await waitFor(() => doc.getElementById('ins-agree'), 15000);
  await sleep(300);
  await G('const ag = document.getElementById("ins-agree"); ag.checked = true; ag.dispatchEvent(new Event("change", {bubbles:true})); document.getElementById("ins-begin").disabled = false;');
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.querySelector('.exam-screen'), 20000); await sleep(400);
  // expire the physics section
  await G('ExamScreen.attempt.sections.physics.startedAt = Date.now() - 21*60*1000; ExamScreen.attempt.sections.physics.endsAt = Date.now() + 1200; ExamScreen.persist()');
  const physDone = await waitFor(async () => ['EXPIRED', 'SUBMITTED'].includes(await G('ExamScreen.attempt.sections.physics.state')), 20000);
  T('physics section auto-submitted on time-up', physDone);
  if (physDone) {
    T('maths section auto-activated', (await G('ExamScreen.attempt.sections.mathematics.state')) === 'ACTIVE',
      await G('ExamScreen.attempt.sections.mathematics.state'));
    T('candidate landed on maths Q26', (await G('ExamScreen.attempt.currentSectionId')) === 'mathematics' &&
      (await G('ExamScreen.attempt.currentQIdx')) === 0,
      await G('ExamScreen.attempt.currentSectionId') + '#' + await G('ExamScreen.attempt.currentQIdx'));
  }
  // finish the whole exam quickly via engine
  await G('(function(){ const a=ExamScreen.attempt; const t=window.__T; })()');
  const TREF2 = await G('DB.get("tests", ExamScreen.attempt.testId)'); window.TREF2 = TREF2;
  await G('Engine.submitExam(ExamScreen.attempt, TREF2, "user", Date.now()); ExamScreen.finalize("user", true)');
  await sleep(500);
  T('full exam completed after section expiry flow', (await G('DB.get("attempts", ExamScreen.attempt.id)')).result.maxScore === 100);

  /* ============ 6. fresh retake = different questions ============ */
  console.log('\n━━━ FLOWS · retake with fresh questions');
  const t1Attempt = await G('(async () => (await DB.byIndex("attempts", "testId", "' + f.test.id + '")).filter(x => x.completed)[0])()');
  const t1qids = t1Attempt.sections.physics.questionIds;
  window.location.hash = '#/test/' + f.test.id + '/instructions';
  await sleep(500);
  await waitFor(() => doc.getElementById('ins-agree'), 15000);
  await sleep(300);
  await G('const ag = document.getElementById("ins-agree"); ag.checked = true; ag.dispatchEvent(new Event("change", {bubbles:true})); document.getElementById("ins-begin").disabled = false;');
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.querySelector('.exam-screen'), 20000); await sleep(400);
  const t2qids = await G('ExamScreen.attempt.sections.physics.questionIds');
  const overlap = t1qids.filter(q => t2qids.includes(q)).length;
  T('fresh retake swaps in unseen questions (≤30% overlap)', overlap <= 7, overlap + ' of 25 overlap');
  // abandon this attempt cleanly
  await G('Engine.submitExam(ExamScreen.attempt, TREF2, "user", Date.now()); ExamScreen.finalize("user", true)');

  /* ============ 7. question bank edit + note ============ */
  console.log('\n━━━ FLOWS · question bank edit');
  window.location.hash = '#/questions';
  await waitFor(() => doc.querySelectorAll('.qb-row').length > 0, 30000);
  // wait until the DOM settles (jsdom fires hashchange twice → bank renders twice;
  // clicking between renders hits a stale node that render#2 then wipes)
  {
    let last = -1, same = 0;
    for (let i = 0; i < 120; i++) {
      const h = (doc.getElementById('app') || {}).innerHTML.length;
      if (h === last) { if (++same >= 5) break; } else same = 0;
      last = h;
      await sleep(150);
    }
  }
  await sleep(300);
  const firstRow = doc.querySelector('.qb-row');
  const editBtn = firstRow.querySelector('[data-act="edit"]');
  T('bank row has edit action', !!editBtn);
  editBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('qe-save'), 10000);
  await sleep(400);
  const qid = firstRow.dataset.id;
  T('edit modal opens with note field', !!doc.getElementById('qe-note'));
  doc.getElementById('qe-note').value = 'bank-level note test';
  if (!doc.getElementById('qe-text').value.trim()) doc.getElementById('qe-text').value = 'Edited question text?';
  ['A', 'B', 'C', 'D'].forEach(L => { const i = doc.getElementById('qe-opt-' + L); if (i && !i.value.trim()) i.value = 'Option ' + L; });
  doc.getElementById('qe-save').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => !doc.getElementById('qe-ov'), 10000);
  const savedNote = await G('(async () => DB.get("notes", "' + qid + '"))()');
  T('bank edit saves note', savedNote && savedNote.text === 'bank-level note test');
  const savedQ = await G('(async () => DB.get("questions", "' + qid + '"))()');
  T('question record clean (no _noteText leak)', savedQ && !('_noteText' in savedQ));

  console.log('\n━━━ FLOWS · settings');
  window.location.hash = '#/settings';
  await waitFor(() => doc.getElementById('st-save-cfg'), 15000);
  doc.getElementById('st-name').value = 'Manash Test';
  doc.getElementById('st-save-cand').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(500);
  const cfg1 = await G('(async () => Store.getSetting("config", null))()');
  T('settings save persists candidate name', cfg1 && cfg1.candidateName === 'Manash Test', JSON.stringify(cfg1 && cfg1.candidateName));
  // invalid JSON rejected by the config save
  doc.getElementById('st-json').value = '{ broken json';
  doc.getElementById('st-save-cfg').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(500);
  const cfg2 = await G('(async () => Store.getSetting("config", null))()');
  T('invalid JSON editor input rejected safely', cfg2 && cfg2.candidateName === 'Manash Test', JSON.stringify(cfg2 && cfg2.candidateName));
  // candidate name flows to exam screen
  const s3 = await G('Generator.subjectTest("english")');
  window.location.hash = '#/test/' + s3.test.id + '/instructions';
  await sleep(500);
  const engIns = await waitFor(() => doc.getElementById('ins-agree'), 15000);
  await sleep(300);
  await G('const ag = document.getElementById("ins-agree"); ag.checked = true; ag.dispatchEvent(new Event("change", {bubbles:true})); document.getElementById("ins-begin").disabled = false;');
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  const examUp = await waitFor(() => doc.querySelector('.exam-screen'), 20000);
  await sleep(600);
  const candShown = examUp && await G('document.querySelector(".cand-name") ? document.querySelector(".cand-name").textContent : "no el"');
  T('candidate name shows in exam header', candShown === 'Manash Test', 'got: ' + candShown);
  await G('(async () => { const t = await DB.get("tests", ExamScreen.attempt.testId); Engine.submitExam(ExamScreen.attempt, t, "user", Date.now()); await ExamScreen.finalize("user", true); })()');

  /* ============ 9. real CSV import through the UI ============ */
  console.log('\n━━━ FLOWS · CSV import through UI');
  window.location.hash = '#/import';
  await waitFor(() => doc.getElementById('file-input'), 15000);
  const csv = 'subject,question,optionA,optionB,optionC,optionD,answer,explanation\n' +
    'physics,"UiImport Q: speed of light?","3e8 m/s","300 km/h","3e8 km/s","30 m/s",A,"c = 3×10^8 m/s"\n' +
    'physics,"UiImport Q2: F = ?","ma","mv","m/a","m^2a",A,"Newton"\n';
  await sleep(500);
  const file = new window.File([csv], 'my-questions.csv', { type: 'text/csv' });
  let importStarted = false;
  for (let tries = 0; tries < 3 && !importStarted; tries++) {
    const fi = doc.getElementById('file-input');
    if (!fi) break;
    Object.defineProperty(fi, 'files', { value: [file], configurable: true });
    fi.dispatchEvent(new window.Event('change', { bubbles: true }));
    importStarted = await waitFor(async () =>
      /Parsing|Importing|Saving/.test((await G('document.getElementById("imp-status") ? document.getElementById("imp-status").textContent : ""')) || ''), 6000);
  }
  T('import handler started', importStarted);
  const repShown = await waitFor(() => (doc.getElementById('imp-report') && doc.getElementById('imp-report').innerHTML || '').length > 50, 45000);
  if (!repShown) console.log('    [imp-dbg] status:', await G('document.getElementById("imp-status") ? document.getElementById("imp-status").textContent : "no status el"'),
    '| errors div:', await G('document.getElementById("imp-errors") ? document.getElementById("imp-errors").innerHTML.slice(0, 200) : "none"'));
  const report = (doc.getElementById('imp-report') || {}).textContent || '';
  T('import report rendered', /Imported/i.test(report) || /Questions Found/i.test(report), report.slice(0, 80));
  const imported = await G('(async () => (await DB.getAll("questions")).filter(q => (q.questionText || "").includes("UiImport Q")).length)()');
  T('CSV questions actually in bank', imported >= 1, 'found ' + imported);

  /* ============ 10. attempts page: delete & reattempt ============ */
  console.log('\n━━━ FLOWS · attempts history');
  window.location.hash = '#/attempts';
  await waitFor(() => doc.querySelector('.tbl tbody tr, .attempts-list, .att-row') || doc.body.textContent.includes('My Attempts'), 15000);
  await sleep(500);
  const rows = doc.querySelectorAll('.tbl tbody tr').length || doc.querySelectorAll('[data-attempt-id]').length;
  T('attempts listed (' + rows + ')', rows >= 3);
  // reattempt first listed test
  const reat = Array.from(doc.querySelectorAll('a, button')).find(b => /reattempt/i.test(b.textContent));
  T('reattempt link available', !!reat);
  if (reat) {
    window.location.hash = reat.getAttribute('href').slice(1);
    await sleep(500);
    const reatIns = await waitFor(() => doc.getElementById('ins-agree'), 15000);
    T('reattempt → instructions', reatIns);
    await G('Router.go("/attempts")'); await sleep(500);
  }
  // delete an attempt
  const delBtn = Array.from(doc.querySelectorAll('button')).find(b => /delete|del\b|trash/i.test(b.textContent) || b.title === 'Delete');
  if (delBtn) {
    const before2 = await G('DB.count("attempts")');
    delBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(300);
    const confirmYes = doc.querySelector('.av-modal-overlay [data-act="yes"], .av-modal-overlay .btn-danger');
    if (confirmYes) { confirmYes.dispatchEvent(new window.Event('click', { bubbles: true })); await sleep(500); }
    const after2 = await G('DB.count("attempts")');
    T('attempt deleted after confirm', after2 === before2 - 1, before2 + '→' + after2);
  } else { console.log('  ! delete button not found — check attempts UI'); }

  /* ============ summary ============ */
  console.log(`\n════════════════════════════════════════`);
  console.log(`  FLOWS RESULT: ${passed} passed, ${failed} failed`);
  if (errs.length) console.log('  window errors:', errs.slice(0, 5));
  console.log(`════════════════════════════════════════\n`);
  window.close();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('FLOWS crashed:', e); process.exit(1); });
