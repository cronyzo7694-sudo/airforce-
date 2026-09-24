/* v1.4.77 visual check: reasoning figure-Q in exam view (stem img + 4 opt-imgs)
   usage: node tools/figq-shot.js <baseURL> <outPrefix> <W> <H> */
const puppeteer = require('puppeteer');
(async () => {
  const [base, out, W, H] = process.argv.slice(2);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#exam-select', { timeout: 180000 });
  await page.evaluate(async () => {
    document.querySelector('#exam-select').value = 'ssc-chsl';
    document.querySelector('#exam-select').dispatchEvent(new Event('change', { bubbles: true }));
  });
  /* seed wait: questions appear in DB */
  await page.waitForFunction(async () => {
    try {
      const all = await DB.getAll('questions');
      return all.filter(q => q.exam === 'ssc-chsl' && q.subject === 'reasoning').length === 25;
    } catch (e) { return false; }
  }, { timeout: 180000, polling: 1000 });
  const info = await page.evaluate(async () => {
    const g = await Generator.subjectTest('reasoning');
    if (!g.ok) return { err: g.error };
    await DB.put('tests', g.test);
    return { id: g.test.id, n: g.test.sections[0].questionIds.length };
  });
  if (info.err) { console.error('subjectTest fail:', info.err); process.exit(1); }
  console.log('reasoning test:', info.id, info.n + ' Qs');
  await page.evaluate((id) => { location.hash = '#/test/' + id + '/instructions'; }, info.id);
  /* CBT gate: candidate pane Sign In → instructions Next → OTR declaration → Begin */
  await page.waitForFunction(() => !!document.getElementById('login-btn'), { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('login-btn').dispatchEvent(new Event('click', { bubbles: true })); });
  await page.waitForFunction(() => !!document.getElementById('ins-next'), { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('ins-next').dispatchEvent(new Event('click', { bubbles: true })); });
  await page.waitForFunction(() => !!document.getElementById('otr-begin'), { timeout: 60000 });
  await page.evaluate(() => {
    document.getElementById('otr-agree').checked = true;
    document.getElementById('otr-agree').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('otr-begin').dispatchEvent(new Event('click', { bubbles: true }));
  });
  await page.waitForSelector('.opt', { timeout: 60000 });
  /* navigate until a figure-based Q (stem img + opt-imgs) is on screen */
  let found = await page.$('.opt-img');
  for (let i = 0; i < 30 && !found; i++) {
    const btn = await page.$('#x-save');
    if (!btn) { console.error('next-btn not found'); break; }
    await btn.evaluate(b => b.click());
    await new Promise(r => setTimeout(r, 300));
    found = await page.$('.opt-img');
  }
  if (!found) { console.error('figure Q not reached'); process.exit(1); }
  await page.screenshot({ path: out + '-exam-390.png', fullPage: false });
  /* scroll a bit to capture options too */
  await page.evaluate(() => { const el = document.querySelector('.q-scroll') || document.scrollingElement; if (el) el.scrollTop += 160; });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: out + '-opts.png', fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('overflow-x px:', overflow, '| pageerrors:', errs.length ? errs.join(' || ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
