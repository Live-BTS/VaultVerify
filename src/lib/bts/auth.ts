import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/bts/notifications";

// ── Portal auth shared helpers (candidates + recruiters) ──────────
// Flow per product spec: signup → email verification → onboarding
// (name, phone, email, location) → dashboard.
// Password hashing is shared with checklistAuth (scrypt, self-describing).

export const RECRUITER_COOKIE = "vv_rc";
export const SESSION_DAYS = 30;
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

// ── Email verification ────────────────────────────────────────────

export async function createVerification(role: "CANDIDATE" | "RECRUITER", email: string): Promise<string> {
  // Invalidate prior unconsumed tokens for this address, then issue a fresh one.
  await db.emailVerification.updateMany({
    where: { email, role, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const row = await db.emailVerification.create({
    data: {
      role,
      email,
      expiresAt: new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000),
    },
  });
  return row.token;
}

export async function sendVerificationEmail(
  role: "CANDIDATE" | "RECRUITER",
  email: string,
  token: string,
  origin: string,
): Promise<void> {
  const link = `${origin}/?verify=${token}`;
  const portal = role === "CANDIDATE" ? "candidate" : "recruiter";
  await sendNotification({
    channel: "EMAIL",
    kind: "AUTH",
    to: email,
    subject: "Verify your VaultVerify email",
    body: [
      `Welcome to VaultVerify,`,
      ``,
      `Confirm this address to activate your ${portal} account:`,
      link,
      ``,
      `The link expires in 24 hours. If you didn't sign up, ignore this email.`,
    ].join("\n"),
  });
}

export async function consumeVerification(token: string): Promise<{ role: string; email: string } | null> {
  const row = await db.emailVerification.findUnique({ where: { token } });
  if (!row || row.consumedAt || row.expiresAt < new Date()) return null;
  await db.emailVerification.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { role: row.role, email: row.email };
}

// ── Sessions ──────────────────────────────────────────────────────

export async function createRecruiterSession(accountId: string): Promise<string> {
  const id = `rcs_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.recruiterSession.create({ data: { id, accountId, expiresAt } });
  const jar = await cookies();
  jar.set(RECRUITER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  return id;
}

export async function getRecruiterSessionAccount() {
  const jar = await cookies();
  const id = jar.get(RECRUITER_COOKIE)?.value;
  if (!id) return null;
  const session = await db.recruiterSession.findUnique({ where: { id } });
  if (!session || session.expiresAt < new Date()) return null;
  return db.recruiterAccount.findUnique({ where: { id: session.accountId } });
}

export async function destroyRecruiterSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(RECRUITER_COOKIE)?.value;
  if (id) {
    await db.recruiterSession.deleteMany({ where: { id } });
    jar.delete(RECRUITER_COOKIE);
  }
}

// Auth resolution for recruiter-facing actions: a verified, onboarded
// recruiter ACCOUNT (cookie session) OR the legacy agency access code.
export async function recruiterAuthed(codeFromClient: string): Promise<boolean> {
  const RECRUITER_CODE = process.env.RECRUITER_CODE ?? "";
  if (RECRUITER_CODE && codeFromClient.trim() === RECRUITER_CODE.trim()) return true;
  const recruiter = await getRecruiterSessionAccount();
  return !!(recruiter?.emailVerified && recruiter.onboardingComplete);
}
