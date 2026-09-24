'use strict';
/* V2 SHUFFLE — har subject me correctAnswer distribution 25/25/25/25 balance.
   Options permute hote hain (correct option target letter pe), explanation
   safe (letters refer nahi karte). Deterministic seeded PRNG. */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'data', 'ssc-chsl');
const LETTERS = ['A', 'B', 'C', 'D'];

/* mulberry32 seeded PRNG */
function prng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20260924);

for (const s of ['gs', 'english', 'reasoning', 'mathematics']) {
  const file = path.join(DIR, `bank-${s}.json`);
  const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
  const quota = { A: bank.length / 4, B: bank.length / 4, C: bank.length / 4, D: bank.length / 4 };
  for (const q of bank) {
    /* letter with the largest remaining quota (seeded tie-break) */
    const target = LETTERS.slice().sort((a, b) => quota[b] - quota[a] || (rand() - 0.5))[0];
    quota[target]--;
    const opts = q.options.slice();
    const correctText = opts.find(o => o.id === q.correctAnswer);
    const wrong = opts.filter(o => o.id !== q.correctAnswer);
    /* seeded shuffle of wrong options */
    for (let i = wrong.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
    }
    const targetIdx = LETTERS.indexOf(target);
    const newOpts = [];
    let w = 0;
    for (let i = 0; i < 4; i++) newOpts.push(i === targetIdx ? correctText : wrong[w++]);
    newOpts.forEach((o, i) => { o.id = LETTERS[i]; });
    q.options = newOpts;
    q.correctAnswer = target;
  }
  fs.writeFileSync(file, JSON.stringify(bank));
  const dist = {};
  for (const q of bank) dist[q.correctAnswer] = (dist[q.correctAnswer] || 0) + 1;
  console.log(`${s}: shuffled → ${JSON.stringify(dist)}`);
}
console.log('SHUFFLE DONE ✓');
