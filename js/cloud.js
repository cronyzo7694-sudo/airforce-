/* ============================================================
 * KINEORA CLOUD — Google login (Firebase) + Neon sync + media
 *
 * Data kabhi reset na ho (ultra secure):
 *  · login = Google account (Firebase Auth) — koi password nahi
 *  · har sync request Google-verified ID token ke saath jati hai
 *  · worker token verify karke data us account ke UID scope me
 *    rakhta hai (Neon) — secrets sirf worker me, client me kabhi nahi
 *  · attempts, custom questions, tests, notes, settings cloud me safe
 *  · naya device → Google se login → sab wapas
 *  · images: Cloud.uploadImage(file) → worker signed Cloudinary upload
 * ============================================================ */

'use strict';

var Cloud = (() => {
  /* Firebase web config — PUBLIC by design (identifier hai, secret nahi;
     asli security = verified tokens + per-account scoping server pe). */
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBTeY4PV83cAhbsc8sT2IXNxFySMwW1708',   // public identifier — secret nahi
    authDomain: 'kineora-exam.firebaseapp.com',
    projectId: 'kineora-exam',
    appId: '1:927751408408:web:856110ca18a657f56a2c6d'
  };
  const FB_VER = '10.12.2';
  const DEFAULT_ENDPOINT = 'https://sync-kineora.cronyzo7694.workers.dev';
  const BANK_FILES = ['data/bank-physics.json', 'data/bank-mathematics.json', 'data/bank-english.json', 'data/bank-raga.json'];
  const META_SYNCABLE = ['qstats', 'topicStats', 'attemptIndex'];
  const SETTING_SYNCABLE = ['config'];
  const SYNC_EVERY_MS = 5 * 60 * 1000;
  const PUSH_DEBOUNCE_MS = 8000;

  let fb = null;                 // {auth, mod}
  let user = null;               // {uid, email, name}
  let bundledIds = null;
  let outbox = null;
  let applying = false;
  let timer = null, debounceT = null, running = false;
  let status = { auto: true, user: null, lastPushAt: 0, lastPullAt: 0, lastPullTs: 0, lastError: null, pending: 0 };

  const endpoint = () => (localStorage.getItem('cloudSyncEndpoint') || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const configured = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.appId);

  async function deviceId() {
    let d = await Store.getSetting('deviceId', null);
    if (!d) { d = 'dev-' + Math.random().toString(36).slice(2, 10); await Store.setSetting('deviceId', d); }
    return d;
  }

  async function loadStatus() {
    const s = await Store.getMeta('cloudSync', null);
    if (s) status = Object.assign({}, status, s);
    if (s && s.user) user = s.user;   // last known (UI ke liye) — asli source onAuthStateChanged
    return status;
  }
  async function saveStatus() {
    status.user = user;
    status.pending = outbox ? outbox.length : status.pending;
    await Store.setMeta('cloudSync', status);
  }

  /* dirty-tracking cheap rehta hai: sirf in-memory push +
     persist DEBOUNCED (bulk import me per-put write amplification nahi) */
  let outboxInit = null;
  function loadOutbox() {
    if (!outboxInit) outboxInit = Store.getMeta('cloudOutbox', []).then(a => { outbox = a || []; return outbox; });
    return outboxInit;
  }
  let persistT = null;
  function schedulePersist() {
    if (persistT) clearTimeout(persistT);
    persistT = setTimeout(async () => {
      persistT = null;
      try {
        if (outbox) await Store.setMeta('cloudOutbox', outbox);
        status.pending = outbox ? outbox.length : 0;
      } catch (e) {}
    }, 2000);
  }
  async function persistOutbox() {   // flush (sync ke baad / sign-out)
    if (persistT) { clearTimeout(persistT); persistT = null; }
    if (outbox) await Store.setMeta('cloudOutbox', outbox);
    status.pending = outbox ? outbox.length : 0;
  }

  async function loadBundledIds() {
    if (bundledIds) return bundledIds;
    bundledIds = new Set();
    try {
      const cached = await Store.getMeta('bundledIds', null);
      if (cached && cached.ids && Date.now() - (cached.at || 0) < 86400000) {
        bundledIds = new Set(cached.ids); return bundledIds;
      }
    } catch (e) {}
    try {
      await Promise.all(BANK_FILES.map(async f => {
        const r = await fetch(f);
        if (!r.ok) return;
        const arr = await r.json();
        (arr || []).forEach(q => { if (q && q.id) bundledIds.add(q.id); });
      }));
      try { await Store.setMeta('bundledIds', { at: Date.now(), ids: Array.from(bundledIds) }); } catch (e) {}
    } catch (e) { /* offline — next sync me dobara */ }
    return bundledIds;
  }

  /* ---------------- Firebase (lazy — sirf sign-in pe load hota hai) ---------------- */
  async function ensureFirebase() {
    if (fb) return fb;
    if (!configured()) throw new Error('Google login abhi setup nahi hua (config pending)');
    const appMod = await import('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-auth.js');
    const app = appMod.initializeApp(FIREBASE_CONFIG, 'kineora-web');
    const auth = authMod.getAuth(app);
    fb = { app, auth, mod: authMod };
    return fb;
  }

  async function signIn() {
    const f = await ensureFirebase();
    const provider = new f.mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await f.mod.signInWithPopup(f.auth, provider);
    return userFrom(cred.user);
  }
  async function signOut() {
    if (fb) { await fb.mod.signOut(fb.auth); }
    user = null;
    await saveStatus();
  }
  function userFrom(u) {
    return u ? { uid: u.uid, email: u.email || '', name: u.displayName || (u.email || 'user').split('@')[0] } : null;
  }
  async function getIdToken(force) {
    if (!fb || !fb.auth.currentUser) throw new Error('sign in required');
    return fb.auth.currentUser.getIdToken(!!force);
  }

  /* ---------------- DB change observer ---------------- */
  function kindFor(store) {
    return { attempts: 'attempt', tests: 'test', questions: 'question', notes: 'note', settings: 'setting', meta: 'meta' }[store] || null;
  }
  function ridOf(store, objOrKey) {
    const kp = { attempts: 'id', tests: 'id', questions: 'id', notes: 'qid', settings: 'key', meta: 'key' }[store];
    if (kp) return typeof objOrKey === 'object' ? objOrKey[kp] : objOrKey;
    return typeof objOrKey === 'object' ? null : objOrKey;
  }
  function onChange(store, keyOrObj) {
    if (applying) return;
    const kind = kindFor(store);
    if (!kind) return;
    const rid0 = ridOf(store, keyOrObj);
    if (rid0 == null) return;
    const rid = String(rid0);
    if (store === 'settings' && SETTING_SYNCABLE.indexOf(rid) === -1) return;
    if (store === 'meta' && META_SYNCABLE.indexOf(rid) === -1) return;
    if (['cloudOutbox', 'cloudSync', 'bundledIds'].indexOf(rid) !== -1) return;
    if (store === 'questions' && bundledIds && bundledIds.has(rid)) return;   // bank questions dirty nahi
    loadOutbox().then(() => {
      if (!outbox.some(x => x.kind === kind && x.rid === rid)) {
        outbox.push({ kind: kind, rid: rid, deleted: false });
      }
      schedulePersist();
      scheduleSoon();
    }).catch(() => {});
  }
  function onDelete(store, key) {
    if (applying) return;
    const kind = kindFor(store);
    if (!kind) return;
    const rid = String(key);
    loadOutbox().then(() => {
      outbox = outbox.filter(x => !(x.kind === kind && x.rid === rid));
      outbox.push({ kind: kind, rid: rid, deleted: true });
      schedulePersist();
    }).catch(() => {});
  }

  function scheduleSoon() {
    if (!status.auto || !user) return;
    if (debounceT) clearTimeout(debounceT);
    debounceT = setTimeout(() => { debounceT = null; syncNow('change'); }, PUSH_DEBOUNCE_MS);
  }

  /* ---------------- authed fetch (token + 401 pe ek refresh-retry) ---------------- */
  let TEST_HOOKS = {};   // sirf tests ke liye (prod me hamesha khali)

  async function authed(path, body) {
    const call = async tok => fetch(endpoint() + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok },
      body: JSON.stringify(body)
    });
    let token;
    if (TEST_HOOKS.getToken) token = await TEST_HOOKS.getToken();
    else token = await getIdToken(false);
    let r = await call(token);
    if (r.status === 401 && !TEST_HOOKS.getToken) {
      token = await getIdToken(true);   // stale token — force refresh
      r = await call(token);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  /* ---------------- push ---------------- */
  async function buildPushRecords() {
    await loadOutbox();
    const recs = [];
    const consumed = new Set();   // push/skip — dono me outbox se hatana hai
    const kOf = x => x.kind + '␟' + x.rid;
    for (const item of outbox.slice(0, 300)) {
      let data = null;
      if (!item.deleted) {
        if (item.kind === 'attempt') data = await DB.get('attempts', item.rid);
        else if (item.kind === 'test') data = await DB.get('tests', item.rid);
        else if (item.kind === 'question') {
          if (bundledIds && bundledIds.has(item.rid)) { consumed.add(kOf(item)); continue; }   // bundled kabhi push nahi
          data = await DB.get('questions', item.rid);
        }
        else if (item.kind === 'note') data = await DB.get('notes', item.rid);
        else if (item.kind === 'setting') data = await DB.get('settings', item.rid);
        else if (item.kind === 'meta') data = await DB.get('meta', item.rid);
        if (!data) { consumed.add(kOf(item)); continue; }   // record gaya — tombstone hi kaafi
      }
      if (item.kind === 'test' && data && data.series) { consumed.add(kOf(item)); continue; }  // series local rebuild hoti hai
      recs.push({ kind: item.kind, rid: item.rid, data: data, updatedAt: Date.now(), deleted: !!item.deleted });
      consumed.add(kOf(item));
    }
    return { recs: recs, consumed: consumed };
  }

  async function doPush() {
    const built = await buildPushRecords();
    const recs = built.recs;
    let acceptedTotal = 0;
    for (let i = 0; i < recs.length; i += 200) {
      const j = await authed('/v1/push', { device: await deviceId(), records: recs.slice(i, i + 200) });
      acceptedTotal += (j.accepted || 0);
    }
    outbox = outbox.filter(x => !built.consumed.has(x.kind + '␟' + x.rid));
    return acceptedTotal;
  }

  /* ---------------- pull + apply ---------------- */
  async function doPull(full) {
    let since = full ? 0 : (status.lastPullTs || 0);
    let applied = 0;
    for (let page = 0; page < 10; page++) {
      const j = await authed('/v1/pull', { since: since });
      applying = true;
      try { applied += await applyRecords(j.records || []); }
      finally { applying = false; }
      since = j.maxTs || since;
      if (!j.more) break;
    }
    status.lastPullTs = since;
    return applied;
  }

  async function applyRecords(records) {
    let n = 0;
    for (const r of records) {
      try {
        if (r.kind === 'attempt') {
          if (!r.deleted) {
            const local = await DB.get('attempts', r.rid);
            if (local && local.completed !== true) continue;      // local in-progress jeeta
            await DB.put('attempts', r.data); n++;
          }
        } else if (r.kind === 'test') {
          if (r.data && r.data.series) continue;
          if (r.deleted) await DB.delete('tests', r.rid);
          else { await DB.put('tests', r.data); n++; }
        } else if (r.kind === 'question') {
          if (bundledIds && bundledIds.has(r.rid)) continue;
          if (r.deleted) await DB.delete('questions', r.rid);
          else { await DB.put('questions', r.data); n++; }
        } else if (r.kind === 'note') {
          if (r.deleted) await DB.delete('notes', r.rid);
          else { await DB.put('notes', r.data); n++; }
        } else if (r.kind === 'setting') {
          if (r.rid !== 'config') continue;
          if (r.deleted) continue;
          await DB.put('settings', r.data);
          try { if (typeof App !== 'undefined' && r.data && r.data.value) App.configCache = r.data.value; } catch (e) {}
          n++;
        } else if (r.kind === 'meta') {
          if (META_SYNCABLE.indexOf(r.rid) === -1) continue;
          if (r.deleted) continue;
          await DB.put('meta', r.data); n++;
        }
      } catch (e) { /* ek record fail = poora sync fail nahi */ }
    }
    return n;
  }

  /* ---------------- pehla full backup ----------------
     Naya account / khali cloud → local ka poora syncable data push
     (warna sirf outbox changes jaate — pehli baar kuch nahi jata). */
  async function fullExport() {
    await loadBundledIds();
    const dev = await deviceId();
    const now = Date.now();
    let pushed = 0, requests = 0;
    const batch = [];
    const flush = async () => {
      while (batch.length && requests < 40) {   // ~8000 records/sync safety cap
        const chunk = batch.splice(0, 200);
        await authed('/v1/push', { device: dev, records: chunk });
        pushed += chunk.length;
        requests++;
      }
    };
    const add = (kind, rid, data) => {
      if (rid != null && data) batch.push({ kind: kind, rid: String(rid), data: data, updatedAt: now, deleted: false });
    };

    const cfgRow = await DB.get('settings', 'config');
    add('setting', 'config', cfgRow);
    for (const mk of META_SYNCABLE) add('meta', mk, await DB.get('meta', mk));

    const tables = [['attempts', 'attempt', 'id'], ['tests', 'test', 'id'], ['questions', 'question', 'id'], ['notes', 'note', 'qid']];
    for (const t of tables) {
      const keys = await DB.getAllKeys(t[0]);
      for (const k of keys) {
        if (batch.length >= 400) {
          await flush();
          if (requests >= 40) return pushed;
        }
        const row = await DB.get(t[0], k);
        if (!row) continue;
        if (t[1] === 'test' && row.series) continue;                    // series local rebuild
        const rid = row[t[2]] != null ? row[t[2]] : k;
        if (t[1] === 'question' && bundledIds.has(rid)) continue;       // bundled bank kabhi nahi
        add(t[1], rid, row);
      }
    }
    await flush();
    return pushed;
  }

  /* ---------------- public sync ---------------- */
  async function syncNow(reason) {
    if (running) return { ok: false, skipped: true };
    if (!user) return { ok: false, error: 'sign in required' };
    if (!status.auto && reason !== 'manual' && reason !== 'restore') return { ok: false, skipped: true };
    running = true;
    try {
      await loadBundledIds();
      let pushed = 0, pulled = 0, backup = 0;
      if (!status.fullBackupAt) {
        // is device ka pehla sync is account par: cloud ka data pehle lao,
        // phir outbox changes, phir local ka POORA backup (purane data bhi)
        pulled += await doPull(false);
        pushed += await doPush();
        backup = await fullExport();
        pulled += await doPull(false);
        status.fullBackupAt = Date.now();
      } else {
        pushed = await doPush();
        pulled += await doPull(false);
      }
      status.lastPushAt = Date.now(); status.lastPullAt = Date.now(); status.lastError = null;
      await persistOutbox(); await saveStatus();
      return { ok: true, pushed: pushed + backup, pulled: pulled, backup: backup };
    } catch (e) {
      status.lastError = e.message;
      await saveStatus();
      return { ok: false, error: e.message };
    } finally { running = false; }
  }

  async function restore() {
    if (running) return { ok: false, error: 'sync chal raha hai' };
    if (!user) return { ok: false, error: 'sign in required' };
    running = true;
    try {
      await loadBundledIds();
      const pulled = await doPull(true);
      status.lastPullAt = Date.now(); status.lastError = null;
      await saveStatus();
      return { ok: true, pulled: pulled };
    } catch (e) {
      status.lastError = e.message; await saveStatus();
      return { ok: false, error: e.message };
    } finally { running = false; }
  }

  /* ---------------- media (Cloudinary via worker, signed server-side) ---------------- */
  async function uploadImage(file) {
    if (!user) throw new Error('sign in required');
    if (file.size > 5 * 1024 * 1024) throw new Error('max 5 MB');
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('file read fail'));
      fr.readAsDataURL(file);
    });
    return authed('/v1/media', { name: file.name || 'image', dataUrl: dataUrl }).then(j => j.url);
  }

  /* ---------------- init ---------------- */
  async function init() {
    await loadStatus();
    await loadOutbox();
    if (DB.onChange) DB.onChange(onChange, onDelete);

    // firebase auth state watch (agar config hai)
    if (configured()) {
      try {
        const f = await ensureFirebase();
        f.mod.onAuthStateChanged(f.auth, async u => {
          user = userFrom(u);
          await saveStatus();
          if (user) syncNow('login');
        });
      } catch (e) {
        status.lastError = 'firebase: ' + e.message;
        await saveStatus();
      }
    }

    // health probe + pehla sync (agar login hai)
    setTimeout(async () => {
      try {
        const r = await fetch(endpoint() + '/health');
        const j = await r.json().catch(() => ({}));
        if (!j.ok) { status.lastError = 'worker offline'; await saveStatus(); return; }
      } catch (e) { status.lastError = 'worker offline'; await saveStatus(); return; }
      if (user) syncNow('boot');
    }, 2500);

    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (user && navigator.onLine !== false) syncNow('interval'); }, SYNC_EVERY_MS);
    window.addEventListener('online', () => { if (user) syncNow('online'); });
  }

  async function setAuto(on) { status.auto = !!on; await saveStatus(); }

  return {
    init, syncNow, restore, uploadImage, setAuto, signIn, signOut,
    get status() { return status; },
    get user() { return user; },
    endpoint, configured,
    _test: {
      onChange, buildPushRecords, applyRecords, kindFor,
      setUser(u) { user = u; },
      setBundledIds(a) { bundledIds = new Set(a); },
      flushOutbox() { return persistOutbox(); },
      resetOutbox() { outbox = []; outboxInit = Promise.resolve(outbox); },
      hooks: TEST_HOOKS
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cloud;
