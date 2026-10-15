# VaultVerify — Development TODO

Persisted from the user-approved "Superadmin as Command Center" plan (AI-Mode blueprint triage: adopt/reject recorded in `worklog.md`, Task IDs `SUPERADMIN-COMMAND-P1` / `SUPERADMIN-COMMAND-P2`).
Statuses below were verified against actual git history at the time of writing — do not trust memory, re-run `git log --oneline` to re-verify.

## Completed

- [x] **Phase 1 — Command & enforce** (commit `d5f2103`)
  Credit ledger with hard block, company suspend/read-only, user suspend with session kill, request revoke, fraud-flag decisions, audit console, maintenance mode, connectivity pings (Postgres + Brevo).
- [x] **Phase 2 — Security & oversight** (commit `3e46ce1`)
  View-as read-only dossiers, security center (password resets + temp passwords + failed-login counters), session revocation incl. platform-wide, shared-links oversight, email delivery health, CSV exports, `/?reset` portal flow.
- [x] **Phase 3 — RBAC, fraud tuning, cloning**
  3-tier RBAC (OWNER / ADMIN / SUPPORT, per-member OTP login, live role changes, session kill on suspend, owner-only commands), fraud detection tuning from the console (per-rule switches + thresholds in PlatformConfig, no redeploy), and checklist set cloning (copy any Profession+JobTitle+Specialty set to a new key).

## Rejected from blueprint — do not resurrect

- Unlogged bypasses — every privileged command must write to the audit trail.
- Force-complete checklists — violates candidate attestation integrity.
- Redis / DLQ / SMTP-interceptor items — not applicable to the current stack.

## Operational follow-ups (user-side)

- [ ] Vercel: paste environment variables (generated list), redeploy, confirm signup end-to-end.
- [ ] Brevo: verify the sender so verification/invite emails deliver for real instead of being simulated.
