/* ============================================================
 * VIEW: IMPORT — question file import with report + errors
 * Supported: TXT (master + generic), JSON, CSV, DOCX, PDF*
 * ============================================================ */

Views.importPage = async function () {
  const bank = await Bank.bankStats();
  const total = ['physics','mathematics','english','raga'].reduce((a, s) => a + (bank[s]?.total || 0), 0);

  App.page('page page-import', `
    <div class="page-head">
      <div><h1>Import Question Bank</h1>
      <p class="muted">${total.toLocaleString('en-IN')} questions currently on this device. Imports merge into the bank — duplicates are detected by content. <b>Naye questions se tests apne aap ban jaati hain</b> — tumhe manually kuch nahi banana.</p></div>
    </div>

    <div class="import-grid">
      <div class="card import-card">
        <h3>1 · Choose files</h3>
        <p class="muted small">Supported formats:</p>
        <ul class="fmt-list">
          <li><b>TXT</b> — the master PYQ format (Q1. / (A)–(D) / Answer:), numbered-option variants, and generic formats. Auto-detected.</li>
          <li><b>JSON</b> — array of questions, or <code>{ "questions": [...] }</code>. Keys: subject, question, optionA–D, answer, explanation, chapter, topic, difficulty, year, source, image. <b>Hindi+English bilingual:</b> <code>questionTextHi</code>, <code>explanationHi</code>.</li>
          <li><b>CSV</b> — same columns as JSON (header row required, quote fields containing commas).</li>
          <li><b>DOCX</b> — unzipped locally in your browser; embedded images are kept as data URIs.</li>
          <li><b>PDF</b> — best-effort text extraction (text-layer PDFs only). Scanned PDFs must be converted to TXT/DOCX first.</li>
        </ul>
        <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="Choose question files to import">
          <div class="dz-ic">📁</div>
          <b>Drop files here</b> or <span class="link">browse</span>
          <input type="file" id="file-input" multiple accept=".txt,.json,.csv,.docx,.pdf" class="visually-hidden">
        </div>
        <div class="b-row" style="margin-top:14px">
          <label>Exam — is file ke questions kis exam ke liye hain?</label>
          <select id="imp-exam">
            <option value="airforce" selected>Agniveer Vayu (Air Force)</option>
            <option value="navy">Indian Navy</option>
            <option value="army">Indian Army</option>
          </select>
        </div>
        <div class="b-row" style="margin-top:10px">
          <label>Default subject (for files without one)</label>
          <select id="imp-subject">
            <option value="">Auto-detect from file name</option>
            <option value="physics">Physics</option>
            <option value="mathematics">Mathematics</option>
            <option value="english">English</option>
            <option value="raga">RAGA</option>
          </select>
        </div>
        <label class="b-opts"><input type="checkbox" id="imp-allow-unkeyed" checked> Keep questions without answer keys (excluded from test generation)</label>
      </div>

      <div class="card import-card">
        <h3>2 · Import report</h3>
        <div id="imp-progress" hidden>
          <div class="progress-bar"><div class="progress-fill" id="imp-fill"></div></div>
          <div class="muted small" id="imp-status">Working…</div>
        </div>
        <div id="imp-report"></div>
        <div id="imp-errors" class="imp-errors"></div>
      </div>
    </div>

    <div class="card">
      <h3>Templates</h3>
      <p class="muted small">Download a template, fill it, and import it back.</p>
      <button class="btn btn-plain" id="tpl-json">JSON template</button>
      <button class="btn btn-plain" id="tpl-csv">CSV template</button>
      <button class="btn btn-plain" id="tpl-txt">TXT (master format) sample</button>
    </div>
  `);

  const dz = AVUtil.$('#drop-zone'), fi = AVUtil.$('#file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
  fi.addEventListener('change', () => handleFiles(fi.files));

  AVUtil.$('#tpl-json').addEventListener('click', () => {
    AVUtil.download('questions-template.json', JSON.stringify([{
      subject: 'physics', chapter: 'Electrostatics', topic: "Coulomb's Law", difficulty: 'medium',
      question: 'Sample question text?', optionA: 'Option A', optionB: 'Option B', optionC: 'Option C', optionD: 'Option D',
      answer: 'B', explanation: 'Why B is correct.', year: 2024, source: 'My notes', image: ''
    }], null, 2), 'application/json');
  });
  AVUtil.$('#tpl-csv').addEventListener('click', () => {
    AVUtil.download('questions-template.csv',
      'subject,chapter,topic,difficulty,question,optionA,optionB,optionC,optionD,answer,explanation,year,source\n' +
      'physics,Electrostatics,General,medium,"Sample question?",A text,B text,C text,D text,B,"Because…",2024,My notes\n', 'text/csv');
  });
  AVUtil.$('#tpl-txt').addEventListener('click', () => {
    AVUtil.download('questions-sample.txt',
      '==============================================================================\n' +
      'PAPER 1  |  GROUP X  |  01 Jan 2025  |  Source: My Notes\n' +
      '==============================================================================\n' +
      'Q1. Sample question text?\n   (A) Option A\n   (B) Option B\n   (C) Option C\n   (D) Option D\n   Answer: B\n\n', 'text/plain');
  });

  /* live element accessors — the import view can re-render while an import is
     still running (user re-clicks the Import nav); writing into cached nodes
     would silently send the report into a detached DOM node. */
  const el = {
    get reportHost() { return AVUtil.$('#imp-report'); },
    get prog() { return AVUtil.$('#imp-progress'); },
    get fill() { return AVUtil.$('#imp-fill'); },
    get status() { return AVUtil.$('#imp-status'); },
    get errHost() { return AVUtil.$('#imp-errors'); }
  };

  async function handleFiles(files) {
    if (!files || !files.length) return;
    let defaultSubject = AVUtil.$('#imp-subject').value || null;
    const examTag = (AVUtil.$('#imp-exam') && AVUtil.$('#imp-exam').value) || 'airforce';
    const allowUnkeyed = AVUtil.$('#imp-allow-unkeyed').checked;
    const allReports = [];

    for (const file of Array.from(files)) {
      if (el.prog) el.prog.hidden = false;
      if (el.status) el.status.textContent = `Parsing ${file.name}…`;
      if (el.fill) el.fill.style.width = '8%';
      let parsed;
      try {
        let subject = defaultSubject;
        if (!subject) {
          const nm = file.name.toLowerCase();
          if (nm.includes('phys')) subject = 'physics';
          else if (nm.includes('math')) subject = 'mathematics';
          else if (nm.includes('eng')) subject = 'english';
          else if (nm.includes('raga') || nm.includes('reason')) subject = 'raga';
        }
        parsed = await Parsers.parseFile(file, subject);
      } catch (err) {
        allReports.push({ file: file.name, error: err.message });
        continue;
      }
      if (el.status) el.status.textContent = `Importing ${parsed.questions.length} questions from ${file.name}…`;
      if (el.fill) el.fill.style.width = '30%';
      let report;
      try {
        let questions = parsed.questions;
        if (!allowUnkeyed) questions = questions.filter(q => q.correctAnswer);
        report = await Bank.importBatch(questions, (i, n) => {
          if (el.fill) el.fill.style.width = (30 + 65 * (i / Math.max(1, n))) + '%';
          if (el.status) el.status.textContent = `Saving… ${i}/${n}`;
        }, examTag);
        // full backup restore: tests, attempts and analytics alongside questions
        if (parsed.restore && (parsed.restore.tests.length || parsed.restore.attempts.length)) {
          if (el.fill) el.fill.style.width = '98%';
          if (parsed.restore.tests.length) await DB.bulkPut('tests', parsed.restore.tests);
          if (parsed.restore.attempts.length) await DB.bulkPut('attempts', parsed.restore.attempts);
          if (parsed.restore.notes.length) await DB.bulkPut('notes', parsed.restore.notes);
          for (const [k, v] of Object.entries(parsed.restore.meta || {})) await Store.setMeta(k, v);
          report.restored = parsed.restore.tests.length + parsed.restore.attempts.length + parsed.restore.notes.length;
        }
        report.file = file.name;
        allReports.push(report);
      } catch (err) {
        allReports.push({ file: file.name, error: 'Import failed: ' + err.message });
      }
    }
    if (el.prog) el.prog.hidden = true;

    // render report
    let html = '';
    for (const r of allReports) {
      if (r.error) {
        html += `<div class="imp-sum error"><b>${AVUtil.esc(r.file)}</b><div class="bad-txt">${AVUtil.esc(r.error)}</div></div>`;
        continue;
      }
      const missing = r.total - r.imported - r.duplicates - r.invalid;
      html += `<div class="imp-sum">
        <b>${AVUtil.esc(r.file)}</b>
        <table class="ins-tbl">
          <tr><td>Questions Found</td><td><b>${r.total}</b></td></tr>
          <tr><td>Imported — Physics / Mathematics / English / RAGA</td><td><b>${r.bySubject.physics || 0} / ${r.bySubject.mathematics || 0} / ${r.bySubject.english || 0} / ${r.bySubject.raga || 0}</b></td></tr>
          <tr><td>Duplicates Found (skipped)</td><td>${r.duplicates}</td></tr>
          <tr><td>Key upgraded on existing duplicates</td><td>${r.replaced}</td></tr>
          <tr><td>Invalid Questions</td><td>${r.invalid}</td></tr>
          <tr><td>Missing Answers (kept, excluded from generation)</td><td>${r.missingAnswers}</td></tr>
          <tr><td>Questions With Images</td><td>${r.withImages}</td></tr>
          <tr><td>Questions Without Explanations</td><td>${r.withoutExplanation}</td></tr>
          ${r.restored ? `<tr><td>Tests &amp; Attempts Restored (backup)</td><td><b>${r.restored}</b></td></tr>` : ''}
        </table></div>`;
      if (r.errors && r.errors.length && el.errHost) {
        el.errHost.innerHTML += `<div class="imp-sum"><b>Skipped items in ${AVUtil.esc(r.file)}:</b>
          <ul class="err-list">${r.errors.slice(0, 50).map(e => `<li><span class="badge bad">${AVUtil.esc(e.reason)}</span> ${AVUtil.esc(e.text)}…</li>`).join('')}</ul>
          ${r.errors.length > 50 ? `<p class="muted small">…and ${r.errors.length - 50} more.</p>` : ''}</div>`;
      }
    }
    // re-resolved at write time: if the view re-rendered mid-import, this still lands on the visible node
    if (!el.reportHost) return;
    el.reportHost.innerHTML = html || '<p class="muted pad">Nothing imported.</p>';
    AVUtil.toast('Import finished.');

    // AUTO-TESTS: new questions entered the bank → top up the ready-made library.
    // The user never has to build tests by hand — imports keep the library growing.
    try {
      const newQs = allReports.reduce((a, r) => a + (r.imported || 0), 0);
      if (newQs > 0 && typeof Generator !== 'undefined') {
        if (el.status) el.status.textContent = 'Building new tests from your questions…';
        const made = await Generator.autoBuild();
        if (made > 0) AVUtil.toast(made + ' new test' + (made === 1 ? '' : 's') + ' auto-created from your import 🎉', 'success');
        if (el.status) el.status.textContent = 'Done — ' + newQs + ' new question' + (newQs === 1 ? '' : 's') + ' in the bank.';
      }
    } catch (e) { /* auto-build is a bonus */ }
  }
};
