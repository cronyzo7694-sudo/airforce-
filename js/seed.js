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
        const needsKey = !dupe.correctAnswer && q.correctAnswer;
        const needsHi = (q.questionTextHi && !dupe.questionTextHi) || (q.explanationHi && !dupe.explanationHi);
        if (needsKey || needsHi) {
          // upgrade the existing record: fill the answer key and/or Hindi translation
          // (same question, both languages in ONE record — never a duplicate row)
          const merged = Object.assign({}, dupe, {
            correctAnswer: q.correctAnswer || dupe.correctAnswer,
            explanation: q.explanation || dupe.explanation,
            questionTextHi: q.questionTextHi || dupe.questionTextHi || null,
            explanationHi: q.explanationHi || dupe.explanationHi || null,
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
    return { synced: true, imported };
  }

  return { importBatch, seedIfNeeded, syncBundled, bankStats, contentId, dupeId };
})();

/* --------- update cumulative stats after every submit --------- */
const StatsUpdator = {
  async record(attempt, questionMap) {
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, correct: {}, topicAcc: {} });
    const tstats = await Store.getMeta('topicStats', {});
    const seen = qstats.seen || {}, wrong = qstats.wrong || {}, correct = qstats.correct || {};
    const tAcc = {};
    const result = attempt.result;
    if (result) {
      for (const qid in result.perQuestion) {
        const pq = result.perQuestion[qid];
        seen[qid] = (seen[qid] || 0) + 1;
        if (pq.result === 'wrong') wrong[qid] = (wrong[qid] || 0) + 1;
        if (pq.result === 'correct') correct[qid] = (correct[qid] || 0) + 1;
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
    qstats.seen = seen; qstats.wrong = wrong; qstats.correct = correct; qstats.topicAcc = stored;
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
