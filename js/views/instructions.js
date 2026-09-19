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
  const retakeMode = cfg.retakeMode || 'same';
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
    `<b>Duration: ${Math.round(test.duration / 60)} minutes.</b> ${test.timerMode === 'section'
      ? `Section-wise timing: ${secs.map(s => `${s.name} ${Math.round(s.duration / 60)} min`).join(' · ')}. When a section's time expires it is submitted automatically and the next section starts with its full time — leftover time is <b>not</b> carried forward.`
      : `A single countdown timer (top-right) shows the remaining time. At 00:00 the examination ends automatically.`}`,
    `The <b>Question Palette</b> on the right shows the status of every question:
      <span class="pal-demo"><button class="qbtn answered" tabindex="-1">1</button> answered</span>
      <span class="pal-demo"><button class="qbtn notanswered" tabindex="-1">2</button> not answered</span>
      <span class="pal-demo"><button class="qbtn notvisited" tabindex="-1">3</button> not visited</span>
      <span class="pal-demo"><button class="qbtn marked" tabindex="-1">4</button> marked for review</span>
      <span class="pal-demo"><button class="qbtn ansmarked" tabindex="-1">5</button> answered &amp; marked — <b>will be evaluated</b></span>`,
    `To answer: select an option and press <b>SAVE &amp; NEXT</b>. Selections are also auto-saved instantly — a refresh never loses your work.`,
    `To change an answer, pick the question from the palette and select the new option. To deselect, use <b>CLEAR RESPONSE</b>.`,
    `<b>MARK FOR REVIEW &amp; NEXT</b> flags a question — if it also has a selected answer, that answer <b>is evaluated</b>.`,
    `Questions appear in the language chosen below${test.timerMode === 'section' ? ' (section timers keep running while you switch)' : ''}. Where content is available in only one language, it is shown in that language.`,
    `Marking: <b>+${mk.correct}</b> correct · <b>${mk.wrong}</b> wrong · <b>0</b> unattempted. Maximum marks: <b>${test.maxScore}</b>.`,
    test.sectionLock
      ? `Sections are <b>locked in order</b>: ${secs.map(s => AVUtil.esc(s.name)).join(' → ')}. Submit the current section (button in the top bar) to unlock the next. A submitted section cannot be reopened.`
      : `You may move freely between sections using the subject tabs at the top.`,
    `Navigate with the palette, Previous / Next buttons or the <b>arrow keys</b>; keys <b>1–4</b> select options.`,
    `You may <b>PAUSE</b> the exam anytime (⏸ button, top bar) — the timer stops completely and resumes exactly where you left it.`,
    `Submit anytime via the <b>SUBMIT</b> button (a confirmation is always shown first). ${test.sectionLock ? 'The examination ends when the last section is submitted.' : 'Do not submit before completing — a confirmation lets you return to the paper.'}`
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
                <svg viewBox="0 0 24 24" width="40" height="40"><path fill="#b9c6d8" d="M12 12c2.7 0 4.8-2.2 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
              </div>
              <div>
                <div class="ins-cand-name">${AVUtil.esc(cfg.candidateName || 'Practice Candidate')}</div>
                <div class="muted small">${AVUtil.esc(test.name)} · Attempt #${attemptNo}</div>
              </div>
            </div>
            <table class="ins-tbl">
              <tr><td>Examination</td><td><b>${AVUtil.esc(cfg.name)}</b></td></tr>
              <tr><td>Total Questions</td><td><b>${total}</b> (${secs.map(s => `${AVUtil.esc(s.name)}: ${s.questionIds.length}`).join(', ')})</td></tr>
              <tr><td>Total Duration</td><td><b>${Math.round(test.duration / 60)} minutes</b></td></tr>
              ${test.timerMode === 'section' ? `<tr><td>Section Timing</td><td>${secs.map(s => `${AVUtil.esc(s.name)}: <b>${Math.round(s.duration / 60)} min</b>`).join('<br>')}</td></tr>` : ''}
              <tr><td>Marks per question</td><td><b>+${mk.correct}</b> · wrong <b>${mk.wrong}</b> · skipped <b>0</b></td></tr>
              <tr><td>Maximum marks</td><td><b>${test.maxScore}</b></td></tr>
            </table>
            <div class="ins-back"><a href="#/test/${test.id}">← Back to test details</a></div>
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
    // a blocked (reported) question must never enter a new attempt — swap in
    // fresh replacements, even for ready-made series tests built before the block
    questionSets = await Generator.sanitizeSections(test, questionSets);
    const attempt = Engine.createAttempt(test, attemptNo, now, questionSets);
    await DB.put('attempts', attempt);
    App.pendingResume = attempt;
    location.hash = '#/test/' + test.id + '/attempt';
  });
};
