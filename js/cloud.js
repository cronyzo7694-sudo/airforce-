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
  const META_SYNCABLE = ['qstats', 'topicStats', 'attemptIndex', 'deletedAttempts'];
  const SETTING_SYNCABLE = ['config'];
  const SYNC_EVERY_MS = 90 * 1000;
  const PUSH_DEBOUNCE_MS = 3000;

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
    // one-time fix: v1.4.27 tak auto=OFF pura sync (pull bhi) block karta
    // tha — user device utha bhi toh naya data nahi aata tha. Ab pull
    // hamesha chalta hai; ye ek baar galti se OFF hue ko wapas ON karta hai.
    if (status.auto === false && !status._autoFix) {
      status._autoFix = true; status.auto = true;
      try { await Store.setMeta('cloudSync', status); } catch (e) {}
    }
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
    const CACHE_KEY = 'bundledIdsV2';   // V1 galat thi (file-ids only) — fresh build zaroori
    try {
      const cached = await Store.getMeta(CACHE_KEY, null);
      if (cached && cached.ids && Date.now() - (cached.at || 0) < 86400000) {
        bundledIds = new Set(cached.ids); return bundledIds;
      }
    } catch (e) {}
    try {
      // contentId formula = seed.js wala — importBatch DB ids inhi se banata hai,
      // isliye file-id ALAWA contentId bhi set me (warna bank questions cloud me chali jaati hain)
      const cid = q => 'q_' + AVUtil.hash([q.subject, q.questionText, (q.options || []).map(o => o && o.text).join(' | '), q.correctAnswer || '?'].join('␟'));
      let filesLoaded = 0;
      await Promise.all(BANK_FILES.map(async f => {
        const r = await fetch(f);
        if (!r.ok) return;
        const arr = await r.json();
        filesLoaded++;
        (arr || []).forEach(q => {
          if (!q) return;
          if (q.id) bundledIds.add(q.id);
          try { bundledIds.add(cid(q)); } catch (e) {}
        });
      }));
      if (!filesLoaded) {
        // FAIL-SAFE: bank files load nahi hue → ids unknown. Empty set NAHI —
        // null return karo (question push/apply/pull skip honge, next sync retry).
        // (v1.4.36 se pehle empty-set fail-open ki wajah se 2500+ bank questions
        // cloud me chale gaye the.)
        bundledIds = null;
        return null;
      }
      try { await Store.setMeta(CACHE_KEY, { at: Date.now(), ids: Array.from(bundledIds) }); } catch (e) {}
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
          if (!bundledIds) continue;                                                     // fail-safe: ids unknown — next sync
          if (bundledIds.has(item.rid)) { consumed.add(kOf(item)); continue; }           // bundled kabhi push nahi
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
      // FAIL-SAFE: bank ids unknown (offline fetch) + question records aaye —
      // apply skip karo aur since MAT badhao (warna ye records is device par
      // hamesha ke liye miss ho jayenge). Next sync retry.
      if ((j.records || []).some(x => x.kind === 'question') && !bundledIds) break;
      applying = true;
      try { applied += await applyRecords(j.records || []); }
      finally { applying = false; }
      since = j.maxTs || since;
      if (!j.more) break;
    }
    status.lastPullTs = since;
    return applied;
  }

  /* ---------------- MERGE engine (v1.4.39) ----------------
     Do-device sync me meta kabhi REPLACE nahi hota — union/max-merge:
       · attemptIndex    → union by id, same id par newer date jeete; deleted
                           attempts (deletedAttempts) hamesha OUT
       · qstats          → seen/wrong/correct/skipped per-qid MAX;
                           topicAcc baad me topicStats se recompute hota hai
       · topicStats      → per-topic attempted/correct/wrong MAX (monotonic)
       · deletedAttempts → union (append-only) — delete kabhi revive nahi hota
     Return null = koi change nahi (no-op); {value, dirty} = apply; dirty =
     merged me local ka content hai jo cloud me missing → wapas push karo. */
  function mergeMetaValue(rid, remote, local, dead) {
    if (rid === 'deletedAttempts') {
      const rem = Array.isArray(remote) ? remote : [];
      const loc = Array.isArray(local) ? local : [];
      const set = new Set(rem); loc.forEach(x => set.add(x));
      const merged = Array.from(set);
      return merged.length === rem.length ? null : { value: merged, dirty: true };
    }
    if (rid === 'attemptIndex') {
      const rem = (Array.isArray(remote) ? remote : []).filter(e => !dead || !dead.has(e && e.id));
      const loc = (Array.isArray(local) ? local : []).filter(e => !dead || !dead.has(e && e.id));
      if (!rem.length && !loc.length) return null;
      if (!rem.length) return { value: loc, dirty: true };
      const by = new Map();
      const put = e => { if (!e || e.id == null) return; const ex = by.get(e.id); if (!ex || (e.date || 0) >= (ex.date || 0)) by.set(e.id, e); };
      loc.forEach(put); rem.forEach(put);
      const merged = Array.from(by.values());
      const sameRem = merged.length === rem.length && merged.every(e => { const x = rem.find(y => y.id === e.id); return x === e || JSON.stringify(x) === JSON.stringify(e); });
      const sameLoc = merged.length === loc.length && merged.every(e => { const x = loc.find(y => y.id === e.id); return x === e || JSON.stringify(x) === JSON.stringify(e); });
      if (sameRem && sameLoc) return null;
      return { value: merged, dirty: !sameRem };
    }
    if (rid === 'qstats') {
      if (!remote || typeof remote !== 'object') return null;
      if (!local || typeof local !== 'object') return { value: remote, dirty: false };
      let locGain = false, remGain = false;
      const cntMax = (a, b) => {
        const out = Object.assign({}, a);
        for (const k in b) {
          const av = a[k] || 0, bv = b[k] || 0;
          if (bv > av) { out[k] = bv; remGain = true; }
          else if (av > bv) locGain = true;
        }
        return out;
      };
      const out = {};
      for (const f of ['seen', 'wrong', 'correct', 'skipped']) {
        out[f] = cntMax(local[f] || {}, remote[f] || {});
      }
      const accMax = (a, b) => {
        const out = Object.assign({}, a);
        for (const k in b) { if (!(k in a)) { out[k] = b[k]; remGain = true; } else if (a[k] > b[k]) locGain = true; }
        return out;
      };
      out.topicAcc = accMax(local.topicAcc || {}, remote.topicAcc || {});
      if (!locGain && !remGain) return null;
      return { value: out, dirty: locGain };
    }
    if (rid === 'topicStats') {
      if (!remote || typeof remote !== 'object') return null;
      if (!local || typeof local !== 'object') return { value: remote, dirty: false };
      let locGain = false, remGain = false;
      const out = {};
      const keys = new Set(Object.keys(local).concat(Object.keys(remote)));
      for (const k of keys) {
        const a = local[k] || { attempted: 0, correct: 0, wrong: 0 };
        const b = remote[k] || { attempted: 0, correct: 0, wrong: 0 };
        const m = {
          attempted: Math.max(a.attempted || 0, b.attempted || 0),
          correct: Math.max(a.correct || 0, b.correct || 0),
          wrong: Math.max(a.wrong || 0, b.wrong || 0)
        };
        if (m.attempted > (a.attempted || 0) || m.correct > (a.correct || 0) || m.wrong > (a.wrong || 0)) remGain = true;
        if (m.attempted > (b.attempted || 0) || m.correct > (b.correct || 0) || m.wrong > (b.wrong || 0)) locGain = true;
        out[k] = m;
      }
      if (!locGain && !remGain) return null;
      return { value: out, dirty: locGain };
    }
    return null;
  }

  function queueMetaPush(rid) {
    loadOutbox().then(() => {
      if (!outbox.some(x => x.kind === 'meta' && x.rid === rid)) outbox.push({ kind: 'meta', rid: rid, deleted: false });
      schedulePersist();
      scheduleSoon();
    }).catch(() => {});
  }

  /* topicAcc ko topicStats (cumulative truth) se recompute — merge ke baad
     EMA-blend wali purani values stale ho sakti thi */
  async function recomputeTopicAcc() {
    try {
      const q = await Store.getMeta('qstats', null);
      const t = await Store.getMeta('topicStats', null);
      if (!t) return;
      const acc = {};
      for (const k in t) {
        const c = t[k].correct || 0, w = t[k].wrong || 0;
        acc[k] = Math.round((c / Math.max(1, c + w)) * 1000) / 10;
      }
      if (!q) return;
      if (JSON.stringify(q.topicAcc || {}) !== JSON.stringify(acc)) {
        q.topicAcc = acc;
        await DB.put('meta', { key: 'qstats', value: q });
        queueMetaPush('qstats');
      }
    } catch (e) { /* non-fatal */ }
  }

  /* ---------------- HISTORY REPAIR (v1.4.39) ----------------
     attemptIndex sirf ek derived cache hai — asli data attempts store me hai.
     v1.4.39 se pehle do-device replace-race se index ke entries kho gayi thi.
     Local attempts rows se missing entries wapas banao + 0-answer junk
     (v1.4.37 se pehle ke) delete karo. Cloud bhi push-back se theek ho jata hai. */
  let repairedOnce = false;
  async function repairHistory() {
    if (repairedOnce) return 0;
    repairedOnce = true;
    try {
      const del = new Set((await Store.getMeta('deletedAttempts', [])) || []);
      const idx = (await Store.getMeta('attemptIndex', [])) || [];
      const have = new Set(idx.map(e => e && e.id).filter(Boolean));
      const rows = await DB.getAll('attempts');
      let added = 0, junk = 0;
      const delAdds = [];
      for (const a of rows) {
        if (!a || !a.id) continue;
        if (del.has(a.id) || a.abandoned) continue;   // abandoned = user ne khud end kiya — index/junk dono se out, DB me safe
        const answered = a.result && ((a.result.correct || 0) + (a.result.wrong || 0)) > 0;
        if (a.completed === true && !answered) {
          // 0-answer completed attempt = koi value nahi — delete + vaccinate
          await DB.delete('attempts', a.id);
          delAdds.push(a.id); junk++;
          continue;
        }
        if (a.completed !== true || !answered || have.has(a.id)) continue;
        idx.push({
          id: a.id, testId: a.testId, testName: a.testName, testType: a.testType,
          attemptNo: a.attemptNo, date: a.endTime || a.date || a.updatedAt || 0,
          score: a.result.score, maxScore: a.result.maxScore,
          correct: a.result.correct, wrong: a.result.wrong, unattempted: a.result.unattempted,
          accuracy: a.result.accuracy, timeTaken: a.result.timeTaken, total: a.result.total,
          subjectStats: {}, subjectNames: {}
        });
        have.add(a.id); added++;
      }
      if (delAdds.length) {
        const del2 = Array.from(new Set((delAdds).concat((await Store.getMeta('deletedAttempts', [])) || [])));
        await DB.put('meta', { key: 'deletedAttempts', value: del2 });
        queueMetaPush('deletedAttempts');
      }
      if (added) {
        idx.sort((x, y) => (x.date || 0) - (y.date || 0));
        await DB.put('meta', { key: 'attemptIndex', value: idx });
        queueMetaPush('attemptIndex');
      }
      return added;
    } catch (e) { return 0; }
  }

  /* ---------------- DUPLICATE-BANK PURGE (v1.4.39) ----------------
     v1.4.36 se pehle seed random ids se bank questions DB me daalta tha —
     wo copies cloud tak gayi (2,500+ rows). Bundled bank ka content ab
     deterministic ids se aata hai, toh dupeHash-match wali purani copies
     delete karo (user ke khud ke/imported questions EXACT-hash match ke
     bina chhue). */
  let purgedOnce = false;
  async function purgeDuplicateBankQuestions() {
    if (purgedOnce) return 0;
    purgedOnce = true;
    try {
      const flag = await Store.getMeta('purgedDupQ1', null);
      if (flag) return flag.n || 0;
      await loadBundledIds();
      if (!bundledIds) return 0;   // bank unknown — next boot retry
      const hashes = new Set();
      await Promise.all(BANK_FILES.map(async f => {
        try {
          const arr = await (await fetch(f)).json();
          (arr || []).forEach(q => { if (q && q.dupeHash != null) hashes.add(String(q.dupeHash)); });
        } catch (e) {}
      }));
      if (!hashes.size) return 0;
      const rows = await DB.getAll('questions');
      const victims = rows.filter(r => r && r.id && r.dupeHash != null && hashes.has(String(r.dupeHash)) && !bundledIds.has(r.id));
      for (const v of victims) await DB.delete('questions', v.id);
      if (victims.length) {
        await loadOutbox();
        for (const v of victims) {
          outbox = outbox.filter(x => !(x.kind === 'question' && x.rid === v.id));
          outbox.push({ kind: 'question', rid: v.id, deleted: true });   // cloud bhi clean
        }
        schedulePersist();
      }
      await Store.setMeta('purgedDupQ1', { at: Date.now(), n: victims.length });
      return victims.length;
    } catch (e) { return 0; }
  }

  async function applyRecords(records) {
    let n = 0;
    // deletedAttempts sabse PEHLE load — same batch me index ke saath order-proof
    const dead = new Set((await Store.getMeta('deletedAttempts', [])) || []);
    for (const r0 of records) {
      if (r0 && r0.kind === 'meta' && r0.rid === 'deletedAttempts' && r0.data && Array.isArray(r0.data.value)) {
        r0.data.value.forEach(x => dead.add(x));
      }
    }
    for (const r of records) {
      try {
        if (r.kind === 'attempt') {
          if (r.deleted) {
            // DELETE propagation (v1.4.39 tak missing tha): doosri device par
            // delete hua attempt yahan bhi hatao + revive-vaccination.
            await DB.delete('attempts', r.rid);
            const del = (await Store.getMeta('deletedAttempts', [])) || [];
            if (del.indexOf(r.rid) === -1) {
              del.push(r.rid);
              await DB.put('meta', { key: 'deletedAttempts', value: del });
              queueMetaPush('deletedAttempts');
            }
            const idx = (await Store.getMeta('attemptIndex', [])) || [];
            const idx2 = idx.filter(e => e && e.id !== r.rid);
            if (idx2.length !== idx.length) {
              await DB.put('meta', { key: 'attemptIndex', value: idx2 });
              queueMetaPush('attemptIndex');
            }
            n++;
          } else {
            const local = await DB.get('attempts', r.rid);
            if (local && local.completed !== true) continue;      // local in-progress jeeta
            await DB.put('attempts', r.data); n++;
          }
        } else if (r.kind === 'test') {
          if (r.data && r.data.series) continue;
          if (r.deleted) await DB.delete('tests', r.rid);
          else { await DB.put('tests', r.data); n++; }
        } else if (r.kind === 'question') {
          if (!bundledIds) continue;               // fail-safe: ids unknown — skip (pull baad me retry karega)
          if (bundledIds.has(r.rid)) continue;
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
          // MERGE (v1.4.39): pehle wholesale replace tha — do devices alag-alag
          // data push karte toh LWW jeet jata aur doosre ka history/stats GAYAB.
          // Ab union/counters-merge: dono ka data milta hai, kuch bhi khojta nahi.
          const remote = (r.data && typeof r.data === 'object' && r.data.value !== undefined) ? r.data.value : null;
          if (remote == null) continue;
          const local = await Store.getMeta(r.rid, null);
          const m = mergeMetaValue(r.rid, remote, local, dead);
          if (m !== null) {
            await DB.put('meta', { key: r.rid, value: m.value });
            if (m.dirty) queueMetaPush(r.rid);   // merge result cloud me bhi update ho
            n++;
          }
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
      // FIX: pehle har key par alag DB.get() chalta tha (2,721 questions = 2,721
      // transactions — N+1). Ab ek hi getAll. 10x+ fast, mobile par jank nahi.
      const rows = await DB.getAll(t[0]);
      for (const row of rows) {
        if (batch.length >= 400) {
          await flush();
          if (requests >= 40) return pushed;
        }
        if (!row) continue;
        if (t[1] === 'test' && row.series) continue;                    // series local rebuild
        const rid = row[t[2]];
        if (rid == null) continue;
        if (t[1] === 'question' && (!bundledIds || bundledIds.has(rid))) continue;   // bundled kabhi nahi (unknown = skip, fail-safe)
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
    const manual = reason === 'manual' || reason === 'restore';
    const wantPush = manual || status.auto;   // auto OFF → sirf manual push (PULL hamesha)
    running = true;
    try {
      await loadBundledIds();
      await repairHistory();               // missing history wapas + junk clean
      const purged = await purgeDuplicateBankQuestions();
      if (purged) status.pending = outbox ? outbox.length : 0;
      let pushed = 0, pulled = 0, backup = 0;
      if (!status.fullBackupAt) {
        // is device ka pehla sync is account par: cloud ka data pehle lao,
        // phir outbox changes, phir local ka POORA backup (purane data bhi)
        pulled += await doPull(false);
        if (wantPush) {
          pushed += await doPush();
          if (bundledIds) { backup = await fullExport(); status.fullBackupAt = Date.now(); }
        }
        pulled += await doPull(false);
      } else {
        if (wantPush) pushed = await doPush();
        pulled += await doPull(false);
      }
      if (pulled > 0) {
        await recomputeTopicAcc();         // merge ke baad topicAcc consistent
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          try { window.dispatchEvent(new CustomEvent('cloud-pulled', { detail: { applied: pulled } })); } catch (e) {}
        }
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
    // device uthaya / tab kholA → turant sync (dusre device ke changes foran aayein)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && user && navigator.onLine !== false) syncNow('visible');
    });
    window.addEventListener('focus', () => { if (user && navigator.onLine !== false) syncNow('focus'); });
  }

  async function setAuto(on) { status.auto = !!on; await saveStatus(); }

  return {
    init, syncNow, restore, uploadImage, setAuto, signIn, signOut, authed,
    get status() { return status; },
    get user() { return user; },
    endpoint, configured,
    _test: {
      onChange, buildPushRecords, applyRecords, kindFor,
      mergeMetaValue, repairHistory, purgeDuplicateBankQuestions, recomputeTopicAcc,
      resetRepairFlags() { repairedOnce = false; purgedOnce = false; },
      setUser(u) { user = u; },
      setBundledIds(a) { bundledIds = a ? new Set(a) : null; },
      flushOutbox() { return persistOutbox(); },
      resetOutbox() { outbox = []; outboxInit = Promise.resolve(outbox); },
      hooks: TEST_HOOKS
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cloud;
