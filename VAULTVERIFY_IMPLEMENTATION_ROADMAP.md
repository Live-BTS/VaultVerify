# VAULTVERIFY — CONSOLIDATED IMPLEMENTATION ROADMAP

**Document:** `VAULTVERIFY_IMPLEMENTATION_ROADMAP.md` (Option 4 deliverable)
**Date:** 2026-10-16
**Status:** Planning only. **No application code, tests, dependencies, configuration, database records, schema, Git history, remote repository, or deployment was modified to produce this document.** The only files changed by this phase are this document and the protocol worklog entry.
**Repository:** `github.com/Live-BTS/VaultVerify`, inspected in the connected sandbox workspace at its current local commit state (no stale GitHub substitution; nothing pulled, reset, rebased, amended, or pushed).

---

## 1. Executive summary

VaultVerify is a healthcare staffing platform with two deliberately separate workflows — a **Skills Checklist** (candidate self-assessment, 30-day validity, never represented as independently verified) and **Professional References** (independent referee submissions) — with candidate-controlled sharing over both.

Four audit/plan documents exist in the workspace and were reviewed in full for this roadmap: `VAULTVERIFY_TECHNICAL_AUDIT.md`, `VAULTVERIFY_PRODUCT_UX_PLAN.md` (Revision 2 + status addendum), `VAULTVERIFY_SECURITY_PRIVACY_AUDIT.md`, and `VAULTVERIFY_FIX_REPORT.md`. Their findings were cross-checked against the current source tree, and each finding is marked **Confirmed**, **Previously Fixed (verified)**, **Unverified**, **Recommendation**, or **Requires Owner Decision** in the register (Section 3).

**Where the product already stands (verified in code and by the test suite):** the six critical IDOR/authorization findings (C1–C6), the share-policy gap (H1), referee payload minimization (M1), honest identity labels (M2), query-log gating (M5), submit-race handling (M6), suspension enforcement (M7), and cryptographically random capability tokens (M8) are **fixed and regression-protected** by a 40-test vitest suite (executed this session: 40/40 passing). The 30-day validity rule is enforced server-side end-to-end, and the homepage/meta misrepresentation items (12.1a–12.1j) are corrected in the current tree with an automated claim-gate test guarding them.

**What still demands attention (evidence-based, not assumed):** four High-class issues remain open — **SEC-03** (burned static access codes still armed pending owner rotation), **SEC-02** (checklist-PDF IDOR through the invite path plus platform-wide invite list/lookup exposing PII and live claim tokens), **SEC-01** (recruiter visibility is platform-wide rather than per-recipient, with screening data in payloads), and **SEC-07** (unauthenticated bootstrap seeds known-credential demo accounts into every environment, including production). These are joined by Medium items (one-time links not honored by either PDF route — SEC-04/05; the guaranteed-500 collected-references route — SEC-06/H2; decorative referee identity verification — SEC-08; no sign-in throttling — SEC-09; the runtime database and worklog tracked in a public repository — SEC-10/11) and a tail of Low/hardening items.

> **STATUS ADDENDUM (SEC-F7, post-deployment — the paragraph above is the audit-time snapshot, kept for the record):** every High-class item named there is now closed in code and regression-tested: SEC-03 (CH-01 literal scrub + env-read), SEC-02/SEC-01 (CH-06/07 recruiter-bound sharing, scoped list/lookup, ownership-checked PDF, SEC-01a payload projection), SEC-07 (CH-02 production seed gate). Also closed since: SEC-04/05 (CH-08 one-time links + download audit), SEC-06 (CH-10 retire), SEC-08 (OD-07a honest identity), SEC-09 (Phase D lockout + SEC-F1 resend throttle), SEC-10/11 (untracked; history disposition = OD-08, still owner-gated), SEC-13 (SEC-F2 re-signup guard), SEC-15 (payload projection), SEC-17 (SEC-F3/F4 redaction + audit-PII + SEC-F5/F6 retention, OD-11 owner-approved), SEC-24 (guarded db:push), SEC-19/20/21/22/23/25 + SEC-14 throttle/consent-stamp + SEC-16 attestation versioning (SEC-F7 batch). Still open: OD-08 history scrub (owner decision), SEC-14 mode choice beyond the implemented throttle+stamp default (owner may tighten), SEC-16 legal wording (owner), AuditEvent 180-day deletion (compliance-gated), UX P1 pack (separate batch).

> **STATUS ADDENDUM 2 (2026-10-18, owner-directive batch):** OD-01 closed — the static superadmin recovery code is fully retired (OTP-only console; source + behavior gates in `secCodes.test.ts`), and the recruiter code env is read nowhere. OD-04 closed — production wiped to a clean slate (480 rows exported to a local gitignored backup first; 55 builtin templates preserved; CH-02 demo-seed gate already blocked re-seeding). EMAIL-EXCLUSIVITY shipped — one email cannot hold both a recruiter and a candidate identity (shared guard `src/lib/bts/emailExclusivity.ts` used by both signup roles and the reference claim flow; gates in `tests/emailExclusivity.test.ts`). Rate-limit hardening (roadmap item 8) verified as already covered by Phase D lockout + SEC-F1 resend-429 suites — no gap found. Remaining owner items: Supabase DB password rotation + Vercel env updates (DATABASE_URL / APP_ORIGIN / delete dead code envs), Brevo sender-domain authentication (SPF/DKIM/DMARC) after domain purchase, first real invite to exercise UX-F3 tracking. OD-08 history scrub stays an owner decision; the password rotation supersedes its urgency.

> **STATUS ADDENDUM 3 (2026-10-18, OD-01 amended by owner):** the owner clarified OD-01's intent — the console BACKUP code stays, but only as an env-only path. The superadmin route re-honors a backup code sourced EXCLUSIVELY from the `SUPERADMIN_CODE` env var (lazy per-request read; constant-time compare per SEC-19; fail-closed with honest "not configured" copy when unset; no hardcoded literal anywhere — CH-01 literal gates still enforce this; `ADMIN_BACKUP_LOGIN` audit event on entry). Emailed OTP remains the primary entry. The recruiter code is retired ENTIRELY — `process.env.RECRUITER_CODE` is read by no code path (source gate) and the owner deletes the env var from Vercel. Gates rewritten in `tests/secCodes.test.ts` (env-only source gate, correct-code OWNER unlock, wrong-code 401, unset-env honest message). Console load smoothness: SheetJS removed from the initial /SuperAdmin bundle (lazy import inside `parseWorkbook`) + static route-level loading shell (`src/app/SuperAdmin/loading.tsx`).

**Recommended sequence:** Phase A (security containment), Phase B (validity semantics and one-time-link policy), Phase C (checklist/reference separation — verified clean, preserve), Phase D (regression-test expansion on the existing runner), Phase E (UX and content corrections), Phase F (operational hardening). Phases proceed only through the five approval gates in Section 10; **approval of this roadmap approves nothing by itself** — not implementation, not data migration, not Git pushes, not deployment.

**Recommended first batch** (Section 14): five small, reversible, no-schema containment changes — burned-code literal scrub, production seed gate, untrack `db/custom.db` + `worklog.md`, de-fang `db:push --accept-data-loss`, and recruiter-payload minimization — plus one owner-side ops action (rotating both static codes). Each change carries its own tests and rollback notes.

**Blocking owner decisions** (Section 12): code rotation, demo-data cleanup policy, recruiter share-binding model (the Q3 intent call), invite-ownership schema change, collected-references disposition (Q4), one-time PDF semantics, identity-claim honesty (SEC-08), public onboarding POST (SEC-14), history-scrub policy, and terms.ts legal wording. Implementation cannot begin until Gate 1 (audit acceptance) and Gate 2 (scope approval) are passed for a given batch.

---

## 2. Current baseline and audit-report availability

### 2.1 Repository baseline (recorded 2026-10-16, before this document was created)

