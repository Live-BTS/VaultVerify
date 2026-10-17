# VAULTVERIFY — SECURITY & PRIVACY AUDIT (Read-Only)

**Report date:** 2026-10-16
**Audit type:** Static, evidence-based security and privacy audit. No fixes were implemented; no code, tests, dependencies, database records, configuration, Git history, remote repository, or deployment was modified by this audit.
**Scope basis:** Option 3 specification (Sections 1–14). Repository: `github.com/Live-BTS/VaultVerify`, inspected in the connected sandbox workspace at its current local commit state.

---

## 1. Executive summary

VaultVerify is a healthcare staffing verification platform with two deliberately separate workflows: a **Skills Checklist** (candidate self-assessment, 30-day validity, never independently verified) and **Professional References** (independent referee submissions). Candidates control report access through share links.

The codebase has recently received substantive security fixes (documented in `VAULTVERIFY_TECHNICAL_AUDIT.md` and `VAULTVERIFY_FIX_REPORT.md`, present at HEAD). This audit **confirms those fixes are real and in place**: the six former critical IDOR/auth findings (C1–C6) are now gated, share-link policy is unified in `sharePolicy.ts`, tokens are cryptographically random at every creation site, referee-facing payloads are minimized, suspension checks are enforced on session resolution, and a 40-test regression suite exists.

However, this audit identifies **22 findings**, including **four High/Critical-class issues that remain exploitable**:

1. **Cross-tenant recruiter visibility (SEC-01, High).** Any self-registered recruiter account sees every reference report that *anyone* has shared — the share-link model has no per-recipient binding, so "explicitly shared" degrades to "shared with the world of recruiters." Payloads include referee identities, fraud flags, and signer IP/User-Agent.
2. **Checklist-report IDOR via the invite/PDF path (SEC-02, High).** Any recruiter session (or the legacy access code) can download *any* candidate's completed checklist PDF by supplyi­ng any invite ID; invite IDs for the whole platform are enumerated by the same role via `POST /api/checklist/invite {action:"list"}`. This bypasses candidate-controlled sharing entirely for the checklist product.
3. **Burned static access codes still armed (SEC-03, High; Critical if unrotated).** The superadmin backup code value (`zipvault2026`) is public in the repository source and history, and the `SUPERADMIN_CODE` backup path grants full OWNER console access. The `RECRUITER_CODE` legacy value (recorded in worklog/plan history as the demo code) still unlocks the invite list/lookup and the invite-PDF path. Rotation is a pending owner action; until it happens, repo readers hold live credentials.
4. **Known-credential demo accounts seeded in every environment, including production (SEC-07, Medium–High).** Unauthenticated `GET /api/bootstrap` seeds `emma.chen@example.com` with the committed password `demo1234` plus demo candidate/reference data into whatever database is configured — including the production database per `DEPLOY.md`.

Additional confirmed defects: one-time share links are **not consumed** by either PDF route (a "one-time" link grants repeat PDF downloads until revoked or the 30-day report expires) (SEC-04, SEC-05); the collected-references route is a guaranteed runtime 500 because its Prisma model does not exist in the schema (SEC-06); the referee "callback code" identity check is trivially derivable from the token the referee already holds (SEC-08); there is no sign-in throttling or lockout, and unauthenticated resend endpoints can trigger outbound email at will (SEC-09); the runtime SQLite database and `worklog.md` remain tracked and published on origin (SEC-10, SEC-11).

**No production system was contacted; no destructive commands were run; no secrets, tokens, or candidate records are reproduced in this report.** All findings carry file:line evidence. Section 13 gives a prioritized roadmap; Section 14 lists the decisions the product owner must make before remediation; Section 15 lists what this audit could not verify and how to verify it safely.

**Compliance note:** This is a code-level engineering audit. It does **not** establish HIPAA, GDPR, or any other legal compliance, and no such claim should be derived from it. Legal questions are flagged in Section 6.

---

## 2. Scope, workspace state, and limitations

### 2.1 Workspace state at audit start (recorded before any inspection)

| Item | Value |
|---|---|
| Branch | `main` |
| Local HEAD | `a4fcf335512fac31479cd75a21d397b303e7fbb9` ("Technical audit + verified fixes: authz gates (C1-C6), share-policy unification (H1), hardening (M1-M8), copy truth (L10), 40-test regression suite; docs: audit + fix report + plan addendum") |
| Working tree | Clean (`git status --porcelain` empty at start) |
| Remote | `origin` = `https://github.com/Live-BTS/VaultVerify.git` |
| Remote tip | `origin/main` = `0292ec768e1778821fbdee021ac6ca5fe637baa1` |
| Relationship | Local `main` is **2 commits ahead** of `origin/main`, 0 behind (`db8a55f` platform auto-commit, `a4fcf33` audit-fix commit). **Not pushed** — awaiting owner approval, consistent with standing delivery rules. |
| Local commits preserved | Yes — nothing was reset, rebased, amended, or discarded. |

All prior local commits and uncommitted work were preserved. The audit did not switch branches, check out GitHub state, or modify the tree.

### 2.2 What was inspected (all read-only)

- All 20 API route files under `src/app/api/**`, all shared libraries under `src/lib/bts/*` and `src/lib/pdf/*`, `next.config.ts`, `src/proxy.ts`, `Caddyfile`, `package.json`, `.env.example`, `.gitignore`, `prisma/schema.prisma` (21 models + session/token models).
- Git metadata: tracked files, ancestry vs origin, history of `.env`, `db/custom.db`, `worklog.md`; secret-pattern scans over full history (`xkeysib`, `pooler.supabase`, static code strings) — matches were located and characterized **without printing any value**.
- Structural inspection of `db/custom.db` via a read-only SQLite connection (`mode=ro`): table list, row counts, and column **names** only. No record values were read or printed.
- Static type baseline: `bunx tsc --noEmit` (46 errors, all pre-existing; see §9.4).

### 2.3 Limitations

- **No dynamic exploitation was attempted** against any route. Findings marked *Confirmed* are proven by code trace (route → authorization logic → data access → response), not by a live exploit. Nothing was labeled "exploitable" without a complete code-level path.
- **The existing test suite was NOT executed.** `tests/setup.ts` runs `bunx prisma db push` (on a disposable file). Although that is safe by construction, the audit's authorization explicitly forbids running database push commands, so tests were reviewed but not run. Their status is "present, not executed in this audit" (§11).
- **Production environment values, Vercel runtime configuration, and the production database contents were not inspected** (no production access; no value disclosure). Where a finding depends on runtime configuration (e.g., whether `SUPERADMIN_CODE` on Vercel still equals the public value), it is marked accordingly.
- The client bundle was not built; whether the dev-gated code string is eliminated from the production bundle was reasoned from Next.js build semantics, not verified (§15).

---

## 3. Threat model and sensitive assets

### 3.1 Assets, ranked by sensitivity

1. **Reference reports** — referee identities (name, title, email, phone, facility), signed answers, overall ratings, discipline disclosures (q8), e-signature metadata (`signatureName`, `signerIp`, `signerUserAgent`). Stored on `ReferenceRequest`/`ReferenceResponse`/`SkillVerification`.
2. **Skills-checklist reports** — self-assessed ratings, recency, additional questions, attestation block including a **signature image or typed signature** (`ChecklistCompletion.attestation`, data-URL up to ~300 KB).
3. **Candidate identity data** — `Candidate` (legacy reference pipeline) and `ChecklistAccount` (portal): name, email, phone, city/state/zip, license number, profile fields.
4. **Bearer capabilities** — reference invitation tokens (`/?r=`), checklist invite tokens (`/?view=checklist&invite=`), checklist share tokens (`/?s=`), reference share tokens (`/?rs=`), collected-reference tokens (`/?cr=`), email-verification and password-reset tokens, session IDs, superadmin session tokens, and the OTP codes. These are the *only* secret guarding most public reads.
5. **Credentials** — password hashes (scrypt), the superadmin OTP hashes, and the two static env codes (`SUPERADMIN_CODE`, `RECRUITER_CODE`).
6. **Operational data** — `AuditEvent` (actor, IP, actions), `NotificationLog` (full message bodies, including token-bearing URLs), `CreditLedger`, `FraudFlag`.
7. **Reputation/integrity assets** — the "self-assessed, not independently verified" labeling; workflow separation between references and checklists (a referee must never be able to alter checklist data).

### 3.2 Adversaries considered

