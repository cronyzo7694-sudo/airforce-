/* ============================================================
 * VIEW: INSTRUCTIONS — Digialm-style pre-exam screen.
 * Timer does NOT start until "I am ready to begin".
 * ============================================================ */

Views.instructions = async function (testId) {
  const test = await DB.get('tests', testId);
  if (!test) { AVUtil.toast('Test not found', 'error'); return Router.go('/tests'); }
  const cfg = await App.config();
  App.clearNav();   /* v1.4.44: cbt full-screen — site-nav hatao */
  const lang = App.lang;

  // retake question-set policy
  const prevAttempts = (await DB.byIndex('attempts', 'testId', test.id));
  const attemptNo = prevAttempts.length + 1;
  const retakeMode = cfg.retakeMode || 'same';
  let freshSets = null;
  if (prevAttempts.length && retakeMode === 'fresh') {
    // pre-generate a fresh question set for this attempt (same blueprint)
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, topicAcc: {} });
    freshSets = {};
    for (const sec of (test.sections || [])) {   /* v1.4.44: legacy-safe */
      const pool = await Generator.poolFor({ subjectId: sec.subjectId, chapters: sec.chapters, topics: sec.topics, difficulty: sec.difficulty }, qstats);
      const picked = Generator.pick(pool, sec.questionIds.length, test.strategy || cfg.selectionStrategy, qstats);
      if (picked) freshSets[sec.subjectId] = picked.map(q => q.id);
    }
  }

  const secs = test.sections || [];
  if (!secs.length) {   /* v1.4.44: bina sections ka purana/corrupt test — crash nahi */
    AVUtil.toast('Ye test purane format ka hai — dobara bana lo.', 'error');
    return Router.go('/tests');
  }
  const total = test.totalQuestions;
  const mk = test.marking;

  /* ══════════ STAGE 1 — CANDIDATE LOGIN (real C-DAC exam center feel) ══════════ */
  if (!sessionStorage.getItem('examLogin_' + test.id)) {
    let roll = cfg.rollNumber;
    if (!roll) {
      roll = 'AV' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
      cfg.rollNumber = roll;
      await App.persistConfig(cfg);   /* v1.4.46: exam-aware save */
      App.configCache = cfg;
    }
    const photo = cfg.profileImage
      ? `<img src="${AVUtil.esc(cfg.profileImage)}" alt="Candidate photo">`
      : `<span class="cl-ph-initial">${AVUtil.esc((cfg.candidateName || 'P').trim()[0] || 'P').toUpperCase()}</span>`;
    /* v1.4.49: REAL CBT examination portal look — blue header / grey candidate
       info bar (System Name · Candidate Name · photo) / chhota Login form /
       Version footer. Flow/auth/data bilkul same. */
    const examTitle = (cfg.exam === 'ssc-chsl')
      ? 'SSC CHSL (Tier-I) — ONLINE EXAMINATION'
      : AVUtil.esc(cfg.name || 'AIR FORCE AGNIVEERVAYU') + ' — ONLINE EXAMINATION';
    const icoUser = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#555" stroke-width="2"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.6 4.2-5.2 7.5-5.2s6.1 1.6 7.5 5.2"/></svg>';
    const icoLock = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#555" stroke-width="2"><rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
    const icoKb = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#555" stroke-width="1.8"><rect x="3" y="6.5" width="18" height="11" rx="1.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>';
    document.getElementById('app').innerHTML = `
      <div class="cbt cbt-login">
        <div class="cl-band">
          <div class="cl-band-left"><img src="icons/icon-96.png" alt="" class="cl-band-logo"><span>${examTitle}</span></div>
          <div class="cl-band-right">PHASE I : ONLINE TEST</div>
        </div>

        <div class="cg-bar">
          <div class="cg-bar-row">
            <div class="cg-left">
              <div class="cg-lbl">System Name :</div>
              <div class="cg-yellow">C001</div>
            </div>
            <div class="cg-mid">
              <div class="cg-lbl">Candidate Name :</div>
              <div class="cg-yellow cg-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
              <div class="cg-sub">Subject : <span class="cg-yellow-sm">Mock Exam</span></div>
            </div>
            <div class="cg-photo">${photo}</div>
          </div>
          <div class="cg-disc">Kindly contact the invigilator if there are any discrepancies in the Name and Photograph displayed on the screen or if the photograph is not yours</div>
        </div>

        <div class="cl-wrap">
          <div class="cl-card clg-box">
            <div class="clg-title">Login</div>
            <div class="clg-form">
              <div class="clg-row">
                <span class="clg-ico">${icoUser}</span>
                <input type="text" class="clg-inp" value="${AVUtil.esc(roll)}" readonly aria-readonly="true" aria-label="User ID">
                <span class="clg-ico clg-kb">${icoKb}</span>
              </div>
              <div class="clg-row">
                <span class="clg-ico">${icoLock}</span>
                <input type="password" class="clg-inp" value="agniveer@${AVUtil.esc(roll.slice(-4))}" readonly aria-readonly="true" aria-label="Password">
                <span class="clg-ico clg-kb">${icoKb}</span>
              </div>
              <button class="btn-begin clg-signin" id="login-btn">Sign In</button>
            </div>
          </div>
          <a class="bt-backlink clg-back" href="#/dashboard">← Back to Dashboard</a>
        </div>

        <div class="cl-foot">Version 17.05.21</div>
      </div>`;
    window.scrollTo(0, 0);
    document.body.classList.add('cbt-on');
    AVUtil.$('#login-btn').addEventListener('click', () => {
      const b = AVUtil.$('#login-btn');
      b.disabled = true; b.textContent = 'SIGNING IN…';
      sessionStorage.setItem('examLogin_' + test.id, '1');
      setTimeout(() => Views.instructions(testId), 450);
    });
    return;
  }

  const rules = [
    `<b>Duration of the examination: ${Math.round(test.duration / 60)} minutes.</b> The clock is set at the server — the countdown timer at the top right corner of the screen will display the remaining time available. ${test.timerMode === 'section'
      ? `Section-wise timing: ${secs.map(s => `${s.name} ${Math.round(s.duration / 60)} min`).join(' · ')}. When a section's time expires, it is submitted automatically and the next section starts with its full time — leftover time is <b>not</b> carried forward.`
      : `When the timer reaches zero, the examination will end by itself.`}`,
    `The <b>Question Palette</b> displayed on the right side of the screen will show the status of each question using one of the following symbols:
      <span class="pal-demo"><button class="qbtn answered" tabindex="-1">1</button> Answered</span>
      <span class="pal-demo"><button class="qbtn notanswered" tabindex="-1">2</button> Not Answered</span>
      <span class="pal-demo"><button class="qbtn notvisited" tabindex="-1">3</button> Not Visited</span>
      <span class="pal-demo"><button class="qbtn marked" tabindex="-1">4</button> Marked for Review</span>
      <span class="pal-demo"><button class="qbtn ansmarked" tabindex="-1">5</button> Answered &amp; Marked for Review — <b>will be considered for evaluation</b></span>`,
    `To answer a question, click the option button of your choice. To <b>save</b> your answer, you <b>MUST</b> click on the <b>SAVE &amp; NEXT</b> button.`,
    `To change your chosen answer, click the button of another option. To deselect your chosen answer, click on <b>CLEAR RESPONSE</b>.`,
    `To mark a question for review, click on <b>MARK FOR REVIEW &amp; NEXT</b>. If an answer is selected for a question that is Marked for Review, that answer <b>will be considered in the evaluation</b>.`,
    test.sectionLock
      ? `Sections in this paper are <b>locked in order</b>: ${secs.map(s => AVUtil.esc(s.name)).join(' → ')}. You cannot move to the next section until you submit the current section. A submitted section cannot be re-opened.`
      : `You may shuffle between sections and questions anytime during the examination by clicking the subject names on the top bar.`,
    `Marking pattern — <b>+${mk.correct}</b> mark for each correct answer, <b>${mk.wrong}</b> mark deducted for each wrong answer, <b>0</b> for unattempted questions. Maximum marks: <b>${test.maxScore}</b>.`,
    `Questions will be displayed in the language chosen below (bilingual — English &amp; हिन्दी, except English subject). Where content is available in only one language, it will be displayed in that language.`,
    `You may submit the paper anytime by clicking the <b>SUBMIT</b> button — a confirmation is always shown first. ${test.sectionLock ? 'The examination ends when the last section is submitted.' : 'You may return to the paper from the confirmation dialog.'}`,
    `Do not click any unnecessary button on the computer and do not close or refresh the browser — in case of any interruption, your attempt is preserved and can be resumed from the same point.`
  ];

  const practiceExtras = `
      <details class="ins-extras">
        <summary>🧰 Practice-mode extras (real exam me NAHI milte)</summary>
        <ul>
          <li><b>Auto-save:</b> selections are saved instantly — a refresh never loses your work.</li>
          <li><b>Pause (⏸):</b> exam timer ko rok sakte ho, wahi se resume hota hai.</li>
          <li><b>Keyboard:</b> arrow keys navigation, 1–4 se option select.</li>
          <li><b>Report (🚩):</b> galat/questionable question turant block + fresh replacement.</li>
          <li><b>My Notebook (practice tests):</b> har question pe apna note likho.</li>
        </ul>
      </details>`;

  document.getElementById('app').innerHTML = `
    <div class="cbt cbt-instructions">
      <header class="ins-header">
        <div class="ins-exam"><a class="bt-backlink ins-back-top" href="#/test/${AVUtil.esc(test.id)}">← Back</a> ${AVUtil.esc(cfg.name)} — ${AVUtil.esc(test.mode === 'exam' ? 'Computer Based Test' : 'Practice Test')}</div>
        <div class="ins-test">${AVUtil.esc(test.name)}</div>
      </header>
      <div class="ins-body">
        <div class="ins-left">
          <h2 class="ins-title">INSTRUCTIONS TO CANDIDATES</h2>
          <ol class="ins-rules">
            ${rules.map(r => `<li>${r}</li>`).join('')}
          </ol>
          <div class="ins-gen">
            <b>General Instructions:</b>
            <ul>
              <li>The total number of questions in this test is <b>${total}</b>.</li>
              <li>Every question has four options and exactly <b>one</b> correct answer.</li>
              <li>Unattempted questions receive <b>0 marks</b>.</li>
              <li>${test.sectionLock ? 'Section order: <b>' + secs.map(s => AVUtil.esc(s.name)).join(' → ') + '</b>.' : 'Free navigation between sections is allowed.'}</li>
              <li>Do not refresh or close the browser during the examination — your attempt is preserved and can be resumed.</li>
              <li>The question paper is the property of the examination conducting authority — copying / recording any part of it is prohibited.</li>
            </ul>
          </div>
          ${practiceExtras}
        </div>
        <aside class="ins-right">
          <div class="ins-panel">
            <div class="ins-cand">
              <div class="nav-avatar nav-avatar-lg ins-cand-photo" aria-hidden="true">
                ${cfg.profileImage ? `<img src="${AVUtil.esc(cfg.profileImage)}" alt="Candidate photo">` : AVUtil.esc((cfg.candidateName || 'P').trim()[0] || 'P').toUpperCase()}
              </div>
              <div>
                <div class="ins-cand-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
                <div class="muted small">Roll No: <b>${AVUtil.esc(cfg.rollNumber || '—')}</b> · ${AVUtil.esc(test.name)}</div>
                <div class="muted small">Attempt #${attemptNo}</div>
              </div>
            </div>
            <table class="ins-tbl">
              <tr><td>Candidate Name</td><td><b>${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</b></td></tr>
              <tr><td>Roll Number</td><td><b>${AVUtil.esc(cfg.rollNumber || '—')}</b></td></tr>
              <tr><td>Examination</td><td><b>${AVUtil.esc(cfg.name)}</b></td></tr>
              <tr><td>Total Questions</td><td><b>${total}</b> (${secs.map(s => `${AVUtil.esc(s.name)}: ${s.questionIds.length}`).join(', ')})</td></tr>
              <tr><td>Total Duration</td><td><b>${Math.round(test.duration / 60)} minutes</b></td></tr>
              ${test.timerMode === 'section' ? `<tr><td>Section Timing</td><td>${secs.map(s => `${AVUtil.esc(s.name)}: <b>${Math.round(s.duration / 60)} min</b>`).join('<br>')}</td></tr>` : ''}
              <tr><td>Marks per question</td><td><b>+${mk.correct}</b> · wrong <b>${mk.wrong}</b> · skipped <b>0</b></td></tr>
              <tr><td>Maximum marks</td><td><b>${test.maxScore}</b></td></tr>
            </table>
            <div class="ins-back"><a href="#/test/${AVUtil.esc(test.id)}">← Back to test details</a></div>
          </div>
        </aside>
      </div>
      <footer class="ins-footer">
        <label class="ins-lang">
          <span class="small muted">${App.t('chooseLanguage')}</span>
          <select id="ins-lang">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
          </select>
        </label>
        <div class="ins-declare-box">
          <b>Declaration:</b> I have read and understood all the instructions given above. I declare that I am not in possession of / not wearing / not carrying any prohibited gadget like mobile phone, bluetooth device, camera, calculator etc. or any prohibited material with me into the examination hall.
        </div>
        <label class="ins-declare">
          <input type="checkbox" id="ins-agree">
          <span>${App.t('readInstructions')}</span>
        </label>
        <button class="btn-begin" id="ins-begin" disabled>${App.t('readyToBegin').toUpperCase()}</button>
      </footer>
    </div>`;
  window.scrollTo(0, 0);
  document.body.classList.add('cbt-on');   // full-screen exam context — hide site chrome

  AVUtil.$('#ins-lang').addEventListener('change', e => {
    App.lang = e.target.value;
    localStorage.setItem('av_lang', e.target.value);
    Views.instructions(testId); // re-render in chosen language
  });
  AVUtil.$('#ins-agree').addEventListener('change', e => { AVUtil.$('#ins-begin').disabled = !e.target.checked; });
  AVUtil.$('#ins-begin').addEventListener('click', async () => {
    const btn = AVUtil.$('#ins-begin');
    btn.disabled = true; btn.textContent = 'STARTING…';

    // v1.4.40 — "any test, anytime": doosre test ka unfinished attempt KABHI
    // naya test start nahi rokta. Purane attempts park hoke My Attempts ke
    // resume list me safe rehte hain. (Pehle yahan modal se block hota tha.)
    // Same test ka khud ka unfinished ho → wahi resume (duplicate nahi banta).
    const mine = (await DB.byIndex('attempts', 'testId', test.id)).filter(a => a && !a.completed && !a.abandoned);
    if (mine.length) {
      location.hash = '#/test/' + test.id + '/attempt';
      return;
    }
    const others = await App.unfinishedAttempts();
    if (others.length) {
      AVUtil.toast('Purana unfinished attempt park hua — My Attempts me se kabhi bhi resume kar sakte ho.', 'info');
    }

    // retake policy
    let questionSets = null;
    if (prevAttempts.length) {
      if (retakeMode === 'same') questionSets = null;
      else if (retakeMode === 'fresh') questionSets = freshSets;
      else questionSets = null; // random: engine shuffles via generator below
    }
    if (prevAttempts.length && retakeMode === 'random') {
      const r = await Generator.generate({
        name: test.name, type: test.type, mode: test.mode,
        sections: test.sections.map(s => ({ subjectId: s.subjectId, count: s.questionIds.length, chapters: s.chapters, topics: s.topics, difficulty: s.difficulty })),
        strategy: 'random'
      });
      if (r.ok) { test.id = r.test.id; }
    }

    const now = Date.now();
    // a blocked (reported) question must never enter a new attempt — swap in
    // fresh replacements, even for ready-made series tests built before the block
    questionSets = await Generator.sanitizeSections(test, questionSets);
    const attempt = Engine.createAttempt(test, attemptNo, now, questionSets);
    await DB.put('attempts', attempt);
    App.pendingResume = attempt;
    location.hash = '#/test/' + test.id + '/attempt';
  });
};
