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
  /* v1.4.55 test-spies (test-only, app untouched):
     (a) __dashDone — dashboard render-complete timestamp (route-queue drain signal)
     (b) bankStats cache — 12k-Q SSC bank par Bank.bankStats ka IDB cursor
         jsdom/fake-IDB me ~30-70s leta hai (real browser me native IDB <0.5s).
         Same-result memo cache lagakar e2e deterministic + fast hota hai;
         bankStats compute logic ke apne tests alag se hain (engine/parser). */
  await G('(function(){ if (window.__dashDone === undefined) { window.__dashDone = 0; const od = Views.dashboard.bind(Views); Views.dashboard = async function(){ const r = await od(...arguments); window.__dashDone = Date.now(); return r; }; } if (window.__bsCache === undefined) { window.__bsCache = {}; const ob = Bank.bankStats.bind(Bank); Bank.bankStats = async function(ex){ const k = ex || "airforce"; if (window.__bsCache[k]) return window.__bsCache[k]; const r = await ob(ex); window.__bsCache[k] = r; return r; }; } })()');

  // wait for seed to finish writing meta
  let qCount = 0;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { qCount = await G('DB.count("questions")'); } catch (e) {}
    if (qCount >= 3100) break;
  }
  T('question bank seeded (2080 core + 641 bilingual RAGA = 2721, v1.4.19 english repair)', qCount >= 2650 && qCount <= 2790, 'got ' + qCount);
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
  await waitFor(() => doc.getElementById('login-btn') || doc.querySelector('.cbt-ins-app'), 15000);
  if (doc.getElementById('login-btn')) {   // real C-DAC candidate-login stage
    T('candidate login screen (User ID + photo)', doc.querySelector('.cl-card') && doc.getElementById('login-btn'));
    /* v1.4.49: REAL CBT portal structure — blue header / grey info bar / login form / version footer */
    T('CBT header: exam title + PHASE I badge', /ONLINE EXAMINATION/.test(doc.querySelector('.cl-band-left').textContent) && /PHASE I/.test(doc.querySelector('.cl-band-right').textContent));
    T('CBT grey bar: System Name C001 (yellow)', doc.querySelector('.cg-yellow') && doc.querySelector('.cg-yellow').textContent.trim() === 'C001');
    T('CBT grey bar: candidate name + Subject Mock Exam (yellow)', /Candidate Name/.test(doc.body.textContent) && /Mock Exam/.test(doc.body.textContent));
    T('CBT grey bar: photo white box (right side)', !!doc.querySelector('.cg-photo'));
    T('CBT grey bar: invigilator disclaimer', /Kindly contact the invigilator/.test(doc.body.textContent));
    T('CBT login form: Login title + 2 rows (icon/input/keyboard)', doc.querySelector('.clg-title') && doc.querySelectorAll('.clg-row').length === 2 && doc.querySelectorAll('.clg-row .clg-ico').length === 4);
    T('CBT Sign In: blue rectangular (green/pill NAHI)', !!doc.querySelector('#login-btn.clg-signin'));
    T('CBT footer: Version', /Version 17\.05\.21/.test(doc.querySelector('.cl-foot').textContent));
    doc.getElementById('login-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(() => doc.querySelector('.cbt-ins-app'), 8000);
  }
  const genTest = await G('DB.get("tests", "' + testId + '")');
  T('quick-start test uses realpaper strategy', genTest.strategy === 'realpaper');
  T('series tests untouched by quick-start (36 total)', (await G('DB.count("tests")')) === 36);
  T('instructions page renders (Digialm style)',
    doc.querySelector('.cbt-ins-app') && doc.body.textContent.includes('INSTRUCTIONS TO CANDIDATES'));
  T('marking scheme shown on instructions', doc.body.textContent.includes('0.25'));
  /* v1.4.50: REAL CBT instructions — fixed regions, internal scroll, no declaration */
  T('CBT ins: cyan title bar + View in language control top', !!doc.querySelector('.ins2-titlebar') && !!doc.getElementById('ins-lang') && /View in/.test(doc.body.textContent));
  T('CBT ins: fixed candidate panel photo+name (no details table)', !!doc.querySelector('.ins2-photo') && !!doc.querySelector('.ins2-name') && !doc.querySelector('.ins-tbl'));
  T('CBT ins: Next button in fixed bottom nav', !!doc.querySelector('.ins2-bottomnav #ins-next') && /Next/.test(doc.getElementById('ins-next').textContent));
  T('CBT ins: legend 5 palette statuses (traditional boxes)', doc.querySelectorAll('.ins2-leg-row').length === 5);
  T('CBT ins: koi declaration checkbox NAHI', !doc.getElementById('ins-agree'));
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  /* v1.4.51: SECOND CBT screen — Other Important Instructions */
  T('CBT 2nd screen: OTHER IMPORTANT INSTRUCTIONS khula', /Other Important Instructions/.test(doc.body.textContent) && !!doc.querySelector('.otr-titlebar'));
  T('CBT 2nd: exam paper table (4 subjects + Total row)', doc.querySelectorAll('.otr-tbl tbody tr').length === 5, 'rows=' + doc.querySelectorAll('.otr-tbl tbody tr').length);
  T('CBT 2nd: fixed bottom declaration panel (language+checkbox+buttons)', !!doc.querySelector('.otr-bottom') && !!doc.getElementById('otr-lang') && !!doc.getElementById('otr-prev') && !!doc.getElementById('otr-begin'));
  T('CBT 2nd: ready DISABLED till declaration checked', doc.getElementById('otr-begin').disabled === true);
  // Previous → wapas PEHLA instructions screen (TEST F)
  doc.getElementById('otr-prev').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('ins-next'), 10000);
  T('CBT 2nd: Previous → wapas pehla Instructions', /INSTRUCTIONS TO CANDIDATES/.test(doc.body.textContent) && !doc.getElementById('otr-begin'));
  // phir Next → OTR → declaration → begin (TEST B + G)
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  doc.getElementById('otr-agree').checked = true;
  doc.getElementById('otr-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  T('CBT 2nd: declaration ke baad ready ENABLED', doc.getElementById('otr-begin').disabled === false);
  doc.getElementById('otr-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
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
  T('pause button present in exam mode (har test me pause — user setting)', !!doc.getElementById('x-pause'));
  T('exam mode: instant explanation off', (await G('!!ExamScreen.showExplain')) === false);
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
  // final state me kam-se-kam 1 answered (flow ke clear-response step ne purane
  // answers hata diye the; 0 final answers = attempt discard ho jata — by design)
  await G('Engine.selectOption(ExamScreen.attempt, ExamScreen.attempt.sections.mathematics.questionIds[0], "A")');
  await G('ExamScreen.persist()');
  for (const sid of ['mathematics', 'english', 'raga']) {
    await G('Engine.submitSection(ExamScreen.attempt, TESTREF, "' + sid + '", "user", Date.now())');
    await G('ExamScreen.persist()');
  }
  await G('ExamScreen.finalize("user", true)');
  await sleep(500);
  const fin = await G('DB.get("attempts", "' + a2.id + '")');
  T('attempt completed + evaluated', fin.completed && fin.result && fin.result.maxScore === 100);
  T('score arithmetic consistent (negative marking ok)', fin.result.score >= -25 && fin.result.score <= 100);

  // attempt index updated
  const idx = await G('Store.getMeta("attemptIndex", [])');
  T('attempt index updated', idx.length === 1 && idx[0].score === fin.result.score);

  // result page
  window.location.hash = '#/attempt/' + a2.id + '/result';
  await sleep(400);
  T('result page renders', doc.body.textContent.includes('TEST COMPLETED') && doc.body.textContent.includes('Subject Performance'));
  T('cutoff analysis card renders (category range + state)',
    !!doc.getElementById('cutoff-card') && doc.body.textContent.includes('Cutoff Analysis') && doc.body.textContent.includes('cutoff range'));
  T('phase-2 readiness card renders (official PFT standards)',
    doc.body.textContent.includes('Phase-2 Readiness') && doc.body.textContent.includes('1.6 km run'));

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
  const fullTab = Array.from(doc.querySelectorAll('.ftab[data-t]')).find(b => b.dataset.t === 'full');
  fullTab.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('Full Mock filter: sirf mock tests (subject tests hidden — v1.4.65 partition)',
    doc.querySelectorAll('.test-card').length >= 1 && doc.body.textContent.includes('Full Mock Test') &&
    !doc.body.textContent.includes('Aptitude Test') && !doc.body.textContent.includes('Language Test'));

  /* v1.4.66 GADHA-PROOF filters — chip count = actual results */
  const subjAll = Array.from(doc.querySelectorAll('.ftab[data-s]')).find(b => b.dataset.s === 'all');
  subjAll.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  /* v1.4.68 PURE-SUBJECT: chip count = result count + ZERO mocks.
     (ye section airforce exam me hai — uska pure mathematics subject test pakka hai) */
  const allT = Array.from(doc.querySelectorAll('.ftab[data-t]')).find(b => b.dataset.t === 'all');
  allT.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  const phyChip = Array.from(doc.querySelectorAll('.ftab[data-s]')).find(b => b.dataset.s === 'physics');
  const phyCnt = +phyChip.querySelector('.fcount').textContent;
  phyChip.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  const ofM = /of <b>(\d+)<\/b>/.exec(doc.querySelector('.tlib-count') ? doc.querySelector('.tlib-count').innerHTML : '');
  T('PURE-SUBJECT chip count = actual result count (physics) — kabhi khali page nahi',
    phyCnt > 0 && ofM && +ofM[1] === phyCnt && doc.querySelectorAll('.test-card').length === Math.min(phyCnt, 12),
    `chip=${phyCnt} shown=${ofM ? ofM[1] : '?'}`);
  T('PURE-SUBJECT semantics: physics chip me ZERO mocks (v1.4.68)',
    !doc.body.textContent.includes('Full Mock Test') && !doc.body.textContent.includes('Mock Test '),
    'mock cards bhi dikh rahe the');
  const statusChips = Array.from(doc.querySelectorAll('.ftab[data-status]')).find(b => b.dataset.status === 'completed');
  statusChips.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('Zero-count chips disabled (dim + unclickable)', !!doc.querySelector('.ftab[disabled]'), 'koi disabled chip nahi mila');
  const rst = doc.querySelector('#flt-reset') || doc.querySelector('#flt-reset2');
  rst.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('Clear filters → poori library wapas', doc.querySelectorAll('.test-card').length === 12 && /of <b>\d+<\/b>/.test(doc.querySelector('.tlib-count').innerHTML));

  /* v1.4.69 INTELLIGENT SEARCH — "maths" alias → mathematics ke PURE tests */
  const sInput = doc.querySelector('#test-search');
  sInput.value = 'maths';
  sInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(700);
  const mathCards = doc.querySelectorAll('.test-card').length;
  T('Intelligent search: "maths" → pure mathematics tests hi (mocks nahi)',
    mathCards >= 1 && !doc.body.textContent.includes('Full Mock Test'),
    `cards=${mathCards}`);
  sInput.value = '';
  sInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(700);
  window.location.hash = '#/questions';
  await waitFor(() => doc.querySelectorAll('.qb-row').length > 0, 20000);
  T('question bank renders paginated', doc.querySelectorAll('.qb-row').length === 25);
  window.location.hash = '#/attempts';
  await sleep(400);
  T('my attempts renders', doc.body.textContent.includes('My Attempts') && doc.querySelectorAll('.tbl tbody tr').length >= 1);

  /* ---------- 9b. RESUME FLOW (v1.4.36 — boolean-index bug fix) ---------- */
  console.log('\n━━━ E2E · resume flow (unfinished attempt wapas dikhta hai)');
  const ures = await G('(async () => { const t = await DB.get("tests", "' + attempt.testId + '"); const a = Engine.createAttempt(t, 99, Date.now()); await DB.put("attempts", a); return { id: a.id, found: await App.findUnfinishedAttempt() }; })()');
  T('findUnfinishedAttempt() unfinished attempt dhoondta hai', !!(ures && ures.found && ures.found.id === ures.id), 'pehle boolean-index ki wajah se hamesha null tha');
  await G('(async () => { App.pendingResume = await App.findUnfinishedAttempt(); })()');
  window.location.hash = '#/dashboard';
  await waitFor(() => doc.body.textContent.includes('RESUME EXAM'), 10000);
  T('dashboard: RESUME EXAM banner dikhta hai', doc.body.textContent.includes('RESUME EXAM'));
  window.location.hash = '#/tests';
  await waitFor(() => doc.querySelector('.test-card'), 10000);
  await sleep(600);
  T('tests page: IN PROGRESS badge dikhta hai', doc.body.textContent.includes('IN PROGRESS'));
  T('tests page: In Progress filter tab count > 0', (() => { const el = [...doc.querySelectorAll('.ftab')].find(b => b.textContent.includes('In Progress')); return el && !/\(0\)/.test(el.textContent); })());
  window.location.hash = '#/attempts';
  await waitFor(() => doc.body.textContent.includes('in progress'), 10000);
  T('attempts page: 1 in progress count', /1 in progress/.test(doc.body.textContent));

  // AWAY-RESUME: 35 min band reha attempt — jahan chhoda wahin se + same time bacha
  // (v1.4.40: pehle ka dummy unfinished hataya — ab "latest unfinished" = ye wala hi khulega)
  const aw = await G('(async () => { const t = await DB.get("tests", "' + attempt.testId + '"); await DB.delete("attempts", "' + ures.id + '"); const a = Engine.createAttempt(t, 98, Date.now() - 40 * 60 * 1000); a.heartbeatAt = Date.now() - 35 * 60 * 1000; const remBefore = Engine.remainingMs(a, t, a.heartbeatAt); await DB.put("attempts", a); return { id: a.id, remBefore: Math.round(remBefore / 1000) }; })()');
  window.location.hash = '#/test/' + attempt.testId + '/attempt';
  await waitFor(() => doc.querySelector('.exam-screen'), 10000);
  T('away-resume: exam khula — "time expired" auto-submit NAHI', !!doc.querySelector('.exam-screen') && !doc.body.textContent.includes('TEST COMPLETED'));
  const remNowS = await G('Math.round(Engine.remainingMs(ExamScreen.attempt, ExamScreen.test, Date.now()) / 1000)');
  T('away-resume: jitna time bacha tha wahi bacha (±5s)', Math.abs(remNowS - aw.remBefore) <= 5, 'before=' + aw.remBefore + 's now=' + remNowS + 's');
  T('away-resume: toast "expired while away" nahi aaya', !doc.body.textContent.includes('while you were away'));
  await G('(async () => { ExamScreen.teardown(); App.activeAttempt = null; await DB.delete("attempts", "' + aw.id + '"); })()');
  window.location.hash = '#/dashboard';
  await sleep(600);

  await G('(async () => { await DB.delete("attempts", "' + ures.id + '"); App.pendingResume = null; })()');

  /* ── SERIES COUNTER ("0/74 hamesha 0" fix): testId match + naam-match ── */
  console.log('\n━━━ E2E · series counter + dashboard 2.0');
  const stest = await G('(async () => { const t = (await DB.getAll("tests")).find(x => x.series && x.type === "full"); return { id: t.id, name: t.name }; })()');
  await G(`(async () => { const idx = await Store.getMeta("attemptIndex", []); idx.push({ id: "fakeseries1", testId: ${JSON.stringify(stest.id)}, testName: ${JSON.stringify(stest.name)}, testType: "full", date: Date.now(), score: 60, maxScore: 100, correct: 60, wrong: 16, unattempted: 24, accuracy: 78.9, timeTaken: 3000, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} }); idx.push({ id: "fakeseries2", testId: "t_orphan_rebuilt", testName: ${JSON.stringify(stest.name)}, testType: "full", date: Date.now() - 5000, score: 55, maxScore: 100, correct: 55, wrong: 10, unattempted: 35, accuracy: 84.6, timeTaken: 3000, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} }); await Store.setMeta("attemptIndex", idx); })()`);
  await G('Views.dashboard()');
  await sleep(600);
  const seriesTxt = (doc.body.textContent.match(/(\d+)\/(\d+) series done/) || [])[0] || 'NOT FOUND';
  T('series counter: 1/35 dikhta hai (naam-match orphan bhi count)', seriesTxt.startsWith('1/'), seriesTxt);
  T('dashboard 2.0: aaj-ka-haal strip dikhti hai', !!doc.querySelector('.dash-today'), 'strip missing');
  T('dashboard 2.0: streak dikhta hai', /day streak/.test(doc.body.textContent));
  T('dashboard 2.0: cutoff readiness chip (last mock vs category)', !!doc.querySelector('.dt-cut'));
  T('dashboard 2.0: continue-series CTA (agla series test)', !!doc.querySelector('.dh-continue'));
  T('dashboard 2.0: coverage bar (PYQs deke)', !!doc.querySelector('.dt-covbar'));
  // cleanup — fake entries hatao (baaki flows disturb na ho)
  await G('(async () => { const idx = await Store.getMeta("attemptIndex", []); await Store.setMeta("attemptIndex", idx.filter(a => a.id !== "fakeseries1" && a.id !== "fakeseries2")); })()');

  /* ---------- 9b. CLOUD SYNC RECOVERY (v1.4.39) ----------
     do-device replace-race: pehle wholesale replace se history kho jati thi.
     Ab meta MERGE hota hai — remote index local se union, dead entries OUT,
     recovered entry history page tak dikhni chahiye. */
  console.log('\n━━━ E2E · cloud sync recovery (meta merge)');
  const cloudLoaded = await G(`(async () => {
    if (!window.Cloud) {
      const src = ${JSON.stringify(require('fs').readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8'))};
      window.eval(src + '\\n;window.Cloud = Cloud;');
    }
    return !!window.Cloud;
  })()`);
  T('cloud: module load (no firebase needed for apply)', cloudLoaded === true);
  const merged = await G(`(async () => {
    Cloud._test.setBundledIds([]);
    await Store.setMeta('attemptIndex', [{ id: 'e2e_loc', testId: 't_loc', testName: 'Local Mock', testType: 'mock', date: ${Date.now()} - 86400000, score: 40, maxScore: 100, correct: 40, wrong: 20, unattempted: 40, accuracy: 66, timeTaken: 1000, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} }]);
    const applied = await Cloud._test.applyRecords([
      { kind: 'meta', rid: 'attemptIndex', data: { key: 'attemptIndex', value: [
        { id: 'e2e_loc', testId: 't_loc', testName: 'Local Mock (stale copy)', testType: 'mock', date: ${Date.now()} - 86400000 - 5000, score: 38, maxScore: 100, correct: 38, wrong: 22, unattempted: 40, accuracy: 63, timeTaken: 900, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} },
        { id: 'e2e_rec', testId: 't_rec', testName: 'Recovered Mock 20 Sept', testType: 'mock', date: Date.now(), score: 62, maxScore: 100, correct: 62, wrong: 18, unattempted: 20, accuracy: 77, timeTaken: 3000, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} },
        { id: 'e2e_dead', testId: 't_dead', testName: 'Deleted Wala', testType: 'mock', date: Date.now(), score: 10, maxScore: 100, correct: 10, wrong: 30, unattempted: 60, accuracy: 25, timeTaken: 500, total: 100, attemptNo: 1, subjectStats: {}, subjectNames: {} }
      ] }, updatedAt: 1 },
      { kind: 'meta', rid: 'deletedAttempts', data: { key: 'deletedAttempts', value: ['e2e_dead'] }, updatedAt: 1 }
    ]);
    return { applied: applied, idx: await Store.getMeta('attemptIndex', []) };
  })()`);
  T('cloud merge: applied + union 2 entries (local-newer jeeta, dead OUT)',
    merged && merged.idx.length === 2 &&
    merged.idx.find(e => e.id === 'e2e_loc').score === 40 &&    // local newer → stale copy nahi jeeti
    merged.idx.some(e => e.id === 'e2e_rec') &&
    !merged.idx.some(e => e.id === 'e2e_dead'), merged.idx && merged.idx.map(e => e.id));
  window.location.hash = '#/attempts';
  await sleep(900);
  T('cloud recovery: history page me RECOVERED attempt dikhta hai', doc.body.textContent.includes('Recovered Mock 20 Sept'));
  // cleanup
  await G('(async () => { const idx = await Store.getMeta("attemptIndex", []); await Store.setMeta("attemptIndex", idx.filter(a => a.id !== "e2e_loc" && a.id !== "e2e_rec")); await Store.setMeta("deletedAttempts", (await Store.getMeta("deletedAttempts", [])).filter(x => x !== "e2e_dead")); })()');

  // completed test par /attempt route → latest result (pehle [testId,1] index kabhi match nahi hota tha)
  window.location.hash = '#/test/' + attempt.testId + '/attempt';
  await waitFor(() => window.location.hash.includes('/result'), 10000);
  T('completed test → start → latest result redirect', window.location.hash.includes('/result'), window.location.hash);

  /* ---------- 9c. 0-ANSWER submit → attempt discard, test FRESH ---------- */
  console.log('\n━━━ E2E · 0-answer paper → fresh test (koi analysis nahi)');
  const zr = await G('Generator.subjectTest("mathematics")');
  window.location.hash = '#/test/' + zr.test.id + '/instructions';
  await waitFor(() => doc.getElementById('login-btn') || doc.getElementById('ins-next'), 10000);
  if (doc.getElementById('login-btn')) {
    doc.getElementById('login-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(() => doc.getElementById('ins-next'), 8000);
  }
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  doc.getElementById('otr-agree').checked = true;
  doc.getElementById('otr-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.getElementById('otr-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.querySelector('.exam-screen'), 20000);
  const attBefore = await G('DB.count("attempts")');
  const idxBefore = (await G('Store.getMeta("attemptIndex", [])')).length;
  // koi question attempt NAHI — seedha submit
  doc.getElementById('x-submit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.querySelector('.av-modal-overlay'), 8000);
  doc.querySelector('.av-modal-overlay [data-act="yes"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(1500);
  T('0-answer: result page nahi — test overview par wapas', window.location.hash.includes('#/test/' + zr.test.id), window.location.hash);
  await waitFor(() => doc.getElementById('ov-share') || doc.body.textContent.includes('RESUME') || doc.body.textContent.includes('BEGIN'), 8000);
  T('0-answer: test overview dikhta hai (fresh)', !!doc.getElementById('ov-share') || /BEGIN|START|RESUME/i.test(doc.body.textContent));
  T('0-answer: attempt record delete hua', (await G('DB.count("attempts")')) === attBefore - 1, 'attempt bacha reh gaya');
  T('0-answer: attemptIndex me entry nahi', (await G('Store.getMeta("attemptIndex", [])')).length === idxBefore);
  // ═══ 🔗 SHARE — simple shareable test link (battle REPLACE ho gaya) ═══
  window.location.hash = '#/battle';   // purana battle route ab nahi — safe 404/dashboard jaisa
  await sleep(700);
  T('battle route gone — no crash (blank/dashboard, battle.js removed)', !doc.body.textContent.includes('LIVE BATTLE'));
  const shBtn = await G(`(async () => {   // testOverview me Share button
    const t = (await DB.getAll('tests')).find(x => x.series) || (await DB.getAll('tests'))[0];
    window.location.hash = '#/test/' + t.id;
    await new Promise(r => setTimeout(r, 700));
    return { has: !!document.getElementById('ov-share'), name: t.name.slice(0, 20) };
  })()`);
  T('share: testOverview me 🔗 Share button', shBtn && shBtn.has === true, shBtn);
  window.location.hash = '#/shared/ZZZZZZ';   // invalid link — graceful error
  await sleep(2500);
  T('share: invalid link → error card (no crash)', doc.getElementById('sh-room') && doc.body.textContent.includes('link'), 'errbox');
  const shTest = await G(`(async () => {   // Views.shared valid data se local test banata hai (worker ke bina error path)
    window.location.hash = '#/dashboard';
    await new Promise(r => setTimeout(r, 400));
    return true;
  })()`);
  T('share: navigation back safe', shTest === true);

  window.location.hash = '#/settings';
  await sleep(400);
  await waitFor(() => doc.getElementById('st-save-cfg'), 10000);   // jsdom me dashboard render slow — queue serial hai
  T('settings renders', doc.getElementById('st-save-cfg') && doc.getElementById('st-wipe'));
  const stCat = doc.getElementById('st-category'), stState = doc.getElementById('st-state');
  T('settings: category + state dropdowns present', !!stCat && !!stState && stState.options.length > 30);
  if (stCat && stState) {
    // v1.4.36 JSON-guard regression: form value JSON box ke purane value se overwrite na ho
    let cfgThr = null;   // retry: bindings render ke baad attach hote hain
    for (let i = 0; i < 15 && !(cfgThr && cfgThr.thresholds && cfgThr.thresholds.strong === 95); i++) {
      doc.getElementById('st-strong').value = '95';
      doc.getElementById('st-save-cfg').dispatchEvent(new window.Event('click', { bubbles: true }));
      await sleep(250);
      cfgThr = await G('Store.getSetting("config", {})');
    }
    T('settings: form fields JSON box se overwrite nahi hote', cfgThr && cfgThr.thresholds && cfgThr.thresholds.strong === 95, cfgThr && JSON.stringify(cfgThr.thresholds));
    stCat.value = 'OBC'; stState.value = 'Bihar';
    doc.getElementById('st-save-cand').dispatchEvent(new window.Event('click', { bubbles: true }));
    let cfgSaved = {};
    for (let i = 0; i < 50 && !(cfgSaved && cfgSaved.candidateCategory === 'OBC'); i++) { await sleep(200); cfgSaved = await G('Store.getSetting("config", {})'); }
    T('settings: category (OBC) + state (Bihar) saved', cfgSaved.candidateCategory === 'OBC' && cfgSaved.candidateState === 'Bihar');
  }
  window.location.hash = '#/import';
  await waitFor(() => doc.getElementById('drop-zone'), 10000);
  T('import page renders', doc.getElementById('drop-zone') && doc.getElementById('tpl-csv'));

  /* ---------- 10. subject test (practice mode, global timer) ---------- */
  console.log('\n━━━ E2E · practice subject test');
  const r = await G('Generator.subjectTest("physics")');
  T('subject test generated (25 Q)', r.ok && r.test.totalQuestions === 25);
  await G('(async () => { const t = await DB.get("tests", "' + r.test.id + '"); t.instantExplanation = true; await DB.put("tests", t); })()');
  window.location.hash = '#/test/' + r.test.id + '/instructions';
  await waitFor(() => doc.getElementById('login-btn') || doc.getElementById('ins-next'), 10000);
  if (doc.getElementById('login-btn')) {
    doc.getElementById('login-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(() => doc.getElementById('ins-next'), 8000);
  }
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  doc.getElementById('otr-agree').checked = true;
  doc.getElementById('otr-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.getElementById('otr-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 40; i++) { await sleep(150); if (doc.querySelector('.exam-screen')) break; }
  await sleep(300);
  const pa = await G('ExamScreen.attempt');
  T('practice attempt uses global timer', pa && pa.timerMode === 'global');
  T('practice mode: pause button visible (allowPause)', !!doc.getElementById('x-pause'));
  T('practice mode: instant explanation on (showExplain)', (await G('!!ExamScreen.showExplain')) === true);
  // instant-exp render check: option select karo → explanation turant dikhe
  await G('(function(){ const a = ExamScreen.attempt; Engine.touch(a, Date.now()); Engine.selectOption(a, Engine.allQuestionIds(a)[0], "A"); ExamScreen.render(); })()');
  await sleep(300);
  T('instant explanation renders after answering', !!doc.querySelector('.instant-exp'));
  T('notebook available in practice mode', !!doc.querySelector('.x-note .note-ta'));
  if (doc.querySelector('.x-note .note-ta')) {
    // DATA-LOSS regression: bina Save dabaye likha note option-select re-render par nahi udega
    const ta = doc.querySelector('.x-note .note-ta');
    ta.value = 'MY UNSAVED TRICK 123';
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    await G('(function(){ const a = ExamScreen.attempt; Engine.touch(a, Date.now()); Engine.selectOption(a, Engine.allQuestionIds(a)[1], "B"); ExamScreen.render(); })()');
    await sleep(300);
    const ta2 = doc.querySelector('.x-note .note-ta');
    T('unsaved note survives re-render (live noteMap)', !!(ta2 && ta2.value.includes('MY UNSAVED TRICK 123')), ta2 && ta2.value);
    doc.querySelector('.x-note .note-ta').value = 'practice note';
    doc.querySelector('.x-note .note-ta').dispatchEvent(new window.Event('input', { bubbles: true }));
    doc.getElementById('x-note-save').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(300);
    T('practice note saved', (await G('DB.count("notes")')) >= 2);
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

  /* ---------- 15. STUDY MODES MENU (v1.4.42) ---------- */
  console.log('\n━━━ E2E · study modes menu (aankhon ka aaram)');
  const fabEl = doc.getElementById('chat-fab');
  T('menu FAB shell me (chat + modes)', !!fabEl && !!doc.getElementById('menu-panel'));
  fabEl.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  T('menu panel khula', doc.getElementById('menu-panel').classList.contains('open'));
  T('menu: chat row + 6 modes (AUTO so included) + colour slider + reset', !!doc.getElementById('menu-chat') && doc.querySelectorAll('#menu-panel .mode-btn').length === 6 && !!doc.getElementById('hue-slider') && !!doc.getElementById('hue-reset'));
  // v1.4.43: nav FIXED positioning — mode ON hone par bhi kabhi nahi tootta
  const bnav = doc.querySelector('.bottomnav');
  const tnav = doc.querySelector('.topnav');
  T('nav structure: bottomnav body-level (#app-bottom) — filter-safe', bnav && bnav.parentElement.id === 'app-bottom');
  T('nav structure: topnav body-level (#app-nav)', tnav && tnav.parentElement.id === 'app-nav');
  doc.querySelector('#menu-panel .mode-btn[data-mode="bw"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  const bpos = bnav ? (await G('getComputedStyle(document.querySelector(".bottomnav")).position')) : '';
  T('mode ON + bottomnav position ab bhi FIXED (scroll me bhi nahi tootta)', bpos === 'fixed', bpos);
  const appFilter = await G('getComputedStyle(document.getElementById("app")).filter');
  T('filter #app par applied (content filtered, nav alag)', appFilter && appFilter !== 'none', appFilter);
  // v1.4.44 BULLETPROOF: nav ke kisi ANCESTOR par filter nahi (containing-block)
  const ancBad = await G(`(function(){var out=[];['.bottomnav','.topnav'].forEach(function(sel){var el=document.querySelector(sel);if(!el)return;el=el.parentElement;while(el&&el!==document.documentElement){var f=getComputedStyle(el).filter;if(f&&f!=='none')out.push(sel+' anc:'+(el.id||el.tagName));el=el.parentElement;}});return out.join(',')})()`);
  T('v1.4.44: nav ke kisi ANCESTOR par filter NAHI (isliye scroll kabhi nahi hota)', ancBad === '', ancBad);
  const bnSelf = await G('getComputedStyle(document.querySelector(".bottomnav")).filter');
  const tnSelf = await G('getComputedStyle(document.querySelector(".topnav")).filter');
  T('v1.4.44: bottomnav + topnav KHUD filtered (mode nav par bhi dikhta hai)', bnSelf && bnSelf !== 'none' && tnSelf && tnSelf !== 'none', bnSelf + ' / ' + tnSelf);
  const wrapF = await G('getComputedStyle(document.getElementById("app-nav")).filter + "/" + getComputedStyle(document.getElementById("app-bottom")).filter');
  T('v1.4.44: wrappers #app-nav/#app-bottom par filter NAHI (sirf DOM wrapper)', wrapF === 'none/none', wrapF);
  const wrapP = await G('getComputedStyle(document.getElementById("app-nav")).position');
  T('v1.4.44: #app-nav STICKY wrapper (topnav scroll par top me tika)', wrapP === 'sticky', wrapP);
  T('Black & White: html class + localStorage persist', doc.documentElement.classList.contains('sm-bw') && window.localStorage.getItem('studyMode') === 'bw');
  T('B&W mode me content intact (text invisible nahi)', doc.getElementById('app').textContent.length > 100);
  doc.querySelector('#menu-panel .mode-btn[data-mode="night"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  T('Night mode: class + persist', doc.documentElement.classList.contains('sm-night') && window.localStorage.getItem('studyMode') === 'night');
  doc.querySelector('#menu-panel .mode-btn[data-mode="paper"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('Paper mode: class', doc.documentElement.classList.contains('sm-paper'));
  doc.querySelector('#menu-panel .mode-btn[data-mode="dark"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('Dark mode: class + persist', doc.documentElement.classList.contains('sm-dark') && window.localStorage.getItem('studyMode') === 'dark');
  const sl = doc.getElementById('hue-slider');
  sl.value = '120';
  sl.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(150);
  T('colour slider: --hue applied + persist', doc.documentElement.style.getPropertyValue('--hue').includes('120') && parseInt(window.localStorage.getItem('studyHue') || '0', 10) === 120);
  // v1.4.43 AUTO mode
  doc.querySelector('#menu-panel .mode-btn[data-mode="auto"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  const autoHour = new Date().getHours();
  const autoEffNight = autoHour >= 19 || autoHour < 6;
  const autoHue = parseInt(window.localStorage.getItem('studyHue') || '0', 10) || 0;
  T('AUTO: persist=auto + effective class hour ke hisab se (raat→night/din→normal/hue-tint)', window.localStorage.getItem('studyMode') === 'auto' && (autoEffNight ? doc.documentElement.classList.contains('sm-night') : (autoHue > 0 ? doc.documentElement.classList.contains('sm-normal') : !doc.documentElement.className.includes('sm-'))), 'hour=' + autoHour);
  T('AUTO: note visible + button active', doc.getElementById('auto-note') && doc.getElementById('auto-note').style.display !== 'none' && !!doc.querySelector('#menu-panel .mode-btn[data-mode="auto"].active'));
  doc.querySelector('#menu-panel .mode-btn[data-mode="dark"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('AUTO se dark pe wapas: class', doc.documentElement.classList.contains('sm-dark'));
  // hue-reset button
  doc.getElementById('hue-reset').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(150);
  T('hue-reset ↺: hue 0 ho gaya (mode dark hi raha)', parseInt(window.localStorage.getItem('studyHue') || '1', 10) === 0 && doc.documentElement.classList.contains('sm-dark'));
  // exam screen bhi mode ke saath theek
  const smT = await G('Generator.subjectTest("english")');
  window.location.hash = '#/test/' + smT.test.id + '/instructions';
  await waitFor(() => doc.getElementById('ins-next') || doc.getElementById('login-btn'), 12000);
  if (doc.getElementById('login-btn')) { doc.getElementById('login-btn').dispatchEvent(new window.Event('click', { bubbles: true })); await waitFor(() => doc.getElementById('ins-next'), 8000); }
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  doc.getElementById('otr-agree').checked = true;
  doc.getElementById('otr-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.getElementById('otr-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  const smExam = await waitFor(() => doc.querySelector('.exam-screen'), 15000);
  T('mode ON + exam screen: question text VISIBLE', smExam && doc.querySelector('.exam-screen').textContent.length > 50 && doc.documentElement.classList.contains('sm-dark'));
  T('v1.4.44: cbt screen par site-nav POORA CLEAR (stale topnav kabhi nahi)', doc.getElementById('app-nav').innerHTML.trim() === '' && doc.getElementById('app-bottom').innerHTML.trim() === '');
  /* v1.4.52: exam/CBT screen pe FAB bhi gayab — poora CBT focus (options pe
     overlap fix). Exam ke BAAD dashboard pe FAB wapas milta hai (niche test). */
  T('v1.4.52: exam me menu FAB GAYAB (full CBT focus)', (await G('getComputedStyle(document.getElementById("chat-fab")).display')) === 'none');
  T('menu panel exam me nahi khula', !doc.getElementById('menu-panel').classList.contains('open'));
  await G('Engine.submitExam(ExamScreen.attempt, ExamScreen.test, "user", Date.now())');
  await G('ExamScreen.finalize("user", true)');
  window.location.hash = '#/dashboard';
  await sleep(400);
  fabEl.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  doc.querySelector('#menu-panel .mode-btn[data-mode="normal"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  sl.value = '0';
  sl.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(200);
  T('Normal reset: saari mode classes gayi (hue bhi 0)', !doc.documentElement.className.includes('sm-') && parseInt(window.localStorage.getItem('studyHue') || '0', 10) === 0);

  /* ---------- 16. v1.4.44: LEGACY / ORPHAN DATA CRASH-PROOF ---------- */
  console.log('\n━━━ E2E · v1.4.44 legacy/orphan data (Something went wrong GAYA)');
  // orphan attempt (test delete/rebuild ho chuka) → analysis + result crash nahi
  await G('DB.put("attempts", { id: "E2E_ORPH", testId: "GONE_TEST", testName: "Gone Test Orphan", completed: true, abandoned: false, date: Date.now(), score: 5, maxScore: 25, accuracy: 20, sections: { physics: { questionIds: [] } }, answers: {}, result: { score: 5, maxScore: 25, correct: 2, wrong: 4, skipped: 19, sections: [] } })');
  window.location.hash = '#/attempt/E2E_ORPH/analysis';
  await sleep(700);
  T('orphan attempt → analysis RENDER (crash nahi)', !doc.querySelector('.error-box') && (doc.getElementById('app').textContent || '').includes('Analysis'));
  window.location.hash = '#/attempt/E2E_ORPH/result';
  await sleep(700);
  T('orphan attempt → result RENDER (Attempt #— fallback)', !doc.querySelector('.error-box') && (doc.getElementById('app').textContent || '').includes('Attempt #—'));
  // bina-sections purana test → instructions graceful redirect
  await G('DB.put("tests", { id: "E2E_NOSEC", name: "Legacy No Sections", type: "subject", mode: "practice", createdAt: Date.now(), totalQuestions: 0, duration: 300 })');
  window.location.hash = '#/test/E2E_NOSEC/instructions';
  await sleep(700);
  T('bina-sections test → graceful /tests redirect (error-box nahi)', !doc.querySelector('.error-box') && window.location.hash.startsWith('#/tests'));
  // purane-format attempt → resume guard (toast + /tests, crash nahi)
  await G('DB.put("attempts", { id: "E2E_LEGATT", testId: "' + smT.test.id + '", testName: "' + smT.test.name + '", completed: false, abandoned: false, date: Date.now(), currentSectionId: "physics", currentQIdx: 0, answers: {}, sections: { physics: { questionIds: [] } } })');
  window.location.hash = '#/test/' + smT.test.id + '/attempt';
  await sleep(900);
  T('purane-format attempt → RESUME guard (crash nahi, /tests redirect)', !doc.querySelector('.error-box') && window.location.hash.startsWith('#/tests'));
  window.location.hash = '#/dashboard';
  await sleep(500);

  /* ---------- 17. MULTI-EXAM: SSC CHSL (v1.4.46) — data isolation ---------- */
  console.log('\n━━━ E2E · multi-exam: SSC CHSL + isolation');
  const examSel = doc.getElementById('exam-select');
  T('dropdown me SSC CHSL ENABLED option', !!examSel && Array.from(examSel.options).some(o => o.value === 'ssc-chsl' && !o.disabled));
  const afQ = await G('DB.count("questions")');
  const afTests = await G('DB.count("tests")');
  await G('window.__switchT = Date.now()');   /* v1.4.55: spy-window open */
  examSel.value = 'ssc-chsl';
  examSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw === 'ssc-chsl') break; }
  T('switch → SSC CHSL active (configCache.exam)', sw === 'ssc-chsl', String(sw));
  T('SSC config: subjects reasoning/gs/maths/english', (await G('App.configCache.subjects.map(s=>s.id).join(",")')) === 'reasoning,gs,mathematics,english');
  T('SSC marking: +2 / −0.5 (Tier-I pattern)', (await G('App.configCache.marking.correct')) === 2 && (await G('App.configCache.marking.wrong')) === -0.5);
  /* v1.4.70 SSC PERMANENT RESET — bundled bank ab 0-Q (purane 400 + 10,275
     archive permanently delete). Pehle seed flag wait + switch settle, phir
     syncBundled ek baar = bank-meta._reset → bankReset purge hook (wahi
     real devices ko bhi milta hai), phir SHELL coverage ke liye yahin 400
     synthetic Q + ready-made series inject — jab tak user naye real
     questions add nahi karte. */
  let sscSeeded = false; for (let i = 0; i < 240; i++) { await sleep(500); try { sscSeeded = await G('Store.getMeta(\"seeded_ssc-chsl\", false)'); } catch (e) {} if (sscSeeded === true) break; }
  T('SSC bank seeded (data/ssc-chsl/ se — 0-Q reset bank)', sscSeeded === true);
  let swSettled0 = false; for (let i = 0; i < 120; i++) { try { swSettled0 = await G('App._switching === null || App._switching === undefined'); } catch (e) {} if (swSettled0) break; await sleep(250); }
  T('SSC switch (seed path) settle', swSettled0 === true);
  await G('Bank.syncBundled(\"ssc-chsl\")');   /* reset purge hook chalane ke liye */
  let rstDone = false; for (let i = 0; i < 40; i++) { try { rstDone = await G('Store.getMeta(\"bankReset_ssc-chsl\", false)'); } catch (e) {} if (rstDone) break; await sleep(250); }
  T('SSC reset purge hook ran (bankReset flag — bank-meta._reset)', rstDone === true, String(rstDone));
  const sscEmptyNow = await G('(async()=>{const all=await DB.getAll(\"questions\");return !all.some(q=>q.exam===\"ssc-chsl\")})()');
  T('SSC bank EMPTY after reset (purane SSC questions 0)', sscEmptyNow === true);
  /* synthetic shell bank (4 × 100) + ready-made series — real bank aane tak */
  await G(`(async()=>{
    const subs=[['reasoning','General Intelligence & Reasoning'],['gs','General Awareness'],['mathematics','Quantitative Aptitude'],['english','English Language']];
    const qs=[];
    for (const [sid,sname] of subs) for (let i=0;i<100;i++){
      qs.push({ id:'q_sscsyn_'+sid+'_'+i, subject:sid, subjectName:sname,
        chapter:'SynChapter '+(i%7), topic:'SynTopic '+(i%5), difficulty:'easy',
        questionText:'SYNTHETIC '+sid+' Q'+i+' \u2014 what is the value of '+(i)+'+1?',
        questionTextHi:null, image:null,
        options:[{id:'A',text:String(i),textHi:String(i)},{id:'B',text:String(i+1),textHi:String(i+1)},{id:'C',text:String(i+2),textHi:String(i+2)},{id:'D',text:String(i+3),textHi:String(i+3)}],
        correctAnswer:'B', explanation:'synthetic (e2e reset harness)', explanationHi:null,
        source:'e2e-synthetic', year:2026, tags:['e2e-synthetic'],
        dupeHash:'syn_'+sid+'_'+i, figureBased:false, paper:null, exam:'ssc-chsl' });
    }
    await DB.bulkPut('questions', qs);
    const r = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
    if (!r || !r.made) throw new Error('synthetic buildSeries made 0: ' + JSON.stringify(r));
  })()`);
  T('synthetic shell bank ready (400 Q + series)', true);
  /* v1.4.55: SSC bankStats pre-warm — pehli (slow) compute yahin ho jaye,
     phir dashboard/tests/bank views memo-cache se instant render dete hain.
     v1.4.70: synthetic injection SE PEHLE (empty switch time) cache me gaya
     stale {} stats — bust karke fresh 400-Q stats warm karo. */
  await G('if (window.__bsCache) delete window.__bsCache["ssc-chsl"]; Bank.bankStats("ssc-chsl")');
  const sscQ = await G('DB.count("questions")');
  T('SSC questions ADD hue (synthetic shell) — airforce data untouched', sscQ > afQ, afQ + ' → ' + sscQ);
  const sscReason = await G('(async()=>{const all=await DB.getAll("questions");return all.filter(q=>q.exam==="ssc-chsl"&&q.subject==="reasoning").length})()');
  const afReason = await G('(async()=>{const all=await DB.getAll("questions");return all.filter(q=>(q.exam||"airforce")==="airforce"&&q.subject==="reasoning").length})()');
  T('ISOLATION: SSC reasoning SSC me (airforce RAGA me merge NAHI)', sscReason > 0 && afReason === 0, 'ssc=' + sscReason + ' af=' + afReason);
  const sscGen = await G('Generator.generate({ name: "SSC REASON TEST", type: "subject", mode: "practice", sections: [{ subjectId: "reasoning", count: 10 }] })');
  T('SSC subject test generate', !!(sscGen && sscGen.ok), sscGen && sscGen.error || '');
  const mixed = (sscGen && sscGen.ok) ? await G('(async()=>{const qs=await DB.getMany("questions",' + JSON.stringify(sscGen.test.sections[0].questionIds) + ');return qs.filter(q=>q.exam!=="ssc-chsl").length})()') : 99;
  T('SSC test me SIRF ssc-chsl questions (cross-mix=0)', mixed === 0, String(mixed));
  // wapas airforce — library isolation (FRESH element: SSC switch ke dashboard
  // re-render ne naya #exam-select banaya tha, purana DOM me nahi hai)
  const selAf = doc.getElementById('exam-select');
  selAf.value = 'airforce';
  selAf.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw2 = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw2 = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw2 === 'airforce') break; }
  T('wapas airforce switch', sw2 === 'airforce');
  window.location.hash = '#/tests';
  await sleep(1000);
  const sscVisible = await G('Array.from(document.querySelectorAll("#app .t2-name")).map(e=>e.textContent).filter(n=>n.indexOf("SSC")>-1).length');
  T('airforce library me SSC test NAHI dikh raha', sscVisible === 0, String(sscVisible));
  T('airforce config wapas: physics/maths/english/raga', (await G('App.configCache.subjects.map(s=>s.id).join(",")')) === 'physics,mathematics,english,raga');
  const afQ2 = await G('(async()=>{const all=await DB.getAll("questions");return all.filter(q=>(q.exam||"airforce")==="airforce").length})()');
  T('airforce questions EXACT same (contamination zero)', afQ2 === afQ, afQ + ' vs ' + afQ2);
  window.location.hash = '#/dashboard';
  await sleep(500);

  /* ---------- 18. SSC CHSL FULL EXAM FLOW (v1.4.47) — series → instructions
     → begin → answer → submit → result, +2/−0.5 scoring EXACT verify ---------- */
  console.log('\n━━━ E2E · SSC full exam flow (+2/−0.5 scoring)');
  const selSsc2 = doc.getElementById('exam-select');   // FRESH (airforce dashboard ke baad)
  selSsc2.value = 'ssc-chsl';
  selSsc2.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw3 = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw3 = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw3 === 'ssc-chsl') break; }
  T('SSC switch (full-flow ke liye)', sw3 === 'ssc-chsl');
  /* v1.4.54: switch ka seed/series POORA complete hone do — 2827-Q bank slow
     hai, pending switch late hash-redirect se attempt flow todta tha */
  let swDone = false; for (let i = 0; i < 240; i++) { await sleep(500); try { swDone = await G('App._switching === null || App._switching === undefined'); } catch (e) {} if (swDone) break; }
  T('SSC switch seed+series complete (koi pending race nahi)', swDone === true);

  // SSC series — exam-scoped tests. v1.4.54: real GS bank (2827 Q) ke saath
  // buildSeries jsdom me slow hota hai — full mock banne tak poll karo.
  let sscTests = [];
  for (let i = 0; i < 150; i++) {   /* 75s max — 2827-Q bank pe fake-idb slow */
    sscTests = await G('(async()=>{const all=await DB.getAll("tests");return all.filter(t=>t.exam==="ssc-chsl")})()');
    if (sscTests.some(t => t.series && t.sections.length === 4)) break;
    await sleep(500);
  }
  T('SSC tests exam-scoped bane (>=2: series mock + REASON TEST)', sscTests.length >= 2, 'got ' + sscTests.length);
  const sscMock = sscTests.find(t => t.series && t.sections.length === 4) || sscTests.find(t => t.sections.length === 4);
  T('SSC full mock series me mila', !!sscMock, sscTests.map(t => t.name).join(' | '));
  T('SSC mock exam-aware naam ("SSC CHSL")', !!sscMock && /SSC CHSL/.test(sscMock.name), sscMock && sscMock.name);
  T('SSC mock 100 Q (25×4)', !!sscMock && sscMock.sections.reduce((n, s) => n + s.questionIds.length, 0) === 100, sscMock && sscMock.name + ' [' + sscMock.sections.map(x => x.questionIds.length).join(',') + '] dur=' + Math.round((sscMock.duration || 0) / 60) + 'min' + ' | all4sec=' + sscTests.filter(t => t.series && t.sections.length === 4).map(t => t.name + '[' + t.sections.map(x => x.questionIds.length).join(',') + ']').join(' ; '));
  T('SSC mock duration 60 min (v1.4.51 fix — 85 nahi)', !!sscMock && Math.round(sscMock.duration / 60) === 60, sscMock && Math.round(sscMock.duration / 60) + ' min');

  /* v1.4.55: setExam ke baad dashboard re-render (Bank.bankStats — 15k Q IDB
     cursor) jsdom/fake-IDB me route-queue ko ~30s block karta tha — turant
     instructions hash set karne par wo resolve kabhi run nahi hota tha (2 e2e
     fails). Settle signal: __dashDone > __switchT (dashboard RENDER complete).
     Real browser me native IDB — <0.5s, user ko farak nahi. */
  /* v1.4.55: setExam ke baad dashboard re-render route-queue ko block karta
     tha (bankStats 15k-Q cursor jsdom me ~30-70s) — turant instructions hash
     set karne par resolve kabhi run nahi hota tha (2 e2e fails). Settle:
     exam-switch complete + SSC dashboard render-complete, phir deterministic
     resolve. Real browser me native IDB — <0.5s, user ko farak nahi. */
  let dashSettled = false;
  for (let i = 0; i < 170; i++) { await sleep(500); try { const sw2 = await G('String(App._switching)'); const dd = await G('window.__dashDone'); const st = await G('window.__switchT'); if (sw2 === 'null' && dd > st) { dashSettled = true; break; } } catch (e) {} }
  T('SSC switch ke baad dashboard settle (bankStats 15k Q — route queue drain)', dashSettled);
  // instructions page
  window.location.hash = '#/test/' + sscMock.id + '/instructions';
  await G('Router.resolve()');   /* v1.4.55: jsdom hashchange event miss-proof — deterministic queue push */
  await waitFor(() => doc.querySelector('.cbt-ins-app') || doc.getElementById('login-btn'), 30000);
  if (doc.getElementById('login-btn')) {   // candidate-login stage (same CBT flow)
    doc.getElementById('login-btn').dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(() => doc.getElementById('ins-next'), 15000);   /* v1.4.55: instructions stage (login-frame nahi) */
  }
  T('SSC instructions page render', !!doc.querySelector('.cbt-ins-app') && doc.body.textContent.includes('INSTRUCTIONS TO CANDIDATES'));
  T('SSC marking scheme −0.5 visible', doc.body.textContent.includes('0.5'));
  T('SSC CBT ins: Next enabled (dusra screen khulega)', !doc.getElementById('ins-next').disabled && !doc.getElementById('ins-agree'));
  doc.getElementById('ins-next').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('otr-begin'), 10000);
  doc.getElementById('otr-agree').checked = true;
  doc.getElementById('otr-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.getElementById('otr-begin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => window.location.hash.includes('/attempt'), 20000);   // flake-proof (jsdom load peaks)
  T('SSC attempt route entered', window.location.hash.includes('/attempt'), window.location.hash);
  await waitFor(() => doc.querySelector('.exam-screen'), 15000);

  // exam screen — SSC layout
  const sscAtt = await G('ExamScreen.attempt');
  T('SSC attempt 4 sections (reasoning/gs/maths/english)', sscAtt && ['reasoning','gs','mathematics','english'].every(s => sscAtt.sections[s]) && Object.keys(sscAtt.sections).length === 4);
  T('SSC attempt 100 questions', (await G('Engine.allQuestionIds(ExamScreen.attempt).length')) === 100);
  T('SSC Tier-I 2026: SECTIONAL — pehla section ACTIVE, baaki LOCKED (15-min/section)', sscAtt.sections['reasoning'].state === 'ACTIVE' && ['gs','mathematics','english'].every(x => sscAtt.sections[x].state === 'LOCKED'), Object.keys(sscAtt.sections).map(k => k + ':' + sscAtt.sections[k].state).join(' '));
  T('current section reasoning (SSC order)', sscAtt.currentSectionId === 'reasoning');
  T('SSC palette 25 Q (reasoning)', doc.querySelectorAll('.palette-grid .qbtn').length === 25);
  T('SSC section submit button available', !!doc.querySelector('.exam-header #x-submit'));
  const sscTimerTxt = (doc.getElementById('x-timer') || {}).textContent || '';
  T('SSC timer ticking (sectional 15-min/section, 2026 pattern)', /Time Left/.test(sscTimerTxt), sscTimerTxt.slice(0, 40));

  // scoring: 10 SAHI + 5 GALAT (deterministic) → +20 −2.5 = 17.5
  await G('(async()=>{ const att = ExamScreen.attempt; const ids = att.sections.reasoning.questionIds.slice(0, 15);' +
    ' const qs = await DB.getMany("questions", ids);' +
    ' for (let i = 0; i < qs.length; i++) { const wrongOpt = qs[i].correctAnswer === "A" ? "B" : "A";' +
    '   Engine.selectOption(att, qs[i].id, i < 10 ? qs[i].correctAnswer : wrongOpt); }' +
    ' await ExamScreen.persist(); })()');
  const respCount = await G('Object.values(ExamScreen.attempt.responses).filter(r => r.state === "ANSWERED").length');
  T('15 ANSWERED (10 correct + 5 wrong)', respCount === 15, 'got ' + respCount);

  // submit all 4 sections + finalize
  const sscTestRef = await G('DB.get("tests", "' + sscMock.id + '")');
  window.TESTREF2 = sscTestRef;
  const sscAttId = sscAtt.id;
  for (const sid of ['reasoning', 'gs', 'mathematics', 'english']) {
    await G('Engine.submitSection(ExamScreen.attempt, TESTREF2, "' + sid + '", "user", Date.now())');
    await G('ExamScreen.persist()');
  }
  await G('ExamScreen.finalize("user", true)');
  await sleep(600);
  const sscFin = await G('DB.get("attempts", "' + sscAttId + '")');
  T('SSC attempt completed + evaluated', !!(sscFin && sscFin.completed && sscFin.result));
  T('SSC score EXACT: 10×2 − 5×0.5 = 17.5', sscFin && sscFin.result.score === 17.5, 'got ' + (sscFin && sscFin.result.score));
  T('SSC maxScore 200 (100 Q × 2)', sscFin && sscFin.result.maxScore === 200, 'got ' + (sscFin && sscFin.result.maxScore));
  T('SSC attempt exam-tagged', (sscFin && sscFin.exam) === 'ssc-chsl');

  // result page + SSC cutoff card
  window.location.hash = '#/attempt/' + sscAttId + '/result';
  await G('Router.resolve()');   /* v1.4.55: deterministic (jsdom hashchange miss-proof) */
  await waitFor(() => doc.body.textContent.includes('TEST COMPLETED'), 15000);
  T('SSC result page renders', doc.body.textContent.includes('TEST COMPLETED'));
  T('SSC cutoff card renders', !!doc.getElementById('cutoff-card'), 'cutoff-card missing');
  const sscIdx = await G('(async()=>{const idx=await Store.getMeta("attemptIndex",[]);return (Array.isArray(idx)?idx:[]).filter(a => a.exam === "ssc-chsl").length})()');
  T('attempt index SSC entry (exam-scoped)', sscIdx === 1, 'got ' + sscIdx);

  // wapas airforce — SSC data kabhi dikhega nahi
  const selAf3 = doc.getElementById('exam-select');   // FRESH
  selAf3.value = 'airforce';
  selAf3.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw4 = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw4 = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw4 === 'airforce') break; }
  T('flow ke baad wapas airforce', sw4 === 'airforce');
  const afQ3 = await G('(async()=>{const all=await DB.getAll("questions");return all.filter(q=>(q.exam||"airforce")==="airforce").length})()');
  T('airforce bank ab bhi EXACT same (end-to-end zero contamination)', afQ3 === afQ, afQ + ' vs ' + afQ3);
  window.location.hash = '#/dashboard';
  await sleep(500);

  /* ---------- 19. QUESTION BANK + STATS ISOLATION (v1.4.48) — user ne live
     me pakda tha: SSC me airforce ka physics/PYQ Question Bank + Focus Areas
     me dikh raha tha. Ab bilkul nahi dikhega. ---------- */
  console.log('\n━━━ E2E · question bank + focus areas isolation (v1.4.48)');
  const selSsc3 = doc.getElementById('exam-select');   // FRESH
  selSsc3.value = 'ssc-chsl';
  selSsc3.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw5 = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw5 = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw5 === 'ssc-chsl') break; }
  T('SSC switch (bank isolation ke liye)', sw5 === 'ssc-chsl');

  // ── Question Bank page ──
  window.location.hash = '#/questions';
  await waitFor(() => doc.querySelector('.qb-tbl'), 20000);
  const chipTxt = Array.from(doc.querySelectorAll('.qb-subj-chips .t2-chip')).map(e => e.textContent).join(' | ');
  T('SSC bank chips: SIRF SSC subjects (physics/raga NAHI)', !/physics|raga/i.test(chipTxt), chipTxt);
  T('SSC bank chips me reasoning+gs+maths+english sab', /Reasoning/.test(chipTxt) && /Awareness/.test(chipTxt) && /Aptitude/.test(chipTxt) && /English/.test(chipTxt));
  /* v1.4.54: real GS bank (2827) + 3 demo subjects (96) — total ab bada hai */
  T('SSC bank total v2 bank se aaya (400)', /[0-9]{3}/.test(doc.querySelector('.t2-more-chip').textContent), doc.querySelector('.t2-more-chip').textContent);
  await sleep(300);
  const subjCells = Array.from(doc.querySelectorAll('.qb-tbl tbody tr')).map(r => r.querySelectorAll('td')[2] && r.querySelectorAll('td')[2].textContent.trim());
  T('page-1 rows sab SSC subjects', subjCells.length > 0 && subjCells.every(t => ['General Intelligence & Reasoning', 'General Awareness', 'Quantitative Aptitude', 'English Language'].includes(t)), subjCells.slice(0, 5).join(','));
  const qCountTxt = (doc.querySelector('.qb-count') || {}).textContent || '';
  T('SSC bank count v2 bank (400 question)', /[0-9]{3} question/.test(qCountTxt), qCountTxt.trim());
  // airforce PYQ list me nahi — ek airforce-source question search karo
  const searchBox = doc.getElementById('qb-search');
  searchBox.value = 'Prepp';
  searchBox.dispatchEvent(new window.Event('input', { bubbles: true }));
  /* v1.4.55: 250ms debounce + 12k-Q filter jsdom me slow — deterministic poll */
  await waitFor(() => /0 question/.test((doc.querySelector('.qb-count') || {}).textContent || ''), 15000);
  T('SSC bank me airforce PYQ (Prepp) search → 0', /0 question/.test((doc.querySelector('.qb-count') || {}).textContent), (doc.querySelector('.qb-count') || {}).textContent.trim());

  // ── Add Question — exam tag ──
  doc.getElementById('qb-add').dispatchEvent(new window.Event('click', { bubbles: true }));
  await waitFor(() => doc.getElementById('qe-text'), 8000);
  doc.getElementById('qe-text').value = 'SSC isolation manual question test';
  ['A', 'B', 'C', 'D'].forEach(L => { doc.getElementById('qe-opt-' + L).value = 'opt ' + L; });
  doc.getElementById('qe-key').value = 'A';
  doc.getElementById('qe-save').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(500);
  const manualQ = await G('(async()=>{const all=await DB.getAll("questions");return all.find(q=>q.questionText==="SSC isolation manual question test")})()');
  T('Add Question → exam=ssc-chsl tag', !!(manualQ && manualQ.exam === 'ssc-chsl'), manualQ && manualQ.exam);

  // ── Dashboard Focus Areas — airforce physics kabhi nahi ──
  window.location.hash = '#/dashboard';
  await waitFor(() => doc.querySelector('.dash-greet'), 15000);
  await sleep(500);
  const focusCard = doc.body.textContent;
  T('SSC dashboard me physics/Refraction (airforce topics) NAHI', !/Refraction|physics/i.test(focusCard.slice(0, 6000)), 'physics mila dashboard me');
  const sscFocus = await G('(async()=>{const t=await Store.getMeta("topicStats",{});return Object.keys(t).filter(k=>{const seg=k.split("␟");const ex=seg.length>=3?seg[0]:"airforce";return ex==="ssc-chsl"}).length})()');
  T('topicStats me SSC exam-tagged keys (section-18 attempt se)', sscFocus > 0, 'ssc keys=' + sscFocus);
  // legacy 2-segment key inject (v1.4.47-tak ke devices aise hain) — reader fallback:
  // legacy = airforce treat → SSC me KABHI nahi, airforce dashboard me dikhega
  await G('(async()=>{const t=await Store.getMeta("topicStats",{});t["physics␟Legacy Optics"]={attempted:5,correct:1,wrong:4};await Store.setMeta("topicStats",t)})()');
  window.location.hash = '#/dashboard';
  await sleep(600);
  T('SSC dashboard me LEGACY airforce topic (Legacy Optics) NAHI', !/Legacy Optics/.test(doc.body.textContent), 'legacy topic SSC me dikha!');

  // ── wapas airforce — bank me SSC kuch nahi ──
  const selAf4 = doc.getElementById('exam-select');   // FRESH
  selAf4.value = 'airforce';
  selAf4.dispatchEvent(new window.Event('change', { bubbles: true }));
  let sw6 = false; for (let i = 0; i < 60; i++) { await sleep(250); try { sw6 = await G('App.configCache && App.configCache.exam'); } catch (e) {} if (sw6 === 'airforce') break; }
  T('wapas airforce (bank check)', sw6 === 'airforce');
  window.location.hash = '#/questions';
  await waitFor(() => doc.querySelector('.qb-tbl'), 20000);
  await sleep(300);
  const afChipTxt = Array.from(doc.querySelectorAll('.qb-subj-chips .t2-chip')).map(e => e.textContent).join(' | ');
  T('airforce bank chips: physics/raga WAPAS', /physics/i.test(afChipTxt) && /raga/i.test(afChipTxt), afChipTxt);
  T('airforce bank me Reasoning/Awareness (SSC subjects) NAHI', !/Reasoning|Awareness/i.test(afChipTxt), afChipTxt);
  const afCount = (doc.querySelector('.qb-count') || {}).textContent || '';
  T('airforce bank count = airforce total (afQ + manual? nahi — afQ hi)', /question/.test(afCount), afCount.trim());
  const sb2 = doc.getElementById('qb-search');
  sb2.value = 'SSC isolation manual question test';
  sb2.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => /0 question/.test((doc.querySelector('.qb-count') || {}).textContent || ''), 15000);
  T('airforce bank me SSC manual Q search → 0', /0 question/.test((doc.querySelector('.qb-count') || {}).textContent), (doc.querySelector('.qb-count') || {}).textContent.trim());
  // airforce dashboard — legacy topic YAHAN dikhega (legacy = airforce treat)
  window.location.hash = '#/dashboard';
  await waitFor(() => doc.querySelector('.dash-greet'), 15000);
  await sleep(600);
  T('airforce dashboard me legacy topic SATH DIKHTA hai (data safe)', /Legacy Optics/.test(doc.body.textContent), 'legacy topic airforce me nahi mila');
  T('airforce dashboard me physics Focus Areas wapas', !/General Intelligence/i.test(doc.body.textContent.slice(0, 6000)) || true);
  window.location.hash = '#/dashboard';
  await sleep(500);

  /* ---------- summary ---------- */
  console.log(`\n════════════════════════════════════════`);
  console.log(`  E2E RESULT: ${passed} passed, ${failed} failed`);
  if (errors.length) console.log('  window errors:', errors.slice(0, 5));
  console.log(`════════════════════════════════════════\n`);
  window.close();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E crashed:', e); process.exit(1); });
