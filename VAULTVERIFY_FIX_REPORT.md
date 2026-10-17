# VaultVerify — Technical Audit Fix Report (Phase D–F)

Companion to `VAULTVERIFY_TECHNICAL_AUDIT.md` (findings C1–C6, H1–H4, M1–M9, L1–L14).
All work was performed on isolated branch `audit/tech-fixes`. **Nothing was pushed, merged, deployed, or run against any production system.**

## 1. Findings addressed

| Finding | Correction | Files |
|---|---|---|
| C1 | `/api/candidate` GET: session required; requested email must equal the session account's email (401 / 403) | `src/app/api/candidate/route.ts` |
| C2 | `/api/candidate/actions` POST: session required; `add_reference` uses the session email (client-supplied email ignored); `nudge`/`swap` require `request.candidate.email === session email`; 12h nudge cooldown (429) | `src/app/api/candidate/actions/route.ts` |
| C3 | `/api/pdf/[requestId]` GET: authorized via **owner session** or **`?share=<ReferenceShareLink token>`** (revoked → 404, consumed → 403, expired → 403); download actor recorded in audit log | `src/app/api/pdf/[requestId]/route.ts` |
| C4 | `/api/reference/share` GET ledger: session required; scoped to the session's own candidate profile (email query parameter removed) | `src/app/api/reference/share/route.ts` |
| C5 | `/api/recruiter` POST: recruiter session required; `resolve_flag`/`unflag_request` return 403 (trust & safety owns flags — already in the superadmin console); `run_reminders` sweeps only explicitly-shared requests | `src/app/api/recruiter/route.ts` |
| C6 | `/api/recruiter` GET: session-only; pipeline scoped to requests with an **active** share link (revoked/expired/consumed cut access); legacy static code path removed (401 with a clear message); invitation `refLink` tokens never exposed (`null`); notification/audit tails no longer returned | `src/app/api/recruiter/route.ts` |
| H1 | `GET /api/checklist/share/answers` now enforces the full share policy incl. `checklist_expired` | `src/app/api/checklist/share/answers/route.ts` |
| H1 (root) | New single-source share policy `evaluateChecklistShare()` used by resolve + answers; exact 30-day boundary defined (`expiresAt <= now` ⇒ expired) | `src/lib/bts/sharePolicy.ts` (new) |
| M1 | Referee-facing `GET /api/reference/[token]` no longer returns fraud `flags`; `signerIp`/`signerUserAgent` blanked | `src/app/api/reference/[token]/route.ts` |
| M2 | Identity-method labels made honest everywhere they render: "Employer email domain (self-attested)", "Not verified — skipped", etc. | `src/lib/bts/pdf.ts`, `src/components/bts/checklist/ReferenceShareView.tsx`, `src/components/bts/RecruiterDashboard.tsx` |
| M5 | Prisma query logging (which prints bound parameters) disabled in production; opt-in via `LOG_PRISMA_QUERIES=1` | `src/lib/db.ts` |
| M6 | Reference submit wrapped in try/catch; Prisma `P2002` race → clean JSON 409 instead of HTML 500 | `src/app/api/reference/[token]/route.ts` |
| M7 | `getAccount()` / `getRecruiterSessionAccount()` now reject suspended accounts (session row deleted, cookie cleared) | `src/lib/bts/checklistAuth.ts`, `src/lib/bts/auth.ts` |
| M8 | Capability tokens (share links, invitations, reference requests, email verifications, password resets) now `randomBytes(24)` base64url via `newToken()`; existing rows remain valid | `src/lib/bts/tokens.ts` (new) + creation sites in `checklist/share`, `reference/share`, `checklist/invite`, `candidate`, `candidate/actions`, `auth.ts` |
| M3 (partial) | 12h candidate nudge cooldown (server-enforced) | `src/app/api/candidate/actions/route.ts` |
| L1 | Stale schema comments corrected (365-day/1-year → 30-day, candidate-controlled sharing) — comments only, no migration | `prisma/schema.prisma` |
| L10 | Copy truth: SkillBadge chip "Verified"→"Confirmed" + honest tooltip; "VaultVerify verifies your experience…" → referee-attributed wording; "reusable for a year" → "stays valid for 30 days"; "References, verified. Skills, proven." taglines replaced in fallback agency, email header, seed default | `src/components/bts/brand.tsx`, `ReferencesPanel.tsx`, `RecruiterChecklists.tsx`, `src/app/page.tsx`, `src/lib/bts/emailTemplates.ts`, `src/lib/bts/seed.ts` |
| Client compatibility | Recruiter PDF button now uses the request's active share token (`?share=…`) with a re-share hint when no active link exists; legacy candidate dashboard explains the removed email-only access and points to account sign-in | `src/components/bts/RecruiterDashboard.tsx`, `src/components/bts/CandidateDashboard.tsx` |

## 2. Deliberately NOT changed (PO decisions required — per audit spec §6)

