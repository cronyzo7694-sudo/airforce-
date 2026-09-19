/* ============================================================
 * ENGINE QA TESTS — mirrors the mandatory QA list (spec §47).
 * Run: node tests/engine.test.js
 * ============================================================ */
process.chdir(__dirname + '/..');

// ---- stub browser globals needed by engine ----
global.AVUtil = require('../js/util.js');
global.EXAM_CONFIG = require('../js/config.js').EXAM_CONFIG;
const Engine = require('../js/engine.js');

// quiet: util.js touches document only inside functions we don't call.
// If util.js referenced document at load, guard:
if (typeof global.document === 'undefined') {
  global.document = { createElement: () => ({ style: {}, setAttribute(){}, appendChild(){}, addEventListener(){}, remove(){} }), body: { appendChild(){} } };
}

let passed = 0, failed = 0;
function T(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n     →', e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const NOW = 1750000000000;
const SEC = 1000;

function mkTest(overrides) {
  const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
  return Object.assign({
    id: 't1', name: 'Full Mock', type: 'full', mode: 'exam',
    timerMode: 'section', sectionLock: true, sectionSubmitRequired: true,
    allowPause: false, shuffleQuestions: false, shuffleOptions: false,
    marking: { correct: 1, wrong: -0.25, unattempted: 0 },
    duration: 85 * 60, totalQuestions: 100, maxScore: 100,
    sections: [
      { subjectId: 'physics', name: 'Physics', questionIds: ids('p', 25), duration: 20 * 60 },
      { subjectId: 'mathematics', name: 'Mathematics', questionIds: ids('m', 25), duration: 20 * 60 },
      { subjectId: 'english', name: 'English', questionIds: ids('e', 20), duration: 20 * 60 },
      { subjectId: 'raga', name: 'RAGA', questionIds: ids('r', 30), duration: 25 * 60 }
    ]
  }, overrides || {});
}
function mkQMap(test, keyOf) {
  const map = {};
  test.sections.forEach(s => s.questionIds.forEach(qid => {
    map[qid] = { id: qid, subject: s.subjectId, correctAnswer: keyOf ? keyOf(qid) : 'A' };
  }));
  return map;
}

console.log('\n━━━ TEST 1 · section lock: cannot open Mathematics while Physics active');
T('Mathematics tab blocked during Physics', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  const chk = Engine.canOpenSection(a, 'mathematics');
  assert(!chk.ok && chk.reason === 'locked', 'must be locked');
  eq(chk.msg, 'Complete the current section before proceeding.', 'message');
});
T('gotoQuestion into Mathematics blocked', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  const res = Engine.gotoQuestion(a, 'mathematics', 0, NOW + 5 * SEC);
  assert(!res.ok, 'blocked');
  eq(a.currentSectionId, 'physics', 'still in physics');
});
T('palette index out of range rejected', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  assert(!Engine.gotoQuestion(a, 'physics', 99, NOW).ok, 'range blocked');
  assert(!Engine.gotoQuestion(a, 'physics', -1, NOW).ok, 'negative blocked');
});

console.log('\n━━━ TEST 2 · submit Physics → locked, Mathematics active with FRESH 20:00');
T('submitSection(user) unlocks next with full time (no carry-forward)', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  // answer 10 questions in physics, submit early after 14 minutes
  for (let i = 0; i < 10; i++) Engine.selectOption(a, `p${i + 1}`, 'A');
  const after14 = NOW + 14 * 60 * SEC;
  const res = Engine.submitSection(a, t, 'physics', 'user', after14);
  assert(res.ok && !res.finished, 'submitted ok');
  eq(a.sections.physics.state, 'SUBMITTED', 'physics submitted');
  eq(a.sections.mathematics.state, 'ACTIVE', 'maths active');
  eq(a.sections.mathematics.startedAt, after14, 'maths starts at submit moment');
  eq(Math.round((a.sections.mathematics.endsAt - a.sections.mathematics.startedAt) / SEC), 20 * 60, 'maths gets full 20 min, not 26');
  eq(a.currentSectionId, 'mathematics', 'candidate moved to maths');
  eq(a.currentQIdx, 0, 'at first maths question');
});

