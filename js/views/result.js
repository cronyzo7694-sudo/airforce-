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

  const R = 34, C = 2 * Math.PI * R;
  const ringDash = Math.max(0, Math.min(1, pct / 100)) * C;
  const ringColor = pct >= 75 ? '#4cbf76' : pct >= 50 ? '#f0b429' : '#e87b78';
  const subjectRows = (test ? test.sections : []).map(s => {
    const st = res.subjects[s.subjectId] || {};
    const time = st.timeSpent || 0;
    const sAcc = st.accuracy ?? 0;
    const sBarCls = sAcc >= 75 ? 'hi' : sAcc >= 50 ? 'mid' : 'lo';
    return `<tr>
      <td><b>${AVUtil.esc(s.name)}</b></td>
      <td class="good">${st.correct ?? 0}</td>
      <td class="bad-txt">${st.wrong ?? 0}</td>
      <td class="rs-col-u muted">${st.unattempted ?? 0}</td>
      <td><b>${Math.round((st.score ?? 0) * 100) / 100}</b></td>
      <td><div class="rs-acc"><div class="t2-bar"><i class="${sBarCls}" style="width:${sAcc}%"></i></div><span>${sAcc}%</span></div></td>
      <td class="rs-col-t muted">${AVUtil.fmtDur(time)}</td>
    </tr>`;
  }).join('');

  App.page('page page-result', `
    <div class="result-hero">
      <div class="rh-left">
        <div class="rh-check" aria-hidden="true">✓</div>
        <div>
          <h1>TEST COMPLETED</h1>
          <p class="muted">${AVUtil.esc(a.testName)} · Attempt #${a.attemptNo || '—'} · ${AVUtil.fmtDate(a.endTime)}</p>
        </div>
      </div>
      <div class="rh-score">
        <div class="rh-ring" role="img" aria-label="Score ${res.score} out of ${res.maxScore}, ${pct} percent">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8"/>
            <circle cx="40" cy="40" r="${R}" fill="none" stroke="${ringColor}" stroke-width="8"
              stroke-linecap="round" stroke-dasharray="${ringDash} ${C}" transform="rotate(-90 40 40)"/>
            <text x="40" y="38" text-anchor="middle" fill="#fff" font-size="17" font-weight="800">${pct}%</text>
            <text x="40" y="52" text-anchor="middle" fill="#b9cdea" font-size="9.5">${res.score}/${res.maxScore}</text>
          </svg>
        </div>
        <div class="rh-nums"><b>${res.score}</b><span>/ ${res.maxScore}</span></div>
        <div class="rh-pct">${pct}% score</div>
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

    <section class="card cutoff-card" id="cutoff-card">
      <div class="card-head">
        <h3>🎯 Cutoff Analysis <span class="muted small">(${AVUtil.esc(Cutoffs.CYCLE)})</span></h3>
        <span class="muted small" id="co-cat"></span>
      </div>
      ${(() => {
        const cat = cfg.candidateCategory || 'GEN';
        const ev = Cutoffs.evaluate(res.score, res.maxScore, cat);
        const cls = { safe: 'co-safe', borderline: 'co-border', below: 'co-below' }[ev.status];
        const st = cfg.candidateState ? AVUtil.esc(cfg.candidateState) : '— (Settings me set karo)';
        return `
        <div class="co-status ${cls}">
          <div class="co-big">${ev.label}</div>
          <div class="co-row">
            <span>Tumhara score: <b>${res.score}/${res.maxScore}</b> (${ev.pct}%)</span>
            <span>${Cutoffs.CATEGORY_LABELS[cat]} cutoff range: <b>${ev.lo}–${ev.hi}%</b> <span class="muted">(is paper par ≈ ${ev.loMarks}–${ev.hiMarks} marks)</span></span>
          </div>
        </div>
        <div class="dm-grid" style="margin-top:12px">
          <div><b>Domicile State</b><div class="muted">${st}</div></div>
          <div><b>Cycle</b><div class="muted">${AVUtil.esc(Cutoffs.CYCLE)}</div></div>
        </div>
        <p class="muted small" style="margin:10px 0 0">📌 IAF <b>normalised marks</b> par cutoff lagata hai aur <b>state-wise (domicile)</b> shortlist karta hai — official fact. Category ranges 2025-cycle analysis par based expected values hain; IAF exact state-wise numbers publish nahi karta. Marginal case me top-of-range (+${ev.hi}%) target karo.</p>`;
      })()}
    </section>

    <section class="card">
      <div class="card-head"><h3>🏅 Phase-2 Readiness <span class="muted small">(PFT + Medical — official standards)</span></h3></div>
      <div class="dm-grid">
        <div>
          <b>PFT-I (run)</b>
          <div class="muted small">${Cutoffs.PFT.run.male}</div>
          <div class="muted small">${Cutoffs.PFT.run.female}</div>
        </div>
        <div>
          <b>PFT-II (male)</b>
          ${Cutoffs.PFT.male.map(x => `<div class="muted small">${x[0]} — ${x[1]}</div>`).join('')}
        </div>
        <div>
          <b>PFT-II (female)</b>
          ${Cutoffs.PFT.female.map(x => `<div class="muted small">${x[0]} — ${x[1]}</div>`).join('')}
        </div>
        <div>
          <b>Medical</b>
          <div class="muted small">Height: ${Cutoffs.MEDICAL.height}</div>
          <div class="muted small">Chest: ${Cutoffs.MEDICAL.chest}</div>
          <div class="muted small">Vision: ${Cutoffs.MEDICAL.vision}</div>
        </div>
      </div>
      <p class="muted small" style="margin:8px 0 0">Source: agnipathvayu.cdac.in (CASB official). ${AVUtil.esc(Cutoffs.PFT.note)}</p>
    </section>

    <section class="card">
      <h3>Subject Performance</h3>
      <div class="tbl-scroll"><table class="tbl">
        <thead><tr><th>Subject</th><th>Correct</th><th>Wrong</th><th class="rs-col-u">Unattempted</th><th>Score</th><th>Accuracy</th><th class="rs-col-t">Time Spent</th></tr></thead>
        <tbody>${subjectRows || '<tr><td colspan="7" class="muted">—</td></tr>'}</tbody>
      </table></div>
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
  /* v1.4.44: purane/orphan attempts (test delete/rebuild ho chuka) bhi
     crash ke bina analysis dikhaate hain — jo data hai wahi dikhao */
  const aOrder = Array.isArray(a.sectionOrder) && a.sectionOrder.length
    ? a.sectionOrder
    : (a.sections && !Array.isArray(a.sections) ? Object.keys(a.sections) : []);
  aOrder.forEach(sid => {
    const sec = (a.sections || {})[sid];
    if (!sec) return;
    const sname = test?.sections.find(s => s.subjectId === sid)?.name || sid;
    (sec.questionIds || []).forEach((qid, i) => {
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

  // ---- reattempt progression (all attempts of THIS test, connected) ----
  const sibAttempts = ((await Store.getMeta('attemptIndex', [])).filter(x => x.testId === a.testId && !x.abandoned)).sort((x, y) => x.date - y.date);

  // ---- time analysis helpers ----
  const totalTimeSpent = flat.reduce((s, f) => s + (f.pq.timeSpent || 0), 0);
  const tBuckets = [
    { label: 'Fast (<30s)', n: flat.filter(f => (f.pq.timeSpent || 0) > 0 && (f.pq.timeSpent || 0) < 30).length, color: '#4cbf76' },
    { label: 'Steady (30–60s)', n: flat.filter(f => (f.pq.timeSpent || 0) >= 30 && (f.pq.timeSpent || 0) <= 60).length, color: '#3b6fb6' },
    { label: 'Slow (1–2 min)', n: flat.filter(f => (f.pq.timeSpent || 0) > 60 && (f.pq.timeSpent || 0) <= 120).length, color: '#f0b429' },
    { label: 'Very slow (>2 min)', n: flat.filter(f => (f.pq.timeSpent || 0) > 120).length, color: '#e87b78' }
  ];
  const avgT = arr => arr.length ? arr.reduce((s, f) => s + (f.pq.timeSpent || 0), 0) / arr.length : null;
  const tCorrect = flat.filter(f => f.pq.result === 'correct');
  const tWrong = flat.filter(f => f.pq.result === 'wrong');
  const tSkip = flat.filter(f => f.pq.result === 'skip');
  const avgTCorrect = avgT(tCorrect), avgTWrong = avgT(tWrong), avgTSkip = avgT(tSkip);
  const top2Time = timed.slice(0, 2).reduce((s, f) => s + (f.pq.timeSpent || 0), 0);
  const top2Share = totalTimeSpent ? Math.round(top2Time / totalTimeSpent * 100) : 0;

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

  const anPct = res.maxScore ? Math.round((res.score / res.maxScore) * 1000) / 10 : 0;
  const anRing = anPct >= 75 ? 'good' : anPct >= 50 ? 'mid' : 'low';
  App.page('page page-analysis', `
    <section class="tlib-hero an-hero" aria-label="Attempt summary">
      <div class="th-main">
        <div class="th-kicker">Detailed Analysis</div>
        <div class="th-title">${AVUtil.esc(a.testName)}</div>
        <div class="th-meta">Attempt #${a.attemptNo || '—'} · ${AVUtil.fmtDate(a.endTime || a.date)} · ${AVUtil.fmtDur(res.timeTaken)}</div>
        <div class="th-tools">
          <a class="th-more" href="#/attempt/${a.id}/result">📊 Result page</a>
          <a class="th-new" href="#/test/${a.testId}/instructions">↻ Reattempt</a>
        </div>
      </div>
      <div class="th-side">
        <div class="th-stat"><b>${res.score}<span class="th-of">/${res.maxScore}</span></b><span>score · ${anPct}%</span></div>
        <div class="th-stat"><b>${res.accuracy}%</b><span>accuracy</span></div>
        <div class="th-stat"><b>${res.correct}<span class="th-ok">✓</span> <span class="th-bad">✗${res.wrong}</span> <span class="th-mut">–${res.unattempted}</span></b><span>right / wrong / skip</span></div>
      </div>
    </section>

    <div class="filter-tabs ftabs2" role="tablist">
      ${TABS.map(([k, v]) => `<button role="tab" class="ftab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${v}</button>`).join('')}
    </div>
    <div id="an-body"></div>
  `);

  const body = AVUtil.$('#an-body');

  if (state.tab === 'overview') {
    body.innerHTML = `
      ${groupCompareHTML(a)}
      ${progressionHTML()}
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
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Subject</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Score</th><th>Accuracy</th><th>Avg time/Q</th></tr></thead>
        <tbody>${(test?.sections || []).map(s => {
          const st = res.subjects[s.subjectId] || {};
          const att = (st.correct || 0) + (st.wrong || 0);
          return `<tr><td><b>${AVUtil.esc(s.name)}</b></td><td>${att}</td><td>${st.correct || 0}</td><td>${st.wrong || 0}</td><td>${st.unattempted || 0}</td>
          <td><b>${Math.round((st.score || 0) * 100) / 100}</b></td><td>${st.accuracy || 0}%</td>
          <td>${st.total ? AVUtil.fmtDur((st.timeSpent || 0) / st.total) : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>
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
          <div class="qa-srcline">${AVUtil.pyqTag(q)}</div>
          <div class="qa-text">${AVUtil.qtext(q.questionText)}</div>
          ${AVUtil.hasDevanagari(q.questionTextHi) ? `<div class="qa-text qa-hi">🅷 ${AVUtil.qtext(q.questionTextHi)}</div>` : ''}
          ${q.image ? `<img class="qa-img" src="${AVUtil.esc(q.image)}" alt="figure" loading="lazy">` : ''}
          <div class="qa-answers">
            <div class="qa-ans ${f.pq.result === 'correct' ? 'ok' : ''}"><b>Your Answer (${f.pq.sel || '—'}):</b> ${yourAns}</div>
            ${f.pq.result !== 'correct' ? `<div class="qa-ans ok"><b>Correct Answer (${f.pq.key || '—'}):</b> ${keyAns}</div>` : ''}
          </div>
          ${q.explanation ? `<div class="qa-exp"><b>Explanation:</b> ${AVUtil.qtext(q.explanation)}</div>` : ''}
          ${AVUtil.hasDevanagari(q.explanationHi) ? `<div class="qa-exp qa-hi"><b>व्याख्या:</b> ${AVUtil.qtext(q.explanationHi)}</div>` : ''}
          ${!q.explanation && q.source ? `<div class="qa-exp muted"><b>Source:</b> ${AVUtil.esc(q.source)}</div>` : ''}
          <div class="qa-note" data-qid="${f.qid}">
            <div class="qa-note-head">📝 My Notebook</div>
            <textarea class="note-ta" rows="1" placeholder="Apna solution / trick yahan likho…">${AVUtil.esc(noteMap[f.qid] || '')}</textarea>
            <div class="qa-note-actions"><button class="btn btn-plain btn-sm" data-note-save="${f.qid}">💾 Save</button> <span class="note-saved muted small"></span></div>
          </div>
          </div>
        </div>`;
      }).join('') : '<div class="empty-state"><p>No questions in this filter.</p></div>'}
      ${qPages > 1 ? `<div class="pager t2-pager" aria-label="Pages">
        <button data-qp="${state.qPage - 1}" ${state.qPage <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        ${Array.from({ length: qPages }, (_, i) => i + 1).slice(Math.max(0, state.qPage - 3), Math.max(0, state.qPage - 3) + 5).map(n =>
          `<button data-qp="${n}" class="${n === state.qPage ? 'on' : ''}">${n}</button>`).join('')}
        <button data-qp="${state.qPage + 1}" ${state.qPage >= qPages ? 'disabled' : ''} aria-label="Next page">›</button>
        <span class="pg-info">${qFiltered.length} questions</span>
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
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Difficulty</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Accuracy</th></tr></thead>
        <tbody>${Object.entries(diffAgg).sort().map(([d, t]) => `<tr>
          <td><b>${AVUtil.esc(d)}</b></td><td>${t.correct}</td><td>${t.wrong}</td><td>${t.skip}</td>
          <td>${(t.correct + t.wrong) ? Math.round(t.correct / (t.correct + t.wrong) * 100) : 0}%</td></tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}</tbody></table></div>
      </section>`;
  } else if (state.tab === 'time') {
    body.innerHTML = `
      <section class="stat-row">
        ${ast('Total Time', AVUtil.fmtDur(res.timeTaken))}
        ${ast('Avg / Question', res.total ? AVUtil.fmtDur(res.timeTaken / res.total) : '—')}
        ${ast('Avg / Correct', avgTCorrect != null ? AVUtil.fmtDur(avgTCorrect) : '—', 'good')}
        ${ast('Avg / Wrong', avgTWrong != null ? AVUtil.fmtDur(avgTWrong) : '—', avgTWrong != null && avgTCorrect != null && avgTWrong > avgTCorrect ? 'bad' : '')}
        ${ast('Avg / Skipped', avgTSkip != null ? AVUtil.fmtDur(avgTSkip) : '—')}
      </section>
      <section class="two-col">
        <div class="card chart-card"><h3>Time Distribution <span class="muted small">— har question par kitna time laga</span></h3>
          ${Charts.barChart(tBuckets.map(b => ({ label: b.label, value: b.n, max: Math.max(1, flat.length), color: b.color, valueLabel: b.n + ' Q' })))}
          <div class="chart-legend">${tBuckets.map(b => `<span class="chip"><i style="background:${b.color}"></i>${b.label}</span>`).join('')}</div>
        </div>
        <div class="card"><h3>Pace Insights</h3>
          <ul class="pace-insight">
            <li>${top2Share >= 30
              ? `⏳ Top 2 questions ne poori exam ka <b>${top2Share}% time</b> kha liya — in par control rakho.`
              : `⚡ Time acche se distribute raha — koi ek question paper hold nahi kar paya.`}</li>
            ${avgTWrong != null && avgTCorrect != null ? `<li>${avgTWrong > avgTCorrect
              ? `🐢 Jahan <b>galat</b> hue wahan avg <b>${AVUtil.fmtDur(avgTWrong)}</b> laga, sahi answers par sirf <b>${AVUtil.fmtDur(avgTCorrect)}</b> — slow questions = doubt wale questions.`
              : `🎯 Galat answers par bhi time zyada nahi laga — guesswork strong hai.`}</li>` : ''}
            ${avgTSkip != null ? `<li>${avgTSkip > 60
              ? `🤔 Skip kiye questions par avg <b>${AVUtil.fmtDur(avgTSkip)}</b> laga — inhe dobara milenge, ab preparation kar lo.`
              : `↪️ Skip kiye questions par jaldi chhoda — bad decision nahi.`}</li>` : ''}
            <li>📊 ${over60.length} question 1 min+ · ${over120.length} question 2 min+ (total ${flat.length})</li>
          </ul>
        </div>
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
      return `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Q#</th><th>Subject</th><th>Topic</th><th>Result</th><th>Time</th></tr></thead><tbody>
        ${rows.map(f => `<tr>
          <td><b>${f.gn}</b></td><td>${AVUtil.esc(f.sname)}</td>
          <td>${AVUtil.esc(f.q?.topic || '—')}</td>
          <td><span class="badge ${f.pq.result === 'correct' ? 'good' : (f.pq.result === 'wrong' ? 'bad' : '')}">${f.pq.result}</span></td>
          <td><b>${AVUtil.fmtDur(f.pq.timeSpent || 0)}</b></td></tr>`).join('')}
      </tbody></table></div>`;
    }
  }

  function ast(l, v, cls) {
    return `<div class="stat-card ${cls || ''}"><div class="stat-val">${AVUtil.esc(String(v))}</div><div class="stat-lbl">${l}</div></div>`;
  }

  /* 🔗 GROUP COMPARISON — "View with all": jinhone YE shared test diya un sab ka comparison
     (shared test nahi hai to section render hi nahi hota — normal tests par zero effect) */
  async function groupCompareHTML(a) {
    const test = await DB.get('tests', a.testId).catch(() => null);
    if (!test || !test.sharedCode) return '';
    const tid = 'gc-' + test.sharedCode;
    return `<section class="card gc-card" id="${tid}">
      <div class="gc-head" id="${tid}-h"><h3>👥 View With All <span class="gc-hint">— jinhone ye test diya un sab ka comparison</span></h3><span class="gc-arrow">▸</span></div>
      <div class="gc-body" id="${tid}-b" hidden><p class="muted small">📊 Load ho raha hai…</p></div>
    </section>`;
  }

  /* reattempt progression — ek hi test ke saare attempts, connected */
  function progressionHTML() {
    if (sibAttempts.length < 2) {
      return `<section class="card prog-card prog-hint">
        <div class="prog-hint-txt">
          <b>Attempt Progression</b>
          <span>Ye test abhi 1 baar diya hai. Reattempt karo — pehla kitna aaya, dusre me kitna aaya, sab yahan connected graph me dikhega.</span>
        </div>
        <a class="btn btn-primary" href="#/test/${a.testId}/instructions">↻ Reattempt this test</a>
      </section>`;
    }
    const points = sibAttempts.map(x => ({ x: '#' + (x.attemptNo || '—'), y: x.maxScore ? Math.round(x.score / x.maxScore * 1000) / 10 : 0 }));
    const rows = sibAttempts.map((x, i) => {
      const pct = x.maxScore ? Math.round(x.score / x.maxScore * 1000) / 10 : 0;
      const prevPct = i > 0 && sibAttempts[i - 1].maxScore ? Math.round(sibAttempts[i - 1].score / sibAttempts[i - 1].maxScore * 1000) / 10 : null;
      const delta = prevPct != null ? Math.round((pct - prevPct) * 10) / 10 : null;
      return `<tr class="${x.id === a.id ? 'prog-cur' : ''}">
        <td><b>#${x.attemptNo || '—'}</b></td>
        <td class="muted small">${AVUtil.fmtDate(x.date)}</td>
        <td><b>${x.score}</b><span class="muted">/${x.maxScore}</span></td>
        <td><b>${pct}%</b></td>
        <td>${x.accuracy != null ? x.accuracy + '%' : '—'}</td>
        <td>${AVUtil.fmtDur(x.timeTaken || 0)}</td>
        <td>${delta == null ? '<span class="muted">—</span>' : `<span class="badge ${delta >= 0 ? 'good' : 'bad'}">${delta >= 0 ? '▲ +' : '▼ '}${delta}%</span>`}</td>
        <td>${x.id === a.id ? '<span class="badge">THIS</span>' : `<a class="link" href="#/attempt/${x.id}/analysis">Analysis</a>`}</td>
      </tr>`;
    }).join('');
    const first = sibAttempts[0], last = sibAttempts[sibAttempts.length - 1];
    const overall = first.maxScore && last.maxScore
      ? Math.round((last.score / last.maxScore - first.score / first.maxScore) * 1000) / 10 : null;
    return `<section class="card prog-card">
      <div class="card-head">
        <h3>Attempt Progression</h3>
        <span class="muted small">${sibAttempts.length} attempts of this test — ek jagah connected${overall != null ? ` · overall ${overall >= 0 ? '<b class="good">▲ +' + overall + '%</b>' : '<b class="bad-txt">▼ ' + overall + '%</b>'}` : ''}</span></div>
      ${Charts.lineChart(points, { min: 0, max: 100, color: '#3b6fb6' })}
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Attempt</th><th>Date</th><th>Score</th><th>%</th><th>Accuracy</th><th>Time</th><th>Change</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    </section>`;
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
  AVUtil.$('#gc-head')?.addEventListener('click', () => {
    const card = AVUtil.$('#gc-card'); const body = AVUtil.$('#gc-body'); const arr = card && card.querySelector('.gc-arrow');
    if (!card || !body) return;
    body.hidden = !body.hidden;
    if (arr) arr.textContent = body.hidden ? '▸' : '▾';
    if (!body.hidden) gcLoad(card);
  });
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
