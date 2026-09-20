/* ============================================================
 * VIEW: ⚔️ LIVE BATTLE — REAL EXAM, LIVE GROUP ME
 * Wahi CBT exam experience (palette, sections, timer, +1/−0.25
 * marking, real Airforce bank questions) — bas LIVE: sab log
 * SAME test ek saath dete hain, fixed time par start.
 * ALAG FEATURE: Engine/attempts/tests ko bilkul nahi chhueda —
 * apna exam-look UI (same CSS classes), apna server sync.
 * ============================================================ */

window.BT = (function () {
  const SUBJ_LABEL = { physics: 'Physics', mathematics: 'Maths', english: 'English', raga: 'RAGA', mixed: 'Mixed' };
  const SUBJ_ORDER = ['physics', 'mathematics', 'english', 'raga'];
  let GEN = 0;                                   // render generation — purane loops mar jaate hain
  const room = { code: null, offset: 0, S: null, qs: null, sections: null, sel: {}, marked: {}, visited: {}, cur: 0, result: null, submitted: false, lang: 'en', lastPaint: '' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nowAdj = () => Date.now() + room.offset;  // server clock
  const esc = s => AVUtil.esc(String(s == null ? '' : s));
  function shareLink(code) { return location.href.split('#')[0] + '#/battle/' + code; }
  function fmtT(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }
  function fmt(ms) { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }
  async function playerName() {
    try { const cfg = await App.config(); return { name: (cfg.candidateName || 'Player').slice(0, 40), photo: cfg.profileImage || null }; }
    catch (e) { return { name: 'Player', photo: null }; }
  }
  function qState(i) {   // palette state (real exam jaisa)
    const ans = room.sel[i] != null, mk = !!room.marked[i];
    if (ans && mk) return 'ansmarked'; if (mk) return 'marked';
    if (ans) return 'answered'; return room.visited[i] ? 'notanswered' : 'notvisited';
  }
  function secOfIdx(i) {
    for (const sid of Object.keys(room.sections)) if (room.sections[sid].includes(i)) return sid;
    return Object.keys(room.sections)[0] || 'general';
  }
  function globalNum(i) { return i + 1; }   // continuous numbering (sections across)

  /* ══════════════ HOME: create + join ══════════════ */
  Views.battle = async function () {
    document.body.classList.remove('exam-on', 'cbt-on');   // battle exam se wapas aaye ho to
    const u = Cloud.user;
    const hist = (await Store.getMeta('battleHistory', [])).slice(-5).reverse();
    App.page('page page-battle', `
      <div class="bt-home" id="bt-home">
        <div class="bt-hero">
          <div class="bt-hero-t">⚔️</div>
          <div>
            <h2>LIVE BATTLE — REAL EXAM, GROUP ME</h2>
            <p>Bilkul asli CBT test jaisa — <b>wahi questions, wahi palette, wahi timer</b> — bas doston ke saath LIVE. Sab ek saath start, end me pata chale kaun asli topper hai. 🏆</p>
          </div>
        </div>
        ${!u ? `
        <div class="bt-signin card">
          <b>📡 Battle ke liye Google sign-in zaroori hai</b>
          <p>Taaki sabki pehchaan aur score server par sahi record ho.</p>
          <button class="btn btn-primary" onclick="Cloud.signIn()">🔑 Sign in with Google</button>
        </div>` : ''}
        <div class="bt-grid2">
          <div class="card bt-create">
            <h3>🗡️ Battle Banao <span class="bt-hint">(Host)</span></h3>
            <label>Battle ka naam</label>
            <input id="bt-name" maxlength="40" value="Agniveer Live Test" autocomplete="off">
            <label>Subject <span class="bt-hint">(real Airforce questions — bank se)</span></label>
            <select id="bt-subject">
              <option value="mixed">🎯 Full Mock (sab subjects — real paper ratio)</option>
              <option value="physics">Physics</option>
              <option value="mathematics">Maths</option>
              <option value="english">English</option>
              <option value="raga">RAGA</option>
            </select>
            <div class="bt-row2">
              <div><label>Sawaal</label>
                <select id="bt-count"><option>10</option><option>25</option><option selected>50</option><option>70</option><option>100</option></select></div>
              <div><label>Duration</label>
                <select id="bt-dur"><option value="600000">10 min</option><option value="1200000" selected>20 min</option><option value="2700000">45 min</option><option value="3600000">60 min</option><option value="5100000">85 min</option></select></div>
            </div>
            <label>Kab start ho? <span class="bt-hint">(sabko aane ka time milega)</span></label>
            <select id="bt-when">
              <option value="2">2 minute baad</option>
              <option value="5" selected>5 minute baad</option>
              <option value="10">10 minute baad</option>
              <option value="30">30 minute baad</option>
            </select>
            <button class="btn btn-primary bt-big" onclick="BT.create()" ${!u ? 'disabled title="Pehle sign in karo"' : ''}>⚔️ Battle Banao</button>
          </div>
          <div class="card bt-joinc">
            <h3>🚪 Battle Me Jao</h3>
            <p>Dost ne link bheja hai? Link kholo — ya code yahan daalo:</p>
            <div class="bt-joinrow">
              <input id="bt-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" style="text-transform:uppercase" onkeydown="if(event.key==='Enter')BT.joinGo()">
              <button class="btn btn-primary" onclick="BT.joinGo()" ${!u ? 'disabled' : ''}>Join →</button>
            </div>
            ${hist.length ? `<label style="margin-top:14px">🕘 Pichhli battles</label>
              <div class="bt-hist">${hist.map(h => `
                <a href="#/battle/${esc(h.code)}" class="bt-hrow">
                  <span class="bt-hmedal">${h.myRank === 1 ? '🥇' : h.myRank === 2 ? '🥈' : h.myRank === 3 ? '🥉' : '#' + h.myRank}</span>
                  <span class="bt-hname">${esc(h.name)}</span>
                  <span class="bt-hscore">${h.myScore} marks · ${new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </a>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="card bt-rules">
          <h3>📜 Battle Rules — bilkul real exam jaisa</h3>
          <div class="bt-rules-g">
            <div>⏱️ <b>Fixed time par sab ek saath start</b> — jo late aaya, uska time kam (koi rukwat nahi)</div>
            <div>📝 <b>Same test sabko</b> — same questions, same order, real Airforce PYQ bank se</div>
            <div>🖥️ <b>Wahi CBT interface</b> — palette, sections, mark for review, clear response</div>
            <div>➕ <b>Real marking</b> — correct +1 · wrong −0.25 · unattempted 0</div>
            <div>🔴 <b>LIVE panel</b> — kaun kitne sawaal kar chuka, kaun submit kar gaya (answers nahi dikhte!)</div>
            <div>📊 <b>End me full analysis</b> — score comparison + kisne kya select kiya, question-by-question</div>
          </div>
        </div>
      </div>`);
  };

  /* ---------------- create ---------------- */
  async function create() {
    if (!Cloud.user) { AVUtil.toast('Pehle Google sign-in karo', 'error'); return; }
    const btn = document.querySelector('#bt-home .bt-big');
    const subject = document.getElementById('bt-subject').value;
    const count = +document.getElementById('bt-count').value;
    const durationMs = +document.getElementById('bt-dur').value;
    const whenMin = +document.getElementById('bt-when').value;
    const name = (document.getElementById('bt-name').value || 'Agniveer Live Test').trim().slice(0, 60);
    try {
      if (btn) { btn.disabled = true; btn.textContent = '🎲 Real questions chun rahe hain…'; }
      const subs = subject === 'mixed' ? SUBJ_ORDER : [subject];
      const pools = await Promise.all(subs.map(s => Generator.poolFor({ subjectId: s })));
      let pool = pools.flat();
      if (subject === 'mixed') {   // real paper ratio: P25 M25 E20 R30 → count me same proportion
        const RATIO = { physics: 25, mathematics: 25, english: 20, raga: 30 };
        const totalR = 100, sel = [];
        for (const s of SUBJ_ORDER) {
          const take = Math.round(count * RATIO[s] / totalR);
          for (let i = pools[SUBJ_ORDER.indexOf(s)].length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pools[SUBJ_ORDER.indexOf(s)][i], pools[SUBJ_ORDER.indexOf(s)][j]] = [pools[SUBJ_ORDER.indexOf(s)][j], pools[SUBJ_ORDER.indexOf(s)][i]]; }
          sel.push(...pools[SUBJ_ORDER.indexOf(s)].slice(0, take));
        }
        pool = sel;
      } else {
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
      }
      if (pool.length < Math.min(count, 5)) throw new Error('Bank me kaafi questions nahi mile');
      pool = pool.slice(0, count);
      // sections real order me: physics→maths→english→raga
      pool.sort((a, b) => SUBJ_ORDER.indexOf(a.subject) - SUBJ_ORDER.indexOf(b.subject));
      const qs = pool.map(q => ({
        id: q.id, subject: q.subject, text: q.questionText, hi: q.questionTextHi || null,
        options: q.options.map(o => ({ id: o.id, text: o.text, hi: o.textHi || null })),
        correctId: q.correctAnswer
      }));
      const me = await playerName();
      if (btn) btn.textContent = '📡 Room ban rahi hai…';
      const r = await Cloud.authed('/v1/battle/create', {
        name, subject, startsAt: Date.now() + whenMin * 60000, durationMs, questions: qs, playerName: me.name, photo: me.photo
      });
      location.hash = '#/battle/' + r.code;
    } catch (e) {
      AVUtil.toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '⚔️ Battle Banao'; }
    }
  }

  function joinGo() {
    const code = (document.getElementById('bt-code').value || '').toUpperCase().trim();
    if (!/^[A-Z2-9]{6}$/.test(code)) { AVUtil.toast('6-ka code daalo (jo host ne bheja)', 'error'); return; }
    location.hash = '#/battle/' + code;
  }

  /* ══════════════ ROOM: lobby → LIVE EXAM → result ══════════════ */
  Views.battleRoom = async function (code) {
    code = String(code || '').toUpperCase().trim();
    const gen = ++GEN;
    Object.assign(room, { code, S: null, qs: null, sections: null, sel: {}, marked: {}, visited: {}, cur: 0, result: null, submitted: false, lang: 'en', lastPaint: '' });
    App.page('page page-battle', `<div id="bt-room"><div class="seed-spin" style="margin:60px auto"></div><p style="text-align:center">📡 Room dhoond rahe hain…</p></div>`);

    if (!Cloud.user) {
      paintErr('🗡️ Battle ke liye pehle Google sign-in karo — phir ye page dobara kholo.<br><br><button class="btn btn-primary" onclick="Cloud.signIn()">🔑 Sign in with Google</button>');
      return;
    }
    try {
      const me = await playerName();
      await Cloud.authed('/v1/battle/join', { code, playerName: me.name, photo: me.photo });
    } catch (e) { /* done/invalid — state poll asli sach batayega */ }

    let uiTimer = setInterval(() => { if (gen === GEN) uiTick(); }, 300);
    let questionsFetched = false;
    while (gen === GEN && room.code === code && Router.path === '/battle/' + code) {
      let S;
      try { S = await Cloud.authed('/v1/battle/state', { code }); }
      catch (e) { S = null; room.err = e.message; }
      if (gen !== GEN) break;
      if (!S) { paintErr(esc(room.err) + '<br><button class="btn" onclick="location.hash=\'#/battle\'">← Wapas</button>'); break; }
      room.err = null; room.S = S; room.offset = S.now - Date.now();
      // live exam shuru? → questions ek baar lo (correctId server par hi rehta hai)
      if (S.room.status === 'live' && !questionsFetched && !room.submitted) {
        try {
          const Q = await Cloud.authed('/v1/battle/questions', { code });
          if (Q && Q.ok) { room.qs = Q.questions; room.sections = Q.sections || { general: Q.questions.map((_, i) => i) }; questionsFetched = true; }
        } catch (e) { /* agli poll retry */ }
      }
      if (S.room.status === 'done' && !room.result) {
        await loadResult(code);
        if (!room.submitted) { room.submitted = true; document.body.classList.remove('exam-on', 'cbt-on'); }
      }
      paint(S);
      if (S.room.status === 'done') break;
      await sleep(S.room.status === 'live' ? 3000 : 3000);
    }
    clearInterval(uiTimer);
    document.body.classList.remove('exam-on', 'cbt-on');   // exam chrome hatao
  };

  async function loadResult(code) {
    try {
      const R = await Cloud.authed('/v1/battle/result', { code });
      if (R && R.ok) room.result = R;
    } catch (e) { /* next poll retry */ }
    try {
      if (room.result) {
        const R = room.result, myUid = Cloud.user && Cloud.user.uid;
        const myIdx = R.players.findIndex(p => p.uid === myUid);
        if (myIdx >= 0) {
          const hist = await Store.getMeta('battleHistory', []);
          if (!hist.some(h => h.code === R.room.code)) {
            hist.push({ code: R.room.code, name: R.room.name, date: Date.now(), myRank: myIdx + 1, myScore: R.players[myIdx].score, players: R.players.length });
            await Store.setMeta('battleHistory', hist.slice(-20));
          }
        }
      }
    } catch (e) { /* bonus */ }
  }

  /* ---------------- painting ---------------- */
  function paintErr(html) {
    const el = document.getElementById('bt-room');
    if (el) el.innerHTML = `<div class="card bt-errbox">${html}</div>`;
  }

  function paint(S) {
    const key = JSON.stringify([S.room.status, room.cur, Object.keys(room.sel).length, Object.keys(room.marked).length, room.lang, !!room.result,
    S.players.map(p => [p.uid, p.attempted, p.done])]);
    if (key === room.lastPaint) return;
    room.lastPaint = key;
    const el = document.getElementById('bt-room');
    if (!el) return;
    if (S.room.status === 'lobby') el.innerHTML = paintLobby(S);
    else if (S.room.status === 'live') el.innerHTML = paintExam(S);
    else el.innerHTML = paintResult(S);
  }

  /* ---------- LOBBY ---------- */
  function paintLobby(S) {
    const myUid = Cloud.user && Cloud.user.uid;
    const isHost = S.room.host === myUid;
    const link = shareLink(S.room.code);
    return `
      <div class="bt-lobby">
        <div class="card bt-head">
          <div class="bt-headrow">
            <div>
              <div class="bt-hname">⚔️ ${esc(S.room.name)} <span class="badge">${esc(SUBJ_LABEL[S.room.subject] || S.room.subject)}</span></div>
              <div class="bt-hsub">${S.room.total} sawaal · ${Math.round(S.room.durationMs / 60000)} min · real CBT exam · marking +1 / −0.25</div>
            </div>
            <a class="btn" href="#/battle">✕</a>
          </div>
        </div>
        <div class="card bt-share">
          <label>Doston ko ye link bhejo (WhatsApp par):</label>
          <div class="bt-linkrow"><input readonly value="${esc(link)}" id="bt-link" onclick="this.select()"></div>
          <div class="bt-btnrow">
            <button class="btn" onclick="BT.copyLink()">📋 Copy Link</button>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('⚔️ Agniveer LIVE Battle: ' + S.room.name + '\n' + S.room.total + ' questions · ' + Math.round(S.room.durationMs / 60000) + ' min · REAL exam, sab ek saath!\nCode: ' + S.room.code + '\nJoin karo: ' + link)}">📲 WhatsApp</a>
          </div>
          <div class="bt-codebig">ya ye code bolo: <b>${esc(S.room.code)}</b></div>
        </div>
        <div class="card bt-countcard">
          <label>Exam start hone me:</label>
          <div class="bt-count" id="bt-count">${fmt(S.room.startsAt - nowAdj())}</div>
          <div class="bt-hint">⏰ ${new Date(S.room.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — sab EK SAATH start honge, same test, same questions!</div>
          ${isHost ? '<button class="btn btn-primary bt-big" onclick="BT.startNow()">⏩ Abhi Start Karo (10s)</button>' : '<div class="bt-hint">Host start karega — ready reho! 🫡</div>'}
        </div>
        ${playersPanel(S, true)}
      </div>`;
  }

  function playersPanel(S, lobby) {
    const myUid = Cloud.user && Cloud.user.uid;
    const list = S.players.slice();
    return `<div class="bt-players card">
      <h3>🔴 LIVE <span class="bt-hint">${list.length} candidates</span></h3>
      ${list.map((p, i) => `
        <div class="bt-pl ${p.uid === myUid ? 'me' : ''}">
          <span class="bt-pl-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</span>
          <span class="bt-pl-name">${esc(p.name)}${p.uid === S.room.host ? ' 👑' : ''}</span>
          ${lobby ? '' : (p.done
            ? '<span class="bt-pl-sub">✅ submitted</span>'
            : `<span class="bt-pl-sub">${p.attempted || 0}/${S.room.total} done</span>`)}
        </div>`).join('')}
      ${lobby ? '' : '<div class="bt-hint" style="margin-top:8px">dusron ke answers nahi dikhte — end me full analysis milega 😉</div>'}
    </div>`;
  }

  /* ---------- LIVE EXAM — REAL CBT UI (same classes as exam.js) ---------- */
  function paintExam(S) {
    document.body.classList.add('exam-on', 'cbt-on');
    if (!room.qs) return `<div class="bt-examwrap"><div class="card"><div class="seed-spin" style="margin:50px auto"></div><p style="text-align:center">Exam load ho raha hai…</p></div></div>`;
    if (room.submitted || S.you && S.you.done) {   // submit ho gaya — result ka wait
      return `<div class="bt-done"><div class="card bt-podium-c"><div class="seed-spin" style="margin:40px auto"></div>
        <h2>✅ Submit ho gaya!</h2><p> baaki candidates ka wait… jaise hi sab submit karenge (ya time khatam hoga), result + full comparison dikhega.</p></div></div>`;
    }
    const i = room.cur, q = room.qs[i];
    const sid = secOfIdx(i);
    const secIdxs = room.sections[sid] || [i];
    const left = S.room.endsAt - nowAdj();
    const warn = left < 5 * 60000 ? ' warn' : '';
    const candPhoto = App.configCache?.profileImage
      ? `<img src="${esc(App.configCache.profileImage)}" alt="">`
      : esc(((App.configCache?.candidateName) || 'P').trim()[0] || 'P').toUpperCase();
    const sel = room.sel[i];

    const optionsHtml = (q.options || []).map((o, oi) => {
      const letter = String.fromCharCode(65 + oi);
      const oText = (room.lang === 'hi' && o.hi) ? o.hi : o.text;
      return `<label class="opt ${sel === o.id ? 'selected' : ''}" data-opt="${esc(o.id)}">
        <input type="radio" name="opt" value="${esc(o.id)}" ${sel === o.id ? 'checked' : ''} aria-label="Option ${letter}">
        <span class="opt-radio" aria-hidden="true"></span>
        <span class="opt-letter">${letter}</span>
        <span class="opt-text">${AVUtil.qtext(oText)}</span>
      </label>`;
    }).join('');

    const paletteBtns = secIdxs.map(gi => {
      const st = qState(gi);
      return `<button class="qbtn ${st} ${gi === i ? 'current' : ''}" data-i="${gi}" aria-label="Question ${globalNum(gi)}" title="Question ${globalNum(gi)}">${globalNum(gi)}</button>`;
    }).join('');

    const summary = (() => {
      let an = 0, na = 0, mk = 0, am = 0, tot = room.qs.length;
      for (let k = 0; k < tot; k++) {
        const st = qState(k);
        if (st === 'answered') an++; else if (st === 'notanswered') na++;
        else if (st === 'marked') mk++; else if (st === 'ansmarked') am++;
      }
      return { an, na, mk, am, tot };
    })();

    const sectionTabs = Object.keys(room.sections).map(s => `
      <button class="subtab ${s === sid ? 'active' : ''}" data-sid="${esc(s)}" role="tab">${esc(SUBJ_LABEL[s] || s)}</button>`).join('');

    return `
    <div class="cbt exam-screen bt-examwrap" data-view="question">
      <header class="exam-header">
        <button class="palette-toggle" id="bt-drawer" aria-label="Question palette">☰</button>
        <img class="eh-logo" src="icons/icon-96.png" alt="Kineora Exam logo">
        <div class="eh-name">
          <div class="eh-exam">⚔️ LIVE BATTLE <span class="eh-online">GROUP EXAMINATION</span></div>
          <div class="eh-test small muted">${esc(S.room.name)} · code ${esc(S.room.code)} · ${esc(SUBJ_LABEL[S.room.subject] || '')}</div>
        </div>
        <div class="eh-right">
          <div class="bt-livepill" title="Live candidates">🔴 ${S.players.filter(p => !p.done).length}/${S.players.length}</div>
          <div class="timer${warn}" id="bt-timer" role="timer">
            <span class="timer-lbl">Time Left</span>
            <span class="timer-val" id="bt-timer-val">${fmtT(left)}</span>
          </div>
          <button class="xbtn xbtn-submit" id="bt-submit">SUBMIT TEST</button>
        </div>
      </header>
      <div class="subtabs" role="tablist">${sectionTabs}</div>
      <div class="exam-main">
        <div class="exam-question-area">
          <div class="q-scroll" id="bt-qscroll">
            <div class="q-head">
              <div class="q-no">
                Question ${globalNum(i)}<span class="q-of"> / ${room.qs.length}</span>
                <span class="q-marks" title="Marking scheme — real exam jaisa">Marks +1 · −0.25</span>
              </div>
              <div class="q-viewin">
                <label class="small muted" for="bt-lang">View in:</label>
                <select id="bt-lang" aria-label="View question in">
                  <option value="en" ${room.lang !== 'hi' ? 'selected' : ''}>English</option>
                  <option value="hi" ${room.lang === 'hi' ? 'selected' : ''} ${q.hi ? '' : 'disabled'}>हिन्दी</option>
                </select>
              </div>
            </div>
            <div class="q-text">${AVUtil.qtext(room.lang === 'hi' && q.hi ? q.hi : q.text)}</div>
            <div class="opts" role="radiogroup" aria-label="Answer options">${optionsHtml}</div>
          </div>
          <div class="exam-bottom">
            <button class="xbtn xbtn-prev" id="bt-prev" ${i === 0 ? 'disabled' : ''}>◀ Previous</button>
            <button class="xbtn xbtn-clear" id="bt-clear">Clear Response</button>
            <button class="xbtn xbtn-mark" id="bt-mark">Mark for Review &amp; Next</button>
            <span class="eb-spring" aria-hidden="true"></span>
            <button class="xbtn xbtn-save" id="bt-save">Save &amp; Next →</button>
          </div>
        </div>
        <aside class="palette-panel" id="bt-palette">
          <button class="pal-close" id="bt-palclose" aria-label="Close palette">✕</button>
          <div class="cand-panel">
            <div class="nav-avatar cand-photo">${candPhoto}</div>
            <div class="cand-info">
              <div class="cand-name">${esc(App.configCache?.candidateName || 'Candidate')}</div>
              <div class="cand-sub muted small">⚔️ LIVE BATTLE · ${esc(S.room.code)}</div>
            </div>
          </div>
          <div class="legend">
            <div class="legend-title">Legend:</div>
            <div class="legend-row"><button class="qbtn answered" tabindex="-1" aria-hidden="true">5</button> <span>Answered<span class="lg-count">${summary.an}</span></span></div>
            <div class="legend-row"><button class="qbtn notanswered" tabindex="-1" aria-hidden="true">6</button> <span>Not Answered<span class="lg-count">${summary.na}</span></span></div>
            <div class="legend-row"><button class="qbtn notvisited" tabindex="-1" aria-hidden="true">7</button> <span>Not Visited<span class="lg-count">${Math.max(0, summary.tot - summary.an - summary.na - summary.mk - summary.am)}</span></span></div>
            <div class="legend-row"><button class="qbtn marked" tabindex="-1" aria-hidden="true">8</button> <span>Marked for Review<span class="lg-count">${summary.mk}</span></span></div>
            <div class="legend-row"><button class="qbtn ansmarked" tabindex="-1" aria-hidden="true">9</button> <span>Answered &amp; Marked <em class="small muted">(will be evaluated)</em><span class="lg-count">${summary.am}</span></span></div>
          </div>
          <div class="palette-head">${esc(SUBJ_LABEL[sid] || sid)} <span class="muted small">· ${secIdxs.length}</span></div>
          <div class="palette-grid">${paletteBtns}</div>
          <div class="bt-livepanel">${playersExamRow(S)}</div>
        </aside>
      </div>
    </div>
    <div class="drawer-veil" id="bt-veil" hidden></div>
    <div class="bt-submodal" id="bt-submodal" hidden>
      <div class="bt-subbox">
        <h3>Submit karna hai?</h3>
        <table class="se-tbl">
          <tr><td>Answered</td><td><b>${summary.an}</b> / ${summary.tot}</td></tr>
          <tr><td>Not Answered</td><td><b>${summary.na + Math.max(0, summary.tot - summary.an - summary.na - summary.mk - summary.am)}</b> / ${summary.tot}</td></tr>
          <tr><td>Marked for Review</td><td><b>${summary.mk + summary.am}</b></td></tr>
          <tr><td>Time Left</td><td><b id="bt-sub-time">${fmtT(left)}</b></td></tr>
        </table>
        <p class="se-warn">⚠️ Submit ke baad answers change NAHI honge. Result turant nahi dikhega — jab sab submit karenge ya time khatam hoga, tab full comparison milega.</p>
        <div class="se-actions">
          <button class="xbtn xbtn-plain" id="bt-subno">← Wapas Exam Me</button>
          <button class="xbtn xbtn-submit" id="bt-subyes">YES, SUBMIT</button>
        </div>
      </div>
    </div>`;
  }

  function playersExamRow(S) {
    const myUid = Cloud.user && Cloud.user.uid;
    return `<div class="bt-lp-title">🔴 LIVE (${S.players.length})</div>` + S.players.map(p => `
      <div class="bt-pl ${p.uid === myUid ? 'me' : ''}">
        <span class="bt-pl-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</span>
        <span class="bt-pl-name">${esc(p.name)}</span>
        ${p.done ? '<span class="bt-pl-sub">✅ done</span>' : `<span class="bt-pl-sub">${p.attempted || 0}/${S.room.total}</span>`}
      </div>`).join('');
  }

  /* ---------- RESULT: podium + comparison + kisne kya chuna ---------- */
  function paintResult(S) {
    const R = room.result;
    if (!R) return `<div class="card"><div class="seed-spin" style="margin:50px auto"></div><p style="text-align:center">🏁 Result nikal rahe hain…</p></div>`;
    const myUid = Cloud.user && Cloud.user.uid;
    const medals = ['🥇', '🥈', '🥉'];
    const names = {}; R.players.forEach(p => names[p.uid] = p.name);
    const total = R.room.total;
    const myIdx = R.players.findIndex(p => p.uid === myUid);
    return `
      <div class="bt-done">
        <div class="card bt-podium-c">
          <h2>🏁 ${esc(R.room.name)} — FINAL RESULT</h2>
          <div class="bt-hint">real marking: +1 correct · −0.25 wrong · ${total} questions</div>
          <div class="bt-podium">
            ${R.players.slice(0, 3).map((p, i) => `
              <div class="bt-pod bt-p${i + 1} ${p.uid === myUid ? 'me' : ''}">
                <div class="bt-pod-med">${medals[i]}</div>
                <div class="bt-pod-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</div>
                <div class="bt-pod-name">${esc(p.name)}</div>
                <div class="bt-pod-score">${p.score}<i>marks</i></div>
              </div>`).join('') || '—'}
          </div>
          ${myIdx >= 0 ? `<div class="bt-myplace">${myIdx === 0 ? '🏆 TUM TOPPER HO! Real exam me bhi aisa hi karna!' : 'Tumhara rank: <b>#' + (myIdx + 1) + '</b> of ' + R.players.length + ' — agli baar pakka! 💪'}</div>` : ''}
        </div>
        <div class="card">
          <h3>📊 Score Comparison</h3>
          <div class="tablewrap"><table class="bt-table">
            <thead><tr><th>#</th><th>Candidate</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Left</th><th>Accuracy</th></tr></thead>
            <tbody>${R.players.map((p, i) => `
              <tr class="${p.uid === myUid ? 'me' : ''}"><td>${medals[i] || i + 1}</td><td>${esc(p.name)}</td>
              <td><b>${p.score}</b></td><td>${p.correct}</td><td>${p.wrong}</td><td>${p.unattempted}</td>
              <td>${p.attempted ? Math.round(100 * p.correct / p.attempted) : 0}%</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h3>🔍 Kisne Kya Select Kiya <span class="bt-hint">(question-by-question)</span></h3>
          <div class="bt-mxwrap"><table class="bt-matrix">
            <thead><tr><th></th>${Array.from({ length: total }, (_, i) => `<th title="${esc((R.questions[i] || {}).text || '').slice(0, 120)}">${i + 1}</th>`).join('')}</tr></thead>
            <tbody>${R.players.map(p => `
              <tr class="${p.uid === myUid ? 'me' : ''}"><td class="bt-mxname">${esc(p.name.slice(0, 12))}</td>
              ${Array.from({ length: total }, (_, qi) => {
      const a = R.answers.find(x => x.uid === p.uid && x.q_no === qi);
      return `<td class="${a ? (a.correct ? 'g' : 'w') : 'n'}" title="${a ? (esc(names[a.uid] || '') + ' ne ' + esc(a.opt_id) + ' chuna — ' + (a.correct ? 'sahi ✓' : 'galat ✗ (−0.25)')) : 'not attempted'}">${a ? esc(a.opt_id) : '·'}</td>`;
    }).join('')}</tr>`).join('')}
            </tbody>
          </table></div>
          <div class="bt-hint">har cell = us candidate ne jo option chuna (A/B/C/D) — green = sahi (+1), red = galat (−0.25), · = chhoda</div>
        </div>
        <div class="bt-btnrow">
          <button class="btn btn-primary bt-big" onclick="location.hash='#/battle'">⚔️ Nayi Battle</button>
          <a class="btn" href="#/dashboard">🏠 Dashboard</a>
        </div>
      </div>`;
  }

  /* 300ms tick — timer + countdown (repaint sirf zarurat par) */
  function uiTick() {
    const S = room.S;
    if (!S) return;
    if (S.room.status === 'lobby') {
      const c = document.getElementById('bt-count');
      if (c) {
        const left = S.room.startsAt - nowAdj();
        c.textContent = fmt(left);
        if (left <= 0) { room.lastPaint = ''; paint(S); }
      }
    } else if (S.room.status === 'live') {
      const tv = document.getElementById('bt-timer-val');
      const left = S.room.endsAt - nowAdj();
      if (tv) {
        tv.textContent = fmtT(left);
        document.getElementById('bt-timer')?.classList.toggle('warn', left < 5 * 60000);
        const st = document.getElementById('bt-sub-time'); if (st) st.textContent = fmtT(left);
      }
      if (left <= 0 && !room.submitted) autoSubmit();   // time up — auto submit (real exam jaisa)
    }
  }

  async function autoSubmit() {
    if (room.submitted) return;
    room.submitted = true;
    try { await Cloud.authed('/v1/battle/submit', { code: room.code }); } catch (e) { }
    document.body.classList.remove('exam-on', 'cbt-on');
    room.lastPaint = ''; if (room.S) paint(room.S);
  }

  /* ---------------- exam actions (real CBT controls) ---------------- */
  async function pick(optId) {
    const i = room.cur;
    if (room.submitted || !room.S || room.S.room.status !== 'live') return;
    if (room.sel[i] !== optId) room.sel[i] = optId;   // real CBT: radio select (clear alag se)
    room.lastPaint = ''; paint(room.S);
    try { await Cloud.authed('/v1/battle/answer', { code: room.code, qNo: i, optId: room.sel[i] }); }
    catch (e) { AVUtil.toast('Answer save nahi hua — internet check karo', 'error'); }
  }

  function navTo(i) {
    if (!room.qs || i < 0 || i >= room.qs.length) return;
    room.visited[i] = true; room.cur = i;
    room.lastPaint = ''; if (room.S) paint(room.S);
    document.getElementById('bt-qscroll')?.scrollTo?.(0, 0);
  }

  function saveNext() { room.visited[room.cur] = true; navTo(room.cur + 1); }
  function prev() { navTo(room.cur - 1); }
  function clearResponse() {
    const i = room.cur;
    delete room.sel[i];
    room.lastPaint = ''; if (room.S) paint(room.S);
    Cloud.authed('/v1/battle/answer', { code: room.code, qNo: i, optId: null }).catch(() => { });
  }
  function markNext() {
    const i = room.cur; room.marked[i] = !room.marked[i]; room.visited[i] = true;
    navTo(Math.min(room.qs.length - 1, i + 1));
  }
  function gotoSection(sid) {
    const idxs = room.sections && room.sections[sid];
    if (idxs && idxs.length) navTo(idxs[0]);
  }
  function toggleLang(v) { room.lang = v; room.lastPaint = ''; if (room.S) paint(room.S); }

  function openDrawer() { document.getElementById('bt-palette')?.classList.add('open'); const v = document.getElementById('bt-veil'); if (v) v.hidden = false; }
  function closeDrawer() { document.getElementById('bt-palette')?.classList.remove('open'); const v = document.getElementById('bt-veil'); if (v) v.hidden = true; }

  function openSubmitModal() { const m = document.getElementById('bt-submodal'); if (m) m.hidden = false; }
  function closeSubmitModal() { const m = document.getElementById('bt-submodal'); if (m) m.hidden = true; }

  async function startNow() {
    try { await Cloud.authed('/v1/battle/start', { code: room.code }); AVUtil.toast('Exam shuru — 10 second me! Sab ready? 🚀', 'success'); }
    catch (e) { AVUtil.toast(e.message, 'error'); }
  }

  function copyLink() {
    const inp = document.getElementById('bt-link');
    if (inp) {
      inp.select();
      try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); }
      AVUtil.toast('Link copy ho gaya — doston ko bhej do! 📤', 'success');
    }
  }

  /* global click delegation — exam controls (battle ke apne, engine ko chhue bina) */
  document.addEventListener('click', function (ev) {
    if (!room.S || !Router.path.startsWith('/battle/')) return;
    const t = ev.target;
    const closest = s => t.closest ? t.closest(s) : null;
    if (closest('#bt-drawer')) return openDrawer();
    if (closest('#bt-palclose') || closest('#bt-veil')) return closeDrawer();
    if (closest('#bt-submit')) return openSubmitModal();
    if (closest('#bt-subno')) return closeSubmitModal();
    if (closest('#bt-subyes')) { closeSubmitModal(); return autoSubmit(); }
    if (closest('#bt-prev')) return prev();
    if (closest('#bt-save')) return saveNext();
    if (closest('#bt-clear')) return clearResponse();
    if (closest('#bt-mark')) return markNext();
    if (closest('#bt-startnow')) return startNow();
    const opt = closest('.bt-examwrap label.opt');
    if (opt) { ev.preventDefault(); return pick(opt.dataset.opt); }
    const qb = closest('.bt-examwrap .qbtn[data-i]');
    if (qb) { closeDrawer(); return navTo(+qb.dataset.i); }
    const tab = closest('.bt-examwrap .subtab[data-sid]');
    if (tab) return gotoSection(tab.dataset.sid);
  });
  document.addEventListener('change', function (ev) {
    if (!room.S || !Router.path.startsWith('/battle/')) return;
    if (ev.target && ev.target.id === 'bt-lang') toggleLang(ev.target.value);
  });

  return { create, joinGo, startNow, copyLink };
})();
