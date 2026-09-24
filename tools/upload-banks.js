#!/usr/bin/env node
/* ============================================================
 * UPLOAD-BANKS — Neon `bank_blobs` me question banks upload.
 *
 * Kya karta hai:
 *   data/<exam>/bank-<subject>.json → bank_blobs row (single jsonb blob,
 *   content-hash version) → worker GET /bank se serve hota hai.
 *   Meta bhi ja sakta hai (subject='meta', payload = meta object).
 *
 * Connection (PROPER USE):
 *   • Upload/admin → DATABASE_URL_POOLED (PgBouncer TCP, pg driver)
 *   • Worker runtime → NEON_CS (direct host, HTTP /sql)  [worker side]
 *
 * Usage:
 *   node tools/upload-banks.js --exam=ssc-chsl --subjects=gs,english,reasoning --include-meta
 *   CS env me: DATABASE_URL_POOLED / NEON_CS_POOLED, ya --cs=<url>
 *   (channel_binding param auto-strip — HTTP/TC both fine)
 *
 * Version = sha256(file-bytes)[:12] — content-addressed:
 *   same content → same version → clients re-download NAHI karte.
 * Idempotent: dobara chalao to sirf upsert hota hai.
 * Math jaisa subject skip karna ho to --subjects me mat daalo.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const args = {};
process.argv.slice(2).forEach(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] !== undefined ? m[2] : true;
});

const EXAM_DIRS = { airforce: 'airforce', 'ssc-chsl': 'ssc-chsl' };
const exam = args.exam || 'ssc-chsl';
if (!EXAM_DIRS[exam]) { console.error('unknown --exam:', exam); process.exit(1); }
/* --dir=<path> optional: v2 banks jaise alternate folder se upload
   (default data/<exam>/ untouched rehta hai) */
const dir = args.dir || args.d ? path.resolve(String(args.dir || args.d)) : path.join(ROOT, 'data', EXAM_DIRS[exam]);

let subjects = args.subjects
  ? String(args.subjects).split(',').map(s => s.trim()).filter(Boolean)
  : ['mathematics', 'english', 'reasoning', 'gs'];   // default: sab (ssc-chsl)
let includeMeta = false;   // default: off; --include-meta ya --meta se on
if (args['include-meta'] || args.meta) includeMeta = true;

function connStr() {
  let cs = args.cs || process.env.DATABASE_URL_POOLED || process.env.NEON_CS_POOLED || process.env.DATABASE_URL || process.env.NEON_CS;
  if (!cs) { console.error('No connection string — DATABASE_URL_POOLED env ya --cs do'); process.exit(1); }
  return cs.replace(/([?&])channel_binding=[^&]*/g, '$1').replace(/[?&]\s*$/, '').replace(/\?$/, '');
}

async function main() {
  const { Client } = require('pg');
  const c = new Client({ connectionString: connStr() });
  await c.connect();
  console.log('connected (pooled) → uploading', exam);
  const now = Date.now();
  for (const s of subjects) {
    const f = path.join(dir, `bank-${s}.json`);
    if (!fs.existsSync(f)) { console.error('  SKIP (missing):', f); continue; }
    const buf = fs.readFileSync(f);
    const version = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    let payload;
    try { payload = JSON.parse(buf.toString('utf8')); } catch (e) { console.error('  PARSE FAIL:', s, e.message); continue; }
    const qCount = Array.isArray(payload) ? payload.length : 0;
    const r = await c.query(
      `INSERT INTO bank_blobs (exam, subject, version, q_count, updated_at, payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (exam, subject) DO UPDATE
       SET version = EXCLUDED.version, q_count = EXCLUDED.q_count,
           updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`,
      [exam, s, version, qCount, now, JSON.stringify(payload)]
    );
    console.log(`  ${s}: ${qCount} Q, version ${version} → upserted (rows ${r.rowCount})`);
  }
  if (includeMeta) {
    const f = path.join(dir, 'bank-meta.json');
    if (fs.existsSync(f)) {
      const buf = fs.readFileSync(f);
      const version = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
      const payload = JSON.parse(buf.toString('utf8'));
      await c.query(
        `INSERT INTO bank_blobs (exam, subject, version, q_count, updated_at, payload)
         VALUES ($1,'meta',$2,0,$3,$4)
         ON CONFLICT (exam, subject) DO UPDATE
         SET version = EXCLUDED.version, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`,
        [exam, version, now, JSON.stringify(payload)]
      );
      console.log(`  meta: version ${version} → upserted`);
    }
  }
  // verify
  const v = await c.query('SELECT subject, version, q_count, updated_at FROM bank_blobs WHERE exam = $1 ORDER BY subject', [exam]);
  console.log('bank_blobs:', JSON.stringify(v.rows));
  await c.end();
}
main().catch(e => { console.error('UPLOAD FAIL:', e.message); process.exit(1); });
