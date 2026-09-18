/* ============================================================
 * VIEWS: MY ATTEMPTS + SETTINGS
 * ============================================================ */

Views.attempts = async function (state) {
  state = state || { page: 1, filter: 'all', search: '' };
  const cfg = await App.config();
  let idx = await Store.getMeta('attemptIndex', []);
  idx.sort((a, b) => b.date - a.date);

  // incomplete attempts (in-progress)
  const unfinished = [];
  await DB.cursor('attempts', 'completed', false, a => unfinished.push(a));

  let list = idx;
  if (state.filter !== 'all') list = list.filter(a => a.testType === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(a => a.testName.toLowerCase().includes(q));
  }
  const PER = 20;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  state.page = AVUtil.clamp(state.page, 1, pages);
  const slice = list.slice((state.page - 1) * PER, state.page * PER);

  const painted = App.page('page page-attempts', `
    ${unfinished.length ? `<div class="resume-banner" role="alert">
      <div><b>${unfinished.length} unfinished attempt${unfinished.length > 1 ? 's' : ''}.</b>
      <span>${AVUtil.esc(unfinished[0].testName)}</span></div>
      <div class="resume-actions">
        <button class="btn btn-primary" onclick="App.resumePending()">RESUME EXAM</button>
      </div></div>` : ''}
    <div class="page-head">
      <div><h1>My Attempts</h1><p class="muted">${idx.length} completed · ${unfinished.length} in progress</p></div>
      <div class="head-actions">
        <input type="search" id="at-search" placeholder="Search by test name…" value="${AVUtil.esc(state.search)}">
        <select id="at-filter">
          <option value="all">All test types</option>
          ${['full','subject','chapter','topic','custom'].map(t => `<option value="${t}" ${state.filter === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      ${slice.length ? `<table class="tbl"><thead>
        <tr><th>Test</th><th>Date</th><th>Attempt</th><th>Score</th><th>Accuracy</th><th>Correct/Wrong/Skip</th><th>Time</th><th>Actions</th></tr>
      </thead><tbody>
        ${slice.map(a => `<tr data-id="${a.id}">
          <td>${AVUtil.esc(a.testName)}</td>
          <td class="muted small">${AVUtil.fmtDate(a.date)}</td>
          <td>#${a.attemptNo}</td>
          <td><b>${a.score}</b>/${a.maxScore}</td>
          <td>${a.accuracy}%</td>
          <td>${a.correct}/${a.wrong}/${a.unattempted}</td>
          <td>${AVUtil.fmtDur(a.timeTaken)}</td>
          <td class="qb-actions">
            <a class="btn btn-mini" href="#/attempt/${a.id}/analysis">Analysis</a>
            <a class="btn btn-mini" href="#/test/${a.testId}/instructions">Reattempt</a>
            <button class="btn btn-mini danger" data-del="${a.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted pad">No attempts yet.</p>'}
      ${pages > 1 ? `<div class="pager">
        <button class="btn btn-plain" data-pg="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${state.page} of ${pages}</span>
        <button class="btn btn-plain" data-pg="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Next →</button>
      </div>` : ''}
    </div>
  `, '/attempts');
  if (!painted) return; // user navigated away while this render was building

  AVUtil.$('#at-search').addEventListener('input', AVUtil.debounce(e => { state.search = e.target.value; state.page = 1; Views.attempts(state); }, 250));
  AVUtil.$('#at-filter').addEventListener('change', e => { state.filter = e.target.value; state.page = 1; Views.attempts(state); });
  AVUtil.$$('#app .pager [data-pg]').forEach(b => b.addEventListener('click', () => { state.page = +b.dataset.pg; Views.attempts(state); }));
  AVUtil.$$('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.del;
    const ok = await AVUtil.confirmModal({
      title: 'Delete this attempt?',
      body: 'The attempt record will be removed. The underlying test and questions are NOT deleted.',
      yesLabel: 'Delete', yesClass: 'btn-danger'
    });
    if (!ok) return;
    await DB.delete('attempts', id);
    const idx2 = await Store.getMeta('attemptIndex', []);
    await Store.setMeta('attemptIndex', idx2.filter(a => a.id !== id));
    AVUtil.toast('Attempt deleted.');
    Views.attempts(state);
  }));
  if (unfinished.length) {
    App.pendingResume = unfinished[0];
  }
};

/* ================= SETTINGS ================= */
Views.settings = async function () {
  const cfg = await App.config();

  App.page('page page-settings', `
    <div class="page-head"><div><h1>Settings</h1><p class="muted">All data stays on this device (IndexedDB). No account, no cloud.</p></div></div>

    <div class="two-col">
      <div class="card">
        <h3>Candidate</h3>
        <div class="b-row"><label>Name (shown in the exam panel)</label>
          <input type="text" id="st-name" value="${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}"></div>
        <div class="b-row"><label>Default language (instructions &amp; exam UI)</label>
          <select id="st-lang">
            <option value="en" ${cfg.defaultLanguage === 'en' ? 'selected' : ''}>English</option>
            <option value="hi" ${cfg.defaultLanguage === 'hi' ? 'selected' : ''}>हिन्दी</option>
          </select></div>
        <button class="btn btn-primary" id="st-save-cand">Save</button>
      </div>

      <div class="card">
        <h3>Exam Configuration <span class="muted small">(EXAM_CONFIG)</span></h3>
        <div class="qe-grid">
          <label>Timer mode
            <select id="st-timermode">
              <option value="section" ${cfg.timerMode === 'section' ? 'selected' : ''}>Section timers (real exam)</option>
              <option value="global" ${cfg.timerMode === 'global' ? 'selected' : ''}>Global timer</option>
            </select></label>
          <label>Section lock
            <select id="st-lock"><option value="1" ${cfg.sectionLock ? 'selected' : ''}>Enabled (real exam)</option><option value="0" ${!cfg.sectionLock ? 'selected' : ''}>Disabled</option></select></label>
          <label>Selection strategy
            <select id="st-strategy">${[['smart', 'Smart — no repeat after 2 corrects, wrong questions revised'], ['balanced-unseen', 'Balanced — new questions first'], ['random', 'Random'], ['balanced', 'Balanced difficulty'], ['unseen-first', 'Unseen first'], ['weak-topic', 'Weak topics first'], ['wrong-weighted', 'Wrong questions first']].map(([v, lbl]) => `<option value="${v}" ${cfg.selectionStrategy === v ? 'selected' : ''}>${lbl}</option>`).join('')}</select></label>
          <label>Retake mode
            <select id="st-retake">${[['fresh','Fresh questions when available'],['same','Same questions'],['random','Randomized questions']].map(([v, l]) => `<option value="${v}" ${cfg.retakeMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Strong threshold %<input type="number" id="st-strong" min="50" max="100" value="${cfg.thresholds?.strong ?? 80}"></label>
          <label>Needs-practice threshold %<input type="number" id="st-avg" min="20" max="90" value="${cfg.thresholds?.average ?? 60}"></label>
        </div>
        <h4 class="b-head">Section timing (minutes)</h4>
        <div class="qe-grid">
          ${cfg.subjects.map(s => `<label>${AVUtil.esc(s.name)}<input type="number" class="st-secdur" data-sid="${s.id}" min="5" max="120" value="${Math.round(s.duration / 60)}"></label>`).join('')}
        </div>
        <details class="adv-cfg">
          <summary>Advanced — full configuration JSON</summary>
          <textarea id="st-json" rows="14" spellcheck="false">${AVUtil.esc(JSON.stringify(cfg, (k, v) => typeof v === 'function' ? undefined : v, 2))}</textarea>
          <p class="muted small">Careful: this overrides everything. The getters (totalQuestions/maxMarks) are derived automatically.</p>
        </details>
        <button class="btn btn-primary" id="st-save-cfg">Save Configuration</button>
      </div>
    </div>

    <div class="card">
      <h3>Data Management</h3>
      <div class="dm-grid">
        <div><b>Storage used</b><div id="st-usage" class="muted">Calculating…</div></div>
        <div><b>Question bank</b><div class="muted" id="st-qcount">…</div></div>
      </div>
      <div class="head-actions" style="margin-top:12px">
        <button class="btn btn-plain" id="st-export">Export all data (JSON backup)</button>
        <button class="btn btn-plain" id="st-reseed">Reload bundled PYQ bank</button>
        <p class="muted small" style="margin-top:8px">The backup JSON restores your questions, tests, attempts and analytics — drop it on the <a href="#/import">Import</a> page to restore.</p>
        <button class="btn btn-danger" id="st-wipe">Erase all data</button>
      </div>
      <p class="muted small" style="margin-top:8px">Backup includes the full question bank, tests, attempts and analytics. Restore by importing the JSON on the Import page (as a questions file it restores the bank; full restore replaces everything).</p>
    </div>

    <div class="card">
      <h3>Install / Offline</h3>
      <p class="muted">This app is a PWA — install it from your browser menu ("Install app" / "Add to Home Screen") and it works fully offline, including exams. For permanent local use, keep a copy of the app folder and serve it with any static server (e.g. <code>python -m http.server</code>).</p>
    </div>
  `);

  // usage
  DB.estimateUsage().then(u => {
    AVUtil.$('#st-usage').textContent = `${(u.usage / 1048576).toFixed(1)} MB used of ~${(u.quota / 1048576 / 1024).toFixed(1)} GB available`;
  });
  const counts = {};
  for (const s of ['physics', 'mathematics', 'english', 'raga']) counts[s] = await DB.byIndex('questions', 'subject', s).then(r => r.length);
  AVUtil.$('#st-qcount').textContent = Object.entries(counts).map(([s, n]) => `${s}: ${n}`).join(' · ') + ` · total ${Object.values(counts).reduce((a, b) => a + b, 0)}`;

  AVUtil.$('#st-save-cand').addEventListener('click', async () => {
    cfg.candidateName = AVUtil.$('#st-name').value.trim() || 'Practice Candidate';
    cfg.defaultLanguage = AVUtil.$('#st-lang').value;
    App.lang = cfg.defaultLanguage;
    localStorage.setItem('av_lang', App.lang);
    await Store.setSetting('config', cfg);
    App.configCache = cfg;
    AVUtil.toast('Saved.');
  });

  AVUtil.$('#st-save-cfg').addEventListener('click', async () => {
    try {
      cfg.timerMode = AVUtil.$('#st-timermode').value;
      cfg.sectionLock = AVUtil.$('#st-lock').value === '1';
      cfg.sectionSubmitRequired = cfg.sectionLock;
      cfg.selectionStrategy = AVUtil.$('#st-strategy').value;
      cfg.retakeMode = AVUtil.$('#st-retake').value;
      cfg.thresholds = { strong: +AVUtil.$('#st-strong').value || 80, average: +AVUtil.$('#st-avg').value || 60 };
      AVUtil.$$('.st-secdur').forEach(inp => {
        const s = cfg.subjects.find(x => x.id === inp.dataset.sid);
        if (s) s.duration = (+inp.value || 20) * 60;
      });
      // advanced JSON (if edited, wins)
      const jtext = AVUtil.$('#st-json').value.trim();
      if (jtext) {
        const parsed = JSON.parse(jtext);
        Object.assign(cfg, parsed);
      }
      cfg.duration = cfg.subjects.reduce((a, s) => a + s.duration, 0);
      await Store.setSetting('config', cfg);
      App.configCache = cfg;
      AVUtil.toast('Configuration saved.');
    } catch (e) {
      AVUtil.toast('Config error: ' + e.message, 'error');
    }
  });

  AVUtil.$('#st-export').addEventListener('click', async () => {
    AVUtil.toast('Preparing backup…');
    const questions = await DB.getAll('questions');
    const tests = await DB.getAll('tests');
    const attempts = await DB.getAll('attempts');
    const backup = {
      app: 'agniveer-cbt', version: 1, exportedAt: new Date().toISOString(),
      questions, tests, attempts, notes: await DB.getAll('notes'),
      meta: { attemptIndex: await Store.getMeta('attemptIndex', []), qstats: await Store.getMeta('qstats', {}), topicStats: await Store.getMeta('topicStats', {}) }
    };
    AVUtil.download(`agniveer-cbt-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup), 'application/json');
  });

  AVUtil.$('#st-reseed').addEventListener('click', async () => {
    const ok = await AVUtil.confirmModal({ title: 'Reload bundled PYQ bank?', body: 'Existing questions are kept; duplicates will be skipped.', yesLabel: 'Reload' });
    if (!ok) return;
    const rep = await Bank.seedIfNeeded(true);
    AVUtil.toast(`Loaded ${rep.imported} questions (${rep.duplicates} duplicates skipped).`);
    Views.settings();
  });

  AVUtil.$('#st-wipe').addEventListener('click', async () => {
    const ok = await AVUtil.confirmModal({
      serious: true,
      title: 'Erase ALL data?',
      body: 'Question bank, tests, attempts and analytics will be permanently deleted from this device.',
      yesLabel: 'Erase Everything', yesClass: 'btn-danger'
    });
    if (!ok) return;
    for (const s of ['questions', 'tests', 'attempts', 'settings', 'meta']) await DB.clear(s);
    AVUtil.toast('All data erased. Reloading…');
    setTimeout(() => location.reload(), 900);
  });
};