| Item | Value |
|---|---|
| Branch | `main` |
| Local HEAD | `13915de` ("Worklog: DELIVERY-AUDIT-1 completion addendum") |
| Working tree | Clean before this phase; after this phase contains only this document + worklog entry (uncommitted, per the Option 4 no-commit rule) |
| Remote | `origin` = `https://github.com/Live-BTS/VaultVerify.git` |
| Relationship to remote | **0 ahead / 0 behind** `origin/main` (local ref, verified after this session's push `0292ec7..50950b2`; no fetch performed — repository state untouched). Workspace and remote are in sync; **no local-only commits exist**. |
| Prior commits preserved | Yes — nothing reset, rebased, amended, or discarded at any point. |

### 2.2 Audit-report availability (all reviewed from actual contents)

| Report | Lines | Status | Notes |
|---|---|---|---|
| `VAULTVERIFY_TECHNICAL_AUDIT.md` | 142 | **Complete** | Findings C1–C6 (critical), H1–H4, M1–M9, L1–L14; positive findings P-a..P-g; produced at Phase C of the technical audit; fixes recorded in the fix report. |
| `VAULTVERIFY_FIX_REPORT.md` | 81 | **Complete** | Phase D–F correction record: what was fixed, what was deliberately deferred, 40/40 test evidence, honest limitations. |
| `VAULTVERIFY_PRODUCT_UX_PLAN.md` | 684 | **Complete** (Revision 2 + Appendix C status addendum) | Claims table 12.1a–12.1j, priorities P0–P3 (14/14.1), acceptance criteria (16), owner questions Q1–Q7 (17), KPIs K1–K10 (18), phased roadmap (20), tech-debt A1–A8 (Appendix A). Note: Appendix A3 ("SkillVerification unused") is **stale** — corrected in Section 3 of this roadmap after code verification. |
| `VAULTVERIFY_SECURITY_PRIVACY_AUDIT.md` | 475 | **Complete** | 22 findings (SEC-01..25); re-verified prior fixes as real; evidence-based, read-only; includes remediation roadmap (§13) and owner decisions (§14). |

No audit report is missing; no findings have been invented. Where the two newer reports disagree with the older UX-plan appendix (the A3 case), the code was inspected and the correction is documented rather than silently propagated.

### 2.3 Test infrastructure

- **Runner:** vitest 5 (dev dependency; added by the technical audit — none existed before). Config `vitest.config.ts`; setup `tests/setup.ts` (disposable SQLite `tests/test-audit.db` via `prisma db push --skip-generate`; `BREVO_API_KEY` forced empty so no real email can ever be sent; dev DB never touched). There is **no `test` script in `package.json`** — tests run via `bunx vitest run`.
- **Suites:** `tests/sharePolicy.test.ts` (14), `tests/authz.test.ts` (25), `tests/copyClaims.test.ts` (1 automated claim-family gate) — **40 tests, all passing when executed this session** (3.79 s).
- **Type baseline:** `bunx tsc --noEmit` = **46 errors, all pre-existing** (re-confirmed this session, 46 = 46). 8 reference the missing `CollectedReference` model (SEC-06/H2). `next.config.ts:31-32` sets `ignoreBuildErrors: true`.
- **Lint:** last recorded run — 11 pre-existing problems, all in `scripts/` dev tooling; zero in `src/`.

### 2.4 Database and schema configuration

- **Dev database:** `db/custom.db` (SQLite), **tracked in Git and published on origin** (SEC-10). Structural inspection (read-only, no record values) classified its contents as **synthetic demo data with unknown drift** — 28 tables, sandbox-scale counts (8 candidates, 18 reference requests, 8 responses, 4 checklist accounts, 7 completions, 6 checklist share links, 2 reference share links, 18 sessions, 45 notification logs, 170 audit events, 0 recruiter accounts, 0 superadmin rows).
- **Schema workflow:** `prisma/schema.prisma` (21 models), **no `prisma/migrations` directory** — schema managed by `db push`. `package.json:10` exposes `"db:push": "prisma db push --accept-data-loss"` with **no environment guard** (SEC-24).
- **Production database:** documented in `DEPLOY.md` as Supabase Postgres. Its contents were **not** inspected (no production access); whether it has been seeded by the public bootstrap endpoint is an owner-verification item (Section 12, OD-04).

### 2.5 Known workspace/remote differences

None. HEAD equals `origin/main` (`13915de`). The only uncommitted content after this phase is this roadmap and the worklog entry, both intentionally uncommitted per the Option 4 rule ("Commit, push, or deploy changes" — not permitted).

---

## 3. Consolidated findings register

One master register. **Sources:** TA = Technical Audit, SEC = Security & Privacy Audit, UX = Product UX Plan, FR = Fix Report. Original IDs are preserved for traceability. **Status values:** `Fixed (verified)` — correction confirmed in current code and/or by tests this session; `Confirmed` — open, evidence-backed in the current tree; `Unverified` — plausible, not yet proven; `Recommendation` — hardening/optional; `Owner decision` — cannot proceed without product-owner input. Severity uses the source report's rating; where two reports graded one deduped finding differently, the higher applies and the mapping is shown.

### 3.1 Previously fixed — verified this session (kept for traceability; no action required)

| ID (source) | Title | Category | Severity (was) | Verification evidence |
|---|---|---|---|---|
| C1 (TA; UX P0-1) | Unauthenticated candidate data disclosure via email (IDOR) | AuthZ | Critical | Session + email-match gates in `candidate/route.ts:29-37`; tests C1 group in `tests/authz.test.ts`; 40/40 green |
| C2 (TA) | Unauthenticated outbound messaging/state changes | AuthZ | Critical | Session + ownership + 12 h nudge cooldown (`candidate/actions/route.ts:52-134`); tests incl. 429 |
| C3 (TA) | Unauthenticated reference-packet PDF download | AuthZ | Critical | Owner-session OR `?share=` token with revoked/expired/used checks (`pdf/[requestId]/route.ts:32-46`); tests |
| C4 (TA) | Email-only share-ledger disclosure returning live tokens | AuthZ | Critical | Session-gated, scoped to own requests (`reference/share/route.ts:38-49`); tests |
| C5 (TA) | Unauthenticated recruiter POST actions | AuthZ | Critical | Recruiter session required; flag actions 403; shared-only reminders (`recruiter/route.ts:103-127`); tests |
| C6 (TA; UX P0-3, Q3 letter) | Agency-wide pipeline via static shared code | AuthZ | Critical | Code-only → 401; pipeline scoped to actively-shared requests; `refLink` never exposed; tests |
| H1 (TA) | Expired reports served by answers endpoint | Business logic | High | Unified `evaluateChecklistShare` (`sharePolicy.ts`); `checklist_expired` on resolve + answers; tests incl. exact 30-day boundary |
| M1 (TA) | Referee GET leaks response + fraud flags + IP/UA | Privacy | Medium | Payload minimized (`reference/[token]/route.ts:52-57`); tests assert absence |
| M2 (TA) | "Email domain" identity presented as verified | Honest labeling | Medium | Honest labels shipped ("self-attested") in pdf/ReferenceShareView/RecruiterDashboard |
| M5 (TA) | Prisma query logging prints parameters in production | Info disclosure | Medium | `db.ts` gated to non-production; opt-in via `LOG_PRISMA_QUERIES=1` |
| M6 (TA) | Reference-submit race → HTML 500 | Reliability | Medium | try/catch + P2002 → JSON 409; data integrity preserved by unique constraint |
| M7 (TA) | Session resolution ignores suspended accounts | Hardening | Medium | Status re-checked in `auth.ts:135-141`, `checklistAuth.ts:57-64` + on sign-in |
| M8 (TA) | Capability tokens rely on `cuid()` | Token security | Medium | `newToken()` = 24-byte CSPRNG base64url at every active creation site (`tokens.ts`); token-format tests |
| M3-partial (TA) | Unlimited candidate nudges | Abuse | Medium | 12 h server-enforced cooldown (429); tested |
| L1 (TA) | Stale schema comments (365-day/1-year) | Docs | Low | Comments corrected in `prisma/schema.prisma` |
| L10 (TA) | Copy overclaims: SkillBadge "Verified", "VaultVerify verifies…", "reusable for a year", taglines | Honest labeling | High (copy) | Fixed in Batch 1 (`e62049a`) + audit pass; guarded by `copyClaims.test.ts` (K9 gate) — passing |
| UX 12.1a–12.1j | Landing/meta misrepresentation ("48 hours", "fraud radar", "55+", "Manager-verified" badges, "stay verified for a year") | Honest labeling | P0 (copy) | Zero grep hits this session in `landing/`, `layout.tsx`, `ShareView.tsx`; `Hero.tsx:88` now says "self-assessed"; K9 gate green |
| L12 (TA) | No automated tests existed | Process | Low | Resolved: vitest suite exists and passes |
| UX Q2 (partial) | "Skills verified" → "Confirmed by referee" rename | Honest labeling | P0 | Badge renamed and scoped to reference rows where the referee confirmed (`ReferencesPanel.tsx:248`); full Q2 intent verified in SEC audit §10.1 |

### 3.2 Confirmed and open — the working list

| ID (source) | Title & category | Severity | Status | Evidence (current tree) | User/business impact | Proposed remediation | Regression test | Owner decision | Depends on |
|---|---|---|---|---|---|---|---|---|---|
| SEC-03 (SEC; TA H4-adjacent) | Burned static access codes still armed (AuthN) | **High; Critical if env values unrotated** | Confirmed + Owner decision | `SuperAdmin.tsx:735-742` literal (re-confirmed; 2 hits); 6 script files re-confirmed; backup path = full OWNER, no OTP (`superadmin/route.ts:79-82`); `RECRUITER_CODE` still gates invite list/lookup + checklist-PDF invite path (`auth.ts:155-160`, `invite/route.ts:68-71`, `checklist/pdf/route.ts:136-138`) | Anyone who read the public repo holds live superadmin and recruiter-surface credentials | Owner rotates both env values (Vercel + local); scrub literals from `SuperAdmin.tsx` + scripts; decide whether a static backup path should exist at all; retire legacy code from invite/PDF routes (with SEC-02) | Assert published placeholder value is rejected by `resolveIdentity`; code-only invite/PDF requests → 401 | **Yes** (OD-01) | None — first batch |
| SEC-02 (SEC; supersedes TA H3 list/lookup; adds PDF-ownership gap) | Checklist-PDF IDOR via invite path; platform-wide invite list/lookup leaks PII + live claim tokens (AuthZ/BOLA) | **High** | Confirmed + Owner decision | `checklist/pdf/route.ts:136-144` authorizes any recruiter session for *any* invite ID (no ownership compare; `recruiterName` is self-reported text); `invite/route.ts:97-138` `list` returns 60 newest invites platform-wide incl. candidate name/email/phone + live `claimUrl`; `:74-93` `lookup` returns PII for any email | Any recruiter downloads any candidate's checklist PDF (attestation signature included), bypassing candidate-controlled sharing entirely | Bind `ChecklistInvite` to the sending recruiter account (`recruiterAccountId` FK) at creation; enforce ownership on the PDF invite path; scope `list` to own invites; minimal-field `lookup` (or admin-only); retire legacy code from these routes | Recruiter + foreign invite → 403/404; `list` returns only own invites; code-only → 401 | **Yes** — schema change + migration (OD-03) | Schema approval; complements SEC-03 |
| SEC-01 (SEC) | Recruiter visibility platform-wide, not per-recipient; screening data in payloads (AuthZ/BOLA) | **High** | Confirmed + Owner decision | `recruiter/route.ts:44-53` fetches all requests, filters only on *any* active share link; `ReferenceShareLink` (schema 167-180) has no recipient binding; payload spread (`:76-81`) includes referee PII, full response incl. `signerIp`/`signerUserAgent`, `skillChecks`, `flags`, and raw share tokens | "Shared with a recruiter" actually means "shared with every recruiter on the platform"; screening data contradicts the platform's own minimization rule | Interim (no schema): project an explicit field list; strip `signerIp`/`signerUserAgent`/`flags`; stop returning raw share tokens. Full fix: per-recipient binding (e.g., `sharedWithRecruiterId`) + explicit "anyone with the link" candidate choice; scope GET by binding | Recruiter B must not see a report shared only with recruiter A (post-binding); payload assertions for stripped fields | **Yes** — the Q3 intent call (OD-02); interim strip is engineering-only | Interim: none. Full: schema approval |
| SEC-07 (SEC; = TA H4; ≈ UX P0-5 context; covers TA L13) | Unauthenticated bootstrap seeds known-credential demo accounts in every environment incl. production (AuthN/config) | **Medium–High** | Confirmed + Owner decision | `bootstrap/route.ts:9-24` public GET → `ensureSeed()` + `seedBuiltinTemplates()` + `seedChecklistDemo()` (`checklistDemo.ts:11-23`, `emma.chen@example.com` / committed `demo1234`); **no `NODE_ENV` guard** (re-confirmed this session); `DEPLOY.md` documents prod as Supabase — first prod hit seeds it | Publicly-known login on the production portal; demo rows mixed into production data; data-pollution and confusion surface | Gate demo *accounts/data* seeding behind `NODE_ENV !== "production"` or explicit sandbox flag; keep harmless template seeding; decide cleanup of already-seeded prod rows (counts-only verification first) | `NODE_ENV=production` + GET bootstrap → no demo account created; dev → created | **Yes** (OD-04) | None — first batch |
| SEC-04 (SEC) | One-time checklist share links never consumed by the PDF path | Business logic / token semantics | Medium | `checklist/pdf/route.ts:122-127` checks revoked/link-expiry/report-expiry but never `viewedAt`, never consumes; one-time links have `expiresAt = null` | "One-time" promise false for PDFs: repeat downloads until revocation or 30-day expiry | Route PDF through `evaluateChecklistShare` (read-only mode that still rejects consumed links), or consume-on-download if chosen | ONE_TIME link: resolve → PDF GET must 403; unconsumed → 200 + `viewCount`++ | Semantics choice (OD-06) — the fix itself is engineering | Phase B |
| SEC-05 (SEC) | Reference PDF download neither consumes nor blocks after consumption | Business logic / token semantics | Medium | `pdf/[requestId]/route.ts:35-39` rejects consumed one-time links but never sets `viewedAt`; consumption only in `reference/share/route.ts:91-95` (resolve) | Direct PDF URL fetches repeatable; same promise-gap as SEC-04 on the reference product | Same policy unification; pick consume-on-download vs reject-consumed semantics and enforce once | Direct PDF GET twice → assert chosen semantics | Semantics choice (OD-06) | Phase B |
| SEC-06 (SEC; = TA H2; UX Q4) | Collected-references route: guaranteed runtime 500 (model absent from schema) | Availability/consistency | Medium | `checklist/reference/route.ts` 8 `db.collectedReference` refs (re-confirmed); no `CollectedReference` model; 8 of 46 tsc errors; dead UI callers (`CollectedRefsPanel.tsx`, `CollectedRefForm.tsx`, zero importers) | Live failing endpoint; silent feature debt; type-check noise | Owner picks: (a) retire route + dead UI (410), (b) rebuild model with `newToken()` + policy parity, (c) leave documented (not recommended) | Post-decision: chosen path returns 200/410 consistently; tsc error count drops by 8 | **Yes** — Q4 (OD-05) | Owner decision |
| SEC-08 (SEC) | Referee identity verification is decorative (callback code derivable from token; email-domain self-attested) | Integrity / honest labeling | Medium | `reference/[token]/route.ts:153-157` compares `CALLBACK_CODE` against `deriveCallbackCode(request.token)`; derivation `h*31 mod 1e6` over the token the referee already holds (`seed.ts:17-21`); `EMAIL_DOMAIN` = self-typed domain, no challenge | Signed reports imply out-of-band assurance that does not exist; recruiters may overweight | Owner picks: (a) honest relabel, (b) true out-of-band random 6-digit code stored on the request (not derivable), (c) real domain-challenge email | Token-holder computing f(token) must NOT satisfy CALLBACK_CODE (option b), or labels change (option a) | **Yes** (OD-07) | Phase C |
| SEC-09 (SEC; = TA M3 lockout remainder) | No sign-in throttling/lockout; unauthenticated resend email triggers | Abuse/AuthN | Medium | `auth/route.ts:110-162`, `checklist/account/route.ts:104-139`: `failedLogins` counters recorded but never enforced; `resend` fires real templated email to any address, unauthenticated | Network-speed password guessing; email-bombing; Brevo quota exhaustion | Per-account lockout/backoff using existing `failedLogins`/`lastFailedLogin`; per-IP+per-email throttle on signin/resend | 6 wrong passwords → 7th delayed/rejected; resend 10×/min → 429 | No (policy parameters only) | Phase F (or A if prioritized) |
| SEC-10 (SEC; = UX A5) | Runtime database tracked and published in a public repository | Data exposure | Medium | `git ls-files` re-confirmed this session: `db/custom.db` tracked; `.gitignore:61-64` ineffective while tracked; platform auto-commits re-publish drift (documented twice in worklog); history retains the file (22 commits) | Bearer tokens for demo reports, synthetic referee emails, session IDs published; any future real-data touch becomes public on next auto-commit | `git rm --cached db/custom.db` (+ worklog, SEC-11) in one approved batch; then decide history scrub (BFG/filter-repo) vs accept-as-synthetic; untrack = file stays on disk, nothing deleted | Repo no longer lists the file in `git ls-files`; future commits don't re-add it | **Yes** (OD-08) | None — first batch |
| SEC-11 (SEC) | `worklog.md` tracked and published | Data exposure | Low | `git ls-files` re-confirmed: `worklog.md` tracked despite `.gitignore:71`; ships internal ops narratives incl. references to the public admin code | Internal operations detail exposed; amplifies SEC-03 | Untrack in the same approved batch as SEC-10 | `git ls-files` no longer lists it | Trivial — batch with OD-08 | SEC-10 batch |
| SEC-12 (SEC) | One-time consumption race (two concurrent resolves both succeed) | Token semantics | Low | `checklist/share/route.ts:26-30`, `reference/share/route.ts:91-95`: `viewedAt: link.viewedAt ?? new Date()` written unconditionally; no conditional update | One-time link viewable twice in a concurrency window | Atomic consumption: `updateMany({ where: { id, viewedAt: null } })` + count check | Concurrent double-resolve → exactly one success | No | Phase B |
| SEC-13 (SEC) | Unverified-account credential overwrite via re-signup | Account integrity | Low | `auth/route.ts:69-76`, `checklist/account/route.ts:86-91`: existing unverified email + new signup overwrites name/passwordHash | Pre-verification account hijack of password (inbox still controls verification); griefing/confusion | Require original password or signed intent token to mutate an existing unverified row; notify on overwrite | Re-signup against unverified account without original password → 409 | No | Phase F |
| SEC-14 (SEC) | Unauthenticated candidate onboarding POST sends outbound email | Abuse / consent | Low | `candidate/route.ts:83-186`: no session; creates Candidate + requests; triggers referee emails (credit-bounded); returns live referee links | Bounded spam relay; unconsented "listed as reference" email to third parties; typed `consentSignature` not attributable | Owner picks: require session (migrate wizard), verify-before-send, or keep with per-IP throttle + consent audit stamp | Unauthenticated POST → 401 (if gated) or throttle 429 after N | **Yes** (OD-09) | Owner decision |
| SEC-15 (SEC) | Screening data exposed on recruiter surface and in distributed PDF | Privacy/minimization | Low | `recruiter/route.ts:76-81` (response spread incl. `signerIp`/`signerUserAgent`, `flags`); `pdf/[requestId]/route.ts:109-110` embeds IP/UA in the packet PDF | Contradicts the platform rule that screening data "NEVER leaves the platform" | Strip from recruiter payload and PDF (admin console + raw DB keep them), or document why recipients need them | Payload/PDF assertions for absence | Minimal (OD-10) | SEC-01 interim |
| SEC-16 (SEC) | Consent records not versioned or independently durable | Privacy/compliance | Low | No policy-version field anywhere; consent lives in `Candidate.consentSignature*` + attestation JSON; no `ConsentRecord` model | Cannot prove which policy version a candidate accepted; legal-review exposure | Add policy version + template hash to attestation; optional `ConsentRecord` ledger (actor, action, report, version, timestamp) | Attestation snapshot includes policy version | **Yes** — schema + legal input (OD-11) | Later phase |
| SEC-17 (SEC; = TA M4; ≈ UX A7) | Logs retain sensitive data with no retention policy; audit-completeness gaps | Privacy/ops | Low | `NotificationLog` stores full bodies incl. bearer-token URLs; `AuditEvent.detail` stores referee emails; unbounded growth; checklist share-PDF downloads **not** audit-logged; recruiter actions attributed to self-reported `recruiterName` not account | Blast-radius expansion on compromise; weak non-repudiation | Retention windows (owner sets); hash/redact tokens in stored bodies; add share-PDF audit events; log recruiter account IDs | Log-row retention test; PDF-download audit event assertion | **Yes** — retention windows (OD-11) | Phase F |
| SEC-18/19..25 (SEC) | Hardening tail: timing-safe compares (19); session/token hygiene — unhashed session IDs & tokens at rest, no purge, console `sessionStorage` (20); config surfacing — `emailLive` exposure, candidate email in share resolve (21); CSP `unsafe-inline` (22); referee account pre-creation (23); `db:push --accept-data-loss` unguarded (24); simulated-SMS treated as sent (25) | Hardening/ops | Informational → Low–Medium (24) | Per security audit §§4.2, 6.3, 9.2–9.4, 10.2, 11.2 with file:line evidence | Defense-in-depth gaps; 24 is an operational footgun against production | Individually listed in the Phase F plan (Section 9); 24 pulled forward into the first batch (trivial, protective) | Per-item assertions defined with each change | 20 (token hashing) and 16/17 retention need schema/policy calls; rest no | Phase F |

### 3.3 Open items from the UX plan (usability/content — not security defects)

| ID (source) | Title | Priority | Status | Evidence / note |
|---|---|---|---|---|
| UX-Q1 | One account for checklist + references (unification) | P1 | Requires Owner Decision — answered in principle ("yes, non-destructive"), unimplemented | UX plan §20 Phase 2; largest single item (migration plan needed) |
| UX-Q4 → SEC-06 | Collected references: repair or remove | P0 (availability) | Owner decision open | Deduped into SEC-06 above |
| UX-Q5 | Catalog positioning ("5 ready checklists · 55 skills · expanding…") | P0 copy | Copy corrected; final wording choice confirmable at Gate 2 | Live catalog verified: 5 sets / 55 skills, all Nursing\|RN (`GET /api/checklists`, side-effect-free) |
| UX-Q6 | Email verification gating before checklist completion | P1 | Requires Owner Decision | Small logic change; recommended: require verified email |
| UX-Q7 | Distinguish "report expired" vs "link expired" in share UI | P1 | DONE — server distinguishes (`checklist_expired` vs `expired`) and ShareView maps all four reject reasons to distinct plain-language messages | `sharePolicy.ts` + `ShareView.tsx` (54c366b) |
| UX P1-7..12 | My Reports unification, Sharing & Consent screen, recruiter banner, plain-language statuses, admin session-revocation UI, email-verification decision | P1 | Items 7–11 DONE in 54c366b (honest expiry states + recovery CTAs, unified sharing ledger, CH-06 access banner, plain-language statuses, session-revocation console); item 12 remains Owner Decision | UX plan §14 items 7–12, acceptance criteria §16 |
| UX P2-13..20 | A11y pack (progress indicator, keyboard rating groups, 44 px targets, contrast), draft autosave, mobile cards, admin ops cards, specific errors + aria-live, data download/delete entries, referee save-finish-later, next-reminder display | P2 | Recommendation | UX plan §13, §14.1 (effort S–M each); autosave needs `ChecklistDraft` model |
| UX P3-21 | Micro-copy polish, icon unification, PDF layout polish | P3 | Recommendation | After P0/P1 |
| TA-L9 | `terms.ts:68` legal copy still says "Manager-verified" (re-confirmed this session) | Low | Requires Owner Decision (legal text) | Mechanic described is accurate; term retired by Q2; **PO approval required to edit legal copy** |
| TA-L11 = UX-A1/A2 | Dead code: `HeroSection.tsx` (410 ln), `CollectedRefsPanel.tsx` (401), `CollectedRefForm.tsx` (351), `checklistPdf.ts` | P3 | Owner decision (deletion batch) | Zero importers re-verified in audits |
| TA-L2 | Dead root endpoint `GET /api` hello-world | Informational | Recommendation | `src/app/api/route.ts` |
| TA-L3/SEC-20 | Client stores recruiter code + superadmin backup code in `sessionStorage`; candidate email in `localStorage` | Informational | Recommendation | Tied to SEC-03 literal scrub + SEC-22 CSP upgrade |
| TA-L4 | `x-forwarded-for` trusted for IP logging | Informational | Recommendation | Affects fraud-heuristic quality only |
| TA-L6 | One-time links: answers endpoint fetchable pre-consumption (design nuance) | Informational | Recommendation — fold into OD-06 semantics decision | Documented in SEC §12 |
| TA-L7 | Invite email failures swallowed (`.catch(() => undefined)`) | Low | Recommendation | `checklist/invite/route.ts:177` |
| TA-L8 | No `prisma/migrations` — db-push workflow, no reviewed production migration path | Process | Recommendation | Becomes mandatory before any schema-touching batch (see Section 6) |
| TA-L14 | Duplicate `hashPassword`/`verifyPassword` in `auth.ts` + `checklistAuth.ts` | Informational | Recommendation | Consolidate opportunistically |
| TA-M9 | Outbound links from `x-forwarded-host` without origin allowlist | Informational | Recommendation | `VV_PUBLIC_ORIGIN` allowlist; Vercel normalizes today |
| A1 (next.config `ignoreBuildErrors`) = TA-L5/UX-A4 | Build ignores 46 type errors | Tech debt | Recommendation — flip off **after** SEC-06 resolution (drops 8 errors) | `next.config.ts:31-32` |

### 3.4 Deduplication and corrections record

- TA H2 = SEC-06; TA H3 absorbed into SEC-02 (list/lookup) + newly characterized PDF-ownership gap; TA H4 = SEC-07; TA M3's lockout half = SEC-09 (nudge half fixed); TA M4 = SEC-17; TA L5 = UX-A4; TA L11 = UX-A1/A2; UX-A5 = SEC-10; UX-A7 ≈ SEC-17.
- **Correction to the UX plan:** Appendix A3 claims the `SkillVerification` model has "zero API reads/writes." Code verification this session shows the referee submit path **writes** it via nested `skillChecks.create` (`reference/[token]/route.ts:276-284`) and the referee GET **reads** it (`:23`). The model is a live part of the References workflow (referee confirming the candidate's claimed skills *within a reference*) — not a checklist-verification mechanism and not dead. The security audit's account (§10.1) is correct. Phase C therefore preserves the model and its records.
- Severity was **not** downgraded anywhere for convenience: SEC-02/SEC-01 remain High despite requiring a recruiter account, because self-service signup makes that precondition trivial; SEC-03 remains High (Critical-if-unrotated) because only the owner can verify the env values.

---

## 4. Recommended phase sequence

Entry criteria are expressed against the gates in Section 10. Every phase ends with the regression suite green (`bunx vitest run`), `tsc` at 46-or-lower with **zero new** errors, and the K9 claim gate clean.

### Phase A — Immediate security containment

**Includes only issues whose evidence supports urgent action:** SEC-03 (owner rotation + literal scrub), SEC-07 (production seed gate), SEC-10/11 (untrack DB + worklog), SEC-24 (de-fang `db:push`), and the **no-schema interim** portions of SEC-01/SEC-15 (recruiter payload projection: strip `signerIp`/`signerUserAgent`/`flags`/raw tokens).

- **Entry:** Gate 1 passed (owner accepts the security findings); Gate 2 passed for exactly this scope; owner performs the env rotation (ops).
- **Exit:** owner confirms new codes live and old values dead; bootstrap creates no demo rows under `NODE_ENV=production` (test passing); `git ls-files` no longer lists `db/custom.db`/`worklog.md` and a subsequent commit does not re-add them; `db:push` refuses non-local DSNs; recruiter GET payload contains no screening data or raw share tokens (test passing); 40+new tests green; no schema change; no data affected.
- **Explicitly NOT in Phase A:** the schema-bearing fixes (SEC-01 binding, SEC-02 invite FK) — they are the first items of the normal batch queue and follow immediately, but they change the data model and require their own migration plan and owner approval (Gates 1–3 with schema callouts).

### Phase B — Critical business-logic corrections (validity semantics)

The reported checklist-validity defect (30 vs 365 days) is **already corrected and verified**: `CHECKLIST_VALIDITY_DAYS = 30` (`constants.ts:59`), expiry computed at completion (`complete/route.ts:127`), enforced by the unified `sharePolicy` on resolve + answers (403 `checklist_expired`), enforced on the checklist PDF share path, printed "(30 days)" in the PDF, guarded by tests including the exact boundary. Phase B therefore **evaluates and closes the semantics around it** rather than re-fixing it:

1. Affected-component audit (complete, recorded): constants, expiry calculation + server checks, dashboard labels, forms/status indicators, PDF output, emails (none carry validity claims post-sweep), seed data, docs/legal copy — all verified; remaining "365" hits are share-**link** duration caps (`checklist/share/route.ts`, `reference/share/route.ts`, console UI), which are a different concept (link lifetime ≠ report validity) and are legitimate.
2. Owner decision for **reports already issued under any earlier validity**: approve running `scripts/clamp-validity-30d.ts` (exists; normalizes legacy 365-day `expiresAt` rows to the 30-day policy) or explicitly leave historical rows as-is. **No silent reset, no alteration of historical records without approval.**
3. One-time-link semantics (SEC-04/05/12 + TA-L6): pick one policy for PDFs (consume-on-download vs reject-consumed), unify all four public surfaces on `sharePolicy`, make consumption atomic.
4. Q7 UX: share UI distinguishes "report expired" from "link expired" using the server's existing distinct codes.

- **Entry:** Phase A exit (or parallel where files don't overlap); OD-06 (semantics) and OD-12 (clamp) answered.
- **Exit:** all four public report surfaces enforce one policy (tests: expired/revoked/used × resolve/answers/checklist-PDF/reference-PDF matrix); concurrency test proves single consumption; clamp decision executed or closed with a written outcome; no historical row changed without the owner-approved action.

### Phase C — Checklist/reference separation

Current state **verified clean** (security audit §10.1 + B5 test): reference submit writes only `ReferenceResponse` (+ `SkillVerification`, optional referee account); zero writes to `ChecklistCompletion`/`ChecklistRequest`; `skillsVerified` is display-only driving the "Confirmed by referee" badge; the only non-checklist writer of completion expiry is the **superadmin** `decide` action (admin lifecycle, not a reference action). The legacy `SkillVerification` model is **alive in the reference workflow** (correction record, Section 3.4) and its records are preserved untouched.

Remaining Phase C work:

1. SEC-08 identity honesty: owner picks relabel vs real out-of-band callback code vs domain challenge; implement + label truthfully everywhere (report UI, PDF, recruiter views).
2. Keep badge scoping: "Confirmed by referee" renders only inside reference reports where the referee confirmed — never on checklist surfaces (already true; keep the K9 + B5 tests guarding it).
3. No schema change, no migration, no relabeling of legacy `SkillVerification` rows.

- **Entry:** OD-07 answered. **Exit:** identity labels honest end-to-end (or real code implemented) with tests; B5 workflow-independence suite green; zero reference→checklist writes re-verified by grep + tests.

### Phase D — Regression test foundation (expansion on the existing runner)

The foundation exists (vitest + disposable DB harness; 40 tests). Phase D adds the security audit's §12 proposal — **~25–35 targeted assertions**, no new runner, no broad rewrite — mapped to the Option 4 minimum areas:

1. Checklist validity/expiration — **covered** (sharePolicy boundary tests; extend with link-expired × report-live case).
2. AuthN/AuthZ for sharing links and protected reports — **covered** for C1–C6/H1; add recruiter-binding tests post-SEC-01/02.
3. Expired and revoked link behavior — **covered** on resolve/answers; **add** both PDF routes.
4. PDF and API access controls — **add** SEC-04/05 matrix + share-PDF audit event.
5. Workflow separation — **covered** (B5).
6. Reference submissions cannot alter checklist status/expiry — **covered** (B5).
7. Secure token generation/validation — **covered** (format/uniqueness); add rejection of published placeholder codes post-SEC-03.
8. Rate limiting — **blocked until** SEC-09 implements throttling; then add lockout/backoff + resend-429 tests.

- **Entry:** per-batch (tests ship with the change they protect). **Exit per phase:** suite green; new behaviors have failing-test-first coverage where practical.

### Phase E — Product UX and content corrections

Sequenced after containment; content from the UX plan with current status:

1. Confirm Q5 wording and keep K9 guarding it (near-zero effort; wording already honest).
2. L9 `terms.ts` legal wording (owner-approved edit only).
3. P1 pack: My Reports unification + expired-report recovery; unified Sharing & Consent screen (with 11.3 cannot-recall-copy language); recruiter "Reports shared with me" + access banner (depends on SEC-01 model); plain-language statuses; admin session-revocation UI; Q6 email-verification decision.
4. P2 pack: a11y (progress indicator, keyboard rating groups, ≥44 px targets, contrast pass), draft autosave (needs `ChecklistDraft` model — schema callout), recruiter mobile cards, specific errors + `aria-live`, data download/delete entries (reconciles /privacy promises), referee save-finish-later, next-reminder display.
5. P3 polish after P0/P1.

- **Entry:** Gate 2 per item; Phase E items touching sharing/recruiter views depend on SEC-01/02 outcomes. **Exit:** UX plan §16 acceptance rows pass; K9 clean; no claim regression.

### Phase F — Operational hardening

1. SEC-09 sign-in lockout/backoff + resend throttling (existing `failedLogins` fields).
2. SEC-17/A7 retention: purge/redact `NotificationLog` bodies (token-bearing) and bound `AuditEvent` growth per owner-set windows; add share-PDF audit events; recruiter actions attributed to account IDs.
3. SEC-20: hash session IDs and capability tokens at rest (schema change — owner call), purge expired sessions, stop storing the backup code in `sessionStorage` (pairs with SEC-03 scrub).
4. SEC-22: CSP nonce/strict-dynamic upgrade when feasible; verify HSTS after any self-host move.
5. TA-M9 origin allowlist (`VV_PUBLIC_ORIGIN`).
6. SEC-13 re-signup protection; SEC-23 referee-account tightening; TA-L7 email-failure surfacing; SEC-21/TA-L2 config surfacing and dead endpoint cleanup.
7. TA-L8: introduce a reviewed migration path (`prisma migrate diff`-based baselining) **before** any schema-touching batch beyond the first; document backup/restore for Supabase Postgres and the SQLite dev file; document deploy rollback (Vercel promotes previous deployment).
8. Dependency maintenance: periodic `bun outdated` review; pin and review major bumps; no new paid infrastructure without an explicit cost note (none proposed).

- **Entry:** Gates per item. **Exit:** throttling live with tests; retention policy documented + enforced; hardening items closed or explicitly deferred with owner sign-off.

**Sequencing rule:** Phase A is not tradeable against later phases — it contains the items where inaction has live exposure. Phases B–F interleave only where file overlap is empty; the schema-bearing items (SEC-01 binding, SEC-02 FK, optional ConsentRecord/session-hashing, ChecklistDraft) each require their own Gate 2 approval with the migration/backup notes in Section 6.

---

## 5. Detailed implementation matrix

Change IDs are referenced by the phases and the first-batch plan. "Schema" = Prisma schema change required. "Data" = whether existing rows could be affected. Rollback notes assume the batch-by-batch Git flow (one reviewable commit per change; revert = `git revert <commit>`; no history rewrite). Owner approval: **Y** means Gate 2 must explicitly cover this change.

| ID | Files/components | Current behavior | Desired behavior | Evidence | Schema | Data | Tests required | Acceptance criteria | Rollback | Depends | Owner approval |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CH-01 | `src/components/bts/SuperAdmin.tsx:735-742`; `scripts/auth-smoke.ts`, `phase1/2/3-smoke.ts`, `test_checklist_flow.sh`, `test_collected_refs.sh` | Literal backup code rendered by dev-gated autofill + hardcoded in 6 script files | Literals removed (env-read or "use sandbox .env" hint); scripts read code from env | SEC-03 evidence; re-confirmed this session | No | No | K9-style grep: literal absent from `src/` + `scripts/` | Literal not findable in repo tip; dev autofill still works from env | Revert commit; rotation makes literals inert regardless | Owner rotation (OD-01) | **Y** |
| CH-02 | `src/app/api/bootstrap/route.ts`; `src/lib/bts/checklistDemo.ts` | Public GET unconditionally seeds demo accounts/data incl. prod | Demo account/data seeding only when `NODE_ENV !== "production"` (or explicit sandbox flag); template seeding unchanged | SEC-07; no guard found this session | No | No (stops future pollution) | Bootstrap in production mode → no demo rows; dev → rows created | Prod deploy seeds nothing; sandbox workflow unchanged | Revert commit | None | **Y** (OD-04) |
| CH-03 | Git index only: `db/custom.db`, `worklog.md` | Both tracked & published despite `.gitignore` entries | `git rm --cached` both; files remain on disk and ignored thereafter | SEC-10/11; `git ls-files` re-confirmed | No | No on-disk change; remote tip stops carrying them after push | Post-change check: `git ls-files` clean; next commit does not re-add; app still runs (SQLite file present) | Files absent from new tip tree; platform auto-commits stop re-publishing drift | `git add` again (revertible); note: file remains in **history** either way | History-scrub decision separate (OD-08) | **Y** |
| CH-04 | `package.json:10` (`db:push`), new guard script, `DEPLOY.md` | `db:push` = `prisma db push --accept-data-loss` against whatever `DATABASE_URL` is active; `DEPLOY.md` has no warning | Guard script refuses non-local DSN (host not `file:`/localhost); DEPLOY.md warning added; consider plain `db:push` without `--accept-data-loss` | SEC-24 | No | No | Guard test: DSN host = supabase → refuses; `file:` → passes | Destructive sync impossible against prod by accident | Revert commit | None | No (script hygiene) |
| CH-05 | `src/app/api/recruiter/route.ts` | GET payload spreads full request incl. `signerIp`/`signerUserAgent`/`flags`/raw share tokens | Explicit field projection; screening data + raw tokens stripped (admin console keeps them) | SEC-01 payload half / SEC-15 | No | No | Payload assertion test: keys absent for recruiter session | Recruiter sees report content, not screening metadata or bearer tokens | Revert commit | None (full binding is CH-06) | No (minimization is the documented platform rule) |
| CH-06 | `prisma/schema.prisma` (`ReferenceShareLink`), `checklist/share`/`reference/share` create paths, `recruiter/route.ts` | Share links have no recipient binding; any recruiter sees all actively-shared reports | Optional `sharedWithRecruiterId` + explicit "anyone with link" choice; recruiter GET scoped by binding | SEC-01 full fix | **Yes** (additive) | Existing links: backfill as "anyone with link" (owner-confirmed default) | Recruiter B blocked from A-scoped report; "any-link" still resolves | Q3 intent honored end-to-end | Additive migration + backfill note; revert via migration-down/baseline | CH-05; OD-02 | **Y** |
| CH-07 | `prisma/schema.prisma` (`ChecklistInvite`), `checklist/invite/route.ts`, `checklist/pdf/route.ts` (invite path) | Invites carry self-reported `recruiterName`; PDF invite path authorizes any recruiter for any invite; `list` platform-wide; `lookup` any-email PII | `recruiterAccountId` FK at creation; ownership enforced on PDF path; `list` scoped to own invites; `lookup` minimal fields or admin-only; legacy code retired from routes | SEC-02 | **Yes** (additive FK, nullable for legacy) | Existing rows: sender unknowable → null FK + owner-approved backfill/visibility rule | Foreign invite → 403/404; own-only list; code-only → 401 | Candidate-controlled sharing restored on invite path | Additive migration; revert commit + baseline | OD-03; pairs with SEC-03 retirement | **Y** |
| CH-08 | `checklist/pdf/route.ts`, `pdf/[requestId]/route.ts`, `sharePolicy.ts` | PDF routes enforce own partial checks; one-time links not consumed/rejected consistently | Single `evaluateChecklistShare` path for all four public surfaces; chosen one-time semantics (OD-06) enforced once | SEC-04/05; TA-L6 | No | Consumption writes `viewedAt` only per chosen semantics | Full matrix: revoked/used/expired/report-expired × resolve/answers/both PDFs | Uniform policy; tests prove parity | Revert commit | OD-06 | No (semantics decision = OD-06) |
| CH-09 | `checklist/share/route.ts:26-30`, `reference/share/route.ts:91-95` | `viewedAt` written unconditionally (race) | Atomic conditional update (`updateMany where viewedAt: null` + count check) | SEC-12 | No | No | Concurrent double-resolve → exactly one success | Race closed | Revert commit | CH-08 (same files) | No |
| CH-10 | `src/app/api/auth/route.ts`, `checklist/account/route.ts` | `failedLogins` recorded, never enforced; resend unthrottled | Per-account lockout/backoff + per-IP/per-email throttles on signin/resend | SEC-09 | No | No | 6 wrong → lockout; resend N/min → 429 | Brute force + email-bombing mitigated | Revert commit | Policy parameters | No |
| CH-11 | `checklist/reference/route.ts` + `CollectedRefsPanel.tsx` + `CollectedRefForm.tsx` (per OD-05 choice) | Guaranteed-500 route + dead UI | (a) 410 + delete dead code, or (b) rebuild model with `newToken()` + policy parity | SEC-06/H2 | (a) none (b) **Yes** | (a) none (no records exist) (b) new table | Chosen path 200/410 consistently; tsc −8 errors | Route behaves; error count drops | (a) revert commit; (b) migration-down | OD-05 | **Y** |
| CH-12 | `reference/[token]/route.ts`, `seed.ts`, report UI/PDF labels | Callback code derivable from token; identity labels imply assurance | Per OD-07: honest relabel (a) / true random out-of-band code stored on request (b) / domain challenge (c) | SEC-08 | (b) additive column | (b) future rows only; legacy rows keep working | Token-holder f(token) must not satisfy CALLBACK_CODE (b) | Identity claims honest or real | Revert / migration-down | OD-07 | **Y** |
| CH-13 | `src/content/terms.ts:68` | Legal copy says "Manager-verified" | Owner-approved wording (proposed replacement documented in TA L9) | TA-L9 | No | No | K9 grep (terms allowlist updated) | Legal text approved by owner | Revert commit | OD-13 | **Y** (legal) |
| CH-14 | Landing/portal components per UX plan P1 items (My Reports, Sharing & Consent, recruiter banner, statuses, admin revocation UI) | Split panels; internal status codes; two report lists | Unified views per UX plan §7/§16 | UX plan | No (unless drafts later) | No | Per §16 acceptance rows | P1 rows pass | Revert commits (one per item) | CH-06 for recruiter banner; OD-14 (Q6) for verification gating | **Y** per item |
| CH-15 | P2 pack: a11y, `ChecklistDraft` autosave (new model), mobile cards, errors/aria-live, data download/delete entries, referee save-finish-later, reminder display | Per UX plan §13/§14 | As specified in UX plan | UX plan | **Yes** (draft model only) | New table only | Per §16 P2 rows | P2 rows pass | Revert + migration-down | OD for schema | **Y** (draft model) |
| CH-16 | `next.config.ts:31-32` | `ignoreBuildErrors: true` | Flip to `false` after SEC-06 resolution (tsc −8) | TA-L5/UX-A4 | No | No | CI/build fails on new type errors | Build green at 38 errors or lower; flag off | Revert commit | CH-11 | No |
| CH-17 | `db.ts`/schema (session + token hashing), session purge job/endpoint | Session IDs + tokens stored plaintext; expired sessions never purged | SHA-256-at-rest with indexed lookup; purge expired rows | SEC-20 | **Yes** (additive hash columns) | Dual-read during transition; legacy rows keep working (M8 precedent) | Lookup-by-hash tests; purge test | DB leak no longer yields live capabilities | Migration-down | OD-15 | **Y** |
| CH-18 | `notifications.ts`, audit writes, retention job | Full bodies retained forever; share-PDF downloads unlogged; recruiter actions attributed to name | Owner-set retention/redaction; share-PDF audit events; account-ID attribution | SEC-17/A7 | No | Retention deletes old log rows (owner-approved window) | Retention test; audit-event assertion | Non-repudiation + bounded logs | Revert; retention window adjustable | OD-11 | **Y** (windows) |
| CH-19 | `auth/route.ts` (signup), `checklist/account/route.ts`, `reference/[token]/route.ts` | Unverified-account overwrite; referee account pre-creation | Original-password/intent-token requirement; tighter referee account creation | SEC-13/23 | No | No | Re-signup without original password → 409 | Griefing vector closed | Revert commit | None | No |
| CH-20 | `next.config.ts` (CSP nonce), `auth/route.ts` + route helpers (origin allowlist, timing-safe compares, dummy scrypt) | `unsafe-inline` CSP; host-header links; non-constant-time compares | Nonce-based CSP; `VV_PUBLIC_ORIGIN` allowlist; digest `timingSafeEqual`; dummy hash on unknown account | SEC-22/19; TA-M9 | No | No | Header assertions; allowlist unit tests | Defense-in-depth upgraded | Revert commit | None | No |

---

## 6. Data-preservation and compatibility plan

**Non-negotiables honored throughout:** no database deletion; no Git history rewrite (unless separately approved); no legacy-record deletion, rewriting, relabeling, or migration; no `db push --accept-data-loss` against any non-local DSN; no unapproved migrations; no production data modification without explicit approval.

1. **Tracked runtime database (`db/custom.db`, SEC-10).** Untracking (CH-03) removes the file from the *repository tip* only — the working file stays on disk, the app keeps running, and **nothing is deleted**. The file remains in reachable Git history on origin; full removal requires `git filter-repo`/BFG, which rewrites commit IDs and affects every clone — proposed only as a separate owner decision (OD-08) with a documented team-communication step. Interim risk statement: published contents are classified *synthetic with unknown drift*; if the owner cannot rule out real data ever touching the file, treat history as sensitive and prefer scrubbing.
2. **`worklog.md` (SEC-11).** Same batch as CH-03; untrack only; content preserved on disk. (The internal ops narratives — including references to the public admin code — stop being republished at tip.)
3. **Validity transition (Phase B).** The 30-day rule is enforced for all *new* completions and all *public access* today. Any legacy rows still carrying 365-day `expiresAt` values are historical records: the owner either approves running `scripts/clamp-validity-30d.ts` (a normalization pass with a written before/after count) or closes OD-12 with "leave as-is." No silent resets; no completion dates altered; already-issued reports are never invalidated retroactively without the owner-approved action.
4. **`SkillVerification` legacy records (Phase C).** Preserved untouched. The model is live in the reference workflow (Section 3.4 correction); no relabeling, migration, or deletion. The "Confirmed by referee" display stays scoped to reference reports. The B5 test (reference submit leaves every `ChecklistCompletion` row byte-identical) remains the standing guard.
5. **Token compatibility.** The M8 precedent is the template: new capability tokens are CSPRNG while **legacy cuid-era rows continue to work** (strings only, no migration). CH-06/CH-07 additive columns follow the same rule: nullable FKs, "anyone with link" default for existing share links, "unknown sender" bucket for existing invites — each backfill rule stated in its change and approved at Gate 2.
6. **Schema-change procedure (all schema-bearing changes).** (a) Introduce a reviewed migration path first (TA-L8: baseline the current schema via `prisma migrate diff`, commit migrations from then on); (b) additive-only changes (new nullable columns/tables); (c) backup taken and verified before applying (Supabase snapshot / SQLite file copy); (d) `db push` never used against production; (e) application dual-reads old/new during transition where relevant; (f) migration-down or revert plan written before apply.
7. **Production database (OD-04 verification first).** Before any cleanup discussion, the owner runs counts-only queries (`SELECT COUNT(*)` per table) on Supabase to establish whether demo rows exist. Cleanup of seeded prod rows happens only as an explicit owner-approved batch with a backup; this roadmap performs nothing.

---

## 7. Minimal regression-test strategy

**Runner:** existing vitest + `tests/setup.ts` harness (disposable SQLite via `prisma db push --skip-generate`; `BREVO_API_KEY` forced empty; cookies mocked; handlers invoked directly). **No new test runner is required for any item in this roadmap.** Recommendation: add `"test": "vitest run"` to `package.json` (CH-04's script pass) so the gate is one command.

Coverage map (Option 4 minimum areas → status):

| # | Required area | Status today | Additions |
|---|---|---|---|
| 1 | Checklist validity & expiration | Covered — `sharePolicy.test.ts` (14): exact 30-day boundary, expired at instant, `checklist_expired` | Link-expired × report-live case on answers |
| 2 | AuthN/AuthZ for share links & protected reports | Covered — `authz.test.ts` (25): C1–C6 gates, ownership, legacy-code rejection | Recruiter-binding (CH-06) + invite-ownership (CH-07) suites |
| 3 | Expired/revoked link behavior | Covered on resolve + answers | **Add both PDF routes** (CH-08 matrix) |
| 4 | PDF & API access controls | Partial (C3 tested) | SEC-04/05 matrix; share-PDF audit-event assertion (CH-18) |
| 5 | Checklist/reference workflow separation | Covered — B5 byte-identity test | Keep; re-run on any touch of either flow |
| 6 | Reference submit cannot alter checklist status/expiry | Covered (B5) | Keep |
| 7 | Secure token generation & validation | Covered — format `^[A-Za-z0-9_-]{32,}$` + uniqueness | Post-CH-01: published placeholder code rejected by `resolveIdentity` |
| 8 | Rate limiting | **Not implementable yet** — no throttle exists (SEC-09) | Lockout/backoff + resend-429 tests land with CH-10 |

**Volume discipline:** ~25–35 new assertions total (security audit §12), targeted at the register's open items — not a broad rewrite. Bootstrap-gate test (CH-02) and payload-projection test (CH-05) are part of the first batch.

**Per-phase gate:** a phase is complete only when `bunx vitest run` is fully green, `bunx tsc --noEmit` shows ≤ 46 errors with zero new, and the `copyClaims` K9 gate passes. Any failure is documented and owner-accepted before Gate 4 can close (Section 10).

---

## 8. UX and content correction plan

Content state: all P0 copy items (12.1a–12.1j, PDF stamp, revoke-consent language, SkillBadge, verb overclaims, taglines) are **fixed and gated** by the automated claim test. Remaining plan, in order:

1. **Confirm-and-freeze honest vocabulary** (Q5): "5 ready checklists · 55 skills · self-assessed, valid 30 days" on landing/meta; catalog grows only when the template library grows. Guardrail (existing): no customer counts, no uptime/security certifications, no "fully verified", no turnaround promises.
2. **Legal copy** (TA-L9, OD-13): owner-approved replacement for `terms.ts:68` "Manager-verified" (mechanic-accurate; term retired by Q2). No edit without explicit approval.
3. **P1 experience pack** (UX plan §14 items 6–12): My Reports with expired-report recovery CTA; unified Sharing & Consent screen with Active/Expired/Revoked states and the cannot-recall-downloads warning; recruiter "Reports shared with me" + access banner (depends on CH-06 model); plain-language status pipeline (retire internal codes like FLAGGED from candidate UI → "Needs your attention"); admin session-revocation UI; Q6 email-verification gating decision.
4. **Expired vs expired** (Q7): share UI renders the server's distinct states (`checklist_expired` vs link `expired`) as "This report expired" vs "This link expired" — server truth already exists.
5. **P2 usability/a11y pack** (UX plan §13): progress indicator; keyboard-operable rating groups; ≥44 px touch targets; contrast pass on brand greens; specific error messages; `aria-live` announcements; recruiter card layouts < 640 px; data download/deletion entry points (reconciling `/privacy` promises with product); referee save-and-finish-later; next-reminder display. Draft autosave ships only with its approved `ChecklistDraft` model.
6. **P3 polish**: micro-copy, icon unification, PDF layout, dead-code deletion batch (A1/A2, pending OD-05 disposition of collected references).

Every UX item lands with its §16 acceptance row as the exit test; the K9 claim gate runs on every batch (it is a release gate, not a trend metric — UX plan K9).

---

## 9. Security and operational hardening plan

Consolidated from the security audit (SEC-09/13/15–25), technical audit (M9, L2/L3/L4/L7/L8/L14), and operational review. Nothing here introduces paid infrastructure; every item is scoped to the existing stack.

1. **Authentication abuse (CH-10, SEC-09):** enforce the already-recorded `failedLogins`/`lastFailedLogin` fields — exponential backoff or temporary lockout; per-IP + per-email throttles on `signin`/`verify`/`resend` in both portals; keep generic error messages (no enumeration). The superadmin OTP throttle (3/10 min, 5 attempts) is the in-repo pattern to copy.
2. **Session/token hygiene (CH-17, SEC-20 + legacy-token decision OD-15):** store SHA-256 of session IDs and capability tokens (indexed, dual-read transition); purge expired session rows; stop storing the superadmin backup code in `sessionStorage`; define a rotation policy for legacy cuid-era token rows (rotation optional per owner; entropy gap documented — cuid embeds timestamp/fingerprint structure).
3. **Screening-data minimization (CH-05, SEC-01/15):** recruiter payloads and distributed PDFs carry no `signerIp`/`signerUserAgent`/`flags`; admin console retains them. Raw share tokens stop being returned in recruiter listings.
4. **Origin/host hardening (CH-20, TA-M9):** `VV_PUBLIC_ORIGIN` allowlist with fallback for outbound links; harmless on Vercel today, protective for any future self-host.
5. **CSP and headers (CH-20, SEC-22):** nonce/strict-dynamic CSP upgrade to remove `unsafe-inline`; verify HSTS on the production edge after any hosting change.
6. **Timing/enumeration (SEC-19):** `timingSafeEqual` on digest comparisons for static codes/OTP; dummy scrypt for unknown accounts at sign-in.
7. **Database script safety (CH-04, SEC-24):** guarded `db:push` (refuses non-local DSN); `DEPLOY.md` warning; removal of `--accept-data-loss` from the default path; `db:reset` documented as dev-only-destructive.
8. **Logging, retention, audit completeness (CH-18, SEC-17/A7):** owner-set retention windows for `NotificationLog` (token-bearing bodies) and `AuditEvent`; redact/hash tokens in stored bodies; add share-PDF download audit events; attribute recruiter actions to account IDs, not self-reported names; bound `AuditEvent` growth.
9. **Email/operations honesty (SEC-25, TA-L7):** surface invite-email failures instead of swallowing; document that SMS is simulated everywhere until a provider is provisioned; keep the `example.com` demo-address guard covered by a test; Brevo quota/deliverability checks stay in the owner runbook.
10. **Migration and backup discipline (TA-L8, Section 6):** baseline `prisma migrate` path before the first schema-bearing batch; backup-before-migrate rule; deploy rollback via Vercel's previous-deployment promotion; document restore steps for Supabase Postgres and the SQLite dev file.
11. **Dependency maintenance:** scheduled `bun outdated` review; controlled major-version bumps; no new runtime dependencies without a stated need (none proposed by this roadmap).
12. **Type-safety posture (CH-16):** after SEC-06 resolution, disable `ignoreBuildErrors` so future type regressions fail builds.

---

## 10. Acceptance criteria and exit gates

The five gates from the Option 4 spec, made concrete. **Approval of this roadmap is not approval of any gate.**

**Gate 1 — Audit acceptance.** Owner reviews `VAULTVERIFY_TECHNICAL_AUDIT.md`, `VAULTVERIFY_SECURITY_PRIVACY_AUDIT.md`, and this roadmap; resolves major uncertainties (the unverified items in Section 12.2). *Exit:* owner states acceptance (or amendments) of the findings register; no batch proceeds without it.

**Gate 2 — Scope approval.** Owner approves a specific batch (by Change ID from Section 5), including any schema/data/compatibility implications stated in that row. *Exit:* written scope list (change IDs + OD resolutions), typically in chat, recorded in the worklog before implementation starts.

**Gate 3 — Implementation authorization.** Only explicitly approved changes are implemented; anything discovered mid-batch is reported back, not absorbed silently. *Exit:* implementation complete; tests written; `bunx vitest run` green; `tsc` ≤ 46 with zero new; K9 clean; diff summary produced.

**Gate 4 — Regression acceptance.** Owner receives the test results; any limitations or failures are documented and accepted. *Exit:* owner accepts the regression report (or requires rework).

**Gate 5 — Delivery approval.** Owner reviews changes, diff, documentation, and fix report before any push/deploy. *Exit:* explicit approval; only then commit(s) + push (Vercel auto-deploys on push — stated every time, because it is a deploy).

**Batch-level acceptance criteria (all batches):** session/authz behavior matches the register's remediation column; no claim-family regression (K9); no checklist data mutated by reference paths (B5); no historical records altered without the specific owner-approved action; worklog entry records what was done, evidence, and results.

---

## 11. Rollback and recovery considerations

| Scenario | Rollback path | Notes |
|---|---|---|
| Any code-only change (CH-01, 02, 04, 05, 08–10, 12a, 13, 16, 19, 20) | `git revert <commit>` → tests → Gate 5 re-approval for the revert push | One reviewable commit per change keeps reverts surgical |
| Schema-bearing change (CH-06, 07, 11b, 15, 17) | Migration-down (additive columns/tables drop cleanly) **or** forward-fix migration; restore from pre-migrate backup if needed | Backup verified before apply (Section 6.6); additive-only policy keeps data intact by construction |
| Seed gate (CH-02) | Revert restores previous behavior; already-seeded dev rows unaffected (gate is forward-looking) | Prod cleanup is a separate approved action, never bundled |
| Untrack DB/worklog (CH-03) | `git add` + commit re-tracks (reversible) | File on disk never touched; app unaffected; history retains old copies regardless |
| Code rotation (OD-01) | No rollback by design — old values are dead; new values distributed via Vercel + local `.env` | If locked out: fail-closed console means OTP path still works for the owner address |
| `db:push` guard (CH-04) | Revert commit | Guard is fail-closed; removing it restores the old footgun, noted in review |
| Bad deploy after Gate 5 push | Vercel: promote previous deployment; then fix-forward via revert commit through the same gates | Rollback deploys also trigger on push — treat as delivery events |
| Regression failure post-merge | Revert commit + document in worklog; Gate 4 re-run | Suite must be green before any future push |

---

## 12. Product-owner decisions required

### 12.1 Decisions blocking the recommended first batch (Phase A)

| ID | Decision | Options | Blocking |
|---|---|---|---|
| OD-01 | Static access codes (SEC-03) | Rotate both env values now (recommended) / keep-and-accept / also remove the static backup path entirely (OTP-only + printed recovery kit) | CH-01 + all SEC-02/SEC-03 retirement work |
| OD-04 | Demo seeding in production (SEC-07) | Gate behind `NODE_ENV !== "production"` (recommended) / sandbox-only flag / keep; plus: verify prod via counts-only queries; approve cleanup batch if rows exist | CH-02 |
| OD-08 | Repository hygiene (SEC-10/11) | Approve untracking `db/custom.db` + `worklog.md` (recommended); separately: history scrub (filter-repo/BFG) vs accept-as-synthetic-and-known | CH-03 |
| OD-10 | Screening-data distribution (SEC-15) | Strip from recruiter payload + distributed PDFs (recommended) / document why recruiters need IP/UA/flags | CH-05 |

### 12.2 Decisions blocking later phases (with safe-verification notes for the unverified items)

| ID | Decision | Notes |
|---|---|---|
| OD-02 | Recruiter share-binding model (SEC-01 / Q3 intent): per-recipient binding + explicit "anyone with link" option (recommended) vs status quo | The letter of Q3 is implemented; the intent call is the owner's. Existing links default to "anyone with link" on backfill |
| OD-03 | Invite ownership schema (SEC-02): `recruiterAccountId` FK + legacy rows backfill rule (sender unknowable → "unknown sender" visibility) | Requires reviewed migration path first (TA-L8) |
| OD-05 | Collected references (SEC-06 / Q4): retire route + dead UI with 410 (recommended) / rebuild model with `newToken()` / leave documented | No records exist (model never existed) — nothing to migrate either way |
| OD-06 | One-time PDF semantics (SEC-04/05/12, TA-L6): PDF download consumes the link vs PDF is read-only-until-revoked but rejected after resolve-consumption | One policy, all four public surfaces; tests follow the choice |
| OD-07 | Identity claims (SEC-08): honest relabel / true out-of-band random callback code / domain-challenge email | (b) is the strongest honesty fix; (a) is copy-only |
| OD-09 | Public onboarding POST (SEC-14): require session / verify-before-send / keep with throttle + consent stamp | Product-intent call; wizard migration affects landing funnel |
| OD-11 | Consent versioning (SEC-16) + retention windows (SEC-17) + legal review of /privacy deletion-path promises | Schema change optional; retention numbers owner-set; counsel input flagged |
| OD-12 | Legacy 365-day validity rows (Phase B): run `scripts/clamp-validity-30d.ts` (owner-approved action with before/after counts) or leave as-is | No silent reset; already-issued reports untouched by default |
| OD-13 | `terms.ts` legal wording (TA-L9) | Legal text — edit only with explicit approval |
| OD-14 | Email verification gating before checklist completion (UX Q6) | Recommended: require verified email |
| OD-15 | Token/session hashing at rest + legacy cuid-token rotation policy (SEC-20) | Schema change; dual-read transition; legacy rows keep working either way |
| OD-16 | Account unification sequencing (UX Q1 / Phase 2) | Largest single item; needs migration plan approval before scheduling |

**Unverified items requiring owner-side verification (cannot be resolved from code):** (1) whether Vercel's `SUPERADMIN_CODE`/`RECRUITER_CODE` still equal the published strings — owner compares by eye in the Vercel dashboard (never paste values into chat) and rotates regardless; (2) production DB contents — counts-only `SELECT COUNT(*)` per table via Supabase SQL editor; (3) whether the dev-gated code literal survives into the production client bundle — post-deploy browser-source search (fix by CH-01 regardless); (4) HSTS/edge headers — `curl -sI` on the production URL; (5) Brevo quota/deliverability — dashboard review; (6) prod log growth — weekly counts; (7) whether real data ever entered the tracked SQLite file's history — provenance is evidence-based (seed-code analysis), owner confirms; (8) whether the platform auto-commit can be disabled — Vercel/git integration settings check.

---

## 13. Explicitly deferred items

Deferred **by design** in this roadmap, each with the reason and revisit trigger:

1. **Git history rewrite** — only if OD-08 selects it; affects all clones; not bundled with anything.
2. **Account unification implementation** (UX Phase 2, item 6) — largest item; needs its own migration plan and Gate 2; not a prerequisite for any security fix.
3. **P2/P3 UX pack details** (draft autosave, a11y polish, mobile cards, data-download/delete entries) — scheduled behind P1; drafts need an approved schema addition.
4. **Product analytics/KPI instrumentation** (K1 started-event, K6, K10) — ships with the UX change each measures, not before (UX plan §18 discipline); baselines captured at Phase-1-of-UX start.
5. **Consolidating duplicate `hashPassword`/`verifyPassword` (TA-L14)** — opportunistic, zero-risk-of-harm debt.
6. **zod validation migration** — hand-rolled validation is consistent and audited; revisit only during a large schema-bearing batch.
7. **Real SMS provider** — none proposed; simulated SMS is documented behavior (SEC-25) until the owner provisions one.
8. **Fraud-heuristic re-validation against data** — explicitly unverified in the technical audit; revisit with real data volumes.
9. **New paid infrastructure of any kind** — none required by any finding in this register.
10. **`CollectedReference` rebuild** — contingent on OD-05; if retired, its dead UI (752 lines) leaves with it.

---

## 14. Recommended first implementation batch

**Batch A-1 — containment (five changes, all small, reversible, no schema change, no existing data affected).**

| # | Change | Files | Effort | Test |
|---|---|---|---|---|
| 1 | CH-01 burned-code literal scrub | `SuperAdmin.tsx:735-742` + 6 script files | S | Grep gate: literal absent from `src/` + `scripts/`; dev autofill env-driven |
| 2 | CH-02 production seed gate | `bootstrap/route.ts`, `checklistDemo.ts` | S | New vitest: production-mode bootstrap creates no demo rows |
| 3 | CH-03 untrack `db/custom.db` + `worklog.md` | Git index only | S | `git ls-files` check + next-commit non-regression check |
| 4 | CH-04 `db:push` guard + DEPLOY.md warning + `test` script | `package.json`, new guard script, `DEPLOY.md` | S | Guard refuses non-local DSN; `bun run test` wired |
| 5 | CH-05 recruiter payload minimization | `recruiter/route.ts` | S | Payload assertion test: no `signerIp`/`signerUserAgent`/`flags`/raw tokens |

**Owner ops action in the same batch:** OD-01 rotation of `SUPERADMIN_CODE` + `RECRUITER_CODE` in Vercel and local `.env` (performed by the owner; new values never pasted into chat; treated as burned-in-history forever).

**Batch flow:** pre-flight note (affected files + acceptance criteria) → Gate 2 scope confirmation → implement with failing-test-first where practical → `bunx vitest run` + `tsc` + K9 → fix report + diff summary → Gate 4 regression acceptance → Gate 5 delivery approval → commit + push (Vercel deploys).

**Explicitly not in Batch A-1:** schema-bearing fixes (CH-06/07), collected-references disposition (CH-11), one-time semantics (CH-08/09), throttling (CH-10) — each is queued for the following batch with its own gate.

---

## 15. Final checklist for approving implementation

- [ ] Gate 1: findings register accepted (Section 3), including the A3 correction and the unverified-items list (Section 12.2)
- [ ] OD-01, OD-04, OD-08, OD-10 answered (first-batch blockers)
- [ ] First-batch scope approved by Change ID (CH-01..CH-05), including the owner-side rotation action
- [ ] Rotation values created by the owner in Vercel + local `.env` (never shared in chat)
- [ ] Regression acceptance path agreed: `bunx vitest run` green, `tsc` ≤ 46 / zero new, K9 clean
- [ ] Delivery path agreed: fix report + diff review → explicit push approval (Vercel deploys on push)
- [ ] Standing rules reaffirmed: no destructive DB commands; no history rewrite; no legacy-record changes; existing candidate/reference data preserved; batch-by-batch reviewable commits only
- [ ] Later-batch decisions scheduled for review: OD-02, OD-03, OD-05, OD-06, OD-07, OD-09, OD-11, OD-12, OD-13, OD-14, OD-15, OD-16

---

## Completion confirmation (Option 4, Section 10)

- **Audit reports actually available and reviewed in full:** `VAULTVERIFY_TECHNICAL_AUDIT.md`, `VAULTVERIFY_PRODUCT_UX_PLAN.md` (Rev. 2 + Appendix C), `VAULTVERIFY_SECURITY_PRIVACY_AUDIT.md`, `VAULTVERIFY_FIX_REPORT.md`. No report was missing; none was invented; the one stale claim (UX Appendix A3 on `SkillVerification`) was verified in code and corrected in Section 3.4 rather than propagated.
- **Confirmed findings:** 19 open confirmed items in the register (SEC-01..17 minus fixed, plus TA-L2/L4/L6/L7/L9/L14 and the hardening tail), of which 4 are High-class (SEC-01, SEC-02, SEC-03, SEC-07). 18 prior findings verified as **Previously Fixed** in the current tree (C1–C6, H1, M1/M2/M5–M8, M3-partial, L1, L10, 12.1a–j, L12, Q2-partial), backed by the 40/40 test run executed this session.
- **Findings remaining unverified:** the 8 environment/production items in Section 12.2 (Vercel env values, production DB contents, client-bundle literal, HSTS, email quotas, log growth, SQLite-file provenance, auto-commit trigger) — each with a safe owner-side verification path; no production system was contacted during this phase.
- **Recommended first batch:** Batch A-1 (Section 14) — CH-01..CH-05 + owner rotation action.
- **Blocking owner decisions:** OD-01, OD-04, OD-08, OD-10 (first batch); OD-02/03/05/06/07/09/11/12/13/14/15/16 for later phases.
- **Files that would likely change:** exactly the CH-01..CH-20 file lists in Section 5 — no file path in this roadmap is speculative; every cited path was inspected in the current workspace.
- **Confirmation:** **No application code, tests, dependencies, configuration, database records, schema, Git history, remote repository, or deployment was modified.** Baseline at start: `main` @ `13915de`, clean, synced with origin; at completion the working tree contains exactly two uncommitted changes — this document and the protocol worklog entry — and nothing was committed or pushed, per the Option 4 rules.
