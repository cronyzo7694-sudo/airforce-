# Agniveer CBT — QA / Test Suite

Five suites, all currently **green (231 checks)** — `npm install` + static server ke saath:

| Suite | What it covers | Run |
|---|---|---|
| `engine.test.js` (54) | Exam state machine: attempt creation, section locking, timers (global + per-section), responses, evaluation, negative marking, submission pipeline, generator — incl. **smart strategy** (retire after 2× correct, wrong-question revision, fallback) and **test-series planner** (non-overlapping ready-made tests) | `node tests/engine.test.js` |
| `cloud.test.js` (46) | Worker API in Node (Google-token auth incl. real-JWKS forged-signature reject, CORS, push/pull/status, media guard, 🔗 share create/get/attempt/attempts — no-auth paths + 5s flood guard) | `node tests/cloud.test.js` |
| `e2e-flows.test.js` (31) | Multi-step user journeys in jsdom (import → bank, builder → custom test, backup → restore, etc.) | `NODE_PATH=./node_modules node tests/e2e-flows.test.js` |
| `ui-audit.js` (0 err) | Har route walk + console-error hunt + DOM leak (undefined/NaN) + CSS class coverage + i18n key check | `NODE_PATH=./node_modules node tests/ui-audit.js` |
| `parser.test.js` (15) | JS parser ↔ Python reference parity for all 4 master TXT files (after importer dedupe), format-A/B/D blocks, figure-based questions, garble recovery, generic TXT/JSON/CSV, backup-JSON restore payload (incl. notes), dupe hash logic | `node tests/parser.test.js` |
| `e2e.test.js` (86) | Boots the real `index.html` in **jsdom** with **fake-indexeddb**, seeds the bank + **builds the 35-test series**, then drives the UI: dashboard → quick-start (smart strategy) → instructions → CBT exam (answering / marking / palette / section submit / refresh recovery) → result → analysis tabs → **notebook save + persistence** → test library (series filter) → bank, attempts, settings, import → practice test with global timer + practice notebook | `NODE_PATH=<dir-with-jsdom+fake-indexeddb> node tests/e2e.test.js` (needs a static server on port 8931: `python3 -m http.server 8931` from the app root) |

## Setup for the E2E suite

```bash
npm install                # package.json ab repo me hai (jsdom + fake-indexeddb)
python3 -m http.server 8931 &      # serve the app root (e2e/ui-audit ke liye)
npm test                          # engine + parser + cloud + e2e + flows
```

> `parser.test.js` ka master-parity section `../uploads/Master_*.txt` (user ke real
> data files) padhta hai jo repo me commit nahi hote — fresh clone par wo specific
> checks **skip** ho jate hain (fail nahi).

## Regenerating the question bank

```bash
python3 tools/parse_master.py     # reads ../uploads/*.txt → data/bank-*.json
```

Current bank: **2,721 questions** — physics 628, mathematics 703, english 749, RAGA 641 (sab keyed; figure-based questions pool me kabhi nahi aate). Counts `data/bank-meta.json` me auto-generated hain.

## Ready-made test series

On first seed (and via an upgrade path for existing installs) the app builds **35 fixed tests with zero question overlap**:

- **15 Full Mock Tests** (100 Q each, exam mode)
- **5 subject tests × 4 subjects** (25 Q each, practice mode)

The library page has a **Test Series** filter and a **⚡ More Tests** button (adds 5 mocks + 8 subject tests from unused questions on each click).

## Smart repetition rules (default strategy)

- A question answered **correctly 2×** is retired from all future papers (only reused if the pool can't otherwise fill the paper)
- **Wrong** questions stay in circulation for revision (~20% of each paper)
- Once-correct questions get one confirmation round (~10%)
- The rest (~70%) is fresh, never-seen material — so the paper always feels new, not recycled

## My Notebook (per-question custom notes)

Notes live in the `notes` IndexedDB store (DB v2), appear with every solution (analysis review cards + practice-mode exam screen), are editable from the question bank manager, and are included in Settings backups/restores.