- **Anonymous internet user** — attacks every public route: share links, invite preview/claim, reference form, bootstrap, resolve endpoints, PDF routes with tokens.
- **Authenticated candidate** — attempts horizontal escalation to other candidates' profiles/reports.
- **Authenticated recruiter** (self-service signup → email verification → onboarding) — attempts to see reports never shared with them. *This is the adversary that defeats SEC-01/SEC-02.*
- **Holder of a leaked/burned static code** — effectively an anonymous user who read the public repository.
- **Curious repo reader** — clones the public GitHub repo and reads tracked runtime data (`db/custom.db`, `worklog.md`, history).
- **Malicious referee** — submits fraudulent references; attempts to inflate/alter checklist data (workflow separation).

### 3.3 Trust boundaries

Browser ⇄ Next.js API routes (no server-rendered authorization beyond route handlers; `src/proxy.ts` does path-aliasing only, **no** auth in middleware); API ⇄ SQLite/Postgres via Prisma; API ⇄ Brevo (email, live when `BREVO_API_KEY` set; SMS always simulated). There is no service-to-service boundary; every check must live in route handlers, which is where this audit focused.

---

## 4. Authentication findings

### 4.1 What is done well (verified)

- **Password hashing:** scrypt with a fresh 16-byte random salt per password, 64-byte key, self-describing `salt:hash` storage (`src/lib/bts/auth.ts:21-33`, duplicated in `checklistAuth.ts:11-23`). Comparison is length-checked then `timingSafeEqual` (`auth.ts:32`).
- **Sessions:** 24-byte CSPRNG IDs (`cks_`/`rcs_` prefixes), stored server-side with expiry; cookies `vv_ck`/`vv_rc` are `HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-day MaxAge, `path=/` (`auth.ts:113-126`, `checklistAuth.ts:25-38`).
- **Session invalidation:** logout deletes the server row + cookie; password reset (superadmin-triggered) kills *all* sessions for the account (`auth/route.ts:213-219` with `killCandidateSessions`/`killRecruiterSessions` from `guard.ts:47-55`); suspension kills sessions at suspend time *and* is re-checked defensively on every session resolution (`auth.ts:135-141`, `checklistAuth.ts:57-64`) and on every sign-in (`auth/route.ts:131-134`).
- **Email verification:** single-use tokens (`EmailVerification.consumedAt`), 24 h TTL, prior unconsumed tokens invalidated on reissue (`auth.ts:52-89`); sign-in for unverified accounts re-issues rather than authenticating (`auth/route.ts:135-139`).
- **Superadmin OTP (primary path):** 6-digit CSPRNG code (`randomInt`), SHA-256 hashed at rest, 5-minute TTL, max 5 wrong attempts, only one live code at a time, request-side rate limit of 3 codes / 10 minutes counting every request (`superadmin/route.ts:36-40, 280-347`). Codes are issued only to the owner address or an ACTIVE team member (`superadmin/route.ts:265-279`) — the endpoint does not leak whether an arbitrary address is an admin because it returns a specific 403 either way (see caveat SEC-19 on enumeration nuance).
- **RBAC:** roles (OWNER/ADMIN/SUPPORT) are re-read from `SuperadminAccount` on every call; suspension kills live sessions instantly; SUPPORT is read-only by allowlist (`superadmin/route.ts:59-104`); owner-only commands enumerated (`:90-93`).
- **Fail-closed posture:** unset `SUPERADMIN_CODE`/`SUPERADMIN_EMAIL` disables the console (`:277-279`); unset `RECRUITER_CODE` disables the legacy path (`auth.ts:156-157`); missing `DATABASE_URL` produces explicit 503s.

### 4.2 Findings

**SEC-03 — Burned static access codes remain armed (High; Critical if env values unrotated)**
- **Confidence:** Confirmed (code + repo history). **Component:** static-code auth paths.
- **Evidence:** `src/components/bts/SuperAdmin.tsx:735-742` renders a dev-gated autofill button whose label is the literal backup code (value visible in the public repository source at that line, and in `scripts/auth-smoke.ts:85`, `scripts/phase3-smoke.ts:9`, `scripts/test_collected_refs.sh:48`, plus worklog history). The backup path authenticates as full OWNER with no OTP and no session: `superadmin/route.ts:79-82` (`resolveIdentity` static-code branch) and `:36`. `RECRUITER_CODE` still authorizes `recruiterAuthed` (`auth.ts:155-160`), which gates `POST /api/checklist/invite` send/list/lookup (`invite/route.ts:68-71`) and the checklist-PDF invite path (`checklist/pdf/route.ts:136-138`). Prior internal records (`VAULTVERIFY_PRODUCT_UX_PLAN.md` §"legacy deviation", worklog DELIVERY-B1) document the recruiter demo code as public and `SUPERADMIN_CODE` as "public in shipped source since earlier commits"; `VAULTVERIFY_FIX_REPORT.md:71` lists rotation as a pending action.
- **Preconditions:** the Vercel/local env values still equal the published strings (not verifiable from code — owner must confirm). Repo is public.
- **Impact:** full superadmin console control (every candidate, every report, session kills, platform config) and the recruiter invite/PDF surface, to anyone who has read the repository.
- **Remediation (owner action, not code):** rotate both env values in Vercel + any local `.env`; treat GitHub-history copies as burned forever; then remove the literal from `SuperAdmin.tsx` (replace with "use the sandbox .env value"), and retire the static recruiter path for invite list/lookup/PDF (see SEC-02).
- **Regression test:** assert `resolveIdentity` rejects a published placeholder value; assert invite `list`/`lookup` and PDF invite path reject code-only auth once the legacy path is retired.
- **Owner decision required:** yes (rotation + whether to keep a static backup path at all).

**SEC-09 — No sign-in throttling or lockout; unauthenticated email triggers (Medium)**
- **Confidence:** Confirmed (missing-control). **Component:** `POST /api/auth` signin/resend; `POST /api/checklist/account` login/resend.
- **Evidence:** failed-login counters are incremented and displayed in the console (`auth/route.ts:117-129`; `checklist/account/route.ts:108-114`; surfaced at `superadmin/route.ts:200-206`) but are **never enforced** — no lockout, delay, CAPTCHA, or per-IP throttle exists for `signin`, `verify`, or `resend` in either route. `resend` fires a real templated email to any address without authentication (`auth/route.ts:150-162`; `checklist/account/route.ts:131-139`).
- **Attack preconditions:** network access only. Impact: online password guessing at network speed against a single account (mitigated only by password minimum length and scrypt cost); email-bombing/harassment via `resend`; Brevo quota exhaustion.
- **Distinguish:** this is a *missing defense-in-depth control* with confirmed abuse potential, not a bypass. The generic sign-in error (`auth/route.ts:124` "Email or password is incorrect.") prevents error-based enumeration, but scrypt is skipped entirely for unknown accounts, enabling timing-based account enumeration (see SEC-19).
- **Remediation:** per-account lockout or exponential backoff driven by `failedLogins`/`lastFailedLogin` (fields already exist); per-IP+per-email throttle on `signin`/`resend`; consider a short signed cooldown token for resend.
- **Regression test:** 6 consecutive wrong passwords → 7th attempt is delayed/rejected; resend called 10× in a minute → 429 after N.
- **Owner decision:** no (engineering), except choosing lockout policy parameters.

**SEC-13 — Unverified-account credential overwrite via re-signup (Low)**
- **Confidence:** Confirmed. **Component:** signup (both portals).
- **Evidence:** `auth/route.ts:69-76` and `checklist/account/route.ts:86-91`: if the email exists but `emailVerified` is false, signup **overwrites** `name` and `passwordHash` and re-sends the verification link.
- **Preconditions:** attacker knows a person's email *before* that person verifies. Impact: attacker sets a password on the not-yet-verified account (they still cannot verify it without the inbox); when the real person later signs up they hit "account already exists — sign in instead" and cannot set their own password (their re-signup overwrites the attacker's password — recoverable loop, but confusing and a griefing vector). Low severity because verification email still goes only to the true inbox.
- **Remediation:** require the *original* password (or a signed intent token) to mutate an existing unverified row; or rate-limit and notify on overwrite.
- **Owner decision:** no.

**SEC-19 — Timing/enumeration nuances in auth comparisons (Informational)**
- Static-code and OTP-hash comparisons are not constant-time (`superadmin/route.ts:80`, `:320` use `===` on strings); sign-in runs scrypt only when the account exists (no dummy-hash equalization) enabling timing-based account enumeration in theory. Both are hard to exploit over a network against this design (OTP has 5 attempts; static codes are high-entropy once rotated) — **defense-in-depth**, not a confirmed vulnerability. Remediation: `timingSafeEqual` on digests; dummy scrypt on unknown account.

**SEC-20 — Session and client-side storage hygiene (Informational)**
- Session IDs are stored **unhashed** in the database (a DB leak exposes live sessions; defense-in-depth: store SHA-256 of the ID). Fixed 30-day TTL with no rotation on use and no sliding renewal. Expired session rows are never purged (18 live `ChecklistSession` rows in the sandbox DB; unbounded growth). The SuperAdmin console stores both the session token **and the static backup code** in `sessionStorage` (`SuperAdmin.tsx:203-211, 239-256`) — readable by any successful XSS; CSP (§9.3) mitigates but does not eliminate this. None of these are independently exploitable findings; grouped as hardening.

**Positive verification — no default credentials in code paths.** No hardcoded passwords guard anything; the only hardcoded credential-like literal is the sandbox demo/backup string covered in SEC-03/SEC-07. `.env.example` contains placeholders only. The historical committed `.env` (initial commit `a2a8a59`, deleted in `59bedcd`) contained **only** `DATABASE_URL` with a local `file:/home/...` SQLite DSN — verified by value-shape inspection without printing it; **no cloud credential was ever committed in `.env`**. Full-history scans found no Brevo key (`xkeysib` appears only as a masked documentation placeholder in `DEPLOY.md:44`, zero matches for the strict key format) and no Supabase DSN with embedded credentials (`pooler.supabase` hits are documentation/probe-script references).

---

## 5. Authorization and report-access findings

### 5.1 Verified-good authorization (regression-checked in this audit)

- `GET /api/candidate` — session required; requested email must equal the session account's email; otherwise 403 (`candidate/route.ts:29-37`). Former C1 is fixed.
- `POST /api/candidate/actions` — session required (`:52-53`); `nudge`/`swap` resolve the request and require `request.candidate.email === account.email` (`:109-121`); `add_reference` keys off the session's own email (`:66-68`). Former C2 is fixed. 12 h nudge cooldown returns 429 (`:129-134`).
- `GET /api/pdf/[requestId]` — owner session **or** a valid reference share token; bare `requestId` → 401 (`pdf/[requestId]/route.ts:32-46`). Former C3 is fixed.
- `GET /api/reference/share` — session-gated ledger scoped to the owning candidate's requests only (`reference/share/route.ts:38-49`). Former C4 is fixed.
- `POST /api/recruiter` — session required; flag actions hard-denied with audit stamp (`recruiter/route.ts:103-115`); reminder sweep limited to actively-shared requests (`:117-127`). Former C5 (unauthenticated reminders + flag mutation) is fixed. Former C6 (static-code agency-wide pipeline) is fixed **for this route** (code-only → 401, tested at `tests/authz.test.ts:356-361` — not executed in this audit).
- Checklist ownership: `POST /api/checklist/share` create/revoke/extend verify `completion.accountId === account.id` (`checklist/share/route.ts:65-92`); `POST /api/checklist/complete` verifies invite/request ownership (`complete/route.ts:35-45`); `GET /api/checklist/share/answers` enforces the unified policy (`share/answers/route.ts:11-17`); `POST /api/checklist/request` is session-gated with duplicate/validity guards (`request/route.ts:8-34`); `GET /api/checklist/extra-questions` is session-gated (`extra-questions/route.ts:10-13`).
- Superadmin: every non-OTP action passes `resolveIdentity` + `roleAllowed` (`superadmin/route.ts:350-359`); `impersonate_view` is a read-only, audit-stamped dossier that creates no session (`:508-544`); `revoke_all_sessions` and team management are OWNER-only (`:90-93`).
- Suspension fail-closed everywhere: `guardCandidateAccount`/`guardRecruiterAccount` (`guard.ts:31-44`) plus session-resolution checks noted in §4.1.

### 5.2 Findings

**SEC-01 — Recruiter visibility is platform-wide, not per-recipient (High)**
- **Confidence:** Confirmed. **Component:** `GET /api/recruiter`, `ReferenceShareLink` model.
- **Evidence:** `recruiter/route.ts:44-53` fetches **all** `referenceRequest` rows and filters to those with *any* active share link — there is no per-recruiter predicate, and `ReferenceShareLink` (`schema.prisma:167-180`) has **no recipient field** (no `recruiterId`, no bound identity; only an optional free-text `label`). The returned object spreads the entire request (`:76-81`): candidate identity, `refName/refTitle/refEmail/refPhone`, the full `response` **including `signerIp`, `signerUserAgent`, raw answers JSON**, `skillChecks`, and the `flags` array — despite the file's own header stating "Fraud-flag resolution is an admin function" and despite the referee-facing surface's minimization rule (`reference/[token]/route.ts:52-57`: "Fraud flags, signer IP/UA and other screening data NEVER leave the platform").
- **Attack preconditions:** a valid recruiter account (self-service signup → email verify → onboarding). No sharing relationship required.
- **Trace:** route (`:44`) → authorization (session only, `:34`) → data access (all requests, any candidate) → response (`:76-81` full spread). Object-level authorization on the report is performed **only against the existence of an active link**, not against *who* the link was granted to.
- **Impact:** any recruiter sees every currently-shared reference report platform-wide, including referee PII and screening data; recruiters also receive the raw share-link **tokens** (`:78`), letting them view reports of candidates who never intended them as recipients. This is a broken object-level authorization (BOLA) on a multi-tenant surface.
- **Remediation (owner decision on model):** add a recipient binding to `ReferenceShareLink` (e.g., optional `sharedWithRecruiterId` + "anyone with link" as an explicit candidate choice); scope the recruiter GET by that binding; stop spreading the raw request — project an explicit field list; strip `signerIp`/`signerUserAgent`/`flags` from the recruiter payload (admin console keeps them).
- **Regression test:** recruiter B must not see a report whose only active link was created for recruiter A (once binding exists); payload must not contain `signerIp`/`flags`.
- **Owner decision required:** yes — the Q3 model as implemented matches the letter ("explicitly shared") but not the intent ("with them").

**SEC-02 — Checklist-report IDOR: any recruiter can download any invite-based checklist PDF; invite list exposes PII + live claim tokens (High)**
- **Confidence:** Confirmed. **Component:** `GET /api/checklist/pdf` (invite path), `POST /api/checklist/invite` (list/lookup).
- **Evidence chain:** (1) `checklist/pdf/route.ts:136-144` — invite path authorizes with `recruiterAuthed(code)` (session **or** legacy code) then loads *any* `ChecklistInvite` by ID with **no check that this recruiter sent it** (the comment says "an invite they sent" but the code never compares ownership; `recruiterName` is self-reported free text, not an account reference). (2) `invite/route.ts:97-138` — `{action:"list"}` returns the **60 most recent invites platform-wide** with candidate name/email/phone, and `claimUrl` containing the **live invite token** for unclaimed ones (`:123`). (3) `invite/route.ts:74-93` — `{action:"lookup"}` returns name/phone/profession for **any** email's account (former H3, deferred — still open).
- **Attack path:** recruiter account → `list` → pick any completed invite `id` → `GET /api/checklist/pdf?invite=<id>` (session cookie) → candidate's full self-assessment PDF including attestation signature data. Alternatively the burned `RECRUITER_CODE` (SEC-03) reaches the same path with no account at all.
- **Impact:** wholesale bypass of candidate-controlled sharing for the checklist product — the exact class of defect the Q3 decision was meant to eliminate, surviving through the invite workflow.
- **Remediation:** bind invites to the sending recruiter account at creation (`recruiterAccountId`, not self-reported name); enforce `invite.recruiterAccountId === session.account.id` on the PDF invite path; scope `list` to the caller's own invites; gate `lookup` behind a documented need (or return minimal fields); retire the legacy code from these routes.
- **Regression tests:** recruiter session + foreign invite id → 403/404; `list` returns only own invites; code-only request to PDF invite path → 401.
- **Owner decision:** yes (data model change; migration for existing rows).

**SEC-14 — Unauthenticated candidate onboarding sends outbound email (Low; Needs Validation for product intent)**
- **Confidence:** Confirmed (code); product-intent question open. **Component:** `POST /api/candidate`.
- **Evidence:** `candidate/route.ts:83-186` — no `getAccount()` call; any caller can create a `Candidate` (with arbitrary email/`consentSignature`), create reference requests, trigger referee emails (live when Brevo configured; SMS simulated), and receive live referee links in the response. Guarded only by `guardOutbound` (agency status + credit balance, `:115-116`; sandbox grant is 500 credits per `schema.prisma:32`).
- **Impact:** bounded spam relay (1 credit per batch); third parties can receive unconsented "you've been listed as a reference" email. The landing wizard historically used this endpoint; the portal now has an account-gated flow — whether the public POST should remain is a product decision.
- **Remediation options:** require a session (migrate the wizard), or verify the requester's email before any outbound send, or keep with per-IP rate limiting + explicit consent audit stamp.
- **Owner decision:** yes.

**SEC-21 — Error/config surfacing on public endpoints (Informational)**
- `POST /api/auth` signup returns `emailLive: emailLive()` (`auth/route.ts:89`) — reveals whether `BREVO_API_KEY` is configured to anonymous callers (trivial probing aid). Checklist share resolve returns the candidate's **email** to any link holder (`checklist/share/route.ts:48`) — a data-minimization decision to revisit. 500s elsewhere are generic; Prisma error *codes* only are appended (`auth/route.ts:250-253`) — acceptable.

---

## 6. Token and sharing findings

### 6.1 Token inventory and entropy (verified)

| Token | Field | Generation | Verified |
|---|---|---|---|
| Reference invite | `ReferenceRequest.token` | `newToken()` at every creation site (`candidate/route.ts:143`; `candidate/actions/route.ts:76,163`) | 192-bit CSPRNG (`tokens.ts:9-11`) |
| Checklist invite | `ChecklistInvite.token` | `newToken()` (`invite/route.ts:154`) | ✔ |
| Checklist share | `ChecklistShareLink.token` | `newToken()` (`checklist/share/route.ts:103`) | ✔ |
| Reference share | `ReferenceShareLink.token` | `newToken()` (`reference/share/route.ts:203`) | ✔ |
| Email verification / password reset | `EmailVerification.token`, `PasswordResetToken.token` | `newToken()` (`auth.ts:60,99`) | ✔ |
| Superadmin session | `SuperAdminSession.token` | `sas_` + 24 random bytes hex (`superadmin/route.ts:342`) | ✔ |
| Session IDs | `ChecklistSession.id`, `RecruiterSession.id` | `cks_`/`rcs_` + 24 random bytes (`checklistAuth.ts:26`, `auth.ts:114`) | ✔ |
| Collected reference | `CollectedReference.token` | **schema `cuid()` default** (`checklist/reference/route.ts:194-195` omits `token`) | ✘ SEC-06 (model also missing) |

The M8 fix is real: no *active* creation site relies on `cuid()` for a bearer token except the broken collected-reference route. **Legacy rows** created before the fix retain cuid-based tokens (rotation is explicitly out of scope per the audit authorization; noted as an owner decision in §14).

### 6.2 Enforcement map (verified against `sharePolicy.ts`)

- `POST /api/checklist/share {resolve}` → `evaluateChecklistShare`: revoked→404, one-time-used→403, link-expired→403, report-expired(30-day)→403 (`checklist/share/route.ts:16-23`; `sharePolicy.ts:34-44`).
- `GET /api/checklist/share/answers` → same policy (`share/answers/route.ts:14-16`). H1 parity **confirmed** for these two.
- `GET /api/checklist/pdf?share=` → **own checks only**: revoked→404, link-expired→403, report-expired→403; **never checks or sets one-time consumption** (`checklist/pdf/route.ts:122-127`) → SEC-04.
- `GET /api/pdf/[requestId]?share=` → revoked→404, one-time-used→403, link-expired→403; **checks but never sets** `viewedAt` (`pdf/[requestId]/route.ts:35-39`) → SEC-05.
- `POST /api/reference/share {resolve}` → revoked/used/expired → 404/403/403 (`reference/share/route.ts:85-89`).
- Reference-form expiry: server-side 410 after `expiresAt` unless already completed (`reference/[token]/route.ts:130-132`); lazy status flip on GET (`:35-39`). Reference report itself does not expire (product design; checklist is the 30-day product).

### 6.3 Findings

**SEC-04 — One-time checklist share links are never consumed by the PDF path (Medium)**
- **Evidence:** `checklist/pdf/route.ts:122-127` checks `revoked`, `expiresAt`, `completion.expiresAt` — no `viewedAt` check, no consumption write. One-time links have `expiresAt = null` (`:108`), so the only remaining stop is revocation or the 30-day report expiry.
- **Preconditions:** possession of the one-time token (e.g., the intended recipient, or anyone who obtained the URL from browser history/email forwarding).
- **Impact:** the "one-time" promise is false for PDF access — the recipient (or any later holder) can re-download indefinitely for up to 30 days. Contradicts `sharePolicy` and the UI copy; also undermines revocation UX (candidate believes the link died after first view).
- **Remediation:** route the PDF path through `evaluateChecklistShare` (add a `mode: "read-only"` that checks `used` without consuming, matching the answers endpoint semantics — i.e., a consumed one-time link must 403 here too), or explicitly consume on first PDF download if that is the chosen product behavior.
- **Regression test:** create ONE_TIME link → resolve (consume) → `GET /api/checklist/pdf?share=` must 403; unconsumed one-time → 200 and increments `viewCount`.

**SEC-05 — Reference PDF download neither consumes nor blocks after consumption consistently (Medium)**
- **Evidence:** `pdf/[requestId]/route.ts:35-39` returns 403 when a ONE_TIME link has `viewedAt`, **but a recipient who goes straight to the PDF URL (never opening the share view) can download repeatedly** — the route never sets `viewedAt`. Consumption happens only in `reference/share/route.ts:91-95` (resolve).
- **Impact:** same promise-gap as SEC-04 on the reference product; a one-time reference report can be fetched many times directly via `/api/pdf/<requestId>?share=<token>`.
- **Remediation:** same policy unification — one code path for "validate without consuming" that still rejects consumed links, plus decision on whether PDF download itself consumes.
- **Regression test:** direct PDF GET on ONE_TOKEN link → 200 first time, then either consumed (2nd → 403) or explicitly declared non-consuming with `used` → 403 after resolve; pick one and test it.

**SEC-12 — One-time consumption race (Low)**
- **Evidence:** both resolve handlers compute `firstView` then write `viewedAt: link.viewedAt ?? new Date()` unconditionally (`checklist/share/route.ts:26-30`; `reference/share/route.ts:91-95`). Two concurrent resolves both observe `viewedAt = null` and both succeed (no conditional update `where viewedAt: null`, no unique guard). The P2002 race fix (M6) covers reference double-*submit*, not share consumption.
- **Impact:** a one-time link can be viewed twice within a concurrency window. Low likelihood (requires near-simultaneous requests) but cheap to fix: `updateMany({ where: { id, viewedAt: null }, data: {...} })` and check count, or a Prisma conditional update.
- **Owner decision:** no.

**Token-hygiene observations (Informational, grouped):**
- Tokens are stored **unhashed** (plaintext) in all four share/invite tables; a DB leak (see SEC-10 — the DB is published) yields live capabilities. Hashing tokens at rest (keep an indexed SHA-256) is the standard hardening; requires migration decision.
- Tokens appear in **URLs** (`/?r=`, `/?rs=`, `/?view=checklist&invite=`, `/?cr=`) → browser history, Referrer (mitigated by `Referrer-Policy: strict-origin-when-cross-origin`, `next.config.ts:53`), server logs, and **email bodies**. They are also persisted in full in `NotificationLog.body` (45 rows in sandbox DB) — visible to the superadmin console via `notifications_list`. Acceptable for a bearer-link product, but worth an explicit data-retention decision (§14).
- Scope validation: a share token is validated **only against its own workflow's table** (checklist tokens cannot open reference reports and vice versa) — verified by table-scoped lookups; no cross-workflow reuse path exists. ✔
- Brute-force feasibility: 192-bit tokens make online guessing infeasible; public resolve endpoints are unthrottled, which is acceptable **given** the entropy, and should be revisited if entropy ever drops (e.g., legacy cuid-era rows — cuid embeds a timestamp + fingerprint and is materially weaker; see legacy-row decision in §14).

---

## 7. Privacy and consent findings

### 7.1 Consent implementation (verified)

- **Checklist attestation:** `POST /api/checklist/complete` requires `agreed`, `consentAccepted` (Privacy Policy + Terms), a signature mode, and a signature; snapshots everything into `ChecklistCompletion.attestation` with `signedAt` (`complete/route.ts:109-128`). Server-enforced (400 with problem list when missing) — ✔.
- **Legacy reference pipeline:** typed `consentSignature` + `consentSignedAt` recorded on `Candidate` (`candidate/route.ts:130-131`) — but see SEC-14 (endpoint is unauthenticated).
- **Sharing identifies the report and scope:** share creation requires an owned `completionId`/`requestId`; the share payload names the candidate, specialty, and access type/duration/label; resolve echoes them back. ✔
- **Revocation/expiration server-side:** revoked/expired/consumed enforced in every public read path (with SEC-04/SEC-05 gaps on the two PDF routes). ✔ (policy) / ✘ (PDF parity)
- **Referee-facing minimization:** the referee form payload zeroes `signerIp`/`signerUserAgent` and excludes flags (`reference/[token]/route.ts:52-57,55-57`); referee sees only their own in-progress response. ✔ (M1 verified)
- **Error messages:** generic on user-facing 500s; no account/report details leak through error bodies (verified across routes). ✔

### 7.2 Gaps and findings

**SEC-15 — Screening data exposed on the recruiter surface (Low; inconsistency with the platform's own minimization rule)**
- As detailed in SEC-01: `GET /api/recruiter` returns `response.signerIp`, `response.signerUserAgent`, and `flags` to every authenticated recruiter. The platform's stated rule is that screening data "NEVER leaves the platform" — today it leaves it toward recruiters. The **reference PDF packet** also embeds `signerIp`/`signerUserAgent` (`pdf/[requestId]/route.ts:109-110`) in a document distributed to recruiters/share recipients. Remediation: strip from both surfaces (keep in admin console + raw DB), or document why recruiters need them.
- **Owner decision:** minimal (yes/no on including IP/UA in distributed artifacts).

**SEC-16 — Consent records are not versioned or independently durable (Low)**
- There is no dedicated consent ledger: consent lives on `Candidate.consentSignature/consentSignedAt` and inside the checklist `attestation` JSON. The **Privacy Policy / Terms version accepted is not recorded** (no version field anywhere), and consent cannot be tied to a specific share action later. `Consent cannot be silently fabricated or altered by another user` holds for checklists (auth-gated) but not for the legacy pipeline (SEC-14).
- Remediation: add policy version + template hash to attestation snapshots; optionally a `ConsentRecord` model (actor, action, report, policy version, timestamp). Legal review item, not strictly security.
- **Owner decision:** yes (schema change; legal input).

**SEC-17 — Logs and audit trail retain sensitive data with no retention policy (Low)**
- `AuditEvent.detail` stores referee emails (`candidate/route.ts:174` `detail:{ref: refEmail}`), statuses, flag types; `AuditEvent.ip` stores client IPs; `NotificationLog` stores full message bodies containing **bearer-token URLs**; all unbounded (no TTL/pruning job; known tech-debt A8). The superadmin console exposes both logs to SUPPORT-role admins (read-only set includes `audit_query`, `notifications_list`, `superadmin/route.ts:94-98`).
- Impact: expands the blast radius of any DB/log compromise; inconsistent with the documented "logs don't retain sensitive personal info" aspiration. Also an audit-completeness gap in the other direction: checklist PDF downloads via share tokens are **not audit-logged** (the reference PDF route logs `PDF_DOWNLOADED`, `pdf/[requestId]/route.ts:123`; the checklist PDF route logs nothing for the share path), and recruiter actions are attributed to a **self-reported display name** rather than the account (`invite/route.ts:181-185` `actorId: invite.recruiterName`), weakening non-repudiation.
- Remediation: add share-PDF audit events; log recruiter account IDs; define retention (e.g., purge NotificationLog bodies > 90 days; hash tokens in logs).
- **Owner decision:** retention windows.

**Legal-review items (not code defects):** privacy policy (`src/content/privacy.ts`) promises access/deletion via `myzipvault@gmail.com`, but **there is no self-service deletion path and no documented admin deletion procedure** in code; retention promises should be reconciled with actual behavior (AuditEvent/NotificationLog unbounded). No HIPAA/GDPR compliance claim is made or implied by this audit. Data collected (health-related skill self-assessments + reference answers) may trigger sector-specific obligations — flag for qualified counsel.

---

## 8. Database, Git, and secret-exposure findings

### 8.1 Verified state

- **`db/custom.db` is tracked and published on `origin/main`** (verified via `git ls-tree -r origin/main`). It has been touched by 22 commits across history; `/.gitignore:61-64` now lists `/db/*.db*`, but ignore rules do not untrack an already-tracked file, so every commit (including platform auto-commits) keeps republishing drift (this session's baseline already shows the file back in the tree). → **SEC-10.**
- **Structural inspection (no record values read):** 28 tables; sandbox-scale data — 8 candidates, 18 reference requests, 8 responses, 4 checklist accounts, 7 completions, 6 checklist share links, 2 reference share links, 18 sessions, 45 notification logs, 170 audit events, 0 recruiter accounts, 0 superadmin accounts/OTP rows. Sensitive *columns* exist as expected (`passwordHash`, `token`, `signerIp`, `consentSignature`, emails). Provenance: row counts and the seed code (`seed.ts`, `checklistDemo.ts` — `@example.com` addresses, `555` phone numbers, `IL-RN-…` license placeholders) indicate **synthetic demo data**. Classification: *synthetic with unknown drift* — the file also receives runtime writes from any local flow (dev.log smoke tests), so its contents cannot be guaranteed synthetic forever. → **SEC-10.**
- **Exposure reachability:** the DB **remains in reachable history** on origin (added `59bedcd`-era, still in tip tree). Deleting the file in a future commit removes it from *new* checkouts' tip but not from history; full removal requires history rewrite (owner decision; see §14).
- **`worklog.md` is tracked and published** (also ignored-but-tracked): contains internal ops notes, including references to the public admin code and a prior secret-scan narrative. → **SEC-11.**
- **`.env` history:** committed in the initial commit (`a2a8a59`), modified once (`ad41ed7`), deleted in `59bedcd`. Last committed content held a **single key, `DATABASE_URL`, with a local `file:/home/...` SQLite DSN** (verified by value-shape checks; the value was not printed). No cloud DSN, no API keys. Residual risk: negligible; note only that the DSN discloses a local sandbox path.
- **Other secret-pattern scans:** no real Brevo key format anywhere in history (only the masked doc placeholder in `DEPLOY.md:44`); no Supabase credentials; `zipvault2026` (admin backup code, see SEC-03) and the recruiter demo code are public via source/worklog history — rotation pending.
- **Environment handling:** all secrets read from `process.env` at runtime; `systemConfig.ts` exposes **configured-flags only** to the console (`buildSystemStatus` returns `configured: !!process.env[...]`, never values — verified `systemConfig.ts:108-128`). `.env.example` documents all variables with placeholders. `next.config.ts` does not inline any secret (no `NEXT_PUBLIC_` secret in use).
- **Error logging:** server-side `console.error` of route exceptions may include Prisma error details in platform logs; user-facing bodies are generic (§5.2 SEC-21 nuance). Source maps disabled for production browser bundles (`next.config.ts:39`).
- **Seed/demo data:** → SEC-07 below.

**SEC-07 — Unauthenticated bootstrap seeds known-credential demo accounts into every environment (Medium–High)**
- **Evidence:** `GET /api/bootstrap` is public (`bootstrap/route.ts:9-24`) and runs `ensureSeed()` + `seedBuiltinTemplates()` + `seedChecklistDemo()`. `checklistDemo.ts:11-23` creates `emma.chen@example.com` with the committed password literal (`demo1234`), a completed ICU checklist, and a pending request; `seed.ts` adds demo candidates (`maya.rodriguez@example.com` etc.) with reference requests/responses/tokens. `DEPLOY.md` documents production as Supabase Postgres — i.e., the **production** database receives these seeds the first time anything (or anyone) hits `/api/bootstrap` in the deployment.
- **Preconditions:** none (public GET); the known password is in the public repo.
- **Impact:** a publicly-known login on the production candidate portal (synthetic profile, but a real session-capable account that can create completions/share links — data pollution, phishing surface, confusion in the admin Data Center); demo candidate/reference rows mixed into production data; the "unknown data" problem for the tracked DB file is perpetuated.
- **Remediation:** gate all seeding behind `NODE_ENV !== "production"` or an explicit `SEED_TOKEN`/admin action; keep templates seeding (harmless) but make demo *accounts/data* dev-only; if production has already been seeded, require an owner-approved cleanup (no deletion performed by this audit).
- **Regression test:** bootstrap in production mode returns without creating `emma.chen@example.com`.
- **Owner decision:** yes (whether demo data should exist in prod at all; cleanup of already-seeded rows).

**SEC-10 — Runtime database tracked in a public repository (Medium)**
- Evidence as above (`git ls-files` / `git ls-tree -r origin/main` include `db/custom.db`; 22 historical commits; `.gitignore:61` ineffective while tracked; platform auto-commits re-publish drift — documented in worklog DELIVERY-B1 addendum).
- Impact: bearer tokens for demo reports, referee emails (synthetic), session IDs, and audit data are published; any future accidental local use of real data would be published on the next auto-commit; repository bloat.
- Remediation (owner-approved batch): `git rm --cached db/custom.db`, commit, then decide on history scrub (BFG/`git filter-repo`) vs. accept-history; rotate anything that ever touched the file if real data was ever present (owner confirms provenance).
- **Owner decision:** yes (history rewrite affects clones/PRs).

**SEC-11 — `worklog.md` tracked and published (Low)**
- Evidence: `git ls-files` includes `worklog.md`; `/.gitignore:71` lists it; it ships internal ops narratives and code references (incl. the public admin string). Remediation: `git rm --cached worklog.md` in the same approved batch as SEC-10. **Owner decision:** trivial (batch it).

**DEPLOY.md placeholder (Informational):** `DEPLOY.md:44` shows `BREVO_API_KEY` as `xkeysib-…` in the env table — ensure it is always presented as a placeholder (it currently is; verified no strict-format key anywhere).

---

## 9. API and web-security findings

### 9.1 Input validation & injection (verified)
- **SQL injection:** all data access goes through Prisma parameterized queries; no string-built SQL found (`db.ts` exports a single `PrismaClient`). ✔
- **Validation:** hand-rolled but consistent — JSON parse guards on every POST; required-field checks; length clamps (`label.slice(0,120)`, `message.slice(0,500)`, signature ≤ 400 KB, additional answers ≤ 2000 chars); rating bounds enforced server-side (reference submit re-validates 1–5 and recomputes the overall server-side, `reference/[token]/route.ts:183-216`; checklist complete re-validates against template rows, `complete/route.ts:56-107`). No zod schemas — acceptable but repetitive; mass-assignment is prevented by explicit field mapping everywhere (checked every create/update call). ✔
- **XSS:** React-escaped output; the CSP restricts script-src to self (+inline, SEC-22 note); referee/answer text renders through React text nodes in the share views. No `dangerouslySetInnerHTML` on user data found in the audited surfaces. ✔
- **Path traversal:** PDF filenames derive from user-controlled names but are sanitized (`account.name.replace(/[^a-z0-9]+/gi, "-")`, `checklist/pdf/route.ts:154`; `Content-Disposition` filename only; no filesystem paths built from user input). ✔
- **Open redirects:** none found — no server-side redirects take user URLs (only `proxy.ts` fixed-path alias). ✔
- **SSRF:** the only outbound calls are Brevo (fixed endpoint) — no user-supplied URL fetching exists. ✔
- **Unsafe file handling:** attestation `upload` mode stores a data-URL string (≤ 400 KB) — rendered as `<img src>` in client/PDF; data-URLs are inert server-side. ✔ (CSP `img-src 'self' data: blob:` permits it.)

### 9.2 CSRF, CORS, caching (verified)
- **CSRF:** no CSRF tokens; mitigated structurally — all mutations are `application/json` POSTs (cross-site form posts fail `req.json()`), cookies are `SameSite=Lax`, and no CORS headers are emitted (cross-origin JS reads blocked). Residual: none practical today; add Origin/Sec-Fetch-Site checks as cheap defense-in-depth. **Informational.**
- **CORS:** not configured (same-origin only) — correct for this product. ✔
- **Caching:** checklist PDF sets `Cache-Control: private, no-store` (`checklist/pdf/route.ts:159`); the **reference PDF sets no Cache-Control** (`pdf/[requestId]/route.ts:125-130`) — add `private, no-store` for parity. **Low.** Share/answers endpoints return JSON with default headers; consider `no-store` on `share/answers` too (token in query string).

### 9.3 Security headers (verified)
`next.config.ts:45-60` sets CSP (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, and COOP. `poweredByHeader: false`. Strong posture.

**SEC-22 — CSP uses `script-src 'self' 'unsafe-inline'` (Informational, defense-in-depth).** Required by the current Next bootstrap without nonce infrastructure; acceptable, but a nonce/strict-dynamic upgrade would let the console stop storing the backup code in `sessionStorage` with less risk (SEC-20). HSTS is not set by the app — on Vercel it is platform-managed; verify after any self-host move (Caddyfile has no TLS layer — local only).

### 9.4 Type-safety posture
`bunx tsc --noEmit` at audit time: **46 errors, all pre-existing** (baseline 46 = 46 from prior sessions; zero introduced since). **8 of the 46 reference the missing `CollectedReference` model** (SEC-06). `next.config.ts:32` `ignoreBuildErrors: true` (tech debt A1) means these fail silently in production builds — recommend turning it off once SEC-06 is resolved. **Informational here; availability impact under SEC-06.**

### 9.5 Rate limiting (summary)
Only superadmin OTP requests (3/10 min) and candidate nudges (12 h) are throttled. Everything else — sign-in, verification resend, share resolve, invite send (credit-bounded only), reminder sweep (schedule-gated per request but invocable by any recruiter) — is unthrottled. See SEC-09 and SEC-01/02 impact notes.

---

## 10. Checklist/reference workflow-integrity findings

### 10.1 Separation verified (clean)

- **`SkillVerification` model** (`schema.prisma:137-147`) is written **only** by the referee submit path (`reference/[token]/route.ts:276-284`, nested under the new `ReferenceResponse`) and read only by the reference PDF/packet and admin surfaces. No code path connects it to `CandidateSkill`, `ChecklistCompletion`, or checklist share policy. ✔
- **`ReferenceResponse.skillsVerified`** (`schema.prisma:118`) is display-only: it drives the "Confirmed by referee" badge on reference rows (`ReferencesPanel.tsx`, Batch 1 rename verified) and never mutates checklist data. ✔
- **No reference-driven writes to checklist data:** grep across all API routes finds `checklistCompletion.update/create` only in checklist routes and in the **superadmin** `decide` action (`superadmin/route.ts:419` — an admin rejecting a checklist request expires its completion; that is an admin lifecycle action, not a reference action). No reference path writes `CandidateSkill` or any completion field. ✔
- **30-day validity:** computed at completion (`complete/route.ts:127`, `CHECKLIST_VALIDITY_DAYS = 30`, `constants.ts:59`), enforced by `sharePolicy` on resolve/answers (403 `checklist_expired`), enforced on the PDF share path (`checklist/pdf/route.ts:126`), printed as "(30 days)" (`:93,105`). Reference completion cannot extend it (no such code path exists). ✔
- **Badge honesty:** SkillBadge no longer shows a "Verified" chip (Batch 1 copy-truth sweep + L10); the remaining claim surfaces were re-grepped during this audit with verb forms — no new overclaims found in live code (`seed.ts` demo strings and `terms.ts` legal copy remain documented deferred items, not code defects).

### 10.2 Findings

**SEC-06 — Collected-references route is a guaranteed runtime 500 (Medium; availability)**
- **Evidence:** every handler in `checklist/reference/route.ts` queries `db.collectedReference` (`:27`, `:70`, `:99`, `:134`, `:186`, `:194`), but **no `CollectedReference` model exists in `prisma/schema.prisma`** — every call throws. 8 of the 46 tsc errors reference it. The feature (candidate-collected references, `/?cr=` links) is dead: GET fails for signed-in users, public preview/submit fail, and the create action (session-gated, `:173-174`) fails after validation. Because failures are caught per-branch, the route fails **closed** (500s, no data exposure) — an availability/consistency defect, not a disclosure.
- **Context:** deliberately deferred pending the Q4 trace-and-decide exercise (worklog TECH-AUDIT-1). Also the one creation site that would rely on a `cuid()` token default (§6.1) — any rebuild must use `newToken()`.
- **Remediation (owner decision):** either (a) retire the route + UI panels, or (b) rebuild the model with hashed/`newToken()` capabilities and policy parity. Legacy data preservation per Q4: no records exist for a model that never existed — nothing to migrate.
- **Owner decision:** yes.

**SEC-08 — Referee identity verification is decorative (Medium)**
- **Evidence:** `CALLBACK_CODE` compares against `deriveCallbackCode(request.token)` (`reference/[token]/route.ts:153-157`), and `deriveCallbackCode` is `h = (h*31 + char) % 1_000_000` over the token (`seed.ts:17-21`) — the referee already holds the token in their URL and can compute the code locally (or with any script). `EMAIL_DOMAIN` merely records a self-typed work-email domain, with no challenge/verification (`:140-152`); free-provider rejection is the only check. `SKIPPED` is allowed with a LOW flag at submit.
- **Impact:** the signed report's displayed `identityMethod` ("EMAIL_DOMAIN verified", "CALLBACK_CODE") implies out-of-band assurance that does not exist; recruiters may overweight it. This is an **integrity/honesty defect**, not a technical bypass of report confidentiality.
- **Remediation options (owner decision):** (a) relabel honestly ("self-attested method: …"), (b) make callback codes truly out-of-band (random code generated at request time, shown only to the candidate's dashboard, not derivable from the token — e.g., store a random 6-digit on the request row), (c) add a real domain challenge email.
- **Regression test:** token holder computing f(token) must NOT satisfy CALLBACK_CODE (option b), or the UI/report label changes (option a).
- **Owner decision:** yes.

**SEC-23 — Referee account creation from the reference flow (Low)**
- `reference/[token]/route.ts:293-317` creates a `ChecklistAccount` for the referee with a password supplied in the same unauthenticated submit body (`accountPassword`), leaving `emailVerified: false`. Preconditions: possession of the invite token (emailed to the referee). Impact: whoever holds the token can pre-create the account with a password they know; the true referee cannot then "sign up" (they can still use resend-verification → inbox control decides). Similar low-risk pattern to SEC-13. Also note the completion notification goes to a synthetic agency address (`:319-324`, `...@recruiting.local`) — harmless but worth knowing. **Owner decision:** no (tighten when touchi­ng the flow).

---

## 11. Email and operational-security findings

### 11.1 Verified

- **Transport selection:** Brevo REST when `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` set; otherwise a sandbox provider that logs and persists (`notifications.ts:36-95`). **SMS is simulated everywhere** (`:55-59`) — no real SMS can be sent today. ✔
- **Test/local safety:** `tests/setup.ts:12-15` sets `DATABASE_URL` to a disposable file and **forces `BREVO_API_KEY = ""`** — the test suite cannot send real email and cannot touch the dev DB. ✔ (Tests themselves were not executed — §2.3.)
- **Demo-address guard:** recipients on `example.com`/`example.org` never send even when Brevo is live (`notifications.ts:45-69`). ✔
- **Token exposure in emails:** invite/verification/reset/OTP emails necessarily contain their tokens (bearer links) — inherent to the design; OTP emails contain a 5-minute code; no additional secrets are embedded. Email templates are DB-overridable (`EmailTemplate` model, superadmin-managed) — template injection is admin-only by design.
- **Admin notifications:** completion notices go to a synthetic `@recruiting.local` address (§10.2 SEC-23 note); no real admin alerting exists yet (product gap, not a vulnerability).
- **Health/errors:** no public health endpoint beyond `GET /api` hello-world; error bodies generic (§5.2).

### 11.2 Findings

**SEC-24 — `db push --accept-data-loss` is wired as a first-class script with no environment guard (Low–Medium, operational)**
- **Evidence:** `package.json:10` `"db:push": "prisma db push --accept-data-loss"`. Prisma applies it to **whatever `DATABASE_URL` is active in the invoking shell**. There is no guard against a production DSN: an operator who runs `vercel env pull` (or exports the Supabase URL) and then `bun run db:push` performs schema sync **with data-loss acceptance on production**. `db:reset` (`:13`, `prisma migrate reset`) is likewise destructive against the active DSN. `DEPLOY.md` contains **no warning** about these scripts (verified by grep).
- **Determinations requested by the spec:** (1) Can the dangerous script target a non-local database? **Yes** — it targets any configured `DATABASE_URL`; nothing restricts it to the sandbox. (2) Was it executed during this audit? **No.**
- **Remediation:** split scripts (`db:push:local` hard-coding the sandbox file via env override) + a pre-run guard script that refuses when the DSN host is not `file:`/localhost; add a DEPLOY.md warning; consider removing `--accept-data-loss` from the default script entirely.
- **Owner decision:** trivial (script hygiene).

**SEC-25 — Notification/audit logs as pseudo-queues (Informational).** `NotificationLog` is the only delivery record (no retry, no provider message-id), and SMS "sends" are simulated while the UI/audit treat them as sent — an operational-integrity risk if SMS is ever assumed live. Track until a real SMS provider is provisioned.

---

## 12. Minimal regression-test proposal (do not implement in this phase)

Existing infrastructure: **vitest** (dev dependency) + `tests/setup.ts` (disposable SQLite via `prisma db push`, forced-simulated email) + 3 suites / 40 tests (`authz.test.ts` C1–C6/H1/M1/B5 + legacy-code rejection; `sharePolicy.test.ts` boundary + policy matrix; `copyClaims.test.ts` K9 claim gate). **Status in this audit: present, NOT executed** (§2.3). Recommended additions, in priority order — all runnable with the existing runner:

1. **Share-consumption parity (closes SEC-04/SEC-05):**
   - ONE_TIME checklist link: resolve → `GET /api/checklist/pdf?share=` must 403 (`used`); unconsumed → 200 and `viewCount` increments.
   - ONE_TIME reference link: direct `GET /api/pdf/[requestId]?share=` twice — assert chosen semantics (consume-on-download → second 403; or `used` → 403 immediately after resolve).
   - Concurrent double-resolve of a one-time link → exactly one success (race fix).
2. **Recruiter scope (closes SEC-01/SEC-02):** recruiter B's GET must not include a request whose only active link was granted to recruiter A (post-binding); recruiter GET payload must not contain `signerIp`, `signerUserAgent`, `flags`; PDF invite path with a foreign invite → 403; `list` returns only the caller's invites; code-only request to invite list/PDF → 401 after legacy-code retirement.
3. **Expiry & independence (extends existing B5/H1 coverage):** link expired + report live → 403; link live + report expired → 403 `checklist_expired` on **all four** public surfaces (resolve, answers, checklist PDF, and — once defined — reference PDF aging policy); reference submit must not alter completion `expiresAt`/`completedAt`/answers (already covered, keep).
4. **Auth controls (closes SEC-09/SEC-13):** N+1 failed sign-ins → lockout/backoff engages; resend → 429 after N/minute; re-signup against an unverified account without the original password → 409 (post-change).
5. **Bootstrap seeding (closes SEC-07):** with `NODE_ENV=production`, `GET /api/bootstrap` creates no demo accounts; with dev env, it does (regression guard for the gate).
6. **Token generation:** every `*ShareLink`/invite/verification row created through the API has a `newToken()`-shaped token (≥ 32 base64url chars) — catches any future revert to `cuid()` defaults.
7. **Rate limiting on auth (post-implementation):** repeat OTP wrong attempts consume the 5-attempt budget (already coded — add the missing test).

Feasibility: 1–6 run entirely on the existing disposable-DB harness with route-handler-level tests (pattern already proven in `authz.test.ts`). No new runner needed. Keep it targeted — ~25–35 new assertions, not a rewrite.

---

## 13. Prioritized remediation roadmap

Ordering principle per spec: unauthorized candidate-data access and exposed bearer credentials first. Nothing here has been implemented.

| Priority | ID | Item | Type | Owner decision? |
|---|---|---|---|---|
| **P0 — now** | SEC-03 | Rotate `SUPERADMIN_CODE` + `RECRUITER_CODE` (Vercel + local); scrub literals from `SuperAdmin.tsx`/scripts | Ops + tiny code | **Yes** |
| **P0 — now** | SEC-07 | Gate demo seeding out of production; decide cleanup of already-seeded prod rows | Code + ops | **Yes** |
| **P0 — next batch** | SEC-02 | Bind invites to sender accounts; scope `list`/`lookup`; ownership check on PDF invite path | Code + schema | **Yes** (schema) |
| **P0 — next batch** | SEC-01 | Per-recipient share binding (or explicit "any-link" model) + payload projection for recruiter GET | Code + schema | **Yes** (Q3 model) |
| **P1** | SEC-04/05 | Unify PDF routes on `sharePolicy`; define one-time PDF semantics; add tests | Code | No |
| **P1** | SEC-09 | Sign-in lockout/backoff + resend throttling (uses existing `failedLogins` fields) | Code | No |
| **P1** | SEC-10/11 | Untrack `db/custom.db` + `worklog.md`; decide history scrub; platform auto-commit exposure ends | Git ops | **Yes** |
| **P1** | SEC-06 | Collected-references: rebuild (with `newToken()`) or retire | Code | **Yes** (Q4) |
| **P1** | SEC-08 | Honest identity labels or real out-of-band callback code | Code/UI | **Yes** |
| **P2** | SEC-12 | Atomic one-time consumption | Code | No |
| **P2** | SEC-13/23 | Unverified-account overwrite protection; referee-account tightening | Code | No |
| **P2** | SEC-14 | Decision + hardening on public onboarding POST | Code | **Yes** |
| **P2** | SEC-15/16/17 | Strip screening data from recruiter/PDF surfaces; consent versioning; log retention + PDF audit events + account-ID attribution | Code + policy | **Yes** (retention) |
| **P2** | SEC-24 | De-fang `db:push`; DEPLOY.md warnings | Scripts | No |
| **P3** | SEC-19/20/21/22/25 | Timing-safe compares; token hashing at rest; session hygiene; CSP nonce upgrade; `Cache-Control` parity on reference PDF; ops logging honesty | Hardening | Some (schema) |

---

## 14. Owner decisions required before remediation

1. **Static codes (SEC-03):** rotate both env values now? Keep a static superadmin backup path at all, or go OTP-only with a printed recovery kit? Approve removal of the literal from `SuperAdmin.tsx` regardless.
2. **Recruiter sharing model (SEC-01):** should share links remain "any recruiter can see every actively-shared report," or gain per-recipient binding with an explicit "anyone with the link" option? This is the Q3 intent call the current implementation rides on.
3. **Invite model (SEC-02):** approve schema change binding `ChecklistInvite` to an authenticated sender account (and migration/backfill for existing rows where the sender is unknowable).
4. **Demo data in production (SEC-07):** should `ensureSeed`/`seedChecklistDemo` ever run in production? If prod Supabase already contains seeded rows, approve an explicit cleanup batch (no deletion performed by this audit).
5. **Repository hygiene (SEC-10/11):** approve untracking `db/custom.db` + `worklog.md`; separately decide whether to rewrite GitHub history (BFG/filter-repo) or accept the published demo data as synthetic-and-known. Note the platform's auto-commit behavior makes untracking urgent.
6. **Collected references (SEC-06):** rebuild or retire (Q4).
7. **Identity claims (SEC-08):** honest relabeling vs. implementing a true out-of-band callback code vs. domain challenge email.
8. **Public onboarding POST (SEC-14):** keep (with hardening), gate behind accounts, or verify-before-send.
9. **Screening data distribution (SEC-15):** may recruiters/share recipients see referee IP/UA and fraud flags in any form?
10. **Consent & retention (SEC-16/17):** record policy version with each consent? Define retention windows for `AuditEvent`/`NotificationLog` (incl. token-bearing bodies)? Legal review of deletion-path promises vs. implementation.
11. **Legacy cuid-era tokens:** rows created before the `newToken()` fix keep weaker tokens (also any rows inside the published DB). Approve a rotation policy for those rows when convenient (not performed in this audit per authorization).
12. **One-time PDF semantics (SEC-04/05):** does a PDF download consume a one-time link, or is PDF access read-only-until-revoked? Pick one; tests follow.

---

## 15. Items not verified, and how to verify them safely

| # | Item | Why not verified here | Safe verification path |
|---|---|---|---|
| 1 | Whether Vercel's `SUPERADMIN_CODE`/`RECRUITER_CODE` still equal the published strings | Requires reading production env values (out of scope; values must not be printed) | Owner checks Vercel → Settings → Environment Variables (compare by eye, never paste); rotate regardless per SEC-03 |
| 2 | Production database contents (whether Supabase prod is seeded with demo rows; whether any real data exists) | No production access | Owner runs row counts via Supabase SQL editor (`SELECT COUNT(*)` per table) — counts only; then decides cleanup |
| 3 | Runtime behavior of every route (this is a static audit; no HTTP calls were made) | Authorization forbids dynamic testing beyond safe local facilities; DB writes were to be avoided | Run the existing 40-test suite (§11) plus the proposed additions in CI — disposable DB, simulated email; or a staging deployment smoke pass |
| 4 | Whether `zipvault2026` is eliminated from the production **client bundle** by the dev-gate in `SuperAdmin.tsx:735` | Building/inspecting the shipped bundle was out of scope | After next deploy: `curl -s https://<prod>/_next/static/...` search or a browser-devtools source search for the literal; fix by removing the literal from source regardless |
| 5 | HSTS and edge headers on the production deployment | Platform-managed; not visible from code | `curl -sI https://vaultverify.vercel.app` and inspect `strict-transport-security` |
| 6 | Email deliverability/limits with Brevo live (quotas, bounce handling) | No emails sent (authorization) | Brevo dashboard: review quota + logs; keep the example.com guard covered by a unit test |
| 7 | `NotificationLog`/`AuditEvent` growth rate in production | Requires production data | Owner: `SELECT COUNT(*)` weekly; then set retention per §14.10 |
| 8 | Whether any real candidate data ever entered the tracked SQLite file's history | Values were not read (authorization); provenance evidence is seed-based | Owner decision item §14.5: if any doubt, treat history as sensitive and scrub |
| 9 | Vercel platform auto-commit behavior (what triggers it; whether it can be disabled) | External to the repo | Check Vercel/git integration settings; until then, untracking the DB (SEC-10) removes the main hazard |
| 10 | The exact expiry semantics a *reference report* should have (currently: no expiry — only links expire) | Product decision, not a code fact | Owner decision; then extend `sharePolicy` + tests |

---

## Appendix A — Verification log (what this audit actually did)

- Recorded baseline: branch `main`, HEAD `a4fcf33`, clean tree, origin `0292ec7`, local ahead by 2. No git state was altered at any point.
- Read all 20 API route files, all security-relevant libraries (`auth.ts`, `checklistAuth.ts`, `tokens.ts`, `guard.ts`, `sharePolicy.ts`, `audit.ts`, `notifications.ts`, `emailTemplates.ts` signature surface, `systemConfig.ts`, `seed.ts`, `checklistDemo.ts`), `prisma/schema.prisma`, `next.config.ts`, `src/proxy.ts`, `Caddyfile`, `package.json`, `.env.example`, `.gitignore`, `DEPLOY.md` (targeted), `tests/*` (enumeration only).
- Ran `bunx tsc --noEmit` (write-less): 46 errors, all pre-existing; 8 reference the missing `CollectedReference` model. No other build/test/lint command was executed.
- Git archaeology (read-only): `git log --all` scans for `.env`, `db/custom.db`, `worklog.md`; secret-pattern searches (`xkeysib`, `pooler.supabase`, static-code strings) with **value-shape checks only** (prefix truncation, boolean regex) — no secret value was printed or stored.
- Structural DB inspection via `sqlite3` read-only URI connection: table names, row counts, column names. Zero record values read.
- No test was executed (test setup invokes `prisma db push` — excluded by the audit authorization). No email was sent. No production system, third-party service, or deployment was contacted. No fix was implemented.

## Appendix B — Prior-art cross-reference

Findings formerly tracked as C1–C6, H1, M1/M2/M6/M7/M8, L10 were **re-verified as fixed** in the current tree (see §5.1, §6.1, §10.1). Former H2 = SEC-06 (still open, deferred), H3 = SEC-02 (list/lookup portion; the PDF ownership gap is newly characterized), H4 = SEC-07 (still open, deferred), M3 (lockout) = SEC-09 (still open), A1 (`ignoreBuildErrors`) = §9.4, A2 (untrack DB) = SEC-10. This report supersedes overlap and adds: SEC-01 recipient-binding analysis, SEC-02 PDF-IDOR chain, SEC-04/05 one-time PDF gaps, SEC-08 callback-code derivability, SEC-11–SEC-25.
