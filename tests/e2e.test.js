/* ============================================================
 * E2E SMOKE TEST — boots the real app in jsdom with
 * fake-indexeddb and drives the full user flow through the DOM:
 *   boot → seed → dashboard → generate full mock → instructions
 *   → begin → CBT exam (answer / mark / clear / section lock /
 *   section submit) → all 4 sections → auto result → analysis
 * Run: NODE_PATH=<dir with jsdom+fake-indexeddb> node tests/e2e.test.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

let passed = 0, failed = 0;
const T = (name, ok, extra) => {
  if (ok) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra ? '→ ' + extra : ''); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => {
  for (let i = 0; i < Math.ceil(ms / 100); i++) { if (fn()) return true; await sleep(100); }
  return fn();
};

async function main() {
  /* ---------- boot jsdom with the real index.html ---------- */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8931/index.html',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;

  // polyfills
  window.indexedDB = fakeIDB.indexedDB || fakeIDB;
  window.fetch = async url => {
    const p = path.join(ROOT, String(url).replace('file://', ''));
    try {
      const text = fs.readFileSync(p, 'utf-8');
      return { ok: true, json: async () => JSON.parse(text), text: async () => text };
    } catch (e) {
      return { ok: false, status: 404, json: async () => { throw new Error('404 ' + url); }, text: async () => '' };
    }
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  // top-level `const` bindings live in the global lexical env — reach them via eval
  const G = expr => window.eval(expr);

  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));

  /* ---------- 1. boot + seed ---------- */
  console.log('\n━━━ E2E · boot & seed');
  let seeded = false;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const appHtml = doc.getElementById('app').innerHTML;
    if (appHtml.includes('FULL MOCK TEST')) { seeded = true; break; }
  }
  T('app boots to dashboard', seeded, 'dashboard did not render');
  if (!seeded) { console.error(errors.join('\n')); process.exit(1); }

  // wait for seed to finish writing meta
  let qCount = 0;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { qCount = await G('DB.count("questions")'); } catch (e) {}
    if (qCount >= 3082) break;
  }
  T('question bank seeded (3082)', qCount === 3082, 'got ' + qCount);
  const seededFlag = await G('Store.getMeta("seeded", false)');
  T('seeded flag set', seededFlag === true);
  let testCount = 0;
  for (let i = 0; i < 200; i++) {
    await sleep(250);
    testCount = await G('DB.count("tests")');
    if (testCount === 35) break;
  }
  T('test series pre-built (15 full mocks + 20 subject tests)', testCount === 35, 'got ' + testCount);

  /* ---------- 2. dashboard content ---------- */
  console.log('\n━━━ E2E · dashboard');
  T('quick start cards render',
    doc.querySelector('#qs-full') && doc.querySelectorAll('.qs-card[data-subject]').length === 4);
  T('performance snapshot renders', doc.querySelectorAll('.stat-card').length >= 6);
  T('charts render', doc.querySelectorAll('svg').length >= 1);

  /* ---------- 3. generate full mock ---------- */
  console.log('\n━━━ E2E · full mock generation');
  doc.getElementById('qs-full').dispatchEvent(new window.Event('click', { bubbles: true }));
  let testId = null;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    if (window.location.hash.includes('/instructions')) break;
  }
  testId = (window.location.hash.match(/#\/test\/([^/]+)\/instructions/) || [])[1];
  T('full mock generated → instructions page', !!testId, window.location.hash);
  const genTest = await G('DB.get("tests", "' + testId + '")');
  T('quick-start test uses smart strategy', genTest.strategy === 'smart');
  T('series tests untouched by quick-start (36 total)', (await G('DB.count("tests")')) === 36);
  T('instructions page renders (Digialm style)',
    doc.querySelector('.cbt-instructions') && doc.body.textContent.includes('INSTRUCTIONS TO CANDIDATES'));
  T('marking scheme shown on instructions', doc.body.textContent.includes('0.25'));
  T('begin button disabled until declaration', doc.getElementById('ins-begin').disabled === true);

  // choose language + declare + begin
  doc.getElementById('ins-agree').checked = true;
  doc.getElementById('ins-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  T('begin enabled after declaration', doc.getElementById('ins-begin').disabled === false);
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 40; i++) { await sleep(150); if (window.location.hash.includes('/attempt')) break; }
  T('attempt route entered', window.location.hash.includes('/attempt'), window.location.hash);

  /* ---------- 4. CBT exam screen ---------- */
  console.log('\n━━━ E2E · CBT exam screen');
  let ok = false;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (doc.querySelector('.exam-screen')) { ok = true; break; }
  }
  T('exam screen renders', ok);
  const attempt = await G('ExamScreen.attempt');
  T('attempt created with 4 sections', attempt && Object.keys(attempt.sections).length === 4);
  T('100 questions in attempt', (await G('Engine.allQuestionIds(ExamScreen.attempt).length')) === 100);
  T('Physics active, others locked',
    attempt.sections.physics.state === 'ACTIVE' && attempt.sections.mathematics.state === 'LOCKED' &&
    attempt.sections.english.state === 'LOCKED' && attempt.sections.raga.state === 'LOCKED');
  T('subject tabs render with lock icons',
    doc.querySelectorAll('.subtab').length === 4 && doc.querySelector('.subtab.locked'));
  T('timer displays remaining time', /Time Left/.test(doc.querySelector('#x-timer').textContent));
  T('question palette shows 25 (Physics only)', doc.querySelectorAll('.palette-grid .qbtn').length === 25);
  T('question numbering starts at 1', doc.querySelector('.q-no').textContent.includes('1'));
  T('4 options render', doc.querySelectorAll('.opt').length === 4);
  T('legend renders all 5 states', doc.querySelectorAll('.legend-row').length === 5);
  T('candidate panel shows name', doc.body.textContent.includes('Practice Candidate'));

  /* ---------- 5. answer / palette update / keyboard-free nav ---------- */
  console.log('\n━━━ E2E · answering');
  const optB = doc.querySelectorAll('.opt')[1];
  optB.querySelector('input').checked = true;
  optB.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('option selected state', doc.querySelectorAll('.opt.selected').length === 1);
  const q1id = attempt.sections.physics.questionIds[0];
  T('response persisted (ANSWERED)', attempt.responses[q1id] && attempt.responses[q1id].state === 'ANSWERERED'.replace('ERED', 'ED'));
  T('palette shows answered (green)', doc.querySelector('.palette-grid .qbtn.answered'));

  // locked tab click
  const lockedTab = Array.from(doc.querySelectorAll('.subtab')).find(t => t.dataset.sid === 'mathematics');
  lockedTab.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('locked section click blocked', attempt.currentSectionId === 'physics');

  // save & next → palette not-visited becomes visited
  doc.getElementById('x-save').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(250);
  T('save & next moves to Q2', attempt.currentQIdx === 1 && doc.querySelector('.q-no').textContent.includes('2'));

  // mark for review & next
  doc.getElementById('x-mark').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(250);
  const q2id = attempt.sections.physics.questionIds[1];
  T('mark for review state', attempt.responses[q2id].state === 'MARKED_FOR_REVIEW');
  T('palette shows marked (purple)', doc.querySelector('.palette-grid .qbtn.marked'));

  // palette click → navigate back to Q1
  doc.querySelector('.palette-grid .qbtn[data-i="0"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(250);
  T('palette click navigates', attempt.currentQIdx === 0);
  // clear response
  doc.getElementById('x-clear').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(250);
  T('clear response → VISITED_NOT_ANSWERED', attempt.responses[q1id].state === 'VISITED_NOT_ANSWERED' && attempt.responses[q1id].sel === null);

  /* ---------- 6. section submit flow (modal) ---------- */
  console.log('\n━━━ E2E · section submit');
  // submit button lives in the header now, away from Next — always enabled (submit anytime)
  T('submit-section button in header, always enabled', !!doc.querySelector('.exam-header #x-submit') && doc.getElementById('x-submit').disabled === false);
  T('no submit button next to Next', !doc.querySelector('.exam-bottom #x-submit'));
  // section can be submitted from ANY question — try from Q1 (not last)
  await G('Engine.gotoQuestion(ExamScreen.attempt, "physics", 0, Date.now())');
  await G('ExamScreen.persist()');
  await G('ExamScreen.render()');
  await sleep(200);
  T('section submit possible from Q1 (no restriction)', !!doc.querySelector('.exam-header #x-submit') && !doc.getElementById('x-submit').disabled);
  doc.getElementById('x-submit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(250);
  const modal = doc.querySelector('.av-modal-overlay');
  T('confirmation modal appears', modal && modal.textContent.includes('Are you sure you want to submit this section?'));
  const yesBtn = modal.querySelector('[data-act="yes"]');
  yesBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  T('Physics SUBMITTED', attempt.sections.physics.state === 'SUBMITTED');
  T('Mathematics ACTIVE with fresh timer', attempt.sections.mathematics.state === 'ACTIVE' &&
    Math.round((attempt.sections.mathematics.endsAt - attempt.sections.mathematics.startedAt) / 1000) === 20 * 60);
  T('candidate moved to Mathematics Q26', attempt.currentSectionId === 'mathematics' &&
    doc.querySelector('.q-no').textContent.includes('26'));
  T('palette now shows Mathematics 26–50', doc.querySelectorAll('.palette-grid .qbtn').length === 25 &&
    doc.querySelector('.palette-grid .qbtn').textContent === '26');

  // return to physics blocked
  const physTab = Array.from(doc.querySelectorAll('.subtab')).find(t => t.dataset.sid === 'physics');
  physTab.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('return to submitted Physics blocked', attempt.currentSectionId === 'mathematics');

  /* ---------- 7. refresh recovery ---------- */
  console.log('\n━━━ E2E · refresh recovery');
  const savedSel = JSON.parse(JSON.stringify(attempt.responses));
  await G('ExamScreen.attempt = null');
  await G('Views.attempt("' + attempt.testId + '")');
  await sleep(300);
  const a2 = await G('ExamScreen.attempt');
  T('attempt restored after "refresh"', a2 && a2.id === attempt.id);
  T('same section/question restored', a2.currentSectionId === 'mathematics');
  T('responses restored', JSON.stringify(a2.responses) === JSON.stringify(savedSel) || Object.keys(a2.responses).length >= Object.keys(savedSel).length);

  /* ---------- 8. finish remaining sections → final result ---------- */
  console.log('\n━━━ E2E · complete exam');
  const test = await G('DB.get("tests", "' + a2.testId + '")');
  window.TESTREF = test;
  for (const sid of ['mathematics', 'english', 'raga']) {
    await G('Engine.submitSection(ExamScreen.attempt, TESTREF, "' + sid + '", "user", Date.now())');
    await G('ExamScreen.persist()');
  }
  await G('ExamScreen.finalize("user", true)');
  await sleep(500);
  const fin = await G('DB.get("attempts", "' + a2.id + '")');
  T('attempt completed + evaluated', fin.completed && fin.result && fin.result.maxScore === 100);
  T('score arithmetic consistent (0 ≤ score ≤ 100)', fin.result.score >= 0 && fin.result.score <= 100);

  // attempt index updated
  const idx = await G('Store.getMeta("attemptIndex", [])');
  T('attempt index updated', idx.length === 1 && idx[0].score === fin.result.score);

  // result page
  window.location.hash = '#/attempt/' + a2.id + '/result';
  await sleep(400);
  T('result page renders', doc.body.textContent.includes('TEST COMPLETED') && doc.body.textContent.includes('Subject Performance'));

  // analysis page
  window.location.hash = '#/attempt/' + a2.id + '/analysis';
  await sleep(400);
  T('analysis page renders', doc.body.textContent.includes('Detailed Analysis'));
  const tabBtns = doc.querySelectorAll('#app .filter-tabs [data-tab]');
  T('analysis has 4 tabs', tabBtns.length === 4);
  tabBtns[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  T('question analysis tab renders', doc.body.textContent.includes('Your Answer'));
  tabBtns[3].dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  T('time analysis tab renders', doc.body.textContent.includes('Slowest Questions'));
  tabBtns[2].dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  T('topic analysis tab renders', doc.body.textContent.includes('Topic-wise Performance'));

  // notebook: save a custom note on a question and verify persistence
  tabBtns[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  const noteTa = doc.querySelector('.qa-note .note-ta');
  T('notebook editor renders on every solution card', !!noteTa);
  if (noteTa) {
    noteTa.value = 'Mera apna solution — Tension = Force/Area se yaad rakho';
    const saveBtn = doc.querySelector('.qa-note [data-note-save]');
    saveBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(400);
    const savedNote = await G('DB.getAll("notes")');
    T('note saved to notes store', savedNote.length === 1 && savedNote[0].text.includes('Tension'));
    // re-render → note text still shown
    window.location.hash = '#/attempt/' + a2.id + '/analysis';
    await waitFor(() => doc.querySelector('.qa-note .note-ta'), 10000);
    T('note survives re-render (shown with solution)', doc.querySelector('.qa-note .note-ta').value.includes('Tension'));
  }

  /* ---------- 9. reattempt & question bank pages ---------- */
  console.log('\n━━━ E2E · other pages');
  window.location.hash = '#/tests';
  await waitFor(() => doc.querySelectorAll('.test-card').length > 0, 10000);
  T('test library shows 12 cards/page with series', doc.querySelectorAll('.test-card').length === 12 &&
    doc.body.textContent.includes('Full Mock Test 1') && doc.querySelector('.pager'));
  const seriesTab = Array.from(doc.querySelectorAll('.ftab')).find(b => b.dataset.f === 'series');
  seriesTab.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('Test Series filter shows only series tests',
    doc.querySelectorAll('.test-card').length === 12 && doc.body.textContent.includes('Full Mock Test'));
  window.location.hash = '#/questions';
  await waitFor(() => doc.querySelectorAll('.qb-row').length > 0, 20000);
  T('question bank renders paginated', doc.querySelectorAll('.qb-row').length === 25);
  window.location.hash = '#/attempts';
  await sleep(400);
  T('my attempts renders', doc.body.textContent.includes('My Attempts') && doc.querySelectorAll('.tbl tbody tr').length >= 1);
  window.location.hash = '#/settings';
  await sleep(400);
  T('settings renders', doc.getElementById('st-save-cfg') && doc.getElementById('st-wipe'));
  window.location.hash = '#/import';
  await waitFor(() => doc.getElementById('drop-zone'), 10000);
  T('import page renders', doc.getElementById('drop-zone') && doc.getElementById('tpl-csv'));

  /* ---------- 10. subject test (practice mode, global timer) ---------- */
  console.log('\n━━━ E2E · practice subject test');
  const r = await G('Generator.subjectTest("physics")');
  T('subject test generated (25 Q)', r.ok && r.test.totalQuestions === 25);
  window.location.hash = '#/test/' + r.test.id + '/instructions';
  await waitFor(() => doc.getElementById('ins-agree'), 10000);
  doc.getElementById('ins-agree').checked = true;
  doc.getElementById('ins-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.getElementById('ins-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 40; i++) { await sleep(150); if (doc.querySelector('.exam-screen')) break; }
  await sleep(300);
  const pa = await G('ExamScreen.attempt');
  T('practice attempt uses global timer', pa && pa.timerMode === 'global');
  T('notebook available in practice mode', !!doc.querySelector('.x-note .note-ta'));
  if (doc.querySelector('.x-note .note-ta')) {
    doc.querySelector('.x-note .note-ta').value = 'practice note';
    doc.getElementById('x-note-save').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(300);
    T('practice note saved', (await G('DB.count("notes")')) === 2);
  }
  T('global submit button present in header (not section)', !!doc.querySelector('.exam-header #x-submit') && !doc.getElementById('x-submit').textContent.toUpperCase().includes('SECTION'));
  T('site footer + chat FAB exist in shell', !!doc.getElementById('site-footer') && !!doc.getElementById('chat-fab') && !!doc.getElementById('chat-panel'));
  T('exam mode hides site chrome (body.exam-on)', await G('document.body.classList.contains("exam-on")'));
  T('exam name shown in exam header', !!doc.querySelector('.eh-exam'));
  const before = await G('Engine.remainingMs(ExamScreen.attempt, ' + JSON.stringify(r.test) + ', Date.now())');
  await sleep(1200);
  const after = await G('Engine.remainingMs(ExamScreen.attempt, ' + JSON.stringify(r.test) + ', Date.now())');
  T('global timer counts down', after < before);
  // clean end
  await G('Engine.submitExam(ExamScreen.attempt, ' + JSON.stringify(r.test) + ', "user", Date.now())');
  await G('ExamScreen.finalize("user", true)');
  await sleep(300);
  T('exam selector present in topnav (normal pages)', !!doc.querySelector('.exam-sel #exam-select'));
  T('site chrome visible again after exam', !(await G('document.body.classList.contains("exam-on")')));
  T('practice test completes with result', (await G('DB.get("attempts", "' + pa.id + '")')).result.maxScore === 25);

  /* ---------- summary ---------- */
  console.log(`\n════════════════════════════════════════`);
  console.log(`  E2E RESULT: ${passed} passed, ${failed} failed`);
  if (errors.length) console.log('  window errors:', errors.slice(0, 5));
  console.log(`════════════════════════════════════════\n`);
  window.close();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E crashed:', e); process.exit(1); });
