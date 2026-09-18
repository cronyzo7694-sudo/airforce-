/* ============================================================
 * VIEW: INSTRUCTIONS — Digialm-style pre-exam screen.
 * Timer does NOT start until "I am ready to begin".
 * ============================================================ */

Views.instructions = async function (testId) {
  const test = await DB.get('tests', testId);
  if (!test) { AVUtil.toast('Test not found', 'error'); return Router.go('/tests'); }
  const cfg = await App.config();
  const lang = App.lang;

  // retake question-set policy
  const prevAttempts = (await DB.byIndex('attempts', 'testId', test.id));
  const attemptNo = prevAttempts.length + 1;
  const retakeMode = cfg.retakeMode || 'fresh';
  let freshSets = null;
  if (prevAttempts.length && retakeMode === 'fresh') {
    // pre-generate a fresh question set for this attempt (same blueprint)
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, topicAcc: {} });
    freshSets = {};
    for (const sec of test.sections) {
      const pool = await Generator.poolFor({ subjectId: sec.subjectId, chapters: sec.chapters, topics: sec.topics, difficulty: sec.difficulty }, qstats);
      const picked = Generator.pick(pool, sec.questionIds.length, test.strategy || cfg.selectionStrategy, qstats);
      if (picked) freshSets[sec.subjectId] = picked.map(q => q.id);
    }
  }

  const secs = test.sections;
  const total = test.totalQuestions;
  const mk = test.marking;

  const rules = [
    `<b>Total duration of the examination is <b>${Math.round(test.duration / 60)} minutes</b>.</b> ${test.timerMode === 'section'
      ? `The examination is divided into ${secs.length} section${secs.length > 1 ? 's' : ''}, each with its own time limit (${secs.map(s => `${s.name} ${Math.round(s.duration / 60)} min`).join(', ')}). When a section's time expires, it is submitted automatically and the next section begins with its full time. Time remaining in one section is <b>not</b> carried forward.`
      : `A single countdown timer will display the remaining time available for you to complete the examination. When the timer reaches zero, the examination will end automatically.`}`,
    `The clock will be set at the server. The countdown timer in the top right corner of screen will display the remaining time available for you to complete the examination. When the timer reaches zero, the examination will end by itself.`,
    `The Question Palette displayed on the right side of screen will show the status of each question using one of the following symbols:<br>
      <span class="pal-demo"><button class="qbtn answered" tabindex="-1">1</button> You have answered the question</span>
      <span class="pal-demo"><button class="qbtn notanswered" tabindex="-1">2</button> You have not answered the question</span>
      <span class="pal-demo"><button class="qbtn notvisited" tabindex="-1">3</button> You have not visited the question yet</span>
      <span class="pal-demo"><button class="qbtn marked" tabindex="-1">4</button> You have marked the question for review</span>
      <span class="pal-demo"><button class="qbtn ansmarked" tabindex="-1">5</button> <b>The question was answered and marked for review — it <b>will still be evaluated</b></b></span>`,
    `You can click on the ">" arrow shown to the left of the question palette to collapse it, and on the "<" arrow to expand it back. This arrow is useful in case the palette hides part of the question on smaller screens.`,
    `You can click on your "Profile" image on account to change the language during the exam for entire question paper. On clicking of Profile image you will get a drop-down to change the question content language. By clicking on it, your question content language will be changed. This can also be changed during the exam.${test.timerMode === 'section' ? ' The section timers continue to run while you change the language.' : ''}`,
    `To answer a question: click the question number in the Question Palette, select one of the four options and then click <b>SAVE &amp; NEXT</b> to save and go to the next question.`,
    `To deselect your chosen answer, click on the selected option again or click <b>CLEAR RESPONSE</b>.`,
    `To mark a question for review, click <b>MARK FOR REVIEW &amp; NEXT</b>. If an answer is selected for a question that is marked for review, that answer <b>will be considered</b> in the evaluation.`,
    `To change your answer to a question that has already been answered, first select that question from the Question Palette, then click on the new answer option followed by <b>SAVE &amp; NEXT</b>.`,
    `Questions in this paper are displayed in the language chosen by you. Where content is available in only one language, it will be shown in that language.`,
    `Each question in this examination carries <b>${mk.correct} mark${Math.abs(mk.correct) === 1 ? '' : 's'}</b>. For each incorrect answer, <b>${Math.abs(mk.wrong)} mark${Math.abs(mk.wrong) === 1 ? '' : 's'}</b> will be deducted. No marks are deducted for questions left unattempted.`,
    `Note that selecting an option for a question will NOT save your answer — you must click <b>SAVE &amp; NEXT</b> or the answer is stored only when you navigate. In this simulator, selections are also auto-saved instantly so that a refresh never loses your work.`,
    test.sectionLock
      ? `The sections in this examination are <b>locked in order</b>: ${secs.map(s => s.name).join(' → ')}. You cannot open the next section until the current section is submitted. To finish a section before its time expires, reach the end of the section and click <b>SUBMIT SECTION</b>. Once submitted, a section cannot be revisited.`
      : `You may navigate freely between sections using the subject tabs at the top of the screen.`,
    `You may shuffle back and forth between questions (using the palette, Previous/Next buttons or <b>arrow keys</b>) during the examination as time permits — within the currently active section.`,
    `Do not click on the "Submit" button before completing the examination. ${test.sectionLock ? 'Each section must be submitted at its end; the examination ends when the last section is submitted.' : 'If you click Submit, a confirmation dialog will appear and you can return to the paper if you wish to continue.'}`,
    `The Question Palette summary counts (Answered / Not Answered / Marked for Review / Answered &amp; Marked for Review) update in real time for the current section.`
  ];

  document.getElementById('app').innerHTML = `
    <div class="cbt cbt-instructions">
      <header class="ins-header">
        <div class="ins-exam">${AVUtil.esc(cfg.name)} — ${AVUtil.esc(test.mode === 'exam' ? 'Computer Based Test' : 'Practice Test')}</div>
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
            </ul>
          </div>
        </div>
        <aside class="ins-right">
          <div class="ins-panel">
            <div class="ins-cand">
              <div class="avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="44" height="44"><path fill="#b9c6d8" d="M12 12c2.7 0 4.8-2.2 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
              </div>
              <div>
                <div class="ins-cand-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
                <div class="muted small">Attempt #${attemptNo}</div>
              </div>
            </div>
            <table class="ins-tbl">
              <tr><td>Examination</td><td><b>${AVUtil.esc(test.name)}</b></td></tr>
              <tr><td>Total Questions</td><td><b>${total}</b> (${secs.map(s => `${AVUtil.esc(s.name)}: ${s.questionIds.length}`).join(', ')})</td></tr>
              <tr><td>Total Duration</td><td><b>${Math.round(test.duration / 60)} minutes</b></td></tr>
              ${test.timerMode === 'section' ? `<tr><td>Section Timing</td><td>${secs.map(s => `${AVUtil.esc(s.name)}: <b>${Math.round(s.duration / 60)} min</b>`).join('<br>')}</td></tr>` : ''}
              <tr><td>Marks per question</td><td><b>+${mk.correct}</b></td></tr>
              <tr><td>Negative marking</td><td><b>${mk.wrong}</b> per wrong answer</td></tr>
              <tr><td>Unattempted</td><td><b>0</b></td></tr>
              <tr><td>Maximum marks</td><td><b>${test.maxScore}</b></td></tr>
            </table>
            <label class="ins-lang">
              <span>${App.t('chooseLanguage')}</span>
              <select id="ins-lang">
                <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
              </select>
            </label>
            <label class="ins-declare">
              <input type="checkbox" id="ins-agree">
              <span>${App.t('readInstructions')}</span>
            </label>
            <button class="btn-begin" id="ins-begin" disabled>${App.t('readyToBegin').toUpperCase()}</button>
            <div class="ins-back"><a href="#/test/${test.id}">← Back to test details</a></div>
          </div>
        </aside>
      </div>
    </div>`;
  window.scrollTo(0, 0);

  AVUtil.$('#ins-lang').addEventListener('change', e => {
    App.lang = e.target.value;
    localStorage.setItem('av_lang', e.target.value);
    Views.instructions(testId); // re-render in chosen language
  });
  AVUtil.$('#ins-agree').addEventListener('change', e => { AVUtil.$('#ins-begin').disabled = !e.target.checked; });
  AVUtil.$('#ins-begin').addEventListener('click', async () => {
    const btn = AVUtil.$('#ins-begin');
    btn.disabled = true; btn.textContent = 'STARTING…';

    // block if an unfinished attempt exists for another test
    const unfinished = await App.findUnfinishedAttempt();
    if (unfinished && unfinished.testId !== test.id) {
      btn.disabled = false; btn.textContent = App.t('readyToBegin').toUpperCase();
      const ok = await AVUtil.confirmModal({
        title: 'Another exam is in progress',
        body: `An unfinished attempt of "${unfinished.testName}" exists. You can only have one active attempt. Resume it or end it from the dashboard first.`,
        yesLabel: 'Go to Dashboard', noLabel: 'Stay'
      });
      if (ok) Router.go('/dashboard');
      return;
    }

    // existing unfinished attempt of same test → resume instead of new
    if (unfinished && unfinished.testId === test.id) {
      location.hash = '#/test/' + test.id + '/attempt';
      return;
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
    const attempt = Engine.createAttempt(test, attemptNo, now, questionSets);
    await DB.put('attempts', attempt);
    App.pendingResume = attempt;
    location.hash = '#/test/' + test.id + '/attempt';
  });
};
