/* v1.4.51 — SSC "OTHER IMPORTANT INSTRUCTIONS" (2nd CBT screen) acceptance tests
   TEST A login→ins1, B Next→otr, C internal scroll, D fixed regions, E no text
   behind declaration, F Previous→back, G ready→exam start (existing engine) */
const puppeteer = require('puppeteer');
const BASE = process.argv[2] === 'live' ? 'https://cronyzo7694-sudo.github.io/airforce-/' : 'http://127.0.0.1:8931/';
const PRE = process.argv[2] === 'live' ? '/home/user/ssc-otr-LIVE-' : '/home/user/ssc-otr-local-';

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
  await page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); sessionStorage.removeItem('insOther_' + id); location.hash = '#/test/' + id + '/instructions'; }, testId);
  await page.waitForSelector('#ins-next', { timeout: 30000 });
  await sleep(600);
  await page.screenshot({ path: PRE + '1-first-ins.png' });

  const P = (name, ok, extra) => console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  → ' + JSON.stringify(extra)));

  console.log('━━━ v1.4.51 OTHER IMPORTANT INSTRUCTIONS — acceptance tests ━━━');
  P('TEST A: login→first Instructions page', true);

  // TEST B: Next → second screen
  await page.click('#ins-next');
  await page.waitForSelector('#otr-begin', { timeout: 15000 });
  await sleep(500);
  const b = await page.evaluate(() => ({
    title: (document.querySelector('.otr-titlebar') || {}).textContent || '',
    table: document.querySelectorAll('.otr-tbl tbody tr').length,
    viewin: !!document.getElementById('otr-viewlang'),
    lang: !!document.getElementById('otr-lang'),
    red: /default language/.test(document.body.textContent),
    decl: !!document.getElementById('otr-agree'),
    prev: !!document.getElementById('otr-prev'),
    ready: !!document.getElementById('otr-begin'),
    candPhoto: !!document.querySelector('.ins2-photo'),
    totalTxt: (document.querySelector('.otr-tbl-total') || {}).textContent || ''
  }));
  P('TEST B: Next → "Other Important Instructions" khula', /Other Important Instructions/.test(b.title), b.title);
  P('paper table rows (4 subjects + total) + total values', b.table === 5 && /100/.test(b.totalTxt) && /60 Minutes/.test(b.totalTxt), b.totalTxt.trim());
  P('View in top + Choose language bottom + red note', b.viewin && b.lang && b.red);
  P('declaration + Previous + I-am-ready-to-begin', b.decl && b.prev && b.ready);
  P('right candidate panel fixed (photo)', b.candPhoto);
  await page.screenshot({ path: PRE + '2-otr-top.png' });

  // TEST C/D/E: scroll behavior
  const before = await page.evaluate(() => ({
    photoTop: document.querySelector('.ins2-photo').getBoundingClientRect().top,
    bandTop: document.querySelector('.cl-band').getBoundingClientRect().top,
    titleTop: document.querySelector('.otr-titlebar').getBoundingClientRect().top,
    bottomTop: document.querySelector('.otr-bottom').getBoundingClientRect().top
  }));
  await page.evaluate(() => { const sc = document.querySelector('.otr-scroll'); sc.scrollTop = sc.scrollHeight; });
  await sleep(400);
  const after = await page.evaluate(() => ({
    scrollTop: document.querySelector('.otr-scroll').scrollTop,
    scrollY: window.scrollY,
    photoTop: document.querySelector('.ins2-photo').getBoundingClientRect().top,
    bandTop: document.querySelector('.cl-band').getBoundingClientRect().top,
    titleTop: document.querySelector('.otr-titlebar').getBoundingClientRect().top,
    bottomTop: document.querySelector('.otr-bottom').getBoundingClientRect().top,
    lastLiBottom: document.querySelector('.otr-rules li:last-child').getBoundingClientRect().bottom,
    pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 2
  }));
  P('TEST C: sirf instruction document scroll hota hai', after.scrollTop > 0, after.scrollTop);
  P('TEST C: body/page scroll NAHI', after.scrollY === 0 && !after.pageOverflow, after.scrollY + '/' + after.pageOverflow);
  P('TEST D: blue strip + title bar FIXED', Math.abs(before.bandTop - after.bandTop) < 1 && Math.abs(before.titleTop - after.titleTop) < 1);
  P('TEST D: candidate panel FIXED', Math.abs(before.photoTop - after.photoTop) < 2, before.photoTop + '→' + after.photoTop);
  P('TEST D: bottom declaration panel FIXED', Math.abs(before.bottomTop - after.bottomTop) < 1);
  P('TEST E: last text declaration panel ke NEECHE nahi', after.lastLiBottom <= after.bottomTop + 1, after.lastLiBottom.toFixed(0) + ' <= ' + after.bottomTop.toFixed(0));
  await page.screenshot({ path: PRE + '3-otr-scrolled.png' });

  // TEST F: Previous → first screen
  await page.click('#otr-prev');
  await page.waitForSelector('#ins-next', { timeout: 15000 });
  const f = await page.evaluate(() => !!document.getElementById('ins-next') && !document.getElementById('otr-begin'));
  P('TEST F: Previous → wapas pehla Instructions', f);
  await page.screenshot({ path: PRE + '4-back-to-first.png' });

  // TEST G: Next → agree → ready → EXAM START (existing engine)
  await page.click('#ins-next');
  await page.waitForSelector('#otr-begin', { timeout: 15000 });
  const readyDisabled = await page.evaluate(() => document.getElementById('otr-begin').disabled);
  P('TEST G: ready DISABLED bina declaration ke', readyDisabled === true);
  await page.click('#otr-agree');
  await page.click('#otr-begin');
  await page.waitForSelector('.exam-screen', { timeout: 30000 });
  const g = await page.evaluate(() => ({
    exam: !!document.querySelector('.exam-screen'),
    q100: typeof Engine !== 'undefined' && Engine.allQuestionIds(ExamScreen.attempt).length
  }));
  P('TEST G: declaration → I am ready to begin → EXAM START', g.exam && g.q100 === 100, g);
  await page.screenshot({ path: PRE + '5-exam-started.png' });

  await page.setViewport({ width: 390, height: 780 });
  await sleep(500);
  await page.screenshot({ path: PRE + '6-mobile.png' });
  await browser.close();
  console.log('screenshots: ' + PRE + '1..6.png');
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
