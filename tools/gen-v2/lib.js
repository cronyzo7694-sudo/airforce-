'use strict';
/* ============================================================
 * V2 BANK LIB — daily-100 quality bank builder
 *  - har Q validate: 4 non-empty distinct options, valid key,
 *    explanation ZAROORI, koi placeholder/junk text nahi,
 *    sirf whitelist HTML tags (u/b/i/sub/sup/br)
 *  - canonical file data/ssc-chsl/bank-<subject>.json likhta hai
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'ssc-chsl');

const JUNK_RE = /\[\s*(option|answer|image|figure)?[^\]]*\]\s*(me|mein|in)?\s*(tha|hai|not)?|refer\s*(to)?\s*(the)?\s*(pdf|figure|image|diagram|passage above)|not\s+extracted|option\s+(text\s+)?(image|figure)/i;
const TAG_RE = /<(\/?[a-zA-Z][^>]{0,40}?)>/g;
const ALLOWED_TAGS = /^(\/?)(u|b|i|em|strong|sub|sup|br)$/i;

let seq = 0;
function Q(subject, subjectName, chapter, topic, q, opts, ans, exp, extra) {
  seq++;
  extra = extra || {};
  const optsArr = opts.map((t, i) => ({ id: 'ABCD'[i], text: String(t), textHi: (extra.optsHi && extra.optsHi[i]) ? extra.optsHi[i] : String(t) }));
  if (optsArr.length !== 4) throw new Error(`[${subject} #${seq}] options != 4: ${q.slice(0, 50)}`);
  if (new Set(optsArr.map(o => o.text.trim().toLowerCase())).size !== 4) throw new Error(`[${subject} #${seq}] duplicate options: ${q.slice(0, 50)}`);
  if (!/^[ABCD]$/.test(ans)) throw new Error(`[${subject} #${seq}] bad key ${ans}: ${q.slice(0, 50)}`);
  if (!exp || String(exp).trim().length < 5) throw new Error(`[${subject} #${seq}] explanation missing: ${q.slice(0, 50)}`);
  for (const t of [q, exp].concat(optsArr.map(o => o.text))) {
    if (JUNK_RE.test(t)) throw new Error(`[${subject} #${seq}] JUNK pattern: ${t.slice(0, 60)}`);
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(t)) !== null) {
      if (!ALLOWED_TAGS.test(m[1])) throw new Error(`[${subject} #${seq}] tag <${m[1]}> NOT allowed (only u/b/i/em/strong/sub/sup/br): ${t.slice(0, 60)}`);
    }
  }
  if (/\{\{|\}\}|TODO|FIXME|XXX|lorem ipsum/i.test(q + exp)) throw new Error(`[${subject} #${seq}] placeholder text: ${q.slice(0, 50)}`);
  const text = String(q);
  /* default: textHi = text copy (GS me text hi Hindi hai; EN me copy
     by-design — Devanagari gate render time par sambhal leta hai) */
  const hi = extra.qHi !== undefined ? extra.qHi : text;
  return {
    id: `v2_${subject}_${String(seq).padStart(4, '0')}`,
    subject, subjectName, chapter,
    topic: extra.topic || topic,
    difficulty: extra.diff || 'medium',
    questionText: text,
    questionTextHi: hi,
    image: null,
    options: optsArr,
    correctAnswer: ans,
    explanation: String(exp),
    explanationHi: extra.expHi !== undefined ? extra.expHi : String(exp),
    source: extra.source || 'SSC CHSL v2 curated',
    year: extra.year || 2026,
    tags: ['v2', (extra.tag || chapter.toLowerCase().replace(/[^a-z0-9]+/g, '-'))],
    dupeHash: 'computed-at-import',
    figureBased: !!extra.fig,
    paper: null
  };
}

function build(subject, subjectName, list) {
  const seen = new Set();
  for (const q of list) {
    const key = q.questionText.trim().toLowerCase().slice(0, 120);
    if (seen.has(key)) throw new Error(`[${subject}] DUPLICATE in batch: ${key}`);
    seen.add(key);
  }
  const chapters = {};
  for (const q of list) chapters[q.chapter] = (chapters[q.chapter] || 0) + 1;
  const out = path.join(OUT_DIR, `bank-${subject}.json`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(list));
  console.log(`bank-${subject}.json: ${list.length} Q | chapters: ${JSON.stringify(chapters)}`);
  if (list.length !== 100) console.warn(`  WARNING: ${subject} count = ${list.length}, expected 100`);
  return list.length;
}

module.exports = { Q, build };
