/* ============================================================
 * VIEW: DASHBOARD 2.0 — quick start, aaj ka haal, streak,
 * cutoff readiness, series progress, performance, recent
 * ============================================================ */

Views.dashboard = async function () {
  const cfg = await App.config();
  App.candidateName = cfg.candidateName || 'Practice Candidate';
  const idxAll = await Store.getMeta('attemptIndex', []);
  /* v1.4.46 EXAM ISOLATION: dashboard sirf current exam ke attempts dikhata hai */
  const curExam = (App.configCache && App.configCache.exam) || 'airforce';
  const idx = idxAll.filter(a => (a.exam || 'airforce') === curExam);
  const done = idx.filter(a => !a.abandoned);
  const topicStats = await Store.getMeta('topicStats', {});
  const qstats = await Store.getMeta('qstats', { seen: {} });
  const seenCount = Object.keys(qstats.seen || {}).length;
  const bankStats = await Bank.bankStats();
  const totalQ = Object.values(bankStats).reduce((a, s) => a + s.total, 0);
  const allTests = (await DB.getAll('tests')).filter(t => (t.exam || 'airforce') === curExam);
  const seriesTests = allTests.filter(t => t.series);

  /* ── series progress: testId YA naam match (rebuild-proof) ── */
  const SP = App.seriesProgress(seriesTests, idx);
  const seriesDone = SP.done;

  // aggregate performance
  const totalTests = done.length;
  let totCorrect = 0, totWrong = 0, totUnatt = 0, totScore = 0, bestScore = 0, bestMax = 1, totTime = 0, totQ = 0, bestAtt = null;
  const subjAgg = {};
  done.forEach(a => {
    totCorrect += a.correct; totWrong += a.wrong; totUnatt += a.unattempted;
    totScore += a.score;
    const ratio = a.score / (a.maxScore || 100);
    if (ratio > bestScore / bestMax) { bestScore = a.score; bestMax = a.maxScore || 100; bestAtt = a; }
    totTime += a.timeTaken || 0; totQ += a.total || 0;
    for (const sid in (a.subjectStats || {})) {
      const s = a.subjectStats[sid];
      const agg = subjAgg[sid] || (subjAgg[sid] = { name: a.subjectNames?.[sid] || sid, correct: 0, wrong: 0, unatt: 0, total: 0 });
      agg.correct += s.correct; agg.wrong += s.wrong; agg.unatt += s.unattempted; agg.total += s.total;
    }
  });
  const attemptedQ = totCorrect + totWrong;
  const accuracy = attemptedQ ? Math.round((totCorrect / attemptedQ) * 1000) / 10 : 0;
  const avgScore = totalTests ? Math.round((totScore / totalTests) * 10) / 10 : 0;
  const avgPct = totalTests ? Math.round(done.reduce((s, a) => s + (a.maxScore ? a.score / a.maxScore : 0), 0) / totalTests * 1000) / 10 : 0;
  const avgPerQ = totQ ? Math.round((totTime / totQ) * 10) / 10 : 0;

  /* ── AAJ KA HAAL + streak ── */
  const dayKey = ts => new Date(ts).toDateString();
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const todayAtts = done.filter(a => a.date >= t0.getTime());
  const todayQ = todayAtts.reduce((s, a) => s + (a.total || 0), 0);
  const todayMin = Math.round(todayAtts.reduce((s, a) => s + (a.timeTaken || 0), 0) / 60);
  const days = new Set(done.map(a => dayKey(a.date)));
  let streak = 0; const dc = new Date();
  if (!days.has(dayKey(dc))) dc.setDate(dc.getDate() - 1);   // aaj nahi diya to kal tak ki streak gini jaati hai
  while (days.has(dayKey(dc))) { streak++; dc.setDate(dc.getDate() - 1); }
  const streakAlive = days.has(dayKey(new Date()));

  /* ── cutoff readiness (last full mock vs category cutoff) ── */
  const lastMock = [...done].reverse().find(a => ((a.testType === 'full') || /mock/i.test(a.testName || '')) && a.maxScore >= 50);
  let cut = null;
  try { if (lastMock) cut = Cutoffs.evaluate(lastMock.score, lastMock.maxScore, cfg.candidateCategory || 'GEN', curExam); } catch (e) { /* cutoffs optional */ }

  // score trend (last 15) — date labels
  const trend = done.slice(-15).map(a => ({ x: new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), y: a.maxScore ? Math.round((a.score / a.maxScore) * 1000) / 10 : 0 }));

  // subject bars
  const subjColors = { physics: '#3b6fb6', mathematics: '#7a4fb3', english: '#2e8b57', raga: '#c77b2e' };
  const subjBars = Object.entries(subjAgg).map(([sid, s]) => {
    const att = s.correct + s.wrong;
    return { label: (cfg.subjects.find(x => x.id === sid)?.name || s.name), value: att ? Math.round((s.correct / att) * 100) : 0, max: 100, color: subjColors[sid] || '#3b6fb6', valueLabel: (att ? Math.round((s.correct / att) * 100) : 0) + '%' };
  });

  // weak / strong topics
  const th = cfg.thresholds || { strong: 80, average: 60 };
  const topicRows = [];
  for (const key in topicStats) {
    const [sid, topic] = key.split('␟');
    const s = topicStats[key];
    if (s.attempted < 3) continue;
    topicRows.push({ sid, topic, acc: Math.round((s.correct / s.attempted) * 1000) / 10, attempted: s.attempted });
  }
  topicRows.sort((a, b) => a.acc - b.acc);
  const weak = topicRows.slice(0, 6);
  const strong = topicRows.filter(r => r.acc >= th.strong).slice(-6).reverse();

  // greeting by time of day — personal, not robotic
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : (hr < 17 ? 'Good afternoon' : 'Good evening');
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalMockQ = cfg.subjects.reduce((a, s) => a + s.questions, 0);
  const seriesPct = SP.total ? Math.round(SP.done / SP.total * 100) : 0;
  const coveragePct = totalQ ? Math.round(seenCount / totalQ * 1000) / 10 : 0;
  const hasData = done.length > 0;

  App.page('page page-dashboard', `
    ${App.resumeBannerHTML()}

    <div class="dash-greet">
      <div>
        <h1>${greet}, ${AVUtil.esc((cfg.candidateName || 'Practice Candidate').split(' ')[0])}</h1>
        <p class="muted">${today} · ${AVUtil.esc(cfg.name)}</p>
      </div>
      <div class="dg-right">
        <span class="dg-chip" title="Question bank works fully offline">⚡ Offline ready</span>
        <span class="dg-chip">${totalQ.toLocaleString('en-IN')} PYQs</span>
      </div>
    </div>

    <section class="dash-hero" aria-label="Start a test">
      <div class="dh-main">
        <div class="dh-kicker">FULL MOCK TEST</div>
        <div class="dh-title">${totalMockQ} questions · ${cfg.duration / 60} minutes</div>
        <div class="dh-meta">${cfg.subjects.map(s => `${s.name} ${s.questions}`).join(' · ')} &nbsp;|&nbsp; Marking +1 / −0.25 / 0</div>
        <div class="dh-actions">
          <button class="dh-cta" id="qs-full">Start Full Mock <span aria-hidden="true">→</span></button>
          ${SP.next ? `<a class="dh-secondary dh-continue" href="#/test/${AVUtil.esc(SP.next.id)}" title="Ready-made series ka agla test">${SP.nextIsMock ? 'Continue Series' : 'Continue'}: ${AVUtil.esc(SP.next.name)} <span aria-hidden="true">›</span></a>`
                    : (seriesTests.length ? `<a class="dh-secondary" href="#/tests">Test Series <b>${seriesTests.length}</b> <span aria-hidden="true">›</span></a>` : `<a class="dh-secondary" href="#/tests">Test Series <span aria-hidden="true">›</span></a>`)}
        </div>
      </div>
      ${hasData ? `<div class="dh-side">
        <div class="dh-stat"><b>${avgPct}%</b><span>avg score</span></div>
        <div class="dh-stat"><b>${accuracy}%</b><span>accuracy</span></div>
        <div class="dh-stat"><b>${totalTests}</b><span>tests given</span></div>
      </div>` : `<div class="dh-side dh-side-empty">
        <p>Har mock bilkul naya banta hai — apni performance ke hisaab se questions.</p>
      </div>`}
    </section>

    ${hasData || todayAtts.length ? `
    <section class="dash-today" aria-label="Aaj ka haal">
      <div class="dt-item"><span class="dt-ico">📆</span><div><b>${todayAtts.length}</b> test${todayAtts.length === 1 ? '' : 's'} aaj</div><span class="muted small">${todayQ} Q · ${todayMin} min</span></div>
      <div class="dt-item"><span class="dt-ico">${streakAlive ? '🔥' : '💤'}</span><div><b>${streak}</b> day streak</div><span class="muted small">${streakAlive ? 'aaj bhi chal raha — keep going!' : 'aaj test do, streak zinda karo'}</span></div>
      <div class="dt-item"><span class="dt-ico">📚</span><div><b>${seenCount.toLocaleString('en-IN')}</b>/${totalQ.toLocaleString('en-IN')} PYQs deke</div><span class="dt-covbar" title="Bank coverage ${coveragePct}%"><i style="width:${Math.min(100, coveragePct)}%"></i></span></div>
      ${cut ? `<div class="dt-item dt-cut ${cut.status}"><span class="dt-ico">🎯</span><div><b>${cut.pct}%</b> last mock</div><span class="muted small">${AVUtil.esc(cut.label)} (${AVUtil.esc(Cutoffs.CATEGORY_LABELS[cfg.candidateCategory || 'GEN'] || cfg.candidateCategory || 'GEN')})</span></div>` : ''}
    </section>` : ''}

    <section class="stat-row" aria-label="Your performance">
      ${statCard('Tests Given', totalTests)}
      ${statCard('Avg Score', hasData ? avgPct + '%' : '—')}
      ${statCard('Accuracy', hasData ? accuracy + '%' : '—', accuracy >= th.average ? 'good' : (accuracy > 0 && accuracy < th.average ? 'bad' : ''))}
      ${statCard('Best Score', totalTests ? `${bestScore}/${bestMax}` : '—', 'good', bestAtt ? bestAtt.testName : '')}
      ${statCard('Questions Attempted', attemptedQ.toLocaleString('en-IN'))}
      ${statCard('Avg Time / Question', avgPerQ ? avgPerQ + 's' : '—')}
    </section>

    <section class="qs-grid" aria-label="Quick start">
      <button class="qs-card qs-series" onclick="location.hash='#/tests'">
        <div class="qs-toprow"><span class="qs-title">Test Series</span><span class="qs-badge">${seriesTests.length} tests</span></div>
        <div class="qs-sub">Ready-made mocks — har test me naye questions</div>
        <div class="qs-progress" title="${seriesDone}/${SP.total} series tests complete"><i style="width:${seriesPct}%"></i></div>
        <div class="qs-cta">${seriesTests.length ? `${seriesDone}/${SP.total} series done${SP.next ? ' · next: ' + AVUtil.esc(SP.next.name) : ' ✓ sab complete!'}` : 'Open library'} <span aria-hidden="true">→</span></div>
      </button>
      ${cfg.subjects.map(s => {
        const usable = bankStats[s.id]?.usable || 0;
        const att = subjAgg[s.id];
        const acc = att && (att.correct + att.wrong) ? Math.round(att.correct / (att.correct + att.wrong) * 100) : null;
        return `<button class="qs-card" data-subject="${s.id}">
          <div class="qs-toprow"><span class="qs-title"><i class="subject-dot sd-${s.id}" aria-hidden="true"></i>${AVUtil.esc(s.name)}</span>${acc != null ? `<span class="qs-badge ${acc >= th.average ? 'ok' : 'low'}">${acc}%</span>` : ''}</div>
          <div class="qs-sub">${s.questions} questions · ${s.duration / 60} min · ${usable.toLocaleString('en-IN')} in bank</div>
          <div class="qs-cta">Start practice <span aria-hidden="true">→</span></div>
        </button>`;
      }).join('')}
      <button class="qs-card qs-custom" onclick="location.hash='#/tests/new'">
        <div class="qs-toprow"><span class="qs-title">Custom Test</span></div>
        <div class="qs-sub">Choose subjects, chapters, difficulty &amp; timing</div>
        <div class="qs-cta">Build a test <span aria-hidden="true">→</span></div>
      </button>
    </section>

    <section class="charts-grid dash-charts">
      <div class="card chart-card">
        <h3>Score Trend <span class="muted small">— % of max, last ${trend.length || 0} attempt${trend.length === 1 ? '' : 's'}</span></h3>
        ${trend.length ? Charts.lineChart(trend, { max: 100, min: 0, color: '#3b6fb6' }) : '<div class="chart-empty">Take a test to see your trend here.</div>'}
      </div>
      <div class="card chart-card">
        <h3>Subject Accuracy</h3>
        ${subjBars.length ? Charts.barChart(subjBars) : '<div class="chart-empty">Attempt a few questions to unlock this.</div>'}
      </div>
    </section>

    <section class="two-col">
      <div class="card">
        <div class="card-head"><h3>Focus Areas</h3>${weak.length ? '<button class="btn btn-plain btn-sm" id="dash-weak-drill" title="Weak topics par 15-question practice test">🎯 Practice these →</button>' : '<span class="muted small">accuracy &lt; ' + th.average + '%</span>'}</div>
        ${weak.length ? `<table class="tbl"><thead><tr><th>Topic</th><th>Accuracy</th><th>Attempted</th></tr></thead><tbody>
          ${weak.map(r => `<tr><td><span class="muted small">${AVUtil.esc((cfg.subjects.find(s => s.id === r.sid)?.name) || r.sid)}</span><br>${AVUtil.esc(r.topic)}</td>
          <td><span class="badge bad">${r.acc}%</span></td><td>${r.attempted}</td></tr>`).join('')}
        </tbody></table>` : '<div class="chart-empty">No weak topics yet — take a few tests and this list will build itself.</div>'}
        ${strong.length ? `<div class="focus-strong"><span class="muted small">Strong areas:</span> ${strong.slice(0, 5).map(r => `<span class="badge good">${AVUtil.esc(r.topic)}</span>`).join(' ')}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent Attempts</h3><a href="#/attempts" class="link">View all →</a></div>
        ${done.length ? `<table class="tbl"><thead><tr><th>Test</th><th>Score</th><th>Accuracy</th><th></th></tr></thead><tbody>
          ${done.slice(-6).reverse().map(a => `<tr>
            <td>${AVUtil.esc(a.testName)}<span class="muted small"> · ${AVUtil.fmtDate(a.date)}${a.testType ? ' · ' + AVUtil.esc((a.testType || '').toUpperCase()) : ''}</span></td>
            <td><b>${a.score}</b><span class="muted">/${a.maxScore}</span></td>
            <td><span class="${a.accuracy >= th.average ? 'tst-good' : 'tst-low'}">${a.accuracy}%</span></td>
            <td><a class="link" href="#/attempt/${a.id}/analysis">Analysis</a></td>
          </tr>`).join('')}
        </tbody></table>` : '<div class="chart-empty">No attempts yet — your first full mock is one tap away.</div>'}
      </div>
    </section>
  `);

  function statCard(label, value, cls, sub) {
    return `<div class="stat-card ${cls || ''}"><div class="stat-val">${AVUtil.esc(String(value))}</div><div class="stat-lbl">${label}</div>${sub ? `<div class="stat-sub muted">${AVUtil.esc(sub)}</div>` : ''}</div>`;
  }

  AVUtil.$('#qs-full').addEventListener('click', () => startFullMock());
  AVUtil.$$('.qs-card[data-subject]').forEach(el =>
    el.addEventListener('click', () => startSubject(el.getAttribute('data-subject'))));

  AVUtil.$('#dash-weak-drill')?.addEventListener('click', async () => {
    const btn = AVUtil.$('#dash-weak-drill');
    btn.disabled = true; btn.textContent = 'Ban raha hai…';
    const w = weak[0];
    if (!w) { btn.disabled = false; btn.textContent = '🎯 Practice these →'; return; }
    const r = await Generator.generate({ name: 'Weak Topics Drill', type: 'topic', mode: 'practice', strategy: 'weak-topic', sections: [{ subjectId: w.sid, count: 15 }] });
    if (!r.ok) {
      btn.disabled = false; btn.textContent = '🎯 Practice these →';
      return AVUtil.toast('Abhi itne questions available nahi — pehle kuch tests do.', 'warn');
    }
    location.hash = '#/test/' + r.test.id + '/instructions';
  });

  async function startFullMock() {
    const btn = AVUtil.$('#qs-full');
    btn.disabled = true; btn.classList.add('loading');
    const r = await Generator.fullMock();
    if (!r.ok) return showGenError(r, btn);
    location.hash = '#/test/' + r.test.id + '/instructions';
  }

  async function startSubject(sid) {
    const el = AVUtil.$(`.qs-card[data-subject="${sid}"]`);
    el.disabled = true; el.classList.add('loading');
    const r = await Generator.subjectTest(sid);
    if (!r.ok) return showGenError(r, el);
    location.hash = '#/test/' + r.test.id + '/instructions';
  }

  function showGenError(r, el) {
    el.disabled = false; el.classList.remove('loading');
    const avail = (r.availability || []).map(a => `${a.subjectId}: ${a.available} available, ${a.needed} needed`).join(' · ');
    AVUtil.confirmModal({
      title: 'Not enough questions available to generate this test.',
      body: avail + (r.error ? '' : ''),
      yesLabel: 'OK', noLabel: 'Close', yesClass: 'btn-primary', serious: true
    });
  }
};
