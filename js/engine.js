/* ============================================================
 * AGNIVEER VAYU CBT — EXAM ENGINE (pure logic, no DOM)
 *
 * The engine is AUTHORITATIVE: the UI can only call these
 * functions. Every rule (section locking, question states,
 * timers, submission, scoring) lives here so no UI path can
 * bypass exam rules.
 *
 * States:
 *   Section : LOCKED → ACTIVE → SUBMITTED | EXPIRED   (never reopens)
 *   Question: NOT_VISITED, VISITED_NOT_ANSWERED, ANSWERED,
 *             MARKED_FOR_REVIEW, ANSWERED_AND_MARKED_FOR_REVIEW
 * ============================================================ */

const Engine = (() => {

  const Q = {
    NOT_VISITED: 'NOT_VISITED',
    VISITED_NOT_ANSWERED: 'VISITED_NOT_ANSWERED',
    ANSWERED: 'ANSWERED',
    MARKED_FOR_REVIEW: 'MARKED_FOR_REVIEW',
    ANSWERED_AND_MARKED_FOR_REVIEW: 'ANSWERED_AND_MARKED_FOR_REVIEW'
  };
  const S = { LOCKED: 'LOCKED', ACTIVE: 'ACTIVE', SUBMITTED: 'SUBMITTED', EXPIRED: 'EXPIRED' };

  /* ---------------- attempt creation ---------------- */
  function createAttempt(test, attemptNo, now, questionSets) {
    now = now || Date.now();
    const sections = {};
    const order = test.sections.map(s => s.subjectId);
    const allActive = test.timerMode !== 'section' && !test.sectionLock; // free navigation
    test.sections.forEach((sec, i) => {
      const qids = (questionSets && questionSets[sec.subjectId]) ? questionSets[sec.subjectId] : sec.questionIds;
      sections[sec.subjectId] = {
        state: (i === 0 || allActive) ? S.ACTIVE : S.LOCKED,
        questionIds: qids.slice(),
        startedAt: i === 0 ? now : null,
        endsAt: null,
        submittedAt: null,
        expireReason: null
      };
    });
    const sectionTimer = test.timerMode === 'section';
    if (sectionTimer) sections[order[0]].endsAt = now + test.sections[0].duration * 1000;

    const attempt = {
      id: 'a_' + AVUtil.uid('x'),
      testId: test.id,
      testName: test.name,
      testType: test.type,
      attemptNo: attemptNo || 1,
      mode: test.mode,
      timerMode: test.timerMode,
      sectionLock: !!test.sectionLock,
      marking: test.marking,

      startTime: now,
      endTime: null,           // global end (global timer / completion)
      endsAt: sectionTimer ? null : now + test.duration * 1000,
      pausedTotal: 0,
      pauseStarted: null,

      completed: false,
      submittedAt: null,
      submitReason: null,      // 'user' | 'time'

      sectionOrder: order,
      sections,
      currentSectionId: order[0],
      currentQIdx: 0,
      view: 'question',       // 'question' | 'section-end' | 'exam-complete'
      responses: {},           // qid -> {sel, state, timeSpent, visits}
      qEnterAt: now,
      heartbeatAt: now,
      result: null
    };
    touch(attempt, sections[order[0]].questionIds[0], now);
    return attempt;
  }

  /* ---------------- response helpers ---------------- */
  function resp(attempt, qid) {
    return attempt.responses[qid] ||
      (attempt.responses[qid] = { sel: null, state: Q.NOT_VISITED, timeSpent: 0, visits: 0 });
  }

  function touch(attempt, qid, now) {
    // opening a question: NOT_VISITED → VISITED_NOT_ANSWERED (only transition)
    const r = resp(attempt, qid);
    r.visits = (r.visits || 0) + 1;
    if (r.state === Q.NOT_VISITED) r.state = Q.VISITED_NOT_ANSWERED;
    return r;
  }

  /* ---------------- question operations ---------------- */
  function selectOption(attempt, qid, optId) {
    const r = resp(attempt, qid);
    r.sel = optId;
    if (r.state === Q.NOT_VISITED || r.state === Q.VISITED_NOT_ANSWERED) r.state = Q.ANSWERED;
    else if (r.state === Q.MARKED_FOR_REVIEW) r.state = Q.ANSWERED_AND_MARKED_FOR_REVIEW;
    /* ANSWERED / ANSWERED_AND_MARKED_FOR_REVIEW keep their state */
    return r;
  }

  function clearResponse(attempt, qid) {
    const r = attempt.responses[qid];
    if (!r || !r.sel) return r || null;
    r.sel = null;
    if (r.state === Q.ANSWERED) r.state = Q.VISITED_NOT_ANSWERED;
    else if (r.state === Q.ANSWERED_AND_MARKED_FOR_REVIEW) r.state = Q.MARKED_FOR_REVIEW;
    return r;
  }

  function markForReview(attempt, qid) {
    const r = resp(attempt, qid);
    r.state = r.sel ? Q.ANSWERED_AND_MARKED_FOR_REVIEW : Q.MARKED_FOR_REVIEW;
    return r;
  }

  /* ---------------- navigation ---------------- */
  function sectionOf(attempt, sid) { return attempt.sections[sid]; }

  function activeSection(attempt) {
    return attempt.sections[attempt.currentSectionId];
  }

  function canOpenSection(attempt, sid) {
    const sec = attempt.sections[sid];
    if (!sec) return { ok: false, reason: 'unknown' };
    if (sec.state === S.ACTIVE) return { ok: true };
    if (sec.state === S.SUBMITTED || sec.state === S.EXPIRED)
      return { ok: false, reason: 'submitted', msg: 'This section has been submitted and is locked.' };
    if (sec.state === S.LOCKED)
      return { ok: false, reason: 'locked', msg: 'Complete the current section before proceeding.' };
    return { ok: false, reason: 'invalid' };
  }

  function gotoSection(attempt, sid, now) {
    const chk = canOpenSection(attempt, sid);
    if (!chk.ok) return chk;
    accumulateTime(attempt, now);
    attempt.currentSectionId = sid;
    attempt.currentQIdx = 0;
    attempt.view = 'question';
    touch(attempt, attempt.sections[sid].questionIds[0], now || Date.now());
    return { ok: true };
  }

  function gotoQuestion(attempt, sid, qIdx, now) {
    const chk = canOpenSection(attempt, sid);
    if (!chk.ok) return chk;
    const sec = attempt.sections[sid];
    if (qIdx < 0 || qIdx >= sec.questionIds.length) return { ok: false, reason: 'range' };
    accumulateTime(attempt, now);
    attempt.currentSectionId = sid;
    attempt.currentQIdx = qIdx;
    attempt.view = 'question';
    touch(attempt, sec.questionIds[qIdx], now || Date.now());
    return { ok: true };
  }

  // advance target after save/mark (shared by saveNext & markReviewNext)
  function advanceTarget(attempt) {
    const sec = activeSection(attempt);
    const last = sec.questionIds.length - 1;
    if (attempt.currentQIdx < last) return { type: 'question', idx: attempt.currentQIdx + 1 };
    // at last question of the section
    if (attempt.sectionLock && attempt.timerMode === 'section') {
      return { type: 'section-end' };
    }
    // free navigation: continue into the next section if any
    const order = attempt.sectionOrder;
    const pos = order.indexOf(attempt.currentSectionId);
    if (pos + 1 < order.length && attempt.sections[order[pos + 1]].state === S.ACTIVE) {
      return { type: 'section', sid: order[pos + 1] };
    }
    return { type: 'section-end' };
  }

  function saveNext(attempt, now) {
    const target = advanceTarget(attempt);
    if (target.type === 'section-end') {
      accumulateTime(attempt, now);
      attempt.view = 'section-end';
      return target;
    }
    if (target.type === 'section') {
      accumulateTime(attempt, now);
      attempt.currentSectionId = target.sid;
      attempt.currentQIdx = 0;
      attempt.view = 'question';
      touch(attempt, attempt.sections[target.sid].questionIds[0], now || Date.now());
      return target;
    }
    gotoQuestion(attempt, attempt.currentSectionId, target.idx, now);
    return target;
  }

  function markReviewNext(attempt, now) {
    const sec = activeSection(attempt);
    markForReview(attempt, sec.questionIds[attempt.currentQIdx]);
    return saveNext(attempt, now);
  }

  function previous(attempt, now) {
    const sec = activeSection(attempt);
    if (attempt.currentQIdx > 0) {
      gotoQuestion(attempt, attempt.currentSectionId, attempt.currentQIdx - 1, now);
      return { ok: true };
    }
    // free-nav: previous section's last question (never into submitted/locked)
    const order = attempt.sectionOrder;
    const pos = order.indexOf(attempt.currentSectionId);
    for (let i = pos - 1; i >= 0; i--) {
      if (attempt.sections[order[i]].state === S.ACTIVE) {
        gotoQuestion(attempt, order[i], attempt.sections[order[i]].questionIds.length - 1, now);
        return { ok: true };
      }
      break; // in section-lock mode there is never a previous ACTIVE section
    }
    return { ok: false, reason: 'first' };
  }

  /* ---------------- section submission ---------------- */
  function sectionSummary(attempt, sid) {
    const sec = attempt.sections[sid];
    const c = { [Q.ANSWERED]: 0, [Q.VISITED_NOT_ANSWERED]: 0, [Q.MARKED_FOR_REVIEW]: 0, [Q.ANSWERED_AND_MARKED_FOR_REVIEW]: 0, [Q.NOT_VISITED]: 0 };
    sec.questionIds.forEach(qid => { c[resp(attempt, qid).state]++; });
    return {
      answered: c[Q.ANSWERED] + c[Q.ANSWERED_AND_MARKED_FOR_REVIEW],
      notAnswered: c[Q.VISITED_NOT_ANSWERED] + c[Q.NOT_VISITED],
      marked: c[Q.MARKED_FOR_REVIEW],
      answeredMarked: c[Q.ANSWERED_AND_MARKED_FOR_REVIEW],
      total: sec.questionIds.length
    };
  }

  function submitSection(attempt, test, sid, reason, now) {
    now = now || Date.now();
    const sec = attempt.sections[sid];
    if (!sec || sec.state !== S.ACTIVE) return { ok: false, reason: 'not-active' };
    accumulateTime(attempt, now);
    sec.state = reason === 'expired' ? S.EXPIRED : S.SUBMITTED;
    sec.submittedAt = now;
    sec.expireReason = reason === 'expired' ? 'time' : 'user';

    const order = attempt.sectionOrder;
    const pos = order.indexOf(sid);
    const nextSid = order[pos + 1];

    if (!nextSid) {
      // exam finished
      attempt.view = 'exam-complete';
      attempt.completed = true;
      attempt.endTime = now;
      attempt.submittedAt = now;
      attempt.submitReason = attempt.submitReason || (reason === 'expired' ? 'time' : 'user');
      return { ok: true, finished: true };
    }

    // unlock next section with a FRESH timer (remaining time never carries forward)
    const next = attempt.sections[nextSid];
    next.state = S.ACTIVE;
    next.startedAt = reason === 'expired' ? (sec.endsAt || now) : now;
    if (test.timerMode === 'section') {
      const cfg = test.sections.find(s => s.subjectId === nextSid);
      next.endsAt = next.startedAt + cfg.duration * 1000;
    }
    attempt.currentSectionId = nextSid;
    attempt.currentQIdx = 0;
    attempt.view = 'question';
    touch(attempt, next.questionIds[0], now);
    return { ok: true, finished: false, nextSid };
  }

  function submitExam(attempt, test, reason, now) {
    now = now || Date.now();
    accumulateTime(attempt, now);
    attempt.sectionOrder.forEach(sid => {
      const sec = attempt.sections[sid];
      if (sec.state === S.ACTIVE) {
        sec.state = reason === 'expired' ? S.EXPIRED : S.SUBMITTED;
        sec.submittedAt = now;
      } else if (sec.state === S.LOCKED) {
        sec.state = S.EXPIRED; // defensive: exam submitted before reaching it
        sec.submittedAt = now;
      }
    });
    attempt.completed = true;
    attempt.view = 'exam-complete';
    attempt.endTime = now;
    attempt.submittedAt = now;
    attempt.submitReason = reason || 'user';
    return { ok: true };
  }

  /* ---------------- timers ---------------- */
  function accumulateTime(attempt, now) {
    now = now || Date.now();
    const sec = activeSection(attempt);
    if (!sec) return;
    const qid = sec.questionIds[attempt.currentQIdx];
    if (!qid) return;
    const r = resp(attempt, qid);
    const delta = Math.max(0, Math.floor((now - (attempt.qEnterAt || now)) / 1000));
    if (delta > 0) r.timeSpent = (r.timeSpent || 0) + delta;
    attempt.qEnterAt = now;
    attempt.heartbeatAt = now;
  }

  function recoverAway(attempt, now) {
    /* Band rehne ka time timer ke liye PAUSE tha (pause-on-close semantics).
       Away ka poora time endsAt me wapas add hota hai — resume par test
       JAHAN CHHODA THA wahin se khulta hai, aur JITNA TIME BACHA THA wahi
       bacha rehta hai. Paused attempts Engine.resume se handle hote hain. */
    now = now || Date.now();
    if (attempt.completed || attempt.pauseStarted) return 0;
    const away = now - (attempt.heartbeatAt || now);
    if (away <= 2000) return 0;   // 2s se kam = glitch, ignore
    if (attempt.endsAt) attempt.endsAt += away;
    if (attempt.timerMode === 'section') {
      const sec = attempt.sections && attempt.sections[attempt.currentSectionId];
      if (sec && sec.endsAt) sec.endsAt += away;
    }
    attempt.awayTotal = (attempt.awayTotal || 0) + away;
    attempt.heartbeatAt = now;
    return away;
  }

  function remainingMs(attempt, test, now) {
    now = now || Date.now();
    if (attempt.timerMode === 'section') {
      const sec = attempt.sections[attempt.currentSectionId];
      if (!sec || sec.state !== S.ACTIVE) return 0;
      if (attempt.pauseStarted) return Math.max(0, (sec.endsAt || 0) - attempt.pauseStarted); // frozen while paused
      return Math.max(0, (sec.endsAt || 0) - now);
    }
    let end = attempt.endsAt || 0;
    if (attempt.pauseStarted) return Math.max(0, end - attempt.pauseStarted); // frozen
    return Math.max(0, end - now);
  }

  function fastForward(attempt, test, now) {
    /* Apply any expiries that happened while the browser was closed.
       Returns {changed, completed} and auto-advances through sections. */
    now = now || Date.now();
    let changed = false;
    if (attempt.completed) return { changed: false, completed: true };

    if (attempt.timerMode !== 'section') {
      if (test && attempt.endsAt && now >= attempt.endsAt && !attempt.pauseStarted) {
        submitExam(attempt, test, 'expired', now);
        return { changed: true, completed: true };
      }
      return { changed: false, completed: false };
    }

    let guard = 0;
    while (!attempt.completed && guard++ < 12) {
      if (attempt.pauseStarted) break; // exam is paused — time does not count
      const sec = attempt.sections[attempt.currentSectionId];
      if (!sec || sec.state !== S.ACTIVE) break;
      if (sec.endsAt && now >= sec.endsAt) {
        submitSection(attempt, test, attempt.currentSectionId, 'expired', Math.max(sec.endsAt, now));
        changed = true;
      } else break;
    }
    if (attempt.completed && attempt.submitReason !== 'user') attempt.submitReason = 'time';
    return { changed, completed: attempt.completed };
  }

  function pause(attempt, now) {
    if (attempt.pauseStarted) return false;
    attempt.pauseStarted = now || Date.now();
    return true;
  }
  function resume(attempt, now) {
    if (!attempt.pauseStarted) return false;
    now = now || Date.now();
    const pausedFor = now - attempt.pauseStarted;
    attempt.endsAt += pausedFor;
    if (attempt.timerMode === 'section') {
      const sec = attempt.sections[attempt.currentSectionId];
      if (sec) sec.endsAt += pausedFor;
    }
    attempt.pausedTotal = (attempt.pausedTotal || 0) + pausedFor;
    attempt.pauseStarted = null;
    attempt.qEnterAt = now;
    return true;
  }

  /* ---------------- validation of current view (route protection) ---------------- */
  function assertValidPosition(attempt) {
    /* Recompute the authoritative view from state — any tampered
       currentSectionId/currentQIdx is corrected here. */
    if (attempt.completed) { attempt.view = 'exam-complete'; return; }
    const order = attempt.sectionOrder;
    if (!attempt.sections[attempt.currentSectionId] ||
        attempt.sections[attempt.currentSectionId].state !== S.ACTIVE) {
      const act = order.find(sid => attempt.sections[sid].state === S.ACTIVE);
      if (act) { attempt.currentSectionId = act; attempt.currentQIdx = 0; }
      else { attempt.view = 'exam-complete'; attempt.completed = true; return; }
    }
    const sec = attempt.sections[attempt.currentSectionId];
    if (typeof attempt.currentQIdx !== 'number' ||
        attempt.currentQIdx < 0 || attempt.currentQIdx >= sec.questionIds.length) {
      attempt.currentQIdx = 0;
    }
    if (attempt.view !== 'section-end') attempt.view = 'question';
  }

  /* ---------------- global question number ---------------- */
  function globalNumber(attempt, sid, idx) {
    let n = 0;
    for (const s of attempt.sectionOrder) {
      if (s === sid) return n + idx + 1;
      n += attempt.sections[s].questionIds.length;
    }
    return idx + 1;
  }

  function allQuestionIds(attempt) {
    return attempt.sectionOrder.flatMap(sid => attempt.sections[sid].questionIds);
  }

  /* ---------------- evaluation ---------------- */
  function evaluate(attempt, questionMap) {
    /* questionMap: qid -> question object (with correctAnswer) */
    const mk = attempt.marking || { correct: 1, wrong: -0.25, unattempted: 0 };
    let correct = 0, wrong = 0, unattempted = 0, negative = 0;
    const perQuestion = {};
    const subjects = {};
    attempt.sectionOrder.forEach(sid => {
      const sec = attempt.sections[sid];
      const st = { subjectId: sid, total: sec.questionIds.length, correct: 0, wrong: 0, unattempted: 0, timeSpent: 0, attempted: 0 };
      sec.questionIds.forEach(qid => {
        const q = questionMap[qid];
        const r = attempt.responses[qid] || { sel: null, state: Q.NOT_VISITED, timeSpent: 0 };
        const answered = !!r.sel;
        const key = q ? q.correctAnswer : null;
        let res = 'skip';
        if (answered && key) {
          res = (r.sel === key) ? 'correct' : 'wrong';
        }
        if (res === 'correct') { correct++; st.correct++; }
        else if (res === 'wrong') { wrong++; st.wrong++; }
        else { unattempted++; st.unattempted++; }
        st.attempted = st.correct + st.wrong;
        st.timeSpent += (r.timeSpent || 0);
        perQuestion[qid] = {
          sel: r.sel, key, result: res, state: r.state, timeSpent: r.timeSpent || 0
        };
      });
      st.score = st.correct * mk.correct + st.wrong * mk.wrong;
      st.accuracy = st.attempted > 0 ? Math.round((st.correct / st.attempted) * 1000) / 10 : 0;
      subjects[sid] = st;
    });
    negative = Math.abs(wrong * mk.wrong);
    const score = correct * mk.correct + wrong * mk.wrong;
    const attempted = correct + wrong;
    const total = attempt.sectionOrder.reduce((a, s) => a + attempt.sections[s].questionIds.length, 0);
    const timeTaken = attempt.endTime
      ? Math.max(0, Math.round(((attempt.endTime - attempt.startTime) - (attempt.pausedTotal || 0)) / 1000))
      : 0;
    return {
      score: Math.round(score * 100) / 100,
      maxScore: Math.round(total * mk.correct * 100) / 100,
      correct, wrong, unattempted, attempted, negative: Math.round(negative * 100) / 100,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0,
      attemptRate: Math.round((attempted / total) * 1000) / 10,
      timeTaken, total, subjects, perQuestion,
      marking: mk
    };
  }

  return {
    Q, S,
    createAttempt, touch, selectOption, clearResponse, markForReview,
    canOpenSection, gotoSection, gotoQuestion, saveNext, markReviewNext, previous,
    sectionSummary, submitSection, submitExam,
    accumulateTime, remainingMs, fastForward, pause, resume, recoverAway,
    assertValidPosition, globalNumber, allQuestionIds, evaluate,
    activeSection, sectionOf
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
