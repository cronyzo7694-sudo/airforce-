/* ============================================================
 * VIEWS: RESULT + DETAILED ANALYSIS
 * ============================================================ */

Views.result = async function (attemptId) {
  const a = await DB.get('attempts', attemptId);
  if (!a || !a.completed || !a.result) {
    AVUtil.toast('Result not available for this attempt.', 'error');
    return Router.go('/dashboard');
  }
  const test = await DB.get('tests', a.testId);
  const res = a.result;
  const cfg = await App.config();
  const pct = res.maxScore ? Math.round((res.score / res.maxScore) * 1000) / 10 : 0;

  const subjectRows = (test ? test.sections : []).map(s => {
    const st = res.subjects[s.subjectId] || {};
    const time = st.timeSpent || 0;
    return `<tr>
      <td><b>${AVUtil.esc(s.name)}</b></td>
      <td>${st.correct ?? 0}</td>
      <td>${st.wrong ?? 0}</td>
      <td>${st.unattempted ?? 0}</td>
      <td><b>${Math.round((st.score ?? 0) * 100) / 100}</b></td>
      <td>${st.accuracy ?? 0}%</td>
      <td>${AVUtil.fmtDur(time)}</td>
    </tr>`;
  }).join('');

  App.page('page page-result', `
    <div class="result-hero">
      <div class="rh-left">
        <div class="rh-check" aria-hidden="true">✓</div>
        <div>
          <h1>TEST COMPLETED</h1>
          <p class="muted">${AVUtil.esc(a.testName)} · Attempt #${a.attemptNo} · ${AVUtil.fmtDate(a.endTime)}</p>
        </div>
      </div>
      <div class="rh-score">
        <div class="rh-nums"><b>${res.score}</b><span>/ ${res.maxScore}</span></div>
        <div class="rh-pct">${pct}%</div>
      </div>
    </div>

    <section class="stat-row">
      ${rstat('Correct', res.correct, 'good')}
      ${rstat('Wrong', res.wrong, 'bad')}
      ${rstat('Unattempted', res.unattempted)}
      ${rstat('Accuracy', res.accuracy + '%')}
      ${rstat('Attempt Rate', res.attemptRate + '%')}
      ${rstat('Negative Marks', '−' + res.negative, 'bad')}
      ${rstat('Time Taken', AVUtil.fmtDur(res.timeTaken))}
      ${rstat('Marking', `+${res.marking?.correct ?? 1} / ${res.marking?.wrong ?? -0.25} / 0`)}
    </section>

    <section class="card">
      <h3>Subject Performance</h3>
      <table class="tbl">
        <thead><tr><th>Subject</th><th>Correct</th><th>Wrong</th><th>Unattempted</th><th>Score</th><th>Accuracy</th><th>Time Spent</th></tr></thead>
        <tbody>${subjectRows || '<tr><td colspan="7" class="muted">—</td></tr>'}</tbody>
      </table>
    </section>

    <section class="result-actions">
      <a class="btn btn-primary" href="#/attempt/${a.id}/analysis">VIEW DETAILED ANALYSIS</a>
      <a class="btn btn-plain" href="#/test/${a.testId}/instructions">REATTEMPT</a>
      <a class="btn btn-plain" href="#/dashboard">BACK TO DASHBOARD</a>
    </section>
  `);

  function rstat(l, v, cls) {
    return `<div class="stat-card ${cls || ''}"><div class="stat-val">${AVUtil.esc(String(v))}</div><div class="stat-lbl">${l}</div></div>`;
  }
};

