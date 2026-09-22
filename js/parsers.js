/* ============================================================
 * AGNIVEER VAYU CBT — QUESTION FILE IMPORT PARSERS
 * TXT (master + generic), JSON, CSV, DOCX (zip via
 * DecompressionStream), PDF (best-effort text extraction).
 * ============================================================ */

const Parsers = (() => {

  const PAPER_RE = /^PAPER\s+(\d+)\s*\|\s*GROUP\s+([XY]+)\s*\|\s*(.+?)\s*\|\s*Source:\s*(.+?)\s*$/;
  const TRAIL_PHRASES = ['None of these', 'None of the above', 'All of the above', 'No error', 'None of the above.'];

  function normKey(o, keys) {
    for (const k of Object.keys(o)) {
      if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ''))) return o[k];
    }
    return undefined;
  }

  /* ---- bilingual (EN + HI) master TXT support ----
     Format: Q1. English line / हिन्दी line / options / Answer: X /
             Solution — English ... / समाधान — हिन्दी ... / सही उत्तर: (X) */
  const DEV_RE = /[\u0900-\u097F]/g;
  function devanagariRatio(s) {
    const letters = String(s).replace(/[\s\d\p{P}\p{S}]/gu, '');
    if (!letters.length) return 0;
    return (String(s).match(DEV_RE) || []).length / letters.length;
  }
  const isSolEn = s => /^Solution\s*[\u2014\-]\s*English\b/i.test(s);
  const isSolHi = s => /^\u0938\u092e\u093e\u0927\u093e\u0928\s*[\u2014\-]\s*\u0939\u093f\u0928\u094d\u0926\u0940/.test(s);
  const isHiAns = s => /^\u0938\u0939\u0940 \u0909\u0924\u094d\u0924\u0930\s*[:\uFF1A]/.test(s);

  
/* v1.4.48 EXAM-AWARE subject aliases — airforce me RAGA combined section ke
   aliases (reasoning/gk/ga→raga) SIRF airforce import par lagte hain.
   SSC CHSL me reasoning/gs apne canonical subjects par map hote hain —
   warna user ki final SSC JSON files ka sab data 'raga' me chala jata! */
function subjectMapFor(exam) {
  const ex = exam || (typeof App !== 'undefined' && App.configCache && App.configCache.exam) || 'airforce';
  /* keys NORMALIZED: lowercase + spaces/hyphens/& hataye (lookup bhi same norm) */
  if (ex === 'ssc-chsl') return {
    mathematics: 'mathematics', maths: 'mathematics', math: 'mathematics',
    english: 'english',
    reasoning: 'reasoning', verbalreasoning: 'reasoning', nonverbalreasoning: 'reasoning',
    gs: 'gs', generalawareness: 'gs', generalknowledge: 'gs',
    gk: 'gs', ga: 'gs', currentaffairs: 'gs',
    reasoningandgeneralawareness: 'gs'
  };
  return {
    physics: 'physics', mathematics: 'mathematics', maths: 'mathematics', math: 'mathematics',
    english: 'english', raga: 'raga', reasoning: 'raga', verbalreasoning: 'raga',
    nonverbalreasoning: 'raga', generalawareness: 'raga',
    generalknowledge: 'raga', gk: 'raga', ga: 'raga', currentaffairs: 'raga',
    reasoningandgeneralawareness: 'raga'
  };
}
function normSubjectKey(raw) {
  return String(raw || '').toLowerCase().trim().replace(/&/g, 'and').replace(/[\s\-/]+/g, '');
}