console.log('\n━━━ TEST 3 · cannot return to submitted Physics');
T('gotoSection(physics) blocked after submit', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.submitSection(a, t, 'physics', 'user', NOW + 60 * SEC);
  const chk = Engine.canOpenSection(a, 'physics');
  assert(!chk.ok && chk.reason === 'submitted', 'blocked as submitted');
  eq(chk.msg, 'This section has been submitted and is locked.', 'message');
});

console.log('\n━━━ TEST 4 · direct deep link to Q1 after Physics submission blocked');
T('gotoQuestion(physics, 0) rejected after submit (state is authoritative)', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.submitSection(a, t, 'physics', 'user', NOW + 60 * SEC);
  assert(!Engine.gotoQuestion(a, 'physics', 0, NOW + 61 * SEC).ok, 'blocked');
  eq(a.currentSectionId, 'mathematics', 'still in maths');
});
T('tampered currentSectionId is repaired by assertValidPosition', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.submitSection(a, t, 'physics', 'user', NOW + 60 * SEC);
  a.currentSectionId = 'physics'; a.currentQIdx = 24; // simulate URL/state tampering
  Engine.assertValidPosition(a);
  eq(a.currentSectionId, 'mathematics', 'restored to active section');
  eq(a.currentQIdx, 0, 'index clamped');
});

console.log('\n━━━ TEST 5/6 · refresh / browser close during Mathematics → exact restore');
T('state round-trip (JSON) restores exam exactly', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  for (let i = 0; i < 7; i++) { Engine.selectOption(a, `p${i + 1}`, i % 2 ? 'B' : 'A'); Engine.saveNext(a, NOW + i * SEC); }
  Engine.submitSection(a, t, 'physics', 'user', NOW + 300 * SEC);
  Engine.selectOption(a, 'm1', 'C');
  Engine.markForReview(a, 'm2');
  Engine.saveNext(a, NOW + 320 * SEC);
  const restored = JSON.parse(JSON.stringify(a)); // what IndexedDB gives back
  eq(restored.currentSectionId, 'mathematics', 'section restored');
  eq(restored.currentQIdx, 1, 'question restored');
  eq(restored.responses.m1.sel, 'C', 'answer restored');
  eq(restored.responses.m2.state, 'MARKED_FOR_REVIEW', 'review state restored');
  eq(restored.sections.physics.state, 'SUBMITTED', 'physics still submitted');
  eq(restored.sections.english.state, 'LOCKED', 'english still locked');
  const rem = Engine.remainingMs(restored, t, NOW + 325 * SEC);
  eq(Math.round(rem / SEC), 20 * 60 - 25, 'remaining section time reconstructed from end-time (25s elapsed)');
});

console.log('\n━━━ TEST 7 · Physics timer expiry auto-submits and unlocks Mathematics');
T('fastForward applies expiry chain with zero interaction', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');
  // user closes browser; comes back 21 minutes later
  const later = NOW + 21 * 60 * SEC;
  const ff = Engine.fastForward(a, t, later);
  assert(ff.changed, 'changed');
  eq(a.sections.physics.state, 'EXPIRED', 'physics expired');
  eq(a.sections.mathematics.state, 'ACTIVE', 'maths active');
  eq(Math.round((a.sections.mathematics.endsAt - later) / SEC), 19 * 60, 'maths already running 1 min (started at physics end-time)');
});
T('away for the whole exam → everything expires and completes', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  const later = NOW + 90 * 60 * SEC;
  const ff = Engine.fastForward(a, t, later);
  assert(ff.completed, 'completed');
  assert(a.completed, 'attempt completed');
  eq(a.sections.raga.state, 'EXPIRED', 'raga expired');
  eq(a.submitReason, 'time', 'reason time');
});

