/* ============================================================
 * PARSER QA — verify the in-browser TXT/JSON/CSV parsers against
 * the actual master question files.
 * Run: node tests/parser.test.js
 * ============================================================ */
process.chdir(__dirname + '/..');
const fs = require('fs');

global.AVUtil = require('../js/util.js');
const Parsers = require('../js/parsers.js');
const Bank = require('../js/seed.js');

let passed = 0, failed = 0;
function T(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n     →', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${b}, got ${a}`); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const UP = '../uploads/';
/* uploads/ = user ke real Master files — repo me commit nahi hote (privacy).
   Fresh clone par ye tests SKIP ho jate hain, fail nahi. */
const UP_OK = (() => { try { fs.readFileSync(UP + 'Master_Physics_All_Papers (1).txt'); return true; } catch (e) { return false; } })();
if (!UP_OK) console.log('  ↷ NOTE: uploads/ master files missing — bank-parity tests skip honge');
const skipNoUp = fn => { if (!UP_OK) { console.log('  ↷ SKIP (uploads/ missing)'); return; } fn(); };
const FILES = [
  ['Master_Physics_All_Papers (1).txt', 'physics'],
  ['Master_Math_All_Papers.txt', 'mathematics'],
  ['Master_English_All_Papers.txt', 'english']
  // RAGA bank is now the user-curated bilingual master (Sep 2026) — no longer a
  // superset of the old English-only master, so the old parity test is retired.
];

console.log('\n━━━ master TXT parser vs Python reference output (after importer dedupe)');
for (const [fname, subject] of FILES) {
  T(`${fname} → matches data/airforce/bank-${subject}.json`, () => {
    if (!UP_OK) { console.log('    ↷ skip (uploads/ missing)'); return; }
    const text = fs.readFileSync(UP + fname, 'utf-8');
    const res = Parsers.parseMasterTxt(text, subject);
    // apply the same dedupe the importer uses
    const seen = new Map();
    const final = [];
    for (const q of res.questions) {
      q.options = q.options || [];
      const dh = Bank.dupeId(q);
      const id = Bank.contentId(q);
      if (seen.has(dh)) {
        const prev = seen.get(dh);
        if (!prev.correctAnswer && q.correctAnswer) final[final.indexOf(prev)] = Object.assign({}, prev, { correctAnswer: q.correctAnswer });
        continue;
      }
      seen.set(dh, q);
      final.push(q);
    }
    const ref = JSON.parse(fs.readFileSync(`data/airforce/bank-${subject}.json`, 'utf-8'));
    // data files may be a SUPERSET of the master TXT (bilingual records merged in)
    // — v1.4.15: user ka updated English master bank se BADHA hai (zyada real sawal);
    //   user ne extra add karne se mana kiya hai → bank = real-paper subset, 800+ floor
    // — v1.4.17: math bhi curated subset hai — 84 OCR records hatae (unrecoverable
    //   stems + descramble twins jo bilingual bank me pehle se the) → superset nahi
    if (subject === 'english' || subject === 'physics' || subject === 'mathematics') {
      const floor = subject === 'english' ? 700 : (subject === 'mathematics' ? 690 : 600);
      assert(ref.length >= floor, subject + ' bank ' + floor + '+ real-paper records (got ' + ref.length + ')');
      assert(ref.filter(q => q.correctAnswer).length >= floor, 'keyed ' + subject + ' bank');
    } else {
      assert(ref.length >= final.length, 'data file is a superset (' + ref.length + ' >= ' + final.length + ')');
      assert(ref.filter(q => q.correctAnswer).length >= final.filter(q => q.correctAnswer).length, 'keyed superset');
    }
    // v1.4.15: english bank = subset (user ke naye master me scrambled blocks parser
    // auto-reconstruct karta hai) — bank me reconstructed records kabhi nahi hote
    if (subject === 'english') {
      eq(ref.filter(q => (q.tags || []).includes('auto-reconstructed')).length, 0, 'bank me zero reconstructed');
    } else {
      eq(final.filter(q => (q.tags || []).includes('auto-reconstructed')).length,
         ref.filter(q => (q.tags || []).includes('auto-reconstructed')).length, 'reconstructed parity');
    }
    // every question valid shape
    final.forEach(q => {
      assert(q.subject === subject, 'subject set');
      assert(q.questionText && q.questionText.length >= 1, 'question text');
      assert(q.options.length === 4 && q.options.every(o => o.text && o.text.length > 0), '4 options with text');
      assert(!q.correctAnswer || 'ABCD'.includes(q.correctAnswer), 'key format');
    });
  });
}

console.log('\n━━━ sample parse checks');
T('physics format-A question parses options + key', () => {
  if (!UP_OK) { console.log('    ↷ skip (uploads/ missing)'); return; }
  const res = Parsers.parseMasterTxt(fs.readFileSync(UP + FILES[0][0], 'utf-8'), 'physics');
  const q = res.questions.find(x => x.questionText.includes('electrostatic force between two charges'));
  eq(q.options[2].text, '4 N', 'option C');
  eq(q.correctAnswer, 'C', 'key');
});
T('RAGA figure-based flagged and excluded later', () => {
  if (!UP_OK) { console.log('    ↷ skip (uploads/ missing)'); return; }
  const res = Parsers.parseMasterTxt(fs.readFileSync(UP + 'Master_RAGA_All_Papers.txt', 'utf-8'), 'raga');
  const fig = res.questions.filter(q => q.figureBased);
  assert(fig.length > 60, 'figure count: ' + fig.length);
  assert(fig.every(q => q.questionText.includes('figure-based')), 'note present');
  assert(fig.every(q => q.correctAnswer), 'figure questions keep their key');
});
T('English reconstructed questions look sane', () => {
  if (!UP_OK) { console.log('    ↷ skip (uploads/ missing)'); return; }
  const res = Parsers.parseMasterTxt(fs.readFileSync(UP + FILES[2][0], 'utf-8'), 'english');
  const rec = res.questions.filter(q => (q.tags || []).includes('auto-reconstructed'));
  const ref = JSON.parse(fs.readFileSync('data/airforce/bank-english.json', 'utf-8')).filter(q => (q.tags || []).includes('auto-reconstructed'));
  assert(rec.length >= ref.length, 'reconstructed pre-dedupe (' + rec.length + ') >= post-dedupe (' + ref.length + ')');
  const iaf = rec.find(q => q.questionText.includes('key role of the Indian Air Force'));
  eq(iaf.options[1].text, 'to keep the Indian aerospace resistant to attacks', 'IAF option B');
  eq(iaf.correctAnswer, 'B', 'IAF key');
});

console.log('\n━━━ generic parsers');
T('generic TXT with Q/A)/Ans format', () => {
  const res = Parsers.parseGenericTxt(`Q1. What is 2+2?\nA) 3\nB) 4\nC) 5\nD) 6\nAns: B\n\n2. Next question?\n(a) x\n(b) y\n(c) z\n(d) w\nAnswer: a`, 'physics');
  eq(res.questions.length, 2, 'two questions');
  eq(res.questions[0].correctAnswer, 'B', 'key1');
  eq(res.questions[1].correctAnswer, 'A', 'key2');
});
T('JSON import (flexible keys)', () => {
  const res = Parsers.parseJson(JSON.stringify([
    { subject: 'physics', question: 'Q?', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', answer: 'd', explanation: 'exp', chapter: 'Ch', topic: 'To', difficulty: 'hard' },
    { subject: 'unknown-subject', question: 'bad', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd' }
  ]));
  eq(res.questions.length, 1, '1 valid');
  eq(res.invalid.length, 1, '1 invalid (unknown subject)');
  eq(res.questions[0].correctAnswer, 'D', 'key');
});
T('CSV import with quoted fields', () => {
  const csv = 'subject,question,optionA,optionB,optionC,optionD,answer\n' +
    'mathematics,"What is 5 x 5, exactly?","20","25","30","35",B\n';
  const res = Parsers.parseCsv(csv);
  eq(res.questions.length, 1, '1 row');
  eq(res.questions[0].questionText, 'What is 5 x 5, exactly?', 'quoted comma preserved');
  eq(res.questions[0].correctAnswer, 'B', 'key');
});

console.log('\n━━━ full backup JSON restore');
T('backup payload parses questions + restore data', () => {
  const backup = JSON.stringify({
    app: 'agniveer-cbt', version: 1, exportedAt: '2026-01-01',
    questions: [{ question: 'Backup Q?', options: ['a', 'b', 'c', 'd'], answer: 'A', subject: 'physics' }],
    tests: [{ id: 't1', name: 'Restored test' }],
    attempts: [{ id: 'a1', testId: 't1', completed: true }],
    meta: { attemptIndex: [{ id: 'a1', score: 3 }] }
  });
  const parsed = Parsers.parseJson(backup);
  eq(parsed.questions.length, 1, 'backup questions parsed');
  assert(parsed.restore && parsed.restore.tests.length === 1 && parsed.restore.attempts.length === 1
    && parsed.restore.meta.attemptIndex.length === 1, 'restore payload carried (tests/attempts/meta)');
  const plain = Parsers.parseJson(JSON.stringify([{ question: 'Plain Q?', options: ['1', '2', '3', '4'], answer: 'B', subject: 'raga' }]));
  assert(!plain.restore, 'plain question JSON has no restore payload');
});

console.log('\n━━━ bilingual master TXT (Solution — English / समाधान — हिन्दी format)');
T('bilingual TXT: Hindi question + both explanations parsed', () => {
  const sample = [
    '==============================================================================',
    'PAPER 1  |  GROUP Y  |  04 Nov 2020  |  Source: Prepp',
    '==============================================================================',
    '',
    'Q1. For a standard clock, what is the angle at 9:30 am?',
    'एक सामान्य घड़ी में जब समय 9:30 am हो तो कोण कितना होगा?',
    '',
    '(A) 250°',
    '(B) 105°',
    '(C) 150°',
    '(D) 165°',
    'Answer: B',
    '',
    'Solution — English',
    'Angle = |30H − 5.5M| = 105°.',
    '',
    'समाधान — हिन्दी',
    'कोण = |30H − 5.5M| = 105°।',
    '',
    'सही उत्तर: (B)',
    '',
    'Q2. Choose the correct figure?',
    'सही आकृति चुनिए।',
    '',
    '(Options are figure-based in the source — विकल्प स्रोत में चित्र आधारित हैं)',
    'Answer: C',
    '',
    'Solution — English',
    'Rotate the figure.',
    '',
    'समाधान — हिन्दी',
    'आकृति घुमाइए।',
    '',
    'सही उत्तर: (C)'
  ].join('\n');
  const res = Parsers.parseMasterTxt(sample, 'raga');
  eq(res.questions.length, 2, '2 questions');
  const q1 = res.questions[0], q2 = res.questions[1];
  eq(q1.questionText, 'For a standard clock, what is the angle at 9:30 am?', 'English text clean');
  eq(q1.questionTextHi, 'एक सामान्य घड़ी में जब समय 9:30 am हो तो कोण कितना होगा?', 'Hindi question split out');
  eq(q1.correctAnswer, 'B', 'answer key');
  assert(q1.explanation.includes('105°') && q1.explanation.includes('30H'), 'English explanation captured');
  assert((q1.explanationHi || '').includes('कोण'), 'Hindi explanation captured');
  assert(!q1.questionText.includes('सही'), 'सही उत्तर line not leaked into question');
  assert(q2.figureBased, 'figure-based detected');
  eq(q2.questionTextHi, 'सही आकृति चुनिए।', 'figure question Hindi kept');
  assert((q2.explanationHi || '').includes('घुमाइए'), 'figure Hindi explanation kept');
});
T('uploaded bilingual master parses end-to-end (uploads present)', () => {
  let text;
  try { text = fs.readFileSync(UP + 'RAGA_Master_Bilingual_Solutions.txt', 'utf-8'); }
  catch (e) { return; /* uploads not present in this checkout — skip */ }
  const res = Parsers.parseMasterTxt(text, 'raga');
  assert(res.questions.length >= 790, '790+ questions parsed (got ' + res.questions.length + ')');
  assert(res.questions.filter(q => q.questionTextHi).length >= 770, '770+ with Hindi question');
  assert(res.questions.every(q => !q.questionText.includes('सही उत्तर')), 'no answer-repeat leak');
});

console.log('\n━━━ bilingual (EN + HI) + exam-scope support');
T('bilingual JSON: Hindi fields kept + subjects mapped', () => {
  const res = Parsers.parseJson(JSON.stringify([
    { subject: 'reasoning', questionText: 'Pick the odd one?', questionTextHi: 'विषम को चुनिए?', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }, { id: 'C', text: 'c' }, { id: 'D', text: 'd' }], answer: 'A', explanation: 'en exp', explanationHi: 'hi exp', chapter: 'Reasoning', topic: 'Odd One' },
    { subject: 'general-awareness', questionText: 'Capital of India?', options: ['Delhi', 'Mumbai', 'Pune', 'Agra'], answer: 'A' },
    { subject: 'mathematics', questionText: '2+2?', options: ['3', '4', '5', '6'], answer: 'B', explanationHi: 'केवल हिन्दी व्याख्या' }
  ]));
  eq(res.questions.length, 3, '3 valid');
  eq(res.questions[0].subject, 'raga', 'reasoning → raga');
  eq(res.questions[1].subject, 'raga', 'general-awareness → raga');
  eq(res.questions[2].subject, 'mathematics', 'mathematics stays');
  eq(res.questions[0].questionTextHi, 'विषम को चुनिए?', 'Hindi question kept');
  eq(res.questions[0].explanationHi, 'hi exp', 'Hindi explanation kept');
  eq(res.questions[1].questionTextHi, null, 'no Hindi → null (not empty string)');
  eq(res.questions[2].explanationHi, 'केवल हिन्दी व्याख्या', 'Hindi-only explanation kept');
});
T('subject files carry bilingual (EN+HI) records — no separate hindi file', () => {
  assert(!fs.existsSync('data/airforce/bank-hindi-1.json'), 'no separate hindi bundle file');
  const raga = JSON.parse(fs.readFileSync('data/airforce/bank-raga.json', 'utf-8'));
  // RAGA: 100% bilingual + 100% dual explanations + real chapters (user-curated master)
  assert(raga.length >= 600, 'raga bank has 600+ records (got ' + raga.length + ')'); // v1.4.15: figure-based hata (80)
  assert(raga.every(q => q.questionTextHi), 'EVERY raga question is bilingual');
  assert(raga.every(q => q.explanation && q.explanationHi), 'EVERY raga question has EN+HI explanations');
  assert(raga.every(q => q.subject === 'raga'), 'no stray subjects (reasoning/GK aliases all raga)');
  assert(raga.every(q => q.chapter && q.chapter !== 'General'), 'every raga record has a real chapter');
  assert(raga.every(q => q.options && q.options.length === 4), 'every raga record has 4 options');
  const math = JSON.parse(fs.readFileSync('data/airforce/bank-mathematics.json', 'utf-8'));
  const bi = arr => arr.filter(q => q.questionTextHi && q.explanationHi);
  assert(bi(raga).length >= 60, 'raga file has 60+ bilingual records (got ' + bi(raga).length + ')');
  assert(bi(math).length >= 30, 'math file has 30+ bilingual records (got ' + bi(math).length + ')');
  assert(bi(raga).concat(bi(math)).every(q => q.options && q.options.length === 4), 'all have 4 options');
  assert(bi(raga).concat(bi(math)).every(q => (q.exam || 'airforce') === 'airforce'), 'exam-tagged (default airforce)');
});

console.log('\n━━━ importer dedupe logic');
T('duplicate content detected via dupeHash', () => {
  const q = { subject: 'physics', questionText: 'Same question?', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }], correctAnswer: 'A' };
  const id1 = Bank.contentId(q);
  const q2 = Object.assign({}, q, { correctAnswer: 'B' });
  assert(id1 !== Bank.contentId(q2), 'different keys → different ids');
  eq(Bank.dupeId(q), Bank.dupeId(q2), 'same text → same dupeHash');
});

console.log(`\n════════════════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════════\n`);
process.exit(failed ? 1 : 0);
