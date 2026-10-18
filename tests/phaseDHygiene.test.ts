import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Phase D hardening tests ──────────────────────────────────────
// 1. Login lockout (failedLogins finally enforced)
// 2. Token hashing at rest (verification, reset, candidate + recruiter
//    sessions, superadmin sessions)
// 3. Expired auth-row pruning
// 4. Log retention pruning
// Same harness conventions as phaseBAuthz.test.ts.

let RC_COOKIE: string | null = null;
let CK_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && CK_COOKIE ? { value: CK_COOKIE }
      : name === "vv_rc" && RC_COOKIE ? { value: RC_COOKIE }
      : undefined,
    set: (name: string, value: string) => {
      if (name === "vv_ck") CK_COOKIE = value;
      if (name === "vv_rc") RC_COOKIE = value;
    },
    delete: (name: string) => {
      if (name === "vv_ck") CK_COOKIE = null;
      if (name === "vv_rc") RC_COOKIE = null;
    },
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sha256, createVerification, consumeVerification, createPasswordReset, consumePasswordReset, createRecruiterSession, getRecruiterSessionAccount, destroyRecruiterSession } from "@/lib/bts/auth";
import { hashPassword, createSession, getAccount, destroySession } from "@/lib/bts/checklistAuth";
import { loginLockedFor, pruneExpiredAuthRows, pruneOldLogs, PURGED_BODY_TOMBSTONE } from "@/lib/bts/hygiene";
import { POST as authPost } from "@/app/api/auth/route";

const LOCK_EMAIL = "lockout@phased.local";
const LOCK_PASSWORD = "correct-horse-1";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const signin = (email: string, password: string) =>
  authPost(jsonReq("/api/auth", { action: "signin", role: "CANDIDATE", email, password }));

beforeAll(async () => {
  // Lockout fixture — verified candidate with a known password.
  await db.checklistAccount.create({
    data: { email: LOCK_EMAIL, name: "Lock Out", passwordHash: hashPassword(LOCK_PASSWORD), emailVerified: true },
  });
});

// ── 1. Login lockout ─────────────────────────────────────────────

describe("Phase D: login lockout", () => {
  it("unit: locks at the threshold inside the window, unlocks after it", () => {
    expect(loginLockedFor({ failedLogins: 5, lastFailedLogin: new Date() })).toBeGreaterThan(0);
    expect(loginLockedFor({ failedLogins: 4, lastFailedLogin: new Date() })).toBe(0);
    expect(loginLockedFor({ failedLogins: 9, lastFailedLogin: new Date(Date.now() - 16 * 60_000) })).toBe(0);
    expect(loginLockedFor(null)).toBe(0);
  });

  it("locks the account after 5 failures — the correct password is rejected too", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await signin(LOCK_EMAIL, "definitely-wrong");
      expect(res.status).toBe(401);
    }
    const res = await signin(LOCK_EMAIL, LOCK_PASSWORD);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("unknown emails never lock (401 without an account row)", async () => {
    const res = await signin("ghost@phased.local", "whatever1");
    expect(res.status).toBe(401);
  });

  it("unlocks once the window quiets down and resets the counter on success", async () => {
    await db.checklistAccount.update({
      where: { email: LOCK_EMAIL },
      data: { lastFailedLogin: new Date(Date.now() - 16 * 60_000) },
    });
    const res = await signin(LOCK_EMAIL, LOCK_PASSWORD);
    expect(res.status).toBe(200);
    const acc = await db.checklistAccount.findUnique({ where: { email: LOCK_EMAIL } });
    expect(acc?.failedLogins).toBe(0);
  });
});

// ── 2. Token hashing at rest ─────────────────────────────────────