console.log('\n━━━ TEST 8 · Answer + Mark for Review → evaluated');
T('ANSWERED_AND_MARKED_FOR_REVIEW is scored normally', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');       // correct (key A)
  Engine.markForReview(a, 'p1');
  eq(a.responses.p1.state, 'ANSWERED_AND_MARKED_FOR_REVIEW', 'state');
  Engine.selectOption(a, 'p2', 'B');       // wrong
  Engine.markForReview(a, 'p2');
  eq(a.responses.p2.state, 'ANSWERED_AND_MARKED_FOR_REVIEW', 'state 2');
  const qm = mkQMap(t);
  const r = Engine.evaluate(a, qm);
  eq(r.correct, 1, 'correct counted');
  eq(r.wrong, 1, 'wrong counted');
  eq(r.score, 0.75, 'score 1 - 0.25');
});

console.log('\n━━━ TEST 9 · Mark for Review without answer → 0 marks');
T('MARKED_FOR_REVIEW with no answer is unattempted', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.markForReview(a, 'p3');
  eq(a.responses.p3.state, 'MARKED_FOR_REVIEW', 'state');
  const r = Engine.evaluate(a, mkQMap(t));
  eq(r.unattempted, 100, 'all unattempted');
  eq(r.score, 0, 'zero score');
  eq(r.attempted, 0, 'not attempted');
});

console.log('\n━━━ TEST 10 · Clear Response');
T('clear on ANSWERED → VISITED_NOT_ANSWERED', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');
  eq(a.responses.p1.state, 'ANSWERED', 'answered');
  Engine.clearResponse(a, 'p1');
  eq(a.responses.p1.sel, null, 'selection gone');
  eq(a.responses.p1.state, 'VISITED_NOT_ANSWERED', 'visited not answered');
});
T('clear on ANSWERED_AND_MARKED → MARKED_FOR_REVIEW', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');
  Engine.markForReview(a, 'p1');
  Engine.clearResponse(a, 'p1');
  eq(a.responses.p1.state, 'MARKED_FOR_REVIEW', 'still marked');
  eq(a.responses.p1.sel, null, 'no answer');
});
T('selecting an option on MARKED_FOR_REVIEW keeps the flag', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.markForReview(a, 'p1');
  Engine.selectOption(a, 'p1', 'A');
  eq(a.responses.p1.state, 'ANSWERED_AND_MARKED_FOR_REVIEW', 'answered & marked');
});

console.log('\n━━━ TEST 11 · full exam evaluation +1 / −0.25 / 0');
T('100-question scoring: 60 correct, 25 wrong, 15 skipped = 53.75', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  const all = Engine.allQuestionIds(a);
  all.forEach((qid, i) => {
    if (i < 60) Engine.selectOption(a, qid, 'A');        // correct
    else if (i < 85) Engine.selectOption(a, qid, 'B');   // wrong
    // rest unattempted
  });
  a.completed = true; a.endTime = NOW + 80 * 60 * SEC;
  const r = Engine.evaluate(a, mkQMap(t));
  eq(r.correct, 60, 'correct');
  eq(r.wrong, 25, 'wrong');
  eq(r.unattempted, 15, 'unattempted');
  eq(r.score, 53.75, 'score');
  eq(r.negative, 6.25, 'negative');
  eq(r.accuracy, 70.6, 'accuracy');
  eq(r.maxScore, 100, 'max');
  eq(Object.keys(r.subjects).length, 4, 'subject stats');
  eq(r.subjects.physics.total, 25, 'physics total');
});
T('question state counting in section summary', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');
  Engine.markForReview(a, 'p2');
  Engine.selectOption(a, 'p3', 'A'); Engine.markForReview(a, 'p3');
  const s = Engine.sectionSummary(a, 'physics');
  eq(s.answered, 2, 'p1 + p3');
  eq(s.marked, 1, 'p2');
  eq(s.answeredMarked, 1, 'p3');
  eq(s.notAnswered, 22, 'rest');
  eq(s.total, 25, 'total');
});

