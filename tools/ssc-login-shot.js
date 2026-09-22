/* v1.4.49 — SSC candidate-login REAL browser screenshot (user ko dikhane ke liye) */
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.goto('http://127.0.0.1:8931/index.html#/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  // SSC switch
  await page.evaluate(() => {
    const sel = document.getElementById('exam-select');
    sel.value = 'ssc-chsl';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.configCache && App.configCache.exam === 'ssc-chsl', { timeout: 45000 });
  await page.waitForFunction(() => Store.getMeta('seeded_ssc-chsl', false).then(v => v === true), { timeout: 45000, polling: 500 });
  await sleep(2000);
  // SSC mock ke instructions pe jao (login stage dikhega)
  const testId = await page.evaluate(async () => {
    const all = await DB.getAll('tests');
    const t = all.find(x => x.exam === 'ssc-chsl' && x.series && x.type === 'full') || all.find(x => x.exam === 'ssc-chsl');
    return t && t.id;
  });
  await page.evaluate(id => { sessionStorage.removeItem('examLogin_' + id); location.hash = '#/test/' + id + '/instructions'; }, testId);
  await page.waitForSelector('#login-btn', { timeout: 30000 });
  await sleep(800);
  await page.screenshot({ path: '/home/user/ssc-cbt-login-desktop.png' });

  // mobile bhi
  await page.setViewport({ width: 390, height: 780 });
  await sleep(700);
  await page.screenshot({ path: '/home/user/ssc-cbt-login-mobile.png' });

  await browser.close();
  console.log('screenshots done: ssc-cbt-login-desktop.png + ssc-cbt-login-mobile.png (testId ' + testId + ')');
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
