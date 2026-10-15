# VAULTVERIFY — PRODUCT AND UX REDESIGN PLAN (OPTION 2)

**Document:** VAULTVERIFY_PRODUCT_UX_PLAN.md
**Date:** 2026-10-16
**Prepared by:** Z.ai coding agent (planning phase — no code, database, configuration, commit, or deployment changes were made)
**Status:** For product-owner review and approval. All proposed copy, structures, and changes in this document are RECOMMENDATIONS unless explicitly marked as verified existing behavior.
**Related:** Option 1 remains pending until the Z.ai technical audit results are reviewed. This plan (Option 2) was prepared without waiting for that audit, per instruction.

---

## 0. How this plan was produced (evidence method and limits)

- **Source inspection:** every claim below was checked against the working tree of the local VaultVerify repository (mirror of `https://github.com/Live-BTS/VaultVerify`, branch `main` at `5fb48af`). Citations use `file:path` plus line numbers or symbol names.
- **Live inspection:** the app runs in the local sandbox (localhost:3000, Next.js 16 dev). On 2026-10-16 the following were verified live in a browser: homepage, /terms, /privacy, candidate portal (demo account emma.chen@example.com: Dashboard, Skill checklists tab badges, validity text), PDF endpoint output, and HTTP status of the reference-collection API. Read-only checks only; no data was created or modified during this planning phase.
- **What was NOT re-verified live in this phase:** full referee submission E2E, recruiter dashboard with live data, SuperAdmin OTP login. Those are assessed from source code plus previously verified test sessions (recorded in the project worklog). They are marked "source-verified" rather than "live-verified".
- **Nothing in this plan should be treated as implemented merely because it appears in navigation or copy.** Where behavior could not be confirmed, it is labeled **UNVERIFIED** or **INFERRED**.

---

## 1. Executive summary

VaultVerify today is effectively **two products sharing one brand and one page**: (A) a legacy "Verified References" workflow (candidate invites referees, referees answer a 10-question form, recruiters monitor a pipeline), and (B) the newer, more mature **Healthcare Skills Checklist** product (candidate self-assessment, 30-day validity, candidate-controlled share links, recruiter-invited checklists, branded PDF). Both work, but they have separate account systems, separate reference mechanisms, and overlapping terminology — which is the root cause of most UX and privacy risk identified below.

The good news: the checklist product already implements most of the authoritative requirements — a 30-day server-enforced validity (constants + PDF + portal, aligned 2026-10-16), candidate-controlled sharing with revoke, one-time links, explicit consent capture, and clear "Self-reported" labeling in the PDF. The share-link resolve endpoint already rejects revoked, used, expired, and checklist-expired links server-side (`src/app/api/checklist/share/route.ts:17-20, 90`).

The critical problems, in priority order:

