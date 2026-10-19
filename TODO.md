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
- [x] **Auth deep-audit round 2 + pre-filled skills data removed** (2026-10-20, commit `a0837b5` local — see PUSH PENDING below)
  Root causes of the persistent "index → sign-in → auto-login" cycle: (1) `/api/auth` gated `me`+`signout` behind a fail-closed DB check — a transient Supabase 503 made logout silently no-op AND evicted the last-role marker; (2) the homepage probe was marker-gated, so an evicted marker + live cookie painted the landing → sign-in CTA → phantom auto-enter; (3) SuperAdmin exit fired a fire-and-forget logout the navigation could abort. Fixes: `me`/`signout`/`logout` bypass the writability gate; homepage probes on EVERY plain load (3s-bounded, marker only a hint, cleared only on definitive ok:null); SA exit awaits logout (1.5s race, keepalive). OWNER DIRECTIVE: BUILTIN starter catalog deleted — `seedBuiltinTemplates` + `/api/bootstrap` seeding removed; skills library starts EMPTY (owner imports via SuperAdmin). Browser walkthrough of the exact owner scenario: all green (300/300 vitest, tsc 0, build OK).

## Rejected from blueprint — do not resurrect

- Unlogged bypasses — every privileged command must write to the audit trail.
- Force-complete checklists — violates candidate attestation integrity.
- Redis / DLQ / SMTP-interceptor items — not applicable to the current stack.

## Operational follow-ups (user-side) — updated 2026-10-20

- [x] **PUSH DONE — remote main = local main = `add3b55`** (2026-10-20): owner pasted the fine-grained PAT in chat; agent restored git credential custody (`.vv-git-credentials` + `~/.git-credentials`, chmod 600, gitignored), verified read-only via ls-remote, then pushed with `--force-with-lease` (remote `23da2a2` was a mode-only rewrite of local `0800068`; content-identical, 0 insertions/deletions verified). Vercel auto-deployed; deploy-completeness probe confirmed the no-seeding build live (see next item). NOTE: the PAT now lives in chat history — if it ever leaks concerns arise, regenerate in GitHub → Settings → Developer settings and paste the new one.
- [x] **PROD DSN CUSTODY RESTORED + BUILTIN WIPE FULLY DONE** (2026-10-20): owner supplied the DB password in chat; agent rebuilt `.vv-prod-dsn` (session pooler `aws-0-ap-northeast-1:5432`, chmod 600, `SELECT 1` verified) via the project ref pinned in `scripts/probe-supabase.ts`. The old build re-seeded 55 rows on bootstrap hits during the pre-deploy window; after the new build deployed, the corrected **wipe → trigger → recount** probe (`scripts/poll-deploy-builtin.sh` + `builtin-wipe-sql.ts` + `builtin-count.ts`, all Prisma-client-independent) confirmed twice: library stays EMPTY on the live site — no code path seeds BUILTIN anymore. Owner now populates the library exclusively via SuperAdmin workbook imports (source=IMPORT). Lesson recorded: a no-seeding deploy must be verified as wipe→trigger→recount, never count-only — leftover rows persist by design.
- [x] **Supabase DB password: rotation DECLINED by owner** (2026-10-18). Current password stays; git-history exposure accepted. Custody: agent keeps it only in gitignored `.vv-prod-dsn` (chmod 600), connectivity re-verified live (55 templates, clean slate). No `DATABASE_URL` change needed in Vercel. NOTE (2026-10-20): custody re-restored from the owner-supplied password (`.vv-prod-dsn` rebuilt + probed OK); owner was reminded the password now lives in chat history — rotation offer stands.
- [ ] **Vercel function region** (biggest data-speed lever): Project Settings → Functions → Function Region → **hnd1 (Tokyo)** — co-locates functions with Supabase (ap-northeast-1) and cuts ~150-250ms off EVERY database round trip. Also confirm `DATABASE_URL` uses the transaction pooler (`:6543`) with `pgbouncer=true`.
- [ ] **Vercel env**: add `APP_ORIGIN=https://vaultverify.vercel.app` (Production only; exact value — no trailing slash, no quotes) — pins the origin used to build absolute emailed links (anti Host-header poisoning; completes MAIL-F1). `SUPERADMIN_CODE`: **confirmed set on prod** (2026-10-19 smoke: backup path returns the generic 401, not the "not configured" copy) — per the amended OD-01 (2026-10-18) the Vercel env is the ONLY place the console backup code exists. `RECRUITER_CODE`: **delete it** — the recruiter code is retired entirely, no code path reads it (not externally probeable; owner to confirm).
- [ ] **Brevo: buy the domain, then authenticate the sender** (SPF + DKIM + DMARC) so verification/invite emails stop landing in spam.
- [ ] **Live validation**: re-send one skills-checklist invite and watch the row move Sent → Opened → In progress % → Completed (UX-F3 tracking is live but has never run against a real invite).
