/* ============================================================
 * AGNIVEER VAYU CBT — TEST GENERATOR
 * Builds tests from the question bank without ever loading the
 * whole bank into memory (uses IndexedDB indexes + cursors).
 * ============================================================ */

const Generator = (() => {

  /* ---------- pool building ---------- */
  async function poolFor(spec, qstats) {
    /* spec: { subjectId, chapters?, topics?, difficulty?, years? } */
    const rows = await DB.byIndex('questions', 'subject', spec.subjectId);
    return rows.filter(q =>
      q.correctAnswer && !q.figureBased &&           // must be evaluable
      (!spec.chapters || spec.chapters.includes(q.chapter)) &&
      (!spec.topics || spec.topics.includes(q.topic)) &&
      (!spec.difficulty || spec.difficulty === 'all' || q.difficulty === spec.difficulty)
    );
  }

  /* ---------- selection strategies ---------- */
  const MASTERED_AFTER = 2; // answered correctly this many times → retired from future papers

  function pick(pool, n, strategy, qstats, exclude) {
    if (!Array.isArray(pool) || pool.length < n) return null;
    qstats = qstats || {};
    const seen = qstats.seen || {};      // qid -> times seen
    const wrong = qstats.wrong || {};    // qid -> wrong count
    const correct = qstats.correct || {}; // qid -> correct count
    const seenCount = q => seen[q.id] || 0;
    const wrongCount = q => wrong[q.id] || 0;
    const okCount = q => correct[q.id] || 0;

    // hard exclusion (used when building the fixed test series)
    let p = pool;
    if (exclude && exclude.size) p = pool.filter(q => !exclude.has(q.id));
    if (p.length < n) return null;

    let ranked;
    switch (strategy) {
      case 'random':
        ranked = AVUtil.shuffle(p.slice());
        break;
      case 'balanced': {
        // spread across difficulty levels present in the pool
        const byDiff = {};
        p.forEach(q => (byDiff[q.difficulty || 'medium'] = byDiff[q.difficulty || 'medium'] || []).push(q));
        Object.values(byDiff).forEach(a => AVUtil.shuffle(a));
        ranked = [];
        const keys = Object.keys(byDiff);
        let added = true;
        while (added) {
          added = false;
          for (const k of keys) { const q = byDiff[k].shift(); if (q) { ranked.push(q); added = true; } }
        }
        break;
      }
      case 'unseen-first': {
        const unseen = AVUtil.shuffle(p.filter(q => seenCount(q) === 0));
        const seenQ = AVUtil.shuffle(p.filter(q => seenCount(q) > 0));
        ranked = unseen.concat(seenQ);
        break;
      }
      case 'balanced-unseen': {
        const unseen = AVUtil.shuffle(p.filter(q => seenCount(q) === 0));
        const seenQ = AVUtil.shuffle(p.filter(q => seenCount(q) > 0));
        const byDiff = a => {
          const d = {};
          a.forEach(q => (d[q.difficulty || 'medium'] = d[q.difficulty || 'medium'] || []).push(q));
          const out = [];
          const keys = Object.keys(d);
          let added = true;
          while (added) {
            added = false;
            for (const k of keys) { const q = d[k].shift(); if (q) { out.push(q); added = true; } }
          }
          return out;
        };
        ranked = byDiff(unseen).concat(byDiff(seenQ));
        break;
      }
      case 'smart': {
        /* Real-paper feel:
           ~70% brand-new questions, ~20% revision of previously-wrong ones,
           ~10% one-more-confirmation of once-correct ones.
           A question answered correctly MASTERED_AFTER times is RETIRED — it only
           comes back if the pool literally cannot fill the paper without it. */
        const t1 = AVUtil.shuffle(p.filter(q => seenCount(q) === 0));          // fresh
        const t2 = AVUtil.shuffle(p.filter(q => seenCount(q) > 0 && okCount(q) === 0)); // seen, never correct → revise
        const t3 = AVUtil.shuffle(p.filter(q => okCount(q) === 1));            // correct once → re-confirm
        const t4 = p.filter(q => okCount(q) >= MASTERED_AFTER)                 // mastered → last resort
          .sort((a, b) => seenCount(a) - seenCount(b));
        const want2 = Math.round(n * 0.2), want3 = Math.round(n * 0.1);
        const take = (arr, k) => arr.splice(0, Math.max(0, k));
        let picked = take(t2, want2).concat(take(t3, want3));
        picked = take(t1, n - picked.length).concat(picked);
        for (const arr of [t1, t2, t3, t4]) { if (picked.length >= n) break; picked = picked.concat(take(arr, n - picked.length)); }
        ranked = picked.concat(t1, t2, t3, t4);
        break;
      }
      case 'weak-topic': {
        // weight toward topics the candidate performs poorly in
        const w = qstats.topicAcc || {};
        ranked = AVUtil.shuffle(p.slice()).sort((a, b) => (w[a.topic] ?? 50) - (w[b.topic] ?? 50));
        break;
      }
      case 'wrong-weighted': {
        // previously incorrect questions first
        ranked = AVUtil.shuffle(p.slice()).sort((a, b) => wrongCount(b) - wrongCount(a));
        break;
      }
      default:
        ranked = AVUtil.shuffle(p.slice());
    }

    // dedupe identical content (dupeHash) within one test
    const chosen = [];
    const usedHash = new Set();
    for (const q of ranked) {
      if (chosen.length >= n) break;
      const dh = q.dupeHash || q.id;
      if (usedHash.has(dh)) continue;
      usedHash.add(dh);
      chosen.push(q);
    }
    return chosen.length >= n ? chosen : null;
  }

  /* ---------- fixed test-series planning (pure — unit-testable) ----------
     Builds NON-OVERLAPPING ready-made tests: a question never appears in two
     different tests of the series. Returns fewer tests than asked for if the
     unused pool runs out. */
  function planSeries(pools, existingTests, opts) {
    const o = Object.assign({ fullMocks: 0, perSubject: 0, questionsPerTest: 25 }, opts || {});
    const usedId = new Set();
    (existingTests || []).forEach(t => (t.sections || []).forEach(s => (s.questionIds || []).forEach(qid => usedId.add(qid))));
    const subjectIds = Object.keys(pools);

    const avail = {}, usedHash = new Set();
    for (const sid of subjectIds) {
      const qs = AVUtil.shuffle((pools[sid] || []).filter(q => !usedId.has(q.id)));
      avail[sid] = [];
      const seenHash = new Set();
      for (const q of qs) {
        const h = q.dupeHash || q.id;
        if (seenHash.has(h) || usedHash.has(h)) continue;
        seenHash.add(h); usedHash.add(h);
        avail[sid].push(q);
      }
    }

    const perQ = o.questionsPerTest;
    const fullMocks = [];
    const mockMax = Math.min(o.fullMocks, ...subjectIds.map(sid => Math.floor(avail[sid].length / perQ)));
    for (let m = 0; m < mockMax; m++) {
      fullMocks.push(subjectIds.map(sid => ({ subjectId: sid, questionIds: avail[sid].splice(0, perQ).map(q => q.id) })));
    }
    const subjectTests = {};
    for (const sid of subjectIds) {
      subjectTests[sid] = [];
      const maxT = Math.min(o.perSubject, Math.floor(avail[sid].length / perQ));
      for (let t = 0; t < maxT; t++) subjectTests[sid].push(avail[sid].splice(0, perQ).map(q => q.id));
    }
    const remaining = {};
    for (const sid of subjectIds) remaining[sid] = avail[sid].length;
    return { fullMocks, subjectTests, remaining };
  }

  /* ---------- shared test-object assembly ---------- */
  function assembleTest(opts, builtSections, C, createdAt) {
    const total = builtSections.reduce((a, s) => a + s.questionIds.length, 0);
    const marking = opts.marking || C.marking;
    const timerMode = opts.timerMode || (opts.mode === 'practice' ? 'global' : C.timerMode);
    const sectionLock = opts.sectionLock != null ? opts.sectionLock : (opts.mode === 'practice' ? false : C.sectionLock);
    const duration = opts.duration != null
      ? opts.duration
      : (timerMode === 'section'
          ? builtSections.reduce((a, s) => a + s.duration, 0)
          : Math.round(total * 51)); // ~51s/question default practice duration
    const test = {
      id: 't_' + AVUtil.uid('x'),
      name: opts.name,
      type: opts.type || 'custom',
      mode: opts.mode || 'exam',
      createdAt: createdAt != null ? createdAt : Date.now(),
      duration,
      timerMode,
      sectionLock,
      sectionSubmitRequired: opts.sectionSubmitRequired != null ? opts.sectionSubmitRequired : (opts.mode === 'practice' ? false : C.sectionSubmitRequired),
      allowPause: !!opts.allowPause && opts.mode === 'practice',
      shuffleQuestions: !!opts.shuffleQuestions,
      shuffleOptions: !!opts.shuffleOptions,
      instantExplanation: !!opts.instantExplanation && opts.mode === 'practice',
      marking,
      strategy: opts.strategy || C.selectionStrategy || 'smart',
      sections: builtSections,
      totalQuestions: total,
      maxScore: Math.round(total * marking.correct * 100) / 100
    };
    if (opts.shuffleQuestions) test.sections.forEach(s => s.questionIds = AVUtil.shuffle(s.questionIds));
    return test;
  }

  /* ---------- test creation ---------- */
  async function generate(opts) {
    /* opts:
       { name, type ('full'|'subject'|'chapter'|'topic'|'custom'),
         mode ('exam'|'practice'),
         sections: [{ subjectId, count, chapters?, topics?, difficulty? }],
         duration (seconds, optional — auto-computed if omitted for full),
         timerMode, sectionLock, sectionSubmitRequired, allowPause,
                         shuffleQuestions, shuffleOptions, instantExplanation,
         strategy, marking } */
    const cfg = await Store.getSetting('config', null);
    const C = cfg || EXAM_CONFIG;
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, topicAcc: {} });
    const strategy = opts.strategy || C.selectionStrategy || 'balanced-unseen';

    const availability = [];
    const builtSections = [];
    for (const spec of opts.sections) {
      const pool = await poolFor(spec, qstats);
      availability.push({ subjectId: spec.subjectId, available: pool.length, needed: spec.count });
      const chosen = pick(pool, spec.count, spec.strategy || strategy, qstats);
      if (!chosen) {
        return { ok: false, availability, error: 'Not enough questions available to generate this test.' };
      }
      let qids = chosen.map(q => q.id);
      if (opts.shuffleOptions) {
        // per-attempt option shuffling is applied at render time using a
        // deterministic mapping stored on the test; here we mark it only.
      }
      const subCfg = C.subjects.find(s => s.id === spec.subjectId) || {};
      builtSections.push({
        subjectId: spec.subjectId,
        name: subCfg.name || spec.subjectId,
        questionIds: qids,
        duration: spec.duration != null ? spec.duration : (subCfg.duration || C.duration),
        chapters: spec.chapters || null,
        topics: spec.topics || null,
        difficulty: spec.difficulty || 'all'
      });
    }

    const test = assembleTest({ ...opts, strategy }, builtSections, C, Date.now());
    await DB.put('tests', test);
    return { ok: true, test };
  }

  /* ---------- ready-made test series (library of fixed tests) ----------
     Fixed tests with ZERO question overlap between them — a proper
     coaching-style test series, ready in the library. */
  async function buildSeries(opts) {
    const o = Object.assign({ fullMocks: 5, perSubject: 2 }, opts || {});
    const C = await Store.getSetting('config', null) || EXAM_CONFIG;

    const pools = {};
    for (const s of C.subjects) pools[s.id] = await poolFor({ subjectId: s.id });
    const existing = await DB.getAll('tests');
    const plan = planSeries(pools, existing, { fullMocks: o.fullMocks, perSubject: o.perSubject });

    // continue numbering from existing series tests
    let fullCount = 0; const subCount = {};
    existing.forEach(t => {
      if (!t.series) return;
      if (t.type === 'full') fullCount++;
      else if (t.type === 'subject' && t.sections[0]) subCount[t.sections[0].subjectId] = (subCount[t.sections[0].subjectId] || 0) + 1;
    });

    const now = Date.now(); let k = 0;
    const made = [];
    for (let i = 0; i < plan.fullMocks.length; i++) {
      const sections = plan.fullMocks[i].map(sec => {
        const subCfg = C.subjects.find(s => s.id === sec.subjectId) || {};
        return { subjectId: sec.subjectId, name: subCfg.name || sec.subjectId, questionIds: sec.questionIds,
                 duration: subCfg.duration || C.duration, chapters: null, topics: null, difficulty: 'all' };
      });
      const t = assembleTest({ name: `Full Mock Test ${fullCount + i + 1}`, type: 'full', mode: 'exam' }, sections, C, now - k++);
      t.series = true; t.seriesNo = fullCount + i + 1;
      await DB.put('tests', t); made.push(t);
    }
    for (const sid of Object.keys(plan.subjectTests)) {
      const subCfg = C.subjects.find(s => s.id === sid) || {};
      for (let j = 0; j < plan.subjectTests[sid].length; j++) {
        const sections = [{ subjectId: sid, name: subCfg.name || sid, questionIds: plan.subjectTests[sid][j],
                            duration: subCfg.duration || C.duration, chapters: null, topics: null, difficulty: 'all' }];
        const t = assembleTest({ name: `${subCfg.name || sid} Test ${(subCount[sid] || 0) + j + 1}`, type: 'subject', mode: 'practice' }, sections, C, now - k++);
        t.series = true; t.seriesSubject = sid; t.seriesNo = (subCount[sid] || 0) + j + 1;
        await DB.put('tests', t); made.push(t);
      }
    }
    return { ok: true, made: made.length, full: plan.fullMocks.length,
             subject: Object.values(plan.subjectTests).reduce((a, b) => a + b.length, 0),
             remaining: plan.remaining };
  }

  /* ---------- blueprint presets ---------- */
  async function fullMock(strategyOverride) {
    const C = await Store.getSetting('config', null) || EXAM_CONFIG;
    return generate({
      name: `Full Mock Test · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      type: 'full',
      mode: 'exam',
      sections: C.subjects.map(s => ({ subjectId: s.id, count: s.questions })),
      strategy: strategyOverride || C.selectionStrategy
    });
  }

  async function subjectTest(subjectId) {
    const C = await Store.getSetting('config', null) || EXAM_CONFIG;
    const s = C.subjects.find(x => x.id === subjectId);
    if (!s) return { ok: false, error: 'Unknown subject' };
    return generate({
      name: `${s.name} Subject Test`,
      type: 'subject',
      mode: 'practice',
      sections: [{ subjectId, count: s.questions }]
    });
  }

  return { generate, fullMock, subjectTest, buildSeries, planSeries, poolFor, pick, MASTERED_AFTER };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
