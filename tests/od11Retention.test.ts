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
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000);

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
  it("purges a 91-day-old row to a tombstone; retains and self-heals an 89-day-old row (90-day window)", async () => {
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

    // 89-day-old row is INSIDE the window, so the sweep self-heals it instead:
    // same row, same metadata, but the raw capability URL is redacted.
    const freshAfter = await db.notificationLog.findUnique({ where: { id: fresh.id } });
    expect(freshAfter).not.toBeNull();
    expect(freshAfter?.body).not.toContain("REALCAPTOKEN89");
    expect(freshAfter?.body).toContain("<redacted:");
    expect(freshAfter?.body).toContain("Please open");
    expect(freshAfter?.html).not.toBeNull();
    expect(JSON.stringify(freshAfter)).not.toContain("REALCAPTOKEN89");
    expect(freshAfter?.to).toBe("ref89@od11.local");
    expect(freshAfter?.subject).toBe("Reference request — Sam Doe");
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

describe("OD-11 follow-through: 24-hour OTP tier", () => {
  it("purges an OTP body after 25 hours even though the general window is 90 days", async () => {
    const otp = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "OTP", to: "owner2@od11.local",
        subject: "VaultVerify admin login code",
        body: "Your one-time code is 773412",
        html: "<p>773412</p>",
        createdAt: hoursAgo(25),
      },
    });

    const result = await pruneOldLogs();

    const after = await db.notificationLog.findUnique({ where: { id: otp.id } });
    expect(after).not.toBeNull(); // metadata retained like every purge
    expect(after?.body).toBe(PURGED_BODY_TOMBSTONE);
    expect(after?.html).toBeNull();
    expect(JSON.stringify(after)).not.toContain("773412");
    expect(result.purgedNotificationBodies).toBeGreaterThanOrEqual(1);
  });

  it("spares an OTP body younger than 24 hours", async () => {
    const otp = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "OTP", to: "fresh@od11.local",
        subject: "VaultVerify admin login code",
        body: "Your one-time code is 998211",
        html: "<p>998211</p>",
        createdAt: hoursAgo(23),
      },
    });

    await pruneOldLogs();

    const after = await db.notificationLog.findUnique({ where: { id: otp.id } });
    expect(after?.body).toBe("Your one-time code is 998211");
    expect(after?.html).toBe("<p>998211</p>");
  });

  it("does not shorten the window for other kinds — a 25-hour-old INVITE survives", async () => {
    const invite = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "INVITE", to: "day1@od11.local", body: "plain invite body, no token", createdAt: hoursAgo(25) },
    });

    await pruneOldLogs();

    expect((await db.notificationLog.findUnique({ where: { id: invite.id } }))?.body).toBe("plain invite body, no token");
  });
});

describe("OD-11 follow-through: self-healing scrub of retained bodies", () => {
  it("redacts raw tokens in rows inside the window — any age, any surface, metadata intact", async () => {
    const legacy = await db.notificationLog.create({
      data: {
        channel: "EMAIL", kind: "AUTH", to: "legacy@od11.local",
        subject: "Verify your VaultVerify email",
        body: "Confirm here: https://vaultverify.vercel.app/?verify=LEGACYRAWVERIFY01 and &amp;invite=LEGACYRAWINVITE01 in html",
        html: "<a href=\"https://vaultverify.vercel.app/?view=checklist&amp;invite=LEGACYRAWINVITE01\">Open</a>",
        createdAt: daysAgo(25),
      },
    });

    const result = await pruneOldLogs();

    expect(result.scrubbedRetainedBodies).toBeGreaterThanOrEqual(1);
    const after = await db.notificationLog.findUnique({ where: { id: legacy.id } });
    expect(after).not.toBeNull();
    expect(JSON.stringify(after)).not.toContain("LEGACYRAWVERIFY01");
    expect(JSON.stringify(after)).not.toContain("LEGACYRAWINVITE01");
    expect(JSON.stringify(after)).toContain("<redacted:");
    // surrounding text and metadata survive
    expect(after?.body).toContain("Confirm here:");
    expect(after?.subject).toBe("Verify your VaultVerify email");
    expect(after?.to).toBe("legacy@od11.local");
  });

  it("is idempotent — a second sweep scrubs nothing further and leaves short params alone", async () => {
    const mixed = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "REMINDER", to: "mixed@od11.local", body: "check ?view=checklist then /?r=MIXEDRAWTOKEN123", createdAt: daysAgo(5) },
    });

    const first = await pruneOldLogs();
    const second = await pruneOldLogs();

    expect(first.scrubbedRetainedBodies).toBeGreaterThanOrEqual(1);
    expect(second.scrubbedRetainedBodies).toBe(0);
    const after = await db.notificationLog.findUnique({ where: { id: mixed.id } });
    expect(after?.body).toContain("?view=checklist"); // short non-secret param untouched
    expect(after?.body).not.toContain("MIXEDRAWTOKEN123");
    expect(after?.body).not.toBe(PURGED_BODY_TOMBSTONE); // inside window: scrubbed, not tombstoned
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
