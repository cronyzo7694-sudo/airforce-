/* v1.4.53 — EXAM SCREEN (real CBT rebuild) acceptance tests
   Dark header / lang tabs / Sections+timer / marking strip / blue bar /
   palette old-CBT shapes + ring / plain options / bottom button order+colors /
   version footer / no body scroll / mobile sab-visible checks */
const puppeteer = require('puppeteer');
const BASE = process.argv[2] === 'live' ? 'https://cronyzo7694-sudo.github.io/airforce-/' : 'http://127.0.0.1:8931/';
const PRE = process.argv[2] === 'live' ? '/home/user/examLIVE-' : '/home/user/exam-local-';
let pass = 0, fail = 0;
const P = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + '  → ' + JSON.stringify(extra)); } };

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'] });
  const page = await browser.newPage();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.setViewport({ width: 1365, height: 768 });
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => { const s = document.getElementById('exam-select'); s.value = 'ssc-chsl'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.configCache && App.configCache.exam === 'ssc-chsl', { timeout: 45000 });
  await page.waitForFunction(() => Store.getMeta('seeded_ssc-chsl', false).then(v => v === true), { timeout: 45000, polling: 500 });
  await sleep(1500);
  const testId = await page.evaluate(async () => { const all = await DB.getAll('tests'); const t = all.find(x => x.exam === 'ssc-chsl' && x.series && x.type === 'full'); return t.id; });
  await page.evaluate(id => { sessionStorage.setItem('examLogin_' + id, '1'); sessionStorage.setItem('insOther_' + id, '1'); location.hash = '#/test/' + id + '/instructions'; }, testId);
  await page.waitForSelector('#otr-begin', { timeout: 20000 });
  await page.evaluate(() => { const c = document.getElementById('otr-agree'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.evaluate(() => document.getElementById('otr-begin').click());
  await page.waitForSelector('.exam-screen', { timeout: 20000 });
  await sleep(1800);

  console.log('━━━ v1.4.53 EXAM SCREEN — REAL CBT acceptance (desktop 1365×768) ━━━');

  /* ---------- C: dark header ---------- */
  const hdr = await page.evaluate(() => {
    const h = document.querySelector('.exam-header');
    const bg = getComputedStyle(h).backgroundColor;
    const inst = document.getElementById('x-instructions');
    const sub = document.getElementById('x-submit');
    const pause = document.getElementById('x-pause');
    const ib = inst.getBoundingClientRect(), sb = sub.getBoundingClientRect();
    return { bg, h: Math.round(h.getBoundingClientRect().height),
      title: (document.querySelector('.eh-exam') || {}).textContent || '',
      inst: !!inst, instX: Math.round(ib.x), subX: Math.round(sb.x), pause: !!pause, dark: /rgb\(51,\s*56,\s*61\)/.test(bg) };
  });
  P('C: header DARK charcoal (#33383d)', hdr.dark, hdr.bg);
  P('C: header compact (~42px)', hdr.h >= 38 && hdr.h <= 48, hdr.h);
  P('C: exam title + ONLINE EXAMINATION', /ONLINE EXAMINATION/.test(hdr.title), hdr.title.trim());
  P('C: Instructions control right side (after title)', hdr.inst && hdr.instX > 700, { instX: hdr.instX });
  P('C: SUBMIT compact header me (right-most)', hdr.subX > hdr.instX, { subX: hdr.subX, instX: hdr.instX });
  P('C: pause control present', hdr.pause);

  /* ---------- D: language tabs ---------- */
  const lang = await page.evaluate(() => {
    const row = document.querySelector('.cbt-langrow');
    const tabs = [...document.querySelectorAll('.langtab')].map(b => {
      const st = getComputedStyle(b);
      return { txt: b.textContent.trim().replace(/i$/, ''), active: b.classList.contains('active'), bg: st.backgroundColor, r: Math.round(parseFloat(st.borderRadius)) };
    });
    const arrows = document.querySelectorAll('.cbt-langrow .nav-arrow').length;
    return { row: !!row, tabs, arrows };
  });
  P('D: language row (grey bg + 2 arrows)', lang.row && lang.arrows >= 2, lang.arrows);
  P('D: English + हिन्दी rectangular tabs (radius ≤ 3px)', lang.tabs.length === 2 && lang.tabs.every(t => t.r <= 3), lang.tabs);
  P('D: active tab blue #3d6fb4, inactive white', /rgb\(61,\s*111,\s*180\)/.test(lang.tabs[0].bg) && lang.tabs[0].active, lang.tabs.map(t => t.bg));

  /* ---------- E: sections + timer ---------- */
  const sec = await page.evaluate(() => {
    const row = document.querySelector('.cbt-secrow');
    const lbl = document.querySelector('.secrow-lbl');
    const tm = document.getElementById('x-timer');
    const st = getComputedStyle(tm);
    const val = document.getElementById('x-timer-val');
    return { row: !!row, lbl: lbl ? lbl.textContent.trim() : '', tmBg: st.backgroundColor, tmPad: st.padding, tmRadius: st.borderRadius,
      valTxt: val ? val.textContent : '', sameRow: row && tm && lbl.getBoundingClientRect().y === tm.getBoundingClientRect().y };
  });
  P('E: "Sections" label left', sec.lbl === 'Sections', sec.lbl);
  P('E: Time Left timer SAME row, plain text (no card bg/padding)', /rgb\(221|rgb\(238|rgba\(0,\s*0,\s*0,\s*0\)/.test(sec.tmBg) || sec.tmBg === 'transparent', sec.tmBg);
  P('E: timer value mm:ss format', /^\d{1,2}:\d{2}$/.test(sec.valTxt), sec.valTxt);

  /* ---------- F: subject tabs ---------- */
  const sub = await page.evaluate(() => {
    const row = document.querySelector('.cbt-subrow');
    const tabs = [...document.querySelectorAll('.subtab')];
    const active = tabs.find(t => t.classList.contains('active'));
    const st = active ? getComputedStyle(active) : null;
    return { row: !!row, n: tabs.length, arrows: document.querySelectorAll('.cbt-subrow .nav-arrow').length,
      activeBg: st ? st.backgroundColor : null, activeR: st ? Math.round(parseFloat(st.borderRadius)) : null,
      names: tabs.map(t => t.textContent.trim().split('\n')[0]) };
  });
  P('F: subject row + arrows, 4 subjects', sub.row && sub.arrows >= 2 && sub.n === 4, { n: sub.n, arrows: sub.arrows, names: sub.names });
  P('F: active subject tab blue rectangular', /rgb\(61,\s*111,\s*180\)/.test(sub.activeBg || '') && sub.activeR <= 3, { bg: sub.activeBg, r: sub.activeR });

  /* ---------- G: marking strip ---------- */
  const mk = await page.evaluate(() => {
    const row = document.querySelector('.cbt-markrow');
    const txt = row ? row.textContent.replace(/\s+/g, ' ').trim() : '';
    const right = row ? row.getBoundingClientRect().right : 0;
    const qArea = document.querySelector('.exam-question-area').getBoundingClientRect();
    const pos = document.querySelector('.mk-pos'), neg = document.querySelector('.mk-neg');
    return { txt, posClr: pos ? getComputedStyle(pos).color : '', negClr: neg ? getComputedStyle(neg).color : '',
      rightAligned: right > qArea.right - 40 };
  });
  P('G: marking strip dynamic "2 | 0.5" (SSC config se)', /correct answer\s*:\s*2/.test(mk.txt) && /Negative Marks\s*:\s*0\.5/.test(mk.txt), mk.txt);
  P('G: green correct + red negative numbers', /30,\s*122,\s*60|46,\s*125|rgb\(30/.test(mk.posClr) && /192,\s*57,\s*43/.test(mk.negClr), { p: mk.posClr, n: mk.negClr });
  P('G: right-aligned', mk.rightAligned, mk.rightAligned);

  /* ---------- H: blue strip ---------- */
  const blue = await page.evaluate(() => {
    const b = document.querySelector('.cbt-bluebar');
    if (!b) return null;
    const st = getComputedStyle(b), r = b.getBoundingClientRect();
    const qa = document.querySelector('.exam-question-area').getBoundingClientRect();
    return { bg: st.backgroundColor, h: Math.round(r.height), fullW: Math.abs(r.width - qa.width) < 3, aboveQ: r.bottom <= qa.top + 12 };
  });
  P('H: solid blue strip over question area (6–12px, full width)', blue && /rgb\(45,\s*92,\s*158\)/.test(blue.bg) && blue.h >= 5 && blue.h <= 14 && blue.fullW, blue);

  /* ---------- I: split + sidebar width ---------- */
  const split = await page.evaluate(() => {
    const pal = document.querySelector('.palette-panel').getBoundingClientRect();
    const qa = document.querySelector('.exam-question-area').getBoundingClientRect();
    return { palW: Math.round(pal.width), qaW: Math.round(qa.width), palLeft: Math.round(pal.left), vw: innerWidth, divider: getComputedStyle(document.querySelector('.palette-panel')).borderLeftWidth };
  });
  P('I: palette ~248px + question area full-bleed', Math.abs(split.palW - 248) <= 6 && split.qaW > 1000, split);
  P('I: vertical divider present', split.divider !== '0px', split.divider);

  /* ---------- J/K: palette candidate + legend shapes ---------- */
  const pal = await page.evaluate(() => {
    const cp = document.querySelector('.cand-panel');
    const name = document.querySelector('.cand-name');
    const leg = document.querySelector('.legend');
    const rows = [...document.querySelectorAll('.legend-row')].map(r => r.textContent.trim());
    const shapes = {};
    for (const cls of ['answered', 'notanswered', 'notvisited', 'marked', 'ansmarked']) {
      const b = document.querySelector('.legend-row .qbtn.' + cls);
      if (!b) { shapes[cls] = null; continue; }
      const st = getComputedStyle(b);
      shapes[cls] = { clip: st.clipPath !== 'none', radius: st.borderRadius, bg: st.backgroundColor };
    }
    return { cp: !!cp, name: name ? name.textContent.trim() : '', legTitle: (document.querySelector('.legend-title') || {}).textContent || '',
      rows, shapes, photo: !!document.querySelector('.cand-panel .nav-avatar') };
  });
  P('J: candidate photo + name TOP of palette', pal.cp && pal.photo && pal.name.length > 0, pal.name);
  P('K: "Legend:" title + 5 statuses', /Legend:?/.test(pal.legTitle) && pal.rows.length === 5, { t: pal.legTitle, n: pal.rows.length });
  P('K: ANSWERED = green octagon (clip-path)', pal.shapes.answered && pal.shapes.answered.clip === true, pal.shapes.answered);
  P('K: NOT ANSWERED = red octagon (clip-path)', pal.shapes.notanswered && pal.shapes.notanswered.clip === true, pal.shapes.notanswered);
  P('K: NOT VISITED = white square (no clip)', pal.shapes.notvisited && pal.shapes.notvisited.clip === false, pal.shapes.notvisited);
  P('K: MARKED = purple circle (radius 50%)', pal.shapes.marked && pal.shapes.marked.radius === '50%', pal.shapes.marked);
  P('K: ANSWERED+MARKED = purple circle + green dot', pal.shapes.ansmarked && pal.shapes.ansmarked.radius === '50%', pal.shapes.ansmarked);

  /* ---------- L/M: palette grid + current ring ---------- */
  const grid = await page.evaluate(() => {
    const g = document.querySelector('.palette-grid');
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
    const btns = g.querySelectorAll('.qbtn').length;
    const cur = g.querySelector('.qw.cur');
    const ring = cur ? getComputedStyle(cur).outlineWidth : 'none';
    const firstBtn = g.querySelector('.qbtn');
    const b = firstBtn.getBoundingClientRect();
    return { cols, btns, ring: ring !== 'none' ? ring : '0px', btnW: Math.round(b.width), btnH: Math.round(b.height) };
  });
  P('L: palette grid ~5/row, compact buttons (≤44px)', grid.cols === 5 && grid.btns === 25 && grid.btnW <= 44 && grid.btnH <= 44, grid);
  P('M: current question STRONG ring (3px)', grid.ring === '3px', grid.ring);

  /* ---------- N/O/P: question header ---------- */
  const qh = await page.evaluate(() => {
    const no = document.querySelector('.q-no');
    const marks = document.querySelector('.q-marks');
    const st = marks ? getComputedStyle(marks) : null;
    const head = document.querySelector('.q-head');
    const divider = head ? getComputedStyle(head).borderBottomWidth + ' ' + getComputedStyle(head).borderBottomColor : '';
    const rep = document.getElementById('x-report'), lang = document.getElementById('q-lang');
    return { no: no ? no.textContent.replace(/\s+/g, ' ').trim() : '', marks: marks ? marks.textContent.trim() : '',
      marksBg: st ? st.backgroundColor : '', divider,
      rep: !!rep, repBg: rep ? getComputedStyle(rep).backgroundColor : '', lang: !!lang };
  });
  P('N: "Question No. 1 / 25" dynamic', /Question No\.\s*1\s*\/\s*25/.test(qh.no), qh.no);
  P('N: Marks "+2 -0.5" dynamic, PLAIN text (no pill bg)', /Marks \+2 -0\.5/.test(qh.marks) && (qh.marksBg === 'rgba(0, 0, 0, 0)' || qh.marksBg === 'transparent'), { m: qh.marks, bg: qh.marksBg });
  P('O: thin dark/blue divider under question header', /(1|1\.5|2)px/.test(qh.divider) && /rgb\(29,\s*78,\s*137\)/.test(qh.divider), qh.divider);
  P('P: Report (yellow/orange) + View in dropdown', qh.rep && /rgb\(253/.test(qh.repBg) && qh.lang, { repBg: qh.repBg, lang: qh.lang });

  /* ---------- Q/R: question text + options ---------- */
  const q = await page.evaluate(() => {
    const qt = document.getElementById('q-text');
    const opts = [...document.querySelectorAll('.opt')];
    const o = opts[0];
    const st = o ? getComputedStyle(o) : null;
    const radio = o ? o.querySelector('.opt-radio') : null;
    const rst = radio ? getComputedStyle(radio) : null;
    return { qt: qt ? qt.textContent.trim().length : 0,
      n: opts.length, padV: st ? Math.round(parseFloat(st.paddingTop)) : 0, radius: st ? st.borderRadius : '',
      radioR: rst ? rst.borderRadius : '', radioB: rst ? rst.borderTopWidth : '',
      letters: opts.map(x => x.querySelector('.opt-letter').textContent) };
  });
  P('Q: question text dikhta hai', q.qt > 20, q.qt);
  P('R: 4 options A-D plain rows (compact ≤10px pad, radius ≤3px)', q.n === 4 && q.padV <= 10 && parseFloat(q.radius) <= 3, { n: q.n, padV: q.padV, radius: q.radius, letters: q.letters });
  P('R: radio circles (50%)', q.radioR === '50%', q.radioR);

  /* ---------- S/T/U/V/W: bottom bar ---------- */
  const bb = await page.evaluate(() => {
    const bar = document.querySelector('.exam-bottom');
    const ids = ['x-mark', 'x-clear', 'x-prev', 'x-save'].map(id => {
      const b = document.getElementById(id);
      if (!b) return null;
      const st = getComputedStyle(b), r = b.getBoundingClientRect();
      return { id, x: Math.round(r.x), bg: st.backgroundColor, radius: Math.round(parseFloat(st.borderRadius)), h: Math.round(r.height), disabled: b.disabled, visible: r.width > 0 };
    });
    const st = getComputedStyle(bar);
    return { ids, barTop: st.borderTopWidth, pos: bar.getBoundingClientRect(), fixedToArea: bar.parentElement.classList.contains('exam-question-area') };
  });
  const m = bb.ids.find(x => x.id === 'x-mark'), cl = bb.ids.find(x => x.id === 'x-clear'), pv = bb.ids.find(x => x.id === 'x-prev'), sv = bb.ids.find(x => x.id === 'x-save');
  P('U: order LEFT [Mark & Next][Clear] RIGHT [Previous][Save & Next]', bb.ids.every(Boolean) && m.x < cl.x && cl.x < pv.x && pv.x < sv.x, bb.ids.map(i => i && i.id + '@' + i.x));
  P('U: Mark = beige, Clear = white, Prev = white, Save = light green, radius ≤3px',
    /rgb\(245,\s*238,\s*203\)/.test(m.bg) && /rgb\(255,\s*255,\s*255\)/.test(cl.bg) && /rgb\(255,\s*255,\s*255\)/.test(pv.bg) && /rgb\(216,\s*236,\s*216\)/.test(sv.bg) && [m, cl, pv, sv].every(b => b.radius <= 3),
    { m: m.bg, c: cl.bg, p: pv.bg, s: sv.bg });
  P('U: bottom bar question-area ke andar fixed strip', bb.fixedToArea && bb.barTop !== '0px', bb.barTop);
  P('V: Q1 pe Previous VISIBLE but disabled', pv.visible && pv.disabled === true, { visible: pv.visible, dis: pv.disabled });

  /* ---------- X: version footer ---------- */
  const vf = await page.evaluate(() => {
    const f = document.querySelector('.exam-verfoot');
    if (!f) return null;
    const st = getComputedStyle(f), r = f.getBoundingClientRect();
    const scr = document.querySelector('.exam-screen').getBoundingClientRect();
    return { txt: f.textContent.trim(), bg: st.backgroundColor, clr: st.color, atBottom: Math.abs(r.bottom - scr.bottom) < 3, centered: st.textAlign, h: Math.round(r.height) };
  });
  P('X: "Version : 17.07.00" footer blue-grey, centered, sabse niche', vf && /^Version : 17\.07\.00$/.test(vf.txt) && vf.atBottom && vf.centered === 'center', vf);

  /* ---------- AD/T: scroll rules ---------- */
  const scr = await page.evaluate(() => {
    const pal = document.querySelector('.palette-panel');
    const docH = document.documentElement.scrollHeight;
    return { bodyScroll: docH - innerHeight, palOverflow: getComputedStyle(pal).overflowY, palScrollable: pal.scrollHeight >= pal.clientHeight };
  });
  P('AD: body scroll NAHI (100vh CBT viewport)', scr.bodyScroll <= 0, scr.bodyScroll);
  P('T: palette internal scroll (overflow-y auto)', scr.palOverflow === 'auto' || scr.palOverflow === 'scroll', scr.palOverflow);

  /* ---------- Y: no floating hamburger ---------- */
  const fab = await page.evaluate(() => { const f = document.getElementById('chat-fab'); return !f || getComputedStyle(f).display === 'none'; });
  P('Y: floating hamburger (FAB) exam me NAHI', fab);

  /* ---------- language tab functional test ---------- */
  await page.evaluate(() => { const t = document.querySelector('.langtab[data-lang="hi"]'); t.click(); });
  await sleep(900);
  const hiTxt = await page.evaluate(() => {
    const qt = document.getElementById('q-text');
    const sel = document.getElementById('q-lang');
    return { hi: qt ? /[\u0900-\u097F]/.test(qt.textContent) : false, selVal: sel ? sel.value : '', active: document.querySelector('.langtab.active').dataset.lang };
  });
  P('D: हिन्दी tab click → question हिन्दी me + q-lang sync', hiTxt.hi && hiTxt.selVal === 'hi' && hiTxt.active === 'hi', hiTxt);
  await page.evaluate(() => { document.querySelector('.langtab[data-lang="en"]').click(); });
  await sleep(700);

  /* ---------- select option + palette state ---------- */
  await page.evaluate(() => { const o = document.querySelector('.opt'); if (o) o.click(); });
  await sleep(400);
  await page.evaluate(() => { document.getElementById('x-save').click(); });
  await sleep(900);
  const st2 = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.palette-grid .qbtn')];
    const ans = btns.find(b => b.classList.contains('answered'));
    const cur = document.querySelector('.qw.cur');
    return { answered: !!ans, curIsQ2: cur && cur.querySelector('.qbtn').textContent.trim() === '2', ringOnCur: cur ? getComputedStyle(cur).outlineWidth : 'none' };
  });
  P('AE: option select + Save&Next → Q1 answered (green octagon)', st2.answered, st2);
  P('AE: current Q2 ring wrapper me', st2.curIsQ2 && st2.ringOnCur === '3px', st2);

  await page.screenshot({ path: PRE + '1-exam-desktop.png' });

  /* ══════════ MOBILE 390×844 ══════════ */
  console.log('━━━ MOBILE 390×844 — sab CBT rows visible, responsive intact ━━━');
  await page.setViewport({ width: 390, height: 844 });
  await sleep(700);
  const mob = await page.evaluate(() => {
    const vis = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.display !== 'none' && r.right > 0 && r.left < innerWidth; };
    const el = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
    const drawer = document.getElementById('drawer-btn');
    const bottomBtns = ['x-mark', 'x-clear', 'x-prev', 'x-save'].map(id => { const b = document.getElementById(id); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return {
      hOver: document.documentElement.scrollWidth - innerWidth,
      rows: { header: vis('.exam-header'), lang: vis('.cbt-langrow'), sec: vis('.cbt-secrow'), sub: vis('.cbt-subrow'), mark: vis('.cbt-markrow'), blue: vis('.cbt-bluebar'), verfoot: vis('.exam-verfoot') },
      question: vis('#q-text'), opts: document.querySelectorAll('.opt').length,
      bottom: vis('.exam-bottom'), bottomBtns,
      drawer: !!drawer && getComputedStyle(drawer).display !== 'none',
      timerVal: vis('#x-timer-val'),
      docH: document.documentElement.scrollHeight, vh: innerHeight
    };
  });
  P('AC(mobile): NO horizontal overflow', mob.hOver <= 1, mob.hOver);
  P('AC(mobile): header+lang+sections+subject+marking+blue+version sab visible', Object.values(mob.rows).every(Boolean), mob.rows);
  P('AC(mobile): question + 4 options visible', mob.question && mob.opts === 4, { q: mob.question, o: mob.opts });
  P('AC(mobile): bottom bar 4 buttons visible', mob.bottom && mob.bottomBtns.every(Boolean), mob.bottomBtns);
  P('AC(mobile): timer visible', mob.timerVal);
  P('AC(mobile): palette drawer button (☰ header me)', mob.drawer);
  P('AD(mobile): body scroll nahi (internal viewport)', mob.docH <= mob.vh, { docH: mob.docH, vh: mob.vh });

  /* palette drawer open/close mobile */
  await page.evaluate(() => document.getElementById('drawer-btn').click());
  await sleep(500);
  const drawerOpen = await page.evaluate(() => {
    const p = document.querySelector('.palette-panel');
    return p.classList.contains('open') && p.getBoundingClientRect().left < innerWidth;
  });
  P('AC(mobile): palette drawer khulta hai', drawerOpen);
  await page.screenshot({ path: PRE + '3-mobile-palette.png' });
  await page.evaluate(() => document.getElementById('pal-close').click());
  await sleep(400);
  await page.screenshot({ path: PRE + '2-exam-mobile.png' });

  console.log('━━━ EXAM SCREEN RESULT: ' + pass + ' passed, ' + fail + ' failed ━━━');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
