#!/usr/bin/env bash
# Run all QA suites (E2E needs jsdom + fake-indexeddb in NODE_PATH and a server on :8931)
cd "$(dirname "$0")/.."
fail=0
node tests/engine.test.js | tail -2 || fail=1
node tests/parser.test.js | tail -2 || fail=1
if [ -n "$NODE_PATH" ] || [ -d node_modules ]; then
  (python3 -m http.server 8931 >/dev/null 2>&1 &) ; sleep 1
  NODE_PATH="${NODE_PATH:-$PWD/node_modules}" node tests/e2e.test.js | tail -4 || fail=1
else
  echo "── E2E skipped (no jsdom/fake-indexeddb — see tests/README.md)"
fi
exit $fail
