/* ============================================================
 * CLOUD SYNC TESTS — worker API (token auth, in-memory storage)
 *                      + client logic (outbox/apply)
 * Run: node tests/cloud.test.js
 * ============================================================ */
const http = require('http');
const path = require('path');
const W = require(path.resolve(__dirname, '../worker/sync-worker.js'));

let passed = 0, failed = 0;
const T = (name, ok, extra) => {
  if (ok) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
};

function startWorker() {
  return new Promise(resolve => {
    const srv = http.createServer((nreq, res) => {
      const chunks = [];
      nreq.on('data', c => chunks.push(c));
      nreq.on('end', () => {
        const headers = { 'content-type': nreq.headers['content-type'] || 'text/plain' };
        if (nreq.headers['authorization']) headers['authorization'] = nreq.headers['authorization'];
        if (nreq.headers['origin']) headers['origin'] = nreq.headers['origin'];
        if (nreq.headers['if-none-match']) headers['if-none-match'] = nreq.headers['if-none-match'];
        const creq = new Request('http://x' + nreq.url, {
          method: nreq.method, headers,
          body: ['GET', 'HEAD'].indexOf(nreq.method) === -1 ? Buffer.concat(chunks) : undefined
        });
        W.handleRequest(creq, W.getEnv()).then(r => {
          res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
          r.arrayBuffer().then(b => res.end(Buffer.from(b)));
        }).catch(e => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); });
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

let TEST_UID = 'google-uid-AAA';
// faithful test verifier — real verify jaisa: token hona chahiye + valid hona chahiye
W.setAuthVerifier(async (req) => {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new Error('sign in required (Bearer token)');
  const tok = m[1].trim();
  if (tok === 'valid-token' || tok === 'test-token') return { uid: TEST_UID };
  throw new Error('token signature invalid');
});

async function call(port, p, body, opts = {}) {
  const headers = Object.assign({ 'content-type': 'application/json', 'origin': 'https://cronyzo7694-sudo.github.io' }, opts.headers || {});
  if (opts.token !== null) headers['authorization'] = 'Bearer ' + (opts.token || 'valid-token');
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, j: await r.json().catch(() => ({})), h: r.headers };
}

(async () => {
  const { srv, port } = await startWorker();
  console.log('━━━ CLOUD · worker API (Google-token auth, in-memory storage)');

  const h = await call(port, '/health');
  T('health ok', h.status === 200 && h.j.ok === true && h.j.storage === 'memory');
  T('CORS: pages origin echoed', h.h.get('access-control-allow-origin') === 'https://cronyzo7694-sudo.github.io');

  // AUTH: bina token ke sab 401
  const noTok = await call(port, '/v1/push', { records: [] }, { token: null });
  T('no token → 401', noTok.status === 401, noTok.j);
  const badTok = await call(port, '/v1/pull', {}, { token: 'garbage.token.here' });
  T('garbage token → 401 (verifier fail)', badTok.status === 401, badTok.j);

  const nf = await call(port, '/v1/nope', {});
  T('unknown route → 404', nf.status === 404);

  // push batch
  const now = Date.now();
  const p1 = await call(port, '/v1/push', {
    device: 'dev-a',
    records: [
      { kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 20 }, updatedAt: now },
      { kind: 'setting', rid: 'config', data: { key: 'config', value: { candidateName: 'Ravi' } }, updatedAt: now },
      { kind: 'question', rid: 'q1', data: { id: 'q1', questionText: 'Custom Q' }, updatedAt: now },
      { kind: 'hacker', rid: 'x', data: {}, updatedAt: now }
    ]
  });
  T('push accepted (invalid kind filtered)', p1.status === 200 && p1.j.ok && p1.j.accepted === 3, p1.j);

  const pl1 = await call(port, '/v1/pull', { since: 0 });
  T('pull returns 3 records', pl1.j.records.length === 3, pl1.j.records && pl1.j.records.length);
  T('pull data parsed (attempt)', pl1.j.records.some(r => r.kind === 'attempt' && r.data && r.data.score === 20));
  const pl2 = await call(port, '/v1/pull', { since: pl1.j.maxTs });
  T('pull since=maxTs → empty', pl2.j.records.length === 0);

  // LWW — v1.4.39: SERVER timestamps (client clock skew-proof). Har push
  // server-time se jaata hai, isliye baad wala push hamesha jeetega — chahe
  // client ka updatedAt kitna bhi purana/未来 ho.
  await call(port, '/v1/push', { device: 'dev-b', records: [{ kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 99 }, updatedAt: now - 5000 }] });
  let pl3 = await call(port, '/v1/pull', { since: 0 });
  T('server-ts: stale-clock push bhi latest (score 99)', pl3.j.records.find(r => r.rid === 'a1').data.score === 99);
  await call(port, '/v1/push', { device: 'dev-b', records: [{ kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 42 }, updatedAt: now + 5000 }] });
  pl3 = await call(port, '/v1/pull', { since: 0 });
  T('server-ts: doosra push jeeta (score 42)', pl3.j.records.find(r => r.rid === 'a1').data.score === 42);
  T('server-ts: record updatedAt server se aaya (>= push time)', pl3.j.records.find(r => r.rid === 'a1').updatedAt >= now - 1000);

  // tombstone
  await call(port, '/v1/push', { device: 'dev-b', records: [{ kind: 'question', rid: 'q1', updatedAt: now + 9000, deleted: true }] });
  const pl5 = await call(port, '/v1/pull', { since: 0 });
  T('tombstone pull (deleted=true)', pl5.j.records.find(r => r.rid === 'q1').deleted === true);

  // UID isolation — dusra Google account
  TEST_UID = 'google-uid-BBB';
  await call(port, '/v1/push', { device: 'dev-c', records: [{ kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 777 }, updatedAt: now + 10000 }] });
  const plB = await call(port, '/v1/pull', { since: 0 });
  T('UID isolation — dusre account ka data alag', plB.j.records.length === 1 && plB.j.records[0].data.score === 777, plB.j.records);
  TEST_UID = 'google-uid-AAA';
  const plA = await call(port, '/v1/pull', { since: 0 });
  T('UID isolation — A ka data untouched (42)', plA.j.records.find(r => r.rid === 'a1').data.score === 42);

  // status
  const st = await call(port, '/v1/status', {});
  T('status counts (3 kinds)', st.j.ok && st.j.counts.length === 3, st.j.counts);
  T('status devices (dev-a, dev-b)', st.j.devices && st.j.devices.length === 2, st.j.devices);

  // media
  const m1 = await call(port, '/v1/media', { name: 'x.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
  T('media: valid PNG but cloudinary not configured → 503', m1.status === 503, m1.j);
  const m2 = await call(port, '/v1/media', { name: 'x.txt', dataUrl: 'hello' });
  T('media: bad dataUrl → 400', m2.status === 400, m2.j);

  // OPTIONS preflight
  const or = await fetch(`http://127.0.0.1:${port}/v1/push`, { method: 'OPTIONS', headers: { origin: 'https://cronyzo7694-sudo.github.io' } });
  T('OPTIONS preflight → 204', or.status === 204);

  const dr = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: 'https://evil.example.com' } });
  T('unknown origin not echoed', dr.headers.get('access-control-allow-origin') !== 'https://evil.example.com');

  console.log('━━━ CLOUD · client logic (outbox + apply, jsdom)');
  const { JSDOM } = require('jsdom');
  const fakeIDB = require('fake-indexeddb');
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:8931/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.indexedDB = fakeIDB.indexedDB || fakeIDB;
  w.fetch = fetch;   // node fetch — worker ko direct hit karega
  const fs = require('fs');
  const ROOT = path.resolve(__dirname, '..');
  // strict-eval globals explicit attach (browser me classic script top-level var
  // global hi hota hai — sirf eval me nahi)
  w.eval(fs.readFileSync(path.join(ROOT, 'js/util.js'), 'utf8') + '\n;window.AVUtil = AVUtil;');
  await new Promise(r => setTimeout(r, 100));
  w.eval(fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8') + '\n;window.DB = DB; window.Store = Store;');
  await new Promise(r => setTimeout(r, 300));
  w.localStorage.setItem('cloudSyncEndpoint', `http://127.0.0.1:${port}`);
  // 'use strict' eval me var global nahi hota — explicit window attach
  w.eval(fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8') + '\n;window.Cloud = Cloud;');
  const G = expr => w.eval(expr);

  T('firebase config present (public values)', G('Cloud.configured()') === true);

  // test hooks se full client roundtrip
  await G('Cloud._test.setUser({uid: "google-uid-CCC", email: "test@example.com", name: "Test"})');
  await G('(Cloud._test.hooks.getToken = async () => "test-token")');
  TEST_UID = 'google-uid-CCC';
  await G('Cloud.init()');   // observer attach + health probe
  await G('(async () => { await DB.put("attempts", { id: "att-1", testId: "t1", testName: "Mock", completed: true, result: { score: 10 } }); await Store.setSetting("config", { candidateName: "Test" }); return true; })()');
  await new Promise(r => setTimeout(r, 500));
  const r1 = await G('Cloud.syncNow("manual")');
  T('client syncNow ok (worker roundtrip)', r1 && r1.ok === true, r1);
  T('client first-sync: outbox 2 + full backup 2 (backup flag)', r1 && r1.pushed >= 2 && r1.backup === 2, r1);
  const stC = await call(port, '/v1/status', {});
  T('server has client data', stC.j.counts.some(c => c.kind === 'attempt'), stC.j.counts);

  // observer: DB put → outbox me entry (persist debounced — flush karke check)
  await G('(async () => { await DB.put("notes", { qid: "q_abc", text: "note hi" }); return true; })()');
  await new Promise(r => setTimeout(r, 300));
  await G('Cloud._test.flushOutbox()');
  const obn = await G('(async () => (await Store.getMeta("cloudOutbox", [])).length)()');
  T('DB put → outbox dirty entry (note)', obn === 1, obn);

  // applyRecords: incoming question bundled-id skip
  await G('Cloud._test.setBundledIds(["q_bundled_x"])');
  const applied = await G(`(async () => Cloud._test.applyRecords([
    {kind:"question", rid:"q_bundled_x", data:{id:"q_bundled_x"}, updatedAt: 1},
    {kind:"attempt", rid:"att-9", data:{id:"att-9", completed:true}, updatedAt: 1}
  ]))()`);
  T('applyRecords: bundled question skip + attempt apply', applied === 1, applied);
  const att9 = await G('(async () => DB.get("attempts", "att-9"))()');
  T('applied attempt saved', att9 && att9.id === 'att-9');

  // FIRST-LOGIN FULL BACKUP — naya account, khali outbox → poora local data push
  await G('Cloud._test.setUser({uid: "google-uid-EEE", email: "eee@example.com", name: "Full"})');
  TEST_UID = 'google-uid-EEE';
  await G('Cloud.status.fullBackupAt = 0');
  await G('Cloud._test.resetOutbox()');
  const r2 = await G('Cloud.syncNow("manual")');
  T('full backup sync ok', r2 && r2.ok === true, r2);
  T('full backup pushed local data (4 records: 2 attempts + note + config)', r2 && r2.pushed === 4 && r2.backup === 4, r2);
  const stE = await call(port, '/v1/status', {});
  const totE = (stE.j.counts || []).reduce((a, c) => a + c.n, 0);
  T('server pe full backup data aaya', totE >= 4, stE.j.counts);
  // dobara sync → full backup dobara nahi chalega
  const r3 = await G('Cloud.syncNow("manual")');
  T('second sync — full backup skip (already done)', r3 && r3.ok && r3.backup === 0, r3);

  // CROSS-DEVICE: auto OFF → push nahi, par PULL hamesha (naya data aata rahe)
  await G('Cloud._test.setUser({uid: "google-uid-FFF", email: "fff@example.com", name: "Cross"})');
  await G('Cloud.setAuto(false)');
  TEST_UID = 'google-uid-FFF';
  await call(port, '/v1/push', { device: 'dev-other', records: [
    { kind: 'note', rid: 'n_sync', data: { qid: 'n_sync', text: 'dusre device se aaya' }, updatedAt: Date.now() + 50, deleted: false }
  ] });
  const r4 = await G('Cloud.syncNow("interval")');
  T('auto OFF: interval sync still PULLS (cross-device)', r4 && r4.ok === true && r4.pulled >= 1, r4);
  const noteSync = await G('(async () => DB.get("notes", "n_sync"))()');
  T('pulled note locally applied', noteSync && noteSync.text === 'dusre device se aaya');
  await G('Cloud.setAuto(true)');

  /* ═══ v1.4.39 — META MERGE + HISTORY REPAIR + PURGE + FAIL-SAFE ═══ */
  console.log('━━━ CLOUD v1.4.39 · merge/repair/purge (do-device race fixes)');

  // --- mergeMetaValue unit tests ---
  const mg1 = await G(`(async () => {
    const dead = new Set(['a_dead']);
    // attemptIndex: local 2 entries, remote 2 (1 common-purana, 1 naya), 1 dead
    const loc = [
      { id: 'a1', date: 100, score: 10 },
      { id: 'a2', date: 200, score: 20 },
      { id: 'a_dead', date: 300, score: 99 }
    ];
    const rem = [
      { id: 'a1', date: 150, score: 11 },   // same id, newer date → remote jeete
      { id: 'a3', date: 400, score: 30 }    // naya
    ];
    const m = Cloud._test.mergeMetaValue('attemptIndex', rem, loc, dead);
    return m && m.value;
  })()`);
  T('merge attemptIndex: union 3 (a1 newer-remote + a2 + a3), dead OUT', mg1 && mg1.length === 3 &&
    mg1.find(e => e.id === 'a1').score === 11 && mg1.find(e => e.id === 'a2') && mg1.find(e => e.id === 'a3') &&
    !mg1.find(e => e.id === 'a_dead'), mg1);

  const mg2 = await G(`(async () => {
    const loc = { seen: { q1: 3, q2: 1 }, wrong: { q1: 1 }, correct: { q1: 2 }, skipped: {}, topicAcc: { 'phy␟Motion': 50 } };
    const rem = { seen: { q1: 2, q3: 5 }, wrong: { q3: 1 }, correct: { q3: 4 }, skipped: { q2: 1 }, topicAcc: { 'phy␟Motion': 66, 'phy␟Optics': 80 } };
    const m = Cloud._test.mergeMetaValue('qstats', rem, loc, null);
    return m && m.value;
  })()`);
  T('merge qstats: per-qid MAX + union keys + skipped merged', mg2 &&
    mg2.seen.q1 === 3 && mg2.seen.q2 === 1 && mg2.seen.q3 === 5 &&
    mg2.correct.q3 === 4 && mg2.skipped.q2 === 1 &&
    mg2.topicAcc['phy␟Optics'] === 80, mg2);

  const mg3 = await G(`(async () => {
    const loc = { 'phy␟Motion': { attempted: 10, correct: 5, wrong: 5 }, 'phy␟Optics': { attempted: 2, correct: 2, wrong: 0 } };
    const rem = { 'phy␟Motion': { attempted: 12, correct: 6, wrong: 5 }, 'eng␟Idiom': { attempted: 4, correct: 1, wrong: 3 } };
    const m = Cloud._test.mergeMetaValue('topicStats', rem, loc, null);
    return m && m.value;
  })()`);
  T('merge topicStats: per-topic field MAX + union', mg3 &&
    mg3['phy␟Motion'].attempted === 12 && mg3['phy␟Motion'].correct === 6 &&
    mg3['phy␟Optics'].attempted === 2 && mg3['eng␟Idiom'].wrong === 3, mg3);

  const mg4 = await G(`Cloud._test.mergeMetaValue('deletedAttempts', ['d1'], ['d2'], null)`);
  T('merge deletedAttempts: union append-only', mg4 && mg4.dirty === true && mg4.value.indexOf('d1') !== -1 && mg4.value.indexOf('d2') !== -1, mg4);

  // --- applyRecords meta merge (raw {key,value} row — cloud format) ---
  await G(`(async () => {
    await Store.setMeta('attemptIndex', [{ id: 'locA', date: 100, score: 5 }]);
    await Store.setMeta('deletedAttempts', ['a_dead']);
    const applied = await Cloud._test.applyRecords([
      { kind: 'meta', rid: 'attemptIndex', data: { key: 'attemptIndex', value: [
        { id: 'remA', date: 200, score: 7 }, { id: 'a_dead', date: 900, score: 50 }
      ] }, updatedAt: 1 },
      { kind: 'meta', rid: 'topicStats', data: { key: 'topicStats', value: { 'phy␟X': { attempted: 3, correct: 2, wrong: 1 } } }, updatedAt: 1 }
    ]);
    return applied;
  })()`);
  const idxAfter = await G('(async () => Store.getMeta("attemptIndex", []))()');
  T('apply meta: index merged (locA + remA, dead OUT)', idxAfter && idxAfter.length === 2 &&
    idxAfter.some(e => e.id === 'locA') && idxAfter.some(e => e.id === 'remA') && !idxAfter.some(e => e.id === 'a_dead'), idxAfter);
  const tsAfter = await G('(async () => Store.getMeta("topicStats", {}))()');
  T('apply meta: topicStats applied', tsAfter && tsAfter['phy␟X'] && tsAfter['phy␟X'].attempted === 3, tsAfter);

  // --- attempt tombstone: delete propagation + revive-vaccination ---
  await G(`(async () => {
    await DB.put('attempts', { id: 'att-kill', testId: 't1', completed: true, result: { score: 5, correct: 5, wrong: 0 } });
    const idx = await Store.getMeta('attemptIndex', []);
    idx.push({ id: 'att-kill', date: 500, score: 5 });
    await Store.setMeta('attemptIndex', idx);
    return true;
  })()`);
  const tombApplied = await G(`(async () => Cloud._test.applyRecords([
    { kind: 'attempt', rid: 'att-kill', data: null, updatedAt: 2, deleted: true }
  ]))()`);
  const killRow = await G('(async () => DB.get("attempts", "att-kill"))()');
  const killIdx = await G('(async () => Store.getMeta("attemptIndex", []))()');
  const killDel = await G('(async () => Store.getMeta("deletedAttempts", []))()');
  T('attempt tombstone: local row deleted', !killRow);
  T('attempt tombstone: index entry removed', killIdx && !killIdx.some(e => e.id === 'att-kill'), killIdx);
  T('attempt tombstone: deletedAttempts vaccinated', killDel && killDel.indexOf('att-kill') !== -1, killDel);

  // --- repairHistory: missing entries wapas + 0-answer junk delete ---
  await G(`(async () => {
    Cloud._test.resetRepairFlags();
    await DB.put('attempts', { id: 'att-lost', testId: 't9', testName: 'Lost Mock', testType: 'mock', attemptNo: 1, endTime: 12345, completed: true,
      result: { score: 15, maxScore: 20, correct: 15, wrong: 5, unattempted: 0, accuracy: 75, timeTaken: 600, total: 20 } });
    await DB.put('attempts', { id: 'att-junk', testId: 't8', completed: true, result: { score: 0, correct: 0, wrong: 0 } });
    return true;
  })()`);
  const recovered = await G('Cloud._test.repairHistory()');
  const idxRep = await G('(async () => Store.getMeta("attemptIndex", []))()');
  const junkRow = await G('(async () => DB.get("attempts", "att-junk"))()');
  T('repairHistory: missing attempt recovered in index', recovered >= 1 && idxRep.some(e => e.id === 'att-lost' && e.score === 15 && e.date === 12345), { recovered, idxRep });
  T('repairHistory: 0-answer junk deleted', !junkRow);
  T('repairHistory: junk vaccinated (revive-proof)', (await G('(async () => Store.getMeta("deletedAttempts", []))()')).indexOf('att-junk') !== -1);

  // --- purgeDuplicateBankQuestions: bundled content copy (random id) hatao, apna rakho ---
  await G(`(async () => {
    Cloud._test.resetRepairFlags();
    await Store.setMeta('purgedDupQ1', null);
    Cloud._test.setBundledIds(['q_bundled_official']);
    // BANK_FILES fetch intercept: physics me 1 question (dupeHash DH_OFFICIAL)
    window.__realFetch = window.fetch;
    window.fetch = (u) => {
      const s = String(u);
      if (s.indexOf('bank-physics') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([
        { id: 'q_bundled_official', dupeHash: 'DH_OFFICIAL', subject: 'physics', questionText: 'Q', options: [], correctAnswer: 0 }
      ]) });
      if (s.indexOf('bank-') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return window.__realFetch(u);
    };
    await DB.put('questions', { id: 'q_old_copy', dupeHash: 'DH_OFFICIAL', subject: 'physics', questionText: 'Q' });
    await DB.put('questions', { id: 'q_mera_apna', dupeHash: 'DH_MERA', subject: 'physics', questionText: 'apna sawaal' });
    return true;
  })()`);
  const purged = await G('Cloud._test.purgeDuplicateBankQuestions()');
  await G('Cloud._test.flushOutbox()');   // persist debounce flush
  const oldCopy = await G('(async () => DB.get("questions", "q_old_copy"))()');
  const apna = await G('(async () => DB.get("questions", "q_mera_apna"))()');
  const obQ = await G('(async () => Store.getMeta("cloudOutbox", []).then(a => a.filter(x => x.kind === "question" && x.rid === "q_old_copy" && x.deleted)))()');
  await G('(window.fetch = window.__realFetch)');   // fetch restore
  T('purge: bundled-copy (random id) deleted', purged === 1 && !oldCopy, { purged });
  T('purge: apna question SAFE', apna && apna.id === 'q_mera_apna');
  T('purge: cloud tombstone queued', obQ && obQ.length === 1, obQ);

  // --- fail-safe: bundledIds unknown → question push/apply skip ---
  await G('(async () => { Cloud._test.resetOutbox(); Cloud._test.setBundledIds(null); return true; })()');
  await G(`(async () => {
    await Cloud._test.onChange('questions', 'q_unknown_1');   // dirty mark
    await new Promise(r => setTimeout(r, 150));
    return true;
  })()`);
  const bp = await G('Cloud._test.buildPushRecords()');
  T('fail-safe: null bundledIds → question push SKIP (retry next sync)',
    bp.recs.every(x => x.kind !== 'question') && Array.from(bp.consumed).every(k => !k.startsWith('question')), bp.recs);
  const apFail = await G(`(async () => Cloud._test.applyRecords([{ kind: 'question', rid: 'q_unknown_1', data: { id: 'q_unknown_1' }, updatedAt: 3 }]))()`);
  const qGot = await G('(async () => DB.get("questions", "q_unknown_1"))()');
  T('fail-safe: null bundledIds → question apply SKIP', apFail === 0 && !qGot);

  /* ═══ v1.4.41 — END propagation + sync-join (same account = same data) ═══ */
  console.log('━━━ CLOUD v1.4.41 · END propagation + sync-join');
  // device-B scenario: local in-progress attempt, remote (dusre device se) END hua
  await G('(async () => { await DB.put("attempts", { id: "att-cross", testId: "t-cross", testName: "Cross Test", completed: false, responses: {} }); return true; })()');
  await G('(async () => Cloud._test.applyRecords([ { kind: "attempt", rid: "att-cross", data: { id: "att-cross", testId: "t-cross", testName: "Cross Test", completed: true, abandoned: true, endTime: 123, responses: {} }, updatedAt: 9, deleted: false } ]))()');
  const crossRow = await G('(async () => DB.get("attempts", "att-cross"))()');
  T('END propagation: remote abandoned → local bhi abandoned (resume list se OUT)', crossRow && crossRow.abandoned === true && crossRow.completed === true, crossRow);
  // dono in-progress → LOCAL jeeta (is device ke naye answers safe)
  await G('(async () => { await DB.put("attempts", { id: "att-live2", testId: "t2", completed: false, responses: { q1: { sel: 2 } } }); return true; })()');
  await G('(async () => Cloud._test.applyRecords([ { kind: "attempt", rid: "att-live2", data: { id: "att-live2", testId: "t2", completed: false, responses: {} }, updatedAt: 10, deleted: false } ]))()');
  const live2 = await G('(async () => DB.get("attempts", "att-live2"))()');
  T('dono in-progress → LOCAL answers jeete (remote stale overwrite nahi)', live2 && live2.responses && live2.responses.q1 && live2.responses.q1.sel === 2, live2 && live2.responses);
  // live exam protection: active attempt row cloud pull se overwrite nahi
  await G('(async () => { window.App = window.App || {}; window.App.activeAttempt = { id: "att-live3", completed: false }; await DB.put("attempts", { id: "att-live3", testId: "t3", completed: false, responses: { q9: { sel: 1 } } }); return true; })()');
  await G('(async () => Cloud._test.applyRecords([ { kind: "attempt", rid: "att-live3", data: { id: "att-live3", testId: "t3", completed: true, abandoned: true, responses: {} }, updatedAt: 11, deleted: false } ]))()');
  const live3 = await G('(async () => DB.get("attempts", "att-live3"))()');
  T('live-exam protection: chalu exam ka row pull se overwrite NAHI', live3 && live3.completed !== true && live3.responses.q9.sel === 1, live3 && live3.completed);
  await G('(async () => { window.App.activeAttempt = null; return true; })()');
  // syncNow join: concurrent manual calls — "skip" nahi, dono real result
  const s1p = G('Cloud.syncNow("manual")');
  const s2p = G('Cloud.syncNow("manual")');
  const s1 = await s1p; const s2 = await s2p;
  T('sync-join: concurrent Sync Now — koi "skipped" nahi', (s1 && s2 && (s1.ok || s2.ok) && s1.skipped !== true && s2.skipped !== true), { s1: s1 && s1.ok, s2: s2 && s2.ok });

  // ═══ 🔗 SHARE — test ka shareable link (worker endpoints) ═══
  console.log('━━━ SHARE · link se same test + group comparison');
  const sData = {
    sections: [
      { subjectId: 'physics', name: 'Physics', questionIds: ['q1', 'q2', 'q3'] },
      { subjectId: 'raga', name: 'RAGA', questionIds: ['q4', 'q5'] }
    ],
    duration: 1200, mode: 'exam', marking: { correct: 1, wrong: -0.25, unattempted: 0 },
    totalQuestions: 5, maxScore: 5
  };
  const sc = await call(port, '/v1/share/create', { name: 'Mera Test', playerName: 'Host Bhai', data: sData });
  T('share: create → 6-char code + total echo', sc.j.ok && /^[A-Z2-9]{6}$/.test(sc.j.code || '') && sc.j.total === 5, sc.j);
  T('share: create — invalid sections → 400', (await call(port, '/v1/share/create', { name: 'X', data: { sections: [] } })).status === 400);
  T('share: create — NO token → 401', (await call(port, '/v1/share/create', { name: 'X', data: sData }, { token: null })).status === 401);
  const sg = await call(port, '/v1/share/get', { code: sc.j.code }, { token: null });   // REAL no-auth
  T('share: get → same sections/order (NO auth — link kholte hi mile)', sg.j.ok && sg.j.data.sections[0].questionIds.join() === 'q1,q2,q3' && sg.j.data.sections[1].questionIds.length === 2, sg.j.data && sg.j.data.sections && sg.j.data.sections.length);
  T('share: invalid code → 404 (no-auth)', (await call(port, '/v1/share/get', { code: 'ZZZZZZ' }, { token: null })).status === 404);
  const sa1 = await call(port, '/v1/share/attempt', { code: sc.j.code, name: 'Host Bhai', score: 4, correct: 4, wrong: 1, unattempted: 0, accuracy: 80, answers: [
    { qid: 'q1', opt: 'A', correct: true }, { qid: 'q2', opt: 'B', correct: true }, { qid: 'q3', opt: 'C', correct: false }, { qid: 'q4', opt: 'A', correct: true }, { qid: 'q5', opt: 'D', correct: true }
  ] }, { token: null });
  T('share: attempt upload (NO auth — dost bhi bhej sake)', sa1.j.ok, sa1.j);
  const sa2 = await call(port, '/v1/share/attempt', { code: sc.j.code, name: 'Dost Ji', score: 2.5, correct: 3, wrong: 2, unattempted: 0, accuracy: 60, answers: [
    { qid: 'q1', opt: 'A', correct: true }, { qid: 'q2', opt: 'C', correct: false }, { qid: 'q3', opt: 'C', correct: true }, { qid: 'q4', opt: 'B', correct: false }, { qid: 'q5', opt: '', correct: false }
  ] }, { token: null });
  T('share: doosra candidate upload', sa2.j.ok);
  T('share: flood guard 5s (429)', (await call(port, '/v1/share/attempt', { code: sc.j.code, name: 'Dost Ji', score: 1, answers: [] }, { token: null })).status === 429);
  const sl = await call(port, '/v1/share/attempts', { code: sc.j.code }, { token: null });
  T('share: attempts list — sorted by score (View with all)', sl.j.ok && sl.j.total === 2 && sl.j.attempts[0].name === 'Host Bhai' && sl.j.attempts[0].score === 4, sl.j.attempts && sl.j.attempts.map(a => a.name + ':' + a.score));
  T('share: matrix data — kisne kya chuna', sl.j.attempts[0].answers.length === 5 && sl.j.attempts[1].answers[4].opt === '');
  T('share: attempts — invalid code 404 (no-auth)', (await call(port, '/v1/share/attempts', { code: 'ZZZZZZ' }, { token: null })).status === 404);

  // REAL JWKS verification (internet se Google ke public keys) — forged token  // REAL JWKS verification (internet se Google ke public keys) — forged token
  const jwks = await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json();
  const kid = jwks.keys[0].kid;
  const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const forgedJWT = [
    b64u(JSON.stringify({ alg: 'RS256', kid })),
    b64u(JSON.stringify({ aud: 'kineora-exam', iss: 'https://securetoken.google.com/kineora-exam', exp: 9999999999, sub: 'attacker', auth_time: 1 })),
    b64u(Buffer.alloc(256, 7))  // nakli signature
  ].join('.');
  let verr = null;
  try { await W.verifyFirebaseToken(forgedJWT, { FIREBASE_PROJECT: 'kineora-exam' }); } catch (e) { verr = e.message; }
  T('REAL JWKS: forged signature reject', verr === 'token signature invalid', verr);
  let audErr = null;
  const wrongAud = [
    b64u(JSON.stringify({ alg: 'RS256', kid: 'no-such-kid' })),
    b64u(JSON.stringify({ aud: 'x', iss: 'x', exp: 1, sub: 'x' })),
    b64u('x')
  ].join('.');
  try { await W.verifyFirebaseToken(wrongAud, { FIREBASE_PROJECT: 'kineora-exam' }); } catch (e) { audErr = e.message; }
  T('REAL JWKS: unknown kid reject', /kid unknown/.test(audErr || ''), audErr);

  /* ══════════ v1.4.58 PUBLIC BANK SERVE (Neon bank_blobs; memory mode) ══════════ */
  console.log('━━━ CLOUD · public /bank (bank_blobs serve, no-auth)');
  const bankA = { id: 'q_t_1', questionText: 'Test Q1', options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }], correctAnswer: 'A', subject: 'gs', chapter: 'X' };
  const bankB = { id: 'q_t_2', questionText: 'Test Q2', options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }], correctAnswer: 'B', subject: 'gs', chapter: 'X' };
  W._MEM.banks.set('ssc-chsl/gs', { version: 'vtest123', qCount: 2, updatedAt: 1700000000000, payload: [bankA, bankB] });
  W._MEM.banks.set('ssc-chsl/meta', { version: 'vmeta', qCount: 0, updatedAt: 1700000000000, payload: { _bundleKind: 'final' } });

  const bk404 = await call(port, '/bank?exam=ssc-chsl&subject=nope');
  T('bank: unknown subject → 404 (public)', bk404.status === 404 && bk404.j.ok === false, bk404.j);
  const bk400 = await call(port, '/bank');
  T('bank: missing params → 400', bk400.status === 400, bk400.j);
  const bk1 = await call(port, '/bank?exam=ssc-chsl&subject=gs');
  T('bank: serve payload (no token needed)', bk1.status === 200 && bk1.j.ok === true && bk1.j.version === 'vtest123' && bk1.j.qCount === 2 && bk1.j.payload.length === 2 && bk1.j.payload[1].id === 'q_t_2', { v: bk1.j.version, n: bk1.j.payload && bk1.j.payload.length });
  T('bank: ETag + cache-control headers', bk1.h.get('etag') === '"vtest123"' && /max-age=300/.test(bk1.h.get('cache-control') || ''), bk1.h.get('etag'));
  T('bank: CORS header present', bk1.h.get('access-control-allow-origin') === 'https://cronyzo7694-sudo.github.io');
  const bk304 = await call(port, '/bank?exam=ssc-chsl&subject=gs', null, { headers: { 'if-none-match': '"vtest123"' } });
  T('bank: If-None-Match → 304 (delta sync cheap)', bk304.status === 304, bk304.status);
  const bkV = await call(port, '/bank-versions?exam=ssc-chsl');
  T('bank-versions: tiny version map (meta excluded)', bkV.status === 200 && bkV.j.ok === true && bkV.j.subjects.gs.version === 'vtest123' && bkV.j.subjects.gs.qCount === 2 && !bkV.j.subjects.meta, bkV.j.subjects);
  const bkVE = await call(port, '/bank-versions?exam=airforce');
  T('bank-versions: exam with no DB banks → empty map (client static fallback)', bkVE.j.ok === true && Object.keys(bkVE.j.subjects).length === 0, bkVE.j.subjects);

  srv.close();
  console.log(`\nCLOUD RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
