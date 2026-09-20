/* ============================================================
 * KINEORA CLOUD SYNC — Cloudflare Worker (service-worker format)
 * + Node mode (local server / tests) — ek hi file, zero deps.
 *
 * AUTH (ultra secure):
 *   /v1/* → Authorization: Bearer <Firebase ID token (Google login)>
 *   token verify hota hai Google ke public JWKS se (RS256, crypto.subtle)
 *   → data us Google account ke UID scope me — koi password/sync-code nahi.
 *   Neon password + Cloudinary secret SIRF yahan (CF secrets) rehte hain.
 *
 * Endpoints:
 *   GET  /health           → {ok, ts, storage}
 *   POST /v1/push          Bearer → {records:[{kind,rid,data,updatedAt,deleted}]}
 *   POST /v1/pull          Bearer → {since}
 *   POST /v1/status        Bearer → {counts, devices}
 *   POST /v1/media         Bearer → {name, dataUrl} → Cloudinary signed upload
 *
 * Env (CF secrets / Node env):
 *   NEON_CS            — Neon connection string
 *   FIREBASE_PROJECT   — Firebase project id (default kineora-exam)
 *   CLOUDINARY_CLOUD   — cloud name (public)
 *   CLOUDINARY_KEY     — API key    (sirf yahan)
 *   CLOUDINARY_SECRET  — API secret (sirf yahan)
 * ============================================================ */

'use strict';

var NODE_ENV_OBJ = null;
var AUTH_VERIFIER = null;   // tests ke liye injectable (prod me kabhi nahi)
function getEnv() {
  var e = {};
  try { if (typeof NEON_CS !== 'undefined') e.NEON_CS = NEON_CS; } catch (x) {}
  try { if (typeof FIREBASE_PROJECT !== 'undefined') e.FIREBASE_PROJECT = FIREBASE_PROJECT; } catch (x) {}
  try { if (typeof CLOUDINARY_CLOUD !== 'undefined') e.CLOUDINARY_CLOUD = CLOUDINARY_CLOUD; } catch (x) {}
  try { if (typeof CLOUDINARY_KEY !== 'undefined') e.CLOUDINARY_KEY = CLOUDINARY_KEY; } catch (x) {}
  try { if (typeof CLOUDINARY_SECRET !== 'undefined') e.CLOUDINARY_SECRET = CLOUDINARY_SECRET; } catch (x) {}
  if (NODE_ENV_OBJ) Object.assign(e, NODE_ENV_OBJ);
  if (typeof process !== 'undefined' && process.env) {
    ['NEON_CS', 'FIREBASE_PROJECT', 'CLOUDINARY_CLOUD', 'CLOUDINARY_KEY', 'CLOUDINARY_SECRET'].forEach(function (k) {
      if (!e[k] && process.env[k]) e[k] = process.env[k];
    });
  }
  return e;
}

/* ---------------- CORS ---------------- */
var ALLOWED_ORIGINS = [
  'https://cronyzo7694-sudo.github.io'
];
function corsHeaders(req) {
  var o = req.headers.get('origin') || '';
  var allow = ALLOWED_ORIGINS.indexOf(o) !== -1;
  return {
    'access-control-allow-origin': allow ? o : ALLOWED_ORIGINS[0],
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    'vary': 'origin'
  };
}
function json(req, status, obj) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'content-type': 'application/json' }, corsHeaders(req))
  });
}

/* ---------------- rate limit (best-effort, per-isolate) ---------------- */
var RATE = {};
function rateOk(key, max, winMs) {
  var now = Date.now();
  var r = RATE[key];
  if (!r || now - r.start > winMs) { RATE[key] = { start: now, n: 1 }; return true; }
  r.n++;
  return r.n <= max;
}

/* ---------------- Firebase ID token verification ----------------
   Google ke public JWKS se RS256 signature + aud/iss/exp check.
   aud = project id, iss = https://securetoken.google.com/<project> */
var JWKS = { keys: null, at: 0 };
var JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToB64(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}
function decodeJwtPart(p) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
}

