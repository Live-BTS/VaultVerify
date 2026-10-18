import { db } from "@/lib/db";
import { getPlatformFlag } from "@/lib/bts/platform";
import { scrubLogText } from "@/lib/bts/logRedaction";

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
//   3. LOG RETENTION (OD-11, owner-approved) — NotificationLog rows past the
//      retention window (PlatformConfig LOG_RETENTION_DAYS, default 90) keep
//      METADATA ONLY: body is replaced with a tombstone and html is nulled;
//      the row itself survives for delivery audit (channel, kind, to, subject,
//      status, provider, timestamps). OTP emails are NOT exempt — the 6-digit
//      code is disposable minutes after send, so it goes with the body.
//      AuditEvent rows are NEVER deleted here: the owner set a PROPOSED
//      180-day window (AUDIT_RETENTION_DAYS) but auto-deletion stays disabled
//      until applicable compliance and contractual requirements are confirmed;
//      the window is surfaced as an informational count only
//      (countAuditEventsBeyondRetention). This supersedes the Phase D
//      behavior of whole-row deleteMany on both tables. All writes are plain
//      updateMany — identical SQL on SQLite and Postgres.

const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const authGate = { last: 0 };
const logGate = { last: 0 };

export const DEFAULT_LOG_RETENTION_DAYS = 90; // owner-set (OD-11): NotificationLog body/html purge window
export const LOG_RETENTION_KEY = "LOG_RETENTION_DAYS";
export const AUDIT_RETENTION_DAYS = 180; // owner-PROPOSED (OD-11) — NOT enforced; deletion pending compliance verification
export const OTP_BODY_RETENTION_HOURS = 24; // owner-approved OD-11 follow-through: OTP secrets are worthless minutes after send
export const PURGED_BODY_TOMBSTONE = "[purged: retention policy]";
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

// ── SEC-14: unauthenticated onboarding throttle ───────────────────
// The candidate onboarding POST is intentionally open (it is the product's
// funnel) and credit-bounded per agency — but a scripted client could still
// spray referee-invite emails at network speed. The durable per-IP signal
// that ALREADY exists without new storage: each successful onboarding writes
// one PROFILE_CREATED AuditEvent carrying the caller IP (operator telemetry,
// established pattern). Counting those rows per IP inside a sliding window
// IS the attempt count — durable across serverless instances, zero schema
// change, and it counts only COMPLETED onboardings, so probing costs nothing
// but spraying does not scale.
export const ONBOARDING_MAX_PER_WINDOW = 3;
export const ONBOARDING_WINDOW_MS = 10 * 60 * 1000;