1. **P0 — An unauthenticated API returns a candidate's full reference pipeline to anyone who knows their email** (`GET /api/candidate?email=…`, `src/app/api/candidate/route.ts:23-49`): referee feedback, fraud flags, reference tokens/links, and callback codes. This is the legacy product's login-by-email model still wired into production code paths (the checklist portal's References tab calls it, `src/components/bts/checklist/ReferencesPanel.tsx:87`).
2. **P0 — Verification language overclaims**: homepage promises ("48 hours", "fraud radar on every submission", "Manager-verified badges when a reference confirms"), meta description claims ("55+ template checklist library" — the implemented library is 5 checklist sets / 55 skills), and a share-view line "Self-reported assessment **verified against** the RN skill template" (`src/components/bts/checklist/ShareView.tsx:265`).
3. **P0 — Legacy recruiter access model**: a single environment access code (`RECRUITER_CODE`, `src/app/api/recruiter/route.ts:11,24-31`) unlocks the entire agency reference pipeline including referee identities, without per-candidate, per-report consent.
4. **P1 — A broken, orphaned "collected references" feature**: `GET/POST /api/checklist/reference` returns HTTP 500 at runtime (verified live) because its Prisma model `CollectedReference` does not exist in `prisma/schema.prisma`; its UI (`CollectedRefsPanel.tsx`, `CollectedRefForm.tsx`) is not mounted anywhere.

The proposed redesign (Sections 7-11) keeps the existing shell and routes — **no rewrite** — and reorganizes the candidate portal into the four concepts from the brief: **Skills Checklist / References / My Reports / Sharing & Consent**, unifies terminology ("Self-assessed", "Completed on", "Valid until"), and splits homepage positioning into two clearly separate capabilities.

Highest-priority recommendation: fix the P0 privacy and language items **before** any visual redesign work, because they involve unauthorized-disclosure and misrepresentation risks, not cosmetics.

---

## 2. Current-state inventory

### 2.1 Architecture and framework (verified)

| Aspect | State | Evidence |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, Prisma ORM | `package.json`, `next.config.ts` |
| Database | SQLite via Prisma (`db/custom.db` in sandbox; `DATABASE_URL` driven) | `prisma/schema.prisma:6-10` |
| Runtime | bun (dev), `next dev -p 3000` | `.zscripts/dev.sh` |
| Type-checking at build | `typescript.ignoreBuildErrors: true` — Vercel builds do not fail on TS errors | `next.config.ts:31-32` |
| App shape | Single-page app at `/` with a client-side View switcher: `home \| wizard \| candidate \| recruiter \| checklist \| share \| refshare` | `src/app/page.tsx:86, 237-266` |
| Deep links | `?r=` reference invite, `?s=` checklist share view, `?rs=` reference share view | `src/app/page.tsx:152-155` |
| Standalone routes | `/SuperAdmin`, `/privacy`, `/terms` (no `/checklist` route — verified live, 404) | `src/app/SuperAdmin/`, `src/app/privacy/`, `src/app/terms/` |
| Data model | 28 Prisma models (two product families + admin/auth + platform) | `prisma/schema.prisma:24-518` |

### 2.2 Route and API inventory (verified from source)

**Pages/Views**
- `/` — landing + role entry: References product (wizard/candidate/recruiter) and Skills Checklist product (checklist), share views, referee flow. (`src/app/page.tsx`)
- `/SuperAdmin` — admin console, OTP-gated. (`src/components/bts/SuperAdmin.tsx`, 2,214 lines)
- `/privacy`, `/terms` — legal pages driven by `src/content/privacy.ts`, `src/content/terms.ts` (updated to 30-day wording 2026-10-16).

**API routes**
| Route | Purpose | Auth model |
|---|---|---|
| `POST /api/checklist/account` | Checklist-account login/register/profile | email + password → session cookie (`src/lib/bts/checklistAuth.ts`) |
| `POST /api/auth` | Unified signup/verify/signin/signout/me/onboard for CANDIDATE and RECRUITER portal accounts; password reset; email verification | password + emailed verification token (`src/app/api/auth/route.ts:13-25`) |
| `GET /api/candidate?email=` | **Legacy** Phase-1 candidate dashboard data (reference requests, responses, flags, tokens, callback codes) | **none — email only** (`src/app/api/candidate/route.ts:23-49`) |
| `POST /api/candidate/actions` | Legacy nudge/swap reference actions | none (email-keyed) |
| `POST /api/reference/[token]` | Referee: open/verify-identity/submit Phase-1 reference | single-use token |
| `POST /api/reference/share` | Candidate shares Phase-1 reference report (presets, revoke, extend) | candidate session or email-keyed actions |
| `GET /api/recruiter?code=` | Legacy recruiter pipeline dashboard (agency-wide) | single shared env code `RECRUITER_CODE` (fail-closed) (`src/app/api/recruiter/route.ts:11,24-31`) |
| `GET /api/pdf/[requestId]` | Legacy reference packet PDF | by request id (recruiter pipeline context) |
| `GET /api/checklists` | Active checklist sets for the wizard (`SkillTemplate` grouped by profession/jobTitle/specialty) | public read |
| `POST /api/checklist/request` | Candidate requests a checklist from the library | checklist session |
| `POST /api/checklist/complete` | Submit self-assessment + attestation + consent; computes `expiresAt = completedAt + 30d` | checklist session (`src/app/api/checklist/complete/route.ts:127`) |
| `GET /api/checklist/pdf` | Branded checklist PDF (candidate, share-token, or recruiter-invite access) | scoped, see `src/app/api/checklist/pdf/route.ts:9-12` |
| `POST /api/checklist/share` | Create / resolve / revoke / extend share links; enforce revoked, used, expired, checklist-expired | candidate session (create/revoke/extend); public resolve (`src/app/api/checklist/share/route.ts:14-97`) |
| `GET /api/checklist/share/answers` | Read-only answers payload for a valid share link (does not consume one-time links) | token (`src/app/api/checklist/share/answers/route.ts:4-6`) |
| `POST /api/checklist/invite` | Recruiter sends a checklist invite to a candidate (credits, guard, audit) | recruiter session + code |
| `GET/POST /api/checklist/reference` | Candidate-collected references (add referee, submit answers) | **BROKEN — HTTP 500 at runtime; model missing** (verified live 2026-10-16) |
| `POST /api/superadmin` | Admin console actions (OTP login, approvals, users, credits, audit query, shares, templates, system) | OTP + superadmin session |
| `GET /api/bootstrap` | Idempotent seed (agency, demo data, templates) | internal |

### 2.3 The two reference mechanisms (structural finding, verified)

1. **Legacy Phase-1 references** (mounted): `ReferencesPanel` inside the candidate checklist portal fetches `GET /api/candidate?email=` and renders reference requests with statuses, "Skills verified" badge (`src/components/bts/checklist/ReferencesPanel.tsx:248`), PDF links (`/api/pdf/[requestId]`), and share actions via `/api/reference/share` (`ReferencesPanel.tsx:87, 258, 360`). The full referee form is `ReferenceFlow.tsx` (592 lines): welcome → identity verification (work-email domain / callback code / skip) → employment confirm → 10 questions (one per screen, conditional Q8) → skills confirm step → remarks → attestation + typed signature → done.
2. **Checklist-collected references** (broken): `CollectedRefsPanel.tsx` (401 lines) + `CollectedRefForm.tsx` (351 lines) + `/api/checklist/reference`. The API 500s because `CollectedReference` is not in the schema (zero grep matches in `prisma/schema.prisma`). The UI is **not mounted anywhere** (zero imports outside their own files — verified by grep). Status: **incomplete feature, not user-visible, but a live 500 endpoint exists.**

### 2.4 Feature status matrix

| Feature | Status | Evidence |
|---|---|---|
| Checklist request → superadmin approval → fill → complete | Working (live-verified E2E in prior sessions; portal verified today) | `ChecklistPortal.tsx`, `api/checklist/request`, `api/checklist/complete` |
| 30-day validity, server-enforced | Working (fixed + clamped 2026-10-16; verified live: portal badge, PDF header/footer) | `constants.ts:58-59`, `complete/route.ts:127`, `pdf/route.ts:93,105` |
| Consent checkbox at submission (Privacy Policy + Terms hyperlinks) | Working (live-verified; server-enforced; persisted in attestation JSON) | `ChecklistFill.tsx`, `complete/route.ts`, `pdf/route.ts` |
| Share links: one-time / 1d / 7d / 14d / custom, revoke, extend | Working; server rejects revoked (404), used (403), expired (403), checklist-expired (403) | `api/checklist/share/route.ts:17-20,74-86,90` |
| Share view failure states (invalid/used/expired/checklist_expired) with human copy | Working (source-verified; states rendered with distinct titles) | `ShareView.tsx:38,83-94,196-198` |
| Checklist PDF (branded, self-reported labeling, validity, consent statement) | Working (live-verified output text) | `src/lib/pdf/skills-checklist-pdf.ts`, `pdf/route.ts:83-108` |
| Recruiter checklist invites + credits spend + auto-fetch candidate details | Working (source-verified) | `api/checklist/invite/route.ts:12-18`, `credits.ts` |
| Recruiter PDF download for an invite they sent | Present (`?invite=<id>&code=`) | `pdf/route.ts:12` — **UNVERIFIED live** |
| Legacy references E2E (wizard → referee → recruiter pipeline → PDF) | Working in prior verified sessions; referee identity step, fraud rules (4), flags | `ReferenceFlow.tsx`, `fraud.ts:52-92`, prior worklog |
| Legacy recruiter access | Working but **single shared code**; shows referee names/titles | `api/recruiter/route.ts:11,24-31`, `RecruiterDashboard.tsx:289-420` |
| Reference report sharing (candidate-controlled) | Present (presets like checklist share) | `api/reference/share/route.ts:169-212`, `ReferenceShareView.tsx` |
| Collected references (checklist-portal native) | **Broken/orphaned** (API 500, model missing, UI unmounted) | `api/checklist/reference/route.ts`, schema grep = 0 |
| `SkillVerification` model | **Dead schema** — zero API reads/writes | grep across `src/app/api` = 0 |
| Email notifications | Template engine with 10 templates; sandbox SIMULATED provider by default, Brevo when configured, SMS sandbox | `emailTemplates.ts:92-232`, `notifications.ts:32-64` |
| Reminder schedule (references) | Day 2/5/9 sweep in recruiter actions | `constants.ts:52-54`, `api/recruiter` |
| Admin console | OTP + backup codes; sections: requests, users, companies, candidates, credits, audit, shares, skills, system, team, templates; read-only account inspection stamped to audit log; maintenance mode + fail-closed write guard | `SuperAdmin.tsx:111,2085`, `platform.ts`, `guard.ts` |
| Session revocation / incident response | Candidate/recruiter session kill switches exist (`killCandidateSessions`, `killRecruiterSessions`) | `guard.ts`, `api/auth` imports |
| Checklist draft/resume (save partial progress) | **Not implemented** — no draft model or API exists; fill is single-session client state (INFERRED from complete route + schema: no draft table) | schema.prisma, `api/checklist/*` |
| Password reset, email verification (portal accounts) | Implemented in unified auth | `api/auth/route.ts:13-25` |
| Email verification for legacy checklist-account login | `ChecklistAccount.emailVerified` flag exists; login flow does not visibly gate on it — **UNVERIFIED**, needs decision | `schema.prisma:225`, `checklistAuth.ts` |

### 2.5 Implemented catalog vs positioning claims (verified)

- Implemented checklist library: **5 active checklist sets, 55 active skills** (DB query on `SkillTemplate`, 2026-10-16: 5 distinct profession|jobTitle|specialty combos).
- Static catalog universe: 4 professions; 16 disciplines; specialty lists defined for 5 disciplines (RN 11, LPN 3, NP 3, PT 2, RT 2) → ~21 realistic combos today; expansion path exists (`src/lib/bts/catalog.ts`).
- The "190+ disciplines" product fact is the **catalog target**, not the implemented library. Homepage/meta currently claims "55+ template checklist library" (`src/app/layout.tsx:18`), which conflates 55 skills with 55 templates. Section 12 proposes accurate wording.

---

## 3. Candidate journey

Legend: **[EXISTS]** = verified existing behavior · **[PROPOSED]** = recommendation · **[VERIFY]** = needs implementation check before build.

### 3.1 Registration and email verification
- **[EXISTS]** Two paths coexist. (a) Checklist portal: "Nurse portal" sign-in/register on `/` → `POST /api/checklist/account` (email + password; `ChecklistAccount.emailVerified` flag exists in schema but the login flow's gating on it is UNVERIFIED). (b) Unified portal auth: `POST /api/auth` with signup → emailed verification link → verify → session (`api/auth/route.ts:13-25`). The legacy Phase-1 wizard creates a Candidate profile without password (email-keyed).
- **[PROPOSED]** One registration path only (unified `/api/auth`), with email verification mandatory before checklist completion (report carries the candidate's name; unverified identity undermines report trust). Keep the legacy paths behind a feature flag during migration, not user-facing.

### 3.2 First login and dashboard orientation
- **[EXISTS]** After login the candidate lands on a Dashboard tab with stat cards (REFERENCES, CHECKLISTS, SHARE LINKS, OPEN REQUESTS), quick actions, and recent activity (live-verified 2026-10-16). Tabs: Dashboard / References / Skill checklists / Controlled sharing / Settings (`ChecklistPortal.tsx:514-521` and live snapshot).
- **[PROPOSED]** Re-label tabs to the approved four-concept structure (Section 7): **Skills Checklist · References · My Reports · Sharing & Consent** (+ Settings). Add a first-login orientation strip: "Self-assessed checklist (5-10 min) · Independent references · You control sharing."

### 3.3 Starting a checklist (request or invite)
- **[EXISTS]** Two entry paths: (a) request from library → superadmin approval → opens in portal (`ChecklistPortal.tsx:794` copy; `api/checklist/request`); (b) recruiter invite → email with setup link → claim to account or pre-filled signup (`api/checklist/invite/route.ts:12-18`, `preview`/`claim` actions). Dashboard shows "N checklist request(s) waiting".
- **[EXISTS]** Failure states: duplicate request, already-completed request rejected (live-verified in prior session: "that GENERAL request was already completed").

### 3.4 Completing the self-assessment
- **[EXISTS]** Fill flow (`ChecklistFill.tsx`, 589 lines): specialty header with experience, rating scale 1-4 with anchored definitions + N/A, recency per skill (within 3 months / within 6 / 6+ months), review-before-submit step, honesty attestation + signature (draw/type/upload), required "I agree to the Privacy Policy and Terms of Use." checkbox with hyperlinks; Submit disabled until all answered + attestation + consent; server re-validates and stores consent (`complete/route.ts`). Header states "completed once · valid for 30 days" (live-verified copy).
- **[EXISTS — limitation]** No save-and-resume: state is client-side for the single session; there is no draft model (Section 2.4). Estimated 5-10 min duration is acceptable, but accidental tab loss loses work.
- **[PROPOSED]** P2: autosave draft every ~30 s or on step change (backend dependency: draft storage). P2: progress bar ("12 of 37 skills"), per-category grouping with jump links, keyboard-operable rating controls (radio groups with visible focus), and a mobile sticky "Next category" control.

### 3.5 Report, validity, sharing
- **[EXISTS]** Completion → report view + PDF with "Valid until <date> (30 days)", "Self-reported assessment … valid for 30 days", attestation + consent lines; portal badge "Valid for N more day(s) · until <date>" (live-verified).
- **[EXISTS]** Sharing dialog presets: One-time view / 1 day / 1 week / 14 days / Custom; link copy; revoke anytime; extend one-time-blocked (only DURATION links extend). Expired checklist blocks new shares ("This checklist has expired — retake it to share again", `share/route.ts:90`).
- **[EXISTS]** Share-view failure copy: "Link not found … revoked by the candidate", used, expired, checklist-expired states (`ShareView.tsx:196-198`).
- **[PROPOSED]** P1: an "Expired" state card in My Reports with the recovery path: "This report expired on <date>. Retake the checklist to generate a fresh one" + CTA. P2: show remaining validity inside the share dialog ("Recipients will keep access until <linkExpiry>, but the report itself stops working on <expiry>") — the backend already enforces the stricter of the two (`share/route.ts:20`).

### 3.6 Requesting and tracking references (independent workflow)
- **[EXISTS]** References tab (mounted `ReferencesPanel`) surfaces the legacy Phase-1 flow: invite referees (name/email/relationship), track SENT/OPENED/IN_PROGRESS/COMPLETED/FLAGGED/EXPIRED, nudge, swap, view PDF, share reference report via `/api/reference/share` presets. Reminder days 2/5/9 (`constants.ts:52-54`).
- **[EXISTS — data coupling]** This tab depends on a legacy `Candidate` row keyed by email; checklist-only users get a graceful "none" state (`ReferencesPanel.tsx:89-95`), meaning a checklist-first candidate must effectively re-onboard into the legacy product to use references. **[PROPOSED]** P1: unify references into the checklist account model so one account drives both (backend dependency; Section 15).
- **[PROPOSED]** P1: status vocabulary visible to candidates should avoid internal codes; map to plain language: Invited / Waiting (opened, not started) / In progress / Completed / Declined or problem (FLAGGED) / Link expired. Never show "Skills verified" as a checklist-adjacent badge here (see 12.3).

### 3.7 Consent, revocation, settings
- **[EXISTS]** Controlled sharing tab lists active links with access type, created/expiry, view count, revoke; reference shares have their own panel (`SharingPanel.tsx`, `ControlledSharingPanel.tsx`).
- **[PROPOSED]** P1: merge both into one **Sharing & Consent** screen (Section 7.4, 11) with states Active / Expired / Revoked and the revocation-scope explainer: "Revoking stops future access through the link. Anyone who already opened or downloaded the report keeps their copy."
- **[EXISTS]** Settings: profile fields (title, phone, city/state/zip, profession/discipline/specialty, years overall/specialty) — source-verified in portal Settings tab. **[PROPOSED]** P2: add "Download my data" and "Delete my account" entries wired to the retention commitments already published in `/privacy` §7.

---

## 4. Recruiter journey

### 4.1 Registration and access
- **[EXISTS]** Recruiter accounts: signup → email verification → password → onboarding (facility etc.) → dashboard (`api/auth`, `RecruiterOnboarding.tsx`). Separately, legacy pipeline access is a single shared code `RECRUITER_CODE` entered on the landing page (`api/recruiter/route.ts:11,24-31`; worklog demo code). Two models coexist — confusing and weakest-link.
- **[PROPOSED]** P1: retire the shared code for anything containing candidate data; keep per-recruiter accounts only. If a lightweight "team code" is needed for onboarding, it must only unlock membership of an agency, never data access by itself (least privilege).

### 4.2 What a recruiter can see today
- **[EXISTS]** Checklist invites they sent: status per candidate, auto-fetch of candidate details by email, PDF download for their own invites (`api/checklist/invite`, `pdf/route.ts:12`). They do **not** get a directory of all candidates (verified: list action is `{ code }`-scoped to their own invites).
- **[EXISTS — legacy deviation]** With `RECRUITER_CODE`, the legacy dashboard exposes the **whole agency pipeline**: every candidate's reference requests, referee identities (name, title), responses, ratings, fraud flags, and PDFs (`RecruiterDashboard.tsx:289-420`). This predates the candidate-controlled sharing model and should be treated as a P0 product decision (Section 15, Q3), not silently preserved.
- **[EXISTS]** Candidate-controlled sharing: a recruiter with a share token sees the checklist share view (`ShareView.tsx`) — one-time or duration-based; revoked/expired stops working server-side.

### 4.3 Orientation and status language
- **[PROPOSED]** P1: recruiter surfaces must always distinguish the two report types with fixed labels: **"Skills Checklist — self-assessed by the candidate"** and **"Professional Reference — submitted by <referee name>, <role>"**. Status chips: Active (until <date>) / Expired / Revoked / One-time (used/unused). Never render an incomplete reference as a completed checklist or vice versa: report cards must carry a type icon + type label in every list row.
- **[PROPOSED]** P1: when a recruiter opens an authorized report, show an access banner: "You are viewing <candidate>'s <report type> · shared <date> · access <scope> · expires <date or 'one-time'>" so both parties share the same mental model of scope.

### 4.4 Requesting more information
- **[EXISTS]** Reminder/nudge actions in the legacy pipeline (recruiter actions API) notify the candidate or referee; recruiter checklist invites create new work.
- **[PROPOSED]** P2: a consent-based "Request updated report" action that asks the candidate (via notification) to share a fresh report — never auto-granting access.

### 4.5 Handling unavailable reports
- **[EXISTS]** Share view states invalid/used/expired/checklist_expired with recovery copy aimed at recruiters viewing the link (`ShareView.tsx:196-198`).
- **[PROPOSED]** P2: add "Ask <candidate> for a new link" mailto/action on every failure state so the recruiter's next step is obvious without support.

---

## 5. Referee journey

- **[EXISTS — entry]** Referee opens a single-use link (`/?r=<token>` legacy; checklist-collected links `/?rc=` exist in orphaned UI). `GET /api/reference/[token]` returns context or an expiry/state error (`reference/[token]/route.ts:34,75,123`).
- **[EXISTS — context]** The form shows who requested the reference and for whom; candidate-provided fields are pre-shown with "Nothing to re-enter — note any corrections below and they'll be flagged for the recruiter" (`ReferenceFlow.tsx:294`) — a good privacy/accuracy pattern to keep.
- **[EXISTS — identity]** Optional identity verification: work-email domain match, or callback code, or explicit skip (skips are flagged `IDENTITY_UNVERIFIED`, `fraud.ts:92`).
- **[EXISTS — submission]** One question per screen (mobile-first), conditional Q8 with required remarks, optional skills confirm step that writes `skillsVerified` on the reference response (`reference/[token]/route.ts:268`), attestation + typed signature; duplicate submission blocked by status checks; completion confirmation screen with next steps.
- **[EXISTS — boundaries]** Expired links: rejected when past `expiresAt` unless COMPLETED/FLAGGED (`reference/[token]/route.ts:34,123`). Referees cannot access other requests (token-scoped). Referees have **no ability to modify the candidate's skills checklist** — the checklist product has no referee-write path at all (verified: `api/reference/*` never touches `ChecklistCompletion`).
- **[PROPOSED]** P1: add a plain-language "What is this?" panel on the referee welcome screen: who sees the answers (the requesting recruiter/employer via VaultVerify), that the candidate sees the status but the free-text remarks are shared as-is per consent, and how long the link stays open. **[PROPOSED]** P2: a "save and finish later" that re-opens the same token (stateless: keep answers client-side in sessionStorage keyed by token — no backend dependency).
- **[VERIFY]** Whether the referee confirmation screen currently restates submission time and offers a printout; if not, P3 copy addition.
- **[PROPOSED — policy]** The skills-confirm step belongs to the **References** product only. It must never be presented as verifying the Healthcare Skills Checklist; Section 12.3 renames the badge to "Confirmed by referee" inside reference reports and removes "Skills verified" wording from checklist-adjacent surfaces.

---

## 6. Administrator journey (SuperAdmin)

**[EXISTS]** OTP-gated console at `/SuperAdmin` (email OTP + backup codes; `SuperAdmin.tsx:167-169`), sections (`SuperAdmin.tsx:111`):
- **requests** — approve/revoke candidate checklist requests; revoking an approved request invalidates completed reports immediately (copy at `SuperAdmin.tsx:861`, verified behavior in prior sessions).
- **users / companies / candidates** — account management; account inspection is read-only with an audit-stamped banner ("Nothing can be written from here… stamped in the audit log", `SuperAdmin.tsx:2085`) — an excellent least-privilege pattern to keep.
- **credits** — agency credit ledger (`CreditLedger`).
- **audit** — queryable audit trail with actor filter + CSV export; window options 24h/7d/30d/1y (`SuperAdmin.tsx:1321-1327`).
- **shares** — report-sharing oversight (`ChecklistShareLink`/`ReferenceShareLink` listing).
- **skills** — checklist template management. **templates** — content. **team** — admin/team invites.
- **system** — environment/provider health matrix (email/SMS/database provider, configured flags) (`SuperAdmin.tsx:112` interface).
- **[EXISTS]** Fraud oversight lives in the legacy recruiter dashboard flag console rather than SuperAdmin — **[PROPOSED]** P2: surface fraud-flag counts and decisions in SuperAdmin for platform-level abuse monitoring.
- **[PROPOSED]** P2: "email delivery health" = per-template sent/simulated/failed counters from `NotificationLog` (the data already exists; add a small dashboard card in **system**).
- **[PROPOSED]** P1: session revocation UI (kill switches exist in code: `killCandidateSessions`, `killRecruiterSessions` — give admins a guarded button + audit entry).
- **[PROPOSED]** P1 (security hygiene): rotate `SUPERADMIN_CODE`/legacy shared codes and move admin access fully to OTP+session (already the primary mechanism).
- **[PROPOSED]** P3: least-privilege roles for future staff (view-only auditor vs full admin) — currently single superadmin role; flag as optional.

---

## 7. Proposed navigation and dashboard architecture

### 7.1 Shell decision (evidence-based)

**Recommendation: keep the single application shell with role-specific views. Do not rewrite.** Evidence: the app already renders candidate, recruiter, referee, and share experiences from one shell (`src/app/page.tsx` view switcher) plus one admin route; the portal shell (`src/components/bts/shell/PortalShell.tsx`) already provides sidebar + topbar. A rewrite would buy nothing the requirements need and would re-risk working flows. The proposed structure below is a re-labeling/regrouping of existing tabs plus two consolidations — an incremental change.

### 7.2 Candidate dashboard — proposed structure

Matches the four-concept structure in the brief. Mapping to what exists today is shown per card.

```text
┌────────────────────────────────────────────────────────────────────┐
│  VaultVerify                                    [avatar] Settings  │
│  ────────────────────────────────────────────────────────────────  │
│  NAV:  Skills Checklist · References · My Reports · Sharing        │
│                                                                    │
│  ┌ Skills Checklist ─────────────────────────────────────────────┐ │
│  │ Primary: Start or continue your self-assessment (5–10 min)    │ │
│  │ Status card: active checklist · "Valid for N more day(s)" or  │ │
│  │ "Expired on <date> — retake"        [from Skill checklists]   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌ References ───────────────────────────────────────────────────┐ │
│  │ Primary: Request a reference                                  │ │
│  │ Status: N invited · N waiting · N completed · N need action   │ │
│  │                                    [from References tab]      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌ My Reports ───────────────────────────────────────────────────┐ │
│  │ Unified list: checklist reports + reference reports           │ │
│  │ Each row: type badge · completed on · valid until · actions   │ │
│  │            [NEW consolidation — no new backend needed]        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌ Sharing & Consent ────────────────────────────────────────────┐ │
│  │ Active / Expired / Revoked access across BOTH report types    │ │
│  │ Revoke · extend · copy link        [merge of the two panels]  │ ─┘
│  └───────────────────────────────────────────────────────────────┘   │
│  Recent activity (existing) · Help & privacy links (proposed)       │
└────────────────────────────────────────────────────────────────────┘
```

- Page purpose: one-screen answer to "what do I have, what needs me, whom can see it".
- Primary action: context-dependent (start checklist if none; act on requests if waiting; else share latest report).
- Empty states (already partially present): "Nothing yet — request your first checklist" exists (`ChecklistPortal.tsx:504,707`); add equivalents for references and reports.
- Mobile behavior: nav collapses to bottom tab bar; cards stack; primary CTA sticky.

### 7.3 Recruiter dashboard — proposed structure

```text
┌────────────────────────────────────────────────────────────────────┐
│  NAV:  Candidates · Requests · Reports shared with me · Settings   │
│                                                                    │
│  Candidates: only candidates who authorized you or accepted an     │
│  invite (name, invite status, actions)      [exists, code-scoped]  │
│  Requests: checklist invites sent — status per candidate  [exists] │
│  Reports shared with me:                                           │
│    row = [type badge] candidate · completed on · valid until ·     │
│          scope (one-time / until <date>) · Open · Download PDF     │
│    [EXISTS for invites; NEW unified list for shared tokens]        │
│  Empty states: "No reports shared with you yet — candidates keep   │
│  control of their reports. Request one from a candidate."          │
└────────────────────────────────────────────────────────────────────┘
```

- Accessibility: status conveyed by text chip + icon + color (not color alone); table semantics with `<th>` scope.
- Mobile: cards replace tables below 640 px.

### 7.4 Wireframes for the four key screens

**(a) Checklist fill (exists; incremental edits only)**

```text
┌──────────────────────────────────────────────────────┐
│ VaultMark  Skills Checklist — Self-assessed          │
│ Med-Surg · RN · 6 yr in specialty · [valid 30 days]  │
│ Progress ▓▓▓▓▓░░░ 12/37   Category: Procedures       │
│ ──────────────────────────────────────────────────── │
│ Skill row: name · anchor help                        │
│   Rating: ① Needs work ② Developing ③ Reliable ④     │
│           Strong   [N/A]   (radio group, keyboard)   │
│   Last performed: [≤3 mo] [≤6 mo] [6+ mo]            │
│ …                                                    │
│ Sticky footer: Back · Continue  (validation summary  │
│ on Continue if incomplete: "3 skills still need a    │
│ rating or N/A")                                      │
│ Review step: summary + attestation + consent + Sign  │
└──────────────────────────────────────────────────────┘
```
Purpose/statuses/accessibility/mobile as in Section 8.

**(b) Reference request (candidate side)**

```text
┌──────────────────────────────────────────────────────┐
│ References — Request a reference                     │
│ 1. Who: name · email · relationship · (phone opt.)   │
│ 2. What they'll see: "You'll be asked about working  │
│    with <candidate> — takes ~5 min. Sent by          │
│    VaultVerify on <candidate>'s behalf."             │
│ 3. Send invite  →  success card with link status     │
│ Pending list: Invited <date> · reminder day 2/5/9 ·  │
│ Nudge · Swap · Cancel                                │
└──────────────────────────────────────────────────────┘
```

**(c) Report view (candidate / authorized recruiter — same component, scoped)**

```text
┌──────────────────────────────────────────────────────┐
│ [SKILLS CHECKLIST — SELF-ASSESSED]  chip + explainer │
│ Emma Chen · RN · Med-Surg · 6 yr                     │
│ Completed on <date> · Valid until <date> (30 days)   │
│ Summary donuts · categories · ratings + recency      │
│ Attestation + consent + signature block              │
│ "This report is the candidate's own assessment.      │
│  It is not independent verification."                │
│ [Download PDF]                                       │
├──────────────────────────────────────────────────────┤
│ [PROFESSIONAL REFERENCE]  chip                       │
│ Referee <name>, <title> · submitted <date>           │
│ Ratings + remarks (verbatim) · verified-identity tag │
│ "Independent feedback collected by VaultVerify.      │
│  Statements are the referee's own."                  │
└──────────────────────────────────────────────────────┘
```

**(d) Sharing & Consent (candidate)**

```text
┌──────────────────────────────────────────────────────┐
│ Sharing & Consent                                    │
│ Share a report → pick report (type badge) →          │
│ recipient (name/org) → purpose → scope:              │
│   [One-time view] [Until <date>] [Custom]            │
│ "You can revoke anytime. Recipients who already      │
│  opened or downloaded the report keep their copy."   │
│ ── Active access ──────────────────────────────────  │
│ row: report · recipient/label · scope · views ·      │
│      [Revoke] [Extend] [Copy link]                   │
│ ── Expired / Revoked (collapsed) ──────────────────  │
└──────────────────────────────────────────────────────┘
```

### 7.5 Administrator navigation
Keep the existing 11 sections (`SuperAdmin.tsx:111`); proposed additions only: fraud oversight card, email health card, session-revocation button (Section 6).

---

## 8. Checklist experience (UX recommendations)

Existing strengths to preserve (verified): anchored 1-4 scale with plain-language definitions, N/A, recency tracking, review-before-submit, attestation + signature + consent, disabled-Submit gating with footer hints, server-side re-validation, 5-10 min single-sitting design.

| # | Recommendation | Priority | Notes |
|---|---|---|---|
| 8.1 | Discipline/specialty selection copy must say "pick the checklist that matches your role" and show the number of skills before starting | P2 | Sets come from `/api/checklists` |
| 8.2 | Progress indicator ("12 of 37 skills" + per-category stepper) | P2 | Pure UI |
| 8.3 | Draft autosave (on change, debounced) so refresh/back doesn't lose work | P2 | **Backend dependency**: draft storage (Section 15) |
| 8.4 | Keyboard-operable rating groups (`role="radiogroup"`, arrow keys, visible focus), 44 px touch targets | P2 | A11y |
| 8.5 | Review-before-submit: show unanswered count per category with jump links | P2 | Exists partially via footer hint |
| 8.6 | Completion confirmation: show exact validity window ("Valid until <date> — 30 days") + immediate share CTA | P1 copy | Copy only |
| 8.7 | Expired-report recovery card (see 3.5) with retake CTA | P1 | Copy + one card |
| 8.8 | Never add verification language to checklist surfaces; fixed labels "Self-assessed", "Completed on", "Valid until" | P0 copy | See 12 |
| 8.9 | Avoid re-asking known data (name/title/specialty pre-filled from account — already true via prefill) | keep | Verified |

## 9. Professional References experience (UX recommendations)

| # | Recommendation | Priority | Notes |
|---|---|---|---|
| 9.1 | Unify references into the candidate's single account (kill the email-keyed legacy dependency) | P1 | **Backend dependency** (15) |
| 9.2 | Plain-language status pipeline: Invited / Opened — waiting / In progress / Completed / Problem (flagged) / Expired; tooltips explaining each | P1 | Internal codes exist (SENT/OPENED/…) |
| 9.3 | Duplicate-invite guard: warn when adding a referee with the same email to the same candidate while a request is open | P2 | Needs small API check |
| 9.4 | Resend = new link + invalidate old token (state change), with copy "a fresh link replaces the old one" | P2 | Verify existing nudge/swap semantics first |
| 9.5 | Referee form: keep one-question-per-screen, add per-question keyboard accessibility + progress + back navigation (exists) + sessionStorage draft | P2 | No backend change if client-side |
| 9.6 | Submission confirmation: timestamp, what happens next, link to VaultVerify home | P2 | Copy |
| 9.7 | Separate candidate-entered referee details from referee-submitted feedback visually in the report (two blocks, distinct labels) | P1 | Report restructure (Section 10) |
| 9.8 | Remove/repair the broken collected-references feature (decide: remove UI+route, or build the missing model) — it must not ship as a silent 500 | P1 | **Product decision** (15, Q4) |
| 9.9 | Keep reminders at day 2/5/9; show "next reminder on <date>" to the candidate | P3 | Constants exist (`constants.ts:52-54`) |

## 10. Reports and PDFs

**Checklist report** (structure mostly exists — `skills-checklist-pdf.ts`, live-verified output):
Required fields (all present today): candidate identity (name, profession/discipline, specialty, experience), self-assessed ratings + recency, attestation + signature + consent lines, "Completed on", "Valid until <date> (30 days)", footer "Self-reported assessment … valid for 30 days", access clause. **[PROPOSED]** P1 additions: (a) a top-line status stamp "SELF-ASSESSED — NOT INDEPENDENTLY VERIFIED" on page 1 of the PDF; (b) explicit "Expired on <date>" rendering when the PDF is generated for an expired report (currently possible only pre-expiry — **[VERIFY]** whether the PDF route blocks expired reports; the share resolve does, candidate download path may not — needs a check in implementation phase).

**Reference report**: structure exists in the legacy packet PDF (`pdf.ts`). **[PROPOSED]** P1: restructure to two clearly separated blocks (candidate context vs referee feedback), referee name + submitted date, identity-verification tag (work-domain / callback code / not verified), no referee contact details beyond name/title, and the line "Statements are the referee's own; VaultVerify verifies process integrity, not the underlying truth." (aligns with `/terms` §7 wording).

**Consistent terminology table** (apply everywhere — UI, PDFs, emails):

| Use always | Never use | Because |
|---|---|---|
| "Self-assessed" / "Self-reported" | "Verified skills" (checklist context) | Authoritative requirement A |
| "Completed on <date>" | "Verified on" | Report date is completion |
| "Valid until <date> (30 days)" | "Valid 1 year", "12 months" | Locked 30-day rule (fixed 2026-10-16; sweep done) |
| "Confirmed by referee" | "Manager-verified" (on checklist-adjacent surfaces) | Avoid implying checklist verification |
| "Access expires <date>" | "Link valid forever" | Sharing honesty |

Typography/layout/PDF safety: keep current branded PDF design; ensure status stamps are text (not color-only), and PDF links remain token-scoped.

## 11. Consent and sharing UX

Existing (verified): presets one-time/1d/7d/14d/custom; view counting; revoke; extend (DURATION only); server-side enforcement of revoked/used/expired/checklist-expired; read-only answers endpoint that does not consume one-time links.

**[PROPOSED]**
- 11.1 (P1) Share dialog gains explicit recipient + purpose fields (label exists: `label` field already stored — surface it as "Who is this for?"). Show consequences: "This link opens the full report <scope>. You can revoke anytime; copies already downloaded cannot be recalled."
- 11.2 (P1) Sharing & Consent screen states: **Active** (with expiry countdown), **Expired** (link or report), **Revoked** (by you), each with the appropriate next action (copy new link / retake / nothing).
- 11.3 (P0 copy) Every revoke action confirms: "Revoke access? Future visits to the link will fail. Anyone who already viewed or downloaded the report keeps their copy." — requirement C; currently revoke has no consequence explainer.
- 11.4 (P2) Notification and preview hygiene: share-link emails/messages must not embed report contents (verified today: notifications are generic links; keep it that way).
- 11.5 (P2) Minimize sensitive data: portal already avoids showing referee emails in previews; keep referee contact details out of candidate-facing lists where the referee expects privacy (name + relationship only).
- 11.6 (**Backend dependency flag**) "Revoke deletes the report" is impossible with current architecture (recipients keep downloads) — UX must never imply it (requirement C). No backend change needed; copy change only.
- 11.7 (**Backend dependency flag**) Per-recipient scoped views (e.g., "recruiter sees summary only") do NOT exist today; if the product wants scope-limited sharing, that is new backend work — do not imply it in copy.

---

## 12. Homepage and product positioning

### 12.1 Current claims requiring correction (verified evidence)

| # | Current claim | Where | Why it must change |
|---|---|---|---|
| 12.1a | "Reference checks that finish in **48 hours**, not weeks." | `src/components/bts/landing/Hero.tsx:82` (visible on live homepage, verified 2026-10-16) | Time-to-completion depends on referees, not the product. Un-substantiatable promise. |
| 12.1b | "A **fraud radar** on every submission" | `src/components/bts/landing/Features.tsx:378` | Fraud rules exist (`fraud.ts:52-92`) as internal recruiter flags — not a guarantee, and they run on legacy reference submissions only, not checklist submissions. |
| 12.1c | "Self-rated levels become **Manager-verified badges** when a reference confirms them. Recruiters filter on truth." | `src/components/bts/landing/Features.tsx:368` | Blurs the two products; implies checklist verification via references. Contradicts requirement A ("a referee… does not verify or modify the candidate's checklist assessment"). |
| 12.1d | Meta description: "manager-verified skill badges", "fraud flags", "**reference checks in 48 hours**", "**55+ template checklist library**" | `src/app/layout.tsx:18,24` | Same issues; "55+" conflates 55 skills with 55 templates (implemented: 5 sets / 55 skills — Section 2.5). |
| 12.1e | "Self-reported assessment **verified against** the RN skill template" | `src/components/bts/checklist/ShareView.tsx:265` | The word "verified" on a recruiter-facing share view implies independent verification. Change to "mapped to the RN skill template". |
| 12.1f | "Want **manager-verified** references instead?" | `src/components/bts/landing/Closing.tsx:125` | Acceptable ONLY if "manager-verified" stays scoped to the References product; recommend "Manager-verified references" as a References-product label or rephrase to "independent manager references". |
| 12.1g | "valid 1 year" remnants | `src/app/components/HeroSection.tsx:107` | Already corrected to "valid 30 days" (2026-10-16); component currently unmounted (dead code) — delete or keep corrected. |

No invented customer counts, success rates, certifications, or integrations were found on the homepage (checked: Hero, Features, HowItWorks, Closing) — good; keep it that way.

### 12.2 Proposed positioning (ALL COPY BELOW = RECOMMENDATION, pending product-owner approval)

**Headline:** "The skills checklist and the references — finally two honest, separate records."
Alternative (smaller): "Self-assessed skills. Independent references. You control who sees either."

**Subheadline:** "VaultVerify gives healthcare professionals a fast, honest way to document their own skills — and to collect real references from the people who supervised them. Reports are valid for 30 days, and you decide who gets access."

**Section A — Healthcare Skills Checklist (self-assessment):**
"Rate your own skills on a 1–4 scale, note when you last performed them, sign an honesty attestation — done in 5–10 minutes. Your report is clearly labeled **self-assessed**: it shows what you claim, accurately and verifiably *as your own claim*. Valid 30 days."

**Section B — Professional References (independent feedback):**
"Request references from managers and senior colleagues. They answer independently through a secure single-use link — their words, their name, their timestamp. VaultVerify verifies the integrity of the process, not the truth of every statement."

**How they complement each other (without merging):** "A checklist shows what you say about your skills. References show what the people who worked with you say. Together they give employers both halves — each clearly labeled, never mixed."

**CTAs:** Candidate: "Start my skills checklist" · "Request references". Recruiter: "Request a report from a candidate" (consent-based framing).

**Trust & privacy strip:** "Candidate-controlled sharing · Single-use links · Revoke anytime · Reports expire after 30 days · Revocation stops future access — downloaded copies remain with their recipients."

**What we do NOT claim (guardrails):** no "fully verified", no verification of self-assessed skills, no customer counts, no uptime/security certifications, no partner logos.

### 12.3 Terminology decisions required (Section 5 referee overlap)
The legacy referee flow writes a `skillsVerified` flag and the UI shows "Skills verified" (`ReferencesPanel.tsx:248`). Requirement A forbids implying referees verify the checklist. **Recommendation:** keep the flag inside **reference reports only**, renamed "Skills confirmed by referee" (it records the referee's opinion of the candidate's claimed skills — a legitimate part of a reference), and remove any such badge from checklist or unified surfaces. Listed as Q2 for the product owner.

---

## 13. Accessibility, responsiveness, and usability (review + priorities)

Reviewed against source and live pages:
- **Semantic structure:** portal uses headings/landmarks reasonably; landing uses proper heading levels (h1→h2→h3 verified in live snapshots). **[PROPOSED]** P2: audit all dialogs for `aria-labelledby` + focus trap (shadcn primitives provide it; custom modals like `ShareDialog` need checking).
- **Keyboard:** rating controls and signature pad are the risk points — radiogroup semantics + visible focus proposed (8.4); signature canvas needs a typed-name fallback (exists) as the accessible path — keep both.
- **Focus indicators:** Tailwind defaults present; **[PROPOSED]** P2: strengthen on brand-green buttons (contrast of `verify-green` on white at small text sizes should be checked against WCAG AA; the palette uses light greens for accents — flag for contrast pass).
- **Form labels/errors:** labels present (`Label` components); error messages exist but some are generic ("Account request failed") — **[PROPOSED]** P2: specific, actionable errors.
- **Screen-reader announcements:** none found for async saves/status changes — **[PROPOSED]** P2: `aria-live="polite"` for toasts/validation summaries.
- **Touch targets:** rating pills and small icon buttons (~28 px) below 44 px on mobile — **[PROPOSED]** P2.
- **Mobile/tablet:** fill flow and referee flow are single-column (good); recruiter tables need card layout < 640 px — **[PROPOSED]** P2.
- **States:** empty states exist in several panels (2.4/7.2); loading states are skeletons in portal, ad-hoc elsewhere — **[PROPOSED]** P2: consistent skeleton + `aria-busy`.
- **Plain language:** replace internal statuses (Section 9.2); avoid "FLAGGED" exposure to candidates — show "Needs your attention".

Prioritization rule applied: changes that improve completion rates and prevent privacy mistakes first.

---

## 14. Prioritized improvements (P0 → P3)

**P0 — misleading/privacy-critical (fix before any redesign implementation)**
1. Close `GET /api/candidate?email=` unauthenticated data exposure (`api/candidate/route.ts:23-49`) — require a session; migrate `ReferencesPanel.tsx:87` to it.
2. Verification-language sweep: 12.1a–12.1e items + revoke-consent copy (11.3) + PDF "SELF-ASSESSED — NOT INDEPENDENTLY VERIFIED" stamp (10).
3. Product decision + fix on legacy recruiter pipeline access (shared `RECRUITER_CODE` exposing agency-wide data incl. referee identities) — least-privilege replacement.
4. Rotate exposed `SUPERADMIN_CODE`; plan shared-code retirement (Q3).
5. Remove or repair the live-500 `/api/checklist/reference` endpoint (Q4).

**P1 — major workflow**
6. One account for checklist + references (9.1, 3.6). 7. Unified **My Reports** list + expired-report recovery flow (3.5, 7.2). 8. Unified **Sharing & Consent** screen with Active/Expired/Revoked states (11.2). 9. Recruiter "Reports shared with me" unified list + access banner (4.3). 10. Plain-language status pipeline for references (9.2). 11. Admin session-revocation UI (6). 12. Email-verification gating decision for checklist accounts (2.4 last row).

**P2 — usability/navigation/a11y**
13. Progress indicator + keyboard rating groups + touch targets + contrast pass (8.2–8.4, 13). 14. Draft autosave (8.3). 15. Recruiter card layouts on mobile (13). 16. Email delivery health + fraud oversight cards in SuperAdmin (6). 17. Specific error messages; aria-live announcements (13). 18. Settings: data download / deletion entry points (3.7). 19. Referee "save and finish later" (5). 20. Reminder "next reminder on" display (9.9).

**P3 — cosmetic**
21. Terminology micro-copy polish; icon unification; dead-code cleanup (`HeroSection.tsx`, orphaned collected-refs UI if removed); PDF layout polish.

---

## 15. Dependencies on backend work or security decisions

1. **Draft autosave** — needs a `ChecklistDraft` model (or JSON blob on `ChecklistRequest`) + route. No schema change exists today.
2. **Account unification (checklist ↔ references)** — needs a migration plan from email-keyed `Candidate` to `ChecklistAccount` (or vice versa); touches `ReferencesPanel`, `/api/candidate`, `/api/candidate/actions`, `/api/reference/*` auth.
3. **Recruiter least-privilege** — security decision: replace `RECRUITER_CODE` pipeline with per-account, consent-scoped views; referee-identity visibility rules need a policy call.
4. **Per-recipient scoped sharing** — new model work if desired (11.7).
5. **Collected references** — build `CollectedReference` model + finish flow, OR remove UI + route (Q4).
6. **Session-revocation admin UI** — wrap existing kill switches with superadmin action + audit entry.
7. **Email verification gating** — decide whether checklist completion requires a verified email; small logic change.
8. **Superadmin/shared code rotation** — ops action, no code.

## 16. Acceptance criteria (per key recommendation)

- **P0-1:** an unauthenticated request to `/api/candidate` returns 401; `ReferencesPanel` loads via session-authenticated endpoint; audit log records access; candidate sees identical data as before.
- **P0-2:** zero occurrences of the phrases in 12.1a–12.1e in built output (`grep` clean); share view says "mapped to the … template"; PDF carries the self-assessed stamp.
- **P0-3:** no endpoint returns another candidate's data without either (a) that candidate's share token or (b) explicit per-candidate authorization; legacy code path disabled or gated behind a flag with PO sign-off.
- **P1 My Reports:** candidate sees both report types in one list with type badges; expired report shows recovery CTA; clicking a report opens the correct view.
- **P1 Sharing & Consent:** single screen lists all links across both products with Active/Expired/Revoked states; revoke shows the cannot-recall-copy warning; states match server truth (spot-check revoked link → 404).
- **P1 unified account:** a new candidate can request a checklist AND invite a referee from one registration; no email-keyed fallback remains in the candidate portal.
- **P2 autosave:** refresh mid-fill restores answers; draft TTL = request validity; completed checklists clear drafts.
- **A11y (P2):** rating groups operable by keyboard alone; all interactive targets ≥ 44 px on mobile; status messages announced politely.

## 17. Questions requiring product-owner decisions

1. **Two products, one account?** Unify legacy References into the checklist account (recommended), or keep separate registrations during transition?
2. **Referee skills-confirmation flag:** keep as "Skills confirmed by referee" inside reference reports only (recommended), or remove the step entirely?
3. **Legacy recruiter pipeline:** who should see reference pipelines — only candidates' explicitly shared reports (recommended, consent-first), or retain agency-wide visibility for the pilot with candidate disclosure?
4. **Collected references:** repair (new model + finish UX) or remove (recommended until the unified reference workflow exists)?
5. **Catalog positioning:** adopt "5 ready checklists · 55 skills · expanding toward 190+ disciplines" wording (recommended) or hold all catalog numbers until the library grows?
6. **Email verification:** require verified email before checklist completion (recommended) or keep open for the pilot?
7. **Validity display for shared links:** when a share link outlives the report (possible today), should the share UI show "report expired" distinctly from "link expired" (server already distinguishes: `checklist_expired` vs `expired`)?

## 18. Completion summary — highest-priority recommendations and likely file changes

**Top five, in order:** (1) close the unauthenticated candidate-data endpoint; (2) verification-language sweep across homepage, meta, and share view; (3) least-privilege recruiter access decision + implementation; (4) unified My Reports + Sharing & Consent experience; (5) resolve the broken collected-references feature.

**Exact files a future approved implementation phase would touch (nothing changed in this phase):**
- `src/app/api/candidate/route.ts`, `src/app/api/candidate/actions/route.ts` (auth + migration)
- `src/components/bts/checklist/ReferencesPanel.tsx`, `SharingPanel.tsx`, `ControlledSharingPanel.tsx`, `ChecklistPortal.tsx` (unified surfaces)
- `src/components/bts/checklist/ShareView.tsx`, `src/lib/pdf/skills-checklist-pdf.ts`, `src/app/api/checklist/pdf/route.ts` (language + stamps)
- `src/components/bts/landing/Hero.tsx`, `Features.tsx`, `Closing.tsx`, `src/app/layout.tsx`, `src/app/components/HeroSection.tsx` (positioning)
- `src/app/api/recruiter/route.ts`, `src/components/bts/RecruiterDashboard.tsx` (access model)
- `src/app/api/checklist/reference/route.ts`, `CollectedRefsPanel.tsx`, `CollectedRefForm.tsx`, `prisma/schema.prisma` (repair-or-remove)
- `src/app/api/auth/route.ts`, `src/lib/bts/checklistAuth.ts` (account unification)
- `src/components/bts/SuperAdmin.tsx`, `src/lib/bts/platform.ts` (admin additions)
- `prisma/schema.prisma` + new draft route (autosave, if approved)

**Stop-condition statement:** per the phase instructions, this document is the deliverable. No application, database, configuration, or deployment changes were made, and nothing was committed or pushed. Implementation awaits product-owner review and approval of the P0 scope (and answers to Section 17).
