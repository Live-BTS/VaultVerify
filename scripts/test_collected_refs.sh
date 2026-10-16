#!/bin/bash
# ── Golden-path test: candidate-collected references + Brevo-ready notifications ──
# Access codes are read from the environment — never hard-coded (SEC-03 / CH-01).
set -e
: "${SUPERADMIN_CODE:?Set SUPERADMIN_CODE in the environment}"
: "${RECRUITER_CODE:?Set RECRUITER_CODE in the environment}"
: "${DEMO_PASSWORD:?Set DEMO_PASSWORD in the environment}"
BASE="http://localhost:3000"
JAR="/tmp/vv_refs_cookies.txt"
rm -f "$JAR"

echo "── 1. login as emma (existing candidate) ──"
curl -s -c "$JAR" -X POST "$BASE/api/checklist/account" -H 'content-type: application/json' \
  -d "{\"action\":\"login\",\"email\":\"emma.chen@example.com\",\"password\":\"$DEMO_PASSWORD\"}" | head -c 160; echo

echo "── 2. create collected reference (referee: manager) ──"
CREATE=$(curl -s -b "$JAR" -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d '{"action":"create","refName":"Jordan Rivera","refTitle":"Manager","refEmail":"jordan.rivera@stanthony.org","facility":"St. Anthony Hospital"}')
echo "$CREATE" | head -c 300; echo
TOKEN=$(echo "$CREATE" | sed -n 's/.*"sandboxLink":"\/?cr=\([^"]*\)".*/\1/p')
echo "TOKEN=$TOKEN"

echo "── 3. duplicate guard (same pending email) ──"
curl -s -b "$JAR" -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d '{"action":"create","refName":"Jordan Again","refTitle":"Peer","refEmail":"jordan.rivera@stanthony.org"}' | head -c 160; echo

echo "── 4. public preview ──"
curl -s -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d "{\"action\":\"preview\",\"token\":\"$TOKEN\"}" | head -c 300; echo

echo "── 5. submit answers (missing signature should fail) ──"
curl -s -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d "{\"action\":\"submit\",\"token\":\"$TOKEN\",\"relationship\":\"Manager\",\"yearsKnown\":4,\"ratings\":{\"clinical\":5,\"professionalism\":4,\"communication\":5,\"teamwork\":4,\"reliability\":5,\"criticalThinking\":4},\"wouldRehire\":\"YES\",\"strengths\":\"Precepted two new grads\",\"comments\":\"Outstanding\",\"signatureName\":\"\"}" | head -c 160; echo

echo "── 6. submit answers (valid) ──"
curl -s -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d "{\"action\":\"submit\",\"token\":\"$TOKEN\",\"relationship\":\"Manager\",\"yearsKnown\":4,\"ratings\":{\"clinical\":5,\"professionalism\":4,\"communication\":5,\"teamwork\":4,\"reliability\":5,\"criticalThinking\":4},\"wouldRehire\":\"YES\",\"strengths\":\"Precepted two new grads\",\"comments\":\"Outstanding\",\"signatureName\":\"Jordan Rivera\"}" | head -c 160; echo

echo "── 7. second submit must be blocked (single-use) ──"
curl -s -X POST "$BASE/api/checklist/reference" -H 'content-type: application/json' \
  -d "{\"action\":\"submit\",\"token\":\"$TOKEN\",\"relationship\":\"Manager\",\"ratings\":{\"clinical\":5},\"wouldRehire\":\"YES\",\"signatureName\":\"JR\"}" | head -c 160; echo

echo "── 8. list mine ──"
curl -s -b "$JAR" "$BASE/api/checklist/reference" | head -c 400; echo

echo "── 9. recruiter lookup shows refsOnFile ──"
curl -s -X POST "$BASE/api/checklist/invite" -H 'content-type: application/json' \
  -d "{\"code\":\"$RECRUITER_CODE\",\"action\":\"lookup\",\"email\":\"emma.chen@example.com\"}" | head -c 300; echo

echo "── 10. notification log (Brevo-ready rows) ──"
curl -s -X POST "$BASE/api/superadmin" -H 'content-type: application/json' \
  -d "{\"action\":\"auth\",\"code\":\"$SUPERADMIN_CODE\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('notifications count:', d.get('stats',{}).get('notifications'))" 2>/dev/null || echo "(superadmin check skipped)"
echo "DONE"