/* ================= DETAILED ANALYSIS ================= */
Views.analysis = async function (attemptId, state) {
  state = state || { tab: 'overview', qFilter: 'all', qPage: 1 };
  const a = await DB.get('attempts', attemptId);
  if (!a || !a.completed || !a.result) {
    AVUtil.toast('Analysis not available.', 'error');
    return Router.go('/dashboard');
  }
  const test = await DB.get('tests', a.testId);
  const res = a.result;
  const cfg = await App.config();
  const th = cfg.thresholds || { strong: 80, average: 60 };

  // questions of this attempt in order with global numbering
  const ids = Engine.allQuestionIds(a);
  const qrows = await DB.getMany('questions', ids);
  const noteRows = await DB.getMany('notes', ids).catch(() => []);
  const noteMap = {};
  (noteRows || []).forEach(n => { if (n && n.qid) noteMap[n.qid] = n.text || ''; });
  const qmap = {};
  qrows.forEach(q => { if (q) qmap[q.id] = q; });

  let gn = 0;
  const flat = [];
  a.sectionOrder.forEach(sid => {
    const sec = a.sections[sid];
    const sname = test?.sections.find(s => s.subjectId === sid)?.name || sid;
    sec.questionIds.forEach((qid, i) => {
      gn++;
      const pq = res.perQuestion[qid] || { sel: null, key: null, result: 'skip', state: 'NOT_VISITED', timeSpent: 0 };
      flat.push({ gn, sid, sname, qid, q: qmap[qid], pq });
    });
  });

  // ---- topic analysis ----
  const topicAgg = {};
  flat.forEach(f => {
    if (!f.q) return;
    const key = f.q.subject + '␟' + f.q.chapter + '␟' + f.q.topic;
    const t = topicAgg[key] || (topicAgg[key] = { subject: f.q.subject, chapter: f.q.chapter, topic: f.q.topic, correct: 0, wrong: 0, skip: 0, time: 0 });
    if (f.pq.result === 'correct') t.correct++;
    else if (f.pq.result === 'wrong') t.wrong++;
    else t.skip++;
    t.time += f.pq.timeSpent || 0;
  });
  const topicRows = Object.values(topicAgg).map(t => ({
    ...t, attempted: t.correct + t.wrong,
    acc: (t.correct + t.wrong) ? Math.round((t.correct / (t.correct + t.wrong)) * 1000) / 10 : 0
  })).sort((x, y) => x.acc - y.acc);

  // ---- time analysis ----
  const timed = flat.filter(f => (f.pq.timeSpent || 0) > 0).sort((x, y) => (y.pq.timeSpent || 0) - (x.pq.timeSpent || 0));
  const slowest = timed.slice(0, 8);
  const fastest = timed.slice(-8).reverse();
  const over60 = flat.filter(f => (f.pq.timeSpent || 0) > 60);
  const over120 = flat.filter(f => (f.pq.timeSpent || 0) > 120);

  // ---- difficulty analysis ----
  const diffAgg = {};
  flat.forEach(f => {
    if (!f.q) return;
    const d = f.q.difficulty || 'medium';
    const t = diffAgg[d] || (diffAgg[d] = { correct: 0, wrong: 0, skip: 0 });
    if (f.pq.result === 'correct') t.correct++; else if (f.pq.result === 'wrong') t.wrong++; else t.skip++;
  });

  // ---- question list pagination ----
  const qFiltered = state.qFilter === 'all' ? flat : flat.filter(f =>
    state.qFilter === 'correct' ? f.pq.result === 'correct' :
    state.qFilter === 'wrong' ? f.pq.result === 'wrong' :
    state.qFilter === 'skip' ? f.pq.result === 'skip' :
    state.qFilter === 'marked' ? (f.pq.state === 'MARKED_FOR_REVIEW' || f.pq.state === 'ANSWERED_AND_MARKED_FOR_REVIEW') :
    state.qFilter === 'slow' ? (f.pq.timeSpent || 0) > 60 : true);
  const PER = 15;
  const qPages = Math.max(1, Math.ceil(qFiltered.length / PER));
  state.qPage = AVUtil.clamp(state.qPage, 1, qPages);
  const qSlice = qFiltered.slice((state.qPage - 1) * PER, state.qPage * PER);

  const donutParts = [
    { label: 'Correct', value: res.correct, color: '#2e9e5b' },
    { label: 'Wrong', value: res.wrong, color: '#d9534f' },
    { label: 'Skipped', value: res.unattempted, color: '#a8b3c2' }
  ];
  const subjColors = { physics: '#3b6fb6', mathematics: '#7a4fb3', english: '#2e8b57', raga: '#c77b2e' };
  const subjBars = (test?.sections || []).map(s => {
    const st = res.subjects[s.subjectId] || {};
    return { label: s.name, value: st.accuracy || 0, max: 100, color: subjColors[s.subjectId] || '#3b6fb6', valueLabel: (st.accuracy || 0) + '%' };
  });

  const TABS = [
    ['overview', 'Overview'], ['questions', 'Question Analysis'],
    ['topics', 'Topic &amp; Difficulty'], ['time', 'Time Analysis']
  ];

  App.page('page page-analysis', `
    <div class="page-head">
      <div>
        <h1>Detailed Analysis</h1>
        <p class="muted">${AVUtil.esc(a.testName)} · Attempt #${a.attemptNo} · Score ${res.score}/${res.maxScore} · Accuracy ${res.accuracy}%</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-plain" href="#/attempt/${a.id}/result">Result</a>
        <a class="btn btn-primary" href="#/test/${a.testId}/instructions">Reattempt</a>
      </div>
    </div>
    <div class="filter-tabs">
      ${TABS.map(([k, v]) => `<button class="ftab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${v}</button>`).join('')}
    </div>
    <div id="an-body"></div>
  `);

  const body = AVUtil.$('#an-body');

  if (state.tab === 'overview') {
    body.innerHTML = `
      <section class="stat-row">
        ${ast('Attempted', res.attempted)} ${ast('Correct', res.correct, 'good')} ${ast('Wrong', res.wrong, 'bad')}
        ${ast('Unattempted', res.unattempted)} ${ast('Accuracy', res.accuracy + '%')}
        ${ast('Attempt Rate', res.attemptRate + '%')} ${ast('Score', res.score + '/' + res.maxScore)}
        ${ast('Time', AVUtil.fmtDur(res.timeTaken))}
      </section>
      <section class="charts-grid">
        <div class="card chart-card"><h3>Subject Accuracy</h3>${Charts.barChart(subjBars)}</div>
        <div class="card chart-card chart-donut"><h3>Answer Distribution</h3>
          ${Charts.donut(donutParts, { center: res.accuracy + '%', centerSub: 'accuracy' })}
          ${Charts.legend(donutParts)}</div>
      </section>
      <section class="card">
        <h3>Section Summary</h3>
        <table class="tbl"><thead><tr><th>Subject</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Score</th><th>Accuracy</th><th>Avg time/Q</th></tr></thead>
        <tbody>${(test?.sections || []).map(s => {
          const st = res.subjects[s.subjectId] || {};
          const att = (st.correct || 0) + (st.wrong || 0);
          return `<tr><td><b>${AVUtil.esc(s.name)}</b></td><td>${att}</td><td>${st.correct || 0}</td><td>${st.wrong || 0}</td><td>${st.unattempted || 0}</td>
          <td><b>${Math.round((st.score || 0) * 100) / 100}</b></td><td>${st.accuracy || 0}%</td>
          <td>${st.total ? AVUtil.fmtDur((st.timeSpent || 0) / st.total) : '—'}</td></tr>`;
        }).join('')}</tbody></table>
      </section>`;
  } else if (state.tab === 'questions') {
    const chipDef = [['all', `All (${flat.length})`], ['wrong', `Wrong (${res.wrong})`], ['correct', `Correct (${res.correct})`], ['skip', `Skipped (${res.unattempted})`], ['marked', 'Marked'], ['slow', '> 60s']];
    body.innerHTML = `
      <div class="qa-toolbar">
        <div class="filter-tabs small qa-chips">
          ${chipDef.map(([k, v]) => `<button class="ftab ${state.qFilter === k ? 'active' : ''}" data-qf="${k}">${v}</button>`).join('')}
        </div>
        <div class="qa-bulk">
          <button class="btn btn-mini" id="qa-expand-all">Expand all</button>
          <button class="btn btn-mini" id="qa-collapse-all">Collapse all</button>
        </div>
      </div>
      ${qSlice.length ? qSlice.map((f, fi) => {
        const q = f.q || { questionText: '(question missing)', options: [], chapter: '?', topic: '?', difficulty: '?' };
        const rcls = f.pq.result === 'correct' ? 'good' : (f.pq.result === 'wrong' ? 'bad' : '');
        const rlbl = f.pq.result === 'correct' ? 'CORRECT' : (f.pq.result === 'wrong' ? 'WRONG' : 'UNATTEMPTED');
        const marked = f.pq.state === 'MARKED_FOR_REVIEW' || f.pq.state === 'ANSWERED_AND_MARKED_FOR_REVIEW';
        const yourAns = f.pq.sel ? (q.options.find(o => o.id === f.pq.sel)?.text || f.pq.sel) : '<i>Not answered</i>';
        const keyAns = f.pq.key ? (q.options.find(o => o.id === f.pq.key)?.text || f.pq.key) : '<i>not available</i>';
        const isOpen = (f.pq.result === 'wrong' && qSlice.findIndex(x => x.pq.result === 'wrong') === fi) ||
          (f.pq.result === 'skip' && !qSlice.some(x => x.pq.result === 'wrong') && qSlice.findIndex(x => x.pq.result === 'skip') === fi) ||
          (f.pq.result === 'correct' && !qSlice.some(x => x.pq.result !== 'correct') && fi === 0);
        return `<div class="qa-card ${rcls}${isOpen ? ' open' : ''}" data-gn="${f.gn}">
          <button class="qa-toggle" aria-expanded="${isOpen ? 'true' : 'false'}">
            <span class="qa-no">Q${f.gn}</span>
            ${marked ? '<span class="badge mk">Marked</span>' : ''}
            <span class="badge ${rcls}">${rlbl}</span>
            <span class="qa-meta">${AVUtil.esc(f.sname)} · ${AVUtil.esc(q.chapter)} › ${AVUtil.esc(q.topic)}</span>
            <span class="qa-time">${AVUtil.fmtDur(f.pq.timeSpent || 0)}</span>
            <span class="qa-chev" aria-hidden="true">▾</span>
            <span class="qa-snip">${AVUtil.qtext(q.questionText)}</span>
          </button>
          <div class="qa-body">
          <div class="qa-text">${AVUtil.qtext(q.questionText)}</div>
          ${q.questionTextHi ? `<div class="qa-text qa-hi">🅷 ${AVUtil.qtext(q.questionTextHi)}</div>` : ''}
          ${q.image ? `<img class="qa-img" src="${AVUtil.esc(q.image)}" alt="figure" loading="lazy">` : ''}
          <div class="qa-answers">
            <div class="qa-ans ${f.pq.result === 'correct' ? 'ok' : ''}"><b>Your Answer (${f.pq.sel || '—'}):</b> ${yourAns}</div>
            ${f.pq.result !== 'correct' ? `<div class="qa-ans ok"><b>Correct Answer (${f.pq.key || '—'}):</b> ${keyAns}</div>` : ''}
          </div>
          ${q.explanation ? `<div class="qa-exp"><b>Explanation:</b> ${AVUtil.qtext(q.explanation)}</div>` : ''}
          ${q.explanationHi ? `<div class="qa-exp qa-hi"><b>व्याख्या:</b> ${AVUtil.qtext(q.explanationHi)}</div>` : ''}
          ${!q.explanation && q.source ? `<div class="qa-exp muted"><b>Source:</b> ${AVUtil.esc(q.source)}</div>` : ''}
          <div class="qa-note" data-qid="${f.qid}">
            <div class="qa-note-head">📝 My Notebook</div>
            <textarea class="note-ta" rows="1" placeholder="Apna solution / trick yahan likho…">${AVUtil.esc(noteMap[f.qid] || '')}</textarea>
            <div class="qa-note-actions"><button class="btn btn-plain btn-sm" data-note-save="${f.qid}">💾 Save</button> <span class="note-saved muted small"></span></div>
          </div>
          </div>
        </div>`;
      }).join('') : '<div class="empty-state"><p>No questions in this filter.</p></div>'}
      ${qPages > 1 ? `<div class="pager">
        <button class="btn btn-plain" data-qp="${state.qPage - 1}" ${state.qPage <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${state.qPage} of ${qPages}</span>
        <button class="btn btn-plain" data-qp="${state.qPage + 1}" ${state.qPage >= qPages ? 'disabled' : ''}>Next →</button>
      </div>` : ''}`;
  } else if (state.tab === 'topics') {
    body.innerHTML = `
      <section class="card">
        <h3>Topic-wise Performance <span class="muted small">(weakest first · thresholds: strong ≥ ${th.strong}%, needs practice &lt; ${th.average}%)</span></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Subject</th><th>Chapter</th><th>Topic</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Accuracy</th><th>Verdict</th></tr></thead>
        <tbody>${topicRows.map(t => `<tr>
          <td>${AVUtil.esc((cfg.subjects.find(s => s.id === t.subject)?.name) || t.subject)}</td>
          <td>${AVUtil.esc(t.chapter)}</td><td>${AVUtil.esc(t.topic)}</td>
          <td>${t.attempted}</td><td>${t.correct}</td><td>${t.wrong}</td><td>${t.skip}</td>
          <td><b>${t.acc}%</b></td>
          <td><span class="badge ${t.acc >= th.strong ? 'good' : (t.acc >= th.average ? '' : 'bad')}">${t.acc >= th.strong ? 'Strong' : (t.acc >= th.average ? 'Average' : 'Needs Practice')}</span></td>
        </tr>`).join('')}</tbody></table></div>
      </section>
      <section class="card">
        <h3>Difficulty-wise Accuracy</h3>
        <table class="tbl"><thead><tr><th>Difficulty</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Accuracy</th></tr></thead>
        <tbody>${Object.entries(diffAgg).sort().map(([d, t]) => `<tr>
          <td><b>${AVUtil.esc(d)}</b></td><td>${t.correct}</td><td>${t.wrong}</td><td>${t.skip}</td>
          <td>${(t.correct + t.wrong) ? Math.round(t.correct / (t.correct + t.wrong) * 100) : 0}%</td></tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}</tbody></table>
      </section>`;
  } else if (state.tab === 'time') {
    body.innerHTML = `
      <section class="stat-row">
        ${ast('Total Time', AVUtil.fmtDur(res.timeTaken))}
        ${ast('Avg / Question', res.total ? AVUtil.fmtDur(res.timeTaken / res.total) : '—')}
        ${ast('Avg / Correct', res.correct ? AVUtil.fmtDur(flat.filter(f => f.pq.result === 'correct').reduce((x, f) => x + (f.pq.timeSpent || 0), 0) / res.correct) : '—')}
        ${ast('> 60s', over60.length + ' Qs', over60.length > flat.length * 0.3 ? 'bad' : '')}
        ${ast('> 120s', over120.length + ' Qs', over120.length > 5 ? 'bad' : '')}
      </section>
      <section class="two-col">
        <div class="card"><h3>Slowest Questions</h3>${timeTable(slowest)}</div>
        <div class="card"><h3>Fastest Questions</h3>${timeTable(fastest)}</div>
      </section>
      <section class="card">
        <h3>Questions taking more than 60 seconds <span class="muted small">(${over60.length})</span></h3>
        ${over60.length ? timeTable(over60.slice(0, 25)) : '<p class="muted pad">None — good pace.</p>'}
        <h3 style="margin-top:16px">Questions taking more than 120 seconds <span class="muted small">(${over120.length})</span></h3>
        ${over120.length ? timeTable(over120.slice(0, 25)) : '<p class="muted pad">None.</p>'}
      </section>`;

    function timeTable(rows) {
      if (!rows.length) return '<p class="muted pad">—</p>';
      return `<table class="tbl"><thead><tr><th>Q#</th><th>Subject</th><th>Topic</th><th>Result</th><th>Time</th></tr></thead><tbody>
        ${rows.map(f => `<tr>
          <td><b>${f.gn}</b></td><td>${AVUtil.esc(f.sname)}</td>
          <td>${AVUtil.esc(f.q?.topic || '—')}</td>
          <td><span class="badge ${f.pq.result === 'correct' ? 'good' : (f.pq.result === 'wrong' ? 'bad' : '')}">${f.pq.result}</span></td>
          <td><b>${AVUtil.fmtDur(f.pq.timeSpent || 0)}</b></td></tr>`).join('')}
      </tbody></table>`;
    }
  }

  function ast(l, v, cls) {
    return `<div class="stat-card ${cls || ''}"><div class="stat-val">${AVUtil.esc(String(v))}</div><div class="stat-lbl">${l}</div></div>`;
  }

  // events
  AVUtil.$$('#an-body [data-qf]').forEach(b => b.addEventListener('click', () => { state.qFilter = b.dataset.qf; state.qPage = 1; Views.analysis(attemptId, state); }));
  // question-card accordion
  AVUtil.$$('#an-body .qa-toggle').forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.qa-card');
    card.classList.toggle('open');
    b.setAttribute('aria-expanded', card.classList.contains('open') ? 'true' : 'false');
  }));
  AVUtil.$('#qa-expand-all')?.addEventListener('click', () => {
    AVUtil.$$('#an-body .qa-card').forEach(c => c.classList.add('open'));
    AVUtil.$$('#an-body .qa-toggle').forEach(b => b.setAttribute('aria-expanded', 'true'));
  });
  AVUtil.$('#qa-collapse-all')?.addEventListener('click', () => {
    AVUtil.$$('#an-body .qa-card').forEach(c => c.classList.remove('open'));
    AVUtil.$$('#an-body .qa-toggle').forEach(b => b.setAttribute('aria-expanded', 'false'));
  });
  AVUtil.$('#an-body [data-qp]') && AVUtil.$$('#an-body [data-qp]').forEach(b => b.addEventListener('click', () => { state.qPage = +b.dataset.qp; Views.analysis(attemptId, state); }));
  AVUtil.$$('#app .filter-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; Views.analysis(attemptId, state); }));

  // notebook: save per-question custom notes (Ctrl+Enter or button)
  AVUtil.$$('#an-body [data-note-save]').forEach(btn => btn.addEventListener('click', async () => {
    const qid = btn.dataset.noteSave;
    const wrap = btn.closest('.qa-note');
    const text = wrap.querySelector('.note-ta').value.trim();
    await DB.put('notes', { qid, text, updatedAt: Date.now() });
    wrap.querySelector('.note-saved').textContent = text ? 'Saved ✓ ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Note cleared ✓';
    AVUtil.toast(text ? 'Note saved to your notebook' : 'Note cleared', 'success');
  }));
  AVUtil.$$('#an-body .note-ta').forEach(ta => {
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ta.closest('.qa-note').querySelector('[data-note-save]').click();
    });
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', grow);
    grow();
  });
};
