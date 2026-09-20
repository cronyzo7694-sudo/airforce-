/* ============================================================
 * 🔗 SHARE — test ka shareable link (SIMPLE feature)
 * Koi bhi test share karo → link → dost wahi test kabhi bhi de
 * sake (same questions, same order). Submit hone par result
 * upload hota hai → analysis me "👥 View with all" comparison.
 * NO live, NO timing, NO chat — bilkul simple, normal test jaisa.
 * ============================================================ */

window.Share = (function () {
  const esc = s => AVUtil.esc(String(s == null ? '' : s));

  /* ---------- test se share code banao + link do ---------- */
  async function create(test, playerName) {
    const data = {
      sections: test.sections.map(s => ({ subjectId: s.subjectId, name: s.name, questionIds: s.questionIds.slice() })),
      duration: test.duration,
      mode: test.mode || 'exam',
      marking: test.marking || { correct: 1, wrong: -0.25, unattempted: 0 },
      exam: (App.configCache && App.configCache.exam) || 'airforce',
      strategy: test.strategy || 'realpaper',
      totalQuestions: test.totalQuestions,
      maxScore: test.maxScore
    };
    if (typeof Cloud === 'undefined' || !Cloud.user) throw new Error('Pehle Google sign-in karo (Settings → Cloud Backup → Sign in)');
    const r = await Cloud.authed('/v1/share/create', {
      name: test.name, playerName: (playerName || 'Candidate').slice(0, 40), data
    });
    if (!r || !r.ok) throw new Error((r && r.error) || 'share fail');
    return r.code;
  }

  function linkOf(code) { return location.href.split('#')[0] + '#/shared/' + code; }

  /* ---------- share modal (link copy + WhatsApp) ---------- */
  async function shareTest(testId) {
    try {
      const test = await DB.get('tests', testId);
      if (!test) { AVUtil.toast('Test nahi mila', 'error'); return; }
      let cfg = {};
      try { cfg = await App.config(); } catch (e) { }
      AVUtil.toast('🔗 Link ban raha hai…', 'info');
      const code = await create(test, cfg.candidateName || 'Candidate');
      const link = linkOf(code);
      const wa = 'https://wa.me/?text=' + encodeURIComponent('📝 Kineora Exam test: ' + test.name + '\n' + (test.totalQuestions || '') + ' questions · ' + Math.round((test.duration || 1800) / 60) + ' min\nYe link kholke dekh: ' + link);
      // modal
      let m = document.getElementById('share-modal');
      if (m) m.remove();
      m = document.createElement('div');
      m.id = 'share-modal';
      m.className = 'share-modal';
      m.innerHTML = `
        <div class="share-box">
          <h3>🔗 Test Share Ho Gaya!</h3>
          <p class="share-sub">Ye link kisi ko bhi bhejo — wo<b> bilkul yahi test</b> (same questions, same order) apne phone par de sakta hai. Kabhi bhi — koi time limit nahi.</p>
          <div class="share-linkrow"><input readonly id="share-link" value="${esc(link)}" onclick="this.select()"></div>
          <div class="share-btnrow">
            <button class="btn" id="share-copy">📋 Copy Link</button>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(wa)}">📲 WhatsApp</a>
          </div>
          <div class="share-code">Code: <b>${esc(code)}</b></div>
          <button class="btn btn-plain" id="share-close">Band karo</button>
        </div>`;
      document.body.appendChild(m);
      m.querySelector('#share-close').addEventListener('click', () => m.remove());
      m.addEventListener('click', e => { if (e.target === m) m.remove(); });
      m.querySelector('#share-copy').addEventListener('click', () => {
        const inp = m.querySelector('#share-link');
        inp.select();
        try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); }
        AVUtil.toast('Link copy ho gaya — bhej do! 📤', 'success');
      });
    } catch (e) {
      AVUtil.toast(e.message, 'error');
    }
  }

  /* ---------- /shared/:code — link kholne par test banao ---------- */
  Views.shared = async function (code) {
    code = String(code || '').toUpperCase().trim();
    App.page('page page-shared', `<div id="sh-room"><div class="seed-spin" style="margin:70px auto"></div><p style="text-align:center" class="muted">🔗 Test load ho raha hai…</p></div>`);
    const el = document.getElementById('sh-room');
    let sh = null;
    try {
      const body = { code };
      const r = await fetch(Cloud.endpoint() + '/v1/share/get', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) sh = j;
      else throw new Error((j && j.error) || 'link invalid');
    } catch (e) {
      el.innerHTML = `<div class="card sh-errbox">😕 <b>Ye link kaam nahi kar raha</b><br>${esc(e.message)}<br><br>
        <a class="btn" href="#/dashboard">🏠 Dashboard</a></div>`;
      return;
    }
    const tid = 'shared-' + code;
    let test = await DB.get('tests', tid);
    if (!test) {
      const d = sh.data;
      const ids = d.sections.flatMap(s => s.questionIds);
      const rows = await DB.getMany('questions', ids);
      const missing = ids.filter((id, i) => !rows[i]);
      if (missing.length) {
        el.innerHTML = `<div class="card sh-errbox">⚠️ <b>${missing.length} questions is device ke bank me nahi mile</b><br>
          App dobara kholo (bank sync ho jayega) ya ye link host wale device par try karo.<br><br>
          <button class="btn btn-primary" onclick="location.reload()">🔁 Refresh Karo</button>
          <a class="btn" href="#/dashboard">🏠 Dashboard</a></div>`;
        return;
      }
      test = {
        id: tid,
        name: sh.name + ' (shared)',
        exam: d.exam || 'airforce',
        type: 'shared', mode: d.mode || 'exam',
        createdAt: Date.now(),
        duration: d.duration,
        timerMode: 'global', sectionLock: false, sectionSubmitRequired: false, allowPause: false,
        shuffleQuestions: false, shuffleOptions: false, instantExplanation: false,
        marking: d.marking || { correct: 1, wrong: -0.25, unattempted: 0 },
        strategy: d.strategy || 'realpaper',
        sections: d.sections.map(s => ({ subjectId: s.subjectId, name: s.name, questionIds: s.questionIds.slice() })),
        totalQuestions: d.totalQuestions || ids.length,
        maxScore: d.maxScore || ids.length,
        sharedCode: code, sharedBy: sh.owner || 'Candidate'
      };
      await DB.put('tests', test);
    }
    // wahi test → normal instructions → normal exam → normal result/analysis
    location.hash = '#/test/' + tid + '/instructions';
  };

  /* ---------- submit par result upload (analysis "View with all" ke liye) ---------- */
  async function uploadAttempt(test, attempt, result) {
    if (!test || !test.sharedCode || !Cloud.user) return;
    try {
      const cfg = await App.config().catch(() => ({}));
      // per-question: Engine.evaluate ka perQuestion use karo (sel + sahi/galat)
      const answers = [];
      for (const sec of test.sections) {
        for (const qid of sec.questionIds) {
          const pq = (result.perQuestion || {})[qid] || {};
          answers.push({ qid, opt: pq.sel || '', correct: pq.result === 'correct' });
        }
      }
      await Cloud.authed('/v1/share/attempt', {
        code: test.sharedCode, name: (cfg.candidateName || 'Candidate').slice(0, 40),
        uid: Cloud.user.uid, score: result.score, correct: result.correct, wrong: result.wrong,
        unattempted: result.unattempted, accuracy: result.accuracy, answers
      });
    } catch (e) { /* silent — comparison bonus feature hai */ }
  }

  return { shareTest, uploadAttempt, linkOf };
})();
