#!/usr/bin/env bash
# VaultVerify — restore Git push access in a freshly recycled sandbox.
#
# Why this exists: the dev sandbox is disposable. Every recycle wipes
# ~/.git-credentials AND `git config credential.helper`, which has stranded
# approved pushes repeatedly. The DURABLE home for the token is the owner's
# password manager (see DEPLOY.md §8) — this script only re-provisions the
# CURRENT sandbox from it. The token is read with hidden input, written with
# owner-only permissions, never echoed, never logged, never committed.
#
# Usage:  bash scripts/setup-git-auth.sh
set -euo pipefail

CRED_FILE="${HOME}/.git-credentials"

printf 'GitHub username (default: Live-BTS): '
IFS= read -r GH_USER
GH_USER="${GH_USER:-Live-BTS}"

printf 'Paste the fine-grained PAT (input hidden): '
IFS= read -rs TOKEN
echo
[ -n "$TOKEN" ] || { echo "ERROR: no token supplied." >&2; exit 1; }

umask 077
: > "${CRED_FILE}.tmp"
if [ -f "$CRED_FILE" ]; then
  # Drop any stale github.com entry; keep unrelated lines untouched.
  grep -v 'https://[^@[:space:]]*@github\.com' "$CRED_FILE" > "${CRED_FILE}.tmp" || true
fi
printf 'https://%s:%s@github.com\n' "$GH_USER" "$TOKEN" >> "${CRED_FILE}.tmp"
mv "${CRED_FILE}.tmp" "$CRED_FILE"
chmod 600 "$CRED_FILE"
unset TOKEN

git config --global credential.helper store

echo "Credentials stored in $CRED_FILE (chmod 600, credential.helper=store)."
echo "Verifying with a READ-ONLY ls-remote (this never pushes)..."
if REMOTE_HEAD="$(git ls-remote origin refs/heads/main | cut -f1)" && [ -n "$REMOTE_HEAD" ]; then
  echo "AUTH OK — push access confirmed. Remote main head: $REMOTE_HEAD"
else
  echo "AUTH FAILED — the token may lack Contents:write on Live-BTS/VaultVerify, or origin is unreachable." >&2
  exit 1
fi
