/* ============================================================
 * VIEW: TEST LIBRARY + TEST OVERVIEW + CUSTOM TEST BUILDER
 * ============================================================ */

Views.tests = async function (state) {
  state = state || { filter: 'all', search: '', sort: 'recent', page: 1 };
  const cfg = await App.config();
  const idx = await Store.getMeta('attemptIndex', []);
  let tests = await DB.getAll('tests');
  tests.sort((a, b) => b.createdAt - a.createdAt);

  const attByTest = {};
  idx.forEach(a => {
    (attByTest[a.testId] = attByTest[a.testId] || []).push(a);
  });
  const unfinishedByTest = {};
  {
    let unf = null;
    await DB.cursor('attempts', 'completed', false, a => {
      (unfinishedByTest[a.testId] = unfinishedByTest[a.testId] || []).push(a);
    });
  }

  const hasUnfinished = t => (unfinishedByTest[t.id] || []).length > 0;

  // filters
  const FNAMES = { all: 'All', series: 'Test Series', full: 'Full Mock', subject: 'Subject', chapter: 'Chapter', topic: 'Topic', custom: 'Custom', completed: 'Completed', incomplete: 'Incomplete' };
  let list = tests.filter(t => {
    if (state.filter === 'all' || FNAMES[state.filter] === undefined) return true;
    if (state.filter === 'completed') return (attByTest[t.id] || []).some(a => !a.abandoned);
    if (state.filter === 'incomplete') return hasUnfinished(t);
    if (state.filter === 'series') return !!t.series;
    return t.type === state.filter;
  });
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

  // pagination (lazy — 12 cards/page)
  const PER = 12;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  state.page = AVUtil.clamp(state.page, 1, pages);
  const slice = list.slice((state.page - 1) * PER, state.page * PER);

  App.page('page page-tests', `
    <div class="page-head">
      <div>
        <h1>Test Library</h1>
        <p class="muted">${tests.length} generated test${tests.length === 1 ? '' : 's'} · showing ${slice.length} of ${list.length}</p>
      </div>
      <div class="head-actions">
        <input type="search" id="test-search" placeholder="Search tests by name…" value="${AVUtil.esc(state.search)}" aria-label="Search tests">
        <select id="test-sort" aria-label="Sort tests">
          <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Most recent</option>
          <option value="series" ${state.sort === 'series' ? 'selected' : ''}>Series order</option>
          <option value="best" ${state.sort === 'best' ? 'selected' : ''}>Best score</option>
        </select>
        <button class="btn btn-plain" id="ts-build-more" title="Add more ready-made tests from unused questions">⚡ More Tests</button>
        <button class="btn btn-primary" onclick="location.hash='#/tests/new'">+ New Test</button>
      </div>
    </div>
    <div class="filter-tabs" role="tablist">
      ${Object.entries(FNAMES).map(([k, v]) => `<button role="tab" class="ftab ${state.filter === k ? 'active' : ''}" data-f="${k}">${v}</button>`).join('')}
    </div>
    ${slice.length ? `<div class="test-grid">${slice.map(t => testCard(t)).join('')}</div>` :
      '<div class="empty-state"><p>No tests here yet.</p><button class="btn btn-primary" onclick="location.hash=\'#/tests/new\'">Create a test</button></div>'}
    ${pages > 1 ? `<div class="pager">
      <button class="btn btn-plain" data-pg="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${state.page} of ${pages}</span>
      <button class="btn btn-plain" data-pg="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Next →</button>
    </div>` : ''}
  `);

  function testCard(t) {
    const atts = (attByTest[t.id] || []).filter(a => !a.abandoned);
    const best = atts.length ? atts.reduce((m, a) => a.score > m.score ? a : m, atts[0]) : null;
    const last = atts.length ? atts[atts.length - 1] : null;
    const unfinished = hasUnfinished(t);
    const acc = atts.length ? Math.round((atts.reduce((a, x) => a + x.correct, 0) / Math.max(1, atts.reduce((a, x) => a + x.correct + x.wrong, 0))) * 1000) / 10 : null;
    const typeName = { full: 'FULL TEST', subject: 'SUBJECT TEST', chapter: 'CHAPTER TEST', topic: 'TOPIC TEST', custom: 'CUSTOM' }[t.type] || t.type.toUpperCase();
    return `<div class="test-card ${atts.length ? 'attempted' : ''}" data-id="${t.id}">
      <div class="tc-top">
        <span class="tc-type">${typeName}${t.series ? ` <span class="tc-series">#${t.seriesNo}</span>` : ''}</span>
        <span class="tc-mode">${t.mode === 'exam' ? 'Exam Mode' : 'Practice'}</span>
      </div>
      <h3 class="tc-name">${AVUtil.esc(t.name)}</h3>
      <div class="tc-meta">
        <span>${t.sections.map(s => (cfg.subjects.find(x => x.id === s.subjectId)?.name || s.name) + ' ' + s.questionIds.length).join(' · ')}</span>
        <span>${t.totalQuestions} Q · ${Math.round(t.duration / 60)} min · Max ${t.maxScore} marks</span>
        <span>${t.timerMode === 'section' ? 'Section-timed' : 'Global timer'}${t.sectionLock ? ' · Section locked' : ''}</span>
      </div>
      <div class="tc-scores">
        <div><span class="lbl">Status</span><b>${unfinished ? 'In Progress' : (atts.length ? 'Attempted' : 'Not Attempted')}</b></div>
        <div><span class="lbl">Best</span><b>${best ? best.score + '/' + best.maxScore : '—'}</b></div>
        <div><span class="lbl">Last</span><b>${last ? last.score + '/' + last.maxScore : '—'}</b></div>
        <div><span class="lbl">Accuracy</span><b>${acc != null ? acc + '%' : '—'}</b></div>
        <div><span class="lbl">Last time</span><b>${last ? AVUtil.fmtDur(last.timeTaken) : '—'}</b></div>
      </div>
      <div class="tc-actions">
        ${unfinished
          ? `<button class="btn btn-primary" data-act="resume">RESUME</button>`
          : `<button class="btn btn-primary" data-act="start">${atts.length ? 'REATTEMPT' : 'START TEST'}</button>`}
        ${atts.length ? `<button class="btn btn-plain" data-act="analysis">VIEW ANALYSIS</button>` : ''}
      </div>
    </div>`;
  }

  // events
  AVUtil.$$('#app .ftab').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.f; state.page = 1; Views.tests(state); }));
  AVUtil.$('#test-search').addEventListener('input', AVUtil.debounce(e => { state.search = e.target.value; state.page = 1; Views.tests(state); }, 250));
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
  const questions = await DB.getMany('questions', t.sections.flatMap(s => s.questionIds));

  App.page('page page-overview', `
    <div class="crumbs"><a href="#/tests">Test Library</a> / ${AVUtil.esc(t.name)}</div>
    <div class="page-head">
      <div>
        <h1>${AVUtil.esc(t.name)}</h1>
        <p class="muted">${t.totalQuestions} questions · ${Math.round(t.duration / 60)} min · ${t.timerMode === 'section' ? 'section-wise timing' : 'global timer'} · marking ${t.marking.correct}/${t.marking.wrong}/${t.marking.unattempted}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" id="ov-start">${idx.length ? 'REATTEMPT' : 'START TEST'}</button>
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
            <td>${s.questionIds.length}</td>
            <td>${Math.round(s.duration / 60)} min</td>
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
  const bank = await Bank.bankStats();

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
          <label><input type="checkbox" id="b-pause"> Allow pause (practice only)</label>
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
      allowPause: AVUtil.$('#b-pause').checked
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
