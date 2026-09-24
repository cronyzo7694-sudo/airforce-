/* ============================================================
 * AGNIVEER VAYU CBT — TEST GENERATOR
 * Builds tests from the question bank without ever loading the
 * whole bank into memory (uses IndexedDB indexes + cursors).
 * ============================================================ */

const Generator = (() => {

  /* ---------- pool building ---------- */
  async function poolFor(spec, qstats) {
    /* spec: { subjectId, chapters?, topics?, difficulty?, years? } — pools are
       scoped to the selected exam so future exams (Navy/Army/…) never mix banks */
    const exam = (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce';
    const blocked = await blockedInfo();
    const rows = await DB.byIndex('questions', 'subject', spec.subjectId);
    return rows.filter(q =>
      q.correctAnswer && (!q.figureBased || q.image) &&  // must be evaluable (v1.4.74: figure-based + image dikhne wala = evaluable)
      (q.exam || 'airforce') === exam &&            // exam-scoped bank
      !blocked.ids.has(q.id) &&                     // reported by candidate →
      !(q.dupeHash && blocked.hashes.has(q.dupeHash)) && //   never again, even after re-import
      (!spec.chapters || spec.chapters.includes(q.chapter)) &&
      (!spec.topics || spec.topics.includes(q.topic)) &&
      (!spec.difficulty || spec.difficulty === 'all' || q.difficulty === spec.difficulty)
    );
  }

  /* ---------- blocked-question registry ----------
     The candidate can report (🚩) a question mid-test: it is blocked FOREVER
     on this device, immediately swapped for a fresh one, and excluded from
     every future paper. Blocks are stored by dupeHash (content identity), so
     they survive bank re-imports and id regeneration. */
  async function blockedInfo() {
    const list = (await Store.getMeta('blockedQ', [])) || [];
    const ids = new Set(), hashes = new Set();
    list.forEach(b => { if (b.id) ids.add(b.id); if (b.h) hashes.add(b.h); });
    return { list, ids, hashes };
  }

  async function blockQuestion(q) {
    const list = (await Store.getMeta('blockedQ', [])) || [];
    const h = q.dupeHash || null;
    if (list.some(b => (h && b.h === h) || b.id === q.id)) return false;
    list.push({ h, id: q.id, subject: q.subject || null, ts: Date.now() });
    await Store.setMeta('blockedQ', list);
    return true;
  }

  function usableQ(q, exam) {
    return !!(q && q.correctAnswer && (!q.figureBased || q.image) && (q.exam || 'airforce') === exam);   // v1.4.74: image-backed figure Qs usable
  }

  /* pick a same-subject replacement the candidate hasn't been shown yet
     (prefers the same chapter so the paper's flavour stays intact) */
  async function findReplacement(o) {
    // o: { subjectId, chapter?, excludeIds: Set, excludeHashes: Set }
    const exam = (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce';
    const info = await blockedInfo();
    const rows = await DB.byIndex('questions', 'subject', o.subjectId);
    const cand = rows.filter(q =>
      usableQ(q, exam) &&
      !info.ids.has(q.id) && !(q.dupeHash && info.hashes.has(q.dupeHash)) &&
      !(o.excludeIds && o.excludeIds.has(q.id)) &&
      !(o.excludeHashes && q.dupeHash && o.excludeHashes.has(q.dupeHash))
    );
    if (!cand.length) return null;
    const sameChapter = o.chapter ? cand.filter(q => q.chapter === o.chapter) : [];
    const pool = sameChapter.length ? sameChapter : cand;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* Replace any blocked question in the (optional fresh) sets with a
     same-subject replacement — a blocked question can NEVER enter a new
     attempt, even from ready-made series tests built before the block. */
  async function sanitizeSections(test, questionSets) {
    const info = await blockedInfo();
    if (!info.list.length) return questionSets;
    const seedSets = questionSets || {};
    const baseIds = new Set();
    test.sections.forEach(sec => {
      ((seedSets[sec.subjectId] && seedSets[sec.subjectId].slice()) || sec.questionIds).forEach(qid => baseIds.add(qid));
    });
    const rows = await DB.getMany('questions', [...baseIds]);
    const inUseIds = new Set(baseIds), inUseHashes = new Set(), qById = {};
    rows.forEach(q => { if (q) { qById[q.id] = q; if (q.dupeHash) inUseHashes.add(q.dupeHash); } });
    const out = {};
    for (const sec of test.sections) {
      const base = (seedSets[sec.subjectId] && seedSets[sec.subjectId].slice()) || sec.questionIds;
      out[sec.subjectId] = [];
      for (const qid of base) {
        const q = qById[qid];
        const blocked = info.ids.has(qid) || (q && q.dupeHash && info.hashes.has(q.dupeHash));
        if (!blocked) { out[sec.subjectId].push(qid); continue; }
        const rep = await findReplacement({ subjectId: sec.subjectId, chapter: q && q.chapter, excludeIds: inUseIds, excludeHashes: inUseHashes });
        if (rep) { out[sec.subjectId].push(rep.id); inUseIds.add(rep.id); if (rep.dupeHash) inUseHashes.add(rep.dupeHash); }
        else out[sec.subjectId].push(qid); // subject pool exhausted — keep rather than shrink the paper
      }
    }
    return out;
  }

  /* ---------- selection strategies ---------- */
  const MASTERED_AFTER = 2; // answered correctly this many times → retired from future papers

  function pick(pool, n, strategy, qstats, exclude) {
    if (!Array.isArray(pool) || pool.length < n) return null;
    qstats = qstats || {};
    const seen = qstats.seen || {};      // qid -> times seen
    const wrong = qstats.wrong || {};    // qid -> wrong count
    const correct = qstats.correct || {}; // qid -> correct count
    const skipped = qstats.skipped || {}; // qid -> left-unattempted count (must repeat)
    const seenCount = q => seen[q.id] || 0;
    const wrongCount = q => wrong[q.id] || 0;
    const okCount = q => correct[q.id] || 0;
    const skipCount = q => skipped[q.id] || 0;
    const reviseWeight = q => wrongCount(q) + 2 * skipCount(q); // skipped first (never faced), then wrong → repeat

    // hard exclusion (used when building the fixed test series)
    let p = pool;
    if (exclude && exclude.size) p = pool.filter(q => !exclude.has(q.id));
    if (p.length < n) return null;

    let ranked;
    switch (strategy) {
      case 'realpaper': {
        /* ═══ REAL PAPER BLUEPRINT ═══
           Bank 100% asli PYQs se bana hai — isliye bank ka chapter-ratio
           HI asli exam ka blueprint hai (e.g. Optics ≈ 9% of real physics
           questions → 25 Q ke section me ~2). Har test isi weightage se
           banta hai. Candidate ke marks/performance ka isme KOI role nahi —
           bilkul asli exam jaisa. Andar sirf itna rotation hai ki naye
           (unseen) questions pehle aayein, taaki har paper fresh lage. */
        const byCh = {};
        p.forEach(q => { const c = q.chapter || 'General'; (byCh[c] = byCh[c] || []).push(q); });
        const chapters = Object.keys(byCh);
        const totalPool = p.length;
        const alloc = {};
        let used = 0;
        const rem = [];
        chapters.forEach(c => {
          const exact = byCh[c].length * n / totalPool;
          alloc[c] = Math.floor(exact);
          used += alloc[c];
          rem.push({ c: c, frac: exact - alloc[c] });
        });
        rem.sort((a, b) => b.frac - a.frac);          // largest remainder first
        let left = n - used;
        for (let i = 0; i < rem.length && left > 0; i++)
          if (alloc[rem[i].c] < byCh[rem[i].c].length) { alloc[rem[i].c]++; left--; }
        while (left > 0) {                             // pool skewed ho to bharo
          const before = left;
          const order = chapters.slice().sort((a, b) => byCh[b].length - byCh[a].length);
          for (const c of order) {
            if (!left) break;
            if (alloc[c] < byCh[c].length) { alloc[c]++; left--; }
          }
          if (left === before) break;
        }
        const queues = {};
        chapters.forEach(c => {
          const unseen = AVUtil.shuffle(byCh[c].filter(q => seenCount(q) === 0));
          const seenQ = AVUtil.shuffle(byCh[c].filter(q => seenCount(q) > 0));
          queues[c] = unseen.concat(seenQ);           // rotation only — performance nahi
        });
        const taken = {}; chapters.forEach(c => taken[c] = 0);
        const pickedSet = new Set();
        ranked = [];
        while (ranked.length < n) {
          let added = false;
          const order = chapters.slice().sort((a, b) => alloc[b] - alloc[a]);
          for (const c of order) {                    // round-robin → natural mixed order
            if (ranked.length >= n) break;
            if (taken[c] < alloc[c]) {
              const q = queues[c][taken[c]++];
              ranked.push(q); pickedSet.add(q.id); added = true;
            }
          }
          if (!added) break;
        }
        ranked = ranked.concat(AVUtil.shuffle(p.filter(q => !pickedSet.has(q.id))));
        break;
      }
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
        const seenQ = AVUtil.shuffle(p.filter(q => seenCount(q) > 0))
          .sort((a, b) => reviseWeight(b) - reviseWeight(a)); // skipped/wrong repeat first
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
        /* User-tuned repetition budget — paper hamesha fresh-heavy rahe:
           ~5% previously-SKIPPED + ~5% previously-WRONG + ~1% once-correct
           revision; baaki sab brand-new questions.
           (Pehle 20-35% + 10% revision quota tha — "same paper" feel aa
           raha tha. Backlog kuch bhi ho, ye caps kabhi nahi badhte.) */
        const fresh = AVUtil.shuffle(p.filter(q => seenCount(q) === 0));
        const wrongQ = AVUtil.shuffle(p.filter(q => wrongCount(q) > 0 && okCount(q) === 0))
          .sort((a, b) => reviseWeight(b) - reviseWeight(a));   // sabse purana galti pehle
        const skipQ = AVUtil.shuffle(p.filter(q => skipCount(q) > 0 && wrongCount(q) === 0 && okCount(q) === 0))
          .sort((a, b) => reviseWeight(b) - reviseWeight(a));   // jo kabhi face hi nahi hua
        const t3 = AVUtil.shuffle(p.filter(q => okCount(q) === 1));            // correct once → 1% re-confirm
        const t4 = p.filter(q => okCount(q) >= MASTERED_AFTER)                 // mastered → absolute last resort
          .sort((a, b) => seenCount(a) - seenCount(b));
        const take = (arr, k) => arr.splice(0, Math.max(0, k));
        let picked = take(skipQ, Math.round(n * 0.05))
          .concat(take(wrongQ, Math.round(n * 0.05)))
          .concat(take(t3, Math.max(0, Math.round(n * 0.01))));
        picked = picked.concat(take(fresh, n - picked.length));
        // safety valve: unseen pool khatam ho gaya ho to hi baaki se bharo
        for (const arr of [fresh, skipQ, wrongQ, t3, t4]) { if (picked.length >= n) break; picked = picked.concat(take(arr, n - picked.length)); }
        ranked = picked.concat(fresh, skipQ, wrongQ, t3, t4);
        break;
      }
      case 'weak-topic': {
        // weight toward topics the candidate performs poorly in
        /* v1.4.48: topicAcc keys ab 'exam␟subject␟topic' (legacy = subject␟topic);
           purana w[a.topic] lookup kabhi match hi nahi karta tha — ab sahi key se. */
        const w = qstats.topicAcc || {};
        const curEx = (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce';
        const accOf = q => w[curEx + '␟' + q.subject + '␟' + q.topic] ?? w[q.subject + '␟' + q.topic] ?? 50;
        ranked = AVUtil.shuffle(p.slice()).sort((a, b) => accOf(a) - accOf(b));
        break;
      }
      case 'wrong-weighted': {
        // previously incorrect OR skipped questions first
        ranked = AVUtil.shuffle(p.slice()).sort((a, b) => reviseWeight(b) - reviseWeight(a));
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
    /* v1.4.55: real-exam chapter mix — series tests bhi blueprint-weighted
       selection se bante hain (pick 'realpaper'), random splice se NAHI.
       Pehle ek hi chapter ke 25 questions aa sakte the — real exam me har
       chapter se balanced mix hota hai (bank ka chapter-ratio hi blueprint). */
    const takeDiverse = sid => {
      const picked = pick(avail[sid], perQ, 'realpaper', null);
      if (picked && picked.length) {
        const ids = new Set(picked.map(q => q.id));
        avail[sid] = avail[sid].filter(q => !ids.has(q.id));
        return picked.map(q => q.id);
      }
      return avail[sid].splice(0, perQ).map(q => q.id);   // fallback
    };
    /* v1.4.63 BALANCED SERIES: chhote (growing) bank me full mocks saare
       questions kha nahi jaate — har subject ke liye kam-se-kam 1 subject
       test reserve hota hai: mockMax = min(fullMocks, minS − 1), jahan
       minS = sabse chhote subject ke possible perQ-size tests. Bade bank
       pe minS bada hota hai → mockMax = fullMocks (pehle jaisa behaviour). */
    const minS = subjectIds.length ? Math.min(...subjectIds.map(sid => Math.floor(avail[sid].length / perQ))) : 0;
    const mockMax = Math.min(o.fullMocks, Math.max(0, minS - 1));
    const fullMocks = [];
    for (let m = 0; m < mockMax; m++) {
      fullMocks.push(subjectIds.map(sid => ({ subjectId: sid, questionIds: takeDiverse(sid) })));
    }
    const subjectTests = {};
    for (const sid of subjectIds) {
      subjectTests[sid] = [];
      const maxT = Math.min(o.perSubject, Math.floor(avail[sid].length / perQ));
      for (let t = 0; t < maxT; t++) subjectTests[sid].push(takeDiverse(sid));
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
          /* v1.4.51 fix: global-timer EXAM (SSC CHSL 60 min) pe official
             C.duration use hota hai — 51s/question wala default sirf
             practice/custom tests ke liye (SSC mock pe 85 min lag raha tha!) */
          : (opts.mode === 'exam' && C && C.duration ? C.duration : Math.round(total * 51)));
    const test = {
      id: 't_' + AVUtil.uid('x'),
      name: opts.name,
      exam: (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce',
      type: opts.type || 'custom',
      mode: opts.mode || 'exam',
      createdAt: createdAt != null ? createdAt : Date.now(),
      duration,
      timerMode,
      sectionLock,
      sectionSubmitRequired: opts.sectionSubmitRequired != null ? opts.sectionSubmitRequired : (opts.mode === 'practice' ? false : C.sectionSubmitRequired),
      allowPause: opts.allowPause != null ? !!opts.allowPause : true,  // HAR test me pause (user setting)
      shuffleQuestions: !!opts.shuffleQuestions,
      shuffleOptions: !!opts.shuffleOptions,
      instantExplanation: !!opts.instantExplanation && opts.mode === 'practice',
      marking,
      strategy: opts.strategy || C.selectionStrategy || 'realpaper',
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
    /* v1.4.46: exam-aware config (App.config rebuild per current exam) */
    const C = (typeof App !== 'undefined' && App.config) ? (App.configCache || await App.config()) : ((await Store.getSetting('config', null)) || EXAM_CONFIG);
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, correct: {}, skipped: {}, topicAcc: {} });
    const strategy = opts.strategy || C.selectionStrategy || 'realpaper';

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
    /* v1.4.47: series SIRF current exam ke REBUILT config se. Raw saved
       'config' partial hota hai — non-airforce exams me subjects overrides
       me rehte hain (flat me nahi) → C.subjects undefined crash; aur purane
       exam ka saved config mix ho sakta tha (SSC switch pe airforce subjects
       → pools khali → full mock KABHI nahi banta tha). */
    const seriesExam = (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce';
    let C;
    if (typeof App !== 'undefined' && App.configCache && App.configCache.subjects) {
      C = App.configCache;                                  // browser: rebuilt current-exam config
    } else if (typeof EXAM_CONFIGS !== 'undefined' && EXAM_CONFIGS[seriesExam]) {
      C = EXAM_CONFIGS[seriesExam];
    } else if (typeof Store !== 'undefined') {
      C = (await Store.getSetting('config', null)) || EXAM_CONFIG;   // legacy/Node
    } else {
      C = EXAM_CONFIG;
    }
    if (!C || !C.subjects) C = (typeof EXAM_CONFIGS !== 'undefined' && EXAM_CONFIGS[seriesExam]) || EXAM_CONFIG;
    if (C.exam !== seriesExam && typeof EXAM_CONFIGS !== 'undefined' && EXAM_CONFIGS[seriesExam]) {
      C = EXAM_CONFIGS[seriesExam];                          // safety: exam mismatch kabhi mix nahi
    }
    const pools = {};
    /* v1.4.69: opts.subjects — sirf inhi subjects ke pools banao (heal top-up
       ke liye; baaki subjects ke existing tests chhue-bina rehte hain) */
    const want = Array.isArray(o.subjects) && o.subjects.length ? o.subjects : null;
    for (const s of C.subjects) if (!want || want.includes(s.id)) pools[s.id] = await poolFor({ subjectId: s.id });
    const existing = await DB.getAll('tests');
    const plan = planSeries(pools, existing, { fullMocks: o.fullMocks, perSubject: o.perSubject });

    // continue numbering from existing series tests — v1.4.47: EXAM-SCOPED
    // (SSC ka "Mathematics Test 1" airforce ke 5 tests ke baad "Test 6" nahi)
    let fullCount = 0; const subCount = {};
    existing.forEach(t => {
      if (!t.series) return;
      if ((t.exam || 'airforce') !== seriesExam) return;
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
      /* v1.4.46: exam-aware series naam — SSC ka mock airforce ke "Full Mock
         Test N" se naam-match isolation kabhi nahi todega */
      const mockLabel = seriesExam === 'ssc-chsl' ? `SSC CHSL Mock Test ${fullCount + i + 1}` : `Full Mock Test ${fullCount + i + 1}`;
      const t = assembleTest({ name: mockLabel, type: 'full', mode: 'exam' }, sections, C, now - k++);
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
    /* v1.4.46: App.config() exam-aware base deta hai (Store ka flat legacy nahi) */
    const C = (typeof App !== 'undefined' && App.config) ? (App.configCache || await App.config()) : (await Store.getSetting('config', null) || EXAM_CONFIG);
    return generate({
      name: `Full Mock Test · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      type: 'full',
      mode: 'exam',
      sections: C.subjects.map(s => ({ subjectId: s.id, count: s.questions })),
      strategy: strategyOverride || C.selectionStrategy
    });
  }

  async function subjectTest(subjectId) {
    const C = (typeof App !== 'undefined' && App.config) ? (App.configCache || await App.config()) : (await Store.getSetting('config', null) || EXAM_CONFIG);
    const s = C.subjects.find(x => x.id === subjectId);
    if (!s) return { ok: false, error: 'Unknown subject' };
    return generate({
      name: `${s.name} Subject Test`,
      type: 'subject',
      mode: 'practice',
      sections: [{ subjectId, count: s.questions }]
    });
  }

  /* ---------- auto-build ----------
     Whenever new questions enter the bank (import page or bundled-file sync),
     this tops up the ready-made library: up to 5 full mocks + 5 subject tests
     per trigger, zero-overlap with everything attempted-able before. Returns
     the number of tests created (0 when material is exhausted). */
  async function autoBuild() {
    try {
      const r = await buildSeries({ fullMocks: 5, perSubject: 5 });
      return r.made || 0;
    } catch (e) { return 0; }
  }

  return { generate, fullMock, subjectTest, buildSeries, planSeries, poolFor, pick, autoBuild, MASTERED_AFTER,
           blockedInfo, blockQuestion, findReplacement, sanitizeSections };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
