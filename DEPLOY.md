# VaultVerify — Production Deployment Guide

Deploy target: **Vercel (app) + Supabase (Postgres) + Brevo (email)**.
Local development keeps SQLite + simulated notifications; production swaps both via environment variables — no code changes required except one Prisma line.

> ⚠️ **DATABASE SAFETY (SEC-24 / CH-04).** `bun run db:push` is **guarded**: it refuses to run against any non-local database (anything that is not `file:` or `localhost`) and it no longer passes `--accept-data-loss`. Never bypass the guard to "fix" a deployment — schema changes on the hosted database follow the reviewed migration path in §1 below, run deliberately by an operator against an explicitly exported `DATABASE_URL`, with a backup taken first. `db:reset` is destructive and is for local development only.

---

## 1 · Database — dual schema: SQLite (local) + Postgres (hosted)

Two schema files live side by side and must stay model-identical:

| File | Provider | Used by |
|---|---|---|
| `prisma/schema.prisma` | `sqlite` | local dev, tests (`bunx vitest run`), `bun run db:push` (guarded) |
| `prisma/schema.postgres.prisma` | `postgresql` | Vercel build (`bun run build` runs its `prisma generate`), hosted migrations (`bun run db:push:postgres`) |

When you edit a model, edit BOTH files the same way.

**One-time (or after model changes) — push the schema to the hosted DB:**

1. Export the hosted connection string. Use the **pooler host** (IPv4) — the direct
   `db.<ref>.supabase.co` host is IPv6-only and unreachable from most environments.
   Session mode (port `5432`) is fine for migrations:
   ```bash
   export DATABASE_URL='postgresql://postgres.<PROJECT-REF>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
   ```
2. Run the push (additive/nullable migrations only — never pass `--accept-data-loss`):
   ```bash
   bun run db:push:postgres
   ```
3. **Restore the local SQLite client** (the push regenerates the client from the
   Postgres schema): `bunx prisma generate`

**Vercel runtime `DATABASE_URL`** — either works; keep it consistent with what you migrate against:
- Session mode (current): `postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=1`
- Transaction mode: same host, port `6543`, append `?pgbouncer=true&connection_limit=1&sslmode=require`

> ⚠️ Free-plan Supabase has no automated backups. All migrations here are
> additive and nullable (existing rows untouched); for a manual snapshot, export
> tables to CSV from the Table Editor before pushing.

> ⚠️ `bun run db:push` (SQLite default) stays guarded: it refuses any non-local
> DSN and never passes `--accept-data-loss`. The `db:push:postgres` path is a
> deliberate operator action against an explicitly exported `DATABASE_URL`.

---

