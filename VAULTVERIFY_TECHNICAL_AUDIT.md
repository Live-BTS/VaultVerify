# VaultVerify — Technical Audit (Phase C findings report)

- **Starting point:** branch `main` @ `0292ec7`; audit performed on isolated branch `audit/tech-fixes`.
- **Method:** source-level inspection of every API route (20 files), auth/session libs, Prisma schema, PDF/email/notification libs, and client callers. Static analysis only where noted. **No live HTTP calls against side-effectful GET endpoints** (`/api/candidate`, `/api/recruiter` write `AuditEvent` rows on read; `/api/bootstrap` writes seed rows), so those findings are code-verified, not live-verified.
- **Environment:** Next.js 16.1.1 / React 19 / Prisma 6.11.1 (SQLite) / Tailwind 4 / pdfkit / zod. **No test suite exists** (no test script, zero `*.test.*` files). No `prisma/migrations` directory (db-push workflow).
- **Baselines captured:** `tsc --noEmit` = **46 errors, all pre-existing** (12 in the dead `/api/checklist/reference` route, 7 superadmin, 6 SuperAdmin.tsx, 3 reference/share, 3 checklist/share, 2 CollectedRefForm, 2 complete, 1 skills-checklist-pdf, remainder in misc routes). Lint/build results recorded in Phase E section of the fix report.

---

## Architecture summary (B1)

- Single Next.js App Router app; all logic lives in **route handlers** (`src/app/api/**/route.ts`) plus a lib layer (`src/lib/bts/*`). No middleware, no server actions, no background jobs — "scheduled" work (reminder sweeps, expiry sweeps) is triggered by user calls (`POST /api/recruiter run_reminders`, lazy expiry in GETs).
- **Two parallel product stacks share one database:**
  1. **Legacy References** (`Candidate`, `ReferenceRequest`, `ReferenceResponse`, `SkillVerification`, `FraudFlag`) — "authenticated" by typed email only in the candidate portal; recruiter side uses a static env code.
  2. **Skills Checklist** (`ChecklistAccount` with scrypt passwords, sessions, email verification) + candidate-controlled sharing (`ChecklistShareLink`, `ReferenceShareLink`).
- Auth: custom scrypt+`timingSafeEqual` password hashing (good), httpOnly SameSite=Lax cookies, server-side session tables, OTP+RBAC superadmin console. No CSRF tokens (SameSite=Lax + JSON-only POSTs mitigate), no rate limiting outside the admin console.
- Business logic and route handling are interleaved (validation inline in handlers); some duplication (two `hashPassword`/`verifyPassword` copies in `auth.ts` and `checklistAuth.ts`, identical).

## Security & privacy findings

### CRITICAL

**C1 — Unauthenticated candidate data disclosure via email (IDOR).**
`src/app/api/candidate/route.ts:23-48` (GET). Evidence: handler takes `?email=`, does `db.candidate.findFirst({ where: { email } })`, no session check, returns the full aggregate — profile, skills, **all reference requests incl. `response` (referee answers, ratings, remarks, `signatureName`, `signerIp`, `signerUserAgent`), fraud `flags`, `callbackCode` (derived from the live invitation token) and `refLink` (the live single-referee invitation URL)**. Expected: 401 without a session; data returned only for the session's own email. Actual: anyone knowing a candidate's email retrieves their entire reference pipeline, including tokens that let them act on it. Repro: `GET /api/candidate?email=<any candidate email>`. Impact: full cross-account data exposure + invitation-token theft. Fix: session gate + email match (Phase D-1). Regression: 401 unauthenticated; 403 on email mismatch; 200 for own session.

**C2 — Fully unauthenticated outbound messaging and state changes.**
`src/app/api/candidate/actions/route.ts:37-176` (POST). Evidence: no auth anywhere in the handler; `nudge` sends SMS+email to any referee for any `requestId`; `swap` expires a live request and sends a new invitation to an attacker-chosen referee email; `add_reference` creates requests and spends agency credits keyed only by `body.email`. Also unlimited `nudge` (no cooldown on `lastReminderAt`). Expected: session-gated, ownership-checked. Actual: anyone can mail-bomb referees and drain credits. Fix: session gate + ownership (Phase D-1) + 12h nudge cooldown (Phase D-6). Regression: 401 unauthenticated; 403 foreign requestId; cooldown 429/409 on repeat.

