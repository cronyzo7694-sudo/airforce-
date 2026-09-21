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
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    const frame = panel.querySelector('.chat-frame');
    const openChat = () => {
      if (_closeMenu) _closeMenu();
      panel.classList.add('open');
      if (frame && !frame.dataset.loaded) {
        frame.dataset.loaded = '1';
        frame.src = CHAT_URL;             // lazy-load only on first open
      }
    };
    /* v1.4.42: chat ab MENU ke andar ek row hai */
    const chatRow = document.getElementById('menu-chat');
    if (chatRow) chatRow.addEventListener('click', openChat);
    const close = panel.querySelector('.chat-close');
    if (close) close.addEventListener('click', () => panel.classList.remove('open'));
    return openChat;
  }

  /* ---------------- STUDY MODES (v1.4.42) ----------------
     aankhon ka aaram — poore website par, test/question text
     har mode me readable (filters luminance-contrast preserve
     karte hain; fixed elements par indirect filter hai isliye
     nav/modals kabhi nahi tootte). */
  function initMenu() {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('menu-panel');
    if (!fab || !panel) return;
    const slider = document.getElementById('hue-slider');
    const hueVal = document.getElementById('hue-val');
    const btns = Array.from(panel.querySelectorAll('.mode-btn'));

    const closeMenu = () => {
      panel.classList.remove('open');
      fab.textContent = '☰';
      fab.setAttribute('aria-expanded', 'false');
    };

    fab.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      fab.setAttribute('aria-expanded', String(open));
      fab.textContent = open ? '✕' : '☰';
    });
    const mc = document.getElementById('menu-close');
    if (mc) mc.addEventListener('click', closeMenu);
    document.addEventListener('click', e => {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      closeMenu();                                   // bahar click → band
    });

    const apply = (mode, hue) => {
      const root = document.documentElement;
      ['sm-normal', 'sm-bw', 'sm-night', 'sm-paper', 'sm-dark'].forEach(c => root.classList.remove(c));
      if (mode && mode !== 'normal') root.classList.add('sm-' + mode);
      else if (hue > 0) root.classList.add('sm-normal');   // sirf hue slider active
      root.style.setProperty('--hue', (hue || 0) + 'deg');
      try { localStorage.setItem('studyMode', mode || 'normal'); localStorage.setItem('studyHue', String(hue || 0)); } catch (e) {}
      btns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      if (slider) slider.value = String(hue || 0);
      if (hueVal) hueVal.textContent = (hue || 0) + '°';
    };

    btns.forEach(b => b.addEventListener('click', () => {
      let hue = 0;
      try { hue = parseInt(localStorage.getItem('studyHue') || '0', 10) || 0; } catch (e) {}
      apply(b.dataset.mode, hue);
    }));
    if (slider) slider.addEventListener('input', () => {
      let mode = 'normal';
      try { mode = localStorage.getItem('studyMode') || 'normal'; } catch (e) {}
      apply(mode, parseInt(slider.value, 10) || 0);
    });

    // restore
    let m = 'normal', h = 0;
    try { m = localStorage.getItem('studyMode') || 'normal'; h = parseInt(localStorage.getItem('studyHue') || '0', 10) || 0; } catch (e) {}
    apply(m, h);
    return closeMenu;
  }

  let _closeMenu = null;
  function init() {
    loadLocalStats();
    _closeMenu = initMenu();
    initChat();
  }

  return { init, closeMenu: () => { if (_closeMenu) _closeMenu(); } };
})();