async function verifyFirebaseToken(token, env) {
  var project = env.FIREBASE_PROJECT || 'kineora-exam';
  var parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('token format invalid');
  var header = decodeJwtPart(parts[0]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('token alg invalid');

  // JWKS cache (6h)
  if (!JWKS.keys || Date.now() - JWKS.at > 6 * 3600 * 1000) {
    var r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error('jwks fetch failed');
    var jr = await r.json();
    var jkeys = jr && jr.keys ? jr.keys : (Array.isArray(jr) ? jr : null);
    if (!jkeys || !jkeys.length) throw new Error('jwks empty');
    JWKS = { keys: jkeys, at: Date.now() };
  }
  var jwk = null;
  for (var i = 0; i < JWKS.keys.length; i++) if (JWKS.keys[i].kid === header.kid) { jwk = JWKS.keys[i]; break; }
  if (!jwk) { // key rotate hua ho — ek baar refresh
    JWKS = { keys: null, at: 0 };
    var r2 = await fetch(JWKS_URL);
    if (!r2.ok) throw new Error('jwks refresh failed');
    var jr2 = await r2.json();
    var jkeys2 = jr2 && jr2.keys ? jr2.keys : (Array.isArray(jr2) ? jr2 : []);
    JWKS = { keys: jkeys2, at: Date.now() };
    for (var k = 0; k < jkeys2.length; k++) if (jkeys2[k].kid === header.kid) { jwk = jkeys2[k]; break; }
    if (!jwk) throw new Error('token kid unknown');
  }

  var cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: b64urlToB64(jwk.n), e: b64urlToB64(jwk.e), alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  var okSig = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!okSig) throw new Error('token signature invalid');

  var claims = decodeJwtPart(parts[1]);
  var now = Math.floor(Date.now() / 1000);
  if (claims.aud !== project) throw new Error('token audience mismatch');
  if (claims.iss !== 'https://securetoken.google.com/' + project) throw new Error('token issuer mismatch');
  if (typeof claims.exp !== 'number' || claims.exp < now) throw new Error('token expired');
  if (!claims.sub || claims.sub.length > 128) throw new Error('token subject invalid');
  if (claims.auth_time && claims.auth_time > now + 60) throw new Error('token auth_time invalid');
  return { uid: claims.sub };
}

async function authenticate(req, env) {
  if (AUTH_VERIFIER) return AUTH_VERIFIER(req, env);   // sirf tests
  var h = req.headers.get('authorization') || '';
  var m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new Error('sign in required (Bearer token)');
  return verifyFirebaseToken(m[1].trim(), env);
}

/* ---------------- validation ---------------- */
var KINDS = ['attempt', 'test', 'question', 'note', 'setting', 'meta'];

/* ---------------- Neon storage (fetch /sql) ---------------- */
function neonSQL(env, query, params) {
  var host = new URL(env.NEON_CS).host;
  return fetch('https://' + host + '/sql', {
    method: 'POST',
    headers: { 'neon-connection-string': env.NEON_CS },
    body: JSON.stringify({ query: query, params: params || [] })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error((j && j.message) || ('Neon HTTP ' + r.status));
      return j.rows || [];
    });
  });
}

/* ---------------- in-memory storage (tests / local) ---------------- */
var MEM = { recs: new Map(), devices: new Map() };
function memKey(uid, kind, rid) { return uid + '␟' + kind + '␟' + rid; }

