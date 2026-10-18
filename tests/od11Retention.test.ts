import { describe, it, expect } from "vitest";

// ── OD-11 retention tests (owner-approved decision, this segment) ──
// Owner decision implemented here:
//   1. NotificationLog: body+html purged after 90 days; metadata rows retained
//      with no sensitive message content. OTP emails included — no exemption.
//   2. AuditEvent: 180-day window is PROPOSED and informational only — no
//      automatic deletion of audit rows until compliance/contractual review
//      confirms the policy.
// The sweep must be idempotent, window-clamped, and never resurrect content.

import { db } from "@/lib/db";
import {
  pruneOldLogs,
  purgeExpiredNotificationBodies,
  countAuditEventsBeyondRetention,
  configuredNotificationRetentionDays,
  AUDIT_RETENTION_DAYS,
  DEFAULT_LOG_RETENTION_DAYS,
  PURGED_BODY_TOMBSTONE,
} from "@/lib/bts/hygiene";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

describe("OD-11: owner-set windows are pinned", () => {
  it("NotificationLog purge window is 90 days; AuditEvent window is the proposed 180", () => {
    expect(DEFAULT_LOG_RETENTION_DAYS).toBe(90);
    expect(AUDIT_RETENTION_DAYS).toBe(180);
  });

  it("configured window falls back to the 90-day default and stays inside the 7..3650 clamp", async () => {
    const days = await configuredNotificationRetentionDays();
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(3650);
  });
});

describe("OD-11: NotificationLog body/html purge, metadata retention", () => {
  it("purges a 91-day-old row to a tombstone, spares an 89-day-old row (90-day window)", async () => {
    const old = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "INVITE", to: "ref91@od11.local",
        subject: "Reference request — Jordan Blake, RN",
        body: "Please open /?r=REALCAPTOKEN91 to respond",
        html: "<a href=\"/?r=REALCAPTOKEN91\">Respond</a>",
        createdAt: daysAgo(91),
      },
    });
    const fresh = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "INVITE", to: "ref89@od11.local",
        subject: "Reference request — Sam Doe",
        body: "Please open /?r=REALCAPTOKEN89 to respond",
        html: "<a href=\"/?r=REALCAPTOKEN89\">Respond</a>",
        createdAt: daysAgo(89),
      },
    });

    const result = await pruneOldLogs();

    expect(result.purgedNotificationBodies).toBeGreaterThanOrEqual(1);
    const oldAfter = await db.notificationLog.findUnique({ where: { id: old.id } });
    expect(oldAfter).not.toBeNull(); // metadata row RETAINED
    expect(oldAfter?.body).toBe(PURGED_BODY_TOMBSTONE);
    expect(oldAfter?.html).toBeNull();
    expect(oldAfter?.to).toBe("ref91@od11.local");
    expect(oldAfter?.subject).toBe("Reference request — Jordan Blake, RN");
    expect(JSON.stringify(oldAfter)).not.toContain("REALCAPTOKEN91");
    const freshAfter = await db.notificationLog.findUnique({ where: { id: fresh.id } });
    expect(freshAfter?.body).toBe("Please open /?r=REALCAPTOKEN89 to respond");
    expect(freshAfter?.html).toBe("<a href=\"/?r=REALCAPTOKEN89\">Respond</a>");
  });

  it("applies to OTP emails — the 6-digit code does not outlive the window", async () => {
    const otp = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "OTP", to: "owner@od11.local",
        subject: "VaultVerify admin login code",
        body: "Your one-time code is 481902",
        html: "<p>Your one-time code is 481902</p>",
        createdAt: daysAgo(120),
      },
    });

    await purgeExpiredNotificationBodies();

    const after = await db.notificationLog.findUnique({ where: { id: otp.id } });
    expect(after).not.toBeNull(); // metadata retained like every other kind
    expect(after?.body).toBe(PURGED_BODY_TOMBSTONE);
    expect(after?.html).toBeNull();
    expect(JSON.stringify(after)).not.toContain("481902");
  });

  it("is idempotent — a second sweep re-purges nothing", async () => {
    await db.notificationLog.create({
      data: { channel: "SMS", kind: "REMINDER", to: "+15550001111", body: "reminder sms", createdAt: daysAgo(100) },
    });
    const first = await pruneOldLogs();
    const second = await pruneOldLogs();
    expect(first.purgedNotificationBodies).toBeGreaterThanOrEqual(1);
    expect(second.purgedNotificationBodies).toBe(0);
  });

  it("honors a shorter configured window — 7 days purges an 8-day-old row and spares a 6-day-old one", async () => {
    const eight = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "COMPLETION", to: "done@od11.local", body: "eight-day body", createdAt: daysAgo(8) },
    });
    const six = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "COMPLETION", to: "recent@od11.local", body: "six-day body", createdAt: daysAgo(6) },
    });

    await pruneOldLogs(7);

    expect((await db.notificationLog.findUnique({ where: { id: eight.id } }))?.body).toBe(PURGED_BODY_TOMBSTONE);
    expect((await db.notificationLog.findUnique({ where: { id: six.id } }))?.body).toBe("six-day body");
  });

  it("clamps the window floor at 7 days — a 3-day request cannot purge 6-day-old rows", async () => {
    const six = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "SECURITY", to: "clamp@od11.local", body: "clamp probe body", createdAt: daysAgo(6) },
    });

    await pruneOldLogs(3); // clamped up to 7 → the 6-day-old row survives

    expect((await db.notificationLog.findUnique({ where: { id: six.id } }))?.body).toBe("clamp probe body");
  });
});

describe("OD-11: AuditEvent 180-day window is informational — no auto-deletion", () => {
  it("counts rows beyond 180 days and deletes nothing", async () => {
    const beyond = await db.auditEvent.create({
      data: { actorType: "SYSTEM", action: "OD11_BEYOND", createdAt: daysAgo(181) },
    });
    const inside = await db.auditEvent.create({
      data: { actorType: "SYSTEM", action: "OD11_INSIDE", createdAt: daysAgo(179) },
    });
    const before = await db.auditEvent.count();

    const result = await pruneOldLogs();

    expect(await db.auditEvent.count()).toBe(before); // row count unchanged
    expect(await db.auditEvent.findUnique({ where: { id: beyond.id } })).not.toBeNull();
    expect(await db.auditEvent.findUnique({ where: { id: inside.id } })).not.toBeNull();
    expect(result.auditBeyondRetention).toBeGreaterThanOrEqual(1);
    expect(result.auditBeyondRetention).toBe(await countAuditEventsBeyondRetention());
  });
});
