# VaultVerify — Development TODO

Persisted from the user-approved "Superadmin as Command Center" plan (AI-Mode blueprint triage: adopt/reject recorded in `worklog.md`, Task IDs `SUPERADMIN-COMMAND-P1` / `SUPERADMIN-COMMAND-P2`).
Statuses below were verified against actual git history at the time of writing — do not trust memory, re-run `git log --oneline` to re-verify.

## Completed

- [x] **Phase 1 — Command & enforce** (commit `d5f2103`)
  Credit ledger with hard block, company suspend/read-only, user suspend with session kill, request revoke, fraud-flag decisions, audit console, maintenance mode, connectivity pings (Postgres + Brevo).
- [x] **Phase 2 — Security & oversight** (commit `3e46ce1`)
  View-as read-only dossiers, security center (password resets + temp passwords + failed-login counters), session revocation incl. platform-wide, shared-links oversight, email delivery health, CSV exports, `/?reset` portal flow.

## Phase 3 — Queued

- [ ] **3-tier RBAC** — role tiers beyond the sole superadmin with scoped permissions (deferred from the Phase 1 blueprint triage; scope per the approved blueprint).
- [ ] **Fraud tuning UI** — console controls for fraud-flag rules/thresholds so triage tuning does not require code changes.
- [ ] **Checklist cloning** — duplicate an existing skills-checklist template (questions, extras, scoring) as a starting point for new ones.

## Rejected from blueprint — do not resurrect

- Unlogged bypasses — every privileged command must write to the audit trail.
- Force-complete checklists — violates candidate attestation integrity.
- Redis / DLQ / SMTP-interceptor items — not applicable to the current stack.

## Operational follow-ups (user-side)

- [ ] Vercel: paste environment variables (generated list), redeploy, confirm signup end-to-end.
- [ ] Brevo: verify the sender so verification/invite emails deliver for real instead of being simulated.