export async function onboardingThrottleSecondsRemaining(ip: string, now = new Date()): Promise<number> {
  if (!ip || ip === "sandbox") return 0; // tests/dev harness callers are never throttled
  const windowStart = new Date(now.getTime() - ONBOARDING_WINDOW_MS);
  const attempts = await db.auditEvent.count({
    where: { action: "PROFILE_CREATED", ip, createdAt: { gte: windowStart } },
  });
  if (attempts < ONBOARDING_MAX_PER_WINDOW) return 0;
  const oldest = await db.auditEvent.findFirst({
    where: { action: "PROFILE_CREATED", ip, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!oldest) return 0;
  return Math.max(1, Math.ceil((oldest.createdAt.getTime() + ONBOARDING_WINDOW_MS - now.getTime()) / 1000));
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

function clampRetentionDays(raw: string | number | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LOG_RETENTION_DAYS;
  return Math.min(3650, Math.max(7, Math.round(n)));
}

// Effective NotificationLog purge window: the platform flag if set, else the
// owner-set default — always clamped to the 7..3650 range so a stray flag
// value can neither purge everything nor disable the purge.
export async function configuredNotificationRetentionDays(): Promise<number> {
  return clampRetentionDays(await getPlatformFlag(LOG_RETENTION_KEY));
}

// OD-11: NotificationLog rows past the window keep metadata only — body is
// tombstoned and html nulled. TWO TIERS:
//   · OTP rows are purged after just 24 HOURS (owner decision: never retain
//     OTP secrets unnecessarily — the 6-digit code is disposable minutes
//     after send). This tier is a constant, not flag-driven, and is
//     intentionally NOT subject to the 7-day clamp floor.
//   · Every other kind uses the configured window (clamped 7..3650).
// The OR guard makes both tiers idempotent: a row already fully purged
// (tombstone body AND null html) never matches again.
export async function purgeExpiredNotificationBodies(retentionDays: number = DEFAULT_LOG_RETENTION_DAYS): Promise<number> {
  const now = Date.now();
  const purgeFilter = (cutoff: Date) => ({
    createdAt: { lt: cutoff },
    OR: [{ body: { not: PURGED_BODY_TOMBSTONE } }, { html: { not: null } }],
  });
  const [otp, general] = await Promise.all([
    db.notificationLog.updateMany({
      where: { kind: "OTP", ...purgeFilter(new Date(now - OTP_BODY_RETENTION_HOURS * 3600_000)) },
      data: { body: PURGED_BODY_TOMBSTONE, html: null },
    }),
    db.notificationLog.updateMany({
      where: purgeFilter(new Date(now - clampRetentionDays(retentionDays) * 86400_000)),
      data: { body: PURGED_BODY_TOMBSTONE, html: null },
    }),
  ]);
  return otp.count + general.count;
}

// Self-healing half of the OD-11 follow-through (owner-approved): rows YOUNGER
// than the window written before the SEC-17 write-time redaction (or after a
// rollback of it) still hold raw capability URLs. Every sweep pass re-applies
// the same scrubLogText to candidate rows, so a raw token survives at most one
// sweep interval after its write, regardless of age. Idempotent: text that no
// longer matches the token regex is written back unchanged (no update).
// Candidate selection over-matches on purpose ("?r=", "?verify=", "invite="
// hints; scrubLogText is the precise filter and a no-op on non-token text).
export async function scrubRetainedNotificationBodies(): Promise<number> {
  const candidates = await db.notificationLog.findMany({
    where: {
      OR: [
        { body: { contains: "?r=" } }, { body: { contains: "?verify=" } }, { body: { contains: "invite=" } },
        { html: { contains: "?r=" } }, { html: { contains: "?verify=" } }, { html: { contains: "invite=" } },
      ],
    },
    select: { id: true, body: true, html: true, subject: true },
  });
  let scrubbed = 0;
  for (const row of candidates) {
    const body = scrubLogText(row.body);
    const html = row.html === null ? null : scrubLogText(row.html);
    const subject = scrubLogText(row.subject);
    if (body !== row.body || html !== row.html || subject !== row.subject) {
      await db.notificationLog.update({ where: { id: row.id }, data: { body, html, subject } });
      scrubbed++;
    }
  }
  return scrubbed;
}

// OD-11 caveat: INFORMATIONAL ONLY — returns how many AuditEvent rows sit
// beyond the proposed 180-day window. Nothing is deleted or updated until the
// retention policy is confirmed against compliance/contractual requirements.
export async function countAuditEventsBeyondRetention(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86400_000);
  return db.auditEvent.count({ where: { createdAt: { lt: cutoff } } });
}

export interface RetentionSweepResult {
  purgedNotificationBodies: number;
  scrubbedRetainedBodies: number; // pre-SEC-17 / rollback rows whose raw tokens were scrubbed this pass
  auditBeyondRetention: number; // informational — these rows are NOT deleted
}

export async function pruneOldLogs(retentionDays?: number): Promise<RetentionSweepResult> {
  // ORDER MATTERS: the purge tier must complete before the self-healing scrub
  // starts. The scrub is a read-modify-write — run concurrently it can read a
  // pre-purge body and write the redacted text back OVER a fresh tombstone,
  // resurrecting content on rows that should have been purged. Sequential
  // execution makes the purge authoritative for out-of-window rows and leaves
  // the scrub to heal only what remains.
  const purgedNotificationBodies = await purgeExpiredNotificationBodies(retentionDays);
  const [scrubbedRetainedBodies, auditBeyondRetention] = await Promise.all([
    scrubRetainedNotificationBodies(),
    countAuditEventsBeyondRetention(),
  ]);
  return { purgedNotificationBodies, scrubbedRetainedBodies, auditBeyondRetention };
}

export async function maybePruneOldLogs(): Promise<void> {
  if (Date.now() - logGate.last < PRUNE_INTERVAL_MS) return;
  logGate.last = Date.now();
  try {
    await pruneOldLogs(await configuredNotificationRetentionDays());
  } catch {
    // hygiene is best-effort — never block the calling flow
  }
}
