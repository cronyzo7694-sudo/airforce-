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
      // v1.4.46 EXAM ISOLATION: subject aliases SIRF airforce scope me —
      // SSC CHSL ka 'reasoning'/'gs' airforce RAGA me kabhi merge NAHI hoga
      const scope = exam || q.exam || 'airforce';
      if (scope === 'airforce' && SUBJECT_ALIAS[q.subject]) q.subject = SUBJECT_ALIAS[q.subject];
      if (!q.subject || !q.questionText || !Array.isArray(q.options) || q.options.length < 4) {
        report.invalid++;
        if (report.errors.length < 60) report.errors.push({ reason: 'invalid question record', text: String(q.questionText || '').slice(0, 100) });
        continue;
      }
      if (!q.correctAnswer) report.missingAnswers++;
      if (q.image) report.withImages++;
      if (!q.explanation) report.withoutExplanation++;

      // v1.4.46: non-airforce exams ka id/dupeHash exam-prefix ke saath —
      // do exams ka same-text question bhi alag record hai, kabhi overlap nahi
      const id = (scope === 'airforce') ? contentId(q) : 'q_' + scope + '_' + AVUtil.hash([q.subject, q.questionText, q.options.map(o => o.text).join(' | '), q.correctAnswer || '?'].join('␟'));
      const dh = (scope === 'airforce') ? dupeId(q) : scope + ':' + dupeId(q);
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
  /* v1.4.46 MULTI-EXAM: har exam ka apna data folder + apna seed flag.
     data/airforce/bank-*.json · data/ssc-chsl/bank-*.json — kabhi mix nahi. */
  const EXAM_BUNDLES = {
    airforce: { dir: 'data/airforce/', subjects: ['physics', 'mathematics', 'english', 'raga'] },
    'ssc-chsl': { dir: 'data/ssc-chsl/', subjects: ['mathematics', 'english', 'reasoning', 'gs'] }
  };

  /* v1.4.58 CLOUD BANKS — Neon (bank_blobs) via sync-kineora worker.
     js/cloud.js DEFAULT_ENDPOINT se sync — do consts, ek hi deployment.
     Delivery: worker /bank (CF edge cache + ETag) → fallback static bundle. */
  const CLOUD_BANK = 'https://sync-kineora.cronyzo7694.workers.dev';

  /* JSON fetch with timeout — fail pe null (caller static fallback karta hai) */
  async function fetchCloudJSON(u, timeoutMs) {
    try {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 10000) : null;
      let r;
      try {
        r = await fetch(u, ctl ? { signal: ctl.signal } : undefined);
      } finally { if (t) clearTimeout(t); }
      if (!r || !r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function seedIfNeeded(force, exam) {
    const bundle = EXAM_BUNDLES[exam] || EXAM_BUNDLES.airforce;
    if (!force) {
      const seeded = (await Store.getMeta('seeded_' + exam, false)) ||
        (exam === 'airforce' && await Store.getMeta('seeded', false));   // legacy flag
      if (seeded) return { skipped: true };
    }
    const subjects = bundle.subjects;
    let total = 0, imported = 0;
    const report = { imported: 0, duplicates: 0, bySubject: {}, exam };
    for (const s of subjects) {
      let arr = null;
      /* v1.4.58: pehle Neon cloud bank (worker /bank — CF edge, ETag) —
         fail/undeployed ho to static bundle file (purana behaviour). */
      const cl = await fetchCloudJSON(`${CLOUD_BANK}/bank?exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(s)}`, 30000);
      if (cl && cl.ok && Array.isArray(cl.payload)) arr = cl.payload;
      if (!arr) {
        try {
          const r = await fetch(`${bundle.dir}bank-${s}.json`);
          if (!r.ok) continue;
          arr = await r.json();
        } catch (e) { continue; }
      }
      total += arr.length;
      const rep = await importBatch(arr, null, exam);
      imported += rep.imported;
      report.imported += rep.imported;
      report.duplicates += rep.duplicates;
      report.bySubject[s] = rep.imported;
    }
    await Store.setMeta('seeded_' + exam, true);
    if (exam === 'airforce') await Store.setMeta('seeded', true);        // legacy compat
    await Store.setMeta('seededAt_' + exam, Date.now());
    report.totalParsed = total;

    // first ever seed → build the ready-made test series (15 full mocks + 5 per subject)
    /* v1.4.54: PER-EXAM flag — duplicate seed call (slow-seed ke beech dobara
       switch) dobara buildSeries chala ke adhoora/double series nahi banayega. */
    const sFlag = exam === 'airforce' ? 'seriesBuilt' : ('seriesBuilt_' + exam);
    if (!force && typeof Generator !== 'undefined' && !(await Store.getMeta(sFlag, null))) {
      try {
        const series = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
        report.series = series;
        /* v1.4.54: flag sirf made>0 pe — 0 bana series (questions kam the)
           next boot/seed pe retry karegi, naye questions aate hi mock banega */
        if (series && series.made) {
          await Store.setMeta(sFlag, { at: Date.now(), made: series.made, bankV: 2 });
          if (exam === 'airforce') await Store.setMeta('seriesBuilt', { at: Date.now(), made: series.made });
        }
      } catch (e) { /* series is a bonus — never block seeding on it */ }
    }
    return report;
  }

  /* --------- bank stats (chapters/topics per subject) --------- */
  async function bankStats(exam) {
    /* v1.4.48: exam-scoped — SSC active ho to sirf SSC ka bank dikhta hai
       (hardcoded airforce subjects bhi hata — dynamic, koi bhi exam). */
    const stats = {};
    await DB.cursor('questions', 'subject', q => {
      if (exam && (q.exam || 'airforce') !== exam) return;
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
  /* v1.4.46: per-exam bundle files (EXAM_BUNDLES se) */
  const bundleFiles = exam => {
    const b = EXAM_BUNDLES[exam] || EXAM_BUNDLES.airforce;
    return b.subjects.map(s => `${b.dir}bank-${s}.json`);
  };

  /* ---- retired-question pruning ----
     Purane bundle versions se aaye sawal (ab bank me nahi) + 18 Sep 2026 wale
     bad push (galat subjects: reasoning / general-awareness / mathematics wale
     RAGA sawal) — ye list devices se saaf ho jaati hai. List version badalne
     par dobara chalta hai. Kabhi bhi user ke khud ke questions/delete nahi karta
     — sirf exact dupeHash match. */
  const RETIRED_V = 7;   // v7: v1.4.19 — english passage-merge (58 patched) + 18 removals
  async function pruneRetired() {
    try {
      const done = await Store.getMeta('retiredV', 0);
      if (done >= RETIRED_V) return 0;
      const r = await fetch('data/airforce/retired-raga.json');
      if (!r.ok) return 0;
      const ret = await r.json();
      const hs = new Set([].concat(ret.raga || [], ret.foreign || [], ret.physics || [], ret.mathematics || [], ret.v4 || [], ret.v5 || [], ret.v6 || [], ret.v7 || []));
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

  /* ---- v1.4.47 demo-temp purge ----
     Final bank files (bank-meta.json me _bundleKind: "final") aane par pehle
     temporary demo questions delete hote hain — tags me 'demo-temp' ya id
     q_sscchsl_* (v1.4.46 ke 48 demo Q included). Sirf IS exam ke questions:
     airforce bank ya user ki real q_ssc_* files KABHI nahi chhoti hain.
     Unattempted series tests bhi saaf (final bank se naya series banega);
     custom tests + attempted history hamesha safe. */
  /* ---- v1.4.62 BANK-REPLACE PURGE (_bundleKind transition hook) ----
     Jab cloud/static meta ka _bundleKind 'v2' hota hai (purane 'final' se
     alag), is exam ke SARE bank questions devices se delete hote hain —
     user ke khud ke 'manual' tag wale questions KABHI nahi — aur usi sync
     me naya v2 bank import ho jata hai. Unattempted series tests bhi saaf
     (attempted history safe); seriesRebuild flag se naya series banega.
     Ye "sare questions hatao, naye quality bank do" replacement ka device
     side hai — cloud DB clear ho chuka tha, ye local mirror fix karta hai. */
  async function purgeBankReplace(exam) {
    try {
      const doomed = [];
      await DB.cursor('questions', null, q => {
        if (q.exam !== exam) return;
        if ((q.tags || []).includes('manual')) return;   // user-added — never touch
        doomed.push(q.id);
      });
      for (const id of doomed) { try { await DB.delete('questions', id); } catch (e) {} }
      const gone = new Set(doomed);
      let testsDropped = 0;
      try {
        const tests = await DB.getAll('tests');
        for (const t of tests) {
          if (!t.series || !Array.isArray(t.sections)) continue;
          const qids = t.sections.flatMap(s => s.questionIds || []);
          if (!qids.some(id => gone.has(id))) continue;
          const atts = await DB.byIndex('attempts', 'testId', t.id);
          if (atts && atts.length) continue;   // history preserved
          await DB.delete('tests', t.id); testsDropped++;
        }
      } catch (e) { /* test cleanup is best-effort */ }
      if (doomed.length) await Store.setMeta('seriesRebuild_' + exam, true);
      return { questions: doomed.length, tests: testsDropped };
    } catch (e) { return { questions: 0, tests: 0 }; }
  }

  async function purgeDemoTemp(exam) {
    try {
      const doomed = [];
      await DB.cursor('questions', null, q => {
        if (q.exam !== exam) return;
        if ((q.tags || []).includes('demo-temp') || (q.id || '').startsWith('q_sscchsl_')) doomed.push(q.id);
      });
      for (const id of doomed) { try { await DB.delete('questions', id); } catch (e) {} }
      const gone = new Set(doomed);
      let testsDropped = 0;
      try {
        const tests = await DB.getAll('tests');
        for (const t of tests) {
          if (!t.series || !Array.isArray(t.sections)) continue;
          const qids = t.sections.flatMap(x => x.questionIds || []);
          if (!qids.some(id => gone.has(id))) continue;
          const atts = await DB.byIndex('attempts', 'testId', t.id);
          if (atts && atts.length) continue;   // history preserved
          await DB.delete('tests', t.id); testsDropped++;
        }
      } catch (e) { /* test cleanup is best-effort */ }
      return { questions: doomed.length, tests: testsDropped };
    } catch (e) { return { questions: 0, tests: 0 }; }
  }

  async function syncBundled(exam) {
    exam = exam || ((typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce');
    const bundle = EXAM_BUNDLES[exam] || EXAM_BUNDLES.airforce;
    const subjects = bundle.subjects;
    const prevRaw = (await Store.getMeta('bundleFP_' + exam, null)) ||
      (exam === 'airforce' ? await Store.getMeta('bundleFP', null) : null);   // legacy
    const prevMap = (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)) ? prevRaw : null;

    /* v1.4.58 CLOUD-FIRST DELTA SYNC — pehle chhota /bank-versions check
       (bytes me), sirf CHANGED subjects download. Purane flow me har boot
       par saari bank files (17.7MB) fetch hoti thi fingerprint ke liye —
       yahi site-slow problem thi. Worker down → purana static path. */
    const vers = await fetchCloudJSON(`${CLOUD_BANK}/bank-versions?exam=${encodeURIComponent(exam)}`, 8000);
    const cloudSubjects = (vers && vers.ok && vers.subjects) ? subjects.filter(s => vers.subjects[s]) : [];
    const fp = {};
    const payloads = [];

    if (cloudSubjects.length) {
      let changed = false;
      for (const s of cloudSubjects) fp[s] = vers.subjects[s].version;
      for (const s of cloudSubjects) {
        if (!prevMap || prevMap[s] !== fp[s]) { changed = true; break; }
      }
      /* DB-me-nahi subjects (abhi math) → static file fingerprint */
      for (const s of subjects) {
        if (fp[s]) continue;
        try {
          const r = await fetch(`${bundle.dir}bank-${s}.json`);
          if (!r.ok) continue;
          const text = await r.text();
          fp[s] = 'static:' + text.length + ':' + (text.match(/"dupeHash"/g) || []).length;
          if (!prevMap || prevMap[s] !== fp[s]) { changed = true; payloads.push(JSON.parse(text)); }
        } catch (e) { /* offline — skip */ }
      }
      if (!changed && prevMap) return { synced: false, imported: 0 };   // fast-path: zero big downloads
      /* changed cloud subjects → full payload fetch */
      for (const s of cloudSubjects) {
        if (prevMap && prevMap[s] === fp[s]) continue;
        const cl = await fetchCloudJSON(`${CLOUD_BANK}/bank?exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(s)}`, 30000);
        if (cl && cl.ok && Array.isArray(cl.payload)) payloads.push(cl.payload);
        else delete fp[s];   /* fetch fail — version store nahi (next boot retry) */
      }
    } else {
      /* worker down / exam ka data DB me nahi → PURANA static fingerprint
         path (slow par reliable — offline grace) */
      for (const f of bundleFiles(exam)) {
        try {
          const r = await fetch(f);
          if (!r.ok) continue;
          const text = await r.text();
          const s = f.replace(/^.*bank-/, '').replace(/\.json$/, '');
          fp[s] = f + ':' + text.length + ':' + (text.match(/"dupeHash"/g) || []).length;
          payloads.push(JSON.parse(text));
        } catch (e) { /* offline / partial — skip silently */ }
      }
    }
    if (!payloads.length && !Object.keys(fp).length) return { synced: false, imported: 0 };
    /* v1.4.47: bank-meta.json ka _bundleKind dekho — temp-demo → final
       transition par PEHLE demo-temp purge (taaki final 20k import ke saath
       purane temp Q double na ho jayein). Meta read har load pe hota hai
       (chhota file), transition sirf ek baar chalta hai. */
    let purged = null;
    try {
      const dir = (EXAM_BUNDLES[exam] || EXAM_BUNDLES.airforce).dir;
      const mr = await fetch(dir + 'bank-meta.json');
      if (mr.ok) {
        const meta = await mr.json();
        const kind = meta._bundleKind || null;
        const prevKind = await Store.getMeta('bundleKind_' + exam, null);
        if (kind && kind !== prevKind) {
          if (kind === 'final') {
            purged = await purgeDemoTemp(exam);   // temp Q/tests pehle saaf
            await Store.setMeta('bundleKind_' + exam, 'final');
          } else if (kind === 'v2' || kind === 'v2b') {
            /* v1.4.62/63 BANK-REPLACE: pura purana bank devices se hata, naya
               v2 bank (isi sync me import hota hai) akela rahe. v2b = v1.4.63
               balanced-series re-transition (har subject ka test bane). */
            purged = await purgeBankReplace(exam);
            await Store.setMeta('bundleKind_' + exam, kind);
          } else {
            await Store.setMeta('bundleKind_' + exam, kind);
          }
        }
      }
    } catch (e) { /* meta optional hai — purge skip, import normal */ }
    const prev = (await Store.getMeta('bundleFP_' + exam, null)) ||
      (exam === 'airforce' ? await Store.getMeta('bundleFP', null) : null);   // legacy
    if (prev && typeof prev === 'object' && !Array.isArray(prev) &&
        JSON.stringify(prev) === JSON.stringify(fp)) {
      return { synced: false, imported: 0, purged: purged || null };
    }
    let imported = 0;
    for (const arr of payloads) {
      try { const rep = await importBatch(arr, null, exam); imported += rep.imported; }
      catch (e) { /* one bad file never blocks the rest */ }
    }
    await Store.setMeta('bundleFP_' + exam, fp);
    if (exam === 'airforce') await Store.setMeta('bundleFP', fp);
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
    /* v1.4.62 bank-replace ke baad ready-made series naye bank se dobara —
       purge ne unattempted purane series hatae the, fresh 15 mocks + 5×subject */
    if (exam !== 'airforce' && await Store.getMeta('seriesRebuild_' + exam, false)) {
      try {
        const series = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
        if (series && series.made) {
          await Store.setMeta('seriesBuilt_' + exam, { at: Date.now(), made: series.made, bankV: 3 });
        }
      } catch (e) { /* bonus — retry next sync via flag */ }
      await Store.setMeta('seriesRebuild_' + exam, false);
    }
    return { synced: true, imported, pruned: pr ? pr.questions : 0, testsDropped: pr ? pr.tests : 0, purged: purged || null, built };
  }

  return { importBatch, seedIfNeeded, syncBundled, purgeDemoTemp, purgeBankReplace, pruneRetired, bankStats, contentId, dupeId };
})();

/* --------- update cumulative stats after every submit --------- */
const StatsUpdator = {
  async record(attempt, questionMap) {
    /* v1.4.48 EXAM-SCOPED: topicStats/topicAcc keys ab 'exam␟subject␟topic'
       hain (purane 2-segment keys = legacy airforce — readers parse se handle).
       qstats me examSeen counter bhi — dashboard coverage cross-exam mix nahi
       hota. qid-keyed seen/wrong/correct/skipped waise hi hain (qid globally
       unique + rows exam-filtered hoti hain). */
    const exam = (attempt && attempt.exam) || 'airforce';
    const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {}, correct: {}, skipped: {}, topicAcc: {} });
    const tstats = await Store.getMeta('topicStats', {});
    const seen = qstats.seen || {}, wrong = qstats.wrong || {}, correct = qstats.correct || {};
    const skipped = qstats.skipped || {}; // seen but left unattempted → must repeat
    const tAcc = {};
    const result = attempt.result;
    let seenThis = 0;
    if (result) {
      for (const qid in result.perQuestion) {
        seenThis++;
        const pq = result.perQuestion[qid];
        seen[qid] = (seen[qid] || 0) + 1;
        if (pq.result === 'wrong') wrong[qid] = (wrong[qid] || 0) + 1;
        if (pq.result === 'correct') correct[qid] = (correct[qid] || 0) + 1;
        if (pq.result === 'skip') skipped[qid] = (skipped[qid] || 0) + 1;
        const q = questionMap[qid];
        if (q) {
          const key = (q.exam || exam) + '␟' + q.subject + '␟' + q.topic;
          tAcc[key] = tAcc[key] || { c: 0, w: 0 };
          if (pq.result === 'correct') tAcc[key].c++;
          else if (pq.result === 'wrong') tAcc[key].w++;
        }
      }
    }
    qstats.examSeen = qstats.examSeen || {};
    qstats.examSeen[exam] = (qstats.examSeen[exam] || 0) + seenThis;
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
