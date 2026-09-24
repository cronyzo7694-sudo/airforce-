/* v1.4.52 — RESPONSIVE AUDIT: har route × har viewport.
   Checks per page: horizontal overflow + culprits, footer vs fixed bottomnav
   overlap (mobile), short-page footer mid-air, JS page errors.
   Usage: node tools/responsive-audit.js [local|live] */
const puppeteer = require('puppeteer');
const BASE = process.argv[2] === 'live' ? 'https://cronyzo7694-sudo.github.io/airforce-/' : 'http://127.0.0.1:8931/';
const SHOT = process.argv[2] === 'live' ? '/home/user/respLIVE-' : '/home/user/resp-';

const DEVICES = [
  { name: 'm390', w: 390, h: 844, mob: true },    // iPhone 12/13/14
  { name: 'm360', w: 360, h: 800, mob: true },    // chhota Android
  { name: 't768', w: 768, h: 1024, mob: false },  // tablet portrait
  { name: 'd1365', w: 1365, h: 768, mob: false }  // desktop baseline
];

let pass = 0, fail = 0, warn = 0;
const P = (ok, name, extra) => { if (ok) { pass++; console.log('    ✓ ' + name); } else { fail++; console.log('    ✗ ' + name + '  → ' + JSON.stringify(extra)); } };
const W = (name, extra) => { warn++; console.log('    ⚠ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); };

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let pageErrors = 0;
  page.on('pageerror', e => { pageErrors++; });

  /* ---------- setup: SSC exam + seed (desktop pe ek baar) ---------- */
  await page.setViewport({ width: 1365, height: 768 });
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#exam-select', { timeout: 180000 });   // airforce seed pehle complete hoga
  await sleep(1500);
  await page.evaluate(() => {
    const sel = document.getElementById('exam-select');
    sel.value = 'ssc-chsl';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.configCache && App.configCache.exam === 'ssc-chsl', { timeout: 120000 });
  await page.waitForFunction(() => Store.getMeta('seeded_ssc-chsl', false).then(v => v === true), { timeout: 120000, polling: 1000 });
  await sleep(2000);
  const testId = await page.evaluate(async () => {
    const all = await DB.getAll('tests');
    const t = all.find(x => x.exam === 'ssc-chsl' && x.series && x.type === 'full') || all.find(x => x.exam === 'ssc-chsl');
    return t.id;
  });
  console.log('━━━ RESPONSIVE AUDIT (' + (process.argv[2] === 'live' ? 'LIVE' : 'local') + ') — SSC test ' + testId + ' ━━━');

  /* helper: ek route visit + audit */
  async function auditRoute(dev, label, hash, opts) {
    opts = opts || {};
    await page.setViewport({ width: dev.w, height: dev.h });
    await sleep(250);
    if (opts.beforeNav) await opts.beforeNav();
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(1700);
    if (opts.post) await opts.post();
    await sleep(300);

    const r = await page.evaluate(async () => {
      const vw = innerWidth, vh = innerHeight;
      /* ---- culprits: viewport se bahar elements (outermost only) ---- */
      const off = [];
      document.querySelectorAll('body *').forEach(el => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed') return;
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return;
        if (b.right > vw + 2 || b.left < -2) off.push(el);
      });
      const offSet = new Set(off);
      const culprits = [];
      for (const el of off) {
        let p = el.parentElement, nested = false;
        while (p && p !== document.body) { if (offSet.has(p)) { nested = true; break; } p = p.parentElement; }
        if (nested) continue;
        const b = el.getBoundingClientRect();
        culprits.push({
          el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width)
        });
      }
      culprits.sort((a, b) => (b.right - b.left) - (a.right - a.left));
      /* ---- footer / bottomnav geometry (max scroll pe) ---- */
      window.scrollTo(0, 1e9);
      /* IntersectionObserver (FAB hide) async fire hota hai — settle ka wait */
      await new Promise(r => setTimeout(r, 450));
      const f = document.getElementById('site-footer');
      const nav = document.querySelector('.bottomnav');
      const fv = !!(f && getComputedStyle(f).display !== 'none');
      const nv = !!(nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 2);
      const fr = f ? f.getBoundingClientRect() : null;
      const nr = nav ? nav.getBoundingClientRect() : null;
      const appHas = !!(document.getElementById('app') && document.getElementById('app').innerHTML.trim());
      /* v1.4.52: FAB footer pe chipakta tha — hidden hona chahiye jab footer dikh raha ho */
      const fabEl = document.getElementById('chat-fab');
      let fabOk = true, fabInfo = null;
      if (fabEl && getComputedStyle(fabEl).display !== 'none') {
        const fst = getComputedStyle(fabEl);
        const fVis = fv && fr.top < vh;   /* footer viewport me hai */
        if (fVis) fabOk = fabEl.classList.contains('fab-hidden') && (fst.opacity === '0' || parseFloat(fst.opacity) < 0.1) && fst.pointerEvents === 'none';
        fabInfo = { hidden: fabEl.classList.contains('fab-hidden'), opacity: fst.opacity, pe: fst.pointerEvents };
      }
      const gapNav = (fv && nv) ? Math.round(nr.top - fr.bottom) : null;
      return {
        vw, vh, appHas,
        hOver: Math.max(0, document.documentElement.scrollWidth - vw),
        culprits: culprits.slice(0, 5),
        docH: document.documentElement.scrollHeight,
        fv, nv,
        fBottom: fr ? Math.round(fr.bottom) : null, fTop: fr ? Math.round(fr.top) : null,
        nTop: nv ? Math.round(nr.top) : null,
        footerBehindNav: fv && nv ? fr.bottom > nr.top + 1 : false,
        footerMidAir: fv && document.documentElement.scrollHeight <= vh + 2
          ? ((nv ? nr.top : vh) - fr.bottom) : null,
        fabOk, fabInfo, gapNav
      };
    });

    const tag = '[' + dev.name + ' ' + dev.w + '×' + dev.h + '] ' + label;
    if (!r.appHas) { P(false, tag + ' page rendered', 'empty #app'); return; }
    P(r.hOver <= 1, tag + ' no horizontal overflow', r.culprits.length ? r.culprits : r.hOver + 'px');
    if (r.hOver > 1) W(tag + ' overflow culprits', r.culprits);
    if (r.fv && r.nv) {
      P(!r.footerBehindNav, tag + ' footer NOT hidden behind bottomnav', 'fBottom ' + r.fBottom + ' vs navTop ' + r.nTop);
      if (r.footerMidAir != null && r.footerMidAir > 8) W(tag + ' footer mid-air gap above nav (short page)', r.footerMidAir + 'px');
      /* v1.4.52: footer-nav clean separation (chipakna fix) */
      P(r.gapNav == null || r.gapNav >= 8, tag + ' footer-bottomnav clean gap (chipka nahi)', (r.gapNav != null ? r.gapNav + 'px' : 'n/a'));
    } else if (r.fv && !r.nv && r.footerMidAir != null) {
      P(r.footerMidAir <= 8, tag + ' short page: footer viewport-bottom pe hai', r.footerMidAir + 'px gap');
    }
    /* v1.4.52: FAB footer/content ke upar chipka nahi (footer dikh rahe to hidden) */
    if (r.fabOk !== undefined) P(r.fabOk, tag + ' FAB footer dikhte waqt hidden (links pe chipakta nahi)', r.fabInfo);
  }

  /* ---------- route list ---------- */
  const R = [];
  R.push({ label: 'dashboard', hash: '#/dashboard' });
  R.push({ label: 'tests', hash: '#/tests' });
  R.push({ label: 'builder', hash: '#/tests/new' });
  R.push({ label: 'test-overview', hash: '#/test/' + testId });
  R.push({ label: 'question-bank', hash: '#/questions' });
  R.push({ label: 'attempts', hash: '#/attempts' });
  R.push({ label: 'settings', hash: '#/settings' });
  R.push({ label: 'import', hash: '#/import' });
  R.push({ label: 'cbt-login', hash: '#/test/' + testId + '/instructions', pre: () => page.evaluate(id => { sessionStorage.removeItem('examLogin_' + id); sessionStorage.removeItem('insOther_' + id); }, testId) });
  R.push({ label: 'instructions-1', hash: '#/test/' + testId + '/instructions', pre: () => page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); sessionStorage.removeItem('insOther_' + id); }, testId) });
  R.push({ label: 'instructions-OTR', hash: '#/test/' + testId + '/instructions', pre: () => page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); sessionStorage.setItem('insOther_' + id, '1'); }, testId) });

  /* attempt bana ke result/analysis hash nikaal */
  const attId = await page.evaluate(async id => {
    const t = await DB.get('tests', id);
    const a = Engine.createAttempt(t, 99, Date.now());
    try { Engine.selectOption(a, (a.sections[a.order ? a.order[0] : Object.keys(a.sections)[0]]).questionIds[0], 1); } catch (e) {}
    Engine.submitExam(a, t, 'user', Date.now());
    try { await DB.put('attempts', a); } catch (e) {}
    return a.id;
  }, testId);
  R.push({ label: 'result', hash: '#/attempt/' + attId + '/result' });
  R.push({ label: 'analysis', hash: '#/attempt/' + attId + '/analysis' });

  /* exam screen (UI flow se — OTR ready) */
  R.push({
    label: 'exam-attempt', hash: '#/test/' + testId + '/instructions',
    pre: () => page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); sessionStorage.setItem('insOther_' + id, '1'); }, testId),
    post: async () => {
      await page.evaluate(() => { const c = document.getElementById('otr-agree'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
      await page.evaluate(() => { const b = document.getElementById('otr-begin'); if (b && !b.disabled) b.click(); });
      await sleep(2500);
    }
  });

  /* ---------- RUN matrix ---------- */
  for (const dev of DEVICES) {
    console.log('─── device ' + dev.name + ' (' + dev.w + '×' + dev.h + ') ───');
    for (const route of R) {
      pageErrors = 0;
      await auditRoute(dev, route.label, route.hash, { beforeNav: route.pre, post: route.post });
      if (pageErrors > 0) W('[' + dev.name + '] ' + route.label + ' JS errors', pageErrors);
      /* mobile screenshots (sirf 390) — user ke liye */
      if (dev.mob && dev.w === 390) await page.screenshot({ path: SHOT + route.label + '-390.png' });
    }
  }

  console.log('━━━ RESPONSIVE AUDIT RESULT: ' + pass + ' passed, ' + fail + ' failed, ' + warn + ' warnings ━━');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('AUDIT CRASH', e); process.exit(2); });
