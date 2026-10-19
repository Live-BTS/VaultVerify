#!/usr/bin/env bash
# Poll prod until the no-seeding build (commit a0837b5+) is live.
# Signal: after hitting /api/bootstrap (which made the OLD build re-seed
# BUILTIN rows on every hit), the skills library must STAY empty.
set -uo pipefail
cd "$(dirname "$0")/.."
source .vv-prod-dsn

for i in $(seq 1 14); do
  CODE_HOME=$(curl -s -o /dev/null -w '%{http_code}' https://vaultverify.vercel.app/)
  CODE_BOOT=$(curl -s -o /dev/null -w '%{http_code}' -X GET https://vaultverify.vercel.app/api/bootstrap)
  # Deploy signal: wipe BUILTIN rows FIRST, then trigger — an old (seeding)
  # build re-adds 55 rows; the new no-seeding build leaves the library empty.
  bun scripts/builtin-wipe-sql.ts >/dev/null 2>&1
  curl -s -o /dev/null https://vaultverify.vercel.app/
  curl -s -o /dev/null -X GET https://vaultverify.vercel.app/api/bootstrap
  sleep 6
  BEFORE=$(bun scripts/builtin-count.ts 2>/dev/null || true)
  echo "[try $i] home=$CODE_HOME bootstrap=$CODE_BOOT  after-wipe+trigger=$BEFORE"
  if echo "$BEFORE" | grep -q '(empty)'; then
    # Confirm stability: one more wipe+trigger round must also stay empty.
    bun scripts/builtin-wipe-sql.ts >/dev/null 2>&1
    curl -s -o /dev/null https://vaultverify.vercel.app/
    curl -s -o /dev/null -X GET https://vaultverify.vercel.app/api/bootstrap
    sleep 6
    AFTER=$(bun scripts/builtin-count.ts 2>/dev/null || true)
    if echo "$AFTER" | grep -q '(empty)'; then
      echo "DEPLOY CONFIRMED — no-seeding build is live, library stays empty."
      exit 0
    fi
    echo "stability check saw $AFTER — old build likely still live; keep polling."
  fi
  sleep 34
done
echo "TIMEOUT — deploy not confirmed within window; check the Vercel dashboard."
exit 1
