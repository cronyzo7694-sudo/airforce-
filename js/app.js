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
    /* v1.4.46 MULTI-EXAM: config hamesha current EXAM ke base par rebuild hota
       hai — ek exam ka data (subjects/marking/duration) doosre me kabhi nahi
       ghusta. Airforce = legacy flat (user ke tunes preserve), doosre exams =
       base + sirf unke apne overrides. */
    try {
      const savedCfg = this.configCache || {};
      const exam = (savedCfg.exam && typeof EXAM_CONFIGS !== 'undefined' && EXAM_CONFIGS[savedCfg.exam]) ? savedCfg.exam : 'airforce';
      const base = JSON.parse(JSON.stringify(EXAM_CONFIGS[exam]));
      const PREFS = ['candidateName', 'profileImage', 'defaultLanguage', 'retakeMode', 'selectionStrategy',
        'thresholds', 'timerWarning', 'timerCritical', 'shuffleQuestions', 'shuffleOptions',
        'shuffleSubjectOrder', 'instantExplanation', '_retakeMigrated2', '_strategyMigrated3'];
      PREFS.forEach(k => { if (savedCfg[k] !== undefined) base[k] = savedCfg[k]; });
      if (exam === 'airforce') {
        // legacy flat: airforce ke user-tuned exam-specific bhi saved me hain — upar apply
        ['name', 'mode', 'duration', 'marking', 'timerMode', 'sectionLock', 'sectionSubmitRequired',
         'allowPreviousSection', 'allowFutureSection', 'autoSubmitOnTimerExpiry', 'allowPause', 'subjects']
          .forEach(k => { if (savedCfg[k] !== undefined) base[k] = savedCfg[k]; });
      }
      const ov = (savedCfg.overrides || {})[exam];
      if (ov) Object.assign(base, ov);
      base.exam = exam;
      // live getters (plain clone me snapshot values hoti — stale ho jati)
      Object.defineProperty(base, 'totalQuestions', { configurable: true, get() { return this.subjects.reduce((a, x) => a + x.questions, 0); } });
      Object.defineProperty(base, 'maxMarks', { configurable: true, get() { return this.subjects.reduce((a, x) => a + x.questions, 0) * this.marking.correct; } });
      this.configCache = base;
    } catch (e) { /* keep legacy configCache */ }
    return this.configCache;
  },

  /* v1.4.46: config save — exam-specific keys galat exam ke flat data me
     kabhi nahi likhe jaate (airforce flat safe, doosre exams overrides me) */
  async persistConfig(cfg) {
    const EXK = ['name', 'mode', 'duration', 'marking', 'timerMode', 'sectionLock', 'sectionSubmitRequired',
      'allowPreviousSection', 'allowFutureSection', 'autoSubmitOnTimerExpiry', 'allowPause', 'subjects'];
    const exam = (cfg && cfg.exam) || 'airforce';
    const out = Object.assign({}, cfg, { exam });
    delete out.totalQuestions; delete out.maxMarks;
    if (exam !== 'airforce' && typeof EXAM_CONFIGS !== 'undefined') {
      const ov = Object.assign({}, ((cfg.overrides || {})[exam]) || {});
      EXK.forEach(k => { if (cfg[k] !== undefined) ov[k] = cfg[k]; });
      out.overrides = Object.assign({}, cfg.overrides || {}, { [exam]: ov });
      // flat me airforce ke DEFAULT exam-specific values (contamination-proof)
      const af = EXAM_CONFIGS.airforce;
      EXK.forEach(k => { if (af[k] !== undefined) out[k] = JSON.parse(JSON.stringify(af[k])); });
    }
    await Store.setSetting('config', out);
  },

  /* v1.4.55: REAL 4-subject bank (12k+) aane par SSC series REBUILD — v1
     series (1 mock + kuch subject tests) ko naya blueprint-mix series
     (15 mocks, chapter-diverse) mila. Numbering continue rehti hai,
     attempted history kabhi nahi chhooti. */
  async rebuildSscSeriesBankV2() {
    try {
      const f = await Store.getMeta('seriesBuilt_ssc-chsl', null);
      if (!f || f.bankV === 2) return;
      await Store.setMeta('seriesBuilt_ssc-chsl', null);   // boot/seed path rebuild karega
      const r = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
      await Store.setMeta('seriesBuilt_ssc-chsl', { at: Date.now(), made: (r && r.made) || 0, bankV: 2 });
      if (r && r.made) AVUtil.toast(r.made + ' naye blueprint-mix SSC tests ban gaye 🎉', 'success');
    } catch (e) { /* best-effort */ }
  },

  /* v1.4.54 one-time: SSC bank v1 me 1 broken stub question tha (text ~1 char)
     — jaise hi import hua ho, saaf kar do. Real questions kabhi nahi chhootenge. */
  async fixSscBrokenStubs() {
    try {
      if (await Store.getMeta('sscStubFixed', 0)) return;
      let n = 0;
      await DB.cursor('questions', null, q => {
        if (q.exam === 'ssc-chsl' && String(q.questionText || '').trim().length < 5) {
          DB.delete('questions', q.id).catch(() => {}); n++;
        }
      });
      await Store.setMeta('sscStubFixed', 1);
      if (n) console.log('SSC broken stub questions removed:', n);
    } catch (e) { /* best-effort */ }
  },

  /* v1.4.51 one-time migration: purane SSC series mocks 85 min (51s/q bug)
     ke saath bane the — ab official 60 min. Attempt history untouched. */
  async fixSscMockDurations() {
    try {
      if (await Store.getMeta('sscDurFixed', 0)) return;
      const tests = await DB.getAll('tests');
      let n = 0;
      for (const t of tests) {
        if (t && t.exam === 'ssc-chsl' && t.duration === 100 * 51) {
          t.duration = 60 * 60;
          await DB.put('tests', t);
          n++;
        }
      }
      await Store.setMeta('sscDurFixed', 1);
      if (n) AVUtil.toast(n + ' SSC mock timer 85 → 60 min fix ho gaya ✓', 'success');
    } catch (e) { /* best-effort */ }
  },

  /* v1.4.46: exam switch — bank seed + dashboard re-render + pakka isolation */
  async switchExam(v) {
    if (typeof EXAM_CONFIGS === 'undefined' || !EXAM_CONFIGS[v]) return;
    /* v1.4.54: same exam ka switch already chal raha hai (slow seed ke beech
       dobara switch) to duplicate seed+buildSeries race hota tha — coalesce */
    if (this._switching === v) return;
    this._switching = v;
    try {
    const startHash = location.hash || '';   /* v1.4.50 race-guard */
    try {
      const saved = (await Store.getSetting('config', null)) || {};
      saved.exam = v;
      await Store.setSetting('config', saved);
    } catch (e) {}
    this.configCache = null;
    try { await this.config(); } catch (e) { this.configCache = EXAM_CONFIG; }
    try {
      const exam = (this.configCache && this.configCache.exam) || 'airforce';
      const seeded = (await Store.getMeta('seeded_' + exam, false)) ||
        (exam === 'airforce' ? await Store.getMeta('seeded', false) : false);
      if (!seeded) {
        document.getElementById('app').innerHTML =
          `<div class="page"><div class="seed-box"><img class="seed-logo" src="icons/icon-192.png" alt="Kineora Exam logo"><div class="seed-spin"></div>
           <h3>Preparing ${AVUtil.esc((EXAM_LABELS[exam] || exam))} question bank…</h3>
           <p>Purane saal ke papers load ho rahe hain. Ye ek hi baar hoga.</p></div></div>`;
        await Bank.seedIfNeeded(false, exam);
      } else {
        const r = await Bank.syncBundled(exam);
        if (r && r.synced && r.imported > 0 && typeof Generator !== 'undefined') {
          try {
            const sr = await Generator.buildSeries({ fullMocks: 5, perSubject: 2 });
            if (sr && sr.made) AVUtil.toast(sr.made + ' naye tests ban gaye 🎉', 'success');
          } catch (e) {}
        }
        try { await Bank.healSeries(exam); } catch (e) {}   // v1.4.69 self-heal
      }
    } catch (e) { console.error('exam-switch seed', e); }
    /* v1.4.50 race-guard: seed/sync slow hone par ye LATE chal jata tha —
       agar user/test beech me kahin aur navigate kar chuka hai (startHash se
       alag) to usay dashboard pe MAT kheencho. Sirf tab jao jab wahi ho jahan
       switch shuru hua tha, ya dashboard-target wala default case ho. */
    /* v1.4.54: nowHash ko bhi respect karo — user slow seed ke dauran kisi
       OPEN route (attempt/exam/test) pe chala gaya hai to use dashboard pe
       MAT kheencho (v1.4.50 guard startHash-dashboard case me force karta tha). */
    const nowHash = location.hash || '';
    const stillDefault = nowHash === '' || nowHash === '#' || nowHash === '#/' || nowHash.indexOf('#/dashboard') === 0;
    if (nowHash === startHash || (startHash.indexOf('#/dashboard') === 0 && stillDefault)) {
      if (nowHash.indexOf('#/dashboard') !== 0) location.hash = '#/dashboard';
      else window.dispatchEvent(new Event('hashchange'));
    }
    AVUtil.toast((EXAM_LABELS[v] || v) + ' active — data & analysis bilkul alag ✅', 'success');
    } finally { this._switching = null; }
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
      const bootExam = (this.configCache && this.configCache.exam) || 'airforce';
      const needSeed = !(await Store.getMeta('seeded_' + bootExam, false)) &&
        !(bootExam === 'airforce' && await Store.getMeta('seeded', false));
      if (needSeed) {
        document.getElementById('app').innerHTML =
          `<div class="page"><div class="seed-box"><img class="seed-logo" src="icons/icon-192.png" alt="Kineora Exam logo"><div class="seed-spin"></div>
           <h3>Preparing your question bank…</h3>
           <p>Loading previous-year questions into local storage. This happens only once.</p></div></div>`;
        await Bank.seedIfNeeded(false, bootExam);
      }
    } catch (e) { console.error('seed failed', e); }

    // bundled bank auto-sync: data files changed (new questions) → import the
    // delta + auto-build new tests from it. User never builds tests by hand.
    try {
      const r = await Bank.syncBundled((this.configCache && this.configCache.exam) || 'airforce');
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

    // v1.4.69 SERIES SELF-HEAL — har boot: har subject ka kam-se-kam 1 subject
    // test (missing ho to unused bank se banao, warna unattempted series
    // rebalance). v1.4.62-era adhoori libraries apne aap theek ho jati hain.
    try {
      const h = await Bank.healSeries((this.configCache && this.configCache.exam) || 'airforce');
      if (h && h.healed) AVUtil.toast((h.dropped ? 'Series rebalance: ' : '') + h.healed + ' tests auto-created 🎉', 'success');
    } catch (e) { /* heal is a bonus — never block boot */ }

    // v1.4.51: purane SSC mocks ka 85-min timer bug fix (one-time)
    try { await this.fixSscMockDurations(); } catch (e) { /* best-effort */ }
    // v1.4.54: SSC bank v1 ka broken stub question cleanup (one-time)
    try { await this.fixSscBrokenStubs(); } catch (e) { /* best-effort */ }
    // v1.4.55: real 4-subject bank ke saath SSC series rebuild (one-time)
    try { await this.rebuildSscSeriesBankV2(); } catch (e) { /* best-effort */ }

    // upgrade path: existing installs get the ready-made test series too
    try {
      /* v1.4.54: exam-aware flag — boot+seed dono paths same per-exam flag
         dekhte hain (SSC/airforce series alag, duplicate build kabhi nahi) */
      const bExam = (this.configCache && this.configCache.exam) || 'airforce';
      const bFlag = bExam === 'airforce' ? 'seriesBuilt' : ('seriesBuilt_' + bExam);
      if (!(await Store.getMeta(bFlag, null))) {
        const r = await Generator.buildSeries({ fullMocks: 15, perSubject: 5 });
        await Store.setMeta(bFlag, { at: Date.now(), made: r.made, bankV: 2 });
        if (bExam === 'airforce') await Store.setMeta('seriesBuilt', { at: Date.now(), made: r.made });
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
        this.switchExam(v);
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
    const curExam = (this.configCache && this.configCache.exam) || 'airforce';
    (attemptIndex || []).forEach(a => {
      if (a.abandoned) return;
      if ((a.exam || 'airforce') !== curExam) return;   // v1.4.46: exam isolation
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
            <option value="airforce" ${(this.configCache && this.configCache.exam) !== 'ssc-chsl' ? 'selected' : ''}>Agniveer Vayu ✈️</option>
            <option value="ssc-chsl" ${(this.configCache && this.configCache.exam) === 'ssc-chsl' ? 'selected' : ''}>SSC CHSL 🧾</option>
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
  /* v1.4.44: cbt/exam screens site-nav khud clear karte hain —
     #app-nav/#app-bottom me purana nav kabhi nahi chipkega */
  clearNav() {
    const nv = document.getElementById('app-nav'); if (nv) nv.innerHTML = '';
    const bt = document.getElementById('app-bottom'); if (bt) bt.innerHTML = '';
  },

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
