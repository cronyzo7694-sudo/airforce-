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
              <button class="clg-signin" id="login-btn">Sign In</button>
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

  /* v1.4.51: stage flag — Next ke baad SECOND screen (Other Important
     Instructions) dikhna hai; Previous pe wapas ye pehla screen. */
  if (sessionStorage.getItem('insOther_' + test.id) === '1') { renderOther(); return; }

  /* v1.4.50: REAL CBT instructions layout — fixed regions + internal scroll:
     blue strip → cyan "Instructions" bar → [scrollable instructions 79% |
     fixed candidate panel 20%] → fixed bottom nav (Next >). Language control
     top-right. Declaration/ready-to-begin/modern panel SAB HATE — flow same. */
  const examTitle = (cfg.exam === 'ssc-chsl')
    ? 'SSC CHSL (Tier-I) — ONLINE EXAMINATION'
    : AVUtil.esc(cfg.name || 'AIR FORCE AGNIVEERVAYU') + ' — ONLINE EXAMINATION';
  const candPhoto = cfg.profileImage
    ? `<img src="${AVUtil.esc(cfg.profileImage)}" alt="Candidate photo">`
    : `<span class="ins2-ph-initial">${AVUtil.esc((cfg.candidateName || 'P').trim()[0] || 'P').toUpperCase()}</span>`;
  document.getElementById('app').innerHTML = `
    <div class="cbt cbt-ins-app">
      <div class="cl-band ins2-band">
        <div class="cl-band-left"><img src="icons/icon-96.png" alt="" class="cl-band-logo"><span>${examTitle}</span></div>
        <div class="cl-band-right">PHASE I : ONLINE TEST</div>
      </div>
      <div class="ins2-titlebar">Instructions</div>
      <div class="ins2-main">
        <div class="ins2-left">
          <div class="ins2-toolbar">
            <span class="ins2-viewin">View in :</span>
            <select id="ins-lang" aria-label="View in">
              <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
              <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
            </select>
          </div>
          <div class="ins2-scroll">
            <div class="ins2-doc">
              <div class="ins2-h1">INSTRUCTIONS TO CANDIDATES (BOTH SUBJECTS)</div>
              <div class="ins2-h1 ins2-h1b">CANDIDATES MUST READ THE FOLLOWING</div>
              <div class="ins2-h1 ins2-h1b">INSTRUCTIONS BEFORE ATTEMPTING THE QUESTION PAPER</div>

              <div class="ins2-gh">General Instructions:</div>
              <ol class="ins2-rules">
                <li>The total duration of the examination is <b>${Math.round(test.duration / 60)} minutes</b>. The clock is set at the server — the countdown timer at the top right corner of the screen will display the remaining time available. ${test.timerMode === 'section'
                  ? `Section-wise timing: ${secs.map(s => `${s.name} ${Math.round(s.duration / 60)} min`).join(' · ')}. When a section's time expires, it is submitted automatically and the next section starts with its full time — leftover time is <b>not</b> carried forward.`
                  : `When the timer reaches zero, the examination will end by itself.`}</li>
                <li>The <b>Question Palette</b> displayed on the right side of the screen will show the status of each question using one of the following symbols:
                  <div class="ins2-legend">
                    <div class="ins2-leg-row"><button class="qbtn notvisited" tabindex="-1">1</button> You have not visited the question yet.</div>
                    <div class="ins2-leg-row"><button class="qbtn notanswered" tabindex="-1">2</button> You have not answered the question.</div>
                    <div class="ins2-leg-row"><button class="qbtn answered" tabindex="-1">3</button> You have answered the question.</div>
                    <div class="ins2-leg-row"><button class="qbtn marked" tabindex="-1">4</button> You have <b>NOT</b> answered the question, but have marked the question for review.</div>
                    <div class="ins2-leg-row"><button class="qbtn ansmarked" tabindex="-1">5</button> The question(s) "Answered and Marked for Review" <b>will be considered for evaluation</b>.</div>
                  </div></li>
                <li>To answer a question, click the option button of your choice. To <b>save</b> your answer, you <b>MUST</b> click on the <b>SAVE &amp; NEXT</b> button.</li>
                <li>To change your chosen answer, click the button of another option. To deselect your chosen answer, click on <b>CLEAR RESPONSE</b>.</li>
                <li>To mark a question for review, click on <b>MARK FOR REVIEW &amp; NEXT</b>. If an answer is selected for a question that is Marked for Review, that answer <b>will be considered in the evaluation</b>.</li>
                <li>${test.sectionLock
                  ? `Sections in this paper are <b>locked in order</b>: ${secs.map(s => AVUtil.esc(s.name)).join(' → ')}. You cannot move to the next section until you submit the current section. A submitted section cannot be re-opened.`
                  : `You may shuffle between sections and questions anytime during the examination by clicking the subject names on the top bar.`}</li>
                <li>The total number of questions in this test is <b>${total}</b>. Every question has four options and exactly <b>one</b> correct answer.</li>
                <li>Marking pattern — <b>+${mk.correct}</b> mark for each correct answer, <b>${mk.wrong}</b> mark deducted for each wrong answer, <b>0</b> for unattempted questions. Maximum marks: <b>${test.maxScore}</b>.</li>
                <li>Questions will be displayed in the language chosen (bilingual — English &amp; हिन्दी, except English subject). Where content is available in only one language, it will be displayed in that language.</li>
                <li>You may submit the paper anytime by clicking the <b>SUBMIT</b> button — a confirmation is always shown first. ${test.sectionLock ? 'The examination ends when the last section is submitted.' : 'You may return to the paper from the confirmation dialog.'}</li>
                <li>Do not click any unnecessary button on the computer and do not close or refresh the browser — in case of any interruption, your attempt is preserved and can be resumed from the same point.</li>
                <li>The question paper is the property of the examination conducting authority — copying / recording any part of it is prohibited.</li>
              </ol>
            </div>
          </div>
          <div class="ins2-bottomnav">
            <button class="ins2-next" id="ins-next">Next&nbsp;&nbsp;&gt;</button>
          </div>
        </div>
        <div class="ins2-right">
          <div class="ins2-cand-strip">Candidate Photograph</div>
          <div class="ins2-photo">${candPhoto}</div>
          <div class="ins2-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
        </div>
      </div>
    </div>`;
  window.scrollTo(0, 0);
  document.body.classList.add('cbt-on');   // full-screen exam context — hide site chrome

  AVUtil.$('#ins-lang').addEventListener('change', e => {
    App.lang = e.target.value;
    localStorage.setItem('av_lang', e.target.value);
    Views.instructions(testId); // re-render in chosen language
  });
  /* v1.4.51: NEXT ab doosra CBT screen (Other Important Instructions) kholta
     hai — exam wahin se "I am ready to begin" ke baad shuru hota hai. */
  AVUtil.$('#ins-next').addEventListener('click', () => {
    sessionStorage.setItem('insOther_' + test.id, '1');
    Views.instructions(testId);          // SPA re-render — no reload, state safe
  });
  return;

  /* ══════════ STAGE 2B — OTHER IMPORTANT INSTRUCTIONS (real CBT 2nd screen) ══════════ */
  function renderOther() {
  const examTitle = (cfg.exam === 'ssc-chsl')
    ? 'SSC CHSL (Tier-I) — ONLINE EXAMINATION'
    : AVUtil.esc(cfg.name || 'AIR FORCE AGNIVEERVAYU') + ' — ONLINE EXAMINATION';
  const candPhoto = cfg.profileImage
    ? `<img src="${AVUtil.esc(cfg.profileImage)}" alt="Candidate photo">`
    : `<span class="ins2-ph-initial">${AVUtil.esc((cfg.candidateName || 'P').trim()[0] || 'P').toUpperCase()}</span>`;

  // exam paper table — sab values test config se (STAR hardcode NAHI)
  const secTime = sd => (test.timerMode === 'section' ? String(Math.round(sd / 60)) : '—');
  const tblRows = secs.map(sec => {
    const n = sec.questionIds.length;
    return `<tr><td>1-${n}</td><td>${AVUtil.esc(sec.name)}</td><td>${n}</td><td>${n * mk.correct}</td><td>${secTime(sec.duration)}</td></tr>`;
  }).join('') + `<tr class="otr-tbl-total"><td>Total</td><td></td><td>${total}</td><td>${test.maxScore}</td><td>${Math.round(test.duration / 60)} Minutes</td></tr>`;

  const durMin = Math.round(test.duration / 60);
  const rulesOther = [
    `The question paper contains <b>${secs.length} subjects</b>. Each subject is of duration specified above.`,
    test.sectionLock
      ? `Each subject will appear in sequence as per the order above only after the lapse of time allocated for previous subject.`
      : `All the subjects will be available as per the order given above and you may switch between the subjects anytime during the examination.`,
    test.sectionLock
      ? `After the time has lapsed, each subject would get submitted automatically.`
      : `The countdown timer at the top right corner of the screen will display the remaining time available for the examination.`,
    test.sectionLock
      ? `You can't go back and attempt the subject which has already been submitted.`
      : `You can review and change your answers anytime before the final submission of the examination.`,
    `You will be given <b>${durMin} minutes</b> to attempt <b>${total} questions</b>.`,
    `Marking scheme for this examination is as follows:-
      <div class="otr-marking">
        (a) <b>${mk.correct}</b> mark${Math.abs(mk.correct) === 1 ? '' : 's'} for every correct answer.<br>
        (b) Nil (0) marks for unattempted question.<br>
        (c) <b>${Math.abs(mk.wrong)}</b> mark${Math.abs(mk.wrong) === 1 ? '' : 's'} will be deducted for each incorrect answer.
      </div>`,
    `Candidate can select the default language for the entire examination at the end of Instructions only. This language will remain default for the entire examination.`,
    `One question will be displayed on the screen at a time. To move to the next question, click on the desired section/question in the bar given above.`,
    `Each question will have <b>4 options</b> out of which only <b>one</b> option will be correct. The candidate has to select the correct option.`,
    `In case of any discrepancy between the English and Hindi versions of a question, the English version will be treated as the final version.`,
    `At any time during examination, you can also view the question paper instructions by clicking the instructions button available on the screen.`
  ];

  document.getElementById('app').innerHTML = `
    <div class="cbt cbt-ins-app cbt-otr-app">
      <div class="cl-band ins2-band">
        <div class="cl-band-left"><img src="icons/icon-96.png" alt="" class="cl-band-logo"><span>${examTitle}</span></div>
        <div class="cl-band-right">PHASE I : ONLINE TEST</div>
      </div>
      <div class="ins2-titlebar otr-titlebar">Other Important Instructions</div>
      <div class="ins2-main">
        <div class="ins2-left otr-left">
          <div class="otr-scroll">
            <div class="otr-doc">
              <div class="otr-viewin">View in :
                <select id="otr-viewlang" aria-label="View in">
                  <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                  <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
                </select>
              </div>
              <div class="ins2-h1">OTHER IMPORTANT INSTRUCTIONS (BOTH SUBJECTS)</div>
              <table class="otr-tbl">
                <thead><tr><th>Question Number</th><th>Subject Name</th><th>No. of Questions</th><th>Marks</th><th>Time Allotted</th></tr></thead>
                <tbody>${tblRows}</tbody>
              </table>
              <ol class="ins2-rules otr-rules">
                ${rulesOther.map(r => `<li>${r}</li>`).join('')}
              </ol>
            </div>
          </div>
          <div class="otr-bottom">
            <div class="otr-langrow">
              <label class="otr-langlab">Choose your default language :
                <select id="otr-lang">
                  <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                  <option value="hi" ${lang === 'hi' ? 'selected' : ''}>Hindi</option>
                </select>
              </label>
              <span class="otr-rednote">Please note all questions will appear in your default language. This language can be changed for a particular question later on.</span>
            </div>
            <label class="otr-decl">
              <input type="checkbox" id="otr-agree">
              <span>I have read and understood the instructions. All computer hardware allotted to me are in proper working condition. I declare that I am not in possession of / not wearing / not carrying any prohibited gadget like mobile phone, bluetooth device etc. or any prohibited material with me into the Examination Hall. I agree that in case of not adhering to the instructions, I shall be liable to be debarred from this examination and/or to disciplinary action, which may include a ban from all future examinations.</span>
            </label>
            <div class="otr-actions">
              <button class="otr-btn otr-prev" id="otr-prev">&lt; Previous</button>
              <button class="otr-btn otr-ready" id="otr-begin" disabled>I am ready to begin</button>
            </div>
          </div>
        </div>
        <div class="ins2-right">
          <div class="ins2-cand-strip">Candidate Photograph</div>
          <div class="ins2-photo">${candPhoto}</div>
          <div class="ins2-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
        </div>
      </div>
    </div>`;
  window.scrollTo(0, 0);
  document.body.classList.add('cbt-on');

  AVUtil.$('#otr-viewlang').addEventListener('change', e => {
    App.lang = e.target.value;
    localStorage.setItem('av_lang', e.target.value);   // re-render nahi — scroll/checkbox preserve
  });
  AVUtil.$('#otr-lang').addEventListener('change', e => {
    App.lang = e.target.value;
    localStorage.setItem('av_lang', e.target.value);   // default language — no re-render (decl preserve)
  });
  AVUtil.$('#otr-prev').addEventListener('click', () => {
    sessionStorage.removeItem('insOther_' + test.id);
    Views.instructions(testId);          // wapas pehla Instructions screen
  });
  AVUtil.$('#otr-agree').addEventListener('change', e => { AVUtil.$('#otr-begin').disabled = !e.target.checked; });
  AVUtil.$('#otr-begin').addEventListener('click', async () => {
    if (!AVUtil.$('#otr-agree').checked) return;   // validation bypass nahi
    sessionStorage.removeItem('insOther_' + test.id);
    const btn = AVUtil.$('#otr-begin');
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
  }
};
