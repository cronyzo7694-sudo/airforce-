/* ============================================================
 * AGNIVEER VAYU CBT — HASH ROUTER (with guards)
 * The router NEVER renders exam questions from the URL — the
 * attempt state in IndexedDB is the single source of truth.
 * ============================================================ */

const Router = (() => {
  const routes = [];
  let notFound = null;
  let beforeEach = null;
  let currentPath = null;

  function add(pattern, handler) {
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    routes.push({ rx, keys, handler });
  }

  async function resolveNow(pathArg) {
    /* pathArg: the path captured when the navigation was queued. If a queued
       resolve only reads location.hash when it finally runs, a newer hash
       change makes the STALE resolve render the NEW page, then the newer
       resolve renders it again — wiping any in-progress state (e.g. an
       import report). Snapshotting the path per-navigation fixes that. */
    const hash = pathArg || location.hash || '#/dashboard';
    const path = hash.replace(/^#/, '') || '/dashboard';
    if (beforeEach) {
      const ok = await beforeEach(path, currentPath);
      if (ok === false) return; // guard blocked navigation
    }
    currentPath = path;
    for (const r of routes) {
      const m = path.match(r.rx);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
        try { await r.handler(params); }
        catch (err) {
          console.error(err);
          document.getElementById('app').innerHTML =
            `<div class="page"><div class="error-box"><h2>Something went wrong</h2><p>${AVUtil.esc(err.message)}</p>
             <button class="btn btn-primary" onclick="location.hash='#/dashboard'">Back to Dashboard</button></div></div>`;
        }
        return;
      }
    }
    if (notFound) notFound(path);
  }

  /* Serialized + stale-safe navigation:
     resolves are queued one at a time, and a resolve that was superseded by a
     newer navigation while waiting is dropped. This prevents a slow view (e.g.
     a dashboard still reading IndexedDB) from painting OVER a page the user
     has already navigated to (worst case: over a live exam screen). */
  let queue = Promise.resolve();
  let generation = 0;
  function resolve() {
    const myGen = ++generation;
    const myPath = location.hash || '#/dashboard'; // snapshot BEFORE queueing
    queue = queue.then(async () => {
      if (myGen !== generation) return; // superseded — a newer hashchange already queued
      try { await resolveNow(myPath); } catch (e) { console.error('route error', e); }
    });
    return queue;
  }

  function go(path) { location.hash = '#' + path; }

  function start() {
    window.addEventListener('hashchange', resolve);
    if (!location.hash) {
      location.hash = '#/dashboard'; // the resulting hashchange triggers resolve()
      return;
    }
    resolve();
  }

  return { add, start, resolve, go, set beforeEach(fn) { beforeEach = fn; }, set notFound(fn) { notFound = fn; }, get path() { return currentPath; } };
})();