function storage(env) {
  if (env.NEON_CS) {
    return {
      name: 'neon',
      push: function (uid, device, recs) {
        // NOTE: Neon HTTP /sql params scalars hi hote hain (arrays nahi) —
        // isliye batch ek hi jsonb param me jata hai (jsonb_to_recordset).
        var payload = recs.map(function (x) {
          return { kind: x.kind, rid: x.rid, data: x.data || null, updatedAt: x.updatedAt, deleted: !!x.deleted };
        });
        return neonSQL(env,
          'INSERT INTO sync_records (uid, kind, rid, data, updated_at, deleted) ' +
          'SELECT $1, r.kind, r.rid, r.data, r."updatedAt"::bigint, r.deleted::bool ' +
          'FROM jsonb_to_recordset($2::jsonb) AS r(kind text, rid text, data jsonb, "updatedAt" bigint, deleted bool) ' +
          'ON CONFLICT (uid, kind, rid) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted ' +
          'WHERE sync_records.updated_at < EXCLUDED.updated_at', [uid, JSON.stringify(payload)])
          .then(function () {
            return neonSQL(env,
              'INSERT INTO sync_devices (uid, device, last_seen, platform) VALUES ($1,$2,$3,$4) ' +
              'ON CONFLICT (uid, device) DO UPDATE SET last_seen = $3, platform = $4',
              [uid, device, Date.now(), 'web']);
          });
      },
      pull: function (uid, since, limit) {
        return neonSQL(env,
          'SELECT kind, rid, data, updated_at as "updatedAt", deleted FROM sync_records ' +
          'WHERE uid = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3',
          [uid, since, limit]).then(function (rows) {
            rows.forEach(function (x) {
              x.data = typeof x.data === 'string' ? JSON.parse(x.data) : x.data;
              x.updatedAt = Number(x.updatedAt);   // bigint string → number
            });
            return rows;
          });
      },
      status: function (uid) {
        return neonSQL(env, 'SELECT kind, count(*)::int as n, max(updated_at) as last FROM sync_records WHERE uid = $1 GROUP BY kind', [uid])
          .then(function (rows) {
            return neonSQL(env, 'SELECT device, last_seen as "lastSeen" FROM sync_devices WHERE uid = $1', [uid])
              .then(function (devs) { return { counts: rows, devices: devs }; });
          });
      }
    };
  }
  return {
    name: 'memory',
    push: function (uid, device, recs) {
      for (var i = 0; i < recs.length; i++) {
        var key = memKey(uid, recs[i].kind, recs[i].rid);
        var old = MEM.recs.get(key);
        if (!old || old.updatedAt < recs[i].updatedAt) {
          MEM.recs.set(key, { kind: recs[i].kind, rid: recs[i].rid, data: recs[i].data, updatedAt: recs[i].updatedAt, deleted: !!recs[i].deleted });
        }
      }
      MEM.devices.set(uid + '␟' + device, { device: device, lastSeen: Date.now() });
      return Promise.resolve();
    },
    pull: function (uid, since, limit) {
      var out = [];
      MEM.recs.forEach(function (v, key) {
        if (key.split('␟')[0] === uid && v.updatedAt > since) out.push(v);
      });
      out.sort(function (a, b) { return a.updatedAt - b.updatedAt; });
      return Promise.resolve(out.slice(0, limit));
    },
    status: function (uid) {
      var counts = {};
      MEM.recs.forEach(function (v, key) {
        var p = key.split('␟');
        if (p[0] === uid) { counts[v.kind] = (counts[v.kind] || 0) + 1; }
      });
      var devs = [];
      MEM.devices.forEach(function (v, key) { if (key.split('␟')[0] === uid) devs.push(v); });
      return Promise.resolve({ counts: Object.keys(counts).map(function (k) { return { kind: k, n: counts[k] }; }), devices: devs });
    }
  };
}

/* ---------------- Cloudinary signed upload (secret sirf yahan) ---------------- */
function sha1hex(str) {
  var buf = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-1', buf).then(function (h) {
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  });
}
function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}
function b64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function mediaUpload(req, env, auth, body) {
  var m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(body.dataUrl || ''));
  if (!m) return json(req, 400, { ok: false, error: 'dataUrl (base64 image) chahiye' });
  var bytes = b64ToBytes(m[2]);
  if (bytes.length > 5 * 1024 * 1024) return json(req, 413, { ok: false, error: 'max 5 MB' });
  var mime = sniffImage(bytes);
  if (!mime) return json(req, 415, { ok: false, error: 'sirf jpg/png/webp/gif' });
  if (!env.CLOUDINARY_KEY || !env.CLOUDINARY_SECRET || !env.CLOUDINARY_CLOUD) {
    return json(req, 503, { ok: false, error: 'media not configured' });
  }
  var folder = 'agniveer-cbt/' + String(auth.uid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  var params = { folder: folder, timestamp: Math.floor(Date.now() / 1000) };
  var toSign = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('&');
  var sig = await sha1hex(toSign + env.CLOUDINARY_SECRET);
  var form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), String(body.name || 'upload'));
  form.append('api_key', env.CLOUDINARY_KEY);
  form.append('timestamp', String(params.timestamp));
  form.append('folder', folder);
  form.append('signature', sig);
  var r = await fetch('https://api.cloudinary.com/v1_1/' + env.CLOUDINARY_CLOUD + '/image/upload', { method: 'POST', body: form });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok || !j.secure_url) return json(req, 502, { ok: false, error: (j.error && j.error.message) || 'cloudinary upload failed' });
  return json(req, 200, { ok: true, url: j.secure_url, publicId: j.public_id, bytes: j.bytes, format: j.format });
}

