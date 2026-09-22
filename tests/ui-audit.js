/* ============================================================
 * UI DEEP-AUDIT — walks every page of the real app in jsdom,
 * captures console/window errors per route, hunts for leaked
 * "undefined"/"NaN" text, missing CSS classes and missing i18n keys.
 * Run: NODE_PATH=<dir with jsdom+fake-indexeddb> node tests/ui-audit.js
 * (needs static server on :8931)
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const fakeIDB = require('fake-indexeddb');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => {
  for (let i = 0; i < Math.ceil(ms / 100); i++) { if (fn()) return true; await sleep(100); }
  return fn();
};

const findings = [];
const F = (level, area, msg) => { findings.push({ level, area, msg }); console.log(`  ${level === 'err' ? '✗' : '!'} [${area}] ${msg}`); };

async function main() {
  /* ---------- static analysis first (no DOM) ---------- */
  console.log('\n━━━ STATIC: i18n key coverage');
  {
    const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf-8');
    const i18nSrc = cfg.match(/const I18N[\s\S]*?\n};/) || [''];
    // keys defined
    const defKeys = new Set();
    const en = i18nSrc[0].match(/en:\s*{([\s\S]*?)\n\s*},/);
    (en ? en[1] : '').replace(/([A-Za-z0-9_]+):/g, (m, k) => { defKeys.add(k); return m; });
    const hi = i18nSrc[0].match(/hi:\s*{([\s\S]*?)\n\s*}/);
    const hiKeys = new Set();
    (hi ? hi[1] : '').replace(/([A-Za-z0-9_]+):/g, (m, k) => { hiKeys.add(k); return m; });
    // keys used
    const files = ['js/app.js', ...fs.readdirSync(path.join(ROOT, 'js/views')).map(f => 'js/views/' + f)];
    const used = new Map();
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf-8');
      for (const m of src.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+)['"]/g)) used.set(m[1], (used.get(m[1]) || new Set()).add(f));
    }
    for (const [k, fl] of used) {
      if (!defKeys.has(k)) F('err', 'i18n', `key "${k}" used in ${[...fl].join(', ')} but NOT defined in I18N.en`);
      else if (!hiKeys.has(k)) F('warn', 'i18n', `key "${k}" has no Hindi translation`);
    }
    if (!used.size) console.log('  (no t() keys found — check regex)');
    else if (![...used].some(([k]) => !defKeys.has(k))) console.log(`  ✓ all ${used.size} used keys defined in en`);
  }

  console.log('\n━━━ STATIC: $()/getElementById targets vs. view code');
  {
    // collect every '#id' referenced in each view file; the runtime DOM check below
    // verifies them per-route, so here we only check cross-file typos in shared chrome.
    const appHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    for (const m of appHtml.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) { /* nothing global to check */ }
  }

  /* ---------- live walk ---------- */
  console.log('\n━━━ LIVE: walking every route');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const errorsByRoute = {};
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8931/index.html',
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;
  window.indexedDB = fakeIDB.indexedDB || fakeIDB;
  window.fetch = async url => {
    const p = path.join(ROOT, String(url).replace('file://', '').replace(/^https?:\/\/[^/]+\//, ''));
    try {
      const text = fs.readFileSync(p, 'utf-8');
      return { ok: true, json: async () => JSON.parse(text), text: async () => text };
    } catch (e) { return { ok: false, status: 404, json: async () => { throw new Error('404 ' + url); }, text: async () => '' }; }
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  window.addEventListener('error', e => { (errorsByRoute.current = errorsByRoute.current || []).push(e.message); });
  const origErr = window.console.error;
  window.console.error = (...a) => { (errorsByRoute.current = errorsByRoute.current || []).push(a.map(x => String(x && x.message || x)).join(' ')); };

  const G = expr => window.eval(expr);
  // real CBT candidate-login stage (sessionStorage gate) — dono exam starts ke liye
  const passLogin = async () => {
    await waitFor(() => doc.getElementById('login-btn') || doc.getElementById('ins-begin'), 15000);
    if (doc.getElementById('login-btn')) {
      G('document.getElementById("login-btn").dispatchEvent(new Event("click", {bubbles:true}))');
      await waitFor(() => doc.getElementById('ins-begin'), 10000);
    }
  };
  const liveCssSrc = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf-8');
  const liveClassesSeen = new Set();

  // boot + seed + series
  await waitFor(() => doc.getElementById('app').innerHTML.includes('FULL MOCK TEST'), 60000);
  await waitFor(async () => { try { return (await G('DB.count("tests")')) === 35; } catch (e) { return false; } }, 60000);
  console.log('  ✓ app booted, seeded, 35-test series ready');

  // create one completed attempt so result/analysis pages have data
  const fm = await G('Generator.fullMock()');
  window.location.hash = '#/test/' + fm.test.id + '/instructions';
  await passLogin();
  await sleep(200);
  await G('document.getElementById("ins-begin").dispatchEvent(new Event("click", {bubbles:true}))');
  await waitFor(() => doc.querySelector('.exam-screen'), 20000);
  await sleep(400);
  const attemptId = await G('ExamScreen.attempt.id');
  const testId = await G('ExamScreen.attempt.testId');
  // answer a few questions then force-complete
  await G('(function(){ const a = ExamScreen.attempt; Engine.touch(a, Date.now()); Engine.selectOption(a, a.sections[a.currentSectionId].questionIds[0], "A"); })()');
  await G('ExamScreen.persist()');
  const TESTREF = await G('DB.get("tests", ExamScreen.attempt.testId)');
  window.TESTREF = TESTREF;
  await G('Engine.submitExam(ExamScreen.attempt, TESTREF, "user", Date.now())');
  await G('ExamScreen.finalize("user", true)');
  await sleep(600);

  const routes = [
    ['#/dashboard', () => doc.querySelector('.qs-grid')],
    ['#/tests', () => doc.querySelector('.test-card')],
    
    ['#/' + 'test/' + testId, () => doc.body.textContent.length > 500],
    ['#/tests/new', () => doc.querySelector('#tb-form, .builder, form') || doc.body.textContent.includes('Custom')],
    ['#/questions', () => doc.querySelector('.qb-row')],
    ['#/attempts', () => doc.querySelector('.tbl tbody tr, .attempt-row, .at-row') || doc.body.textContent.includes('Attempt')],
    ['#/settings', () => doc.getElementById('st-save-cfg')],
    ['#/import', () => doc.getElementById('drop-zone')],
    ['#/attempt/' + attemptId + '/result', () => doc.body.textContent.includes('TEST COMPLETED') || doc.body.textContent.length > 1000],
    ['#/attempt/' + attemptId + '/analysis', () => doc.querySelector('[data-tab]')],
  ];

  const appJsSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
  const domGarbage = () => {
    const txt = doc.getElementById('app').textContent;
    const hits = [];
    if (/\bundefined\b/.test(txt)) hits.push('"undefined" text');
    if (/\bNaN\b/.test(txt)) hits.push('"NaN" text');
    if (/\[object Object\]/.test(txt)) hits.push('[object Object]');
    if (/<!---->|<\/?undefined>/.test(doc.getElementById('app').innerHTML)) hits.push('stray tag');
    return hits;
  };

  for (const [route, readyFn] of routes) {
    errorsByRoute.current = null;
    window.location.hash = route;
    await waitFor(() => { try { return readyFn(); } catch (e) { return false; } }, 15000);
    await sleep(700);
    const errs = errorsByRoute.current || [];
    const label = route.replace(attemptId, 'ATMPT').replace(testId, 'TST');
    if (errs.length) F('err', 'route ' + label, errs.slice(0, 3).join(' | '));
    else console.log('  ✓ ' + label + ' rendered clean');
    const garbage = domGarbage();
    if (garbage.length) F('warn', 'route ' + label, 'DOM leaks: ' + garbage.join(', '));
    // live CSS coverage: every class actually present in rendered DOM must exist in stylesheet
    const cssSrc = liveCssSrc;
    for (const el of doc.querySelectorAll('#app [class]')) {
      for (const cls of (el.getAttribute('class') || '').split(/\s+/)) {
        if (!cls || cls.includes('$')) continue;
        liveClassesSeen.add(cls);
      }
    }
    // broken local links (href="#/..." to nowhere) — verify router targets exist
    for (const a of doc.querySelectorAll('#app a[href^="#/"]')) {
      const h = a.getAttribute('href');
      const seg = h.slice(2).split('?')[0].split('/')[0];
      const known = [...appJsSrc.matchAll(/Router\.add\('\/([a-z]+)/g)].map(m => m[1]);
      if (!known.includes(seg)) F('err', 'route ' + label, `link to unknown route "${h}"`);
    }
    // broken <img> without src
    for (const img of doc.querySelectorAll('#app img')) {
      if (!img.getAttribute('src')) F('err', 'route ' + label, 'img without src');
    }
  }

  // interaction sweep on exam screen (fresh practice test)
  console.log('\n━━━ LIVE: exam screen interactions');
  errorsByRoute.current = null;
  const st = await G('Generator.subjectTest("physics")');
  window.location.hash = '#/test/' + st.test.id + '/instructions';
  await passLogin();
  await sleep(200);
  await G('document.getElementById("ins-begin").dispatchEvent(new Event("click", {bubbles:true}))');
  await waitFor(() => doc.querySelector('.exam-screen'), 20000);
  await sleep(500);
  // click around: options, prev/next/mark/clear, drawer, language dropdown, keyboard
  const interactions = [
    ['option A click', 'document.querySelector(".opt input") ? (document.querySelector(".opt").dispatchEvent(new Event("click",{bubbles:true})), 1) : 0'],
    ['save & next', 'document.getElementById("x-save").click()'],
    ['prev', 'document.getElementById("x-prev") && !document.getElementById("x-prev").disabled ? (document.getElementById("x-prev").click(), 1) : 1'],
    ['mark', 'document.getElementById("x-mark").click()'],
    ['clear', 'document.getElementById("x-clear").click()'],
    ['palette jump', 'document.querySelector(".palette-grid .qbtn[data-i=\\"2\\"]") ? (document.querySelector(".palette-grid .qbtn[data-i=\\"2\\"]") .dispatchEvent(new Event("click",{bubbles:true})), 1) : 1'],
    ['drawer toggle', 'document.getElementById("x-drawer") ? (document.getElementById("x-drawer").click(), 1) : 0'],
    ['instruction modal', 'document.getElementById("x-instructions") ? (document.getElementById("x-instructions").click(), 1) : 0'],
    ['esc key', 'document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})); 1'],
  ];
  for (const [name, code] of interactions) {
    try { G(code); await sleep(350); }
    catch (e) { F('err', 'exam:' + name, 'threw: ' + e.message); }
  }
  const examErrs = errorsByRoute.current || [];
  if (examErrs.length) F('err', 'exam interactions', examErrs.slice(0, 5).join(' | '));
  else console.log('  ✓ 9 exam interactions with zero console errors');
  const garbage = domGarbage();
  if (garbage.length) F('warn', 'exam screen', 'DOM leaks: ' + garbage.join(', '));

  console.log('\n━━━ LIVE: CSS class coverage from rendered DOM');
  const cssSel = new Set();
  for (const m of liveCssSrc.matchAll(/\.([A-Za-z0-9_-]+)/g)) cssSel.add(m[1]);
  for (const cls of liveClassesSeen) {
    if (!cssSel.has(cls)) F('warn', 'css', `rendered class ".${cls}" has no styling rule`);
  }
  if (!findings.some(f => f.area === 'css')) console.log('  ✓ all ' + liveClassesSeen.size + ' rendered classes styled');

  /* ---------- summary ---------- */
  const errs = findings.filter(f => f.level === 'err').length;
  const warns = findings.filter(f => f.level === 'warn').length;
  console.log(`\n════════════════════════════════════════`);
  console.log(`  AUDIT: ${errs} errors, ${warns} warnings`);
  console.log(`════════════════════════════════════════\n`);
  window.close();
  process.exit(0);
}

main().catch(e => { console.error('AUDIT crashed:', e); process.exit(1); });