## 2 · Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (mirror of `.env.example`):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase pooled Postgres URI | after the §1 provider switch |
| `BREVO_API_KEY` | `xkeysib-…` | activates real email sending |
| `BREVO_SENDER_EMAIL` | a **verified sender** in your Brevo account | e.g. `noreply@yourdomain.com` |
| `BREVO_SENDER_NAME` | `VaultVerify` | display name |
| `SUPERADMIN_EMAIL` | **your inbox for admin login codes** | OTP is emailed here — required for the superadmin OTP flow |
| `SUPERADMIN_CODE` | your superadmin BACKUP access code | recovery path when email is down |
| `RECRUITER_CODE` | your legacy agency access code | optional — recruiters now sign up with accounts |
| `REFERENCE_TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 | **D4b — required in production.** Generate locally with `openssl rand -base64 32`; paste the result into Vercel (all environments) and into your local `.env`. NEVER commit it, never log it, never send it to the client. See §7. |
| `REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS` | previous key during a rotation window | **D4b — optional.** Set only while rotating (§7.3), remove afterwards. |

Local only (never needed on Vercel): `DATABASE_URL=file:./db/custom.db`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — add the Supabase trio to Vercel too if/when client features use Supabase directly.

## 3 · Email — Brevo

`src/lib/bts/notifications.ts` auto-selects the provider:

- **`BREVO_API_KEY` set → live Brevo transactional email** (`POST /v3/smtp/email`).
- **Not set → sandbox mode** — everything is logged to the `NotificationLog` table and console; the whole loop stays inspectable without sending anything.

Built-in safety guard: recipients on `example.com` / `example.org` (all demo data) **never send for real**, even with the key configured — so you can keep testing on Vercel without polluting Brevo stats.

**Before real invites go out:**
1. Brevo dashboard → **Senders, Domains & Dedicated IPs** → add & verify your sender email.
2. (Recommended) Verify your domain (SPF/DKIM records) so invites land in inboxes, not spam.
3. SMS invites remain **simulated** until an SMS sender is provisioned (Brevo SMS or Twilio) — email is the fallback channel by design, so the flow works end-to-end regardless.

The Brevo SMTP relay key (`xsmtpsib-…`, host `smtp-relay.brevo.com:587`) is stored as `BREVO_SMTP_KEY` as a fallback transport option — the app currently uses the REST API, which is the better fit for serverless.

---

## 4 · Deploy to Vercel

```bash
# one-time
npm i -g vercel && vercel login
vercel link                     # inside the repo
```

1. Push `main` to GitHub (this repo).
2. Vercel → **Add New Project → Import** `Live-BTS/VaultVerify`.
3. Framework preset: **Next.js**. Build stays default (`next build`).
4. Add the environment variables from §2.
5. Deploy. First deploy after the §1 switch: run `bunx prisma db push` locally against the production `DATABASE_URL` (or from a one-off Vercel job) so tables exist.
6. Post-deploy smoke test:
   - `/` — landing renders
   - Recruiter: **Sign up** → confirmation email → verify → profile form → dashboard
   - Candidate: **Create account** → confirmation email → verify → onboarding → portal
   - Superadmin: **Email me a login code** → OTP arrives at `SUPERADMIN_EMAIL` → console unlocks
   - Submit a reference with a **real** referee email → Brevo transactional log shows the send
   - PDF export `/api/pdf/<requestId>`

---

## 5 · Security — nothing visible on the frontend

Layered hardening baked into the build:

| Layer | What it does |
|---|---|
| Secrets server-side only | All keys/env vars stay in server env; API routes never forward them; no `NEXT_PUBLIC` secret is consumed by client code |
| `productionBrowserSourceMaps: false` | No readable source maps ship to browsers |
| `compiler.removeConsole` | Client console logs stripped in production (`console.error` kept) |
| Content-Security-Policy | `default-src 'self'` + `connect-src 'self'` — browsers can only load/talk to this origin; `object-src 'none'`, `frame-ancestors 'none'` |
| `poweredByHeader: false` | No `X-Powered-By: Next.js` fingerprint |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict `Referrer-Policy`, restrictive `Permissions-Policy`, COOP |
| Devtools left open | F12 / view-source are intentionally NOT blocked — owners can debug; nothing sensitive is client-side to find (keys, DB, third-party calls are all server-side) |
| Fail-closed access | Superadmin: emailed OTP (hashed at rest, 5-min expiry, 5-attempt lock) + backup static code; recruiter/candidate: scrypt-hashed passwords, email verification gate; unset config locks everything |
| Demo-data guard | Demo credential quick-fills render in `development` only — production bundles dead-code-eliminate them |
| Brevo demo-domain guard | `example.com` / `example.org` recipients never receive real email, even with live keys |

Honest scope: browsers must receive JS to run it, so client-side deterrents raise the bar but aren't absolute — the real guarantees are server-side (DB access, keys, business logic all live on the server; APIs return only business data).

**Superadmin → System & APIs** shows the live deployment map: every integration, its env var name, provider, and configured status (flags only — values never leave the server).

---

## 6 · Repository hygiene

- `.env` is git-ignored — real keys live only locally + in Vercel's encrypted env store.
- `.env.example` documents every variable (safe to commit).
- Sandbox artifacts (`/download`, `/upload`, `/tool-results`, local `db/*.db`, `worklog.md`) are git-ignored and stay out of the deploy.

---

## 7 · D4b — ReferenceRequest token encryption (runbook)

Referee-form bearer tokens (`/?r=<token>`) are stored **twice, safely**: the
`token` column holds their SHA-256 **digest** (lookup key — inbound links are
hashed and matched, so validation never needs the key), and the nullable
`tokenEncrypted` column holds an authenticated **AES-256-GCM envelope** of the
raw token so reminders and the candidate dashboard can keep re-sending the
EXISTING link. Key handling lives only in `src/lib/bts/refTokenCrypto.ts`
(server-only; no client bundle ever sees it).

**7.1 One-time setup (BEFORE deploying D4b code):**

1. Generate the key on your own machine: `openssl rand -base64 32`
2. Vercel → Settings → Environment Variables → add `REFERENCE_TOKEN_ENCRYPTION_KEY`
   (Production + Preview + Development). The value never needs to be shared
   with anyone — including this assistant.
3. Add the same value to your local `.env` for dev parity.
4. Add the column to the hosted DB (additive + nullable — zero impact on
   existing rows):
   ```bash
   export DATABASE_URL='postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
   bun run db:push:postgres && bunx prisma generate   # restore local SQLite client
   ```
5. Deploy the D4b code (normal push to main once approved).
6. Migrate existing plaintext rows (idempotent, resumable, never prints token
   values, refuses non-local DSNs unless `--i-understand-production` is passed):
   ```bash
   export DATABASE_URL='<same pooler DSN>'
   export REFERENCE_TOKEN_ENCRYPTION_KEY='<the key>'
   bun scripts/d4b-backfill.ts --i-understand-production
   ```
7. Verify with ONE existing referee link (from your own records): it must open
   the form exactly as before. Dashboard links, nudge and reminder emails must
   all show the same URL as pre-migration.

**7.2 Key loss (recovery):** if the key is lost, link VALIDATION still works
(digest lookups) — referees with the link in hand are unaffected. Re-display
and reminders degrade (sweep skips those requests, dashboards show empty link
fields). Recovery: set a NEW key, then revoke + re-issue the affected requests
(candidate portal → swap/add reference) — new requests encrypt under the new
key immediately.

**7.3 Key rotation (zero downtime):**
1. Generate a new key; set it as `REFERENCE_TOKEN_ENCRYPTION_KEY`; move the old
   value into `REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS` (Vercel + `.env`).
2. Redeploy; then re-encrypt every v1 envelope in place:
   `bun scripts/d4b-backfill.ts --i-understand-production --reencrypt`
3. Confirm all envelopes are current (`v2`), then REMOVE the `_PREVIOUS`
   variable. Only one rotation generation may coexist at a time.

**7.4 Behavior notes:** legacy rows keep working via digest-first/raw-fallback
lookup and are lazily upgraded (raw → digest + envelope) on first resolve —
the same cutover semantics as D4. If the key is unavailable at resolve time
the upgrade is skipped and the row stays fully functional in legacy form. The
reminder sweep and nudge NEVER send a link that could not be rebuilt — they
skip and report `skippedCount` instead.

---

## 8 · Git push credentials in disposable sandboxes (credential-storage workflow)

The dev sandbox is disposable: every recycle wipes `~/.git-credentials` **and**
`git config credential.helper`, which has stranded approved pushes more than
once (the gate itself is intentional — every push needs your explicit approval
AND a valid credential). The fix is a workflow, not a new token each time.

**8.1 Durable home (owner, one time):** create ONE fine-grained PAT —
github.com → Settings → Developer settings → Fine-grained tokens:
Repository access = Only select repositories → `Live-BTS/VaultVerify`;
Permissions = Contents: Read and write (Metadata read-only is automatic).
Expiry up to 1 year. Store it in your password manager — that is its only
durable home. Treat any token that ever sat in a recycled sandbox as
disposable: rotating is cheap because the token is re-provisioned, never
recreated.

**8.2 Per-sandbox provisioning (whenever a recycle wiped access):**

```bash
bash scripts/setup-git-auth.sh
```

It prompts for the token with hidden input, replaces any stale `github.com`
entry in `~/.git-credentials`, writes the file with `chmod 600`, restores
`credential.helper=store`, and verifies with a READ-ONLY `git ls-remote`
(it never pushes). The token is never echoed, never logged, never committed.

**8.3 Rules that never change:** the token lives in your password manager and
in `~/.git-credentials` only — never in source code, logs, chat messages, or
committed files. If it was ever pasted into chat, rotate it immediately.
Provisioning restores the ABILITY to push; every push still waits for your
explicit per-delivery approval.

---

