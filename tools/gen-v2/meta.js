'use strict';
/* V2 META — data/ssc-chsl/bank-meta.json regenerate from the 4 v2 banks.
   _bundleKind: "v2" — syncBundled isme 'final' → 'v2' transition pakad ke
   purgeBankReplace chalata hai (purana bank devices se hata, naya v2 aata hai). */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'data', 'ssc-chsl');
const subjects = ['mathematics', 'english', 'reasoning', 'gs'];
const NAMES = { mathematics: 'Mathematics', english: 'English Language', reasoning: 'Reasoning', gs: 'General Awareness' };
const meta = {
  _bundleKind: 'v2b',
  _note: 'v1.4.62 V2 BANK — daily-100 quality model. Purana 10,275 Q bank DB + devices se hata (archive-v1/ me safe). Har subject me 100% verified curated questions (real options, explanations, chapter diversity). Roz 100/subject add hote rahenge.',
  total: 0
};
for (const s of subjects) {
  const bank = JSON.parse(fs.readFileSync(path.join(DIR, `bank-${s}.json`), 'utf8'));
  const chapters = {};
  for (const q of bank) chapters[q.chapter] = (chapters[q.chapter] || 0) + 1;
  meta[s] = {
    total: bank.length,
    keyed: bank.filter(q => q.correctAnswer).length,
    withExplanation: bank.filter(q => q.explanation).length,
    chapters
  };
  meta.total += bank.length;
}
fs.writeFileSync(path.join(DIR, 'bank-meta.json'), JSON.stringify(meta));
console.log('meta written:', JSON.stringify(meta, (k, v) => k === 'chapters' ? undefined : v));
