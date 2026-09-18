/* ============================================================
 * VIEW: DASHBOARD — quick start, performance, recent attempts
 * ============================================================ */

Views.dashboard = async function () {
  const cfg = await App.config();
  App.candidateName = cfg.candidateName || 'Practice Candidate';
  const idx = await Store.getMeta('attemptIndex', []);
  const done = idx.filter(a => !a.abandoned);
  const qstats = await Store.getMeta('topicStats', {});
  const bankStats = await Bank.bankStats();
  const totalQ = Object.values(bankStats).reduce((a, s) => a + s.total, 0);
  const allTests = await DB.getAll('tests');
  const seriesTests = allTests.filter(t => t.series);
  const seriesDone = seriesTests.filter(t => idx.some(a => a.testId === t.id && !a.abandoned)).length;

  // aggregate performance
  const totalTests = done.length;
  let totCorrect = 0, totWrong = 0, totUnatt = 0, totScore = 0, bestScore = 0, bestMax = 1, totTime = 0, totQ = 0;
  const subjAgg = {};
  done.forEach(a => {
    totCorrect += a.correct; totWrong += a.wrong; totUnatt += a.unattempted;
    totScore += a.score; if (a.score / (a.maxScore || 100) > bestScore / bestMax) { bestScore = a.score; bestMax = a.maxScore || 100; }
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
  const avgPerQ = totQ ? Math.round((totTime / totQ) * 10) / 10 : 0;

  // score trend (last 15)
  const trend = done.slice(-15).map((a, i) => ({ x: `A${a.attemptNo}·${new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`, y: a.maxScore ? Math.round((a.score / a.maxScore) * 1000) / 10 : 0 }));

  // subject bars
  const subjColors = { physics: '#3b6fb6', mathematics: '#7a4fb3', english: '#2e8b57', raga: '#c77b2e' };
  const subjBars = Object.entries(subjAgg).map(([sid, s]) => {
    const att = s.correct + s.wrong;
    return { label: (cfg.subjects.find(x => x.id === sid)?.name || s.name), value: att ? Math.round((s.correct / att) * 100) : 0, max: 100, color: subjColors[sid] || '#3b6fb6', valueLabel: (att ? Math.round((s.correct / att) * 100) : 0) + '%' };
  });

  const donutParts = [
    { label: 'Correct', value: totCorrect, color: '#2e9e5b' },
    { label: 'Wrong', value: totWrong, color: '#d9534f' },
    { label: 'Skipped', value: totUnatt, color: '#a8b3c2' }
  ];

  // weak / strong topics
  const th = cfg.thresholds || { strong: 80, average: 60 };
  const topicRows = [];
  for (const key in qstats) {
    const [sid, topic] = key.split('␟');
    const s = qstats[key];
    if (s.attempted < 3) continue;
    topicRows.push({ sid, topic, acc: Math.round((s.correct / s.attempted) * 1000) / 10, attempted: s.attempted });
  }
  topicRows.sort((a, b) => a.acc - b.acc);
  const weak = topicRows.slice(0, 6);
  const strong = topicRows.filter(r => r.acc >= th.strong).slice(-6).reverse();

  App.page('page page-dashboard', `
    ${App.resumeBannerHTML()}
    <section class="hero-row">
      <div class="hero-info">
        <h1>${AVUtil.esc(cfg.name)} <span class="mode-pill">Mode: ${AVUtil.esc(cfg.mode)}</span></h1>
        <p class="muted">Full mock: <b>${cfg.subjects.reduce((a, s) => a + s.questions, 0)} questions · ${cfg.duration / 60} minutes · ${cfg.subjects.map(s => `${s.name} ${s.questions}`).join(' / ')}</b> · Marking: +1 / −0.25 / 0</p>
        <p class="muted">Question bank: <b>${totalQ.toLocaleString('en-IN')}</b> previous-year questions loaded on this device (offline ready).</p>
      </div>
    </section>

    <section class="qs-grid" aria-label="Quick start">
      <button class="qs-card qs-full" id="qs-full">
        <div class="qs-title">FULL MOCK TEST</div>
        <div class="qs-sub">100 Questions · 85 min · Physics 25 · Maths 25 · English 20 · RAGA 30</div>
        <div class="qs-cta">Generate &amp; Start →</div>
      </button>
      <button class="qs-card qs-series" onclick="location.hash='#/tests'">
        <div class="qs-title">TEST SERIES 📚</div>
        <div class="qs-sub">${seriesTests.length} bane-banaye tests — ek bhi question repeat nahi</div>
        <div class="qs-cta">${seriesTests.length ? `${seriesDone}/${seriesTests.length} done · Library kholo →` : 'Library kholo →'} </div>
      </button>
      ${cfg.subjects.map(s => {
        const usable = bankStats[s.id]?.usable || 0;
        const att = subjAgg[s.id];
        const acc = att && (att.correct + att.wrong) ? Math.round(att.correct / (att.correct + att.wrong) * 100) : null;
        return `<button class="qs-card" data-subject="${s.id}">
          <div class="qs-title">${AVUtil.esc(s.name)}</div>
          <div class="qs-sub">${s.questions} questions · ${s.duration / 60} min · ${usable} in bank</div>
          <div class="qs-cta">${acc != null ? `Accuracy so far: ${acc}% · ` : ''}Start Practice →</div>
        </button>`;
      }).join('')}
      <button class="qs-card qs-custom" onclick="location.hash='#/tests/new'">
        <div class="qs-title">CUSTOM TEST</div>
        <div class="qs-sub">Choose subjects, chapters, topics, count, difficulty &amp; timing</div>
        <div class="qs-cta">Build a Test →</div>
      </button>
    </section>

    <section class="stat-row">
      ${statCard('Total Tests', totalTests)}
      ${statCard('Questions Attempted', attemptedQ.toLocaleString('en-IN'))}
      ${statCard('Correct', totCorrect.toLocaleString('en-IN'), 'good')}
      ${statCard('Wrong', totWrong.toLocaleString('en-IN'), 'bad')}
      ${statCard('Accuracy', accuracy + '%', accuracy >= th.average ? 'good' : (accuracy > 0 && accuracy < th.average ? 'bad' : ''))}
      ${statCard('Average Score', avgScore)}
      ${statCard('Best Score', totalTests ? `${bestScore}/${bestMax}` : '—')}
      ${statCard('Avg Time / Question', avgPerQ ? avgPerQ + 's' : '—')}
    </section>

    <section class="charts-grid">
      <div class="card chart-card">
        <h3>Score Trend <span class="muted small">(% of max, last ${trend.length || 0} attempts)</span></h3>
        ${Charts.lineChart(trend, { max: 100, min: 0, color: '#3b6fb6' })}
      </div>
      <div class="card chart-card">
        <h3>Subject Performance <span class="muted small">(accuracy)</span></h3>
        ${subjBars.length ? Charts.barChart(subjBars) : '<p class="muted pad">Take a test to see subject-wise accuracy.</p>'}
      </div>
      <div class="card chart-card chart-donut">
        <h3>Answer Distribution</h3>
        ${Charts.donut(donutParts, { center: accuracy + '%', centerSub: 'accuracy' })}
        ${Charts.legend(donutParts.map(p => ({ ...p, valueLabel: p.value })))}
      </div>
    </section>

    <section class="two-col">
      <div class="card">
        <div class="card-head"><h3>Weak Topics</h3><span class="muted small">accuracy &lt; ${th.average}% (min 3 attempted)</span></div>
        ${weak.length ? `<table class="tbl"><thead><tr><th>Subject</th><th>Topic</th><th>Accuracy</th><th>Attempted</th></tr></thead><tbody>
          ${weak.map(r => `<tr><td>${AVUtil.esc((cfg.subjects.find(s => s.id === r.sid)?.name) || r.sid)}</td><td>${AVUtil.esc(r.topic)}</td>
          <td><span class="badge ${r.acc < th.average ? 'bad' : ''}">${r.acc}%</span></td><td>${r.attempted}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted pad">No weak topics identified yet — take a few tests.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Strong Topics</h3><span class="muted small">accuracy ≥ ${th.strong}%</span></div>
        ${strong.length ? `<table class="tbl"><thead><tr><th>Subject</th><th>Topic</th><th>Accuracy</th><th>Attempted</th></tr></thead><tbody>
          ${strong.map(r => `<tr><td>${AVUtil.esc((cfg.subjects.find(s => s.id === r.sid)?.name) || r.sid)}</td><td>${AVUtil.esc(r.topic)}</td>
          <td><span class="badge good">${r.acc}%</span></td><td>${r.attempted}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted pad">No strong topics yet — keep practising.</p>'}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Recent Attempts</h3><a href="#/attempts" class="link">View all →</a></div>
      ${done.length ? `<table class="tbl"><thead><tr><th>Test</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Time</th><th></th></tr></thead><tbody>
        ${done.slice(-8).reverse().map(a => `<tr>
          <td>${AVUtil.esc(a.testName)}<span class="muted small"> · attempt #${a.attemptNo}</span></td>
          <td class="muted">${AVUtil.fmtDate(a.date)}</td>
          <td><b>${a.score}</b>/${a.maxScore}</td>
          <td>${a.accuracy}%</td>
          <td>${AVUtil.fmtDur(a.timeTaken)}</td>
          <td><a class="link" href="#/attempt/${a.id}/analysis">Analysis</a></td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted pad">No attempts yet. Start with a Full Mock Test above.</p>'}
    </section>
  `);

  function statCard(label, value, cls) {
    return `<div class="stat-card ${cls || ''}"><div class="stat-val">${AVUtil.esc(String(value))}</div><div class="stat-lbl">${label}</div></div>`;
  }

  AVUtil.$('#qs-full').addEventListener('click', () => startFullMock());
  AVUtil.$$('.qs-card[data-subject]').forEach(el =>
    el.addEventListener('click', () => startSubject(el.getAttribute('data-subject'))));

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
