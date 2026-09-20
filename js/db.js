/* ============================================================
 * AGNIVEER VAYU CBT — IndexedDB LOCAL-FIRST DATABASE
 * Primary store for questions, tests, attempts, settings, meta.
 * localStorage is only used for tiny UI prefs — all real data
 * lives here so the platform works fully offline.
 * ============================================================ */

const DB = (() => {
  const NAME = 'agniveer-cbt';
  const VERSION = 2;
  let dbp = null;

  const STORES = {
    questions: { keyPath: 'id', indexes: [
      ['subject', 'subject', { unique: false }],
      ['chapter', 'chapter', { unique: false }],
      ['topic', 'topic', { unique: false }],
      ['difficulty', 'difficulty', { unique: false }],
      ['dupeHash', 'dupeHash', { unique: false }],
      ['year', 'year', { unique: false }],
      ['subject_chapter', ['subject', 'chapter'], { unique: false }],
      ['subject_topic', ['subject', 'topic'], { unique: false }]
    ]},
    tests: { keyPath: 'id', indexes: [
      ['type', 'type', { unique: false }],
      ['createdAt', 'createdAt', { unique: false }]
    ]},
    attempts: { keyPath: 'id', indexes: [
      ['testId', 'testId', { unique: false }],
      ['startTime', 'startTime', { unique: false }],
      ['completed', 'completed', { unique: false }],
      ['testId_completed', ['testId', 'completed'], { unique: false }]
    ]},
    settings: { keyPath: 'key' },
    meta: { keyPath: 'key' },
    notes: { keyPath: 'qid', indexes: [
      ['updatedAt', 'updatedAt', { unique: false }]
    ]}
  };

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = e => {
        const db = req.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const os = db.createObjectStore(name, { keyPath: def.keyPath });
            (def.indexes || []).forEach(([iname, keyPath, opts]) => os.createIndex(iname, keyPath, opts));
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      let result;
      try { result = fn(os); } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function reqToPromise(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /* ---------- change observers (cloud sync ke liye) ----------
     put/bulkPut/delete par emit — cloud module dirty-tracking karta hai. */
  const _observers = [];
  function _emit(store, keyOrObj) {
    for (let i = 0; i < _observers.length; i++) {
      try { _observers[i].change(store, keyOrObj); } catch (e) {}
    }
  }
  function _emitDelete(store, key) {
    for (let i = 0; i < _observers.length; i++) {
      try { _observers[i].remove(store, key); } catch (e) {}
    }
  }

  return {
    open,

    onChange(changeFn, removeFn) {
      const o = { change: changeFn, remove: removeFn };
      _observers.push(o);
      return () => { const i = _observers.indexOf(o); if (i > -1) _observers.splice(i, 1); };
    },

    async put(store, obj) {
      const r = await tx(store, 'readwrite', os => os.put(obj));
      _emit(store, obj);
      return r;
    },
    async get(store, key) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).get(key));
    },
    async delete(store, key) {
      const r = await tx(store, 'readwrite', os => os.delete(key));
      _emitDelete(store, key);
      return r;
    },
    async clear(store) { return tx(store, 'readwrite', os => os.clear()); },
    async count(store) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).count());
    },

    async getAll(store) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).getAll());
    },

    async getAllKeys(store) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).getAllKeys());
    },

    async getMany(store, keys) {
      // bulk fetch preserving order of input keys (single transaction)
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(store);
        const os = t.objectStore(store);
        const out = new Array(keys.length);
        let pending = 0;
        keys.forEach((k, i) => {
          const r = os.get(k);
          pending++;
          r.onsuccess = () => { out[i] = r.result; if (--pending === 0) resolve(out); };
          r.onerror = () => reject(r.error);
        });
        if (keys.length === 0) resolve(out);
        t.onerror = () => reject(t.error);
      });
    },

    async bulkPut(store, items, onProgress) {
      // chunked transactions — safe for thousands of records
      const db = await open();
      const CHUNK = 500;
      for (let i = 0; i < items.length; i += CHUNK) {
        await new Promise((resolve, reject) => {
          const t = db.transaction(store, 'readwrite');
          const os = t.objectStore(store);
          for (const it of items.slice(i, i + CHUNK)) os.put(it);
          t.oncomplete = resolve;
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        });
        if (onProgress) onProgress(Math.min(i + CHUNK, items.length), items.length);
      }
      for (const it of items) _emit(store, it);
      return items.length;
    },

    async byIndex(store, index, value) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).index(index).getAll(value));
    },

    async byIndexRange(store, index, lower, upper) {
      const db = await open();
      return reqToPromise(db.transaction(store).objectStore(store).index(index)
        .getAll(IDBKeyRange.bound(lower, upper)));
    },

    async cursor(store, index, fn) {
      // iterate without loading everything; fn(obj) — return false to stop
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(store);
        const src = index ? t.objectStore(store).index(index) : t.objectStore(store);
        const cur = src.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return resolve();
          if (fn(c.value) === false) return resolve();
          c.continue();
        };
        cur.onerror = () => reject(cur.error);
      });
    },

    async estimateUsage() {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      }
      return { usage: 0, quota: 0 };
    }
  };
})();

/* ---------- settings / meta convenience ---------- */
const Store = {
  async getSetting(key, fallback) {
    const row = await DB.get('settings', key);
    return row ? row.value : fallback;
  },
  async setSetting(key, value) {
    await DB.put('settings', { key, value });
    return value;
  },
  async getMeta(key, fallback) {
    const row = await DB.get('meta', key);
    return row ? row.value : fallback;
  },
  async setMeta(key, value) {
    await DB.put('meta', { key, value });
    return value;
  }
};
