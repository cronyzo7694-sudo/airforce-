/* ============================================================
 * VIEW: LIVE BATTLE ⚔️ — doston ke saath LIVE group quiz
 * ALAG FEATURE: ye CBT exam engine / attempts / test series se
 * bilkul independent hai — apna server-side scoring (worker),
 * apna UI, apna history. Normal padhai wala flow untouched.
 * ============================================================ */

/* battle ka apna namespace (onclick handlers) */
window.BT = (function () {
  const SUBJ_LABEL = { physics: 'Physics', mathematics: 'Maths', english: 'English', raga: 'RAGA', mixed: 'Mixed' };
  let GEN = 0;                 // render generation — purane poll loops mar jaate hain
  const room = { code: null, offset: 0, S: null, qs: {}, my: {}, reveals: {}, result: null, err: null, lastPaint: '' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nowAdj = () => Date.now() + room.offset;      // server clock
  const esc = s => AVUtil.esc(String(s == null ? '' : s));

  /* ---------------- helpers ---------------- */
  function shareLink(code) { return location.href.split('#')[0] + '#/battle/' + code; }
  function fmt(ms) {
    ms = Math.max(0, ms);
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
    return (m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : s + 's');
  }
  async function playerName() {
    try { const cfg = await App.config(); return { name: (cfg.candidateName || 'Player').slice(0, 40), photo: cfg.profileImage || null }; }
    catch (e) { return { name: 'Player', photo: null }; }
  }

  /* ══════════════ HOME: create + join ══════════════ */
  Views.battle = async function () {
    const u = Cloud.user;
    const hist = (await Store.getMeta('battleHistory', [])).slice(-5).reverse();
    App.page('page page-battle', `
      <div class="bt-home" id="bt-home">
        <div class="bt-hero">
          <div class="bt-hero-t">⚔️</div>
          <div>
            <h2>LIVE BATTLE</h2>
            <p>Doston ke saath live quiz — room banao, link bhejo, <b>ek saath</b> khelo. Jaldi sahi jawab = zyada points! 🏆</p>
          </div>
        </div>
        ${!u ? `
        <div class="bt-signin card">
          <b>📡 Battle khelne ke liye Google sign-in zaroori hai</b>
          <p>Taaki tumhari pehchaan aur score sab devices par sahi dikhe.</p>
          <button class="btn btn-primary" onclick="Cloud.signIn()">🔑 Sign in with Google</button>
        </div>` : ''}
        <div class="bt-grid2">
          <div class="card bt-create">
            <h3>🗡️ Nayi Battle Banao <span class="bt-hint">(Host)</span></h3>
            <label>Battle ka naam</label>
            <input id="bt-name" maxlength="40" value="Agniveer Battle" autocomplete="off">
            <label>Subject</label>
            <select id="bt-subject">
              <option value="mixed">🎯 Mixed (sab subjects)</option>
              <option value="physics">Physics</option>
              <option value="mathematics">Maths</option>
              <option value="english">English</option>
              <option value="raga">RAGA</option>
            </select>
            <div class="bt-row2">
              <div><label>Sawaal</label>
                <select id="bt-count"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></div>
              <div><label>Time / sawaal</label>
                <select id="bt-perq"><option value="20000">20 sec</option><option value="30000" selected>30 sec</option><option value="45000">45 sec</option></select></div>
            </div>
            <label>Kab start ho? <span class="bt-hint">(sabko time milta hai aane ka)</span></label>
            <select id="bt-when">
              <option value="2">2 minute baad</option>
              <option value="5" selected>5 minute baad</option>
              <option value="10">10 minute baad</option>
              <option value="30">30 minute baad</option>
            </select>
            <button class="btn btn-primary bt-big" onclick="BT.create()" ${!u ? 'disabled title="Pehle sign in karo"' : ''}>⚔️ Battle Banao</button>
          </div>
          <div class="card bt-joinc">
            <h3>🚪 Battle Me Ghuse Jao</h3>
            <p>Dost ne link bheja hai? Link kholo — ya code neeche daalo:</p>
            <div class="bt-joinrow">
              <input id="bt-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" style="text-transform:uppercase" onkeydown="if(event.key==='Enter')BT.joinGo()">
              <button class="btn btn-primary" onclick="BT.joinGo()" ${!u ? 'disabled' : ''}>Join →</button>
            </div>
            ${hist.length ? `<label style="margin-top:14px">🕘 Pichhli battles</label>
              <div class="bt-hist">${hist.map(h => `
                <a href="#/battle/${esc(h.code)}" class="bt-hrow">
                  <span class="bt-hmedal">${h.myRank === 1 ? '🥇' : h.myRank === 2 ? '🥈' : h.myRank === 3 ? '🥉' : '#' + h.myRank}</span>
                  <span class="bt-hname">${esc(h.name)}</span>
                  <span class="bt-hscore">${h.myScore} pts · ${new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </a>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="card bt-rules">
          <h3>📜 Battle Rules</h3>
          <div class="bt-rules-g">
            <div>⏱️ <b>Sab ek saath</b> — fixed time par battle start hoti hai, countdown sabko dikhta hai</div>
            <div>⚡ <b>Speed bonus</b> — sahi jawab = 10 pts + jaldi diye to 5 tak bonus (galat = 0)</div>
            <div>👀 <b>Live</b> — kaun kitna aage, kaun jawab de chuka, sab live dikhta hai</div>
            <div>🎉 <b>Reveal</b> — har sawaal ke baad: kisne kya chuna + sahi jawab</div>
            <div>🏆 <b>Podium</b> — end me rank, full comparison aur question-by-question matrix</div>
            <div>🔒 <b>Server scoring</b> — points server decide karta hai, koi cheating nahi</div>
          </div>
        </div>
      </div>`);
  };

  /* ---------------- create ---------------- */
  async function create() {
    if (!Cloud.user) { AVUtil.toast('Pehle Google sign-in karo', 'error'); return; }
    const btn = AVUtil.$ ? AVUtil.$('#bt-home .bt-big') : null;
    const subject = document.getElementById('bt-subject').value;
    const count = +document.getElementById('bt-count').value;
    const perQMs = +document.getElementById('bt-perq').value;
    const whenMin = +document.getElementById('bt-when').value;
    const name = (document.getElementById('bt-name').value || 'Agniveer Battle').trim().slice(0, 60);
    try {
      if (btn) { btn.disabled = true; btn.textContent = '🎲 Sawaal chun rahe hain…'; }
      // bank se random sawaal (figure-free, keyed) — battle me surprise hi maza hai
      const subs = subject === 'mixed' ? ['physics', 'mathematics', 'english', 'raga'] : [subject];
      const pools = await Promise.all(subs.map(s => Generator.poolFor({ subjectId: s })));
      const pool = pools.flat();
      if (pool.length < count) throw new Error('Is subject me sirf ' + pool.length + ' sawaal mile — kam count try karo');
      // shuffle
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
      const qs = pool.slice(0, count).map(q => ({
        id: q.id, text: q.questionText, hi: q.questionTextHi || null,
        options: q.options.map(o => ({ id: o.id, text: o.text })),
        correctId: q.correctAnswer
      }));
      const me = await playerName();
      if (btn) btn.textContent = '📡 Room ban rahi hai…';
      const r = await Cloud.authed('/v1/battle/create', {
        name, subject, startsAt: Date.now() + whenMin * 60000, perQMs, questions: qs, playerName: me.name, photo: me.photo
      });
      location.hash = '#/battle/' + r.code;
    } catch (e) {
      AVUtil.toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '⚔️ Battle Banao'; }
    }
  }

  /* ---------------- join ---------------- */
  function joinGo() {
    const code = (document.getElementById('bt-code').value || '').toUpperCase().trim();
    if (!/^[A-Z2-9]{6}$/.test(code)) { AVUtil.toast('6-ka code daalo (jo host ne bheja)', 'error'); return; }
    location.hash = '#/battle/' + code;
  }

  /* ══════════════ ROOM: lobby → live → done ══════════════ */
  Views.battleRoom = async function (code) {
    code = String(code || '').toUpperCase().trim();
    const gen = ++GEN;
    room.code = code; room.S = null; room.qs = {}; room.my = {}; room.reveals = {}; room.result = null; room.err = null; room.lastPaint = '';
    App.page('page page-battle', `<div id="bt-room"><div class="seed-spin" style="margin:60px auto"></div><p style="text-align:center">📡 Room dhoond rahe hain…</p></div>`);

    if (!Cloud.user) {
      paintErr('🗡️ Battle khelne ke liye pehle Google sign-in karo — phir is page ko dobara kholo.<br><br><button class="btn btn-primary" onclick="Cloud.signIn()">🔑 Sign in with Google</button>');
      return;
    }
    // join (idempotent — har khulne par) + state poll shuru
    try {
      const me = await playerName();
      await Cloud.authed('/v1/battle/join', { code, playerName: me.name, photo: me.photo });
    } catch (e) { /* done/invalid — state poll asli sach batayega */ }

    // 250ms UI tick — countdown/timer-bar smooth (full repaint sirf change par)
    let uiTimer = setInterval(() => { if (gen === GEN) uiPaint(); }, 250);
    while (gen === GEN && room.code === code && Router.path === '/battle/' + code) {
      let S;
      try { S = await Cloud.authed('/v1/battle/state', { code }); }
      catch (e) { S = null; room.err = e.message; }
      if (gen !== GEN) break;
      if (!S) { paintErr(esc(room.err) + '<br><button class="btn" onclick="location.hash=\'#/battle\'">← Wapas</button>'); break; }
      room.err = null; room.S = S; room.offset = S.now - Date.now();
      if (S.qNo != null && S.question) room.qs[S.qNo] = S.question;
      if (S.room.status === 'done' && !room.result) { await loadResult(code); }
      paint(S);
      if (S.room.status === 'done') break;             // result final — poll band
      await sleep(S.room.status === 'live' ? 2000 : 3000);
    }
    clearInterval(uiTimer);
  };

  async function loadResult(code) {
    try {
      const R = await Cloud.authed('/v1/battle/result', { code });
      if (R && R.ok) room.result = R;
    } catch (e) { /* next poll retry */ }
    // history me apna record save (alag feature — attempts ko chhuate bina)
    try {
      if (room.result) {
        const R = room.result;
        const myUid = Cloud.user && Cloud.user.uid;
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
    const key = JSON.stringify([S.room.status, S.qNo, S.players.map(p => [p.uid, p.score, p.q_no, p.done]), !!room.result, phaseKey()]);
    if (key === room.lastPaint) return;          // kuch nahi badla — repaint nahi (click flash se bacho)
    room.lastPaint = key;
    const el = document.getElementById('bt-room');
    if (!el) return;
    if (S.room.status === 'lobby') el.innerHTML = paintLobby(S);
    else if (S.room.status === 'live') el.innerHTML = paintLive(S);
    else el.innerHTML = paintDone(S);
  }

  function phaseKey() {
    if (!room.S || room.S.room.status !== 'live') return '';
    const c = cycle();
    const t = nowAdj() - room.S.room.startsAt;
    return Math.floor(t / c) + ':' + (t % c < room.S.room.perQMs ? 'q' : 'r');
  }
  function cycle() { return room.S.room.perQMs + room.S.room.revealMs; }
  function qIdxNow() {
    const t = nowAdj() - room.S.room.startsAt;
    return Math.max(0, Math.min(room.S.room.total - 1, Math.floor(t / cycle())));
  }
  function inQuestionPhase() {
    const t = nowAdj() - room.S.room.startsAt;
    return (t % cycle()) < room.S.room.perQMs;
  }

  function playersPanel(S, curQ) {
    const myUid = Cloud.user && Cloud.user.uid;
    const sorted = S.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return `<div class="bt-players card">
      <h3>🔴 LIVE <span class="bt-hint">${S.players.length} khiladi</span></h3>
      ${sorted.map((p, i) => `
        <div class="bt-pl ${p.uid === myUid ? 'me' : ''}">
          <span class="bt-pl-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
          <span class="bt-pl-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</span>
          <span class="bt-pl-name">${esc(p.name)}${p.uid === S.room.host ? ' 👑' : ''}</span>
          ${curQ != null && S.room.status === 'live' && p.q_no > curQ ? '<span class="bt-pl-done">✓</span>' : ''}
          <b class="bt-pl-score">${p.score}</b>
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
              <div class="bt-hsub">${S.room.total} sawaal · ${Math.round(S.room.perQMs / 1000)}s/sawaal · speed bonus</div>
            </div>
            <a class="btn" href="#/battle">✕</a>
          </div>
        </div>
        <div class="card bt-share">
          <label>Doston ko ye link bhejo (WhatsApp par):</label>
          <div class="bt-linkrow"><input readonly value="${esc(link)}" id="bt-link" onclick="this.select()"></div>
          <div class="bt-btnrow">
            <button class="btn" onclick="BT.copyLink()">📋 Copy Link</button>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('⚔️ Agniveer Battle: ' + S.room.name + ' — ' + Math.round(S.room.perQMs / 1000) + 's/sawaal, ' + S.room.total + ' questions.\nCode: ' + S.room.code + '\nJoin karo: ' + link)}">📲 WhatsApp</a>
          </div>
          <div class="bt-codebig">ya ye code bolo: <b>${esc(S.room.code)}</b></div>
        </div>
        <div class="card bt-countcard">
          <label>Battle start hone me:</label>
          <div class="bt-count" id="bt-count">${fmt(S.room.startsAt - nowAdj())}</div>
          <div class="bt-hint">Time: ${new Date(S.room.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — sab ek saath shuru honge! ⏱️</div>
          ${isHost ? '<button class="btn btn-primary bt-big" onclick="BT.startNow()">⏩ Abhi Start Karo</button>' : '<div class="bt-hint">Host start karega — ready reho! 🫡</div>'}
        </div>
        ${playersPanel(S, null)}
      </div>`;
  }

  function paintLive(S) {
    const q = qIdxNow();
    const qData = room.qs[q];
    const inQ = inQuestionPhase();
    const myAns = room.my[q];
    const myUid = Cloud.user && Cloud.user.uid;
    const me = S.players.find(p => p.uid === myUid);
    const answered = myAns || (me && me.q_no > q && !inQ);
    if (!qData) return `<div class="bt-live"><div class="card"><div class="seed-spin" style="margin:40px auto"></div><p style="text-align:center">Sawaal aa raha hai…</p></div>${playersPanel(S, q)}</div>`;

    if (inQ) {
      const dl = S.room.startsAt + q * cycle() + S.room.perQMs;
      const left = Math.max(0, dl - nowAdj());
      return `
      <div class="bt-live">
        <div class="bt-main card">
          <div class="bt-qtop">
            <span class="bt-qnum">Q ${q + 1}<i>/${S.room.total}</i></span>
            <div class="bt-timer"><div class="bt-timer-i" id="bt-timer" style="width:${Math.round(100 * left / S.room.perQMs)}%"></div></div>
            <span class="bt-qtime" id="bt-qtime">${fmt(left)}</span>
          </div>
          <div class="bt-qtext">${esc(qData.text)}</div>
          ${qData.hi ? `<div class="bt-qhi">${esc(qData.hi)}</div>` : ''}
          <div class="bt-opts ${answered ? 'locked' : ''}">
            ${qData.options.map(o => {
              let cls = 'bt-opt';
              if (myAns) cls += myAns.optId === o.id ? (myAns.correct ? ' good' : ' bad') : ' dim';
              return `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="BT.answer('${esc(o.id)}')">
                <span class="bt-optl">${esc(o.id)}</span><span class="bt-optt">${esc(o.text)}</span></button>`;
            }).join('')}
          </div>
          ${myAns ? `<div class="bt-myresult ${myAns.correct ? 'good' : 'bad'}">${myAns.correct ? '✅ SAHI! +' + myAns.points + ' points' + (myAns.points > 10 ? ' ⚡ (speed bonus ' + (myAns.points - 10) + ')' : '') : '❌ Galat — 0 points'}</div>
            <div class="bt-hint">Doston ka wait… unke jawab deadline ke baad sab reveal honge 👀</div>`
            : (answered ? '<div class="bt-hint">✓ Jawab lock ho chuka — dusre khiladi wait karo…</div>' : '')}
        </div>
        ${playersPanel(S, q)}
      </div>`;
    }

    // reveal phase
    const rv = room.reveals[q];
    const qD = room.qs[q] || qData;
    const names = {}; S.players.forEach(p => names[p.uid] = p.name);
    const left = Math.max(0, S.room.startsAt + (q + 1) * cycle() - nowAdj());
    const opts = qD.options || [];
    return `
      <div class="bt-live">
        <div class="bt-main card bt-rvcard">
          <div class="bt-qtop"><span class="bt-qnum">👀 REVEAL <i>Q ${q + 1}</i></span>
            <span class="bt-hint">agla sawaal ${fmt(left)} me</span></div>
          <div class="bt-qtext bt-rv-q">${esc(qD.text)}</div>
          <div class="bt-rvopts">
            ${opts.map(o => {
              const pickers = rv ? rv.answers.filter(a => a.opt_id === o.id).map(a => names[a.uid] || '?') : [];
              const correct = rv && o.id === rv.correctId;
              return `<div class="bt-rv-opt ${correct ? 'good' : (rv ? 'bad' : '')}">
                <span class="bt-optl">${esc(o.id)}</span>
                <span class="bt-optt">${esc(o.text)} ${correct ? '✅' : ''}</span>
                <span class="bt-chips">${pickers.map(p => `<i class="bt-chip">${esc(p)}</i>`).join('') || '<i class="bt-chip none">—</i>'}</span>
              </div>`;
            }).join('')}
          </div>
          ${myAns ? `<div class="bt-myresult ${myAns.correct ? 'good' : 'bad'}">${myAns.correct ? '✅ Tumne sahi bola +' + myAns.points : '❌ Tumhara galat tha'}</div>` : '<div class="bt-myresult bad">😴 Time up — ye sawaal chhoot gaya</div>'}
        </div>
        ${playersPanel(S, q)}
      </div>`;
  }

  function paintDone(S) {
    const R = room.result;
    if (!R) return `<div class="card"><div class="seed-spin" style="margin:50px auto"></div><p style="text-align:center">🏁 Result nikal rahe hain…</p></div>`;
    const myUid = Cloud.user && Cloud.user.uid;
    const medals = ['🥇', '🥈', '🥉'];
    const names = {}; R.players.forEach(p => names[p.uid] = p.name);
    const total = R.room.total;
    const maxScore = R.players.length ? R.players[0].score : 1;
    const myIdx = R.players.findIndex(p => p.uid === myUid);
    return `
      <div class="bt-done">
        <div class="card bt-podium-c">
          <h2>🏁 ${esc(R.room.name)} — FINAL</h2>
          <div class="bt-podium">
            ${R.players.slice(0, 3).map((p, i) => `
              <div class="bt-pod bt-p${i + 1} ${p.uid === myUid ? 'me' : ''}">
                <div class="bt-pod-med">${medals[i]}</div>
                <div class="bt-pod-img">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : '🙂'}</div>
                <div class="bt-pod-name">${esc(p.name)}</div>
                <div class="bt-pod-score">${p.score}<i>pts</i></div>
              </div>`).join('') || '—'}
          </div>
          ${myIdx >= 0 ? `<div class="bt-myplace">${myIdx === 0 ? '🏆 TUM JEET GAYE! Maza aa gaya!' : 'Tumhara rank: <b>#' + (myIdx + 1) + '</b> — agli baar pakka! 💪'}</div>` : ''}
        </div>
        <div class="card">
          <h3>📊 Full Comparison</h3>
          <div class="tablewrap"><table class="bt-table">
            <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Sahi</th><th>Accuracy</th><th>Speed</th></tr></thead>
            <tbody>${R.players.map((p, i) => {
              const pAns = R.answers.filter(a => a.uid === p.uid);
              const fast = pAns.filter(a => a.correct).length;
              const att = pAns.length, corr = p.correct;
              return `<tr class="${p.uid === myUid ? 'me' : ''}"><td>${medals[i] || i + 1}</td><td>${esc(p.name)}</td>
                <td><b>${p.score}</b></td><td>${corr}/${total}</td>
                <td>${att ? Math.round(100 * corr / att) : 0}%</td>
                <td>${fast ? '⚡' + fast : '—'}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h3>🔍 Question-by-Question <span class="bt-hint">(kisne kya kiya)</span></h3>
          <div class="bt-mxwrap"><table class="bt-matrix">
            <thead><tr><th></th>${Array.from({ length: total }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead>
            <tbody>${R.players.map(p => `
              <tr class="${p.uid === myUid ? 'me' : ''}"><td class="bt-mxname">${esc(p.name.slice(0, 12))}</td>
              ${Array.from({ length: total }, (_, qi) => {
                const a = R.answers.find(x => x.uid === p.uid && x.q_no === qi);
                return `<td class="${a ? (a.correct ? 'g' : 'w') : 'n'}">${a ? (a.correct ? '✓' : '✗') : '·'}</td>`;
              }).join('')}</tr>`).join('')}
            </tbody>
          </table></div>
          <div class="bt-hint">✓ sahi · ✗ galat · · nahi bola — sahi jawab ${esc(R.room.name)} battle ke reveal me tha</div>
        </div>
        <div class="bt-btnrow">
          <button class="btn btn-primary bt-big" onclick="location.hash='#/battle'">⚔️ Nayi Battle</button>
          <a class="btn" href="#/dashboard">🏠 Dashboard</a>
        </div>
      </div>`;
  }

  /* 250ms tick — sirf timer/countdown update (poora repaint nahi) */
  function uiPaint() {
    const S = room.S;
    if (!S) return;
    if (S.room.status === 'lobby') {
      const c = document.getElementById('bt-count');
      if (c) {
        const left = S.room.startsAt - nowAdj();
        c.textContent = fmt(left);
        if (left <= 0) { room.lastPaint = ''; paint(S); }   // countdown khatam → live view
      }
    } else if (S.room.status === 'live') {
      const inQ = inQuestionPhase();
      const q = qIdxNow();
      const dl = S.room.startsAt + q * cycle() + S.room.perQMs;
      const bar = document.getElementById('bt-timer');
      if (bar && inQ) {
        const left = Math.max(0, dl - nowAdj());
        bar.style.width = Math.round(100 * left / S.room.perQMs) + '%';
        bar.classList.toggle('low', left < 6000);
        const t = document.getElementById('bt-qtime'); if (t) t.textContent = fmt(left);
        if (left <= 0) { room.lastPaint = ''; paint(S); }   // → reveal
      } else if (!inQ) {
        // reveal window — agla sawaal start hone par repaint
        const nxt = S.room.startsAt + (q + 1) * cycle();
        if (nowAdj() >= nxt && q + 1 < S.room.total) { room.lastPaint = ''; paint(S); }
        else if (q + 1 >= S.room.total && nowAdj() >= S.room.startsAt + S.room.total * cycle()) { room.lastPaint = ''; paint(S); }
        else fetchRevealIfNeeded(q);
      }
    }
  }

  async function fetchRevealIfNeeded(q) {
    if (room.reveals[q] || !room.S) return;
    try {
      const rv = await Cloud.authed('/v1/battle/reveal', { code: room.code, qNo: q });
      if (rv && rv.ok) { room.reveals[q] = rv; room.lastPaint = ''; paint(room.S); }
    } catch (e) { /* early/invalid — agli tick retry */ }
  }

  /* ---------------- actions ---------------- */
  async function answer(optId) {
    const S = room.S;
    if (!S || S.room.status !== 'live') return;
    const q = qIdxNow();
    if (!inQuestionPhase() || room.my[q]) return;    // locked / reveal phase
    try {
      const r = await Cloud.authed('/v1/battle/answer', { code: room.code, qNo: q, optId });
      room.my[q] = { optId, correct: r.correct, points: r.points };
      room.lastPaint = ''; paint(S);
      if (navigator.vibrate) { try { navigator.vibrate(r.correct ? 60 : [40, 40, 40]); } catch (e) { } }
    } catch (e) {
      AVUtil.toast(e.message, 'error');
      room.lastPaint = ''; paint(S);
    }
  }

  async function startNow() {
    try { await Cloud.authed('/v1/battle/start', { code: room.code }); AVUtil.toast('Battle shuru! Sab ready? 🚀', 'success'); }
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

  return { create, joinGo, answer, startNow, copyLink };
})();
