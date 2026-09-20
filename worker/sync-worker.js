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
        var k = [], r = [], d = [], u = [], del = [];
        for (var i = 0; i < recs.length; i++) {
          k.push(recs[i].kind); r.push(recs[i].rid);
          d.push(JSON.stringify(recs[i].data));
          u.push(recs[i].updatedAt); del.push(!!recs[i].deleted);
        }
        return neonSQL(env,
          'INSERT INTO sync_records (uid, kind, rid, data, updated_at, deleted) ' +
          "SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::jsonb[], $5::bigint[], $6::bool[]) " +
          'ON CONFLICT (uid, kind, rid) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted ' +
          'WHERE sync_records.updated_at < EXCLUDED.updated_at', [uid, k, r, d, u, del])
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
            rows.forEach(function (x) { x.data = typeof x.data === 'string' ? JSON.parse(x.data) : x.data; });
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
