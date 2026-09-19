/* ============================================================
 * AGNIVEER VAYU CBT — SEED LOADER + QUESTION IMPORTER
 * Loads the bundled PYQ bank on first run; also powers the
 * Import page (files → dedupe → IndexedDB).
 * ============================================================ */

const Bank = (() => {

  function contentId(q) {
    return 'q_' + AVUtil.hash([q.subject, q.questionText, q.options.map(o => o.text).join(' | '), q.correctAnswer || '?'].join('␟'));
  }
  function dupeId(q) {
    return AVUtil.hash([q.subject, q.questionText, q.options.map(o => o.text).join(' | ')].join('␟'));
  }

  /* --------- import a batch of parsed questions --------- */
  const SUBJECT_ALIAS = { reasoning: 'raga', 'reasoning-and-general-awareness': 'raga', 'general-awareness': 'raga', 'general-knowledge': 'raga', gk: 'raga', 'general-science': 'raga', maths: 'mathematics', math: 'mathematics', phy: 'physics', phys: 'physics', eng: 'english' };

  async function importBatch(questions, onProgress, exam) {
    const report = {
      total: questions.length, imported: 0, duplicates: 0, replaced: 0,
      bySubject: { physics: 0, mathematics: 0, english: 0, raga: 0 },
      invalid: 0, missingAnswers: 0, withImages: 0, withoutExplanation: 0, errors: []
    };

    // preload existing dupeHashes in memory (fast enough for 10k+ rows via cursor)
    const byDupe = new Map();
    await DB.cursor('questions', 'dupeHash', q => { byDupe.set(q.dupeHash, q); });

    const toPut = [];
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      // subject aliases — RAGA paper ke sub-topics kabhi alag naam se aate hain
      // (reasoning / general-awareness / GK converters) — ek hi subject hai: raga
      if (SUBJECT_ALIAS[q.subject]) q.subject = SUBJECT_ALIAS[q.subject];
      if (!q.subject || !q.questionText || !Array.isArray(q.options) || q.options.length < 4) {
        report.invalid++;
        if (report.errors.length < 60) report.errors.push({ reason: 'invalid question record', text: String(q.questionText || '').slice(0, 100) });
        continue;
      }
      if (!q.correctAnswer) report.missingAnswers++;
      if (q.image) report.withImages++;
      if (!q.explanation) report.withoutExplanation++;

      const id = contentId(q);
      const dh = dupeId(q);
      const dupe = byDupe.get(dh);
      if (dupe) {
        const needsKey = (!dupe.correctAnswer && q.correctAnswer) ||
          (q.correctAnswer && dupe.correctAnswer && q.correctAnswer !== dupe.correctAnswer); // bundle corrects a wrong key
        const needsHi = (q.questionTextHi && !dupe.questionTextHi) || (q.explanationHi && !dupe.explanationHi) || (q.explanation && !dupe.explanation);
        const needsCh = dupe.chapter === 'General' && q.chapter && q.chapter !== 'General'; // bundle has the real chapter
        // option-level Hindi upgrade: English texts same hain aur naye options me
        // textHi bhara hai → dupe ke options me textHi merge kar do (ids/text safe)
        let opts = dupe.options;
        if (Array.isArray(q.options) && q.options.length === (dupe.options || []).length &&
            q.options.every((o, i) => (o.text || '').trim() === String((((dupe.options || [])[i]) || {}).text || '').trim())) {
          const upgraded = (dupe.options || []).map((d, i) =>
            (q.options[i].textHi && !d.textHi) ? Object.assign({}, d, { textHi: q.options[i].textHi }) : d);
          if (upgraded.some((d, i) => d.textHi && !dupe.options[i].textHi)) opts = upgraded;
        }
        const needsOpts = opts !== dupe.options;
        if (needsKey || needsHi || needsCh || needsOpts) {
          // upgrade the existing record: fill/correct the answer key, Hindi fields,
          // real chapter-topic, option-level Hindi — bundle is authoritative (same
          // question, both languages in ONE record — never a duplicate row)
          const merged = Object.assign({}, dupe, {
            correctAnswer: q.correctAnswer || dupe.correctAnswer,
            explanation: q.explanation || dupe.explanation,
            questionTextHi: q.questionTextHi || dupe.questionTextHi || null,
            explanationHi: q.explanationHi || dupe.explanationHi || null,
            options: opts,
            chapter: (dupe.chapter === 'General' && q.chapter && q.chapter !== 'General') ? q.chapter : (dupe.chapter || q.chapter),
            topic: (dupe.chapter === 'General' && q.topic && q.topic !== 'General') ? q.topic : (dupe.topic || q.topic),
            id: dupe.id,
            dupeHash: dupe.dupeHash || dh
          });
          toPut.push(merged);
          byDupe.set(dh, merged);
          report.replaced++;
        } else {
          report.duplicates++;
        }
        continue;
      }

      const rec = Object.assign({}, q, { id, dupeHash: dh });
      if (!rec.exam) rec.exam = exam || q.exam || 'airforce';   // exam-scoped bank
      if (Array.isArray(rec.tags)) rec.tags = Array.from(new Set(rec.tags));
      byDupe.set(dh, rec);
      toPut.push(rec);
      report.imported++;
      if (report.bySubject[q.subject] !== undefined) report.bySubject[q.subject]++;
      else report.bySubject[q.subject] = 1;
      if (onProgress && qi % 250 === 0) onProgress(qi, questions.length);
    }
    if (toPut.length) await DB.bulkPut('questions', toPut, onProgress);
    return report;
  }

  /* --------- first-run seed of bundled PYQ bank --------- */
  async function seedIfNeeded(force) {
    if (!force) {
      const seeded = await Store.getMeta('seeded', false);
      if (seeded) return { skipped: true };
    }
    const subjects = ['physics', 'mathematics', 'english', 'raga'];
    let total = 0, imported = 0;
    const report = { imported: 0, duplicates: 0, bySubject: {} };
    for (const s of subjects) {
      let arr;
      try {
        const r = await fetch(`data/bank-${s}.json`);
        if (!r.ok) continue;
        arr = await r.json();
      } catch (e) { continue; }
      total += arr.length;
      const rep = await importBatch(arr);
      imported += rep.imported;
      report.imported += rep.imported;
      report.duplicates += rep.duplicates;
      report.bySubject[s] = rep.imported;
    }
    await Store.setMeta('seeded', true);
    await Store.setMeta('seededAt', Date.now());
    report.totalParsed = total;

    // first ever seed → build the ready-made test series (15 full mocks + 5 per subject)
    if (!force && typeof Generator !== 'undefined') {
      try {
        const series = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
        report.series = series;
        if (series.made) await Store.setMeta('seriesBuilt', { at: Date.now(), made: series.made });
      } catch (e) { /* series is a bonus — never block seeding on it */ }
    }
    return report;
  }

  /* --------- bank stats (chapters/topics per subject) --------- */
  async function bankStats() {
    const stats = {};
    for (const s of ['physics', 'mathematics', 'english', 'raga']) {
      stats[s] = { total: 0, usable: 0, chapters: {}, topics: {} };
    }
    await DB.cursor('questions', 'subject', q => {
      const st = stats[q.subject] || (stats[q.subject] = { total: 0, usable: 0, chapters: {}, topics: {} });
      st.total++;
      if (q.correctAnswer && !q.figureBased) st.usable++;
      st.chapters[q.chapter] = (st.chapters[q.chapter] || 0) + 1;
      st.topics[q.topic] = (st.topics[q.topic] || 0) + 1;
    });
    return stats;
  }

  /* ---- bundled bank auto-sync ----
     Fingerprint of every data/bank-*.json file. When files change (new questions
     added to the bundle), every install imports the delta on next boot —
     duplicates are skipped by dupeHash — and new tests are auto-built from the
     new material. Add questions to the files → users get them + new tests, no
     manual step anywhere. */
  /* ONE file per subject — each question record carries BOTH languages
     (questionText + questionTextHi); the in-exam language dropdown switches display. */
  const BUNDLE_FILES = ['data/bank-physics.json', 'data/bank-mathematics.json', 'data/bank-english.json', 'data/bank-raga.json'];

  /* ---- retired-question pruning ----
     Purane bundle versions se aaye sawal (ab bank me nahi) + 18 Sep 2026 wale
     bad push (galat subjects: reasoning / general-awareness / mathematics wale
     RAGA sawal) — ye list devices se saaf ho jaati hai. List version badalne
     par dobara chalta hai. Kabhi bhi user ke khud ke questions/delete nahi karta
     — sirf exact dupeHash match. */
  const RETIRED_V = 3;   // v3: physics v2 + math variants/dupe-extras bhi prune honge
  async function pruneRetired() {
    try {
      const done = await Store.getMeta('retiredV', 0);
      if (done >= RETIRED_V) return 0;
      const r = await fetch('data/retired-raga.json');
      if (!r.ok) return 0;
      const ret = await r.json();
      const hs = new Set([].concat(ret.raga || [], ret.foreign || [], ret.physics || [], ret.mathematics || []));
      const doomed = [];
      await DB.cursor('questions', null, q => { if (hs.has(q.dupeHash)) doomed.push(q.id); });
      for (const id of doomed) { try { await DB.delete('questions', id); } catch (e) {} }
      // auto-built (series) tests jinke questions ab bank me nahi → unattempted
      // honge to delete (autoBuild clean bank se dobara bana dega). Custom tests
      // + attempted tests kabhi nahi chute — history safe rehti hai.
      const gone = new Set(doomed);
      let testsDropped = 0;
      try {
        const tests = await DB.getAll('tests');
        for (const t of tests) {
          if (!t.series || !Array.isArray(t.sections)) continue;
          const qids = t.sections.flatMap(s => s.questionIds || []);
          if (!qids.some(id => gone.has(id))) continue;
          const atts = await DB.byIndex('attempts', 'testId', t.id);
          if (atts && atts.length) continue; // history preserved
          await DB.delete('tests', t.id); testsDropped++;
        }
      } catch (e) { /* test cleanup is best-effort */ }
      await Store.setMeta('retiredV', RETIRED_V);
      return { questions: doomed.length, tests: testsDropped };
    } catch (e) { return 0; }
  }

  async function syncBundled() {
    let fp = '';
    const payloads = [];
    for (const f of BUNDLE_FILES) {
      try {
        const r = await fetch(f);
        if (!r.ok) continue;
        const text = await r.text();
        fp += f + ':' + text.length + ':' + (text.match(/"dupeHash"/g) || []).length + ';';
        payloads.push(JSON.parse(text));
      } catch (e) { /* offline / partial — skip silently */ }
    }
    if (!payloads.length) return { synced: false, imported: 0 };
    const prev = await Store.getMeta('bundleFP', null);
    if (prev === fp) return { synced: false, imported: 0 };
    let imported = 0;
    for (const arr of payloads) {
      try { const rep = await importBatch(arr, null, 'airforce'); imported += rep.imported; }
      catch (e) { /* one bad file never blocks the rest */ }
    }
    await Store.setMeta('bundleFP', fp);
    // import ke BAAD prune — naya bank pehle purani records ko upgrade karta
    // hai, phir retired list wale (jo naye bank me nahi) saaf ho jaate hain
    const pr = await pruneRetired();
    // naya material aaya hai to ready-made library bhi top-up ho — warna
    // user baar-baar wahi purane papers dekhta hai (autoBuild zero-overlap
    // naye tests banata hai, sirf unused questions se)
    let built = 0;
    if (imported > 0 || (pr && pr.tests > 0)) {
      try { built = (await Generator.autoBuild()) || 0; } catch (e) { /* library top-up optional */ }
    }
    return { synced: true, imported, pruned: pr ? pr.questions : 0, testsDropped: pr ? pr.tests : 0, built };
  }

  return { importBatch, seedIfNeeded, syncBundled, pruneRetired, bankStats, contentId, dupeId };
})();

