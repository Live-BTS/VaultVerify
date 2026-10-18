import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword, verifyPassword, isValidEmail, maskEmail,
  createVerification, sendVerificationEmail, consumeVerification,
  createRecruiterSession, getRecruiterSessionAccount, destroyRecruiterSession,
  dbConfigured,
  createPasswordReset, consumePasswordReset, sha256,
} from "@/lib/bts/auth";
import { loginLockedFor, maybePruneExpiredAuthRows, resendThrottleSecondsRemaining } from "@/lib/bts/hygiene";
import { assertPlatformWritable } from "@/lib/bts/platform";
import { killCandidateSessions, killRecruiterSessions } from "@/lib/bts/guard";
import { createSession, destroySession, getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";

// ── POST /api/auth — signup / verify / signin / signout / me / onboard ──
// Unified portal auth for candidates and recruiters:
//   signup  → create unverified account + email a verification link
//   verify  → consume the emailed token, mark verified, start a session
//   signin  → password check; unverified accounts get a fresh link instead
//   resend  → re-send the verification email
//   me      → session probe (role-aware) for the client boot sequence
//   signout → destroy the session for the caller's role
//   onboard_recruiter → save recruiter profile details, unlock dashboard

type Role = "CANDIDATE" | "RECRUITER";

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Malformed request");
  }
  const action = String(body.action ?? "");
  const role = body.role === "RECRUITER" ? "RECRUITER" : body.role === "CANDIDATE" ? "CANDIDATE" : null;

  // Missing deployment config should read as an owner action item, not a bug.
  if (!dbConfigured()) {
    return bad("Server not configured: DATABASE_URL is missing. Add the environment variables in Vercel → Settings → Environment Variables, then redeploy.", 503);
  }

  // Maintenance mode pauses all account writes (superadmin bypasses).
  const writable = await assertPlatformWritable();
  if (!writable.ok) return bad(writable.error ?? "Platform is in maintenance mode.", 503);

  try {
    // ── signup ────────────────────────────────────────────────────
    if (action === "signup") {
      if (!role) return bad("Choose candidate or recruiter.");
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (name.length < 2) return bad("Enter your full name.");
      if (!isValidEmail(email)) return bad("Enter a valid email address.");
      if (password.length < 8) return bad("Password must be at least 8 characters.");

      const passwordHash = hashPassword(password);
      if (role === "CANDIDATE") {
        const existing = await db.checklistAccount.findUnique({ where: { email } });
        if (existing) {
          if (existing.emailVerified) return bad("An account with this email already exists — sign in instead.", 409);
          // SEC-13: re-signup may refresh an unverified row ONLY with the
          // original password — otherwise anyone who knows the address could
          // hijack the pending account before the real owner verifies. The
          // honest "notification" for the real owner is the re-sent link.
          if (!verifyPassword(password, existing.passwordHash)) {
            return bad("An unverified account with this email already exists — sign in with your original password, or request a new verification email below.", 409);
          }
          // SEC-09: re-issuing the link is a throttled email trigger — gate it
          // BEFORE rotating credentials so a throttled caller cannot keep
          // overwriting the row either.
          const wait = await resendThrottleSecondsRemaining(role, email);
          if (wait > 0) return bad(`Too many verification emails — try again in ${Math.ceil(wait / 60)} minute(s).`, 429, { retryAfterSeconds: wait });
          // unverified duplicate: refresh credentials + resend link
          await db.checklistAccount.update({ where: { id: existing.id }, data: { name, passwordHash } });
        } else {
          await db.checklistAccount.create({ data: { email, name, passwordHash } });
        }
      } else {
        const existing = await db.recruiterAccount.findUnique({ where: { email } });
        if (existing) {
          if (existing.emailVerified) return bad("An account with this email already exists — sign in instead.", 409);
          // SEC-13: same original-password proof before rotating recruiter
          // credentials on an unverified row.
          if (!verifyPassword(password, existing.passwordHash)) {
            return bad("An unverified account with this email already exists — sign in with your original password, or request a new verification email below.", 409);
          }
          // SEC-09: same throttle before credential rotation.
          const wait = await resendThrottleSecondsRemaining(role, email);
          if (wait > 0) return bad(`Too many verification emails — try again in ${Math.ceil(wait / 60)} minute(s).`, 429, { retryAfterSeconds: wait });
          await db.recruiterAccount.update({ where: { id: existing.id }, data: { name, passwordHash } });
        } else {
          await db.recruiterAccount.create({ data: { email, name, passwordHash } });
        }
      }
      const token = await createVerification(role, email);
      await sendVerificationEmail(role, email, token, originOf(req));
      await logAudit({ actorType: role, actorId: email, action: "SIGNUP", entity: role === "CANDIDATE" ? "checklistAccount" : "recruiterAccount", entityId: email });
      return NextResponse.json({ ok: true, checkEmail: true, sentTo: maskEmail(email) });
    }

    // ── verify (emailed link) ─────────────────────────────────────
    if (action === "verify") {
      const token = String(body.token ?? "");
      const hit = await consumeVerification(token);
      if (!hit) return bad("This verification link is invalid or has expired. Request a new one below.");
      const email = hit.email;
      if (hit.role === "CANDIDATE") {
        const account = await db.checklistAccount.update({ where: { email }, data: { emailVerified: true } });
        await createSession(account.id);
        return NextResponse.json({ ok: true, role: "CANDIDATE", onboardingComplete: account.onboardingComplete });
      }
      const account = await db.recruiterAccount.update({ where: { email }, data: { emailVerified: true } });
      await createRecruiterSession(account.id);
      await logAudit({ actorType: "RECRUITER", actorId: email, action: "EMAIL_VERIFIED", entity: "recruiterAccount", entityId: account.id });
      return NextResponse.json({ ok: true, role: "RECRUITER", onboardingComplete: account.onboardingComplete });
    }

    // ── signin ────────────────────────────────────────────────────
    if (action === "signin") {
      if (!role) return bad("Choose candidate or recruiter.");
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const account = role === "CANDIDATE"
        ? await db.checklistAccount.findUnique({ where: { email } })
        : await db.recruiterAccount.findUnique({ where: { email } });
      // Phase D: the failedLogins counter finally has teeth. A locked account
      // is rejected BEFORE the password check — no scrypt work, and the same
      // neutral message the wrong-password path returns.
      if (account && loginLockedFor(account) > 0) {
        await logAudit({ actorType: "SYSTEM", actorId: email, action: "SIGNIN_LOCKED_OUT", entity: role === "CANDIDATE" ? "checklistAccount" : "recruiterAccount", entityId: account.id, ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? "" });
        return bad("Too many failed attempts — try again in a few minutes.", 429);
      }
      if (!account || !verifyPassword(password, account.passwordHash)) {
        // Security center: consecutive failed-login counter per account.
        if (account) {
          await (role === "CANDIDATE"
            ? db.checklistAccount.update({ where: { id: account.id }, data: { failedLogins: { increment: 1 }, lastFailedLogin: new Date() } })
            : db.recruiterAccount.update({ where: { id: account.id }, data: { failedLogins: { increment: 1 }, lastFailedLogin: new Date() } }));
        }
        return bad("Email or password is incorrect.", 401);
      }
      // Correct password — clear the failure counter.
      await (role === "CANDIDATE"
        ? db.checklistAccount.update({ where: { id: account.id }, data: { failedLogins: 0 } })
        : db.recruiterAccount.update({ where: { id: account.id }, data: { failedLogins: 0 } }));
      // Command layer: suspended accounts are dead ends — no session, clear reason.
      if (account.status === "SUSPENDED") {
        await logAudit({ actorType: "SYSTEM", actorId: email, action: "SIGNIN_BLOCKED_SUSPENDED", entity: role === "CANDIDATE" ? "checklistAccount" : "recruiterAccount", entityId: account.id, ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? "" });
        return bad("This account is suspended. Contact VaultVerify support.", 403);
      }
      if (!account.emailVerified) {
        // SEC-09: a correct password for an unverified account re-sends the
        // link — that is an email trigger like any other.
        const wait = await resendThrottleSecondsRemaining(role, email);
        if (wait > 0) return bad(`Too many verification emails — try again in ${Math.ceil(wait / 60)} minute(s).`, 429, { retryAfterSeconds: wait });
        const token = await createVerification(role, email);
        await sendVerificationEmail(role, email, token, originOf(req));
        return NextResponse.json({ ok: false, needsVerification: true, sentTo: maskEmail(email) });
      }
      if (role === "CANDIDATE") {
        await createSession(account.id);
      } else {
        await createRecruiterSession(account.id);
      }
      await logAudit({ actorType: role, actorId: email, action: "SIGNIN", entity: role === "CANDIDATE" ? "checklistAccount" : "recruiterAccount", entityId: account.id });
      // Opportunistic hygiene (throttled internally to once per 10 min).
      await maybePruneExpiredAuthRows();
      return NextResponse.json({ ok: true, role, onboardingComplete: account.onboardingComplete });
    }

    // ── resend verification ───────────────────────────────────────
    if (action === "resend") {
      if (!role) return bad("Choose candidate or recruiter.");
      const email = String(body.email ?? "").trim().toLowerCase();
      const account = role === "CANDIDATE"
        ? await db.checklistAccount.findUnique({ where: { email } })
        : await db.recruiterAccount.findUnique({ where: { email } });
      // Do not reveal whether the address exists.
      if (account && !account.emailVerified) {
        // SEC-09: the explicit resend is the primary abuse vector — unthrottled
        // it lets anyone flood a victim's inbox and burn the Brevo quota.
        const wait = await resendThrottleSecondsRemaining(role, email);
        if (wait > 0) return bad(`Too many verification emails — try again in ${Math.ceil(wait / 60)} minute(s).`, 429, { retryAfterSeconds: wait });
        const token = await createVerification(role, email);
        await sendVerificationEmail(role, email, token, originOf(req));
      }
      return NextResponse.json({ ok: true, sentTo: maskEmail(email) });
    }

    // ── me ────────────────────────────────────────────────────────
    if (action === "me") {
      const candidate = await getAccount();
      if (candidate?.emailVerified) {
        // Suspended sessions die on the next probe — the portal sees a clean logout.
        if (candidate.status === "SUSPENDED") {
          await destroySession();
          return NextResponse.json({ ok: true, account: null, suspended: true });
        }
        return NextResponse.json({
          ok: true, role: "CANDIDATE",
          account: { id: candidate.id, name: candidate.name, email: candidate.email, onboardingComplete: candidate.onboardingComplete },
        });
      }
      const recruiter = await getRecruiterSessionAccount();
      if (recruiter?.emailVerified) {
        if (recruiter.status === "SUSPENDED") {
          await destroyRecruiterSession();
          return NextResponse.json({ ok: true, account: null, suspended: true });
        }
        return NextResponse.json({
          ok: true, role: "RECRUITER",
          account: { id: recruiter.id, name: recruiter.name, email: recruiter.email, onboardingComplete: recruiter.onboardingComplete },
        });
      }
      return NextResponse.json({ ok: true, account: null });
    }

    // ── signout ───────────────────────────────────────────────────
    if (action === "signout") {
      await destroySession();
      await destroyRecruiterSession();
      return NextResponse.json({ ok: true });
    }

    // ── password reset (consumes /?reset=<token> from the console) ──
    if (action === "password_reset") {
      const token = String(body.token ?? "");
      const password = String(body.password ?? "");
      if (password.length < 8) return bad("Password must be at least 8 characters.");
      // Kind is inferred from the token when the portal doesn't send it.
      let kind: "CANDIDATE" | "RECRUITER" | null = body.kind === "RECRUITER" ? "RECRUITER" : body.kind === "CANDIDATE" ? "CANDIDATE" : null;
      if (!kind) {
        const row = await db.passwordResetToken.findUnique({ where: { token: sha256(token) } });
        kind = row?.kind === "RECRUITER" ? "RECRUITER" : row?.kind === "CANDIDATE" ? "CANDIDATE" : null;
      }
      if (!kind) return bad("This reset link is invalid or has expired. Ask support for a new one.");
      const hit = await consumePasswordReset(kind, token);
      if (!hit) return bad("This reset link is invalid or has expired. Ask support for a new one.");
      if (kind === "RECRUITER") {
        await db.recruiterAccount.update({ where: { id: hit.accountId }, data: { passwordHash: hashPassword(password), failedLogins: 0 } });
        await killRecruiterSessions(hit.accountId);
      } else {
        await db.checklistAccount.update({ where: { id: hit.accountId }, data: { passwordHash: hashPassword(password), failedLogins: 0 } });
        await killCandidateSessions(hit.accountId);
      }
      await logAudit({ actorType: "SYSTEM", actorId: kind, action: "PASSWORD_RESET_COMPLETED", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: hit.accountId });
      return NextResponse.json({ ok: true });
    }

    // ── recruiter onboarding save ─────────────────────────────────
    if (action === "onboard_recruiter") {
      const recruiter = await getRecruiterSessionAccount();
      if (!recruiter) return bad("Sign in first.", 401);
      const name = String(body.name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const company = String(body.company ?? "").trim();
      const jobTitle = String(body.jobTitle ?? "").trim();
      const city = String(body.city ?? "").trim();
      const state = String(body.state ?? "").trim();
      const zip = String(body.zip ?? "").trim();
      if (name.length < 2) return bad("Enter your full name.");
      if (phone.replace(/\D/g, "").length < 7) return bad("Enter a valid phone number.");
      if (!company) return bad("Enter your company or agency.");
      if (!city || !state) return bad("Enter your location (city and state).");
      await db.recruiterAccount.update({
        where: { id: recruiter.id },
        data: { name, phone, company, jobTitle, city, state, zip, onboardingComplete: true },
      });
      await logAudit({ actorType: "RECRUITER", actorId: recruiter.email, action: "ONBOARDED", entity: "recruiterAccount", entityId: recruiter.id });
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action");
  } catch (e) {
    console.error("[auth]", e);
    // Safe detail only — Prisma error codes carry no sensitive payload.
    const code = (e as { code?: string } | null)?.code;
    const extra = typeof code === "string" && /^P\d{4}$/.test(code) ? ` (db ${code})` : "";
    return bad(`Something went wrong — try again.${extra}`, 500);
  }
}