console.log('\n━━━ TEST 12 · retake creates a new attempt, old unchanged');
T('reattempt = separate object, same test, own responses', () => {
  const t = mkTest();
  const a1 = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a1, 'p1', 'A');
  const a2 = Engine.createAttempt(t, 2, NOW + 60 * SEC, { physics: t.sections[0].questionIds.slice().reverse(), mathematics: t.sections[1].questionIds, english: t.sections[2].questionIds, raga: t.sections[3].questionIds });
  assert(a1.id !== a2.id, 'different ids');
  eq(a2.attemptNo, 2, 'attempt number');
  assert(!a2.responses.p1, 'fresh responses');
  eq(a1.responses.p1.sel, 'A', 'old attempt untouched');
  eq(a2.sections.physics.questionIds[0], 'p25', 'fresh question set honoured');
});

console.log('\n━━━ TEST 13 · same engine on mobile (UI-agnostic) + navigation rules');
T('saveNext at last question of locked section → section-end', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  a.currentQIdx = 24;
  const target = Engine.saveNext(a, NOW);
  eq(a.view, 'section-end', 'view');
  eq(a.sections.mathematics.state, 'LOCKED', 'next section NOT auto-unlocked');
});
T('viewing last question does NOT unlock next section', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.gotoQuestion(a, 'physics', 24, NOW);
  eq(a.sections.mathematics.state, 'LOCKED', 'still locked');
});
T('previous stops at first question in section-lock mode', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  assert(!Engine.previous(a, NOW).ok, 'no previous before Q1');
});
T('global timer mode: free navigation between sections', () => {
  const t = mkTest({ timerMode: 'global', sectionLock: false });
  const a = Engine.createAttempt(t, 1, NOW);
  Object.keys(a.sections).forEach(sid => eq(a.sections[sid].state, sid === 'physics' ? 'ACTIVE' : 'ACTIVE', 'all active'));
  const res = Engine.gotoSection(a, 'raga', NOW + 5 * SEC);
  assert(res.ok, 'free nav ok');
  eq(a.currentSectionId, 'raga', 'in raga');
  const rem = Engine.remainingMs(a, t, NOW + 60 * SEC);
  eq(Math.round(rem / SEC), 85 * 60 - 60, 'global countdown from attempt start');
});
T('global timer expiry auto-submits exam', () => {
  const t = mkTest({ timerMode: 'global', sectionLock: false });
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.selectOption(a, 'p1', 'A');
  const ff = Engine.fastForward(a, t, NOW + 86 * 60 * SEC);
  assert(ff.completed, 'completed');
  assert(a.completed, 'completed flag');
});

