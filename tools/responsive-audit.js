/* ═══ DEEP AUDIT — tap targets, clipping, overlaps, 320px phone ═══ */
const puppeteer = require('puppeteer');
const BASE = process.env.BASE || 'http://127.0.0.1:8900';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/#/dashboard', { waitUntil: 'networkidle0', timeout: 40000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const q = await page.evaluate(() => (typeof DB !== 'undefined' && DB.count) ? DB.count('questions') : 0).catch(() => 0);
    if (q >= 2500) break; await new Promise(r => setTimeout(r, 1000));
  }
  const testId = await page.evaluate(async () => {
    const r = await Generator.generate({ name: 'AUD2', type: 'subject', mode: 'practice', sections: [{ subjectId: 'physics', count: 10 }] });
    return r.test.id;
  });

  const routes = ['/dashboard', '/tests', '/tests/new', '/questions', '/attempts', '/import', '/settings',
    '/test/' + testId + '/instructions', '/test/' + testId];
  const issues = [];
  const log = (...a) => console.log(...a);

  for (const vp of [{ w: 375, n: '375' }, { w: 320, n: '320' }]) {
    await page.setViewport({ width: vp.w, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    log(`\n═══ ${vp.n}px ═══`);
    for (const r of routes) {
      await page.goto(BASE + '/#' + r, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(s => setTimeout(s, r === '/questions' ? 2500 : 1100));
      const found = await page.evaluate(() => {
        const out = [];
        const iw = window.innerWidth;
        if (document.documentElement.scrollWidth > iw + 1) out.push('H-OVERFLOW doc ' + document.documentElement.scrollWidth);
        // out-of-view visible elements (scrollable containers ke andar wale skip)
        document.querySelectorAll('#app *, #app-nav *, .topnav *').forEach(el => {
          let p = el.parentElement, inScroller = false;
          while (p && p !== document.body) {
            const ps = getComputedStyle(p);
            if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll')) { inScroller = true; break; }
            p = p.parentElement;
          }
          if (inScroller) return;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed') return;
          if (st.transform && st.transform !== 'none') return; // drawers
          const rc = el.getBoundingClientRect();
          if (rc.width > 4 && (rc.right > iw + 3 || rc.left < -3)) out.push(`OOV ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${Math.round(rc.left)}..${Math.round(rc.right)}]`);
        });
        // tiny tap targets (interactive)
        document.querySelectorAll('#app button, #app a, #app input, #app select, .bottomnav a').forEach(el => {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') return;
          const rc = el.getBoundingClientRect();
          if (rc.width > 0 && rc.height > 0 && rc.height < 30 && !el.closest('.bn-tab')) out.push(`TINY-TAP ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} h=${Math.round(rc.height)}`);
        });
        // text clipping (block elements jahan text kata hua)
        document.querySelectorAll('#app h1, #app h2, #app h3, .t2-name, .stat-val, .dash-greet *').forEach(el => {
          if (el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).overflowX !== 'auto') {
            out.push(`CLIP ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${el.scrollWidth}>${el.clientWidth}`);
          }
        });
        return out;
      });
      found.forEach(f => { issues.push(`[${vp.n}${r}] ${f}`); log(`  ⚠ [${vp.n} ${r}] ${f}`); });
    }
  }

  // exam + result + analysis 375px
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/#/test/' + testId + '/instructions', { waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(s => setTimeout(s, 1500));
  await page.evaluate(() => { const b = document.querySelector('.cl-card button, .cl-card .btn'); if (b) b.click(); });
  await new Promise(s => setTimeout(s, 1200));
  await page.evaluate(() => { const c = document.getElementById('ins-agree'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } const b = document.getElementById('ins-begin'); if (b) b.click(); });
  await new Promise(s => setTimeout(s, 2500));
  let found = await page.evaluate(() => {
    const out = []; const iw = window.innerWidth;
    document.querySelectorAll('.exam-header *, .exam-bottom *').forEach(el => {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      const rc = el.getBoundingClientRect();
      if (rc.width > 4 && (rc.right > iw + 3 || rc.left < -3)) out.push(`EXAM-OOV ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${Math.round(rc.left)}..${Math.round(rc.right)}]`);
    });
    // bottom bar buttons overlap check
    const btns = Array.from(document.querySelectorAll('.exam-bottom .xbtn')).filter(b => getComputedStyle(b).display !== 'none');
    btns.forEach((b, i) => { if (btns[i + 1]) { const r1 = b.getBoundingClientRect(), r2 = btns[i + 1].getBoundingClientRect(); if (r2.left < r1.right - 2) out.push('EXAM-BTN OVERLAP'); } });
    return out;
  });
  found.forEach(f => { issues.push('[exam] ' + f); log('  ⚠ [exam]', f); });

  console.log('\n════ TOTAL DEEP ISSUES:', issues.length, '════');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
