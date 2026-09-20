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

  // LWW
  await call(port, '/v1/push', { device: 'dev-b', records: [{ kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 99 }, updatedAt: now - 5000 }] });
  let pl3 = await call(port, '/v1/pull', { since: 0 });
  T('LWW: older push ignored (score 20)', pl3.j.records.find(r => r.rid === 'a1').data.score === 20);
  await call(port, '/v1/push', { device: 'dev-b', records: [{ kind: 'attempt', rid: 'a1', data: { id: 'a1', score: 42 }, updatedAt: now + 5000 }] });
  pl3 = await call(port, '/v1/pull', { since: 0 });
  T('LWW: newer push wins (score 42)', pl3.j.records.find(r => r.rid === 'a1').data.score === 42);

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

  // REAL JWKS verification (internet se Google ke public keys) — forged token
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

  srv.close();
  console.log(`\nCLOUD RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
