/* ============================================================
 * AGNIVEER VAYU CBT — UTILITIES
 * ============================================================ */

const AVUtil = {
  uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* v1.4.73 DISPLAY entity decode: user files me chapter/topic me 'A &amp; B'
     format aata hai (HTML-source). Data AS-IS rehta hai; sirf VISIBLE text me
     '&amp;' → '&' (esc se PEHLE decode, taaki render '&amp;' literal na dikhe).
     Sirf &-entity decode hota hai — tags/attributes safety esc me hi hai. */
  deEnt(s) {
    return String(s == null ? '' : s).replace(/&amp;/g, '&');
  },

  /* v1.4.74 IMAGE src normalizer: user files me image field kabhi-kabhi
     markdown-wrapped hota hai ('[url](url)') — <img src> me seedha lagane par
     broken/link jaisa dikhta hai. Ye helper plain URL nikaal ke deta hai:
     [x](y) → y · 'url (caption)' → url · baaki as-is. DATA NAHI badalta —
     sirf render-time pe src sahi banta hai. Data:/blob: block (XSS-safe). */
  imgSrc(s) {
    let v = String(s == null ? '' : s).trim();
    if (!v) return '';
    const md = v.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (md) v = md[2].trim();
    else { const par = v.match(/^(https?:\/\/\S+?)\s*\([^)]*\)$/); if (par) v = par[1].trim(); }
    if (/^\s*(data:|blob:|javascript:)/i.test(v)) return '';
    return v;
  },

  // render question text preserving unicode math, line-ish breaks → keep single flow
  /* v1.4.64: REAL PYQ tag — source/paper se compact chip
     ("CHSL Tier-I (03 July 2024) Shift 4"). Sirf display; source na ho to ''. */
  pyqTag(q) {
    const src = String((q && (q.source || q.paper)) || '').trim();
    if (!src) return '';
    const label = src.replace(/^SSC\s+CHSL\s+Tier-?\s*I\s+PYQ\s*·\s*/i, '').replace(/Shift\s*-\s*/i, 'Shift ');
    return `<span class="q-src" title="${AVUtil.esc(src)}">📄 ${AVUtil.esc(label)}</span>`;
  },

  qtext(s) {
    /* v1.4.61 SAFE RICH-TEXT: pehle POORA escape (XSS-safe), phir sirf
       whitelist tags (u b i em strong sub sup br) render ke liye wapas kholo.
       English fill-in-blanks ke <u> underline + math/science ke <sub>/<sup>
       ab sahi dikhte hain; baaki koi bhi tag (<SELECT> type GK Qs) text
       me hi dikhta hai — safe + sahi dono. */
    return AVUtil.esc(s).replace(/\n/g, '<br>')
      .replace(/&amp;nbsp;/g, '\u00A0')
      .replace(/&amp;amp;/g, '&amp;')
      .replace(/&lt;(\/?)(u|b|i|em|strong|sub|sup|br)\s*\/?&gt;/gi, '<$1$2>');
  },

  /* Hindi gate: field me ACTUALLY Devanagari hai? (English copy fake "Hindi" pakdo)
     English subject ke questions me questionTextHi = questionText (English clone)
     tha — toggle karne par bhi English hi dikhta tha. Ab har Hindi render isi
     choke-point se guzrega. */
  hasDevanagari(s) {
    return !!(s && /[\u0900-\u097F]/.test(String(s)));
  },
  hi(hiText, fallback) {
    return AVUtil.hasDevanagari(hiText) ? hiText : (fallback || '');
  },

  fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },

  fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  fmtDur(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  },

  fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  },

  pct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; },

  clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); },

  shuffle(arr, rng) {
    const a = arr.slice();
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // seeded RNG (mulberry32) — reproducible tests when desired
  seeded(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  hash(s) {
    // FNV-1a-ish, hex — content ids & dupe hashes
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    s = String(s);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + c * 31) >>> 0;
    }
    return (h1.toString(16) + h2.toString(16)).padStart(16, '0').slice(0, 16);
  },

  debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  },

  $(sel, root) { return (root || document).querySelector(sel); },
  $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },

  el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  },

  toast(msg, kind) {
    let host = document.getElementById('av-toast-host');
    if (!host) {
      host = AVUtil.el('div', { id: 'av-toast-host' });
      document.body.appendChild(host);
    }
    const t = AVUtil.el('div', { class: 'av-toast ' + (kind || 'info') }, AVUtil.esc(msg));
    host.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5200 : 3200);
  },

  confirmModal(opts) {
    // serious exam-style modal, returns Promise<boolean>
    return new Promise(resolve => {
      const ov = AVUtil.el('div', { class: 'av-modal-overlay', role: 'dialog', 'aria-modal': 'true' });
      ov.innerHTML = `
        <div class="av-modal ${opts.serious ? 'serious' : ''}">
          ${opts.title ? `<div class="av-modal-title">${AVUtil.esc(opts.title)}</div>` : ''}
          <div class="av-modal-body">${opts.html || AVUtil.esc(opts.body || '')}</div>
          <div class="av-modal-actions">
            <button type="button" class="btn btn-plain" data-act="no">${AVUtil.esc(opts.noLabel || 'Cancel')}</button>
            <button type="button" class="btn ${opts.yesClass || 'btn-primary'}" data-act="yes">${AVUtil.esc(opts.yesLabel || 'Confirm')}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const done = v => { ov.remove(); resolve(v); };
      ov.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.getAttribute('data-act');
        if (act) return done(act === 'yes');
        if (e.target === ov && !opts.serious) return done(false);
      });
      const onKey = e => {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); done(false); }
      };
      document.addEventListener('keydown', onKey);
      ov.querySelector('[data-act="yes"]').focus();
    });
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AVUtil;
