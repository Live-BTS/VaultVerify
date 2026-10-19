import { describe, it, expect, afterAll } from "vitest";

// ── /api/cron/retention — scheduled OD-11 enforcement ────────────
// Auth matrix: correct bearer → 200 + sweep counts; wrong bearer → 403;
// missing bearer → 403; CRON_SECRET unset → 403 even with a header
// (fail-closed, so a forgotten Vercel variable never opens the endpoint).
// A successful pass must write the RETENTION_SWEEP_CRON audit row and return
// counts only — never row content.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { GET as cronGet } from "@/app/api/cron/retention/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const TEST_SECRET = "cron-test-secret-0192837465";

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

const cronReq = (auth?: string) =>
  new NextRequest("http://localhost:3000/api/cron/retention", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });

describe("OD-11 cron endpoint auth (fail-closed)", () => {
  it("rejects when CRON_SECRET is not configured — even with a bearer header", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronGet(cronReq(`Bearer ${TEST_SECRET}`));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("accepts the correct bearer, runs the sweep, audits it, returns counts only", async () => {
    process.env.CRON_SECRET = TEST_SECRET;
    const res = await cronGet(cronReq(`Bearer ${TEST_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.purgedNotificationBodies).toBe("number");
    expect(typeof body.scrubbedRetainedBodies).toBe("number");
    expect(typeof body.auditBeyondRetention).toBe("number");
    const audit = await db.auditEvent.findFirst({
      where: { action: "RETENTION_SWEEP_CRON", actorId: "cron" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const detail = JSON.parse(audit!.detail);
    expect(typeof detail.purged).toBe("number");
    expect(typeof detail.scrubbed).toBe("number");
  });

  it("rejects a wrong bearer and a missing header", async () => {
    process.env.CRON_SECRET = TEST_SECRET;
    expect((await cronGet(cronReq("Bearer wrong-secret"))).status).toBe(403);
    expect((await cronGet(cronReq())).status).toBe(403);
  });

  it("the sweep actually enforces retention — an OTP row past 24h is tombstoned by a cron pass", async () => {
    process.env.CRON_SECRET = TEST_SECRET;
    const stale = await db.notificationLog.create({
      data: { channel: "EMAIL", kind: "OTP", to: "cron@od11.local", body: "cron probe 552210", createdAt: new Date(Date.now() - 30 * 3600_000) },
    });
    await cronGet(cronReq(`Bearer ${TEST_SECRET}`));
    const after = await db.notificationLog.findUnique({ where: { id: stale.id } });
    expect(after?.body).not.toContain("552210");
  });
});
