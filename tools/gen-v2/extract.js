'use strict';
/* ============================================================
 * V2 EXTRACT — archive-v1 (REAL PYQ bank, 10,275 Q) se SURU KE
 * N questions har subject ke nikaal ke canonical bank banata hai.
 *   node tools/gen-v2/extract.js --start=0 --count=100
 * Original ids, source, paper, year, dupeHash — SAB as-is preserve.
 * Koi reshuffle nahi, koi content change nahi — zero mismatch.
 * Next batch: --start=100 --count=100 (aur aage aate jao).
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ARCHIVE = path.join(ROOT, 'data', 'ssc-chsl', 'archive-v1');
const OUT = path.join(ROOT, 'data', 'ssc-chsl');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=')];
}));
const start = parseInt(args.start || '0', 10);
const count = parseInt(args.count || '100', 10);
const subjects = args.subjects ? args.subjects.split(',') : ['gs', 'english', 'reasoning', 'mathematics'];

for (const s of subjects) {
  const src = JSON.parse(fs.readFileSync(path.join(ARCHIVE, `bank-${s}.json`), 'utf8'));
  const slice = src.slice(start, start + count);
  if (slice.length !== count) console.warn(`  WARNING: ${s} slice ${start}..${start + count - 1} = ${slice.length} Q (file me ${src.length})`);
  for (const q of slice) {
    if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`${q.id}: options != 4`);
    if (!q.correctAnswer) throw new Error(`${q.id}: answer key missing`);
    if (!q.explanation) throw new Error(`${q.id}: explanation missing`);
    if (!q.source) throw new Error(`${q.id}: source/paper missing`);
    if (/\[\s*(option|answer|image|figure)/i.test(q.questionText + ' ' + q.options.map(o => o.text).join(' '))) throw new Error(`${q.id}: junk placeholder`);
  }
  fs.writeFileSync(path.join(OUT, `bank-${s}.json`), JSON.stringify(slice));
  const shifts = new Set(slice.map(q => q.source));
  const years = [...new Set(slice.map(q => q.year))].sort().join(', ');
  console.log(`bank-${s}.json: ${slice.length} REAL PYQ [${start}..${start + slice.length - 1}] | ${shifts.size} shifts | years: ${years}`);
}
console.log(`EXTRACT DONE ✓ (next batch: --start=${start + count} --count=${count})`);
