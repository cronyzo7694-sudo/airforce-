/* v1.4.48 — EXAM-SCOPED SUBJECT ALIASES (parsers) unit test
   User ka live bug: SSC me import hone wali files ka reasoning/gs 'raga'
   me map ho jata. Ab subject-alias EXAM-AWARE hai. */
process.chdir(__dirname + '/..');
global.AVUtil = require('../js/util.js');
let Parsers = require('../js/parsers.js');

let passed = 0, failed = 0;
const T = (name, ok, extra) => {
  if (ok) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra !== undefined ? '→ ' + extra : ''); }
};

const Q = subject => ({
  subject, question: 'Test question for alias mapping?',
  optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd',
  answer: 'A', explanation: 'why'
});

// ── default (App undefined / airforce) — LEGACY behavior preserve ──
console.log('━━━ airforce aliases (legacy — Node me App nahi)');
let r = Parsers.mkQuestion(Q('reasoning'));
T('airforce: reasoning → raga (RAGA combined)', r.q.subject === 'raga', r.q.subject);
r = Parsers.mkQuestion(Q('General Knowledge'));
T('airforce: General Knowledge → raga', r.q.subject === 'raga', r.q.subject);
r = Parsers.mkQuestion(Q('maths'));
T('airforce: maths → mathematics', r.q.subject === 'mathematics', r.q.subject);
r = Parsers.mkQuestion(Q('physics'));
T('airforce: physics → physics', r.q.subject === 'physics', r.q.subject);

// ── SSC CHSL context ──
console.log('━━━ SSC CHSL aliases (App.configCache.exam = ssc-chsl)');
global.App = { configCache: { exam: 'ssc-chsl' } };
delete require.cache[require.resolve('../js/parsers.js')];
Parsers = require('../js/parsers.js');

r = Parsers.mkQuestion(Q('reasoning'));
T('SSC: reasoning → reasoning (raga NAHI!)', r.q.subject === 'reasoning', r.q.subject);
r = Parsers.mkQuestion(Q('General Awareness'));
T('SSC: General Awareness → gs', r.q.subject === 'gs', r.q.subject);
r = Parsers.mkQuestion(Q('gk'));
T('SSC: gk → gs', r.q.subject === 'gs', r.q.subject);
r = Parsers.mkQuestion(Q('current affairs'));
T('SSC: current affairs → gs', r.q.subject === 'gs', r.q.subject);
r = Parsers.mkQuestion(Q('Verbal Reasoning'));
T('SSC: Verbal Reasoning → reasoning', r.q.subject === 'reasoning', r.q.subject);
r = Parsers.mkQuestion(Q('maths'));
T('SSC: maths → mathematics', r.q.subject === 'mathematics', r.q.subject);
r = Parsers.mkQuestion(Q('english'));
T('SSC: english → english', r.q.subject === 'english', r.q.subject);
r = Parsers.mkQuestion(Q('physics'));
T('SSC: physics → null (SSC me nahi — clean error)', r.q.subject === null, JSON.stringify(r.q && r.q.subject));

console.log(`\n${passed}/${passed + failed} pass`);
if (failed.length || failed) process.exit(failed ? 1 : 0);
console.log('ALL ALIAS TESTS GREEN ✓');
