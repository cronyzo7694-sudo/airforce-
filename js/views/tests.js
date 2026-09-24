/* ============================================================
 * VIEW: TEST LIBRARY + TEST OVERVIEW + CUSTOM TEST BUILDER
 * ============================================================ */

/* tiny inline icon set (stroke style, matches bottom nav) */
const T2IC = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  sad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 16c1-1.2 2-1.8 3-1.8s2 .6 3 1.8"/></svg>'
};

Views.tests = async function (state) {
  state = state || { type: 'all', status: 'none', subject: 'all', search: '', sort: 'recent', page: 1 };
  if (!state.subject) state.subject = 'all';
  const cfg = await App.config();
  /* v1.4.46 EXAM ISOLATION: poori library current exam ke data par —
     attempts, naam-match, test list sab exam-scoped */
  const curExam = (App.configCache && App.configCache.exam) || 'airforce';
  const idx = (await Store.getMeta('attemptIndex', [])).filter(a => (a.exam || 'airforce') === curExam);
  let tests = await DB.getAll('tests');
  tests.sort((a, b) => b.createdAt - a.createdAt);

  const attByTest = {};
  idx.forEach(a => {
    (attByTest[a.testId] = attByTest[a.testId] || []).push(a);
  });
  // boolean ('completed') index khaali rehta hai — getAll + filter (db.js note)
  const unfinishedByTest = {};
  (await DB.getAll('attempts')).forEach(a => {
    if (a.completed !== true && !a.abandoned) (unfinishedByTest[a.testId] = unfinishedByTest[a.testId] || []).push(a);
  });

  const hasUnfinished = t => (unfinishedByTest[t.id] || []).length > 0;
  // naam-match: series rebuild par test id badal sakta hai, naam nahi —
  // purane attempts orphan na ho ("0/74 hamesha 0" bug ka hissa)
  /* v1.4.46: naam-match exam-scoped — SSC ke "SSC CHSL Mock Test N" vs
     airforce ke "Full Mock Test N" kabhi cross-match nahi */
  const nameDone = new Set(idx.filter(a => !a.abandoned && (a.exam || 'airforce') === curExam).map(a => a.testName));

  // v1.4.66 GADHA-PROOF FILTERS — 3 simple rows (SUBJECT / TEST TYPE / STATUS):
  //   HAR chip wahi count dikhata hai jo uspe TAP karte hi milega — count
  //   baaki dono rows ke selection ka INTERSECTION hota hai (live recount).
  //   0-count chip DISABLED (dima hua, tap nahi hota) → khali result page
  //   aana namumkin. Ek bhi test kabhi do bucket me nahi ginta (TYPE partition:
  //   All = Full + Subject + Chapter + Topic + Custom).
  const TYPE_F = { all: 'All Types', full: 'Full Mocks', subject: 'Subject Tests', chapter: 'Chapter', topic: 'Topic', custom: 'Custom' };
  const STATUS_F = { none: 'Any Status', completed: 'Completed', incomplete: 'In Progress' };
  /* legacy single-dim state.filter → naye dims me migrate */
  if (state.filter) {
    if (state.filter === 'completed' || state.filter === 'incomplete') state.status = state.filter;
    else if (TYPE_F[state.filter]) state.type = state.filter;
    state.filter = undefined;
  }
  if (state.type === undefined || state.type === null) state.type = 'all';
  if (state.status === undefined || state.status === null) state.status = 'none';
  if (!state.subject) state.subject = 'all';
  const mine = tests.filter(t => (t.exam || 'airforce') === curExam);
  const isDone = t => (attByTest[t.id] || []).some(a => !a.abandoned) || nameDone.has(t.name);
  const dimsMatch = (t, d) => {
    if (d.type !== 'all' && t.type !== d.type) return false;
    if (d.subject !== 'all' && !(t.sections || []).some(s => s.subjectId === d.subject)) return false;
    if (d.status === 'completed' && !isDone(t)) return false;
    if (d.status === 'incomplete' && !hasUnfinished(t)) return false;
    return true;
  };
  const cur = { type: state.type, subject: state.subject, status: state.status };
  const cnt = d => mine.filter(t => dimsMatch(t, d)).length;
  const list = mine.filter(t => dimsMatch(t, cur));
  const typeCounts = {}, subjCounts = {}, statusCounts = {};
  for (const k of Object.keys(TYPE_F)) typeCounts[k] = cnt({ ...cur, type: k });
  for (const s of cfg.subjects) subjCounts[s.id] = cnt({ ...cur, subject: s.id });
  for (const k of Object.keys(STATUS_F)) statusCounts[k] = cnt({ ...cur, status: k });
  const chip = (active, count, attrs, label, title) => {
    const disabled = count === 0 && !active;
    const tip = disabled ? 'Is combination me 0 tests — pehle doosri row se hatao'
      : (title || `${count} test${count === 1 ? '' : 's'} dikhenge`);
    return `<button role="tab" class="ftab ${active ? 'active' : ''}" ${attrs} ${disabled ? 'disabled' : ''} title="${AVUtil.esc(tip)}">${label}<span class="fcount">${count}</span></button>`;
  };
  /* active filter summary */
  const activeBits = [];
  if (state.type !== 'all') activeBits.push(TYPE_F[state.type]);
  if (state.subject !== 'all') activeBits.push((cfg.subjects.find(s => s.id === state.subject) || {}).name || state.subject);
  if (state.status !== 'none') activeBits.push(STATUS_F[state.status]);
  const filtersActive = activeBits.length > 0 || !!state.search;
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q));
  }
  if (state.sort === 'series') {
    list.sort((a, b) => (b.series ? 1 : 0) - (a.series ? 1 : 0) ||
      (a.type === 'full' ? 0 : 1) - (b.type === 'full' ? 0 : 1) ||
      ((a.seriesNo || 0) - (b.seriesNo || 0)) || (a.createdAt - b.createdAt));
  }
  if (state.sort === 'best') {
    list.sort((a, b) => {
      const ba = (attByTest[a.id] || []).filter(x => !x.abandoned);
      const bb = (attByTest[b.id] || []).filter(x => !x.abandoned);
      const sa = ba.length ? Math.max(...ba.map(x => x.score / (x.maxScore || 100))) : -1;
      const sb = bb.length ? Math.max(...bb.map(x => x.score / (x.maxScore || 100))) : -1;
      return sb - sa;
    });
  }

  // pagination (12 cards/page — e2e contract)
  const PER = 12;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  state.page = AVUtil.clamp(state.page, 1, pages);
  const slice = list.slice((state.page - 1) * PER, state.page * PER);

  // hero stats
  const doneIdx = idx.filter(a => !a.abandoned);
  const bestPct = doneIdx.length
    ? Math.max(...doneIdx.map(a => Math.round(a.score / (a.maxScore || 100) * 100))) : null;
  const totalQ = cfg.subjects.reduce((a, s) => a + s.questions, 0);
  const startN = list.length ? (state.page - 1) * PER + 1 : 0;
  const endN = (state.page - 1) * PER + slice.length;

  App.page('page page-tests', `
    ${App.resumeBannerHTML()}

    <section class="tlib-hero" aria-label="Test library">
      <div class="th-main">
        <div class="th-kicker">TEST LIBRARY</div>
        <div class="th-title">Pick a test. Hit the bullseye.</div>
        <div class="th-meta">${mine.length} auto-built tests from your ${totalQ.toLocaleString('en-IN')}-question bank · ${doneIdx.length} attempt${doneIdx.length === 1 ? '' : 's'} given</div>
        <div class="th-tools">
          <label class="th-search">
            ${T2IC.search}
            <input type="search" id="test-search" placeholder="Search tests by name…" value="${AVUtil.esc(state.search)}" aria-label="Search tests">
            ${state.search ? `<button class="th-clear" id="test-clear" title="Clear search" aria-label="Clear search">${T2IC.x}</button>` : ''}
          </label>
          <select id="test-sort" aria-label="Sort tests">
            <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Most recent</option>
            <option value="series" ${state.sort === 'series' ? 'selected' : ''}>Series order</option>
            <option value="best" ${state.sort === 'best' ? 'selected' : ''}>Best score</option>
          </select>
          <button class="th-more" id="ts-build-more" title="Add more ready-made tests from unused questions">${T2IC.bolt} More Tests</button>
          <button class="th-new" id="ts-new">+ New Test</button>
        </div>
      </div>
      <div class="th-side">
        <div class="th-stat"><b>${mine.length}</b><span>tests</span></div>
        <div class="th-stat"><b>${mine.filter(isDone).length}</b><span>completed</span></div>
        <div class="th-stat"><b>${bestPct != null ? bestPct + '%' : '—'}</b><span>best score</span></div>
      </div>
    </section>

    <div class="frow"><span class="frow-label">📚 SUBJECT</span>
      <div class="filter-tabs ftabs2" role="tablist" aria-label="Subject filter">
        ${chip(state.subject === 'all', cnt(cur), 'data-s="all"', 'All Subjects', 'Saare subjects ke tests')}
        ${cfg.subjects.map(s => chip(state.subject === s.id, subjCounts[s.id], `data-s="${s.id}"`, `<i class="subject-dot sd-${s.id}"></i>${AVUtil.esc(s.name)}`, `${AVUtil.esc(s.name)} ke saare tests — full mocks bhi shamil`)).join('')}
      </div>
    </div>

    <div class="frow"><span class="frow-label">📝 TEST TYPE</span>
      <div class="filter-tabs ftabs2" role="tablist" aria-label="Test type filter">
        ${Object.entries(TYPE_F).map(([k, v]) => chip(state.type === k, typeCounts[k], `data-t="${k}"`, v)).join('')}
      </div>
    </div>

    <div class="frow"><span class="frow-label">⏱ STATUS</span>
      <div class="filter-tabs ftabs2" role="tablist" aria-label="Status filter">
        ${Object.entries(STATUS_F).map(([k, v]) => chip(state.status === k, statusCounts[k], `data-status="${k}"`, v)).join('')}
      </div>
    </div>

    ${slice.length ? `
    <div class="tlib-count">Showing <b>${startN}–${endN}</b> of <b>${list.length}</b> test${list.length === 1 ? '' : 's'}${activeBits.length ? ` · Filter: <b>${activeBits.map(AVUtil.esc).join(' + ')}</b>` : ''}${state.search ? ` matching “${AVUtil.esc(state.search)}”` : ''}${filtersActive ? ` <button class="flt-reset" id="flt-reset">✕ Clear</button>` : ''}</div>
    <div class="tlib-grid">${slice.map(t => testCard(t)).join('')}</div>` : `
    <div class="tlib-empty">
      ${T2IC.sad}
      ${state.search ? `<h3>No tests match “${AVUtil.esc(state.search)}”</h3><p>Try a shorter word — or clear the search to see all ${mine.length} tests.</p>
        <button class="btn btn-plain" id="ts-clear2">Clear search</button>`
      : filtersActive ? `<h3>Is filter me koi test nahi</h3><p>Filters hatao — saare ${mine.length} tests wapas dikhenge.</p>
        <button class="btn btn-plain" id="flt-reset2">✕ Clear filters</button>`
      : `<h3>No tests here yet</h3><p>Build one yourself — pick subjects, chapters and timing.</p>
        <button class="btn btn-primary" id="ts-new2">Build a custom test</button>`}
    </div>`}

    ${pages > 1 ? `<div class="pager t2-pager" aria-label="Pages">
      <button data-pg="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
      ${pageList(state.page, pages).map(n => n === '…'
        ? '<span class="pg-gap">…</span>'
        : `<button data-pg="${n}" class="${n === state.page ? 'on' : ''}">${n}</button>`).join('')}
      <button data-pg="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>
      <span class="pg-info">${list.length} tests</span>
    </div>` : ''}
  `);

  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out = [1];
    if (cur > 3) out.push('…');
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
    if (cur < total - 2) out.push('…');
    out.push(total);
    return out;
  }

  function testCard(t) {
    const atts = (attByTest[t.id] || []).filter(a => !a.abandoned);
    const doneByName = atts.length === 0 && nameDone.has(t.name);
    const best = atts.length ? atts.reduce((m, a) => a.score > m.score ? a : m, atts[0]) : null;
    const last = atts.length ? atts[atts.length - 1] : null;
    const unfinished = hasUnfinished(t);
    const acc = atts.length ? Math.round((atts.reduce((a, x) => a + x.correct, 0) / Math.max(1, atts.reduce((a, x) => a + x.correct + x.wrong, 0))) * 1000) / 10 : null;
    const T2TYPE = { full: 'Full Mock', subject: 'Subject Test', chapter: 'Chapter Test', topic: 'Topic Test', custom: 'Custom' };
    const typeName = (t.series ? 'SERIES #' + t.seriesNo : (T2TYPE[t.type] || 'Test').toUpperCase());
    const cls = t.series ? 't2-full t2-series' : 't2-' + (t.type || 'custom');
    const secs = (t.sections || []).map(s => ({   /* v1.4.44: legacy test-safe */
      subjectId: s.subjectId, name: cfg.subjects.find(x => x.id === s.subjectId)?.name || s.name, n: (s.questionIds || []).length
    }));
    const shownSecs = secs.length > 3 ? secs.slice(0, 3) : secs;
    const pct = best ? Math.round(best.score / (best.maxScore || 100) * 100) : 0;
    const barCls = pct >= 75 ? 'hi' : pct >= 50 ? 'mid' : 'lo';
    const status = unfinished
      ? '<span class="t2-status live"><i></i>IN PROGRESS</span>'
      : (atts.length || doneByName) ? `<span class="t2-status done">${T2IC.check}DONE</span>`
        : '<span class="t2-status new">NEW</span>';
    return `<div class="test-card t2 ${cls} ${atts.length ? 'attempted' : ''} ${unfinished ? 'inprogress' : ''}" data-id="${t.id}">
      <div class="t2-top">
        <span class="t2-type">${T2IC.target}${typeName}</span>
        ${status}
      </div>
      <h3 class="t2-name">${AVUtil.esc(t.name)}</h3>
      <div class="t2-chips">
        ${shownSecs.map(s => `<span class="t2-chip"><i class="subject-dot sd-${s.subjectId}"></i>${AVUtil.esc(s.name)} ${s.n}</span>`).join('')}
        ${secs.length > 3 ? `<span class="t2-chip t2-more-chip">+${secs.length - 3} more</span>` : ''}
      </div>
      <div class="t2-meta">
        <span>${T2IC.list}${t.totalQuestions} Q</span>
        <span>${T2IC.clock}${Math.round(t.duration / 60)} min</span>
        <span>${T2IC.star}${t.maxScore} marks</span>
        <span title="${t.mode === 'exam' ? 'Exam mode' : 'Practice mode'}">${t.mode === 'exam' ? T2IC.lock + 'Exam' : T2IC.bolt + 'Practice'}${t.sectionLock ? ' · locked' : ''}</span>
      </div>
      <div class="t2-score">
        ${best ? `
        <div class="t2-bar"><i class="${barCls}" style="width:${pct}%"></i></div>
        <div class="t2-best">
          <span><b>${best.score}/${best.maxScore}</b> best · ${pct}%</span>
          <span>${acc != null ? acc + '% acc' : ''}${atts.length > 1 ? ` · last ${last.score}/${last.maxScore}` : ''}</span>
        </div>` : unfinished
          ? '<span class="t2-live"><i></i>Half-done — resume anytime, timer picks up where you left</span>'
          : '<span class="t2-fresh">Never attempted — fresh questions waiting</span>'}
      </div>
      <div class="t2-actions">
        ${unfinished
          ? `<button class="btn t2-cta t2-resume" data-act="resume">RESUME TEST</button>`
          : `<button class="btn t2-cta" data-act="start">${atts.length ? 'REATTEMPT' : 'START TEST'}</button>`}
        ${atts.length ? `<button class="btn t2-ana" data-act="analysis">Analysis</button>` : ''}
      </div>
    </div>`;
  }

  // events
  /* v1.4.66: teeno filter rows ke handlers (live-count chips) */
  AVUtil.$$('#app .ftab[data-t]').forEach(b => b.addEventListener('click', () => { state.type = b.dataset.t; state.page = 1; Views.tests(state); }));
  AVUtil.$$('#app .ftab[data-s]').forEach(b => b.addEventListener('click', () => { state.subject = b.dataset.s; state.page = 1; Views.tests(state); }));
  AVUtil.$$('#app .ftab[data-status]').forEach(b => b.addEventListener('click', () => { state.status = b.dataset.status; state.page = 1; Views.tests(state); }));
  const resetBtn = AVUtil.$('#flt-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => { state.type = 'all'; state.subject = 'all'; state.status = 'none'; state.page = 1; Views.tests(state); });
  const resetBtn2 = AVUtil.$('#flt-reset2');
  if (resetBtn2) resetBtn2.addEventListener('click', () => { state.type = 'all'; state.subject = 'all'; state.status = 'none'; state.search = ''; state.page = 1; Views.tests(state); });
  const searchEl = AVUtil.$('#test-search');
  searchEl.addEventListener('input', AVUtil.debounce(e => { state.search = e.target.value; state.page = 1; state._refocus = true; Views.tests(state); }, 250));
  if (state._refocus) { // keep typing across re-renders
    state._refocus = false;
    searchEl.focus();
    const v = searchEl.value; searchEl.setSelectionRange(v.length, v.length);
  }
  const clearBtn = AVUtil.$('#test-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { state.search = ''; state.page = 1; Views.tests(state); });
  const clearBtn2 = AVUtil.$('#ts-clear2');
  if (clearBtn2) clearBtn2.addEventListener('click', () => { state.search = ''; state.page = 1; Views.tests(state); });
  AVUtil.$('#ts-new').addEventListener('click', () => location.hash = '#/tests/new');
  const newBtn2 = AVUtil.$('#ts-new2');
  if (newBtn2) newBtn2.addEventListener('click', () => location.hash = '#/tests/new');
  AVUtil.$('#test-sort').addEventListener('change', e => { state.sort = e.target.value; Views.tests(state); });
  AVUtil.$('#ts-build-more').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true; AVUtil.toast('Building more tests from unused questions…');
    try {
      const r = await Generator.buildSeries({ fullMocks: 5, perSubject: 2 });
      AVUtil.toast(r.made ? `Added ${r.made} new test${r.made === 1 ? '' : 's'} to your library` : 'No unused questions left — everything is already in your tests', r.made ? 'success' : 'error');
    } catch (err) { AVUtil.toast('Could not build tests: ' + err.message, 'error'); }
    Views.tests(state);
  });
  AVUtil.$$('#app .pager [data-pg]').forEach(b => b.addEventListener('click', () => { state.page = +b.dataset.pg; Views.tests(state); }));
  AVUtil.$$('#app .test-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'analysis') {
        const atts = (attByTest[id] || []).filter(a => !a.abandoned);
        location.hash = '#/attempt/' + atts[atts.length - 1].id + '/analysis';
      } else if (act === 'start' || act === 'resume') {
        location.hash = '#/test/' + id + (act === 'resume' ? '/attempt' : '/instructions');
      } else {
        location.hash = '#/test/' + id;
      }
    });
  });
};

