/* ============================================================
 * VIEW: ⚔️ LIVE BATTLE — REAL EXAM + LIVE GROUP
 * NAPELA APPROACH (v3): battle ek ASLI TEST OBJECT banata hai
 * (same schema, same bank) → asli instructions → asli CBT engine
 * (exam.js) → asli result/analysis. Sab rules, UI, features wahi.
 * Battle sirf 3 cheezein EXTRA deta hai:
 *   1. Live sync layer (answers server par, server-authoritative)
 *   2. Live players panel (kaun kitna kar raha hai)
 *   3. End me GROUP COMPARISON (podium + kisne kya select kiya)
 * Engine me sirf chhote guarded hooks hain (test.battle truthy).
 * ============================================================ */

window.BT = (function () {
  const SUBJ_LABEL = { physics: 'Physics', mathematics: 'Maths', english: 'English', raga: 'RAGA', mixed: 'Mixed' };
  const SUBJ_ORDER = ['physics', 'mathematics', 'english', 'raga'];
  let GEN = 0;
  const room = { code: null, S: null, offset: 0, result: null, lastPaint: '' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => AVUtil.esc(String(s == null ? '' : s));
  const shareLink = code => location.href.split('#')[0] + '#/battle/' + code;
  function fmt(ms) { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }
  async function playerName() {
    try { const cfg = await App.config(); return { name: (cfg.candidateName || 'Player').slice(0, 40), photo: cfg.profileImage || null }; }
    catch (e) { return { name: 'Player', photo: null }; }
  }
  const testIdOf = code => 'battle-' + code;

  /* ---------------- local (asli) test object ----------------
     plan = [{id, subject}] room-order me — engine-identical test */
  async function buildLocalTest(code, S) {
    const tid = testIdOf(code);
    const existing = await DB.get('tests', tid);
    if (existing) return existing;
    const plan = S.room.plan;
    if (!plan || !plan.length) return null;
    // bank me sab hone chahiye (host aur joiner same bundled bank se)
    const ids = plan.map(p => p.id);
    const rows = await DB.getMany('questions', ids);
    const missing = ids.filter((id, i) => !rows[i]);
    if (missing.length) { AVUtil.toast(missing.length + ' questions is device ke bank me nahi mile — app refresh karo (bank sync)', 'error'); return null; }
    // sections: subject-group (room order already P→M→E→R sorted hai)
    const secMap = new Map();
    for (const p of plan) {
      if (!secMap.has(p.subject)) secMap.set(p.subject, []);
      secMap.get(p.subject).push(p.id);
    }
    const sections = [...secMap.entries()].map(([sid, qids]) => ({
      subjectId: sid, name: SUBJ_LABEL[sid] || sid, questionIds: qids
    }));
    const total = ids.length;
    const test = {
      id: tid,
      name: S.room.name + ' ⚔️',
      exam: (App.configCache && App.configCache.exam) || 'airforce',
      type: 'battle', mode: 'exam',
      createdAt: Date.now(),
      duration: Math.round(S.room.durationMs / 1000),   // engine unit: seconds
      timerMode: 'global', sectionLock: false, sectionSubmitRequired: false, allowPause: false,
      shuffleQuestions: false, shuffleOptions: false, instantExplanation: false,
      marking: { correct: 1, wrong: -0.25, unattempted: 0 },
      strategy: 'random',
      sections, totalQuestions: total, maxScore: total,
      battle: { code, startsAt: S.room.startsAt, durationMs: S.room.durationMs }
    };
    await DB.put('tests', test);
    return test;
  }

  /* ══════════════ HOME: create + join ══════════════ */
  Views.battle = async function () {
    document.body.classList.remove('exam-on', 'cbt-on');
    const u = Cloud.user;
    const hist = (await Store.getMeta('battleHistory', [])).slice(-5).reverse();
    App.page('page page-battle', `
      <div class="bt-home" id="bt-home">
        <div class="bt-hero">
          <div class="bt-hero-t">⚔️</div>
          <div>
            <h2>LIVE BATTLE — REAL EXAM, GROUP ME</h2>
            <p>Bilkul asli CBT test — <b>wahi UI, wahi rules, wahi marking (+1/−0.25)</b>, real Airforce questions — bas <b>LIVE</b>: sab log SAME test ek saath dete hain, end me full comparison. 🏆</p>
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
          <h3>📜 Battle Rules — bilkul real exam, bas LIVE</h3>
          <div class="bt-rules-g">
            <div>📝 <b>Same test sabko</b> — same questions, same order, real Airforce PYQ bank se</div>
            <div>⏱️ <b>Fixed time par sab ek saath start</b> — instructions wahi, "I am ready" wahi</div>
            <div>🖥️ <b>Wahi CBT interface</b> — palette, sections, mark for review, clear, submit modal</div>
            <div>➕ <b>Real marking</b> — correct +1 · wrong −0.25 · unattempted 0</div>
            <div>🔴 <b>LIVE panel</b> (palette me) — kaun kitne sawaal kar chuka, kaun submit kar gaya</div>
            <div>📊 <b>End me comparison</b> — podium + score table + kisne kya select kiya</div>
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
      const pools = await Promise.all(SUBJ_ORDER.map(s => Generator.poolFor({ subjectId: s })));
      let pool;
      if (subject === 'mixed') {   // real paper ratio P25 M25 E20 R30
        const RATIO = { physics: 25, mathematics: 25, english: 20, raga: 30 };
        const sel = [];
        SUBJ_ORDER.forEach((s, i) => {
          for (let k = pools[i].length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[pools[i][k], pools[i][j]] = [pools[i][j], pools[i][k]]; }
          sel.push(...pools[i].slice(0, Math.round(count * RATIO[s] / 100)));
        });
        pool = sel;
      } else {
        const i = SUBJ_ORDER.indexOf(subject);
        for (let k = pools[i].length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[pools[i][k], pools[i][j]] = [pools[i][j], pools[i][k]]; }
        pool = pools[i];
      }
      if (pool.length < Math.min(count, 5)) throw new Error('Bank me kaafi questions nahi mile');
      pool = pool.slice(0, count);
      pool.sort((a, b) => SUBJ_ORDER.indexOf(a.subject) - SUBJ_ORDER.indexOf(b.subject));   // sections P→M→E→R
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
      // ASLI test object locally (engine-identical) — instructions/attempt/result sab native
      await buildLocalTest(r.code, { room: { name, durationMs, startsAt: Date.now() + whenMin * 60000, plan: qs.map(q => ({ id: q.id, subject: q.subject })) } });
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

  /* ══════════════ ROOM: lobby → (real exam) → comparison ══════════════ */
  Views.battleRoom = async function (code) {
    code = String(code || '').toUpperCase().trim();
    const gen = ++GEN;
    Object.assign(room, { code, S: null, offset: 0, result: null, lastPaint: '' });
    App.page('page page-battle', `<div id="bt-room"><div class="seed-spin" style="margin:60px auto"></div><p style="text-align:center">📡 Room dhoond rahe hain…</p></div>`);

    if (!Cloud.user) {
      paintErr('🗡️ Battle ke liye pehle Google sign-in karo — phir ye page dobara kholo.<br><br><button class="btn btn-primary" onclick="Cloud.signIn()">🔑 Sign in with Google</button>');
      return;
    }
    try {
      const me = await playerName();
      await Cloud.authed('/v1/battle/join', { code, playerName: me.name, photo: me.photo });
    } catch (e) { /* done/invalid — state poll asli sach batayega */ }

    let uiTimer = setInterval(() => { if (gen === GEN && room.S) uiTick(); }, 300);
    while (gen === GEN && room.code === code && Router.path === '/battle/' + code) {
      let S;
      try { S = await Cloud.authed('/v1/battle/state', { code }); }
      catch (e) { S = null; room.err = e.message; }
      if (gen !== GEN) break;
      if (!S) { paintErr(esc(room.err) + '<br><button class="btn" onclick="location.hash=\'#/battle\'">← Wapas</button>'); break; }
      room.err = null; room.S = S; room.offset = S.now - Date.now();
      if (S.room.status === 'done' && !room.result) await loadResult(code);
      if (S.room.status !== 'done') await buildLocalTest(code, S);   // asli test ready (sab ke paas)
      paint(S);
      if (S.room.status === 'live' && !(S.you && S.you.done) && !room.result) {
        // exam chal raha hai aur tumne abhi nahi diya → ASLI exam me andar jao
        clearInterval(uiTimer);
        location.hash = '#/test/' + testIdOf(code) + '/instructions';
        return;
      }
      if (S.room.status === 'done') break;
      await sleep(3000);
    }
    clearInterval(uiTimer);
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
    const key = JSON.stringify([S.room.status, S.players.map(p => [p.uid, p.attempted, p.done]), !!room.result, S.you && S.you.done]);
    if (key === room.lastPaint) return;
    room.lastPaint = key;
    const el = document.getElementById('bt-room');
    if (!el) return;
    if (S.room.status === 'lobby') el.innerHTML = paintLobby(S);
    else if (S.room.status === 'live') el.innerHTML = paintWaiting(S);
    else el.innerHTML = paintResult(S);
  }

  function playersPanel(S) {
    const myUid = Cloud.user && Cloud.user.uid;
    return `<div class="bt-players card">
      <h3>🔴 LIVE <span class="bt-hint">${S.players.length} candidates</span></h3>
      ${S.players.map(p => `
        <div class="bt-pl ${p.uid === myUid ? 'me' : ''}">
          <span class="bt-pl-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</span>
          <span class="bt-pl-name">${esc(p.name)}${p.uid === S.room.host ? ' 👑' : ''}</span>
          ${S.room.status === 'live'
        ? (p.done ? '<span class="bt-pl-sub">✅ submitted</span>' : `<span class="bt-pl-sub">${p.attempted || 0}/${S.room.total} attempting</span>`)
        : ''}
        </div>`).join('')}
    </div>`;
  }

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
          <div class="bt-count" id="bt-count">${fmt(S.room.startsAt - (Date.now() + room.offset))}</div>
          <div class="bt-hint">⏰ ${new Date(S.room.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — sab EK SAATH start honge, same test! Iske baad asli instructions page khulega ("I am ready to begin" wahi rule).</div>
          ${isHost ? '<button class="btn btn-primary bt-big" id="bt-startnow" onclick="BT.startNow()">⏩ Abhi Start Karo (10s)</button>' : '<div class="bt-hint">Host start karega — ready reho! 🫡</div>'}
        </div>
        ${playersPanel(S)}
      </div>`;
  }

  /* submit ke baad — dusron ka wait */
  function paintWaiting(S) {
    return `
      <div class="bt-done">
        <div class="card bt-podium-c">
          <div class="ec-check" aria-hidden="true">✓</div>
          <h2>✅ Tumhara exam submit ho gaya!</h2>
          <p class="muted">Result apne page se dekh lo — aur jab <b>sab candidates submit</b> karenge (ya time khatam hoga), yahin <b>full comparison</b> dikhega: podium + kisne kya select kiya. 🏆</p>
          <div class="bt-btnrow" style="justify-content:center">
            <a class="btn btn-primary" id="bt-myresult" href="#/dashboard">🏠 Mera Result / Dashboard</a>
          </div>
        </div>
        ${playersPanel(S)}
      </div>`;
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
      return `<td class="${a ? (a.correct ? 'g' : 'w') : 'n'}" title="${a ? (esc(names[a.uid] || '') + ' ne option ' + esc(a.opt_id) + ' chuna — ' + (a.correct ? 'sahi ✓ (+1)' : 'galat ✗ (−0.25)')) : 'not attempted'}">${a ? esc(a.opt_id) : '·'}</td>`;
    }).join('')}</tr>`).join('')}
            </tbody>
          </table></div>
          <div class="bt-hint">har cell = us candidate ne jo option chuna (A/B/C/D) — green = sahi (+1), red = galat (−0.25), · = chhoda. Question number par hover karke sawaal dekho.</div>
        </div>
        <div class="bt-btnrow">
          <button class="btn btn-primary bt-big" onclick="location.hash='#/battle'">⚔️ Nayi Battle</button>
          <a class="btn" href="#/dashboard">🏠 Dashboard</a>
        </div>
      </div>`;
  }

  /* 300ms tick — lobby countdown → 0 par asli instructions page */
  function uiTick() {
    const S = room.S;
    if (!S || S.room.status !== 'lobby') return;
    const c = document.getElementById('bt-count');
    if (!c) return;
    const left = S.room.startsAt - (Date.now() + room.offset);
    c.textContent = fmt(left);
    if (left <= 0) location.hash = '#/test/' + testIdOf(S.room.code) + '/instructions';   // ASLI flow shuru
  }

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

  /* ══════════════ LIVE LAYER — asli exam (exam.js) ke andar ══════════════
     Sirf yahi battle ka extra hai exam me: palette me live panel +
     answers server par. exam.js me chhote guarded hooks hain. */
  const live = {
    screen: null, test: null, code: null, qidx: null, timer: null, lastKey: '',
    mounted: false,

    mount(screen) {
      this.screen = screen; this.test = screen.test; this.code = this.test.battle && this.test.battle.code;
      if (!this.code) return;
      // qid → qNo map (sections order = room order)
      this.qidx = new Map(); let n = 0;
      this.test.sections.forEach(s => s.questionIds.forEach(qid => this.qidx.set(qid, n++)));
      this.mounted = true;
      this.paint(null);
      this.timer = setInterval(() => this.poll(), 3000);
      this.poll();
    },

    unmount() {
      this.mounted = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      const el = document.getElementById('bt-livepanel');
      if (el) el.remove();
    },

    async poll() {
      if (!this.mounted || !this.code) return;
      try {
        const S = await Cloud.authed('/v1/battle/state', { code: this.code });
        if (!this.mounted) return;
        this.paint(S);
        if (S.room.status === 'done') {   // sab ho gaya / time up — comparison ready
          this.unmount();
          AVUtil.toast('🏁 Battle khatam — full comparison ready!', 'success');
          if (this.screen && this.screen.attempt && !this.screen.attempt.completed) { try { this.screen.confirmSubmit(); } catch (e) { } }
        }
      } catch (e) { /* offline — agli poll */ }
    },

    paint(S) {
      let el = document.getElementById('bt-livepanel');
      if (!el) {
        const pal = document.querySelector('.palette-panel');
        if (!pal) return;
        el = document.createElement('div');
        el.id = 'bt-livepanel';
        el.className = 'bt-livepanel';
        pal.appendChild(el);
      }
      const myUid = Cloud.user && Cloud.user.uid;
      const ps = (S && S.players) || [];
      const key = JSON.stringify(ps.map(p => [p.uid, p.attempted, p.done])) + (S && S.room.status);
      if (key === this.lastKey) return;
      this.lastKey = key;
      el.innerHTML = `
        <div class="bt-lp-title">🔴 LIVE BATTLE <span class="bt-hint">${ps.length} candidates</span></div>
        ${ps.map(p => `
          <div class="bt-pl ${p.uid === myUid ? 'me' : ''}">
            <span class="bt-pl-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</span>
            <span class="bt-pl-name">${esc(p.name)}</span>
            ${p.done ? '<span class="bt-pl-sub">✅ done</span>' : `<span class="bt-pl-sub">${p.attempted || 0}${S && S.room ? '/' + S.room.total : ''}</span>`}
          </div>`).join('')}
        <button class="xbtn xbtn-ghost bt-lp-leave" id="bt-lp-leave" title="Exam submit karke battle room me jao">🏳️ Submit &amp; Bahar</button>`;
      const lb = el.querySelector('#bt-lp-leave');
      if (lb) lb.addEventListener('click', () => {
        if (this.screen && this.screen.confirmSubmit) { try { this.screen.confirmSubmit(); } catch (e) { } }
      });
    },

    answered(qid, optId) {   // exam.js select() hook — fire and forget
      const qNo = this.qidx && this.qidx.get(qid);
      if (qNo == null || !this.code) return;
      Cloud.authed('/v1/battle/answer', { code: this.code, qNo, optId }).catch(() => { });
    },

    cleared(qid) {           // exam.js clear hook
      const qNo = this.qidx && this.qidx.get(qid);
      if (qNo == null || !this.code) return;
      Cloud.authed('/v1/battle/answer', { code: this.code, qNo, optId: null }).catch(() => { });
    },

    async submitted() {      // exam.js finalize() hook
      const c = this.code;
      this.unmount();
      if (!c) return;
      try { await Cloud.authed('/v1/battle/submit', { code: c }); } catch (e) { }
    }
  };

  return { create, joinGo, startNow, copyLink, live, _test: { buildLocalTest } };
})();
