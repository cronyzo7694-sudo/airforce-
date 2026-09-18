/* ============================================================
 * AGNIVEER VAYU CBT — SITE CHROME
 * Community stats (unique visitors: daily / monthly / yearly /
 * total) + floating community chat. Runs once per page load,
 * outside #app so view re-renders never disturb it.
 * Counter: Abacus free hit-counter API (no account needed);
 * a device is counted once per period => counts ≈ unique people.
 * ============================================================ */

const SiteChrome = (() => {
  const ABACUS = 'https://abacus.jasoncameron.dev';
  const NS = 'agniveer-vayu-cbt';
  const CHAT_URL = 'https://anim-kineora.cronyzo7694.workers.dev/';

  async function api(path) {
    try {
      const r = await fetch(ABACUS + path, { mode: 'cors' });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && typeof j.value === 'number') ? j.value : null;
    } catch (e) { return null; }
  }
  const hit = key => api('/hit/' + NS + '/' + key);
  const read = key => api('/get/' + NS + '/' + key);

  const fmt = n => (n == null ? '—' : n.toLocaleString('en-IN'));

  function localDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  async function countPeople() {
    const now = new Date();
    const day = localDay(now);
    const mon = day.slice(0, 7);
    const yr = day.slice(0, 4);
    const periods = [
      ['visits-total', 'cf-counted-total'],
      ['visits-' + day, 'cf-counted-' + day],
      ['visits-' + mon, 'cf-counted-' + mon],
      ['visits-' + yr, 'cf-counted-' + yr]
    ];
    const vals = {};
    await Promise.all(periods.map(async ([key, flag]) => {
      let v = null, counted = false;
      try { counted = !!localStorage.getItem(flag); } catch (e) {}
      if (!counted) {
        v = await hit(key);               // increments
        if (v != null) { try { localStorage.setItem(flag, '1'); } catch (e) {} }
      }
      if (v == null) v = await read(key); // display value (no increment)
      vals[key] = v;
    }));
    renderStats(vals, day, mon, yr);
  }

  function renderStats(vals, day, mon, yr) {
    const host = document.getElementById('sf-stats');
    if (!host) return;
    const d = vals['visits-' + day], m = vals['visits-' + mon], y = vals['visits-' + yr], t = vals['visits-total'];
    if (d == null && m == null && y == null && t == null) {
      host.innerHTML = '<span class="sf-num">👥 Community stats unavailable offline</span>';
      return;
    }
    host.innerHTML =
      '<span class="sf-num" title="Unique devices today">📅 Aaj: <b>' + fmt(d) + '</b></span>' +
      '<span class="sf-num" title="This month">🗓️ This month: <b>' + fmt(m) + '</b></span>' +
      '<span class="sf-num" title="This year">📆 This year: <b>' + fmt(y) + '</b></span>' +
      '<span class="sf-num" title="Total aspirants so far">👥 Total: <b>' + fmt(t) + '</b></span>';
  }

  function initChat() {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('chat-panel');
    if (!fab || !panel) return;
    const frame = panel.querySelector('.chat-frame');
    fab.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      fab.setAttribute('aria-expanded', String(open));
      fab.textContent = open ? '✕' : '💬';
      fab.title = open ? 'Close chat' : 'Community Chat';
      if (open && frame && !frame.dataset.loaded) {
        frame.dataset.loaded = '1';
        frame.src = CHAT_URL;             // lazy-load only on first open
      }
    });
    const close = panel.querySelector('.chat-close');
    if (close) close.addEventListener('click', () => {
      panel.classList.remove('open');
      fab.textContent = '💬';
      fab.setAttribute('aria-expanded', 'false');
    });
  }

  function init() {
    countPeople();
    initChat();
  }

  return { init };
})();
