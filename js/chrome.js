/* ============================================================
 * AGNIVEER VAYU CBT — SITE CHROME
 * Real device stats (question bank / tests / attempts — counted
 * live from IndexedDB, no dummy numbers) + floating community
 * chat. Runs once per page load, outside #app so view re-renders
 * never disturb it.
 * ============================================================ */

const SiteChrome = (() => {
  const CHAT_URL = 'https://anim-kineora.cronyzo7694.workers.dev/';

  const fmt = n => (n == null ? '—' : n.toLocaleString('en-IN'));

  /* footer stats — REAL data from this device's database */
  async function loadLocalStats() {
    const host = document.getElementById('sf-stats');
    if (!host) return;
    try {
      let questions = 0;
      for (const s of ['physics', 'mathematics', 'english', 'raga']) {
        questions += (await DB.byIndex('questions', 'subject', s)).length;
      }
      const tests = (await DB.getAll('tests')).length;
      const attempts = (await Store.getMeta('attemptIndex', [])).filter(x => !x.abandoned).length;
      host.innerHTML =
        '<span class="sf-num" title="Questions in your bank (live count)">📚 <b>' + fmt(questions) + '</b> Questions</span>' +
        '<span class="sf-num" title="Tests in your library">📝 <b>' + fmt(tests) + '</b> Tests</span>' +
        '<span class="sf-num" title="Attempts given on this device">✅ <b>' + fmt(attempts) + '</b> Attempts</span>';
    } catch (e) {
      host.innerHTML = '';
    }
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
    loadLocalStats();
    initChat();
  }

  return { init };
})();
