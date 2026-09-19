/* ============================================================
 * VIEW: CBT EXAM SCREEN — the Digialm-style examination
 * interface. All rules enforced by Engine; this file is
 * presentation + persistence only.
 * ============================================================ */

const ExamScreen = {
  attempt: null,
  test: null,
  qmap: {},
  tickHandle: null,
  persistTimer: null,
  paletteOpen: false,

  /* ================= entry ================= */
  async start(testId) {
    // an in-progress attempt for this test? → resume. Else → instructions.
    let attempt = null;
    await DB.cursor('attempts', 'testId', a => {
      if (!a.completed) attempt = a;
    });
    if (!attempt) {
      // completed? go to latest result
      const done = await DB.byIndex('attempts', 'testId_completed', [testId, 1]);
      if (done && done.length) return location.hash = '#/attempt/' + done[done.length - 1].id + '/result';
      AVUtil.toast('Please read the instructions and press "I am ready to begin".');
      return location.hash = '#/test/' + testId + '/instructions';
    }
    if (App.activeAttempt && App.activeAttempt.id !== attempt.id && !App.activeAttempt.completed) {
      return AVUtil.toast('Another exam attempt is active in this tab.', 'error');
    }

    const test = await DB.get('tests', attempt.testId);
    if (!test) { AVUtil.toast('Test missing for this attempt.', 'error'); return Router.go('/dashboard'); }

    this.attempt = attempt;
    this.test = test;
    this.qLang = 'en';          // EN default; हिन्दी unlocks per-question when available
    App.activeAttempt = attempt;
    App.pendingResume = null;

    // load questions for this attempt only
    const ids = Engine.allQuestionIds(attempt);
    const rows = await DB.getMany('questions', ids);
    this.noteMap = {};
    try {
      (await DB.getMany('notes', ids) || []).forEach(n => { if (n && n.qid) this.noteMap[n.qid] = n.text || ''; });
    } catch (e) { /* notes store empty on old DBs */ }
    this.qmap = {};
    rows.forEach(q => { if (q) this.qmap[q.id] = q; });

    // recover: apply expiries that happened while away
    const ff = Engine.fastForward(attempt, test, Date.now());
    Engine.assertValidPosition(attempt);

    if (attempt.completed) {
      await this.finalize('time', true);
      if (ff.changed) AVUtil.toast('Time expired while you were away — the exam was auto-submitted.');
      return;
    }
    if (ff.changed) {
      await this.persist();
      AVUtil.toast('Time expired while you were away — affected sections were auto-submitted.');
    }

    this.render();
    this.startTick();
  },

  /* ================= render ================= */
  render() {
    const a = this.attempt, test = this.test, t = k => App.t(k);
    const cfg = App.configCache || EXAM_CONFIG;
    const sec = Engine.activeSection(a);
    const sid = a.currentSectionId;
    const secName = test.sections.find(s => s.subjectId === sid)?.name || sid;
    const qid = sec.questionIds[a.currentQIdx];
    const q = this.qmap[qid];
    const r = a.responses[qid] || { sel: null, state: 'NOT_VISITED' };
    const gnum = Engine.globalNumber(a, sid, a.currentQIdx);
    const summary = Engine.sectionSummary(a, sid);
    const remaining = Engine.remainingMs(a, test, Date.now()) / 1000;
    const warnCls = remaining <= (cfg.timerCritical || 120) ? 'critical' : (remaining <= (cfg.timerWarning || 300) ? 'warning' : '');
    const isLast = a.currentQIdx === sec.questionIds.length - 1;
    const optOrder = this.optionOrder(qid, q);

    const sectionTabs = test.sections.map(s => {
      const st = a.sections[s.subjectId].state;
      const cls = st === 'ACTIVE' ? 'active' : (st === 'LOCKED' ? 'locked' : 'done');
      const icon = st === 'LOCKED' ? '🔒' : (st === 'SUBMITTED' || st === 'EXPIRED' ? '✓' : '');
      const sub = st === 'EXPIRED' ? ' (time over)' : (st === 'SUBMITTED' ? ' (submitted)' : '');
      return `<button class="subtab ${cls}" data-sid="${s.subjectId}" role="tab"
        aria-selected="${st === 'ACTIVE'}" title="${st === 'ACTIVE' ? s.name : (st === 'LOCKED' ? 'Locked — complete the current section first' : 'Submitted')}">
        ${icon ? `<span class="tab-ic" aria-hidden="true">${icon}</span>` : ''}${AVUtil.esc(s.name.toUpperCase())}<span class="tab-sub">${sub}</span></button>`;
    }).join('');

    const paletteBtns = sec.questionIds.map((pqid, i) => {
      const st = (a.responses[pqid] || { state: 'NOT_VISITED' }).state;
      const cls = { ANSWERED: 'answered', VISITED_NOT_ANSWERED: 'notanswered', NOT_VISITED: 'notvisited', MARKED_FOR_REVIEW: 'marked', ANSWERED_AND_MARKED_FOR_REVIEW: 'ansmarked' }[st] || 'notvisited';
      const gn = Engine.globalNumber(a, sid, i);
      return `<button class="qbtn ${cls} ${i === a.currentQIdx ? 'current' : ''}" data-i="${i}"
        aria-label="Question ${gn} — ${cls}" title="Question ${gn}">${gn}</button>`;
    }).join('');

    const legend = `
      <div class="legend">
        <div class="legend-title">${t('legend')}:</div>
        <div class="legend-row"><button class="qbtn answered" tabindex="-1" aria-hidden="true">5</button> <span>${t('answered')}<span class="lg-count">${summary.answered}</span></span></div>
        <div class="legend-row"><button class="qbtn notanswered" tabindex="-1" aria-hidden="true">6</button> <span>${t('notAnswered')}<span class="lg-count">${summary.notAnswered}</span></span></div>
        <div class="legend-row"><button class="qbtn notvisited" tabindex="-1" aria-hidden="true">7</button> <span>${t('notVisited')}<span class="lg-count">${Math.max(0, summary.total - summary.answered - summary.notAnswered - summary.marked - summary.answeredMarked)}</span></span></div>
        <div class="legend-row"><button class="qbtn marked" tabindex="-1" aria-hidden="true">8</button> <span>${t('markedReview')}<span class="lg-count">${summary.marked}</span></span></div>
        <div class="legend-row"><button class="qbtn ansmarked" tabindex="-1" aria-hidden="true">9</button> <span>${t('answeredMarked')} <em class="small muted">(${t('willBeEvaluated')})</em><span class="lg-count">${summary.answeredMarked}</span></span></div>
      </div>`;

    const candidatePanel = `
      <div class="cand-panel">
        <div class="avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path fill="#b9c6d8" d="M12 12c2.7 0 4.8-2.2 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>
        <div class="cand-info">
          <div class="cand-name">${AVUtil.esc((App.configCache?.candidateName) || 'Practice Candidate')}</div>
          <div class="cand-sub muted small">${AVUtil.esc(test.name)}</div>
        </div>
      </div>`;

    const optionsHtml = optOrder.map(({ letter, orig }) => {
      const o = q.options.find(x => x.id === orig) || { text: '' };
      const selected = r.sel === orig;
      const oText = (this.qLang === 'hi' && o.textHi) ? o.textHi : o.text; // हिन्दी view me option bhi हिन्दी
      return `<label class="opt ${selected ? 'selected' : ''}" data-opt="${orig}">
        <input type="radio" name="opt" value="${orig}" ${selected ? 'checked' : ''} aria-label="Option ${letter}">
        <span class="opt-radio" aria-hidden="true"></span>
        <span class="opt-letter">${letter}</span>
        <span class="opt-text">${AVUtil.qtext(oText)}</span>
      </label>`;
    }).join('');

    const questionBody = `
      <div class="q-head">
        <div class="q-no">
          ${t('questionNo')} ${gnum}<span class="q-of"> / ${sec.questionIds.length}</span>
          <span class="q-marks" title="${AVUtil.esc(secName)} · marking scheme">+${test.marking.correct} · ${test.marking.wrong} · 0</span>
        </div>
        <div class="q-viewin">
          <button class="q-report" id="x-report" title="🚩 Report / Block — ye question hamesha ke liye hat jayega aur turant naya aa jayega" aria-label="Report and block this question">🚩<span class="q-report-lbl">Report</span></button>
          <label class="small muted" for="q-lang">${t('viewIn')}:</label>
          <select id="q-lang" aria-label="View question in">
            <option value="en" ${this.qLang !== 'hi' ? 'selected' : ''}>English</option>
            ${q.questionTextHi
              ? `<option value="hi" ${this.qLang === 'hi' ? 'selected' : ''}>हिन्दी</option>`
              : `<option value="hi" disabled title="No Hindi translation available for this question">हिन्दी</option>`}
          </select>
        </div>
      </div>
      <div class="q-text" id="q-text">${AVUtil.qtext(this.qLang === 'hi' && q.questionTextHi ? q.questionTextHi : q.questionText)}</div>
      ${q.image ? `<div class="q-img-wrap"><img src="${q.image}" alt="Question figure" class="q-img" id="q-img" tabindex="0"></div>` : ''}
      ${q.figureBased ? `<div class="q-note muted small">⚠ This question had figure-based options in the source paper.</div>` : ''}
      <div class="opts" role="radiogroup" aria-label="Answer options">${optionsHtml}</div>
      ${(this.showExplain && r.sel && (q.explanation || q.explanationHi)) ? `<div class="instant-exp"><b>Explanation:</b> ${AVUtil.qtext(this.qLang === 'hi' && q.explanationHi ? q.explanationHi : q.explanation)}</div>` : ''}
      ${this.attempt.mode === 'practice' ? `<div class="qa-note x-note" data-qid="${q.id}">
        <div class="qa-note-head">📝 My Notebook</div>
        <textarea class="note-ta" rows="2" placeholder="Apna solution / trick yahan likho…">${AVUtil.esc(this.noteMap[q.id] || '')}</textarea>
        <div class="qa-note-actions"><button class="btn btn-plain btn-sm" id="x-note-save">💾 Save</button> <span class="note-saved muted small"></span></div>
      </div>` : ''}`;

    const saveLabel = isLast && test.timerMode === 'section' && test.sectionLock ? 'Save &amp; Next → Section End' : t('saveNext');
    const bottomBar = `
      <div class="exam-bottom">
        <button class="xbtn xbtn-prev" id="x-prev" ${a.currentQIdx === 0 && !this.freePrev() ? 'disabled' : ''}>
          <span class="lbl-full">◀ ${t('previous')}</span><span class="lbl-short">◀ ${t('prevShort')}</span></button>
        <button class="xbtn xbtn-clear" id="x-clear"><span class="lbl-full">${t('clearResponse')}</span><span class="lbl-short">${t('clearShort')}</span></button>
        <button class="xbtn xbtn-mark" id="x-mark"><span class="lbl-full">${t('markReviewNext')}</span><span class="lbl-short">${t('markShort')}</span></button>
        <span class="eb-spring" aria-hidden="true"></span>
        <button class="xbtn xbtn-save" id="x-save">${saveLabel}</button>
      </div>`;

    const header = `
      <header class="exam-header">
        <button class="palette-toggle" id="drawer-btn" aria-label="${t('questionPalette')}"><span aria-hidden="true">☰</span></button>
        <img class="eh-logo" src="icons/icon-96.png" alt="Kineora Exam logo">
        <div class="eh-name">
          <div class="eh-exam">${AVUtil.esc(App.configCache?.name || 'Air Force Agniveervayu')}</div>
          <div class="eh-test small muted">${AVUtil.esc(test.name)}</div>
        </div>
        <div class="eh-right">
          <div class="timer ${warnCls}" id="x-timer" role="timer" aria-live="off">
            <span class="timer-lbl">${t('timeLeft')}</span>
            <span class="timer-val" id="x-timer-val">${AVUtil.fmtTime(remaining)}</span>
          </div>
          <button class="xbtn xbtn-ghost icon-only" id="x-pause" title="Pause — timer ruk jaayega" aria-label="Pause">⏸</button>
          <button class="xbtn xbtn-ghost" id="x-instructions" title="${t('instructions')}"><span aria-hidden="true">📄</span><span class="ilbl">${t('instructions')}</span></button>
          <button class="xbtn xbtn-submit" id="x-submit" title="Submit anytime — koi restriction nahi. Confirmation milegi.">${test.timerMode === 'section' ? t('submitSection').toUpperCase() : t('submitTest').toUpperCase()}</button>
        </div>
      </header>`;

    const sectionBar = `
      <div class="subtabs" role="tablist" aria-label="Subjects">${sectionTabs}</div>`;

    const rightPanel = `
      <aside class="palette-panel" id="palette-panel">
        <button class="pal-close" id="pal-close" aria-label="Close palette">✕</button>
        ${candidatePanel}
        ${legend}
        <div class="palette-head">${AVUtil.esc(secName)} <span class="muted small">· ${sec.questionIds.length}</span></div>
        <div class="palette-grid">${paletteBtns}</div>
        <button class="xbtn xbtn-ghost pal-instructions" id="pal-instructions">📄 ${t('instructions')}</button>
      </aside>`;

    document.getElementById('app').innerHTML = `
      <div class="cbt exam-screen" data-view="${a.view}">
        ${header}
        ${sectionBar}
        <div class="exam-main">
          <div class="exam-question-area">
            ${a.view === 'question' ? `
              <div class="q-scroll" id="q-scroll">${questionBody}</div>
              ${bottomBar}`
            : this.sectionEndHtml(summary, secName, remaining)}
          </div>
          ${rightPanel}
        </div>
      </div>
      <div class="drawer-veil" id="drawer-veil" hidden></div>`;

    this.bindCommon();
    if (a.view === 'question') this.bindQuestion();
    else this.bindSectionEnd();
  },

  /* ---------- section-end screen ---------- */
  sectionEndHtml(summary, secName, remaining) {
    const t = k => App.t(k);
    return `
      <div class="sec-end">
        <h2 class="se-title">${t('sectionComplete')}</h2>
        <div class="se-sub">${AVUtil.esc(secName)} — ${t('endOf')} ${AVUtil.esc(secName)}</div>
        <table class="se-tbl">
          <tr><td>${t('answered')}</td><td><b>${summary.answered}</b> / ${summary.total}</td></tr>
          <tr><td>${t('notAnswered')}</td><td><b>${summary.notAnswered}</b> / ${summary.total}</td></tr>
          <tr><td>${t('markedReview')}</td><td><b>${summary.marked}</b></td></tr>
          <tr><td>${t('answeredMarked')}</td><td><b>${summary.answeredMarked}</b></td></tr>
          <tr><td>${t('timeLeft')}</td><td><b>${AVUtil.fmtTime(remaining)}</b></td></tr>
        </table>
        <p class="se-warn">${t('unansweredZero')}</p>
        <div class="se-actions">
          <button class="xbtn xbtn-plain" id="se-back">← ${t('backToQuestions')}</button>
          <button class="xbtn xbtn-submit" id="se-submit">${t('submitSection').toUpperCase()}</button>
        </div>
      </div>`;
  },

  /* ================= view binding ================= */
  bindCommon() {
    document.body.classList.add('exam-on'); // hides site footer + chat during the exam
    document.body.classList.add('cbt-on');  // + bottom tab bar
    const a = this.attempt;
    // submit (header — always available, with confirmation)
    const subBtn = AVUtil.$('#x-submit');
    if (subBtn) subBtn.addEventListener('click', () => this.confirmSubmit());
    // subject tabs
    AVUtil.$$('.subtab').forEach(tab => tab.addEventListener('click', async () => {
      const sid = tab.dataset.sid;
      const chk = Engine.canOpenSection(a, sid);
      if (!chk.ok) {
        if (chk.reason === 'locked') AVUtil.toast('Complete the current section before proceeding.', 'warn');
        else if (chk.reason === 'submitted') AVUtil.toast('This section has been submitted and is locked.', 'warn');
        return;
      }
      if (sid !== a.currentSectionId) {
        Engine.gotoSection(a, sid, Date.now());
        await this.persist();
        this.render();
      }
    }));
    // palette
    AVUtil.$$('.qbtn[data-i]').forEach(b => b.addEventListener('click', async () => {
      const i = +b.dataset.i;
      await this.navTo(i);
    }));
    // instructions modal
    AVUtil.$('#x-instructions')?.addEventListener('click', () => this.instructionsModal());
    // pause (practice)
    AVUtil.$('#x-pause')?.addEventListener('click', () => this.togglePause());
    // drawer (mobile)
    AVUtil.$('#drawer-btn')?.addEventListener('click', () => this.openDrawer());
    AVUtil.$('#drawer-veil')?.addEventListener('click', () => this.closeDrawer());
    AVUtil.$('#pal-close')?.addEventListener('click', () => this.closeDrawer());
    AVUtil.$('#pal-instructions')?.addEventListener('click', () => { this.closeDrawer(); this.instructionsModal(); });
    // image zoom
    const img = AVUtil.$('#q-img');
    if (img) img.addEventListener('click', () => this.lightbox(img.src));
  },

  bindQuestion() {
    const a = this.attempt, test = this.test;
    const sec = Engine.activeSection(a);
    const qid = sec.questionIds[a.currentQIdx];

    // option select
    AVUtil.$$('.opt').forEach(label => label.addEventListener('click', async e => {
      if (e.target.tagName === 'INPUT' || label.classList.contains('selected')) {
        // allow re-click on label; input change handles it
      }
      const input = label.querySelector('input');
      if (!input.checked) { input.checked = true; }
      await this.select(input.value);
    }));

    // language switch (EN ⇄ HI, per question availability)
    const langSel = AVUtil.$('#q-lang');
    if (langSel) langSel.addEventListener('change', async e => {
      this.qLang = e.target.value === 'hi' ? 'hi' : 'en';
      await this.persist();
      this.render();
    });

    // report / block this question (swapped for a fresh one instantly)
    AVUtil.$('#x-report')?.addEventListener('click', () => this.blockCurrent());

    // bottom buttons
    AVUtil.$('#x-save').addEventListener('click', () => this.saveNext());
    AVUtil.$('#x-mark').addEventListener('click', () => this.markNext());
    // notebook save (practice mode)
    const noteBtn = AVUtil.$('#x-note-save');
    if (noteBtn) noteBtn.addEventListener('click', async () => {
      const wrap = noteBtn.closest('.qa-note');
      const qid = wrap.dataset.qid;
      const text = wrap.querySelector('.note-ta').value.trim();
      this.noteMap[qid] = text;
      await DB.put('notes', { qid, text, updatedAt: Date.now() });
      wrap.querySelector('.note-saved').textContent = 'Saved ✓';
      AVUtil.toast('Note saved', 'success');
    });
    AVUtil.$('#x-clear').addEventListener('click', async () => {
      Engine.clearResponse(a, qid);
      await this.persist();
      this.render();
    });
    AVUtil.$('#x-prev').addEventListener('click', () => this.previous());

    // keyboard navigation
    this.keyHandler = async e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (document.querySelector('.av-modal-overlay')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.saveNextNavOnly(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.previous(); }
      else if (['1', '2', '3', '4'].includes(e.key)) {
        const opts = AVUtil.$$('.opt');
        const idx = +e.key - 1;
        if (opts[idx]) { const inp = opts[idx].querySelector('input'); inp.checked = true; await this.select(inp.value); }
      }
    };
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    document.addEventListener('keydown', this.keyHandler);
    AVUtil.$('#q-scroll').scrollTop = 0;
    AVUtil.$('#q-scroll').focus?.();
  },

  bindSectionEnd() {
    const a = this.attempt;
    AVUtil.$('#se-back').addEventListener('click', async () => {
      a.view = 'question';
      await this.persist();
      this.render();
    });
    AVUtil.$('#se-submit').addEventListener('click', () => this.confirmSubmit());
    this.keyHandler = e => {
      if (e.key === 'Enter' && !document.querySelector('.av-modal-overlay')) this.confirmSubmit();
    };
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    document.addEventListener('keydown', this.keyHandler);
  },

  /* ================= actions ================= */
  async select(origId) {
    const a = this.attempt;
    const sec = Engine.activeSection(a);
    const qid = sec.questionIds[a.currentQIdx];
    Engine.selectOption(a, qid, origId);
    await this.persist();
    // light re-render (keep scroll) — update option styles + palette + counts
    this.render();
  },

  async navTo(idx) {
    const a = this.attempt;
    Engine.gotoQuestion(a, a.currentSectionId, idx, Date.now());
    await this.persist();
    this.closeDrawer();
    this.render();
  },

  async saveNext() {
    const a = this.attempt;
    const before = a.currentQIdx;
    Engine.saveNext(a, Date.now());
    await this.persist();
    this.render();
    void before;
  },

  async saveNextNavOnly() {
    // arrow-right: move next without altering answer state
    const a = this.attempt;
    const sec = Engine.activeSection(a);
    if (a.view !== 'question') return;
    if (a.currentQIdx < sec.questionIds.length - 1) return this.navTo(a.currentQIdx + 1);
    const target = { section: a.sectionOrder.indexOf(a.currentSectionId) + 1 < a.sectionOrder.length && this.test.timerMode !== 'section' };
    if (target.section) {
      const nextSid = a.sectionOrder[a.sectionOrder.indexOf(a.currentSectionId) + 1];
      if (a.sections[nextSid].state === 'ACTIVE') { Engine.gotoSection(a, nextSid); await this.persist(); this.render(); return; }
    }
    if (this.test.timerMode === 'section' && this.test.sectionLock) { a.view = 'section-end'; await this.persist(); this.render(); }
  },

  async markNext() {
    const a = this.attempt;
    Engine.markReviewNext(a, Date.now());
    await this.persist();
    this.render();
  },

  async previous() {
    const a = this.attempt;
    if (a.view === 'section-end') { a.view = 'question'; await this.persist(); return this.render(); }
    const res = Engine.previous(a, Date.now());
    if (res.ok) { await this.persist(); this.render(); }
  },

  /* ---------- report / block current question ---------- */
  async blockCurrent() {
    const a = this.attempt, test = this.test;
    if (!a || a.completed || a.view !== 'question' || a.pauseStarted) return;
    const sec = Engine.activeSection(a);
    const qid = sec.questionIds[a.currentQIdx];
    const q = this.qmap[qid];
    if (!q) return;
    const snippet = AVUtil.esc((q.questionText || '').replace(/\s+/g, ' ').slice(0, 120));
    const ok = await AVUtil.confirmModal({
      serious: true,
      title: '🚩 Block this question?',
      html: `<p class="q-report-snip">“${snippet}${(q.questionText || '').length > 120 ? '…' : ''}”</p>
        <p class="se-warn">Ye question <b>hamesha ke liye block</b> ho jayega — aane wale kisi test me nahi aayega. Iski jagah <b>turant naya question</b> aa jayega.</p>`,
      yesLabel: '🚩 BLOCK KAR DO', noLabel: 'Cancel', yesClass: 'btn-danger'
    });
    if (!ok) return;

    await Generator.blockQuestion(q);
    const info = await Generator.blockedInfo();
    const inUseIds = new Set(Engine.allQuestionIds(a));
    const inUseHashes = new Set();
    Object.values(this.qmap).forEach(x => { if (x && x.dupeHash) inUseHashes.add(x.dupeHash); });

    let swapped = 0, starved = 0;
    for (const sid of a.sectionOrder) {
      const s = a.sections[sid];
      if (s.state !== 'ACTIVE') continue;               // submitted sections are history
      for (let i = 0; i < s.questionIds.length; i++) {
        const oid = s.questionIds[i];
        const oq = this.qmap[oid];
        if (!info.ids.has(oid) && !(oq && oq.dupeHash && info.hashes.has(oq.dupeHash))) continue;
        const rep = await Generator.findReplacement({ subjectId: sid, chapter: oq && oq.chapter, excludeIds: inUseIds, excludeHashes: inUseHashes });
        if (!rep) { starved++; continue; }              // bank exhausted — old stays for this paper only
        delete a.responses[oid];                        // fresh slate for the new question
        try { await DB.delete('notes', oid); } catch (e) { /* notes store may be empty */ }
        s.questionIds[i] = rep.id;
        a.responses[rep.id] = { sel: null, state: 'NOT_VISITED', timeSpent: 0, visits: 0 };
        inUseIds.add(rep.id);
        if (rep.dupeHash) inUseHashes.add(rep.dupeHash);
        this.qmap[rep.id] = rep;
        swapped++;
      }
    }
    // the question on screen right now → mark as seen
    Engine.touch(a, sec.questionIds[a.currentQIdx], Date.now());
    Engine.assertValidPosition(a);
    await this.persist();
    this.render();
    if (swapped) AVUtil.toast(`Blocked ✓ — ${swapped === 1 ? 'naya question' : swapped + ' naye questions'} aa gaya${starved ? ` (${starved} purana is test me reh gaya — subject ka pool khatam)` : ''}.`, 'success');
    else AVUtil.toast('Blocked for future tests — par is subject ke aur questions bank me nahi bache, isliye ye is test me raha.', 'warn');
  },

  freePrev() {
    const a = this.attempt;
    return a.timerMode !== 'section' && a.sectionOrder.some((sid, i) => i < a.sectionOrder.indexOf(a.currentSectionId) && a.sections[sid].state === 'ACTIVE');
  },

  /* ---------- submit flows ---------- */
  async confirmSubmit() {
    const a = this.attempt, test = this.test;
    if (test.sectionLock && test.timerMode === 'section') {
      const sid = a.currentSectionId;
      const s = Engine.sectionSummary(a, sid);
      const secName = test.sections.find(x => x.subjectId === sid)?.name || sid;
      const isLastSection = a.sectionOrder.indexOf(sid) === a.sectionOrder.length - 1;
      const ok = await AVUtil.confirmModal({
        serious: true,
        title: App.t('submitConfirm'),
        html: `<table class="confirm-tbl">
            <tr><td>Section:</td><td><b>${AVUtil.esc(secName)}</b></td></tr>
            <tr><td>Answered:</td><td><b>${s.answered}</b> of ${s.total}</td></tr>
            <tr><td>Not Answered:</td><td><b>${s.notAnswered}</b></td></tr>
            <tr><td>Marked for Review:</td><td><b>${s.marked}</b></td></tr>
            <tr><td>Answered &amp; Marked for Review:</td><td><b>${s.answeredMarked}</b></td></tr>
          </table>
          <p class="se-warn">${App.t('unansweredZero')}</p>
          <p class="se-warn"><b>${App.t('afterSubmit')}</b></p>
          ${isLastSection ? '<p class="se-warn">This is the final section — submitting it ends the examination.</p>' : ''}`,
        yesLabel: App.t('submitSection').toUpperCase(), noLabel: App.t('cancel'), yesClass: 'btn-danger'
      });
      if (!ok) return;
      const res = Engine.submitSection(a, test, sid, 'user', Date.now());
      await this.persist();
      if (res.finished) return this.finalize('user');
      AVUtil.toast(`${secName} submitted — ${test.sections.find(x => x.subjectId === res.nextSid)?.name} unlocked.`);
      this.render();
    } else {
      // global submit
      const totals = { answered: 0, notAnswered: 0, marked: 0 };
      a.sectionOrder.forEach(sid => {
        const s = Engine.sectionSummary(a, sid);
        totals.answered += s.answered; totals.notAnswered += s.notAnswered; totals.marked += s.marked + s.answeredMarked;
      });
      const ok = await AVUtil.confirmModal({
        serious: true,
        title: 'Are you sure you want to submit the test?',
        html: `<table class="confirm-tbl">
            <tr><td>Attempted:</td><td><b>${totals.answered}</b></td></tr>
            <tr><td>Not Attempted:</td><td><b>${totals.notAnswered}</b></td></tr>
            <tr><td>Marked for Review:</td><td><b>${totals.marked}</b></td></tr>
          </table>
          <p class="se-warn">Once submitted, the test cannot be reopened.</p>`,
        yesLabel: App.t('submitTest').toUpperCase(), noLabel: App.t('cancel'), yesClass: 'btn-danger'
      });
      if (!ok) return;
      Engine.submitExam(a, test, 'user', Date.now());
      await this.persist();
      return this.finalize('user');
    }
  },

  /* ---------- timer ---------- */
  startTick() {
    this.stopTick();
    this.tickHandle = setInterval(() => this.tick(), 500);
  },
  stopTick() {
    // NOTE: only stops the timer — the keyboard handler is owned by bind()/teardown,
    // removing it here would kill keyboard nav on every re-render.
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
  },
  teardown() {
    // full cleanup when leaving the exam view mid-attempt
    this.stopTick();
    document.body.classList.remove('exam-on');
    document.body.classList.remove('cbt-on');
    if (this.keyHandler) { document.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
  },

  async tick() {
    const a = this.attempt, test = this.test;
    if (!a || a.completed) return this.stopTick();
    const cfg = App.configCache || EXAM_CONFIG;
    const now = Date.now();
    const remainMs = Engine.remainingMs(a, test, now);

    // heartbeat time accumulation + persistence every ~5 s
    if (!a.pauseStarted && now - (a.heartbeatAt || 0) > 5000) {
      Engine.accumulateTime(a, now);
      await this.persist();
    }

    const timerVal = AVUtil.$('#x-timer-val');
    const timerBox = AVUtil.$('#x-timer');
    if (timerVal) timerVal.textContent = AVUtil.fmtTime(remainMs / 1000);
    if (timerBox) {
      const s = remainMs / 1000;
      timerBox.classList.toggle('critical', s <= (cfg.timerCritical || 120));
      timerBox.classList.toggle('warning', s > (cfg.timerCritical || 120) && s <= (cfg.timerWarning || 300));
    }

    if (remainMs <= 0 && !a.pauseStarted) {
      // expiry
      if (test.timerMode === 'section') {
        const sid = a.currentSectionId;
        const secName = test.sections.find(x => x.subjectId === sid)?.name || sid;
        const res = Engine.submitSection(a, test, sid, 'expired', now);
        await this.persist();
        if (res.finished) {
          AVUtil.toast(`${secName} time is over — the examination has been submitted automatically.`);
          return this.finalize('time');
        }
        AVUtil.toast(`${secName} time is over — section submitted automatically. Next section unlocked.`);
        this.render();
      } else {
        Engine.submitExam(a, test, 'expired', now);
        await this.persist();
        AVUtil.toast('Time is over — the test has been submitted automatically.');
        return this.finalize('time');
      }
    }
  },

  /* ---------- pause (all modes — timer freezes, no data lost) ---------- */
  async togglePause() {
    const a = this.attempt;
    if (a.pauseStarted) {
      Engine.resume(a, Date.now());
      AVUtil.$('#pause-veil')?.remove();
    } else {
      Engine.pause(a, Date.now());
      const veil = AVUtil.el('div', { id: 'pause-veil', class: 'pause-veil' });
      veil.innerHTML = `<div class="pause-box"><h2>Exam Paused</h2><p>The timer is stopped${a.timerMode === 'section' ? ' — section time bhi freeze hai' : ''}. Jab ready ho, resume kar do.</p><button class="xbtn xbtn-save" id="pause-resume">RESUME EXAM</button></div>`;
      document.body.appendChild(veil);
      veil.querySelector('#pause-resume').addEventListener('click', () => this.togglePause());
    }
    await this.persist();
  },

  /* ---------- persistence ---------- */
  async persist() {
    if (!this.attempt) return;
    this.attempt.heartbeatAt = Date.now();
    try { await DB.put('attempts', this.attempt); } catch (e) { console.error('persist failed', e); }
  },

  /* ---------- finalize + result ---------- */
  async finalize(reason, silent) {
    const a = this.attempt, test = this.test;
    this.stopTick();
    document.body.classList.remove('exam-on');
    document.body.classList.remove('cbt-on');
    Engine.accumulateTime(a, Date.now());
    if (!a.completed) {
      if (test.timerMode === 'section' && !Engine.activeSection(a)) Engine.submitExam(a, test, reason, Date.now());
      else Engine.submitExam(a, test, reason, Date.now());
    }
    a.result = Engine.evaluate(a, this.qmap);

    // attempt summary index (lightweight — powers dashboards)
    const subjectStats = {}, subjectNames = {};
    test.sections.forEach(s => {
      const st = a.result.subjects[s.subjectId] || {};
      subjectStats[s.subjectId] = { correct: st.correct || 0, wrong: st.wrong || 0, unattempted: st.unattempted || 0, total: st.total || 0 };
      subjectNames[s.subjectId] = s.name;
    });
    await DB.put('attempts', a);
    const idx = await Store.getMeta('attemptIndex', []);
    idx.push({
      id: a.id, testId: a.testId, testName: a.testName, testType: a.testType,
      attemptNo: a.attemptNo, date: a.endTime || Date.now(),
      score: a.result.score, maxScore: a.result.maxScore,
      correct: a.result.correct, wrong: a.result.wrong, unattempted: a.result.unattempted,
      accuracy: a.result.accuracy, timeTaken: a.result.timeTaken, total: a.result.total,
      subjectStats, subjectNames
    });
    await Store.setMeta('attemptIndex', idx);
    await StatsUpdator.record(a, this.qmap);

    App.activeAttempt = null;
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    if (!silent) {
      this.renderComplete();
    } else {
      location.hash = '#/attempt/' + a.id + '/result';
    }
  },

  renderComplete() {
    const a = this.attempt, res = a.result;
    document.getElementById('app').innerHTML = `
      <div class="cbt exam-complete-screen">
        <div class="ec-box">
          <div class="ec-check" aria-hidden="true">✓</div>
          <h1>${App.t('examCompleted')}</h1>
          <p class="muted">${AVUtil.esc(a.testName)} — Attempt #${a.attemptNo}</p>
          <table class="se-tbl ec-tbl">
            <tr><td>Score</td><td><b>${res.score}</b> / ${res.maxScore}</td></tr>
            <tr><td>Correct</td><td><b>${res.correct}</b></td></tr>
            <tr><td>Wrong</td><td><b>${res.wrong}</b></td></tr>
            <tr><td>Unattempted</td><td><b>${res.unattempted}</b></td></tr>
            <tr><td>Negative Marks</td><td><b>−${res.negative}</b></td></tr>
            <tr><td>Accuracy</td><td><b>${res.accuracy}%</b></td></tr>
            <tr><td>Time Used</td><td><b>${AVUtil.fmtDur(res.timeTaken)}</b></td></tr>
          </table>
          <div class="se-actions">
            <a class="xbtn xbtn-save" href="#/attempt/${a.id}/result">VIEW RESULT</a>
            <a class="xbtn xbtn-plain" href="#/attempt/${a.id}/analysis">VIEW ANALYSIS</a>
            <a class="xbtn xbtn-plain" href="#/test/${a.testId}/instructions">REATTEMPT</a>
            <a class="xbtn xbtn-plain" href="#/dashboard">BACK TO DASHBOARD</a>
          </div>
        </div>
      </div>`;
  },

  /* ---------- helpers ---------- */
  optionOrder(qid, q) {
    if (!q) return [];
    const letters = ['A', 'B', 'C', 'D'];
    let order = q.options.map((o, i) => ({ letter: letters[i], orig: o.id }));
    if (this.test.shuffleOptions) {
      const rng = AVUtil.seeded(this.attempt.id + '::' + qid);
      order = AVUtil.shuffle(order, rng);
      order = order.map((x, i) => ({ letter: letters[i], orig: x.orig }));
    }
    return order;
  },

  openDrawer() {
    const p = AVUtil.$('#palette-panel');
    const veil = AVUtil.$('#drawer-veil');
    if (!p || !veil) return;
    p.classList.add('open');
    veil.hidden = false;
    document.body.classList.add('drawer-open');
  },
  closeDrawer() {
    const p = AVUtil.$('#palette-panel');
    const veil = AVUtil.$('#drawer-veil');
    document.body.classList.remove('drawer-open');
    if (p) p.classList.remove('open');
    if (veil) veil.hidden = true;
  },

  instructionsModal() {
    const a = this.attempt, test = this.test;
    const ov = AVUtil.el('div', { class: 'av-modal-overlay' });
    ov.innerHTML = `<div class="av-modal ins-modal">
      <div class="av-modal-title">Instructions</div>
      <div class="av-modal-body ins-scroll">
        <ul class="ins-mini">
          <li><b>${Math.round(test.duration / 60)} minutes</b> total${test.timerMode === 'section' ? ' — section-wise: ' + test.sections.map(s => `${s.name} ${Math.round(s.duration / 60)} min`).join(', ') : ''}.</li>
          <li>${test.totalQuestions} questions · +${test.marking.correct} / ${test.marking.wrong} / 0 marking.</li>
          <li>Select an option, then <b>SAVE &amp; NEXT</b>. Use <b>MARK FOR REVIEW &amp; NEXT</b> to flag questions.</li>
          <li><b>Answered &amp; Marked for Review</b> questions ARE evaluated.</li>
          <li><b>CLEAR RESPONSE</b> removes your answer.</li>
          ${test.sectionLock ? '<li>Sections are locked in order. Submit the current section to unlock the next. Submitted sections cannot be reopened.</li>' : '<li>You can navigate freely between sections.</li>'}
          <li>At 00:00 the section/test is submitted automatically.</li>
          <li>Arrow keys: next / previous. Keys 1–4 select options.</li>
        </ul>
      </div>
      <div class="av-modal-actions"><button class="btn btn-primary" data-close>Close</button></div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  },

  lightbox(src) {
    const ov = AVUtil.el('div', { class: 'av-modal-overlay lightbox', role: 'dialog', 'aria-label': 'Image zoom' });
    ov.innerHTML = `<img src="${AVUtil.esc(src)}" alt="Zoomed question figure">`;
    document.body.appendChild(ov);
    ov.addEventListener('click', () => ov.remove());
  }
};

Views.attempt = function (testId) { return ExamScreen.start(testId); };