**C3 — Unauthenticated reference-packet PDF download.**
`src/app/api/pdf/[requestId]/route.ts:9-107` (GET). Evidence: no auth check at all; serves the branded packet containing referee contact details, answers, signature, `signerIp`, `signerUserAgent`, and fraud `flags` for any `requestId` (cuid). Expected: owner session or valid share token. Actual: IDOR by identifier; requestIds also leak via `/api/recruiter` payloads. Fix: owner-session OR `?share=<ReferenceShareLink token>` validated for revoked/expiry/used (Phase D-1). Regression: 401 unauthenticated; 200 with owner session; 200 with valid share token; 403 with revoked/expired token.

**C4 — Email-only share-ledger disclosure (IDOR) returning active tokens.**
`src/app/api/reference/share/route.ts:36-71` (GET `?email=`). Evidence: returns **every** reference share link for a candidate — including non-revoked, unexpired **tokens** — to anyone supplying the email. Expected: session-gated to the owning account. Actual: email knowledge ⇒ full referee reports via `/api/reference/share` resolve with the stolen tokens. Fix: session gate (Phase D-1). Regression: 401 unauthenticated; identical payload for own session.

**C5 — Unauthenticated recruiter POST actions.**
`src/app/api/recruiter/route.ts:81-143` (POST). Evidence: GET requires `recruiterAuthed`, but POST never authenticates: `run_reminders` sweeps **all** pending requests agency-wide and sends SMS+email; `resolve_flag`/`unflag_request` mutate fraud-flag state and flip FLAGGED→COMPLETED. Expected: authenticated + authorized (flags are an admin function). Actual: complete stranger can trigger outbound messaging and alter screening outcomes. Fix: recruiter-session gate; flag actions disabled for recruiters (superadmin console already owns them) (Phase D-2). Regression: 401 unauthenticated; scoped reminders for session recruiters; 403 for flag actions.

**C6 — Agency-wide pipeline via static shared code (P0-3).**
`src/app/api/recruiter/route.ts:24-72` (GET) + `src/lib/bts/auth.ts:146-151` (`recruiterAuthed`). Evidence: static `RECRUITER_CODE` env grants the **entire** reference pipeline — every candidate, referee identity, responses, flags, **live `refLink` invitation tokens**, plus notification-log and audit-log tails — to anyone with the code. Expected (PO Q3 decision): recruiters see only explicitly shared reports; global-pipeline access via shared codes removed; legit admin access preserved. Actual: global exposure. Fix: session-only access; pipeline scoped to requests with an **active** (non-revoked, unexpired, unconsumed) share link; legacy code path returns explicit 403; notifications/audit tails removed from the recruiter payload (Phase D-2). Regression: code-only request → 403; session → only shared reports present.

### HIGH

