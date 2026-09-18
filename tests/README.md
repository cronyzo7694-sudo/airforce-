# Agniveer CBT — QA / Test Suite

Three independent suites, all currently **green (123 checks)**:

| Suite | What it covers | Run |
|---|---|---|
| `engine.test.js` (41) | Exam state machine: attempt creation, section locking, timers (global + per-section), responses, evaluation, negative marking, submission pipeline, generator — incl. **smart strategy** (retire after 2× correct, wrong-question revision, fallback) and **test-series planner** (non-overlapping ready-made tests) | `node tests/engine.test.js` |
| `parser.test.js` (12) | JS parser ↔ Python reference parity for all 4 master TXT files (after importer dedupe), format-A/B/D blocks, figure-based questions, garble recovery, generic TXT/JSON/CSV, backup-JSON restore payload (incl. notes), dupe hash logic | `node tests/parser.test.js` |
| `e2e.test.js` (70) | Boots the real `index.html` in **jsdom** with **fake-indexeddb**, seeds the bank + **builds the 35-test series**, then drives the UI: dashboard → quick-start (smart strategy) → instructions → CBT exam (answering / marking / palette / section submit / refresh recovery) → result → analysis tabs → **notebook save + persistence** → test library (series filter) → bank, attempts, settings, import → practice test with global timer + practice notebook | `NODE_PATH=<dir-with-jsdom+fake-indexeddb> node tests/e2e.test.js` (needs a static server on port 8931: `python3 -m http.server 8931` from the app root) |

## Setup for the E2E suite

```bash
npm install jsdom fake-indexeddb   # anywhere, e.g. /tmp
python3 -m http.server 8931 &      # serve the app root
NODE_PATH=./node_modules node tests/e2e.test.js
```

## Regenerating the question bank

```bash
python3 tools/parse_master.py     # reads ../uploads/*.txt → data/bank-*.json
```

Current bank: **3,082 questions (2,804 keyed)** — physics 715/623, mathematics 738/616, english 894/830, RAGA 735 (657 keyed usable + 78 figure-based kept out of the generator pool).

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