/* ---------------- BATTLE (live group quiz, server-authoritative) ---------------- */
var BATTLE_REVEAL_MS = 5000, BATTLE_GRACE_MS = 2000, BATTLE_MAX_Q = 30;
var BATTLE_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function battleCode() {
  var c = '';
  for (var i = 0; i < 6; i++) c += BATTLE_CODE_CHARS[Math.floor(Math.random() * BATTLE_CODE_CHARS.length)];
  return c;
}
function battleDeadline(room, qNo) { return room.starts_at + qNo * (room.per_q_ms + room.reveal_ms) + room.per_q_ms; }
function battleQIndex(room, now) { return Math.floor((now - room.starts_at) / (room.per_q_ms + room.reveal_ms)); }
function sanitizeQ(q) { return q ? { id: q.id, text: q.text, hi: q.hi || null, options: (q.options || []).map(function (o) { return { id: o.id, text: o.text, hi: o.hi || null }; }) } : null; }

function battleNeon(env) {
  return {
    createRoom: function (r) {
      return neonSQL(env, 'INSERT INTO battle_rooms (code, host_uid, name, subject, status, starts_at, per_q_ms, reveal_ms, questions, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [r.code, r.host_uid, r.name, r.subject, r.status, r.starts_at, r.per_q_ms, r.reveal_ms, JSON.stringify(r.questions), r.created_at]);
    },
    getRoom: function (code) {
      return neonSQL(env, 'SELECT * FROM battle_rooms WHERE code = $1', [code]).then(function (rows) {
        if (!rows.length) return null;
        var r = rows[0];
        if (typeof r.questions === 'string') r.questions = JSON.parse(r.questions);
        return r;
      });
    },
    setStart: function (code, startsAt) {
      return neonSQL(env, 'UPDATE battle_rooms SET starts_at = $2 WHERE code = $1', [code, startsAt]);
    },
    setDone: function (code) {
      return neonSQL(env, "UPDATE battle_rooms SET status = 'done' WHERE code = $1", [code]);
    },
    upsertPlayer: function (p) {
      return neonSQL(env, 'INSERT INTO battle_players (room_code, uid, name, photo, joined_at) VALUES ($1,$2,$3,$4,$5) ' +
        'ON CONFLICT (room_code, uid) DO UPDATE SET name = $3, photo = $4', [p.room_code, p.uid, p.name, p.photo, p.joined_at]);
    },
    players: function (code) {
      return neonSQL(env, 'SELECT uid, name, photo, score, correct, q_no, done FROM battle_players WHERE room_code = $1 ORDER BY joined_at', [code]);
    },
    updPlayer: function (code, uid, addScore, addCorrect, qNo) {
      return neonSQL(env, 'UPDATE battle_players SET score = score + $3, correct = correct + $4, q_no = GREATEST(q_no, $5) WHERE room_code = $1 AND uid = $2',
        [code, uid, addScore, addCorrect, qNo]);
    },
    setPlayerDone: function (code, uid) {
      return neonSQL(env, 'UPDATE battle_players SET done = true WHERE room_code = $1 AND uid = $2', [code, uid]);
    },
    insertAnswer: function (a) {
      // first answer counts — re-answer ignored (server-authoritative)
      return neonSQL(env, 'INSERT INTO battle_answers (room_code, uid, q_no, opt_id, correct, points, ms_left, answered_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (room_code, uid, q_no) DO NOTHING', [a.room_code, a.uid, a.q_no, a.opt_id, a.correct, a.points, a.ms_left, a.answered_at])
        .then(function () { return neonSQL(env, 'SELECT points, correct FROM battle_answers WHERE room_code = $1 AND uid = $2 AND q_no = $3', [a.room_code, a.uid, a.q_no]); });
    },
    answers: function (code, qNo) {
      return neonSQL(env, 'SELECT a.uid, a.opt_id, a.correct, a.points FROM battle_answers a WHERE a.room_code = $1 AND a.q_no = $2', [code, qNo]);
    },
    allAnswers: function (code) {
      return neonSQL(env, 'SELECT uid, q_no, opt_id, correct, points FROM battle_answers WHERE room_code = $1 ORDER BY q_no, uid', [code]);
    }
  };
}
function battleMem() {
  if (!MEM.battle) MEM.battle = { rooms: new Map(), players: new Map(), answers: new Map() };
  var B = MEM.battle;
  var pkey = function (c, u) { return c + '␟' + u; };
  return {
    createRoom: function (r) { B.rooms.set(r.code, r); return Promise.resolve(); },
    getRoom: function (code) { return Promise.resolve(B.rooms.get(code) || null); },
    setStart: function (code, t) { var r = B.rooms.get(code); if (r) r.starts_at = t; return Promise.resolve(); },
    setDone: function (code) { var r = B.rooms.get(code); if (r) r.status = 'done'; return Promise.resolve(); },
    upsertPlayer: function (p) {
      var k = pkey(p.room_code, p.uid);
      if (!B.players.has(k)) B.players.set(k, { room_code: p.room_code, uid: p.uid, name: p.name, photo: p.photo, score: 0, correct: 0, q_no: 0, done: false, joined_at: p.joined_at });
      else { var e = B.players.get(k); e.name = p.name; e.photo = p.photo; }
      return Promise.resolve();
    },
    players: function (code) {
      var out = [];
      B.players.forEach(function (v, k) { if (k.split('␟')[0] === code) out.push(v); });
      out.sort(function (a, b) { return a.joined_at - b.joined_at; });
      return Promise.resolve(out);
    },
    updPlayer: function (code, uid, addScore, addCorrect, qNo) {
      var p = B.players.get(pkey(code, uid));
      if (p) { p.score += addScore; p.correct += addCorrect; if (qNo > p.q_no) p.q_no = qNo; }
      return Promise.resolve();
    },
    setPlayerDone: function (code, uid) { var p = B.players.get(pkey(code, uid)); if (p) p.done = true; return Promise.resolve(); },
    insertAnswer: function (a) {
      var k = a.room_code + '␟' + a.uid + '␟' + a.q_no;
      if (!B.answers.has(k)) B.answers.set(k, { room_code: a.room_code, uid: a.uid, q_no: a.q_no, opt_id: a.opt_id, correct: a.correct, points: a.points, ms_left: a.ms_left });
      var cur = B.answers.get(k);
      return Promise.resolve([{ points: cur.points, correct: cur.correct }]);
    },
    answers: function (code, qNo) {
      var out = [];
      B.answers.forEach(function (v) { if (v.room_code === code && v.q_no === qNo) out.push({ uid: v.uid, opt_id: v.opt_id, correct: v.correct, points: v.points }); });
      return Promise.resolve(out);
    },
    allAnswers: function (code) {
      var out = [];
      B.answers.forEach(function (v) { if (v.room_code === code) out.push({ uid: v.uid, q_no: v.q_no, opt_id: v.opt_id, correct: v.correct, points: v.points }); });
      out.sort(function (a, b) { return a.q_no - b.q_no || (a.uid < b.uid ? -1 : 1); });
      return Promise.resolve(out);
    }
  };
}

async function battleHandler(req, env, auth, path, body) {
  var st = battleNeonOrMem(env);
  var now = Date.now();

  if (path === '/v1/battle/create') {
    var qs = Array.isArray(body.questions) ? body.questions.slice(0, BATTLE_MAX_Q) : [];
    if (!body.name || String(body.name).length > 60) return json(req, 400, { ok: false, error: 'battle ka naam chahiye (max 60)' });
    if (!qs.length || qs.length > BATTLE_MAX_Q) return json(req, 400, { ok: false, error: 'questions 1-' + BATTLE_MAX_Q });
    var perQ = Number(body.perQMs) || 30000;
    if (perQ < 10000 || perQ > 120000) return json(req, 400, { ok: false, error: 'per-question time 10s–120s' });
    var startsAt = Number(body.startsAt) || 0;
    if (startsAt < now - 60000 || startsAt > now + 7 * 86400000) return json(req, 400, { ok: false, error: 'start time galat' });
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (!q || !q.text || !Array.isArray(q.options) || q.options.length < 2 || !q.correctId) return json(req, 400, { ok: false, error: 'question ' + (i + 1) + ' invalid' });
      if (!q.options.some(function (o) { return o.id === q.correctId; })) return json(req, 400, { ok: false, error: 'question ' + (i + 1) + ' ka correctId options me nahi' });
    }
    var room = {
      code: battleCode(), host_uid: auth.uid, name: String(body.name).slice(0, 60), subject: String(body.subject || 'mixed').slice(0, 30),
      status: 'lobby', starts_at: startsAt, per_q_ms: perQ, reveal_ms: BATTLE_REVEAL_MS,
      questions: qs.map(function (q) { return { id: q.id, text: String(q.text).slice(0, 3000), hi: q.hi ? String(q.hi).slice(0, 3000) : null, options: q.options.map(function (o) { return { id: String(o.id).slice(0, 40), text: String(o.text).slice(0, 1000), hi: o.hi ? String(o.hi).slice(0, 1000) : null }; }), correctId: String(q.correctId).slice(0, 40) }; }),
      created_at: now
    };
    // unique code (memory me collision check; neon PK bhi guard karta hai)
    try { await st.createRoom(room); } catch (e) { room.code = battleCode(); await st.createRoom(room); }
    await st.upsertPlayer({ room_code: room.code, uid: auth.uid, name: String(body.playerName || 'Host').slice(0, 40), photo: body.photo ? String(body.photo).slice(0, 500) : null, joined_at: now });
    return json(req, 200, { ok: true, code: room.code });
  }

  if (path === '/v1/battle/join') {
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila — code check karo' });
    if (room.status === 'done') return json(req, 400, { ok: false, error: 'battle khatam ho chuka' });
    await st.upsertPlayer({ room_code: room.code, uid: auth.uid, name: String(body.playerName || 'Player').slice(0, 40), photo: body.photo ? String(body.photo).slice(0, 500) : null, joined_at: now });
    return json(req, 200, { ok: true, code: room.code });
  }

  if (path === '/v1/battle/start') {   // host: abhi shuru karo
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila' });
    if (room.host_uid !== auth.uid) return json(req, 403, { ok: false, error: 'sirf host start kar sakta hai' });
    if (room.status === 'done') return json(req, 400, { ok: false, error: 'khatam' });
    await st.setStart(room.code, now + 4000);   // 4s warning
    return json(req, 200, { ok: true });
  }

  if (path === '/v1/battle/state') {
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila' });
    var players = await st.players(room.code);
    var live = now >= room.starts_at;
    var total = room.questions.length;
    var lastDeadline = battleDeadline(room, total - 1) + room.reveal_ms;
    var allDone = players.length > 0 && players.every(function (p) { return p.done || p.q_no >= total; });
    var finished = room.status === 'done' || (live && (allDone || now > lastDeadline));
    if (finished && room.status !== 'done') await st.setDone(room.code);
    // lazy q_no advance (skipped questions)
    if (live) {
      var qi = battleQIndex(room, now);
      for (var pi = 0; pi < players.length; pi++) {
        if (players[pi].q_no < qi) {
          players[pi].q_no = qi;
          await st.updPlayer(room.code, players[pi].uid, 0, 0, qi);
        }
      }
    }
    var out = {
      ok: true, now: now,
      room: { code: room.code, name: room.name, subject: room.subject, host: room.host_uid, startsAt: room.starts_at, perQMs: room.per_q_ms, revealMs: room.reveal_ms, total: total, status: finished ? 'done' : (live ? 'live' : 'lobby') },
      players: players,
      you: null
    };
    for (var yi = 0; yi < players.length; yi++) if (players[yi].uid === auth.uid) out.you = players[yi];
    if (live && !finished) {
      var curQ = battleQIndex(room, now);
      if (curQ >= 0 && curQ < total) {
        var q = room.questions[curQ];
        out.question = sanitizeQ(q);
        out.qNo = curQ;
        out.deadline = battleDeadline(room, curQ);
        out.revealAt = out.deadline;
      }
    }
    return json(req, 200, out);
  }

  if (path === '/v1/battle/answer') {
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila' });
    var qNo = Number(body.qNo), optId = String(body.optId || '');
    if (!(qNo >= 0) || qNo >= room.questions.length) return json(req, 400, { ok: false, error: 'question invalid' });
    var deadline = battleDeadline(room, qNo);
    if (Date.now() > deadline + BATTLE_GRACE_MS) return json(req, 400, { ok: false, error: 'time up — ye question chhoot gaya' });
    if (Date.now() < room.starts_at) return json(req, 400, { ok: false, error: 'abhi start nahi hua' });
    var q = room.questions[qNo];
    var correct = optId === q.correctId;
    var msLeft = Math.max(0, deadline - Date.now());
    var bonus = correct ? Math.max(0, Math.min(5, Math.floor(5 * msLeft / room.per_q_ms))) : 0;
    var points = correct ? 10 + bonus : 0;
    var res = await st.insertAnswer({ room_code: room.code, uid: auth.uid, q_no: qNo, opt_id: optId, correct: correct, points: points, ms_left: msLeft, answered_at: Date.now() });
    var first = res && res[0];
    await st.updPlayer(room.code, auth.uid, first ? first.points : 0, first && first.correct ? 1 : 0, qNo + 1);
    if (qNo + 1 >= room.questions.length) await st.setPlayerDone(room.code, auth.uid);
    var ps = await st.players(room.code);
    var me = null; for (var i = 0; i < ps.length; i++) if (ps[i].uid === auth.uid) me = ps[i];
    return json(req, 200, { ok: true, correct: !!(first && first.correct), points: first ? first.points : 0, alreadyAnswered: !first, score: me ? me.score : 0 });
  }

  if (path === '/v1/battle/reveal') {
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila' });
    var qNo = Number(body.qNo);
    if (!(qNo >= 0) || qNo >= room.questions.length) return json(req, 400, { ok: false, error: 'question invalid' });
    if (Date.now() < battleDeadline(room, qNo) - 100) return json(req, 400, { ok: false, error: 'early — reveal deadline ke baad' });
    var ans = await st.answers(room.code, qNo);
    return json(req, 200, { ok: true, qNo: qNo, correctId: room.questions[qNo].correctId, answers: ans });
  }

  if (path === '/v1/battle/result') {
    var room = await st.getRoom(String(body.code || '').toUpperCase().trim());
    if (!room) return json(req, 404, { ok: false, error: 'room nahi mila' });
    var players = await st.players(room.code);
    var answers = await st.allAnswers(room.code);
    return json(req, 200, {
      ok: true,
      room: { code: room.code, name: room.name, subject: room.subject, total: room.questions.length, perQMs: room.per_q_ms },
      players: players.sort(function (a, b) { return b.score - a.score; }),
      answers: answers,
      questions: room.questions.map(function (q) { return { id: q.id, text: q.text, correctId: q.correctId, options: q.options }; })
    });
  }

  return null;   // not a battle route
}
function battleNeonOrMem(env) { return env.NEON_CS ? battleNeon(env) : battleMem(); }