**H1 — Expired reports still served by the answers companion endpoint.**
`src/app/api/checklist/share/answers/route.ts:10-19` (GET). Evidence: enforces `revoked`, one-time-used, and link `expiresAt` — but **not** `link.completion.expiresAt` (the 30-day report validity), which `share/route.ts:20` enforces on resolve. Expected: uniform report-expiry enforcement (Phase D requirement #1). Actual: a share link outliving the report keeps leaking full answers + attestation. Fix: add `checklist_expired` 403 via a shared policy helper (Phase D-3). Regression: expired completion → 403 `checklist_expired` even when link is valid.

**H2 — `/api/checklist/reference` queries a model that does not exist (guaranteed 500).**
`src/app/api/checklist/reference/route.ts:27,70,99,186,194,224` call `db.collectedReference`; **no `CollectedReference` model exists in `prisma/schema.prisma`**. Every call 500s; the only UI callers (`CollectedRefsPanel.tsx`, `CollectedRefForm.tsx`) are dead code (zero importers); this route alone accounts for **12 of the 46 pre-existing tsc errors**. Disposition is a **product decision (PO Q4: defer deletion, trace + document first)** — options documented in §Recommended corrections; **not changed in this audit** per the PO's explicit condition. Regression (post-decision): chosen path returns 200/410 consistently; tsc error count drops by 12.

**H3 — Recruiter invite `lookup`/`list` expose candidate PII without consent scoping.**
`src/app/api/checklist/invite/route.ts:73-93` (`lookup` returns name/phone/profession/specialty for **any** email) and `:96-137` (`list` returns all invites agency-wide with candidate emails, phones, and unclaimed invite claim URLs). Auth exists (recruiter code/session) but scope is unbounded; `ChecklistInvite` has **no recruiter FK** (only a free-text `recruiterName`), so per-recruiter scoping requires a schema change. Per audit spec §6 this is a **material product decision — documented, not implemented**. Recommendation: add `recruiterId` FK, scope `list` to the session recruiter, and require candidate consent for `lookup`.

**H4 — Demo account with fixed credentials is seeded on first request, including in production.**
`src/app/api/bootstrap/route.ts:17` → `src/lib/bts/checklistDemo.ts:16` (`emma.chen` / `demo1234`), triggered by `GET /api/bootstrap` and first page load. Verified in code; production impact strongly suspected (Vercel auto-deploys this repo; first visit seeds). Recommendation (product/config decision): gate demo seeding behind an explicit sandbox env flag. **Not changed** to avoid altering the documented development workflow.

### MEDIUM

**M1 — Referee-facing GET leaks completed response + fraud flags.**
`src/app/api/reference/[token]/route.ts:79-80`: `response: request.response` (incl. `signerIp`, `signerUserAgent`) and `flags: request.flags` are returned to whoever holds the invitation token, even after completion. Data-minimization fix in Phase D-4: strip flags and IP/UA from this payload. Regression: GET payload contains no `flags` key; no signer IP/UA fields.

**M2 — "Email domain" identity verification is self-attested.**
`src/app/api/reference/[token]/route.ts:131-145`: method `EMAIL_DOMAIN` marks identity "verified" after a syntactic email check against a free-provider blocklist; **no proof of domain/email ownership is ever requested**. The report UI/PDF then presents `identityMethod` in a way that overstates assurance. Fix (Phase D-4, copy-level honesty): render as "Employer email domain — self-attested". A true domain-proof flow is a product decision (documented, not implemented).

**M3 — No lockout/rate limit on candidate & recruiter sign-in; no nudge cooldown.**
`src/app/api/auth/route.ts:110-147`, `src/app/api/checklist/account/route.ts:104-129` (failed-login counters are recorded but nothing enforces a limit), `src/app/api/candidate/actions/route.ts:112-131` (unlimited nudges). The superadmin console *does* rate-limit OTPs correctly (3/10 min, void-on-issue, 5 attempts — positive finding). Fix: 12h candidate nudge cooldown (Phase D-6); sign-in lockout documented as recommendation (lockout-abuse trade-off is a product call).

**M4 — Secure tokens persisted at rest in `NotificationLog` (and listed in the console).**
`src/lib/bts/notifications.ts:97-113` stores the full body of every message; invite/reminder bodies contain `?r=<token>`, `?cr=<token>` capability links. Retention/redaction is a product decision — documented, not implemented.

**M5 — Prisma query logging enabled unconditionally.**
`src/lib/db.ts:8-10` `log: ['query']` prints every query **with parameters** (password hashes, tokens) to server logs, in production too. Fix: gate to non-production (Phase D-5).

**M6 — Unhandled race in reference submit (500 with HTML body).**
`src/app/api/reference/[token]/route.ts:112-328`: POST has no try/catch; two concurrent submits pass the `request.response` check and the second hits the `requestId @unique` violation → unstyled 500. Data integrity is preserved by the constraint. Fix: wrap in try/catch returning the standard JSON error (Phase D-5).

**M7 — Session resolution never re-checks account status (hardening).**
`src/lib/bts/checklistAuth.ts:50-57`, `src/lib/bts/auth.ts:126-133`: `getAccount()`/`getRecruiterSessionAccount()` ignore `status === "SUSPENDED"`. Console suspend does kill sessions today (`superadmin/route.ts:402-405`), so this is defense-in-depth — but any status change that doesn't delete sessions (direct DB edits, future code paths) leaves suspended users fully active. Fix: status check inside session resolution (Phase D-5).

**M8 — Capability tokens rely on `cuid()` defaults.**
Share links, invitations, verification and reset tokens all use Prisma's `@default(cuid())` (`schema.prisma:78,169,236,302,425,447`). CUID is collision-resistant but not cryptographically random and embeds timing/fingerprint structure; these strings are the *only* secret guarding protected reports. Fix: generate `randomBytes(24)` base64url tokens at creation for `ChecklistShareLink`, `ReferenceShareLink`, `ChecklistInvite`, `ReferenceRequest`, `EmailVerification`, `PasswordResetToken` (Phase D-7); existing rows keep working (strings only). Regression: new tokens match `^[A-Za-z0-9_-]{32,}$`.

**M9 — Outbound links built from `x-forwarded-host` without an origin allowlist.**
`originOf()` in `auth/route.ts:27-31`, `candidate/route.ts:16-20`, `candidate/actions/route.ts:17-21`, `recruiter/route.ts:17-21`. Verification/reset/invite links inherit an attacker-supplied Host header on infrastructure that doesn't normalize it (Vercel does; self-hosted deployments may not). Recommendation: origin allowlist env (`VV_PUBLIC_ORIGIN`) with fallback. Documented; not implemented (infra-dependent trade-off).

### LOW / INFORMATIONAL

- **L1** Stale schema comments contradict enforced behavior: `ChecklistCompletion.expiresAt` "completedAt + 365 days" (`schema.prisma:294`), header "valid for 1 year" (`:185`). Fixed (comments only) in Phase D-8.
- **L2** Dead root endpoint `GET /api` → "Hello, world!" (`src/app/api/route.ts`).
- **L3** Client stores recruiter access code in `sessionStorage` and candidate email in `localStorage` (`RecruiterDashboard.tsx:88`, `CandidateDashboard.tsx:69`).
- **L4** `x-forwarded-for` trusted for IP logging/attributes (spoofable); affects fraud heuristics quality.
- **L5** `next.config.ts` sets `ignoreBuildErrors: true` (tech-debt A3) — 46 pre-existing tsc errors flow into production builds unchecked.
- **L6** One-time share links don't actually limit data pulls: `/api/checklist/share/answers` deliberately doesn't consume one-time views, so data is fetchable pre-consumption (design nuance; documented).
- **L7** Checklist-invite email failures swallowed silently: `.catch(() => undefined)` (`checklist/invite/route.ts:177`).
- **L8** No `prisma/migrations` — schema managed by `db push`; no reviewed production migration path exists yet (process gap).
- **L9** Legal copy still says skills are marked "Manager-verified" (`src/content/terms.ts:68`). The described *mechanic* is accurate (referee confirmation), but the term was retired by the Q2 decision. **Requires PO approval to change** — proposed replacement documented; not modified.
- **L10** Remaining copy overclaims (all verified; fixed in Phase D-8): `brand.tsx:73` SkillBadge tooltip "Manager-verified by reference" + chip "Verified" (live via `RecruiterDashboard.tsx:494` — the worklog's "dead code" note was wrong); `ReferencesPanel.tsx:165` "VaultVerify verifies your experience and capabilities…"; `RecruiterChecklists.tsx:235` "reusable for a year"; `page.tsx:234` fallback tagline "References, verified. Skills, proven."; `emailTemplates.ts:51` same tagline; `seed.ts:36` same tagline.
- **L11** Dead code (zero importers, retained): `HeroSection.tsx` (410 lines), `CollectedRefsPanel.tsx` (401), `CollectedRefForm.tsx` (351), `src/lib/bts/checklistPdf.ts` (superseded by `src/lib/pdf/skills-checklist-pdf.ts`). Deletion is a PO decision (Q4/A1).
- **L12** No automated tests existed prior to this audit (Phase E adds a suite).
- **L13** `GET /api/bootstrap` performs writes (idempotent seeds) as a side effect of a GET.
- **L14** Duplicate `hashPassword`/`verifyPassword` implementations in `auth.ts` and `checklistAuth.ts` (identical logic; consolidation deferred to keep the audit focused).

### Verified-correct behaviors (positive findings)

- **P-a** 30-day checklist validity enforced server-side end-to-end: `constants.ts:59` → `checklist/complete/route.ts:127` → `share/route.ts:20` (403 `checklist_expired`) → `checklist/pdf/route.ts:125-126` → PDF text (`:93,105`). Boundary defined: expiry = `completedAt + 30d`; invalid **at and after** `expiresAt` (`<` comparisons against `new Date()`).
- **P-b** Workflow independence (requirement B): `reference/[token]/route.ts` submit writes only `ReferenceResponse` (+ `SkillVerification`, optional referee account); **zero writes** to `ChecklistCompletion`/`ChecklistRequest` — a reference can never change checklist scores, status, or validity; no shared mutation path exists in either direction.
- **P-c** Share-link resolve enforcement is correct for revoked (404), one-time-used (403), expired link (403), expired report (403) on both products (`checklist/share/route.ts:17-20`, `reference/share/route.ts:83-87`).
- **P-d** Superadmin console: OTP with hashed at-rest codes, 3/10-min email rate limit, single-live-code policy, 5-attempt lock, 8h sessions, full RBAC (OWNER/ADMIN/SUPPORT) re-resolved per call, session kills on suspend/reset.
- **P-e** Account auth: scrypt + `timingSafeEqual`, no username enumeration on resend/verify, suspended-account dead ends, failed-login counters.
- **P-f** Email templates HTML-escape interpolated values (`emailTemplates.ts:37,274-278`).
- **P-g** Credit/command layer is fail-closed (`guard.ts:20-28`, `credits.ts:21-45`).

## Recommended corrections (Phase D scope) — and what is intentionally deferred

**Implemented in this audit (verified defects, safe, reversible):**
1. Session-gate + ownership: `/api/candidate` GET, `/api/candidate/actions` POST, `/api/reference/share` GET (C1, C2, C4).
2. Recruiter least-privilege per PO Q3: session-only pipeline scoped to explicitly shared reports; legacy code path disabled with explicit message; flag actions removed; PDF via owner-or-share-token (C3, C5, C6).
3. Shared share-policy helper; `checklist_expired` enforced on `/api/checklist/share/answers` (H1).
4. Reference GET data minimization + honest identity-method labels (M1, M2).
5. Hardening: try/catch on reference submit; suspension check in session resolution; query logging gated to non-production (M5, M6, M7).
6. Nudge cooldown (M3, partial).
7. Crypto-random capability tokens (M8).
8. Copy truth fixes (L10) + stale schema comments (L1).
9. Regression suite (vitest): pure-policy unit tests + DB-backed integration tests + a copy claim-family gate.

**Documented but deliberately NOT implemented (product decisions / out of audit scope):**
- H2 route disposition (PO Q4 condition — options: repair model, disable with 410, or delete route + dead components).
- H3 recruiter scoping (needs `recruiterId` FK schema change + consent design).
- H4 demo-seeding gate in production (config decision).
- M3 sign-in lockout, M4 notification-log redaction/retention, M9 origin allowlist (design trade-offs).
- L9 terms.ts wording change (legal text — PO approval required).
- Legacy-portal retirement/unified account (PO Q1 — phased per plan §20 Phase 2).

## Explicitly unverified areas

- **No live HTTP testing** of any endpoint in this audit (write-avoidance for GETs that mutate; no test harness existed). All route behavior claims are source-verified.
- Production/Vercel behavior (env vars, deployments, email sending) — never touched per rules.
- `fraud.ts` heuristics quality (rules reviewed at design level in the UX plan; not re-validated against data in this audit).
- `SuperAdmin.tsx` console UI behavior beyond route-level RBAC (2000+ line client component; console actions verified server-side only).
- Browser-level accessibility claims (static analysis only; no screen-reader testing).

---

*Prepared as the Phase C gate of the technical audit. Phase D corrections and their test evidence are recorded in `VAULTVERIFY_FIX_REPORT.md`.*