describe("Phase D: capability tokens are hashed at rest", () => {
  it("verification tokens: DB row holds the digest; the raw value consumes once", async () => {
    const email = "verify-d@phased.local";
    const raw = await createVerification("CANDIDATE", email);
    const row = await db.emailVerification.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
    expect(row?.token).toBe(sha256(raw));
    expect(row?.token).not.toBe(raw);
    expect(await consumeVerification(raw)).toMatchObject({ email, role: "CANDIDATE" });
    expect(await consumeVerification(raw)).toBeNull();
  });

  it("reset tokens: DB row holds the digest; the raw value consumes once", async () => {
    const acc = await db.checklistAccount.create({
      data: { email: "reset-d@phased.local", name: "R", passwordHash: hashPassword("whatever1") },
    });
    const raw = await createPasswordReset("CANDIDATE", acc.id);
    const row = await db.passwordResetToken.findFirst({ where: { accountId: acc.id }, orderBy: { createdAt: "desc" } });
    expect(row?.token).toBe(sha256(raw));
    expect(row?.token).not.toBe(raw);
    expect(await consumePasswordReset("CANDIDATE", raw)).toMatchObject({ accountId: acc.id });
    expect(await consumePasswordReset("CANDIDATE", raw)).toBeNull();
  });

  it("candidate sessions: DB id is the digest; the raw cookie value resolves; destroy works", async () => {
    const acc = await db.checklistAccount.create({
      data: { email: "sess-d@phased.local", name: "S", passwordHash: hashPassword("whatever1") },
    });
    const raw = await createSession(acc.id);
    expect(raw).toMatch(/^cks_/);
    const row = await db.checklistSession.findFirst({ where: { accountId: acc.id }, orderBy: { createdAt: "desc" } });
    expect(row?.id).toBe(sha256(raw));
    expect(row?.id).not.toBe(raw);
    CK_COOKIE = raw;
    expect((await getAccount())?.id).toBe(acc.id);
    await destroySession();
    expect(await db.checklistSession.findUnique({ where: { id: sha256(raw) } })).toBeNull();
    CK_COOKIE = null;
  });

  it("recruiter sessions: DB id is the digest; the raw cookie value resolves; destroy works", async () => {
    const acc = await db.recruiterAccount.create({
      data: { email: "recsess-d@phased.local", name: "RS", passwordHash: hashPassword("whatever1"), emailVerified: true, onboardingComplete: true },
    });
    const raw = await createRecruiterSession(acc.id);
    expect(raw).toMatch(/^rcs_/);
    const row = await db.recruiterSession.findFirst({ where: { accountId: acc.id }, orderBy: { createdAt: "desc" } });
    expect(row?.id).toBe(sha256(raw));
    RC_COOKIE = raw;
    expect((await getRecruiterSessionAccount())?.id).toBe(acc.id);
    await destroyRecruiterSession();
    expect(await db.recruiterSession.findUnique({ where: { id: sha256(raw) } })).toBeNull();
    RC_COOKIE = null;
  });
});

// ── 2b. Superadmin session hashing (end-to-end through the OTP flow) ──

describe("Phase D: superadmin session tokens are hashed at rest", () => {
  let superPost: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    // SUPERADMIN_EMAIL is read at module load — set it before the import.
    process.env.SUPERADMIN_EMAIL = "owner@phased.local";
    const mod = await import("@/app/api/superadmin/route");
    superPost = mod.POST;
  });

  it("verify_otp issues a hashed session; the raw token still authenticates", async () => {
    const r1 = await superPost(jsonReq("/api/superadmin", { action: "request_otp" }));
    expect((await r1.json()).ok).toBe(true);
    const note = await db.notificationLog.findFirst({
      where: { to: "owner@phased.local" },
      orderBy: { createdAt: "desc" },
    });
    const code = note?.body.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeTruthy();

    const r2 = await superPost(jsonReq("/api/superadmin", { action: "verify_otp", otp: code }));
    const data = await r2.json();
    expect(data.ok).toBe(true);
    expect(String(data.token)).toMatch(/^sas_/);

    const row = await db.superAdminSession.findFirst({ orderBy: { createdAt: "desc" } });
    expect(row?.token).toBe(sha256(data.token));
    expect(row?.token).not.toBe(data.token);

    const r3 = await superPost(jsonReq("/api/superadmin", { action: "auth", token: data.token }));
    expect((await r3.json()).ok).toBe(true);
  });
});

