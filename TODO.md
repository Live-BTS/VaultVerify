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
- [x] **OD-01 — static access codes retired** (2026-10-18)
  Superadmin console is OTP-only (no static recovery code anywhere in code or tests); recruiter legacy code path was already gone (CH-07). Source + behavior regression gates in `secCodes.test.ts`.
- [x] **OD-04 — production clean slate** (2026-10-18)
  All prod accounts/transactional data deleted (480 rows backed up first to `download/prod-backup-*`, kept out of git); 55 builtin templates preserved. Demo seed already gated out of production (CH-02).
- [x] **EMAIL-EXCLUSIVITY — one email, one identity type** (2026-10-18)
  A recruiter-registered email cannot register as candidate (and vice versa, including candidate profile rows). Shared guard `src/lib/bts/emailExclusivity.ts` used by both signup roles + the reference claim flow; gates in `tests/emailExclusivity.test.ts`.

## Rejected from blueprint — do not resurrect

- Unlogged bypasses — every privileged command must write to the audit trail.
- Force-complete checklists — violates candidate attestation integrity.
- Redis / DLQ / SMTP-interceptor items — not applicable to the current stack.

## Operational follow-ups (user-side) — updated 2026-10-18 (owner decisions applied)

- [x] **Supabase DB password: rotation DECLINED by owner** (2026-10-18). Current password stays; git-history exposure accepted. Custody: agent keeps it only in gitignored `.vv-prod-dsn` (chmod 600), connectivity re-verified live (55 templates, clean slate). No `DATABASE_URL` change needed in Vercel.
- [ ] **Vercel env**: add `APP_ORIGIN=https://vaultverify.vercel.app` (Production only; exact value — no trailing slash, no quotes) — pins the origin used to build absolute emailed links (anti Host-header poisoning; completes MAIL-F1). `SUPERADMIN_CODE`: **set/keep a new strong value here** — per the amended OD-01 (2026-10-18) the Vercel env is the ONLY place the console backup code exists (no hardcoded value anywhere; backup path fails closed with an honest message until it is set). `RECRUITER_CODE`: **delete it** — the recruiter code is retired entirely, no code path reads it. Then redeploy.
- [ ] **Brevo: buy the domain, then authenticate the sender** (SPF + DKIM + DMARC) so verification/invite emails stop landing in spam.
- [ ] **Live validation**: re-send one skills-checklist invite and watch the row move Sent → Opened → In progress % → Completed (UX-F3 tracking is live but has never run against a real invite).