/* ---------------- main handler ---------------- */
async function handleRequest(req, env) {
  var url = new URL(req.url);
  var path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (path === '/' || path === '/health') {
    return json(req, 200, {
      ok: true, service: 'kineora-cloud-sync', ts: Date.now(),
      storage: storage(env).name, media: !!(env.CLOUDINARY_KEY && env.CLOUDINARY_SECRET && env.CLOUDINARY_CLOUD),
      endpoints: ['/health', '/v1/push', '/v1/pull', '/v1/status', '/v1/media'],
      note: 'ye backend API hai (site nahi) — app khud ise use karti hai'
    });
  }
  if (path.indexOf('/v1/') !== 0) {
    return json(req, 404, { ok: false, error: 'not found' });
  }

  // auth: har /v1 request pe verified Google token
  var auth;
  try { auth = await authenticate(req, env); }
  catch (e) { return json(req, 401, { ok: false, error: e.message }); }

  var ip = (req.headers.get('cf-connecting-ip') || 'local') + ':' + path;
  if (!rateOk(ip + '|' + auth.uid, path === '/v1/media' ? 12 : 60, 60000)) {
    return json(req, 429, { ok: false, error: 'rate limit — thodi der baad' });
  }

  var body = {};
  try { body = await req.json(); } catch (e) { body = {}; }
  var st = storage(env);

  if (path === '/v1/push' && req.method === 'POST') {
    var recs = Array.isArray(body.records) ? body.records.slice(0, 300) : [];
    var clean = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r && KINDS.indexOf(r.kind) !== -1 && typeof r.rid === 'string' && r.rid.length <= 200 &&
          typeof r.updatedAt === 'number' && (r.deleted || (r.data && typeof r.data === 'object'))) {
        clean.push({ kind: r.kind, rid: r.rid, data: r.data || null, updatedAt: r.updatedAt, deleted: !!r.deleted });
      }
    }
    try {
      await st.push(auth.uid, String(body.device || 'unknown').slice(0, 64), clean);
      return json(req, 200, { ok: true, accepted: clean.length });
    } catch (e) { return json(req, 500, { ok: false, error: 'db: ' + e.message }); }
  }

  if (path === '/v1/pull' && req.method === 'POST') {
    var since = Number(body.since) || 0;
    try {
      var rows = await st.pull(auth.uid, since, 1500);
      var maxTs = since;
      for (var q = 0; q < rows.length; q++) if (rows[q].updatedAt > maxTs) maxTs = rows[q].updatedAt;
      return json(req, 200, { ok: true, records: rows, maxTs: maxTs, more: rows.length === 1500 });
    } catch (e) { return json(req, 500, { ok: false, error: 'db: ' + e.message }); }
  }

  if (path === '/v1/status' && req.method === 'POST') {
    try {
      var s = await st.status(auth.uid);
      return json(req, 200, { ok: true, counts: s.counts, devices: s.devices });
    } catch (e) { return json(req, 500, { ok: false, error: 'db: ' + e.message }); }
  }

  if (path === '/v1/media' && req.method === 'POST') {
    try { return await mediaUpload(req, env, auth, body); }
    catch (e) { return json(req, 500, { ok: false, error: 'media: ' + e.message }); }
  }

  if (path.indexOf('/v1/battle/') === 0) {
    try {
      var br = await battleHandler(req, env, auth, path, body);
      if (br) return br;
    } catch (e) { return json(req, 500, { ok: false, error: 'battle: ' + e.message }); }
  }

  return json(req, 404, { ok: false, error: 'not found' });
}

