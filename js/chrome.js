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
      /* v1.4.48: exam-scoped live count (SSC active → SSC ka bank) */
      const ex = (App.configCache && App.configCache.exam) || 'airforce';
      const subs = (App.configCache && App.configCache.subjects && App.configCache.subjects.map(s => s.id)) || ['physics', 'mathematics', 'english', 'raga'];
      let questions = 0;
      for (const s of subs) {
        questions += (await DB.byIndex('questions', 'subject', s)).filter(q => (q.exam || 'airforce') === ex).length;
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

  /* ---------------- STUDY MODES (v1.4.42/43) ----------------
     aankhon ka aaram — poore website par, test/question text
     har mode me readable. AUTO mode: shaam 7 – subah 6 khud Night. */
  const MODE_LABELS = { normal: '☀️ Normal', bw: '⚫⚪ Black & White', night: '🌙 Night', paper: '📄 Paper', dark: '🕶️ Dark', auto: '🕑 Auto' };
  function autoFor(hour) { return (hour >= 19 || hour < 6) ? 'night' : 'normal'; }
  let _autoTimer = null;

  function initMenu() {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('menu-panel');
    if (!fab || !panel) return;
    const slider = document.getElementById('hue-slider');
    const hueVal = document.getElementById('hue-val');
    const autoNote = document.getElementById('auto-note');
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

    const apply = (mode, hue, silent) => {
      const root = document.documentElement;
      const eff = mode === 'auto' ? autoFor(new Date().getHours()) : mode;   // auto → abhi ka sahi mode
      ['sm-normal', 'sm-bw', 'sm-night', 'sm-paper', 'sm-dark'].forEach(c => root.classList.remove(c));
      if (eff && eff !== 'normal') root.classList.add('sm-' + eff);
      else if (hue > 0) root.classList.add('sm-normal');   // sirf hue slider active
      root.style.setProperty('--hue', (hue || 0) + 'deg');
      try { localStorage.setItem('studyMode', mode || 'normal'); localStorage.setItem('studyHue', String(hue || 0)); } catch (e) {}
      btns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      if (autoNote) autoNote.style.display = mode === 'auto' ? '' : 'none';
      if (slider) slider.value = String(hue || 0);
      if (hueVal) hueVal.textContent = (hue || 0) + '°';
      if (!silent) {
        const lbl = MODE_LABELS[mode] || mode;
        const effNote = mode === 'auto' ? (eff === 'night' ? ' (abhi Night chal raha hai)' : ' (abhi Normal)') : '';
        try { AVUtil.toast(lbl + ' ON' + effNote + ' — aankhon ko aaram 😌', 'success'); } catch (e) {}
      }
    };

    btns.forEach(b => b.addEventListener('click', () => {
      let hue = 0;
      try { hue = parseInt(localStorage.getItem('studyHue') || '0', 10) || 0; } catch (e) {}
      apply(b.dataset.mode, hue);
    }));
    if (slider) slider.addEventListener('input', () => {
      let mode = 'normal';
      try { mode = localStorage.getItem('studyMode') || 'normal'; } catch (e) {}
      apply(mode, parseInt(slider.value, 10) || 0, true);   // slider drag me har frame toast nahi
    });
    const hreset = document.getElementById('hue-reset');
    if (hreset) hreset.addEventListener('click', () => {
      let mode = 'normal';
      try { mode = localStorage.getItem('studyMode') || 'normal'; } catch (e) {}
      apply(mode, 0);
    });

    // AUTO: raat/din switch khud — har 10 min re-check (7 baje / 6 baje crossing)
    if (_autoTimer) clearInterval(_autoTimer);
    _autoTimer = setInterval(() => {
      let mode = 'normal';
      try { mode = localStorage.getItem('studyMode') || 'normal'; } catch (e) {}
      if (mode !== 'auto') return;
      const eff = autoFor(new Date().getHours());
      const root = document.documentElement;
      const cur = ['sm-normal', 'sm-bw', 'sm-night', 'sm-paper', 'sm-dark'].find(c => root.classList.contains(c)) || '';
      const want = eff === 'night' ? 'sm-night' : '';
      if (cur !== want) {
        let h = 0; try { h = parseInt(localStorage.getItem('studyHue') || '0', 10) || 0; } catch (e) {}
        apply('auto', h, true);
        try { AVUtil.toast(eff === 'night' ? '🌙 Raat ho gayi — Night mode khud ON ho gaya' : '☀️ Subah ho gayi — Normal mode wapas', 'info'); } catch (e) {}
      }
    }, 10 * 60 * 1000);

    // restore (saved mode/hue)
    let m = 'normal', h = 0;
    try { m = localStorage.getItem('studyMode') || 'normal'; h = parseInt(localStorage.getItem('studyHue') || '0', 10) || 0; } catch (e) {}
    apply(m, h, true);
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