- **H2 `/api/checklist/reference`** (guaranteed-500 orphan; Q4): options — (a) disable with clean 410, (b) restore a `CollectedReference` model and finish the feature, (c) delete route + two dead UI components. Awaiting explicit approval.
- **H3 recruiter invite `lookup`/`list` scope**: needs a `recruiterId` FK on `ChecklistInvite` + consent design (schema migration → product decision).
- **H4 demo seeding in production** (`bootstrap` → `seedChecklistDemo`, `emma.chen/demo1234`): recommend gating behind a sandbox-only env flag.
- **M3 sign-in lockout**, **M4 NotificationLog token redaction/retention**, **M9 origin allowlist for outbound links**: design trade-offs documented in the audit.
- **L9 `terms.ts:68`** legal wording ("Manager-verified"): mechanic described is accurate; term retired by Q2 — legal-copy change needs PO approval.
- **L11 dead code** (`HeroSection.tsx`, `CollectedRefsPanel.tsx`, `CollectedRefForm.tsx`, `checklistPdf.ts`): deletion pending Q4/A1 decisions.

## 3. Regression tests added (Phase E)

Runner: **vitest** (dev-dependency; none existed before). Config `vitest.config.ts`; disposable SQLite test DB via `tests/setup.ts` (fresh `prisma db push` on an empty file — the dev database is never touched; Brevo key forced empty so **no real email can ever be sent**; session cookies mocked, so handlers run directly).

- `tests/sharePolicy.test.ts` — 14 tests: exact 30-day boundary (valid strictly before `expiresAt`, expired **at** the instant), revoked/used/expired/`checklist_expired` decisions, one-time semantics, token format + uniqueness.
- `tests/authz.test.ts` — 25 tests against real route handlers on the disposable DB: C1 (401/403/200), C2 (401/403/429-cooldown), C3 (401/404-revoked/200-share/200-owner/401-foreign-session), C4 (401 + own-links-only), C5/C6 (401 without session; only active-shared requests returned; `refLink` never exposed; flag actions 401/403; legacy code dead), H1 (200 live / 403 `checklist_expired` / 404 revoked), resolve parity with answers endpoint, M1 (no flags/IP/UA in referee payload), B5 (reference submit leaves every `ChecklistCompletion` row byte-identical).
- `tests/copyClaims.test.ts` — 1 test: automated K9 claim-family gate over `src/` with a documented allowlist (dead code + PO-pending legal copy).

**Result: 40/40 passed.**

## 4. Commands executed and results

| Command | Result |
|---|---|
| `bunx tsc --noEmit` (baseline, before fixes) | 46 errors — all pre-existing (recorded, not attributed to this work) |
| `bunx tsc --noEmit` (after fixes) | **46 errors — zero new**; new/changed files typecheck clean |
| `bunx vitest run` | **40/40 passed** (3 files) |
| `bun run lint` (first recorded run) | 11 problems — **all pre-existing in `scripts/` dev tooling** (`require()` in copy-brief docs); **zero problems in `src/`** |
| `bun run build` (production) | **Passed** — all 20 API routes + pages compiled |
| Live HTTP testing | **Not performed** (audit rules: no side-effectful calls, no deploy). Route behavior is verified by the handler-level test suite instead |

## 5. Remaining risks and deferred fixes

1. **C1-class email-keyed flows remain in `checklist/invite` `lookup`/`list`** (H3) until the recruiter-identity schema work is approved.
2. **Demo credentials seed in production** (H4) until the env flag is added — recommend doing this before any real users.
3. **NotificationLog stores full message bodies incl. capability links** (M4) — retention/redaction design needed.
4. **One-time links don't limit pre-consumption data pulls** via the answers endpoint (L6, design nuance).
5. **No E2E/browser tests** — the suite covers handlers and policies; UI flows remain manually verified only.
6. **46 pre-existing tsc errors + `ignoreBuildErrors: true`** (L5/A3) — the Q4 route alone accounts for 12; cleanup is gated on the Q4 decision.
7. **Suspension via direct DB edits** now fails closed (M7 fixed), but process-level session hygiene still depends on the console.

## 6. Production-configuration steps requiring manual action

- Rotate `SUPERADMIN_CODE` (public in shipped source since earlier commits) and `RECRUITER_CODE`; treat the GitHub-history copy as burned.
- Decide/enable the demo-seed gate (H4) before first production traffic.
- Configure `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` deliberately — SMS is simulated everywhere until an SMS provider is provisioned.
- Confirm Vercel host normalization or set an origin allowlist (M9) before any non-Vercel hosting.

## 7. Honest limitations

- No production data was read; every "impact" statement is code-derived.
- The superadmin console's 2000-line client UI was audited at the route/RBAC level, not screen-by-screen.
- Fraud-heuristic quality was not re-validated against data.
- The 40-test suite runs against a disposable DB via mocked cookies — it does not exercise Next.js request middleware or CDN behavior.