/* ================= TEST OVERVIEW ================= */
Views.testOverview = async function (id) {
  const t = await DB.get('tests', id);
  if (!t) { AVUtil.toast('Test not found', 'error'); return Router.go('/tests'); }
  const cfg = await App.config();
  const idx = (await Store.getMeta('attemptIndex', [])).filter(a => a.testId === id);
  const questions = await DB.getMany('questions', (t.sections || []).flatMap(s => (s && s.questionIds) || []));   /* v1.4.44: legacy-safe */

  App.page('page page-overview', `
    <div class="crumbs"><a href="#/tests">Test Library</a> / ${AVUtil.esc(t.name)}</div>
    <div class="page-head">
      <div>
        <h1>${AVUtil.esc(t.name)}</h1>
        <p class="muted">${t.totalQuestions} questions · ${t.duration ? Math.round(t.duration / 60) : '—'} min · ${t.timerMode === 'section' ? 'section-wise timing' : 'global timer'} · marking ${(t.marking || {}).correct ?? 1}/${(t.marking || {}).wrong ?? '-0.25'}/${(t.marking || {}).unattempted ?? 0}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="ov-start">${idx.length ? 'REATTEMPT' : 'START TEST'}</button>
        ${idx.length ? `<button class="btn btn-plain" id="ov-analysis">VIEW ANALYSIS</button>` : ''}
        <button class="btn btn-plain" id="ov-share" title="Is test ka link banao — dost wahi test de sakega">🔗 Share</button>
        <button class="btn btn-plain" id="ov-delete">Delete Test</button>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <h3>Sections</h3>
        <table class="tbl">
          <thead><tr><th>#</th><th>Subject</th><th>Questions</th><th>Time</th><th>Scope</th></tr></thead>
          <tbody>
          ${t.sections.map((s, i) => `<tr>
            <td>${i + 1}</td>
            <td>${AVUtil.esc(cfg.subjects.find(x => x.id === s.subjectId)?.name || s.name)}</td>
            <td>${(s.questionIds || []).length}</td>
            <td>${s.duration ? Math.round(s.duration / 60) : '—'} min</td>
            <td class="muted small">${s.chapters ? 'Chapters: ' + s.chapters.join(', ') : (s.topics ? 'Topics: ' + s.topics.join(', ') : 'Full syllabus')}</td>
          </tr>`).join('')}
          </tbody></table>
        <h3 style="margin-top:18px">Sample questions in this test</h3>
        <ul class="sample-qs">
          ${questions.slice(0, 3).map((q, i) => `<li><b>Q${i + 1}.</b> ${AVUtil.esc(q.questionText).slice(0, 140)}…</li>`).join('') || '<li class="muted">—</li>'}
        </ul>
      </div>
      <div class="card">
        <h3>Attempt History</h3>
        ${idx.length ? `<table class="tbl"><thead><tr><th>#</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Correct/Wrong/Skip</th><th>Time</th><th></th></tr></thead><tbody>
          ${idx.map(a => `<tr>
            <td>${a.attemptNo}</td><td class="muted">${AVUtil.fmtDate(a.date)}</td>
            <td><b>${a.score}</b>/${a.maxScore}</td><td>${a.accuracy}%</td>
            <td>${a.correct}/${a.wrong}/${a.unattempted}</td><td>${AVUtil.fmtDur(a.timeTaken)}</td>
            <td><a class="link" href="#/attempt/${a.id}/analysis">Analysis</a></td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="muted pad">Not attempted yet.</p>'}
      </div>
    </div>
  `);

  AVUtil.$('#ov-start').addEventListener('click', () => location.hash = '#/test/' + id + '/instructions');
  const ovAna = AVUtil.$('#ov-analysis');
  if (ovAna) ovAna.addEventListener('click', async () => {
    const atts = (await DB.byIndex('attempts', 'testId', id)).filter(a => a.completed && !a.abandoned);
    if (!atts.length) return AVUtil.toast('No completed attempt found.', 'error');
    location.hash = '#/attempt/' + atts[atts.length - 1].id + '/analysis';
  });
  AVUtil.$('#ov-share')?.addEventListener('click', () => { if (window.Share) Share.shareTest(id); });
AVUtil.$('#ov-delete').addEventListener('click', async () => {
    const ok = await AVUtil.confirmModal({
      title: 'Delete this test?',
      body: 'The test and its attempts will be removed. Questions in the bank are not affected.',
      yesLabel: 'Delete', yesClass: 'btn-danger'
    });
    if (!ok) return;
    const atts = await DB.byIndex('attempts', 'testId', id);
    for (const a of atts) await DB.delete('attempts', a.id);
    await DB.delete('tests', id);
    const idx2 = await Store.getMeta('attemptIndex', []);
    await Store.setMeta('attemptIndex', idx2.filter(a => a.testId !== id));
    AVUtil.toast('Test deleted.');
    Router.go('/tests');
  });
};

/* ================= CUSTOM TEST BUILDER ================= */
Views.builder = async function () {
  const cfg = await App.config();
  const bank = await Bank.bankStats(cfg.exam);   /* v1.4.48: exam-scoped */

  App.page('page page-builder', `
    <div class="crumbs"><a href="#/tests">Test Library</a> / New Test</div>
    <div class="page-head"><div><h1>Build a Custom Test</h1>
      <p class="muted">Subject test · chapter test · topic test — or any combination.</p></div></div>

    <div class="card builder-card">
      <div class="b-row">
        <label>Test name</label>
        <input type="text" id="b-name" placeholder="e.g. Physics — Electrostatics Practice" style="max-width:380px">
      </div>
      <div class="b-row">
        <label>Mode</label>
        <div class="seg" id="b-mode">
          <button type="button" class="seg-btn active" data-v="practice">PRACTICE <span class="small">(free navigation · global timer)</span></button>
          <button type="button" class="seg-btn" data-v="exam">EXAM <span class="small">(section-locked · section timers)</span></button>
        </div>
      </div>
      <div class="b-row">
        <label>Question selection</label>
        <select id="b-strategy">
          <option value="balanced-unseen">Balanced difficulty + unseen-first (default)</option>
          <option value="random">Random</option>
          <option value="balanced">Balanced difficulty</option>
          <option value="unseen-first">Unseen questions first</option>
          <option value="weak-topic">Weak-topic weighted</option>
          <option value="wrong-weighted">Previously-incorrect weighted</option>
        </select>
      </div>

      <h3 class="b-head">Sections</h3>
      <div id="b-sections">
        ${cfg.subjects.map(s => `
        <div class="b-section" data-sid="${s.id}">
          <label class="b-sec-check"><input type="checkbox" class="b-use"> <b>${AVUtil.esc(s.name)}</b>
            <span class="muted small">(${(bank[s.id] || {}).usable || 0} usable in bank)</span></label>
          <div class="b-sec-controls">
            <span>Questions</span> <input type="number" class="b-count" min="1" max="200" value="${Math.min(s.questions, (bank[s.id] || {}).usable || s.questions)}">
            <span>Minutes</span> <input type="number" class="b-min" min="1" max="180" value="${Math.round(s.duration / 60)}">
            <select class="b-diff">
              <option value="all">Any difficulty</option><option value="easy">Easy</option>
              <option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
            <select class="b-chapter"><option value="">All chapters</option>
              ${Object.entries((bank[s.id] || {}).chapters || {}).map(([c, n]) => `<option value="${AVUtil.esc(c)}">${AVUtil.esc(c)} (${n})</option>`).join('')}
            </select>
            <select class="b-topic"><option value="">All topics</option>
              ${Object.entries((bank[s.id] || {}).topics || {}).map(([c, n]) => `<option value="${AVUtil.esc(c)}">${AVUtil.esc(c)} (${n})</option>`).join('')}
            </select>
          </div>
        </div>`).join('')}
      </div>

      <div class="b-row">
        <label>Options</label>
        <div class="b-opts">
          <label><input type="checkbox" id="b-shuffle-q"> Shuffle questions</label>
          <label><input type="checkbox" id="b-instant"> Instant explanations (practice only)</label>
          <label class="muted small" title="Pausing is now available in every test — exam or practice">⏸ Pause available in every test</label>
        </div>
      </div>
      <div class="b-actions">
        <button class="btn btn-primary btn-lg" id="b-generate">GENERATE TEST →</button>
      </div>
      <div id="b-error" class="gen-error" hidden></div>
    </div>
  `);

  AVUtil.$$('#b-mode .seg-btn').forEach(b => b.addEventListener('click', () => {
    AVUtil.$$('#b-mode .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));

  AVUtil.$('#b-generate').addEventListener('click', async () => {
    const mode = AVUtil.$('#b-mode .seg-btn.active').dataset.v;
    const sections = [];
    AVUtil.$$('#b-sections .b-section').forEach(sec => {
      if (!AVUtil.$('.b-use', sec).checked) return;
      const sid = sec.dataset.sid;
      const chapters = AVUtil.$('.b-chapter', sec).value;
      const topics = AVUtil.$('.b-topic', sec).value;
      sections.push({
        subjectId: sid,
        count: +AVUtil.$('.b-count', sec).value || 10,
        duration: (+AVUtil.$('.b-min', sec).value || 20) * 60,
        difficulty: AVUtil.$('.b-diff', sec).value,
        chapters: chapters ? [chapters] : null,
        topics: topics ? [topics] : null
      });
    });
    const err = AVUtil.$('#b-error');
    if (!sections.length) { err.hidden = false; err.textContent = 'Select at least one subject.'; return; }
    const name = AVUtil.$('#b-name').value.trim() ||
      sections.map(s => (cfg.subjects.find(x => x.id === s.subjectId)?.name)).join(' + ') + ' Test';
    const btn = AVUtil.$('#b-generate');
    btn.disabled = true; btn.textContent = 'Generating…';
    const type = sections.length === 1 && sections[0].chapters ? 'chapter'
      : sections.length === 1 && sections[0].topics ? 'topic'
      : sections.length === 1 ? 'subject' : 'custom';
    const r = await Generator.generate({
      name, type, mode,
      sections,
      strategy: AVUtil.$('#b-strategy').value,
      shuffleQuestions: AVUtil.$('#b-shuffle-q').checked,
      instantExplanation: AVUtil.$('#b-instant').checked,
      allowPause: true // pause HAR test me available hai
    });
    if (!r.ok) {
      btn.disabled = false; btn.textContent = 'GENERATE TEST →';
      err.hidden = false;
      err.innerHTML = `<b>${AVUtil.esc(r.error)}</b><br>` +
        r.availability.map(a => {
          const sub = cfg.subjects.find(x => x.id === a.subjectId);
          return `${sub ? sub.name : a.subjectId}: <b>${a.available}</b> available — <b>${a.needed}</b> needed` +
            (a.chapters ? ` (scope: ${a.chapters.join(', ')})` : '');
        }).join('<br>');
      return;
    }
    location.hash = '#/test/' + r.test.id + '/instructions';
  });
};
