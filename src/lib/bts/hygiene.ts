import { db } from "@/lib/db";
import { getPlatformFlag } from "@/lib/bts/platform";

// ── Auth hygiene & log retention (Phase D) ────────────────────────
// Three housekeeping jobs that used to be missing entirely:
//   1. LOGIN LOCKOUT — the failedLogins counter existed on both account
//      tables but nothing enforced it. Now a sign-in is rejected while the
//      counter sits at/above the threshold and the last failure is inside
//      the window. A quiet window unlocks; a successful sign-in resets.
//   2. EXPIRED AUTH ROWS — sessions and one-time tokens accumulated forever.
//      Pruned opportunistically (sign-in, console reads), throttled to at
//      most once per 10 minutes per process; every delete is expiry-scoped
//      so nothing live is ever touched.
//   3. LOG RETENTION — AuditEvent and NotificationLog grow unbounded.
//      Pruned on the same opportunistic schedule against a configurable
//      retention window (PlatformConfig LOG_RETENTION_DAYS, default 90).
// All deletes are plain deleteMany — identical SQL on SQLite and Postgres.

const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const authGate = { last: 0 };
const logGate = { last: 0 };

export const DEFAULT_LOG_RETENTION_DAYS = 90;
export const LOG_RETENTION_KEY = "LOG_RETENTION_DAYS";
export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const RESEND_MAX_PER_WINDOW = 3;
export const RESEND_WINDOW_MS = 10 * 60 * 1000;

export interface LoginFailureState {
  failedLogins: number;
  lastFailedLogin: Date | null;
}

// Seconds the sign-in stays locked (0 = not locked). Documented trade-off:
// deliberate failed attempts against a victim's email keep the account locked
// until the window quiets down; the superadmin console's security center can
// reset the counter for a locked-out user.
export function loginLockedFor(state: LoginFailureState | null, now = new Date()): number {
  if (!state) return 0;
  if (state.failedLogins < LOGIN_LOCKOUT_THRESHOLD) return 0;
  if (!state.lastFailedLogin) return 0;
  const elapsed = now.getTime() - state.lastFailedLogin.getTime();
  if (elapsed >= LOGIN_LOCKOUT_WINDOW_MS) return 0;
  return Math.ceil((LOGIN_LOCKOUT_WINDOW_MS - elapsed) / 1000);
}

// ── SEC-09: verification-email resend throttle ────────────────────
// Every verification email (signup re-issue, unverified sign-in, explicit
// resend) creates exactly one EmailVerification row, so counting the rows
// issued for an address+role inside a sliding window IS the send count —
// durable across serverless instances with zero schema change.
//
// Documented trade-off (mirrors loginLockedFor): a 429 here is only reachable
// for an address that exists AND is unverified, and only after that same
// caller already triggered RESEND_MAX_PER_WINDOW emails — the existence
// signal is marginal next to what the caller already knows. Ghost and
// verified addresses always get the neutral ok response.
//
// The next slot frees up when the OLDEST send in the window leaves it.
export async function resendThrottleSecondsRemaining(
  role: "CANDIDATE" | "RECRUITER",
  email: string,
  now = new Date(),
): Promise<number> {
  const windowStart = new Date(now.getTime() - RESEND_WINDOW_MS);
  const sent = await db.emailVerification.count({
    where: { email, role, createdAt: { gte: windowStart } },
  });
  if (sent < RESEND_MAX_PER_WINDOW) return 0;
  const oldest = await db.emailVerification.findFirst({
    where: { email, role, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!oldest) return 0;
  return Math.max(1, Math.ceil((oldest.createdAt.getTime() + RESEND_WINDOW_MS - now.getTime()) / 1000));
}

export async function pruneExpiredAuthRows(): Promise<number> {
  const now = new Date();
  const [a, b, c, d, e] = await Promise.all([
    db.checklistSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.recruiterSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.superAdminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return a.count + b.count + c.count + d.count + e.count;
}

export async function maybePruneExpiredAuthRows(): Promise<void> {
  if (Date.now() - authGate.last < PRUNE_INTERVAL_MS) return;
  authGate.last = Date.now();
  try {
    await pruneExpiredAuthRows();
  } catch {
    // hygiene is best-effort — never block the calling flow
  }
}

function clampRetentionDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LOG_RETENTION_DAYS;
  return Math.min(3650, Math.max(7, Math.round(n)));
}

export async function pruneOldLogs(retentionDays: number = DEFAULT_LOG_RETENTION_DAYS): Promise<number> {
  const days = Math.min(3650, Math.max(7, Math.round(retentionDays)));
  const cutoff = new Date(Date.now() - days * 86400_000);
  const [audit, notifications] = await Promise.all([
    db.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.notificationLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return audit.count + notifications.count;
}

export async function maybePruneOldLogs(): Promise<void> {
  if (Date.now() - logGate.last < PRUNE_INTERVAL_MS) return;
  logGate.last = Date.now();
  try {
    const raw = await getPlatformFlag(LOG_RETENTION_KEY);
    await pruneOldLogs(clampRetentionDays(raw));
  } catch {
    // hygiene is best-effort — never block the calling flow
  }
}
