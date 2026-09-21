/* ============================================================
 * AGNIVEER VAYU CBT — APPLICATION SHELL
 * ============================================================ */

const App = {
  activeAttempt: null,     // live attempt object (exam screen)
  examTickHandle: null,
  lang: 'en',

  t(key) {
    const d = I18N[this.lang] || I18N.en;
    return d[key] || I18N.en[key] || key;
  },

  async config() {
    const saved = await Store.getSetting('config', null);
    if (saved) {
      // one-time migration v2 (user-tuned): reattempt ab HAMESHA naya paper deta
      // hai (same blueprint, naye questions) — repeat kam karne ka faisla.
      // Generator.pick('smart') me bhi revision caps tight kar diye gaye hain
      // (5% skipped + 5% wrong + 1% once-correct).
      if (!saved._retakeMigrated2) {
        saved._retakeMigrated2 = true;
        if (saved.retakeMode !== 'random') saved.retakeMode = 'fresh';
        try { await Store.setSetting('config', saved); } catch (e) { /* non-fatal */ }
      }
      // one-time migration v3: default strategy ab REAL PAPER BLUEPRINT hai
      // (asli exam ka chapter-weightage — performance-based nahi). Purana
      // default 'smart' tha; explicitly chuna hua option respect hota hai.
      if (!saved._strategyMigrated3) {
        saved._strategyMigrated3 = true;
        if (!saved.selectionStrategy || saved.selectionStrategy === 'smart') saved.selectionStrategy = 'realpaper';
        try { await Store.setSetting('config', saved); } catch (e) { /* non-fatal */ }
      }
      this.configCache = saved;
    } else {
      this.configCache = EXAM_CONFIG;
    }
    return this.configCache;
  },

  /* ---------------- boot ---------------- */
  async boot() {
    // language pref (tiny — localStorage ok)
    this.lang = localStorage.getItem('av_lang') || EXAM_CONFIG.defaultLanguage || 'en';
    // load saved config early (candidate name, timers, thresholds) for nav + exam header
    try { await this.config(); } catch (e) { this.configCache = EXAM_CONFIG; }

    // register service worker (offline support)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* offline mode unavailable */ }
    }

    // first-run: seed bundled PYQ question bank
    try {
      const needSeed = !(await Store.getMeta('seeded', false));
      if (needSeed) {
        document.getElementById('app').innerHTML =
          `<div class="page"><div class="seed-box"><img class="seed-logo" src="icons/icon-192.png" alt="Kineora Exam logo"><div class="seed-spin"></div>
           <h3>Preparing your question bank…</h3>
           <p>Loading previous-year questions into local storage. This happens only once.</p></div></div>`;
        await Bank.seedIfNeeded();
      }
    } catch (e) { console.error('seed failed', e); }

    // bundled bank auto-sync: data files changed (new questions) → import the
    // delta + auto-build new tests from it. User never builds tests by hand.
    try {
      const r = await Bank.syncBundled();
      if (r && r.synced && r.imported > 0 && typeof Generator !== 'undefined') {
        const made = await Generator.autoBuild();
        let msg = r.imported + ' new question' + (r.imported === 1 ? '' : 's') + ' synced from the question bank' +
          (made ? ' — ' + made + ' new test' + (made === 1 ? '' : 's') + ' auto-created 🎉' : '');
        if (r.pruned > 0) msg += ' · ' + r.pruned + ' outdated question' + (r.pruned === 1 ? '' : 's') + ' removed';
        AVUtil.toast(msg, 'success');
      } else if (r && r.pruned > 0) {
        AVUtil.toast(r.pruned + ' outdated question' + (r.pruned === 1 ? '' : 's') + ' removed — bank updated.', 'info');
      }
    } catch (e) { /* sync is a bonus — never block boot */ }

    // upgrade path: existing installs get the ready-made test series too
    try {
      if (!(await Store.getMeta('seriesBuilt', null))) {
        const r = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
        if (r.made) await Store.setMeta('seriesBuilt', { at: Date.now(), made: r.made });
      }
    } catch (e) { /* series is a bonus — never block boot */ }

    // storage ko eviction se bachao (PWA installed = persistent)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

    // cloud backup (Neon) + media (Cloudinary) — optional, kabhi block nahi karta
    try { if (typeof Cloud !== 'undefined') Cloud.init(); } catch (e) { /* cloud is a bonus */ }

    // cloud se naya data aaya → khula data-view turant refresh (exam/result kabhi nahi)
    let _cloudPullT = null;
    window.addEventListener('cloud-pulled', () => {
      try {
        // v1.4.41: banner/unfinished count bhi turant fresh (dusre device ka
        // END/park yahan pahunchta hai → resume list sahi ho jaati hai)
        if (App.refreshPendingCount) App.refreshPendingCount().catch(() => {});
        if (document.hidden || !Router.path) return;
        if (document.body.classList.contains('exam-on') || App.activeAttempt) return;   // live exam safe
        const p = Router.path;
        if (!['/dashboard', '/attempts', '/tests', '/questions'].some(x => p === x || p.startsWith(x + '/'))) return;
        clearTimeout(_cloudPullT);
        _cloudPullT = setTimeout(() => { if (Router.path === p) Router.resolve(); }, 700);
      } catch (e) { /* non-fatal */ }
    });

    // find unfinished attempts (browser closed during exam) + stale cleanup
    try { await this.staleAttemptCleanup(); } catch (e) { /* non-fatal */ }
    const unfinished = await this.unfinishedAttempts();
    this.pendingResume = unfinished[0] || null;
    this.pendingResumeCount = unfinished.length;

    // site chrome: community visitor stats + floating chat (once per page load)
    try { if (typeof SiteChrome !== 'undefined') SiteChrome.init(); } catch (e) { /* never block the app */ }

    // exam selector (topnav) — delegated so it survives every re-render
    document.addEventListener('change', e => {
      if (e.target && e.target.id === 'exam-select') {
        const v = e.target.value;
        this.configCache = this.configCache || Object.assign({}, EXAM_CONFIG);
        this.configCache.exam = v;
        Store.setSetting('config', this.configCache).catch(() => {});
        AVUtil.toast('Exam selected: ' + (v === 'airforce' ? 'Agniveer Vayu (Air Force)' : v));
      }
    });

    this.mountRoutes();
    Router.beforeEach = async (to, from) => this.guard(to, from);
    Router.start();
  },

  /* series progress — testId match YA naam match (series rebuild par test id
     badal sakta hai, naam nahi: "Full Mock Test 3" stable rehta hai) */
  seriesProgress(seriesTests, attemptIndex) {
    const doneIds = new Set(), doneNames = new Set();
    (attemptIndex || []).forEach(a => {
      if (a.abandoned) return;
      if (a.testId) doneIds.add(a.testId);
      if (a.testName) doneNames.add(a.testName);
    });
    const doneSet = new Set();
    (seriesTests || []).forEach(t => { if (doneIds.has(t.id) || doneNames.has(t.name)) doneSet.add(t.id); });
    const pend = (seriesTests || []).filter(t => !doneSet.has(t.id));
    const nextMock = pend.filter(t => t.type === 'full').sort((a, b) => (a.seriesNo || 0) - (b.seriesNo || 0) || a.createdAt - b.createdAt)[0];
    const next = nextMock || pend.sort((a, b) => a.createdAt - b.createdAt)[0] || null;
    return { done: doneSet.size, total: (seriesTests || []).length, doneSet, next, nextIsMock: !!nextMock && nextMock === next };
  },

  async findUnfinishedAttempt() {
    return (await this.unfinishedAttempts())[0] || null;
  },
  async unfinishedAttempts() {
    // 'completed' boolean index hamesha khaali rehta hai (db.js note dekho) —
    // isliye seedha getAll + filter. Attempts hundreds me hote hain, ye fast hai.
    // v1.4.40: SAB unfinished attempts (latest first) — koi bhi test kabhi bhi
    // de sake, purane attempts parked rehte hain, har ek resume-able hai.
    const all = await DB.getAll('attempts');
    return all
      .filter(a => a.completed !== true && !a.abandoned)
      .sort((x, y) => (y.startedAt || y.startTime || 0) - (x.startedAt || x.startTime || 0));
  },
  async staleAttemptCleanup() {
    // 30+ din purane unfinished attempts → abandoned (data DB me safe rehta hai,
    // bas resume list se hat jaate hain — hamesha ke liye garbage jama nahi hota)
    try {
      const all = await DB.getAll('attempts');
      const CUT = Date.now() - 30 * 86400000;
      let n = 0;
      for (const a of all) {
        if (a && a.completed !== true && !a.abandoned && (a.startedAt || a.startTime || 0) < CUT) {
          a.completed = true; a.abandoned = true; a.endTime = a.endTime || Date.now();
          await DB.put('attempts', a); n++;
        }
      }
      return n;
    } catch (e) { return 0; }
  },

  /* ---------------- navigation guard ---------------- */
  async guard(to, from) {
    // leaving an active exam view (attempt still in progress) requires confirmation
    if (this.activeAttempt && !this.activeAttempt.completed && from === '/test/' + this.activeAttempt.testId + '/attempt' && !to.startsWith('/test/' + this.activeAttempt.testId + '/attempt')) {
      const leave = await AVUtil.confirmModal({
        title: this.t('leaveExamTitle'),
        body: this.t('leaveExamBody'),
        yesLabel: this.t('leave'), noLabel: this.t('stay'), yesClass: 'btn-danger'
      });
      if (!leave) { location.hash = '#' + from; return false; }
      await ExamScreen.persist(); // preserve the attempt
      ExamScreen.teardown();
      this.activeAttempt = null;
      this.refreshPendingCount().catch(() => {});   // v1.4.40: banner count turant sahi
    }
    return true;
  },

  async refreshPendingCount() {
    const u = await this.unfinishedAttempts();
    this.pendingResume = u[0] || null;
    this.pendingResumeCount = u.length;
  },

  /* ---------------- top nav ---------------- */
  navHTML(active) {
    const items = [
      ['dashboard', '#/dashboard', 'Dashboard'],
      ['tests', '#/tests', 'Tests'],
      ['questions', '#/questions', 'Question Bank'],
      ['import', '#/import', 'Import'],
      ['attempts', '#/attempts', 'My Attempts'],
      ['settings', '#/settings', 'Settings']
    ];
    return `<header class="topnav">
      <a class="brand" href="#/dashboard" aria-label="Home">
        <span class="brand-mark" aria-hidden="true">
          <img src="icons/icon-96.png" alt="">
        </span>
        <span class="brand-text">Kineora <b>Exam</b></span>
      </a>
      <nav class="navlinks" aria-label="Main">
        ${items.map(([id, href, label]) => `<a href="${href}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <div class="nav-right">
        <label class="exam-sel" title="Exam select karo — naye exams aa rahe hain">
          <span aria-hidden="true">🎖️</span>
          <select id="exam-select" aria-label="Select exam">
            <option value="airforce" ${(this.configCache && this.configCache.exam) !== 'navy' && (this.configCache && this.configCache.exam) !== 'army' ? 'selected' : ''}>Agniveer Vayu ✈️</option>
            <option value="navy" disabled>Indian Navy — coming soon</option>
            <option value="army" disabled>Indian Army — coming soon</option>
          </select>
        </label>
        <a class="nav-user" href="#/settings" title="Profile & Settings">
          <span class="nav-avatar">${(this.configCache && this.configCache.profileImage) ? `<img src="${AVUtil.esc(this.configCache.profileImage)}" alt="">` : AVUtil.esc((((this.configCache && this.configCache.candidateName) || 'Practice Candidate').trim()[0] || 'P').toUpperCase())}</span>
          <span class="nav-user-name">${AVUtil.esc(((this.configCache && this.configCache.candidateName) || 'Practice Candidate').split(' ')[0])}</span>
        </a>
      </div>
    </header>`;
  },

  /* `route` (optional): hash path this render belongs to. Slow in-page async
     re-renders (e.g. the bank save handler rebuilding the question list) can
     finish after the user has already navigated elsewhere; painting then would
     wipe the page they are on. Stale renders are skipped. */
  page(cls, inner, route) {
    if (route && Router.path && Router.path !== route) return false;
    document.body.classList.remove('cbt-on');   // normal pages always show site chrome
    /* v1.4.43: nav #app se BAHAR body-level chrome me render hota hai —
       study-mode filters (#app par) fixed bottomnav/topnav ko kabhi nahi todenge */
    const app = document.getElementById('app');
    if (app) app.innerHTML = `<main class="${cls || ''}">${inner}</main>`;
    const nv = document.getElementById('app-nav');
    if (nv) nv.innerHTML = this.navHTML(cls ? cls.split(' ')[0] : '');
    const bt = document.getElementById('app-bottom');
    if (bt) bt.innerHTML = this.bottomNavHTML();
    window.scrollTo(0, 0);
    return true;
  },

  /* mobile app-style bottom tab bar (desktop keeps the top nav) */
  bottomNavHTML() {
    const p = (typeof Router !== 'undefined' && Router.path) || '/dashboard';
    const I = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5.5 9.5V20h13V9.5"/></svg>',
      tests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
      bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z"/><path d="M9 8h7"/></svg>',
      attempts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20v-7"/><path d="M12 20V5"/><path d="M19 20v-10"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    };
    const tabs = [
      ['/dashboard', 'Home', I.home],
      ['/tests', 'Tests', I.tests],
      ['/questions', 'Bank', I.bank],
      ['/attempts', 'Attempts', I.attempts],
      ['/settings', 'Settings', I.settings]
    ];
    return `<nav class="bottomnav" aria-label="Main">
      ${tabs.map(([href, label, svg]) => {
        const active = p === href || (href !== '/dashboard' && p.startsWith(href));
        return `<a href="#${href}" class="bn-tab ${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${svg}<span class="bn-label">${label}</span></a>`;
      }).join('')}
    </nav>`;
  },

  /* ---------------- resume banner (multi-attempt aware) ---------------- */
  resumeBannerHTML() {
    if (!this.pendingResume) return '';
    const a = this.pendingResume;
    const more = Math.max(0, (this.pendingResumeCount || 1) - 1);
    return `<div class="resume-banner" role="alert">
      <div>
        <b>An unfinished examination attempt was found.</b>
        <span>${AVUtil.esc(a.testName)} — started ${AVUtil.fmtDate(a.startTime)}</span>
        ${more ? `<span class="muted small"> + ${more} aur unfinished — My Attempts me sab milenge</span>` : ''}
      </div>
      <div class="resume-actions">
        <button class="btn btn-primary" onclick="App.resumePending()">RESUME EXAM</button>
        <button class="btn btn-plain" onclick="App.endPending()">END ATTEMPT</button>
      </div>
    </div>`;
  },

  async resumePending() {
    const a = this.pendingResume;
    if (!a) return;
    // timer expiry may have occurred while away — engine fast-forwards
    const test = await DB.get('tests', a.testId);
    if (!test) { AVUtil.toast('The test for this attempt no longer exists.', 'error'); this.pendingResume = null; return this.refresh(); }
    location.hash = '#/test/' + a.testId + '/attempt';
  },

  async endPending() {
    const a = this.pendingResume;
    if (!a) return;
    return this.endAttemptById(a.id);
  },

  async endAttemptById(id) {
    const a = await DB.get('attempts', id);
    if (!a) return;
    const ok = await AVUtil.confirmModal({
      title: 'End this attempt?',
      body: `"${AVUtil.esc(a.testName || 'This test')}" ka attempt incomplete mark hoga aur resume list se hat jayega. Iska score nahi banega.`,
      yesLabel: 'End Attempt', yesClass: 'btn-danger'
    });
    if (!ok) return;
    a.completed = true; a.abandoned = true;
    a.endTime = Date.now();
    await DB.put('attempts', a);
    await this.refresh();
    AVUtil.toast('Attempt ended.');
  },

  async refresh() {
    const u = await this.unfinishedAttempts();
    this.pendingResume = u[0] || null;
    this.pendingResumeCount = u.length;
    Router.resolve();
  },

  /* ---------------- routes ---------------- */
  mountRoutes() {
    Router.add('/dashboard', () => Views.dashboard());
    Router.add('/tests', () => Views.tests());
    Router.add('/tests/new', () => Views.builder());
    Router.add('/test/:id', p => Views.testOverview(p.id));
    Router.add('/test/:id/instructions', p => Views.instructions(p.id));
    Router.add('/test/:id/attempt', p => Views.attempt(p.id));
    Router.add('/attempt/:id/result', p => Views.result(p.id));
    Router.add('/attempt/:id/analysis', p => Views.analysis(p.id));
    Router.add('/questions', () => Views.questionBank());
    Router.add('/import', () => Views.importPage());
    Router.add('/attempts', () => Views.attempts());
    Router.add('/settings', () => Views.settings());
    Router.add('/shared/:code', p => Views.shared(p.code));           // 🔗 shared test link
    Router.notFound = () => Router.go('/dashboard');
  }
};

window.addEventListener('beforeunload', e => {
  if (App.activeAttempt && !App.activeAttempt.completed) {
    e.preventDefault();
    e.returnValue = '';
  }
});