function mkQuestion(o) {
    const subjectRaw = normKey(o, ['subject', 'subjectid', 'section']);
    const SUBJECT_MAP = subjectMapFor();
    const subject = SUBJECT_MAP[normSubjectKey(subjectRaw)] || null;
    const qt = normKey(o, ['question', 'questiontext', 'q', 'stem']);
    // options may come as: bank format [{id:'A',text:'…'},…], plain string array,
    // object {A:…,B:…}, or flat optionA/optionB/… keys
    let optA = normKey(o, ['optiona', 'a', 'opta']);
    let optB = normKey(o, ['optionb', 'b', 'optb']);
    let optC = normKey(o, ['optionc', 'c', 'optc']);
    let optD = normKey(o, ['optiond', 'd', 'optd']);
    const rawOpts = o.options != null ? o.options : o.Options;
    if (Array.isArray(rawOpts) && rawOpts.length) {
      const byPos = [];
      rawOpts.forEach((op, i) => {
        const letter = (op && typeof op === 'object' && op.id && /^[A-D]$/i.test(String(op.id))) ? String(op.id).toUpperCase() : 'ABCD'[Math.min(i, 3)];
        const text = (op && typeof op === 'object') ? (op.text != null ? op.text : (op.value != null ? op.value : '')) : op;
        byPos['ABCD'.indexOf(letter)] = String(text == null ? '' : text);
      });
      [optA, optB, optC, optD] = byPos.map((x, i) => x != null ? x : [optA, optB, optC, optD][i]);
    } else if (rawOpts && typeof rawOpts === 'object') {
      optA = rawOpts.A != null ? rawOpts.A : optA; optB = rawOpts.B != null ? rawOpts.B : optB;
      optC = rawOpts.C != null ? rawOpts.C : optC; optD = rawOpts.D != null ? rawOpts.D : optD;
    }
    let ans = normKey(o, ['answer', 'correctanswer', 'correct', 'key', 'ans']);
    if (typeof ans === 'string') ans = ans.trim().toUpperCase().match(/^[A-D]/)?.[0] || null;
    const opts = [optA, optB, optC, optD].map(x => String(x == null ? '' : x).trim());
    const qtext = String(qt == null ? '' : qt).trim();
    const errs = [];
    if (!subject) errs.push('missing/unknown subject');
    if (!qtext) errs.push('missing question text');
    if (opts.filter(Boolean).length < 4) errs.push('needs 4 options');
    if (ans && !['A', 'B', 'C', 'D'].includes(ans)) { ans = null; }
    return {
      q: {
        id: null, // assigned by importer
        subject,
        chapter: String(normKey(o, ['chapter', 'unit']) || 'General').trim() || 'General',
        topic: String(normKey(o, ['topic']) || 'General').trim() || 'General',
        difficulty: String(normKey(o, ['difficulty', 'level']) || 'medium').toLowerCase(),
        questionText: qtext,
        questionTextHi: String(normKey(o, ['questiontexthi', 'questionhi', 'qhi']) || '').trim() || null,
        explanationHi: String(normKey(o, ['explanationhi', 'solutionhi', 'reasonhi']) || '').trim() || null,
        image: normKey(o, ['image', 'imageurl', 'img']) || null,
        options: ['A', 'B', 'C', 'D'].map((L, i) => ({ id: L, text: opts[i] })),
        correctAnswer: ans || null,
        explanation: String(normKey(o, ['explanation', 'solution', 'reason']) || '').trim(),
        source: String(normKey(o, ['source']) || 'Imported file').trim(),
        year: normKey(o, ['year']) != null ? (parseInt(normKey(o, ['year'])) || normKey(o, ['year'])) : null,
        figureBased: !!o.figureBased,
        tags: String(normKey(o, ['tags']) || '').split(/[,;]+/).map(t => t.trim()).filter(Boolean)
      },
      errs
    };
  }

  /* ================= MASTER TXT ================= */
  function parseMasterTxt(text, defaultSubject) {
    const out = { questions: [], invalid: [], duplicates: 0, keyed: 0, unkeyed: 0, figure: 0, recovered: 0 };
    const lines = text.split(/\r?\n/);
    let paper = { no: 0, group: '?', date: 'Unknown date', src: 'TXT import' };
    let blocks = [];
    let cur = null;
    for (const ln of lines) {
      const pm = ln.match(PAPER_RE);
      if (pm) { paper = { no: +pm[1], group: pm[2], date: pm[3], src: pm[4] }; continue; }
      const qm = ln.match(/^Q\d+\.\s?(.*)$/);
      if (qm) {
        if (cur) blocks.push(cur);
        cur = { paper, first: qm[1], rest: [] };
        continue;
      }
      if (cur) cur.rest.push(ln);
    }
    if (cur) blocks.push(cur);

    for (const b of blocks) {
      const res = parseBlock(b, defaultSubject);
      if (res.err) out.invalid.push({ reason: res.err, text: (b.first || '').slice(0, 120) });
      else {
        out.questions.push(res.q);
        if (res.q.figureBased) out.figure++;
        else if (res.q.correctAnswer) out.keyed++;
        else out.unkeyed++;
        if (res.recovered) out.recovered++;
      }
    }
    return out;
  }

  function _split_tail3(tail, opt1) {
    if (!tail) return null;
    const toks = tail.split(/\s+/).filter(Boolean);
    if (toks.length === 3) return toks;
    for (const ph of TRAIL_PHRASES) {
      if (tail.endsWith(ph)) {
        const rem = tail.slice(0, -ph.length).trim().replace(/\.$/, '').trim();
        const t2 = rem.split(/\s+/).filter(Boolean);
        if (t2.length === 2) return t2.concat([ph]);
        const p2 = rem.split('. ').map(s => s.trim()).filter(Boolean);
        if (p2.length === 2) return p2.concat([ph]);
        break;
      }
    }
    const parts = tail.split('. ').map(s => s.trim()).filter(Boolean);
    if (parts.length === 3) return parts.map(p => p.endsWith('.') ? p : p + '.');
    const low = tail.toLowerCase();
    const words = low.split(/\s+/).filter(Boolean);
    const opt1Split = opt1 ? opt1.split(/\s+/).filter(Boolean) : [];
    const opt1First = opt1Split[0] ? opt1Split[0].toLowerCase() : null;
    let best = null;
    for (const n of [2, 3, 1]) {
      if (words.length < 3 * n) continue;
      const grams = {};
      for (let i = 0; i <= words.length - n; i++) {
        const g = words.slice(i, i + n).join(' ');
        (grams[g] = grams[g] || []).push(i);
      }
      for (const g in grams) {
        const idxs = grams[g];
        if (idxs.length !== 3 || idxs[0] !== 0) continue;
        // word index → char offset
        let pos = 0; const spans = [];
        for (const w of words) { spans.push(pos); pos += w.length + 1; }
        const offs = idxs.map(i => spans[i]);
        const segs = [tail.slice(offs[0], offs[1]).trim(), tail.slice(offs[1], offs[2]).trim(), tail.slice(offs[2]).trim()];
        if (!segs.every(s => s.split(' ').length >= 2)) continue;
        const wc = segs.map(s => s.split(' ').length);
        const balanced = Math.max(...wc) / Math.max(1, Math.min(...wc)) <= 2.5;
        const firstMatch = opt1First && segs.every(s => s.split(/\s+/).filter(Boolean)[0].toLowerCase() === opt1First);
        const score = (firstMatch ? 2 : 0) + (balanced ? 1 : 0);
        if (!best || score > best.score) best = { score, segs };
      }
      if (best && best.score >= 2) return best.segs;
    }
    if (best && best.score >= 1 && !opt1First) return best.segs;
    return null;
  }

  function parseBlock(b, defaultSubject) {
    const paper = b.paper;
    const meta = () => `PYQ · ${paper.date} · ${paper.src}${paper.group && paper.group !== '?' ? ' (Group ' + paper.group + ')' : ''}`;
    const yearMatch = paper.date.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? +yearMatch[0] : null;

    // figure-based note format (tolerates the bilingual note variant)
    if (b.rest.some(l => l.includes('(Options are figure-based in the source'))) {
      let ans = null, mode2 = 'q';
      const enL = [], hiL = [], exp = [], expHi = [];
      for (const raw of b.rest) {
        const s = raw.trim();
        if (!s || /^[=\-]+$/.test(s) || PAPER_RE.test(s)) continue;
        const am = s.match(/^Answer:\s*([A-D?])\s*$/);
        if (am) { if (!ans) ans = /^[A-D]$/.test(am[1]) ? am[1] : null; mode2 = 'exp'; continue; }
        if (isSolEn(s)) { mode2 = 'exp'; continue; }
        if (isSolHi(s)) { mode2 = 'expHi'; continue; }
        if (isHiAns(s)) { if (!ans) { const h = s.match(/\(([A-D])\)/); if (h) ans = h[1]; } continue; }
        if (s.startsWith('(Options are figure-based')) { mode2 = 'q'; continue; }
        if (mode2 === 'q') { (devanagariRatio(s) > .5 ? hiL : enL).push(s); }
        else if (mode2 === 'exp') exp.push(s);
        else if (mode2 === 'expHi') expHi.push(s);
      }
      const qt = [b.first].concat(enL).join(' ').replace(/\s+/g, ' ').trim();
      return { q: _finalize(defaultSubject, qt + ' (Options are figure-based in the source)',
        ['Figure A (see source)', 'Figure B (see source)', 'Figure C (see source)', 'Figure D (see source)'],
        ans, meta(), year, ['pyq', 'figure-based'], {
          questionTextHi: hiL.join(' ').replace(/\s+/g, ' ').trim() || null,
          explanation: exp.join(' ').replace(/\s+/g, ' ').trim() || '',
          explanationHi: expHi.join(' ').replace(/\s+/g, ' ').trim() || null
        }), recovered: false };
    }

    let fmt = null, answer = null, cur = null;
    const fmtOpts = {};
    const qtextLines = b.first ? [b.first] : [];
    const expLines = [], expHiLines = [];
    let mode = 'qtext';
    for (const raw of b.rest) {
      const s = raw.trim();
      const ma = s.match(/^\(([A-D])\)\s*(.*)$/);
      const mb = s.match(/^([1-4])\.\s*$/);
      const md = s.match(/^([1-4])\.\s+(.+)$/);
      const mAns = s.match(/^Answer:\s*(.+?)\s*$/);
      if (ma && fmt !== 'B' && fmt !== 'D') { fmt = 'A'; mode = 'opt'; cur = [ma[2]]; fmtOpts[ma[1]] = cur; }
      else if (md && fmt !== 'A') { fmt = 'D'; mode = 'opt'; cur = [md[2]]; fmtOpts['ABCD'[+md[1] - 1]] = cur; }
      else if (mb && fmt !== 'A') { fmt = 'B'; mode = 'opt'; cur = null; }
      else if (mAns) { answer = mAns[1].trim(); mode = 'done'; }
      else if (isSolEn(s)) { mode = 'exp'; continue; }
      else if (isSolHi(s)) { mode = 'expHi'; continue; }
      else if (isHiAns(s)) { if (!answer) { const h = s.match(/\(([A-D])\)/); if (h) answer = h[1]; } continue; }
      else if (mode === 'exp') { if (s) expLines.push(s); }
      else if (mode === 'expHi') { if (s) expHiLines.push(s); }
      else {
        if (!s && mode === 'qtext') continue;
        if (fmt === 'A' || fmt === 'D') { if (mode === 'opt' && cur) cur.push(s); else if (mode === 'qtext') qtextLines.push(s); }
        else qtextLines.push(s);
      }
    }
    // split bilingual question lines: Devanagari lines → questionTextHi
    const enQ = [], hiQ = [];
    qtextLines.forEach(l => (devanagariRatio(l) > .5 ? hiQ : enQ).push(l));
    let qtext = enQ.join(' ').replace(/\s+/g, ' ').trim();
    const qtextHi = hiQ.join(' ').replace(/\s+/g, ' ').trim() || null;
    let opts = null, recovered = false;

    if (fmt === 'A' || fmt === 'D') {
      if (!['A', 'B', 'C', 'D'].every(k => fmtOpts[k])) return { err: 'options missing' };
      opts = ['A', 'B', 'C', 'D'].map(k => (fmtOpts[k] || []).join(' ').replace(/\s+/g, ' ').trim());
      for (let i = 0; i < 4; i++) {
        const gm = opts[i].match(/^Answer:\s*([A-D?]+)\s*$/);
        if (gm) { opts[i] = ''; if (!answer) answer = gm[1]; }
      }
      if (!opts.some(Boolean)) {
        if (!qtext) return { err: 'empty question' };
        return { q: _finalize(defaultSubject, qtext + ' (Options are figure-based in the source)',
          ['Figure A (see source)', 'Figure B (see source)', 'Figure C (see source)', 'Figure D (see source)'],
          /^[A-D]$/.test(answer || '') ? answer : null, meta(), year, ['pyq', 'figure-based'], {
            questionTextHi: qtextHi, explanation: expLines.join(' ').replace(/\s+/g, ' ').trim(),
            explanationHi: expHiLines.join(' ').replace(/\s+/g, ' ').trim() || null
          }) };
      }
      if (!opts[0] && !opts[3] && opts[1] && opts[2] && !['1.', '2.', '3.', '4.'].includes(opts[1]) && !['1.', '2.', '3.', '4.'].includes(opts[2]) && /1\. 2\. 3\. 4\./.test(qtext)) {
        const m2 = qtext.match(/^(.*?)\s*1\. 2\. 3\. 4\.\s*(.*)$/);
        if (m2) {
          const stem2 = m2[1].trim(), tail = m2[2].trim();
          const parts = _split_tail3(tail, opts[2]);
          if (parts && stem2.startsWith(opts[1]) && stem2.endsWith(opts[2])) {
            qtext = opts[1]; opts = [opts[2]].concat(parts);
            recovered = true;
          } else return { err: 'garbled source layout (unrecoverable)' };
        } else return { err: 'garbled source layout (unrecoverable)' };
      }
    } else if (fmt === 'B') {
      const segs = [];
      for (const raw of b.rest) {
        const s = raw.trim();
        if (/^([1-4])\.\s*$/.test(s)) segs.push({ m: true });
        else if (s) segs.push({ t: s });
      }
      // text segments before the FIRST marker = [first, qtext lines..., opt1]
      const preAll = [b.first];
      for (const sg of segs) { if (sg.m) break; if (sg.t) preAll.push(sg.t); }
      if (preAll.length < 2) return { err: 'missing question text or options in source' };
      qtext = preAll.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim();
      const opt1 = preAll[preAll.length - 1];
      opts = [opt1];
      let buf = [], seenMarkers = 0;
      for (const sg of segs) {
        if (sg.t) buf.push(sg.t);
        else {
          seenMarkers++;
          if (seenMarkers === 1) buf = [];
          else { if (buf.length) opts.push(buf.join(' ')); buf = []; }
        }
      }
      opts = opts.slice(0, 4);
    } else {
      if (/No error\.? A B C D$/.test(qtext)) {
        qtext = qtext.replace(/\s*No error\.? A B C D\s*$/, '') + ' (Options: A / B / C / No Error)';
        opts = ['A', 'B', 'C', 'No Error'];
      } else return { err: 'no options found' };
    }

    if (!qtext) return { err: 'missing question text' };
    if (opts.filter(Boolean).length < 4) return { err: 'missing option text' };
    if (answer && !/^[A-D]$/.test(answer)) answer = null;
    return { q: _finalize(defaultSubject, qtext, opts, answer || null, meta(), year, recovered ? ['pyq', 'auto-reconstructed'] : ['pyq'], {
      questionTextHi: qtextHi,
      explanation: expLines.join(' ').replace(/\s+/g, ' ').trim(),
      explanationHi: expHiLines.join(' ').replace(/\s+/g, ' ').trim() || null
    }), recovered };
  }

  function _finalize(subject, qtext, opts, ans, source, year, tags, extra) {
    const x = extra || {};
    return {
      id: null,
      subject,
      chapter: 'General',
      topic: 'General',
      difficulty: 'medium',
      questionText: qtext,
      questionTextHi: x.questionTextHi || null,
      image: null,
      options: ['A', 'B', 'C', 'D'].map((L, i) => ({ id: L, text: opts[i] })),
      correctAnswer: ans,
      explanation: x.explanation || '',
      explanationHi: x.explanationHi || null,
      source,
      year,
      tags,
      figureBased: tags && tags.includes('figure-based')
    };
  }

  /* ================= generic TXT fallback ================= */
  function parseGenericTxt(text, defaultSubject) {
    const out = { questions: [], invalid: [], duplicates: 0, keyed: 0, unkeyed: 0, figure: 0, recovered: 0 };
    const blocks = text.split(/(?=^(?:Q(?=\d)|\d+[).])\s)/m);
    for (const blk of blocks) {
      const lines = blk.split(/\r?\n/).map(s => s.trim());
      let qt = [], opts = {}, ans = null, cur = null;
      for (const s of lines) {
        if (!s) continue;
        let m;
        m = s.match(/^(?:Q\s*\d+[).]?|[0-9]+[).])[.)]?\s*(.*)$/i);
        if (m && cur === null) { qt.push(m[1]); cur = 'q'; continue; }
        m = s.match(/^(?:\(?([A-Da-d])\)?[).:]|([A-Da-d])[).])\s*(.*)$/);
        if (m) {
          const L = (m[1] || m[2]).toUpperCase();
          if ('ABCD'.includes(L)) { cur = L; opts[L] = m[3]; continue; }
        }
        m = s.match(/^(?:Answer|Ans|Correct|Key)\s*[:\-]?\s*(.+)$/i);
        if (m) { ans = m[1].trim().toUpperCase().match(/[A-D]/)?.[0] || null; cur = 'done'; continue; }
        if (cur === 'q' || cur === null) qt.push(s);
        else if (cur && opts[cur] !== undefined) opts[cur] += ' ' + s;
        else qt.push(s);
      }
      const qtext = qt.join(' ').replace(/\s+/g, ' ').trim();
      const oo = ['A', 'B', 'C', 'D'].map(L => (opts[L] || '').trim());
      if (qtext && oo.filter(Boolean).length === 4) {
        out.questions.push(_finalize(defaultSubject, qtext, oo, ans, 'TXT import', null, ['imported']));
        if (ans) out.keyed++; else out.unkeyed++;
      } else if (qtext) {
        out.invalid.push({ reason: 'could not detect question/options', text: qtext.slice(0, 120) });
      }
    }
    return out;
  }

  /* ================= JSON ================= */
  function parseJson(text) {
    const out = { questions: [], invalid: [], duplicates: 0, keyed: 0, unkeyed: 0, figure: 0, recovered: 0 };
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON file: ' + e.message); }
    // full app backup exported from Settings → also carry tests/attempts/meta for restore
    if (data && data.app === 'agniveer-cbt' && Array.isArray(data.questions)) {
      out.restore = {
        tests: Array.isArray(data.tests) ? data.tests : [],
        attempts: Array.isArray(data.attempts) ? data.attempts : [],
        notes: Array.isArray(data.notes) ? data.notes : [],
        meta: (data.meta && typeof data.meta === 'object') ? data.meta : {}
      };
    }
    let arr = Array.isArray(data) ? data : (Array.isArray(data.questions) ? data.questions : null);
    if (!arr) throw new Error('JSON must be an array of questions or { questions: [...] }');
    for (const o of arr) {
      const { q, errs } = mkQuestion(o);
      if (errs.length) out.invalid.push({ reason: errs.join('; '), text: String(o.question || o.questionText || '').slice(0, 120) });
      else { out.questions.push(q); if (q.correctAnswer) out.keyed++; else out.unkeyed++; if (q.image) out.figure++; }
    }
    return out;
  }

  /* ================= CSV ================= */
  function parseCsv(text) {
    const out = { questions: [], invalid: [], duplicates: 0, keyed: 0, unkeyed: 0, figure: 0, recovered: 0 };
    const rows = csvRows(text);
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one question row');
    const header = rows[0].map(h => h.trim());
    for (const r of rows.slice(1)) {
      if (!r.length || r.every(c => !c.trim())) continue;
      const o = {};
      header.forEach((h, i) => o[h] = (r[i] || '').trim());
      const { q, errs } = mkQuestion(o);
      if (errs.length) out.invalid.push({ reason: errs.join('; '), text: String(o.question || o.questionText || '').slice(0, 120) });
      else { out.questions.push(q); if (q.correctAnswer) out.keyed++; else out.unkeyed++; if (q.image) out.figure++; }
    }
    return out;
  }

  function csvRows(text) {
    const rows = []; let row = []; let cur = ''; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cur); rows.push(row); row = []; cur = '';
        } else cur += c;
      }
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ================= DOCX (unzip via DecompressionStream) ================= */
  async function parseDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const files = await unzip(buf);
    const docXml = new TextDecoder().decode(files['word/document.xml']);
    if (!docXml) throw new Error('Not a valid DOCX (word/document.xml missing)');
    const relsXml = files['word/_rels/document.xml.rels'] ? new TextDecoder().decode(files['word/_rels/document.xml.rels']) : '';
    const relMap = {};
    (relsXml.match(/<Relationship\b[^>]*>/g) || []).forEach(tag => {
      const id = tag.match(/Id="([^"]+)"/), tgt = tag.match(/Target="([^"]+)"/);
      if (id && tgt) relMap[id[1]] = tgt[1].replace(/^\//, '');
    });

    // paragraph list with embedded image markers
    const paras = [];
    let idx = 0;
    const parts = docXml.split(/<\/w:p>/);
    for (const p of parts) {
      let text = '';
      const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<a:blip[^>]*r:embed="([^"]+)"/g;
      let m;
      while ((m = re.exec(p))) {
        if (m[1] !== undefined) text += m[1];
        else if (m[2]) {
          const target = relMap[m[2]] ? 'word/' + relMap[m[2]].replace('word/', '') : null;
          const data = target && files[target] ? files[target] : null;
          if (data) {
            const b64 = btoa(String.fromCharCode(...data));
            text += `\n[[IMG:${b64}]]\n`;
          }
        }
      }
      text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (text.trim()) paras.push(text.trim());
      idx++;
    }
    return parseMasterOrGeneric(paras.join('\n'));
  }

  async function unzip(buf) {
    // minimal ZIP reader using DecompressionStream('deflate-raw')
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip DOCX files offline. Please convert to TXT/JSON/CSV.');
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // find End of Central Directory
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid DOCX/ZIP file');
    const cdCount = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const entries = [];
    for (let i = 0; i < cdCount; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const csize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const cmtLen = dv.getUint16(ptr + 32, true);
      const lho = dv.getUint32(ptr + 42, true);
      const name = new TextDecoder().decode(buf.subarray(ptr + 46, ptr + 46 + nameLen));
      entries.push({ name, method, csize, lho });
      ptr += 46 + nameLen + extraLen + cmtLen;
    }
    const out = {};
    for (const e of entries) {
      if (e.name.endsWith('/')) continue;
      const lhNameLen = dv.getUint16(e.lho + 26, true);
      const lhExtraLen = dv.getUint16(e.lho + 28, true);
      const dataStart = e.lho + 30 + lhNameLen + lhExtraLen;
      const raw = buf.subarray(dataStart, dataStart + e.csize);
      if (e.method === 0) out[e.name] = raw;
      else if (e.method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        out[e.name] = new Uint8Array(await new Response(stream).arrayBuffer());
      }
    }
    return out;
  }

  /* ================= PDF (best effort) ================= */
  async function parsePdf(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const chunks = [];
    // find stream...endstream segments
    const text8 = new TextDecoder('latin1').decode(buf);
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(text8))) {
      const start = m.index + m[0].length;
      const end = text8.indexOf('endstream', start);
      if (end < 0) break;
      const seg = buf.subarray(start, end);
      // try inflate
      try {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([seg]).stream().pipeThrough(ds);
        const txt = await new Response(stream).text();
        if (txt) chunks.push(txt);
      } catch (e) { /* not deflate — skip */ }
      re.lastIndex = end;
    }
    let text = '';
    for (const c of chunks) {
      // extract Tj / TJ strings
      const tj = c.match(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/g);
      if (tj) {
        for (const t of tj) {
          const strs = t.match(/\((?:\\.|[^\\)])*\)/g) || [];
          let line = '';
          for (const s of strs) {
            line += s.slice(1, -1).replace(/\\([()\\])/g, '$1');
          }
          text += line + '\n';
        }
      }
    }
    if (!text.trim()) {
      throw new Error('This PDF appears to be scanned (no extractable text). Convert it to TXT/DOCX (e.g. copy-paste the text or use an OCR tool) and import that instead.');
    }
    return parseMasterOrGeneric(text);
  }

  /* ---------- dispatch: master format vs generic ---------- */
  function parseMasterOrGeneric(text, defaultSubject) {
    const looksMaster = /PAPER\s+\d+\s*\|/.test(text) || /\n\s*\(A\)/.test(text) || /^\s*Q\d+\./m.test(text) && /Answer:/.test(text);
    if (looksMaster) return parseMasterTxt(text, defaultSubject);
    return parseGenericTxt(text, defaultSubject);
  }

  /* ================= file dispatch ================= */
  async function parseFile(file, defaultSubject) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'json') return parseJson(await file.text());
    if (ext === 'csv') return parseCsv(await file.text());
    if (ext === 'txt') {
      const t = await file.text();
      return parseMasterOrGeneric(t, defaultSubject);
    }
    if (ext === 'docx' || ext === 'doc') {
      if (ext === 'doc') throw new Error('Legacy .doc is not supported — save as .docx or export to TXT.');
      return parseDocx(file);
    }
    if (ext === 'pdf') return parsePdf(file);
    throw new Error(`Unsupported file type ".${ext}". Supported: TXT, JSON, CSV, DOCX, PDF.`);
  }

  return { parseFile, parseMasterTxt, parseGenericTxt, parseJson, parseCsv, parseDocx, parsePdf, mkQuestion };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Parsers;