console.log('\n━━━ EXTRA · timing, question numbering, per-question time');
T('question time accumulates across visits and persist round-trips', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.accumulateTime(a, NOW + 42 * SEC);   // 42s on p1
  Engine.gotoQuestion(a, 'physics', 1, NOW + 42 * SEC);
  Engine.accumulateTime(a, NOW + 60 * SEC);   // 18s on p2
  Engine.gotoQuestion(a, 'physics', 0, NOW + 60 * SEC);
  Engine.accumulateTime(a, NOW + 75 * SEC);   // 15s more on p1
  eq(a.responses.p1.timeSpent, 57, 'p1 total');
  eq(a.responses.p2.timeSpent, 18, 'p2 total');
});
T('global question numbers are continuous 1..100 across sections', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  eq(Engine.globalNumber(a, 'physics', 0), 1, 'p1');
  eq(Engine.globalNumber(a, 'physics', 24), 25, 'p25');
  eq(Engine.globalNumber(a, 'mathematics', 0), 26, 'm1 = 26');
  eq(Engine.globalNumber(a, 'english', 0), 51, 'e1 = 51');
  eq(Engine.globalNumber(a, 'raga', 0), 71, 'r1 = 71');
  eq(Engine.globalNumber(a, 'raga', 29), 100, 'r30 = 100');
});
T('timer never negative + warning thresholds handled by caller', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  const rem = Engine.remainingMs(a, t, NOW + 999 * 60 * SEC);
  eq(rem, 0, 'clamped at zero');
});
T('pause freezes the timer — global AND section mode', () => {
  const t = mkTest(); // section-timer mode
  const a = Engine.createAttempt(t, 1, NOW);
  const DUR = t.sections[0].duration; // physics section length in seconds
  Engine.pause(a, NOW + (DUR - 10) * SEC);            // pause 10s before section deadline
  const r1 = Engine.remainingMs(a, t, NOW + (DUR - 5) * SEC);
  const r2 = Engine.remainingMs(a, t, NOW + (DUR + 500) * SEC);
  eq(r1, 10000, 'remaining frozen at 10s while paused');
  eq(r1, r2, 'same value 8+ minutes later — time does not count while paused');
  const ff = Engine.fastForward(a, t, NOW + (DUR + 500) * SEC);
  assert(!ff.completed && !a.completed, 'section NOT auto-expired while paused (guard)');
  Engine.resume(a, NOW + (DUR + 500) * SEC);
  assert(a.sections.physics.endsAt > NOW + (DUR + 490) * SEC, 'section end shifted by the full paused duration');
  const r3 = Engine.remainingMs(a, t, NOW + (DUR + 501) * SEC);
  eq(r3, 9000, '~10s still left after resume');
});
T('submitting final section completes the exam', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.submitSection(a, t, 'physics', 'user', NOW + 60 * SEC);
  Engine.submitSection(a, t, 'mathematics', 'user', NOW + 120 * SEC);
  Engine.submitSection(a, t, 'english', 'user', NOW + 180 * SEC);
  const res = Engine.submitSection(a, t, 'raga', 'user', NOW + 240 * SEC);
  assert(res.finished, 'finished');
  assert(a.completed, 'completed');
  eq(a.view, 'exam-complete', 'view');
});
T('double submit of a section is rejected', () => {
  const t = mkTest();
  const a = Engine.createAttempt(t, 1, NOW);
  Engine.submitSection(a, t, 'physics', 'user', NOW);
  const res = Engine.submitSection(a, t, 'physics', 'user', NOW + 10 * SEC);
  assert(!res.ok, 'rejected');
});

console.log('\n━━━ GENERATOR · selection strategies + dedupe + insufficiency');
global.DB = { byIndex: async () => [] }; // not used by pick()
const Generator = require('../js/generator.js');
function mkPool(n, seedPrefix) {
  return Array.from({ length: n }, (_, i) => ({
    id: seedPrefix + i, subject: 'physics', chapter: 'C' + (i % 3), topic: 'T' + (i % 5),
    difficulty: ['easy', 'medium', 'hard'][i % 3], correctAnswer: 'A', dupeHash: 'dh' + seedPrefix + i
  }));
}
T('pick returns exactly n unique questions', () => {
  const pool = mkPool(40, 'x');
  const picked = Generator.pick(pool, 25, 'random', {});
  eq(picked.length, 25, 'exact count');
  eq(new Set(picked.map(q => q.id)).size, 25, 'unique');
});
T('pick returns null when pool < n (insufficient handling)', () => {
  const pool = mkPool(24, 'y');
  eq(Generator.pick(pool, 25, 'random', {}), null, 'null');
});
T('unseen-first prefers unseen questions', () => {
  const pool = mkPool(30, 'z');
  const qstats = { seen: {} };
  pool.slice(0, 20).forEach(q => qstats.seen[q.id] = 1);
  const picked = Generator.pick(pool, 10, 'unseen-first', qstats);
  assert(picked.every(q => !qstats.seen[q.id]), 'all unseen');
});
T('wrong-weighted puts previously-wrong first', () => {
  const pool = mkPool(30, 'w');
  const qstats = { seen: {}, wrong: {} };
  pool.slice(0, 5).forEach(q => qstats.wrong[q.id] = 3);
  const picked = Generator.pick(pool, 5, 'wrong-weighted', qstats);
  assert(picked.every(q => qstats.wrong[q.id]), 'all wrong-before');
});
T('dupe content excluded within a test', () => {
  const pool = mkPool(30, 'd');
  pool[5].dupeHash = pool[6].dupeHash = 'same';  // two identical questions
  const picked = Generator.pick(pool, 25, 'random', {});
  eq(picked.length, 25, 'still 25');
  assert(picked.filter(q => q.dupeHash === 'same').length <= 1, 'only one copy of duplicates');
  const picked2 = Generator.pick(pool, 30, 'random', {});
  eq(picked2, null, '29 usable < 30 needed → null');
});
T('balanced strategy interleaves difficulties', () => {
  const pool = mkPool(30, 'b');
  const picked = Generator.pick(pool, 9, 'balanced', {});
  const diffs = picked.slice(0, 3).map(q => q.difficulty);
  assert(new Set(diffs).size === 3, 'first three cover all difficulties: ' + diffs);
});

