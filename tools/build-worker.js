#!/usr/bin/env node
/* ============================================================
 * BUILD-WORKER — sync-worker.js se CF-deployable build banata hai.
 * Node-mode tail (require('http') wala local server) CF Workers
 * build me resolve nahi hota — isliye deploy build me tail strip
 * hota hai (wrangler.toml [build] se auto-chalta hai).
 * Output: worker/cf-dist.js (gitignored, har deploy pe fresh).
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'sync-worker.js'), 'utf8');
const MARK = '/* ---------------- Node mode (local server / tests) ---------------- */';
const i = src.indexOf(MARK);
if (i < 0) { console.error('build-worker: Node-mode marker nahi mila — sync-worker.js structure check karo'); process.exit(1); }
const out = src.slice(0, i).trimEnd() + '\n';
/* esbuild module shim ki wajah se `typeof module === 'undefined'` kabhi true
   nahi hota → "No event handlers" (10021). CF build me wo condition hata do —
   Node runtime me addEventListener hota hi nahi, dual-guard safe hai. */
const patched = out.replace(
  "typeof addEventListener === 'function' && typeof Response !== 'undefined' && typeof module === 'undefined'",
  "typeof addEventListener === 'function' && typeof Response !== 'undefined'");
fs.writeFileSync(path.join(__dirname, '..', 'worker', 'cf-dist.js'), patched);
console.log('worker/cf-dist.js built:', out.length, 'bytes (Node tail stripped)');