/* ---------------- Cloudflare (service-worker format) ---------------- */
if (typeof addEventListener === 'function' && typeof Response !== 'undefined' && typeof module === 'undefined') {
  addEventListener('fetch', function (e) {
    e.respondWith(handleRequest(e.request, getEnv()));
  });
}

/* ---------------- Node mode (local server / tests) ---------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleRequest: handleRequest, getEnv: getEnv,
    setEnv: function (e) { NODE_ENV_OBJ = e; },
    setAuthVerifier: function (fn) { AUTH_VERIFIER = fn; },   // tests only
    verifyFirebaseToken: verifyFirebaseToken,
    _MEM: MEM
  };
  if (typeof require === 'function' && require.main === module) {
    var http = require('http');
    var PORT = Number(process.argv[2] || process.env.PORT || 8940);
    var server = http.createServer(function (nreq, res) {
      var chunks = [];
      nreq.on('data', function (c) { chunks.push(c); });
      nreq.on('end', function () {
        var body = Buffer.concat(chunks);
        var headers = { 'content-type': nreq.headers['content-type'] || 'text/plain' };
        if (nreq.headers['authorization']) headers['authorization'] = nreq.headers['authorization'];
        if (nreq.headers['origin']) headers['origin'] = nreq.headers['origin'];
        var creq = new Request('http://x' + nreq.url, {
          method: nreq.method, headers: headers,
          body: ['GET', 'HEAD'].indexOf(nreq.method) === -1 ? body : undefined
        });
        handleRequest(creq, getEnv()).then(function (r) {
          res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
          r.arrayBuffer().then(function (b) { res.end(Buffer.from(b)); });
        }).catch(function (e) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      });
    });
    server.listen(PORT, '127.0.0.1', function () {
      console.log('sync-worker (node, storage=' + (getEnv().NEON_CS ? 'neon' : 'memory') + ') → http://127.0.0.1:' + PORT);
    });
  }
}