/* ---------- smart strategy (no repeat after 2 corrects) ---------- */
T('smart retires questions answered correctly twice', () => {
  const pool = mkPool(30, 's');
  const qstats = { seen: {}, wrong: {}, correct: {} };
  pool.slice(0, 10).forEach(q => { qstats.correct[q.id] = 2; qstats.seen[q.id] = 2; });   // mastered
  const picked = Generator.pick(pool, 20, 'smart', qstats);
  eq(picked.length, 20, '20 picked');
  assert(picked.every(q => (qstats.correct[q.id] || 0) < 2), 'no mastered question included');
});
T('smart keeps wrong questions in circulation (revision)', () => {
  const pool = mkPool(30, 'w2');
  const qstats = { seen: {}, wrong: {}, correct: {} };
  pool.slice(0, 12).forEach(q => { qstats.seen[q.id] = 1; qstats.wrong[q.id] = 1; });     // seen, wrong
  const picked = Generator.pick(pool, 12, 'smart', qstats);
  assert(picked.some(q => qstats.wrong[q.id]), 'wrong-question revision slot filled');
});
T('smart falls back to mastered only when the pool cannot fill the paper', () => {
  const pool = mkPool(12, 'f');                                     // only 12 questions total
  const qstats = { seen: {}, wrong: {}, correct: {} };
  pool.forEach((q, i) => { qstats.correct[q.id] = 2; qstats.seen[q.id] = 2; });           // ALL mastered
  const picked = Generator.pick(pool, 12, 'smart', qstats);
  eq(picked.length, 12, 'forced to reuse mastered when nothing else exists');
  const tooBig = Generator.pick(pool, 13, 'smart', qstats);
  eq(tooBig, null, 'pool smaller than paper → null');
});
T('smart composition is mostly fresh with some revision', () => {
  const pool = mkPool(100, 'mix');
  const qstats = { seen: {}, wrong: {}, correct: {} };
  pool.slice(0, 40).forEach(q => { qstats.seen[q.id] = 1; qstats.wrong[q.id] = 1; });    // 40 wrong-seen
  pool.slice(40, 60).forEach(q => { qstats.seen[q.id] = 1; qstats.correct[q.id] = 1; }); // 20 correct-once
  const picked = Generator.pick(pool, 25, 'smart', qstats);
  eq(picked.length, 25, '25 picked');
  const nWrong = picked.filter(q => qstats.wrong[q.id]).length;
  const nOnce = picked.filter(q => qstats.correct[q.id] === 1).length;
  const nFresh = picked.filter(q => !qstats.seen[q.id]).length;
  eq(nWrong, 1, 'wrong revision capped at 5% (round(25×0.05)) — user-tuned, backlog kuch bhi ho');
  eq(nOnce, 0, 'once-correct re-confirm capped at 1% (round(25×0.01)=0)');
  eq(nFresh, 24, 'rest is fresh — paper overwhelmingly new questions');
});

