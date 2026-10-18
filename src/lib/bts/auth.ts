import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { newToken } from "@/lib/bts/tokens";

// ── Portal auth shared helpers (candidates + recruiters) ──────────
// Flow per product spec: signup → email verification → onboarding
// (name, phone, email, location) → dashboard.
// Password hashing is shared with checklistAuth (scrypt, self-describing).

export const RECRUITER_COOKIE = "vv_rc";
export const SESSION_DAYS = 30;

// Fail-fast config probes: a missing env var should produce a clear 503 that
// names the variable, not an opaque 500 from a deep Prisma/email failure.
export const dbConfigured = () => !!process.env.DATABASE_URL;
export const emailLive = () => !!process.env.BREVO_API_KEY;
export const VERIFY_TTL_MINUTES = 60 * 24; // verification links live 24h

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// SEC-19: constant-time comparison for any plaintext secret a caller supplies
// (superadmin backup code). Passwords are scrypt-verified (inherently safe);
// this closes the remaining raw `===` secret compare. Length difference is
// still observable — unavoidable without leaking-safe equalization, and the
// code is fixed-format so it reveals nothing usable.
export function safeEqual(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "your inbox";
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

// ── Token hashing at rest (Phase D) ───────────────────────────────
// Every capability token (sessions, verification, resets) is stored as a
// SHA-256 digest, never in plaintext. A database leak therefore yields no
// usable bearer tokens. No salt is needed: all tokens are 192-bit random
// values (newToken()), so there is nothing to brute-force offline and the
// digest remains usable as a unique lookup key. The RAW value lives only in
// the cookie or the emailed link — never in a row, a log, or an API payload.

// ── Email verification ────────────────────────────────────────────

export async function createVerification(role: "CANDIDATE" | "RECRUITER", email: string): Promise<string> {
  // Invalidate prior unconsumed tokens for this address, then issue a fresh one.
  await db.emailVerification.updateMany({
    where: { email, role, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const raw = newToken();
  const row = await db.emailVerification.create({
    data: {
      token: sha256(raw),
      role,
      email,
      expiresAt: new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000),
    },
  });
  void row;
  return raw;
}

export async function sendVerificationEmail(
  role: "CANDIDATE" | "RECRUITER",
  email: string,
  token: string,
  origin: string,
): Promise<void> {
  const link = `${origin}/?verify=${token}`;
  const portal = role === "CANDIDATE" ? "candidate" : "recruiter";
  await sendTemplatedEmail("email_verification", email, {
    portal,
    link,
    expiryHours: Math.round(VERIFY_TTL_MINUTES / 60),
  });
}

export async function consumeVerification(token: string): Promise<{ role: string; email: string } | null> {
  const row = await db.emailVerification.findUnique({ where: { token: sha256(token) } });
  if (!row || row.consumedAt || row.expiresAt < new Date()) return null;
  await db.emailVerification.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { role: row.role, email: row.email };
}

// ── Password resets (security center, superadmin-triggered) ──────

export const RESET_TTL_MINUTES = 60;

export async function createPasswordReset(kind: "CANDIDATE" | "RECRUITER", accountId: string): Promise<string> {
  // Invalidate prior unconsumed resets, then issue a fresh one-hour token.
  await db.passwordResetToken.updateMany({ where: { accountId, kind, consumedAt: null }, data: { consumedAt: new Date() } });
  const raw = newToken();
  const row = await db.passwordResetToken.create({
    data: { token: sha256(raw), kind, accountId, expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000) },
  });
  void row;
  return raw;
}

export async function consumePasswordReset(kind: "CANDIDATE" | "RECRUITER", token: string): Promise<{ accountId: string } | null> {
  const row = await db.passwordResetToken.findUnique({ where: { token: sha256(token) } });
  if (!row || row.kind !== kind || row.consumedAt || row.expiresAt < new Date()) return null;
  await db.passwordResetToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { accountId: row.accountId };
}

// ── Sessions ──────────────────────────────────────────────────────

export async function createRecruiterSession(accountId: string): Promise<string> {
  const raw = `rcs_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.recruiterSession.create({ data: { id: sha256(raw), accountId, expiresAt } });
  const jar = await cookies();
  jar.set(RECRUITER_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  return raw;
}

export async function getRecruiterSessionAccount() {
  const jar = await cookies();
  const id = jar.get(RECRUITER_COOKIE)?.value;
  if (!id) return null;
  const session = await db.recruiterSession.findUnique({ where: { id: sha256(id) } });
  if (!session || session.expiresAt < new Date()) return null;
  const account = await db.recruiterAccount.findUnique({ where: { id: session.accountId } });
  // Defense-in-depth: suspended recruiters are dead even if a session row survived.
  if (!account || account.status === "SUSPENDED") {
    await db.recruiterSession.deleteMany({ where: { id: sha256(id) } }).catch(() => undefined); // rows are keyed by the hashed cookie, not the raw value
    try { jar.delete(RECRUITER_COOKIE); } catch { /* read-only context */ }
    return null;
  }
  return account;
}

export async function destroyRecruiterSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(RECRUITER_COOKIE)?.value;
  if (id) {
    await db.recruiterSession.deleteMany({ where: { id: sha256(id) } });
    jar.delete(RECRUITER_COOKIE);
  }
}

// CH-07: the legacy agency access code path (`recruiterAuthed`) is retired.
// Recruiter-facing routes now authenticate exclusively via
// `getRecruiterSessionAccount()` and require emailVerified + onboardingComplete.
// OD-01 amended (owner, 2026-10-18): the recruiter backup code is retired
// ENTIRELY — RECRUITER_CODE is read by no code path anywhere; the owner
// deletes the env var from Vercel. (The superadmin console's backup code is
// the one exception to full static-code retirement: it lives only in the
// SUPERADMIN_CODE env var — see src/app/api/superadmin/route.ts.)