/* --------- update cumulative stats after every submit --------- */
const StatsUpdator = {
  async record(attempt, questionMap) {
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, correct: {}, skipped: {}, topicAcc: {} });
    const tstats = await Store.getMeta('topicStats', {});
    const seen = qstats.seen || {}, wrong = qstats.wrong || {}, correct = qstats.correct || {};
    const skipped = qstats.skipped || {}; // seen but left unattempted → must repeat
    const tAcc = {};
    const result = attempt.result;
    if (result) {
      for (const qid in result.perQuestion) {
        const pq = result.perQuestion[qid];
        seen[qid] = (seen[qid] || 0) + 1;
        if (pq.result === 'wrong') wrong[qid] = (wrong[qid] || 0) + 1;
        if (pq.result === 'correct') correct[qid] = (correct[qid] || 0) + 1;
        if (pq.result === 'skip') skipped[qid] = (skipped[qid] || 0) + 1;
        const q = questionMap[qid];
        if (q) {
          const key = q.subject + '␟' + q.topic;
          tAcc[key] = tAcc[key] || { c: 0, w: 0 };
          if (pq.result === 'correct') tAcc[key].c++;
          else if (pq.result === 'wrong') tAcc[key].w++;
        }
      }
    }
    // rolling topic accuracy (exponential moving blend with stored totals)
    const stored = qstats.topicAcc || {};
    for (const k in tAcc) {
      const prev = stored[k] || { c: 0, w: 0 };
      const c = prev.c + tAcc[k].c, w = prev.w + tAcc[k].w;
      stored[k] = Math.round((c / Math.max(1, c + w)) * 1000) / 10;
    }
    qstats.seen = seen; qstats.wrong = wrong; qstats.correct = correct; qstats.skipped = skipped; qstats.topicAcc = stored;
    await Store.setMeta('qstats', qstats);

    // cumulative topic totals for progress tracking
    for (const k in tAcc) {
      const prev = tstats[k] || { attempted: 0, correct: 0, wrong: 0 };
      prev.attempted += tAcc[k].c + tAcc[k].w;
      prev.correct += tAcc[k].c;
      prev.wrong += tAcc[k].w;
      tstats[k] = prev;
    }
    await Store.setMeta('topicStats', tstats);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Bank;