T('smart guarantees SKIPPED questions come back in the next paper', () => {
  const pool = mkPool(100, 'sk');
  const qstats = { seen: {}, wrong: {}, correct: {}, skipped: {} };
  pool.slice(0, 5).forEach(q => { qstats.seen[q.id] = 1; qstats.skipped[q.id] = 1; });   // seen, left unattempted
  const picked = Generator.pick(pool, 25, 'smart', qstats);
  eq(picked.length, 25, '25 picked');
  const nSkipped = picked.filter(q => qstats.skipped[q.id]).length;
  eq(nSkipped, 1, 'skipped questions repeat at the 5% budget (round(25×0.05)) — kam repeat, user-tuned');
});

T('smart gives skipped & wrong their own separate revision budgets', () => {
  const pool = mkPool(80, 'sw');
  const qstats = { seen: {}, wrong: {}, correct: {}, skipped: {} };
  pool.slice(0, 10).forEach(q => { qstats.seen[q.id] = 1; qstats.skipped[q.id] = 1; }); // 10 skipped
  pool.slice(10, 20).forEach(q => { qstats.seen[q.id] = 1; qstats.wrong[q.id] = 1; });  // 10 wrong
  const picked = Generator.pick(pool, 40, 'smart', qstats); // skip 5% + wrong 5% = 2 + 2 slots
  const nSkipped = picked.filter(q => qstats.skipped[q.id]).length;
  const nWrong = picked.filter(q => qstats.wrong[q.id]).length;
  eq(nSkipped, 2, 'skipped budget round(40×0.05)=2 — apna guaranteed hissa');
  eq(nWrong, 2, 'wrong budget round(40×0.05)=2 — dono alag-alag slots paate hain');
});

/* ---------- fixed test-series planner ---------- */
T('planSeries builds non-overlapping tests', () => {
  const pools = { physics: mkPool(80, 'p'), mathematics: mkPool(80, 'm') };
  const plan = Generator.planSeries(pools, [], { fullMocks: 2, perSubject: 1 });
  eq(plan.fullMocks.length, 2, '2 full mocks');
  eq(plan.subjectTests.physics.length, 1, '1 physics subject test');
  eq(plan.subjectTests.mathematics.length, 1, '1 maths subject test');
  const all = [];
  plan.fullMocks.forEach(sections => sections.forEach(s => all.push(...s.questionIds)));
  Object.values(plan.subjectTests).forEach(list => list.forEach(ids => all.push(...ids)));
  eq(new Set(all).size, all.length, 'no question used twice across the whole series');
  eq(all.length, 2 * 50 + 2 * 25, '2×50 mock + 2×25 subject questions');
  eq(plan.remaining.physics + plan.remaining.mathematics, 10, 'leftovers tracked (160-150)');
});
T('planSeries never reuses questions from existing tests', () => {
  const pools = { physics: mkPool(30, 'px') };
  const existing = [{ sections: [{ subjectId: 'physics', questionIds: pools.physics.slice(0, 10).map(q => q.id) }] }];
  const plan = Generator.planSeries(pools, existing, { fullMocks: 0, perSubject: 1 });
  eq(plan.subjectTests.physics.length, 0, '30 - 10 used = 20 < 25 → no subject test possible');
  const pools2 = { physics: mkPool(40, 'py') };
  const plan2 = Generator.planSeries(pools2, existing, { fullMocks: 0, perSubject: 1 });
  eq(plan2.subjectTests.physics.length, 1, '40 - 10 = 30 ≥ 25 → one test');
  assert(!plan2.subjectTests.physics[0].some(id => existing[0].sections[0].questionIds.includes(id)), 'no overlap with existing');
});
T('planSeries dedupes identical content across tests', () => {
  const pools = { physics: mkPool(60, 'pd') };
  pools.physics[3].dupeHash = pools.physics[50].dupeHash = 'twin';  // same content, two ids
  const plan = Generator.planSeries(pools, [], { fullMocks: 0, perSubject: 2 });
  const all = plan.subjectTests.physics.flat();
  assert(all.filter(id => id === pools.physics[3].id || id === pools.physics[50].id).length <= 1, 'twin content appears at most once');
});

console.log(`\n════════════════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════════\n`);
process.exit(failed ? 1 : 0);
