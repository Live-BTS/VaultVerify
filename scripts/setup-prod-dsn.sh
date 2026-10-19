#!/usr/bin/env bash
# VaultVerify — restore Supabase PROD DSN custody in a freshly recycled sandbox.
#
# Why: the dev sandbox is disposable and every recycle wipes the gitignored
# `.vv-prod-dsn` file (the durable home for the DSN is the owner's password
# manager — see TODO.md "Supabase DB password"). Without it, prod-only
# operations (BUILTIN template wipe, prod smoke scripts) cannot run. This
# script re-provisions the CURRENT sandbox from the owner's password manager.
# The DSN is read with hidden input, written with owner-only permissions,
# never echoed, never logged, never committed.
#
# Usage:  bash scripts/setup-prod-dsn.sh
set -euo pipefail

DSN_FILE=".vv-prod-dsn"

printf 'Paste the Supabase PROD pooler DSN (postgres://… — input hidden): '
IFS= read -rs DSN
echo
[ -n "$DSN" ] || { echo "ERROR: no DSN supplied." >&2; exit 1; }

case "$DSN" in
  postgres://*|postgresql://*) ;;
  *) echo "ERROR: not a postgres:// DSN." >&2; exit 1 ;;
esac
case "$DSN" in
  *pooler*) : ;; # Supabase session-pooler hosts contain "pooler"
  *) echo "WARNING: DSN does not look like a Supabase pooler host (prod scripts require the pooler DSN)." >&2 ;;
esac

umask 077
{
  echo "# VaultVerify PROD DSN custody (owner-approved; gitignored; chmod 600)"
  echo "# Source it before prod-only scripts:  source .vv-prod-dsn"
  echo "export DATABASE_URL='${DSN//\'/\'\\\'\'}'"
} > "$DSN_FILE"
chmod 600 "$DSN_FILE"
echo "Wrote $DSN_FILE (chmod 600)."

# Read-only connectivity probe: prisma db execute against the Postgres schema.
# SELECT 1 returns no rows and writes nothing — it only proves the DSN works.
echo "Probing connectivity (read-only)…"
if echo "SELECT 1;" | npx prisma db execute --stdin --schema prisma/schema.postgres.prisma >/dev/null 2>&1; then
  echo "OK — prod database reachable. Prod-only scripts are unblocked:"
  echo "  source $DSN_FILE && bun scripts/<prod-script>.ts"
else
  echo "WARNING: probe failed — check the DSN (host, password, sslmode). The file is written; fix by re-running this script."
fi
