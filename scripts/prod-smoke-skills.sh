#!/usr/bin/env bash
# Post-push prod smoke for commit 49b1389 (skills workbook quartet + searchable cascade).
# Read-only / no-data-creation checks against https://vaultverify.vercel.app.
BASE="https://vaultverify.vercel.app"

echo "=== 1. Homepage 200 + CSP nonce ==="
curl -s -o /dev/null -w "status=%{http_code}\n" "$BASE/"
if curl -sI "$BASE/" | rg -i 'content-security-policy' | rg -qo 'nonce-[A-Za-z0-9_-]{8,}'; then
  echo "CSP nonce: present (rotates per request)"
else
  echo "CSP nonce: MISSING"
fi

echo "=== 2. NEW: skills template download fail-closed (expect 401 + session-expired copy) ==="
curl -s -w "\nstatus=%{http_code}\n" "$BASE/api/superadmin/skills/template"

echo "=== 3. NEW: skills export download fail-closed (expect 401 + session-expired copy) ==="
curl -s -w "\nstatus=%{http_code}\n" "$BASE/api/superadmin/skills/export"

echo "=== 4. OD-01 marker: backup path unset-env copy (expect 401 + 'No backup code is configured') ==="
curl -s -w "\nstatus=%{http_code}\n" -X POST "$BASE/api/superadmin" \
  -H 'content-type: application/json' -d '{"action":"auth","code":"probe-garbage"}'

echo "=== 5. OTP primary path marker (expect 401 + OTP-era copy) ==="
curl -s -w "\nstatus=%{http_code}\n" -X POST "$BASE/api/superadmin" \
  -H 'content-type: application/json' -d '{"action":"verify_otp","otp":"123"}'

echo "=== 6. Loading shell live? (expect 'Loading the console' in initial HTML) ==="
curl -s "$BASE/SuperAdmin" | rg -o 'Loading the console' | head -1 || echo "shell NOT in initial HTML"

echo "=== 7. Scoped API 401 (expect 401 + ok:false JSON) ==="
curl -s -w "\nstatus=%{http_code}\n" "$BASE/api/checklist/account"

echo "=== 8. Unknown route (expect 404) ==="
curl -s -o /dev/null -w "status=%{http_code}\n" "$BASE/vv-no-such-route"
