/* ============================================================
 * VIEW: QUESTION BANK MANAGER — search, filter, preview,
 * edit, delete, add, bulk export. Paginated (never loads the
 * full bank into the DOM).
 * ============================================================ */

Views.questionBank = async function (state) {
  state = state || Object.assign({ page: 1, search: '', subject: 'all', chapter: 'all', topic: 'all', difficulty: 'all', keyState: 'all', attempted: 'all', year: 'all' });

  const cfg = await App.config();
  const PER = 25;

  /* v1.4.48 EXAM ISOLATION: bank page sirf current exam ka data dikhata hai
     (SSC me airforce ka physics/PYQ kabhi nahi) + subjects config se dynamic. */
  const EX = cfg.exam || 'airforce';
  const SUBJ_IDS = cfg.subjects.map(s => s.id);
  const bank = state.bankCache || await Bank.bankStats(EX);
  state.bankCache = bank;
  const bankTotal = Object.values(bank).reduce((a, s) => a + (s.total || 0), 0);

  // gather candidate rows (filter via indexes where possible)
  let rows = [];
  if (state.subject !== 'all') rows = await DB.byIndex('questions', 'subject', state.subject);
  else {
    // all subjects — current exam ke subjects only
    for (const s of SUBJ_IDS) {
      rows = rows.concat(await DB.byIndex('questions', 'subject', s));
    }
  }
  rows = rows.filter(r => (r.exam || 'airforce') === EX);

  const qstats = await Store.getMeta('qstats', { seen: {}, wrong: {} });
  const seen = qstats.seen || {}, wrong = qstats.wrong || {};

  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(r => r.questionText.toLowerCase().includes(q) || (r.source || '').toLowerCase().includes(q));
  }
  if (state.chapter !== 'all') rows = rows.filter(r => r.chapter === state.chapter);
  if (state.topic !== 'all') rows = rows.filter(r => r.topic === state.topic);
  if (state.difficulty !== 'all') rows = rows.filter(r => (r.difficulty || 'medium') === state.difficulty);
  if (state.year !== 'all') rows = rows.filter(r => String(r.year) === state.year);
  if (state.keyState === 'keyed') rows = rows.filter(r => r.correctAnswer && !r.figureBased);
  if (state.keyState === 'unkeyed') rows = rows.filter(r => !r.correctAnswer);
  if (state.keyState === 'figure') rows = rows.filter(r => r.figureBased);
  if (state.attempted === 'seen') rows = rows.filter(r => seen[r.id]);
  if (state.attempted === 'unseen') rows = rows.filter(r => !seen[r.id]);
  if (state.attempted === 'wrong') rows = rows.filter(r => wrong[r.id]);

  rows.sort((a, b) => (a.subject + a.chapter).localeCompare(b.subject + b.chapter) || (a.id < b.id ? -1 : 1));

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  state.page = AVUtil.clamp(state.page, 1, pages);
  const slice = rows.slice((state.page - 1) * PER, state.page * PER);

  const chapters = state.subject !== 'all' ? Object.keys(bank[state.subject]?.chapters || {}) : [];
  const topics = (state.subject !== 'all' && state.chapter !== 'all') ? Object.keys(bank[state.subject]?.topics || {}).filter(t => true) : [];
  const years = [...new Set(rows.map(r => r.year).filter(Boolean))].sort().reverse();

  // modal-safe paint: agar preview/edit modal khula hai (form me likha hai),
  // usse paint se theek pehle detach karke capture karo — paint ke baad wapas
  // attach (capture → paint → re-attach teeno synchronous = koi race nahi)
  const keepHost = (() => { const h = AVUtil.$('#qb-modal-host'); return (h && h.children.length) ? h : null; })();
  const painted = App.page('page page-bank', `
    <div class="page-head">
      <div>
        <h1>Question Bank</h1>
        <div class="qb-subj-chips">
          ${SUBJ_IDS.map(s => `<span class="t2-chip"><i class="subject-dot sd-${s}"></i>${cfg.subjects.find(x => x.id === s)?.name || s} <b>${(bank[s] || {}).total || 0}</b><span class="muted">·${(bank[s] || {}).usable || 0} usable</span></span>`).join('')}
          <span class="t2-chip t2-more-chip"><b>${bankTotal.toLocaleString('en-IN')}</b> total</span>
        </div>
      </div>
      <div class="head-actions">
        <a class="btn btn-plain" href="#/import" title="Import question files">⬆ Import</a>
        <button class="btn btn-plain" id="qb-export-json">Export JSON</button>
        <button class="btn btn-plain" id="qb-export-csv">Export CSV</button>
        <button class="btn btn-primary" id="qb-add">+ Add Question</button>
      </div>
    </div>
    <div class="bank-filters card">
      <input type="search" id="qb-search" placeholder="Search question text or source…" value="${AVUtil.esc(state.search)}">
      <select id="qb-subject">
        <option value="all">All subjects</option>
        ${cfg.subjects.map(s => `<option value="${s.id}" ${state.subject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
      </select>
      <select id="qb-chapter" ${state.subject === 'all' ? 'disabled' : ''}>
        <option value="all">All chapters</option>
        ${chapters.map(c => `<option value=\"${AVUtil.esc(c)}\" ${state.chapter === c ? 'selected' : ''}>${AVUtil.esc(AVUtil.deEnt(c))}</option>`).join('')}
      </select>
      <select id="qb-topic" ${topics.length ? '' : 'disabled'}>
        <option value="all">All topics</option>
        ${topics.map(c => `<option ${state.topic === c ? 'selected' : ''}>${AVUtil.esc(c)}</option>`).join('')}
      </select>
      <select id="qb-diff">
        <option value="all">Any difficulty</option>
        ${['easy','medium','hard'].map(d => `<option ${state.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <select id="qb-key">
        <option value="all">All questions</option>
        <option value="keyed" ${state.keyState === 'keyed' ? 'selected' : ''}>With answer key</option>
        <option value="unkeyed" ${state.keyState === 'unkeyed' ? 'selected' : ''}>Missing answer</option>
        <option value="figure" ${state.keyState === 'figure' ? 'selected' : ''}>Figure-based</option>
      </select>
      <select id="qb-att">
        <option value="all">Attempt status: any</option>
        <option value="seen" ${state.attempted === 'seen' ? 'selected' : ''}>Attempted before</option>
        <option value="unseen" ${state.attempted === 'unseen' ? 'selected' : ''}>Never attempted</option>
        <option value="wrong" ${state.attempted === 'wrong' ? 'selected' : ''}>Previously wrong</option>
      </select>
    </div>
    <div class="card qb-list-card">
      <div class="qb-count muted small">${rows.length.toLocaleString('en-IN')} question(s) · page ${state.page} of ${pages}</div>
      ${bankTotal === 0 ? `<div class="imp-sum error" id="qb-wiped" style="margin:10px 0">
        <b>Question bank khali lag rahi hai!</b>
        <p class="muted small" style="margin:6px 0">Bundled PYQ bank (3,000+ questions) ek click me wapas restore ho jayegi — tumhare tests/attempts/notes ko koi nuksan nahi hoga.</p>
        <button class="btn btn-primary" id="qb-restore">♻️ Restore Bundled Question Bank</button>
      </div>` : ''}
      <div class="tbl-scroll"><table class="tbl qb-tbl">
        <thead><tr><th style="width:44px">#</th><th>Question</th><th style="width:110px">Subject</th><th class="qb-col-chapter" style="width:150px">Chapter</th><th class="qb-col-diff" style="width:70px">Diff</th><th style="width:90px">Key</th><th style="width:150px">Actions</th></tr></thead>
        <tbody>
        ${slice.map((q, i) => `<tr class="qb-row" data-id="${q.id}">
          <td class="muted">${(state.page - 1) * PER + i + 1}</td>
          <td class="qb-q">
            <div class="qb-qtext">${AVUtil.hasDevanagari(q.questionTextHi) ? '<span class="hi-badge" title="Hindi translation available">🌐 HI</span> ' : ''}${AVUtil.esc(q.questionText).slice(0, 130)}${q.questionText.length > 130 ? '…' : ''}</div>
            <div class="muted small">${AVUtil.esc(q.source || '')}${q.year ? ' · ' + q.year : ''}${q.figureBased ? ' · <b>figure-based</b>' : ''}${seen[q.id] ? ` · seen ${seen[q.id]}×` : ''}${wrong[q.id] ? ` · <span class="bad-txt">wrong ${wrong[q.id]}×</span>` : ''}</div>
          </td>
          <td>${AVUtil.esc((cfg.subjects.find(s => s.id === q.subject)?.name) || q.subject)}</td>
          <td class="small qb-col-chapter">${AVUtil.esc(AVUtil.deEnt(q.chapter))}</td>
          <td class="small qb-col-diff">${AVUtil.esc(q.difficulty || 'medium')}</td>
          <td>${q.correctAnswer ? `<span class="badge good">${q.correctAnswer}</span>` : '<span class="badge">—</span>'}</td>
          <td class="qb-actions">
            <button class="btn btn-mini" data-act="view">Preview</button>
            <button class="btn btn-mini" data-act="edit">Edit</button>
            <button class="btn btn-mini danger" data-act="del">Delete</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted pad">No questions match these filters.</td></tr>'}
        </tbody>
      </table></div>
      ${pages > 1 ? `<div class="pager t2-pager" aria-label="Pages">
        <button data-pg="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        ${Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, state.page - 3), Math.max(0, state.page - 3) + 5).map(n =>
          `<button data-pg="${n}" class="${n === state.page ? 'on' : ''}">${n}</button>`).join('')}
        <button data-pg="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>
        <span class="pg-info">${rows.length.toLocaleString('en-IN')} questions</span>
      </div>` : ''}
    </div>
    <div id="qb-modal-host"></div>
  `, '/questions');
  if (!painted) return; // user navigated away while this render was building
  // restore an open modal (ya to filter/page re-render ya late double-render ke baad)
  if (keepHost) { const h = AVUtil.$('#qb-modal-host'); if (h && !h.children.length) h.replaceWith(keepHost); }

  // one-click bank restore (if wiped)
  const qbRestore = AVUtil.$('#qb-restore');
  if (qbRestore) qbRestore.addEventListener('click', async () => {
    qbRestore.disabled = true; qbRestore.textContent = 'Restoring…';
    try {
      const r = await Bank.seedIfNeeded(true);
      AVUtil.toast('Bank restored — ' + (r.imported || 0) + ' questions re-imported.', 'success');
      state.bankCache = null;
      Views.questionBank(state);
    } catch (err) {
      AVUtil.toast('Restore failed: ' + err.message, 'error');
      qbRestore.disabled = false; qbRestore.textContent = '♻️ Restore Bundled Question Bank';
    }
  });

  // filter events
  const rerun = () => { state.page = 1; Views.questionBank(state); };
  AVUtil.$('#qb-search').addEventListener('input', AVUtil.debounce(e => { state.search = e.target.value; rerun(); }, 250));
  AVUtil.$('#qb-subject').addEventListener('change', e => { state.subject = e.target.value; state.chapter = 'all'; state.topic = 'all'; state.bankCache = null; rerun(); });
  AVUtil.$('#qb-chapter').addEventListener('change', e => { state.chapter = e.target.value; state.topic = 'all'; rerun(); });
  AVUtil.$('#qb-topic').addEventListener('change', e => { state.topic = e.target.value; rerun(); });
  AVUtil.$('#qb-diff').addEventListener('change', e => { state.difficulty = e.target.value; rerun(); });
  AVUtil.$('#qb-key').addEventListener('change', e => { state.keyState = e.target.value; rerun(); });
  AVUtil.$('#qb-att').addEventListener('change', e => { state.attempted = e.target.value; rerun(); });
  AVUtil.$$('#app .pager [data-pg]').forEach(b => b.addEventListener('click', () => { state.page = +b.dataset.pg; Views.questionBank(state); }));

  // row actions
  AVUtil.$$('.qb-row').forEach(tr => tr.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = tr.dataset.id;
    if (!act) return;
    const q = await DB.get('questions', id);
    if (!q) return;
    if (act === 'view') previewQ(q);
    else if (act === 'edit') editQ(q);
    else if (act === 'del') {
      const ok = await AVUtil.confirmModal({ title: 'Delete this question?', body: q.questionText.slice(0, 140) + '…', yesLabel: 'Delete', yesClass: 'btn-danger' });
      if (!ok) return;
      await DB.delete('questions', id);
      AVUtil.toast('Question deleted.');
      state.bankCache = null;
      Views.questionBank(state);
    }
  }));

  AVUtil.$('#qb-add').addEventListener('click', () => editQ(null));
  AVUtil.$('#qb-export-json').addEventListener('click', async () => {
    const data = await exportFiltered(rows);
    AVUtil.download('agniveer-question-bank.json', JSON.stringify(data, null, 1), 'application/json');
    AVUtil.toast(`Exported ${data.length} questions (JSON).`);
  });
  AVUtil.$('#qb-export-csv').addEventListener('click', async () => {
    const data = await exportFiltered(rows);
    const head = ['id','subject','chapter','topic','difficulty','question','optionA','optionB','optionC','optionD','answer','explanation','source','year'];
    const csvRows = data.map(q => [
      q.id, q.subject, q.chapter, q.topic, q.difficulty, q.questionText,
      q.options[0]?.text, q.options[1]?.text, q.options[2]?.text, q.options[3]?.text,
      q.correctAnswer || '', q.explanation || '', q.source || '', q.year || ''
    ]);
    const esc = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const csv = [head.join(',')].concat(csvRows.map(r => r.map(esc).join(','))).join('\n');
    AVUtil.download('agniveer-question-bank.csv', csv, 'text/csv');
    AVUtil.toast(`Exported ${data.length} questions (CSV).`);
  });

  async function exportFiltered(rowsArr) { return rowsArr; }

  function previewQ(q) {
    const host = AVUtil.$('#qb-modal-host');
    host.innerHTML = `
      <div class="av-modal-overlay" id="qv-ov">
        <div class="av-modal wide">
          <div class="av-modal-title">Question Preview</div>
          <div class="av-modal-body">
            <div class="muted small" style="margin-bottom:6px">${AVUtil.esc(q.source || '')}${q.year ? ' · ' + q.year : ''} · ${AVUtil.esc(AVUtil.deEnt(q.chapter))} › ${AVUtil.esc(AVUtil.deEnt(q.topic))} · ${AVUtil.esc(q.difficulty || 'medium')}${q.figureBased ? ' · figure-based' : ''}</div>
            <div class="qa-srcline">${AVUtil.pyqTag(q)}</div>
            <div class="qa-text">${AVUtil.qtext(q.questionText)}</div>
            ${AVUtil.hasDevanagari(q.questionTextHi) ? `<div class="qa-text qa-hi">🅷 ${AVUtil.qtext(q.questionTextHi)}</div>` : ''}
            ${q.image ? `<img class="qa-img" src="${AVUtil.esc(q.image)}" alt="figure">` : ''}
            <table class="qa-opt-tbl">${(q.options || []).map(o => `
              <tr class="${q.correctAnswer === o.id ? 'ok' : ''}"><td style="width:30px"><b>${o.id}.</b></td><td>${AVUtil.qtext(o.text)}${AVUtil.hasDevanagari(o.textHi) ? ` <span class="muted small">· ${AVUtil.esc(o.textHi)}</span>` : ''}</td>
              <td style="width:70px">${q.correctAnswer === o.id ? '<span class="badge good">KEY</span>' : ''}</td></tr>`).join('')}
            </table>
            ${q.explanation ? `<div class="qa-exp"><b>Explanation:</b> ${AVUtil.qtext(q.explanation)}</div>` : '<p class="muted">No explanation available.</p>'}
            ${AVUtil.hasDevanagari(q.explanationHi) ? `<div class="qa-exp qa-hi"><b>व्याख्या:</b> ${AVUtil.qtext(q.explanationHi)}</div>` : ''}
          </div>
          <div class="av-modal-actions"><button class="btn btn-plain" data-close>Close</button></div>
        </div>
      </div>`;
    AVUtil.$('#qv-ov').addEventListener('click', e => { if (e.target.id === 'qv-ov' || e.target.closest('[data-close]')) host.innerHTML = ''; });
  }

  async function editQ(q) {
    const isNew = !q;
    q = q || { id: null, subject: 'physics', chapter: '', topic: '', difficulty: 'medium', questionText: '', image: '', options: [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }], correctAnswer: '', explanation: '', source: 'Manual entry', year: new Date().getFullYear(), tags: ['manual'] };
    if (q && q.id) { try { const n = await DB.get('notes', q.id); q._noteText = n ? (n.text || '') : ''; } catch (e) {} }
    const host = AVUtil.$('#qb-modal-host');
    host.innerHTML = `
      <div class="av-modal-overlay" id="qe-ov">
        <div class="av-modal wide">
          <div class="av-modal-title">${isNew ? 'Add Question' : 'Edit Question'}</div>
          <div class="av-modal-body">
            <div class="qe-grid">
              <label>Subject<select id="qe-subject">${cfg.subjects.map(s => `<option value="${s.id}" ${q.subject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
              <label>Chapter<input id="qe-chapter" value="${AVUtil.esc(q.chapter)}"></label>
              <label>Topic<input id="qe-topic" value="${AVUtil.esc(q.topic)}"></label>
              <label>Difficulty<select id="qe-diff">${['easy','medium','hard'].map(d => `<option ${q.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
              <label>Answer key<select id="qe-key"><option value="">— none —</option>${['A','B','C','D'].map(k => `<option ${q.correctAnswer === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
              <label>Year<input id="qe-year" value="${AVUtil.esc(String(q.year || ''))}"></label>
            </div>
            <label class="qe-lbl">Question text</label>
            <textarea id="qe-text" rows="4">${AVUtil.esc(q.questionText)}</textarea>
            <label class="qe-lbl">Options</label>
            ${['A','B','C','D'].map((L, i) => `<div class="qe-opt"><b>${L}</b><input id="qe-opt-${L}" value="${AVUtil.esc(q.options?.[i]?.text || '')}"></div>`).join('')}
            <label class="qe-lbl">Explanation</label>
            <textarea id="qe-exp" rows="2">${AVUtil.esc(q.explanation || '')}</textarea>
            <label class="qe-lbl">📝 My Note (notebook — shows with the solution)</label>
            <textarea id="qe-note" rows="2" placeholder="Apna solution / trick…">${AVUtil.esc(q._noteText || '')}</textarea>
            <label class="qe-lbl">Image URL / data URI (optional)</label>
            <input id="qe-img" value="${AVUtil.esc(q.image || '')}" placeholder="data:image/png;base64,… or https://…">
          </div>
          <div class="av-modal-actions">
            <button class="btn btn-plain" data-close>Cancel</button>
            <button class="btn btn-primary" id="qe-save">Save Question</button>
          </div>
        </div>
      </div>`;
    AVUtil.$('#qe-ov').addEventListener('click', e => { if (e.target.id === 'qe-ov' || e.target.closest('[data-close]')) host.innerHTML = ''; });
    AVUtil.$('#qe-save').addEventListener('click', async () => {
      const subject = AVUtil.$('#qe-subject').value;
      const questionText = AVUtil.$('#qe-text').value.trim();
      const options = ['A','B','C','D'].map(L => ({ id: L, text: AVUtil.$('#qe-opt-' + L).value.trim() }));
      if (!questionText || options.some(o => !o.text)) return AVUtil.toast('Question text and all 4 options are required.', 'error');
      const rec = {
        ...q,
        id: q.id || Bank.contentId({ subject, questionText, options, correctAnswer: AVUtil.$('#qe-key').value || null }),
        subject,
        chapter: AVUtil.$('#qe-chapter').value.trim() || 'General',
        topic: AVUtil.$('#qe-topic').value.trim() || 'General',
        difficulty: AVUtil.$('#qe-diff').value,
        questionText, options,
        correctAnswer: AVUtil.$('#qe-key').value || null,
        explanation: AVUtil.$('#qe-exp').value.trim(),
        _noteText: AVUtil.$('#qe-note').value.trim(),
        image: AVUtil.$('#qe-img').value.trim() || null,
        year: parseInt(AVUtil.$('#qe-year').value) || q.year || null,
        source: q.source || 'Manual entry',
        dupeHash: Bank.dupeId({ subject, questionText, options }),
        figureBased: false,
        exam: q.exam || EX   /* v1.4.48: manual add current exam me hi jaata hai */
      };
      const noteText = rec._noteText; delete rec._noteText; delete q._noteText;
      await DB.put('questions', rec);
      if (rec.id) { try { await DB.put('notes', { qid: rec.id, text: noteText || '', updatedAt: Date.now() }); } catch (e) {} }
      AVUtil.toast(isNew ? 'Question added.' : 'Question updated.');
      host.innerHTML = '';
      state.bankCache = null;
      Views.questionBank(state);
    });
  }
};
