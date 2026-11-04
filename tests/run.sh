#!/usr/bin/env bash
# Runs every LIVENITE test. Usage, from the repository folder: bash tests/run.sh
# Needs Node.js, Python 3 and Java (for the practice database). First time: (cd tests && npm install)
set -u
cd "$(dirname "$0")/.."
fail=0
# Each test prints PASS/FAIL lines and ends with "all passed" (or "all N passed") when everything passed.
run() { echo "== $1"; out=$(node "tests/$@" 2>&1); echo "$out" | grep -E "^(FAIL|all |[0-9]+ failed)|Error" | head -20; echo "$out" | grep -q "^all " || fail=1; }

mkdir -p tests/.out
echo "Building the design preview…"
python3 -I preview-tools/build.py . tests/.out/livenite-design.html >/dev/null || exit 1

# 1. Design preview (in a browser; no database needed)
for t in preview-save-rules preview-run-sheet preview-demo preview-startnow preview-wname preview-sofar preview-guide; do run "$t.test.mjs"; done

# 2. Database rules and the site against a practice database (Firebase's local emulator)
# The exact Firebase browser files the site uses (11.0.2), cached so pages load them locally.
mkdir -p tests/.cache/firebase
for f in firebase-app.js firebase-auth.js firebase-firestore.js; do
  [ -s "tests/.cache/firebase/$f" ] || curl -fsS "https://www.gstatic.com/firebasejs/11.0.2/$f" -o "tests/.cache/firebase/$f" || exit 1
done
# The practice database uses the "emulators" settings in the top-level firebase.json.
(tests/node_modules/.bin/firebase emulators:start --only firestore,auth --project demo-prize > tests/.out/emulator.log 2>&1 &)
for i in $(seq 1 90); do grep -q "All emulators ready" tests/.out/emulator.log 2>/dev/null && break; sleep 1; done
clear_db() { curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-prize/databases/(default)/documents" >/dev/null; curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-prize/accounts" >/dev/null; }
clear_db; run database-rules.test.mjs firestore.rules
for t in emu-two-phones-offline emu-run-sheet; do clear_db; run "$t.test.mjs"; done
pkill -f "emulators:start" >/dev/null 2>&1; pkill -f cloud-firestore-emulator >/dev/null 2>&1

[ $fail = 0 ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
exit $fail