// ── 3. Expired auth-row pruning ──────────────────────────────────

describe("Phase D: expired auth rows are pruned, live rows survive", () => {
  it("removes expired sessions and tokens only", async () => {
    const acc = await db.checklistAccount.create({
      data: { email: "prune-d@phased.local", name: "P", passwordHash: hashPassword("whatever1") },
    });
    const future = new Date(Date.now() + 86400_000);
    const past = new Date(Date.now() - 3600_000);
    const liveSess = await db.checklistSession.create({ data: { id: sha256(`cks_live_${crypto.randomUUID()}`), accountId: acc.id, expiresAt: future } });
    const deadSess = await db.checklistSession.create({ data: { id: sha256(`cks_dead_${crypto.randomUUID()}`), accountId: acc.id, expiresAt: past } });
    const liveVer = await db.emailVerification.create({ data: { token: sha256(`live_${crypto.randomUUID()}`), role: "CANDIDATE", email: "live@phased.local", expiresAt: future } });
    const deadVer = await db.emailVerification.create({ data: { token: sha256(`dead_${crypto.randomUUID()}`), role: "CANDIDATE", email: "dead@phased.local", expiresAt: past } });

    await pruneExpiredAuthRows();

    expect(await db.checklistSession.findUnique({ where: { id: liveSess.id } })).not.toBeNull();
    expect(await db.checklistSession.findUnique({ where: { id: deadSess.id } })).toBeNull();
    expect(await db.emailVerification.findUnique({ where: { id: liveVer.id } })).not.toBeNull();
    expect(await db.emailVerification.findUnique({ where: { id: deadVer.id } })).toBeNull();
  });
});

// ── 4. Log retention (OD-11 semantics) ───────────────────────────
// Supersedes the Phase D whole-row deleteMany: NotificationLog rows keep
// metadata with body/html purged; AuditEvent rows are NEVER auto-deleted.

describe("Phase D: log retention (OD-11)", () => {
  it("purges notification body/html past the window but retains metadata rows; audit rows are never deleted", async () => {
    const oldAudit = await db.auditEvent.create({
      data: { actorType: "SYSTEM", action: "PHASE_D_OLD", createdAt: new Date(Date.now() - 200 * 86400_000) },
    });
    const newAudit = await db.auditEvent.create({
      data: { actorType: "SYSTEM", action: "PHASE_D_NEW", createdAt: new Date() },
    });
    const oldNote = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "OTP", to: "old@phased.local", subject: "VaultVerify admin login code", body: "Your code is 481902", html: "<p>Your code is 481902</p>", createdAt: new Date(Date.now() - 200 * 86400_000) },
    });
    const newNote = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "AUTH", to: "new@phased.local", body: "new", createdAt: new Date() },
    });

    const result = await pruneOldLogs(90);

    // NotificationLog: the row survives as metadata; the content does not.
    const oldAfter = await db.notificationLog.findUnique({ where: { id: oldNote.id } });
    expect(oldAfter).not.toBeNull();
    expect(oldAfter?.body).toBe(PURGED_BODY_TOMBSTONE);
    expect(oldAfter?.html).toBeNull();
    expect(oldAfter?.to).toBe("old@phased.local");
    expect(oldAfter?.subject).toBe("VaultVerify admin login code");
    expect(oldAfter?.kind).toBe("OTP");
    expect(JSON.stringify(oldAfter)).not.toContain("481902");
    const newAfter = await db.notificationLog.findUnique({ where: { id: newNote.id } });
    expect(newAfter?.body).toBe("new");

    // AuditEvent: never auto-deleted; the 180-day window is informational.
    expect(await db.auditEvent.findUnique({ where: { id: oldAudit.id } })).not.toBeNull();
    expect(await db.auditEvent.findUnique({ where: { id: newAudit.id } })).not.toBeNull();
    expect(result.auditBeyondRetention).toBeGreaterThanOrEqual(1);
  });
});
