# VaultVerify — Production Deployment Guide

Deploy target: **Vercel (app) + Supabase (Postgres) + Brevo (email)**.
Local development keeps SQLite + simulated notifications; production swaps both via environment variables — no code changes required except one Prisma line.

---

## 1 · Database — SQLite → Supabase Postgres

The app ships with `provider = "sqlite"` for local dev. For production:

1. Open **Supabase → your project → Project Settings → Database**.
2. Copy the **Connection string (URI)** — use the **Connection pooling** string (port `6543`) for serverless. It looks like:
   `postgresql://postgres.<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   (You supply the **database password** you set when creating the project.)
3. In `prisma/schema.prisma` change the datasource provider:

   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

4. Push the schema to Supabase:

   ```bash
   bunx prisma db push
   ```

5. (Optional) Seed reference/checklist catalogs in production — run the seed scripts in `scripts/` against the new `DATABASE_URL`.

> ⚠️ Prisma requires the connection string to include the Postgres schema search path? Not needed — Supabase's default `public` schema works as-is. If you hit prepared-statement errors on serverless, append `?pgbouncer=true&connection_limit=1` to the pooled URL.

---

## 2 · Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (mirror of `.env.example`):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase pooled Postgres URI | after the §1 provider switch |
| `BREVO_API_KEY` | `xkeysib-…` | activates real email sending |
| `BREVO_SENDER_EMAIL` | a **verified sender** in your Brevo account | e.g. `noreply@yourdomain.com` |
| `BREVO_SENDER_NAME` | `VaultVerify` | display name |
| `SUPERADMIN_CODE` | your superadmin access code | change from default |
| `RECRUITER_CODE` | your recruiter access code | change from default |

Local only (never needed on Vercel): `DATABASE_URL=file:./db/custom.db`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — add the Supabase trio to Vercel too if/when client features use Supabase directly.

---

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
   - Nurse portal sign-in + References panel
   - Submit a reference with a **real** referee email → Brevo transactional log shows the send
   - PDF export `/api/pdf/<requestId>`

---

## 5 · Repository hygiene

- `.env` is git-ignored — real keys live only locally + in Vercel's encrypted env store.
- `.env.example` documents every variable (safe to commit).
- Sandbox artifacts (`/download`, `/upload`, `/tool-results`, local `db/*.db`, `worklog.md`) are git-ignored and stay out of the deploy.
