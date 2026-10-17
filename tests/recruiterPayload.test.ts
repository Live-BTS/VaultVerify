import { beforeAll, describe, expect, it, vi } from "vitest";

// ── Session cookie mock (same harness as authz.test.ts) ──
let RECRUITER_SESSION_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_rc" && RECRUITER_SESSION_COOKIE ? { value: RECRUITER_SESSION_COOKIE } : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { sha256 } from "@/lib/bts/auth";
import { GET as recruiterGet } from "@/app/api/recruiter/route";

// ── SEC-01(a) / SEC-15 / CH-05: recruiter payload minimization ──
describe("CH-05: recruiter payload carries content, never screening metadata/tokens", () => {
  let recruiterSessionId = "";
  let requestId = "";

  const req = (url: string) => new NextRequest(`http://localhost:3000${url}`);

  beforeAll(async () => {
    const recruiter = await db.recruiterAccount.create({
      data: { email: "recmin@test.local", name: "Rec Min", passwordHash: hashPassword("password123"), emailVerified: true, onboardingComplete: true },
    });
    recruiterSessionId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
    await db.recruiterSession.create({ data: { id: sha256(recruiterSessionId), accountId: recruiter.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    RECRUITER_SESSION_COOKIE = recruiterSessionId;

    const candidate = await db.candidate.create({
      data: {
        agencyId: (await db.agency.create({ data: { name: "Min", slug: `min-${Date.now()}` } })).id,
        fullName: "Min User",
        email: "min@test.local",
        role: "RN",
        specialty: "ICU",
        consentSignature: "sig",
        consentSignedAt: new Date(),
        requests: {
          create: {
            token: crypto.randomUUID().replaceAll("-", ""),
            refName: "Ref Min",
            refTitle: "Manager",
            refEmail: "refmin@test.local",
            refPhone: "5550000",
            facilityName: "General",
            relationship: "Supervisor",
            status: "COMPLETED",
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + 86_400_000),
            flags: { create: [{ type: "RAPID_COMPLETION", detail: "screening detail must not leak", severity: "MEDIUM" }] },
            response: {
              create: {
                answers: "[]",
                signatureName: "Ref Min",
                signedAt: new Date(),
                identityMethod: "SKIPPED",
                overallRating: 4,
                signerIp: "203.0.113.9",
                signerUserAgent: "payload-test-agent",
              },
            },
            shares: {
              create: {
                token: `rsl_${crypto.randomUUID().replaceAll("-", "")}`,
                accessType: "DURATION",
                expiresAt: new Date(Date.now() + 86_400_000),
              },
            },
          },
        },
      },
      include: { requests: true },
    });
    requestId = candidate.requests[0].id;
  });

  it("payload includes report content fields", async () => {
    const res = await recruiterGet(req("/api/recruiter"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.totalRequests).toBe(1);
    const r = body.requests[0];
    expect(r.id).toBe(requestId);
    expect(r.candidate.fullName).toBe("Min User");
    expect(r.refName).toBe("Ref Min");
    expect(r.response).toBeTruthy();
    expect(r.response.overallRating).toBe(4);
    expect(r.response.answers).toBe("[]");
    expect(Array.isArray(r.response.skillChecks)).toBe(true);
  });

  it("payload excludes screening metadata, flag rows, and raw share tokens", async () => {
    const res = await recruiterGet(req("/api/recruiter"));
    const body = await res.json();
    const r = body.requests[0];
    expect(r.flags).toBeUndefined();
    expect(r.response.signerIp).toBeUndefined();
    expect(r.response.signerUserAgent).toBeUndefined();
    expect(r.shares[0]?.token).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("screening detail must not leak");
    // stats are still computed server-side from flag data
    expect(body.stats.flaggedCount).toBe(1);
  });
});
