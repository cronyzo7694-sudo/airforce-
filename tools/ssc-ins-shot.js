/* v1.4.50 — SSC INSTRUCTIONS page: real CBT layout verify + screenshots
   Acceptance tests: fixed regions, internal-only scroll, Next fixed, etc. */
const puppeteer = require('puppeteer');
const BASE = process.argv[2] === 'live' ? 'https://cronyzo7694-sudo.github.io/airforce-/' : 'http://127.0.0.1:8931/';
const PRE = process.argv[2] === 'live' ? '/home/user/ssc-ins-LIVE-' : '/home/user/ssc-ins-local-';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.setViewport({ width: 1365, height: 768 });
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => {
    const sel = document.getElementById('exam-select');
    sel.value = 'ssc-chsl';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.configCache && App.configCache.exam === 'ssc-chsl', { timeout: 45000 });
  await page.waitForFunction(() => Store.getMeta('seeded_ssc-chsl', false).then(v => v === true), { timeout: 45000, polling: 500 });
  await sleep(2000);
  const testId = await page.evaluate(async () => {
    const all = await DB.getAll('tests');
    const t = all.find(x => x.exam === 'ssc-chsl' && x.series && x.type === 'full') || all.find(x => x.exam === 'ssc-chsl');
    return t.id;
  });
  // login stage bypass + instructions pe seedha
  await page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); location.hash = '#/test/' + id + '/instructions'; }, testId);
  await page.waitForSelector('.cbt-ins-app', { timeout: 30000 });
  await sleep(800);

  const res = await page.evaluate(() => {
    const out = {};
    out.blueStrip = !!document.querySelector('.cl-band');
    out.titlebar = (document.querySelector('.ins2-titlebar') || {}).textContent || '';
    out.viewin = !!document.getElementById('ins-lang');
    out.photo = !!document.querySelector('.ins2-photo');
    out.name = !!document.querySelector('.ins2-name');
    out.noDeclare = !document.getElementById('ins-agree');
    out.nextBtn = (document.getElementById('ins-begin') || {}).textContent || '';
    out.legend = document.querySelectorAll('.ins2-leg-row').length;
    const doc = document.querySelector('.ins2-doc');
    out.docScrollable = doc && doc.scrollHeight > 100;
    // panel/bottomnav position before scroll
    out.photoTop1 = document.querySelector('.ins2-photo').getBoundingClientRect().top;
    out.navBottom1 = document.querySelector('.ins2-bottomnav').getBoundingClientRect().bottom;
    return out;
  });
  // scroll the LEFT region to bottom
  await page.evaluate(() => {
    const sc = document.querySelector('.ins2-scroll');
    sc.scrollTop = sc.scrollHeight;
  });
  await sleep(400);
  const res2 = await page.evaluate(() => ({
    scrollTop: document.querySelector('.ins2-scroll').scrollTop,
    bodyScrollY: window.scrollY,
    docHeight: document.documentElement.scrollHeight,
    winH: window.innerHeight,
    photoTop2: document.querySelector('.ins2-photo').getBoundingClientRect().top,
    navBottom2: document.querySelector('.ins2-bottomnav').getBoundingClientRect().bottom,
    // content last rule bottom nav ke upar hi rukta hai?
    lastRuleBottom: document.querySelector('.ins2-rules li:last-child').getBoundingClientRect().bottom,
    navTop: document.querySelector('.ins2-bottomnav').getBoundingClientRect().top,
    pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 2
  }));

  const P = (name, ok, extra) => console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  → ' + JSON.stringify(extra)));
  console.log('━━━ v1.4.50 SSC INSTRUCTIONS — CBT layout acceptance tests ─━━');
  P('TEST 0: blue strip + cyan Instructions bar', res.blueStrip && /Instructions/i.test(res.titlebar), res.titlebar);
  P('TEST 0: View in language top + photo/name panel + Next', res.viewin && res.photo && res.name && /Next/.test(res.nextBtn), res);
  P('TEST 6: koi declaration/ready-to-begin NAHI', res.noDeclare);
  P('legend 5 statuses', res.legend === 5, res.legend);
  P('TEST 2: LEFT content scrolls internally', res2.scrollTop > 0, res2.scrollTop);
  P('body/page scroll NAHI hota (scrollY=0)', res2.bodyScrollY === 0, res2.bodyScrollY);
  P('page height = viewport (no body scrollbar)', !res2.pageOverflow, res2.docHeight + '/' + res2.winH);
  P('TEST 4: candidate panel FIXED (photo same position)', Math.abs(res.photoTop1 - res2.photoTop2) < 2, res.photoTop1 + '→' + res2.photoTop2);
  P('TEST 5: bottom nav FIXED at viewport bottom', Math.abs(res.navBottom1 - res2.navBottom2) < 2 && Math.abs(res2.navBottom2 - res2.winH) < 2, res2.navBottom2 + '/' + res2.winH);
  P('TEST 3: content bottom-nav ke PEECHE nahi jata', res2.lastRuleBottom <= res2.navTop + 1, res2.lastRuleBottom.toFixed(0) + ' <= ' + res2.navTop.toFixed(0));

  await page.evaluate(() => { document.querySelector('.ins2-scroll').scrollTop = 0; });
  await sleep(400);
  await page.screenshot({ path: PRE + 'desktop-top.png' });
  await page.evaluate(() => { const sc = document.querySelector('.ins2-scroll'); sc.scrollTop = sc.scrollHeight * 0.4; });
  await sleep(400);
  await page.screenshot({ path: PRE + 'desktop-mid.png' });
  await page.setViewport({ width: 390, height: 780 });
  await sleep(600);
  await page.screenshot({ path: PRE + 'mobile.png' });
  await browser.close();
  console.log('screenshots: ' + PRE + 'desktop-top.png / desktop-mid.png / mobile.png');
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
