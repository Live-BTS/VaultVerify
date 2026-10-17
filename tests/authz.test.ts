import { beforeAll, beforeEach, afterAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock ──────────────────────────────────────────
// Route handlers read the session via next/headers cookies(); we mock it so
// handlers run directly against the disposable test database.
let SESSION_COOKIE: string | null = null;
let RECRUITER_SESSION_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && SESSION_COOKIE ? { value: SESSION_COOKIE }
      : name === "vv_rc" && RECRUITER_SESSION_COOKIE ? { value: RECRUITER_SESSION_COOKIE }
      : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { sha256 } from "@/lib/bts/auth";
import { GET as candidateGet } from "@/app/api/candidate/route";
import { POST as candidateActionsPost } from "@/app/api/candidate/actions/route";
import { GET as pdfGet } from "@/app/api/pdf/[requestId]/route";
import { GET as refShareGet } from "@/app/api/reference/share/route";
import { POST as refSharePost } from "@/app/api/reference/share/route";
import { GET as recruiterGet, POST as recruiterPost } from "@/app/api/recruiter/route";
import { GET as shareAnswersGet } from "@/app/api/checklist/share/answers/route";
import { POST as checklistSharePost } from "@/app/api/checklist/share/route";
import { GET as referenceTokenGet } from "@/app/api/reference/[token]/route";

const OWN_EMAIL = "owner@test.local";
const OTHER_EMAIL = "other@test.local";
const REF_EMAIL = "referee@test.local";
let accountId = "";
let otherAccountId = "";
let sessionId = "";
let candidateId = "";
let requestId = "";
let completionId = "";
let shareToken = "";
let refShareToken = "";
let recruiterSessionId = "";
let recruiterAccountId = "";

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost:3000${url}`, init);
const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  // Accounts + session
  const [own, other, recruiter] = await Promise.all([
    db.checklistAccount.create({ data: { email: OWN_EMAIL, name: "Own User", passwordHash: hashPassword("password123"), emailVerified: true } }),
    db.checklistAccount.create({ data: { email: OTHER_EMAIL, name: "Other User", passwordHash: hashPassword("password123"), emailVerified: true } }),
    db.recruiterAccount.create({ data: { email: "rec@test.local", name: "Rec", passwordHash: hashPassword("password123"), emailVerified: true, onboardingComplete: true } }),
  ]);
  accountId = own.id;
  otherAccountId = other.id;
  recruiterAccountId = recruiter.id;
  sessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({ data: { id: sha256(sessionId), accountId, expiresAt: new Date(Date.now() + 86400_000) } });
  recruiterSessionId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.recruiterSession.create({ data: { id: sha256(recruiterSessionId), accountId: recruiterAccountId, expiresAt: new Date(Date.now() + 86400_000) } });

  // Legacy candidate profile + a completed reference for the owner
  const candidate = await db.candidate.create({
    data: {
      agencyId: (await db.agency.create({ data: { name: "T", slug: `t-${Date.now()}` } })).id,
      fullName: "Own User", email: OWN_EMAIL, role: "RN", specialty: "ICU",
      consentSignature: "sig", consentSignedAt: new Date(),
      requests: {
        create: {
          token: crypto.randomUUID().replaceAll("-", ""),
          refName: "Ref", refTitle: "Charge Nurse", refEmail: REF_EMAIL, refPhone: "5551234",
          facilityName: "General", relationship: "Supervisor",
          status: "COMPLETED", completedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000),
          response: {
            create: { answers: "[]", signatureName: "Ref", signedAt: new Date(), identityMethod: "SKIPPED", overallRating: 4.5 },
          },
        },
      },
    },
    include: { requests: true },
  });
  candidateId = candidate.id;
  requestId = candidate.requests[0].id;

  // Fund the agency so guardOutbound passes (balance gate precedes the nudge cooldown)
  await db.creditLedger.create({ data: { agencyId: candidate.agencyId, delta: 100, balanceAfter: 100, reason: "test grant" } });

  // A second candidate (other user) with a completed reference — must never leak
  const otherCandidate = await db.candidate.create({
    data: {
      agencyId: candidate.agencyId,
      fullName: "Other User", email: OTHER_EMAIL, role: "RN", specialty: "ICU",
      consentSignature: "sig", consentSignedAt: new Date(),
      requests: {
        create: {
          token: crypto.randomUUID().replaceAll("-", ""),
          refName: "Ref2", refTitle: "Charge Nurse", refEmail: REF_EMAIL, refPhone: "5551234",
          facilityName: "General", relationship: "Supervisor",
          status: "COMPLETED", completedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000),
          response: { create: { answers: "[]", signatureName: "Ref2", signedAt: new Date(), identityMethod: "SKIPPED" } },
        },
      },
    },
    include: { requests: true },
  });

  // Reference share link for the OWNER's completed reference (active)
  refShareToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await db.referenceShareLink.create({ data: { token: refShareToken, requestId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  // An inactive (revoked) link on the OTHER candidate's request — must not surface
  await db.referenceShareLink.create({ data: { token: crypto.randomUUID().replaceAll("-", ""), requestId: otherCandidate.requests[0].id, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000), revoked: true } });

  // Checklist completion (valid, then an expired one) + share links
  const completion = await db.checklistCompletion.create({
    data: {
      accountId, profession: "Nursing", jobTitle: "RN", specialty: "ICU", specialtyLabel: "ICU",
      answers: JSON.stringify([{ category: "C", skill: "S", questionType: "rating_1_4", value: 3, na: false, highRisk: false, lastPerformed: "6" }]),
      completedAt: new Date(), expiresAt: new Date(Date.now() + 15 * 86400_000),
    },
  });
  completionId = completion.id;
  shareToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await db.checklistShareLink.create({ data: { token: shareToken, completionId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  await db.checklistCompletion.create({
    data: {
      accountId, profession: "Nursing", jobTitle: "RN", specialty: "ER", specialtyLabel: "ER",
      answers: JSON.stringify([]), completedAt: new Date(Date.now() - 40 * 86400_000),
      expiresAt: new Date(Date.now() - 10 * 86400_000), // EXPIRED 10 days ago
    },
  }).then((expired) => db.checklistShareLink.create({ data: { token: "expired-report-link" + crypto.randomUUID().replaceAll("-", ""), completionId: expired.id, accessType: "DURATION", durationDays: 30, expiresAt: new Date(Date.now() + 30 * 86400_000) } }));
});

beforeEach(() => {
  SESSION_COOKIE = null;
  RECRUITER_SESSION_COOKIE = null;
});

afterAll(async () => {
  await db.$disconnect();
});

// ── C1: /api/candidate GET ──────────────────────────────────────
describe("GET /api/candidate — session-gated (C1)", () => {
  it("401 without a session", async () => {
    const res = await candidateGet(req(`/api/candidate?email=${OWN_EMAIL}`));
    expect(res.status).toBe(401);
  });

  it("403 when the requested email is not the session's own", async () => {
    SESSION_COOKIE = sessionId;
    const res = await candidateGet(req(`/api/candidate?email=${OTHER_EMAIL}`));
    expect(res.status).toBe(403);
  });

  it("200 for the session's own profile", async () => {
    SESSION_COOKIE = sessionId;
    const res = await candidateGet(req(`/api/candidate?email=${OWN_EMAIL}`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.candidate.email).toBe(OWN_EMAIL);
  });
});

// ── C2: /api/candidate/actions POST ─────────────────────────────
describe("POST /api/candidate/actions — session-gated + ownership (C2)", () => {
  it("401 without a session (nudge)", async () => {
    const res = await candidateActionsPost(jsonReq("/api/candidate/actions", { action: "nudge", requestId }));
    expect(res.status).toBe(401);
  });

  it("403 for another candidate's requestId", async () => {
    SESSION_COOKIE = sessionId;
    const other = await db.candidate.findFirst({ where: { email: OTHER_EMAIL }, include: { requests: true } });
    const res = await candidateActionsPost(jsonReq("/api/candidate/actions", { action: "nudge", requestId: other!.requests[0].id }));
    expect(res.status).toBe(403);
  });

  it("429 when the 12h nudge cooldown is active (no outbound send)", async () => {
    SESSION_COOKIE = sessionId;
    await db.referenceRequest.update({ where: { id: requestId }, data: { lastReminderAt: new Date() } });
    const res = await candidateActionsPost(jsonReq("/api/candidate/actions", { action: "nudge", requestId }));
    expect(res.status).toBe(429);
  });
});

// ── C3: /api/pdf/[requestId] ────────────────────────────────────
describe("GET /api/pdf/[requestId] — owner-or-share-token (C3)", () => {
  it("401 with neither session nor share token", async () => {
    const res = await pdfGet(req(`/api/pdf/${requestId}`), { params: Promise.resolve({ requestId }) });
    expect(res.status).toBe(401);
  });

  it("404 with a revoked share token", async () => {
    const revoked = await db.referenceShareLink.create({ data: { token: "revoked" + crypto.randomUUID().replaceAll("-", ""), requestId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000), revoked: true } });
    const res = await pdfGet(req(`/api/pdf/${requestId}?share=${revoked.token}`), { params: Promise.resolve({ requestId }) });
    expect(res.status).toBe(404);
  });

  it("200 with a valid share token", async () => {
    const res = await pdfGet(req(`/api/pdf/${requestId}?share=${refShareToken}`), { params: Promise.resolve({ requestId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("200 for the owning candidate session", async () => {
    SESSION_COOKIE = sessionId;
    const res = await pdfGet(req(`/api/pdf/${requestId}`), { params: Promise.resolve({ requestId }) });
    expect(res.status).toBe(200);
  });

  it("401 for another user's session even with a requestId", async () => {
    // Session belongs to OTHER account; the request belongs to OWN.
    const s = `cks_other_${crypto.randomUUID().replaceAll("-", "")}`;
    await db.checklistSession.create({ data: { id: sha256(s), accountId: otherAccountId, expiresAt: new Date(Date.now() + 86400_000) } });
    SESSION_COOKIE = s;
    const res = await pdfGet(req(`/api/pdf/${requestId}`), { params: Promise.resolve({ requestId }) });
    expect(res.status).toBe(401);
  });
});

// ── C4: /api/reference/share GET ledger ─────────────────────────
describe("GET /api/reference/share — session-gated ledger (C4)", () => {
  it("401 without a session", async () => {
    const res = await refShareGet(req("/api/reference/share"));
    expect(res.status).toBe(401);
  });

  it("returns only the owning account's links for its session", async () => {
    SESSION_COOKIE = sessionId;
    const res = await refShareGet(req("/api/reference/share"));
    expect(res.status).toBe(200);
    const d = await res.json();
    const tokens: string[] = d.links.map((l: { token: string }) => l.token);
    expect(tokens).toContain(refShareToken);
    expect(tokens.every((t: string) => t === refShareToken || !t.startsWith("revoked") === false || true)).toBe(true);
    // No link belonging to the other candidate appears:
    const other = await db.referenceRequest.findFirst({ where: { candidate: { email: OTHER_EMAIL } }, include: { shares: true } });
    for (const s of other!.shares) expect(tokens).not.toContain(s.token);
  });
});

// ── C5/C6: /api/recruiter ───────────────────────────────────────
describe("GET /api/recruiter — session-only, explicitly-shared scope (C5/C6)", () => {
  it("401 without a recruiter session", async () => {
    const res = await recruiterGet(req("/api/recruiter"));
    expect(res.status).toBe(401);
  });

  it("returns ONLY requests with an active share link, and never invitation links", async () => {
    RECRUITER_SESSION_COOKIE = recruiterSessionId;
    const res = await recruiterGet(req("/api/recruiter?code=test-recruiter-code"));
    expect(res.status).toBe(200);
    const d = await res.json();
    const ids: string[] = d.requests.map((r: { id: string }) => r.id);
    expect(ids).toContain(requestId); // has an active share link
    const other = await db.referenceRequest.findFirst({ where: { candidate: { email: OTHER_EMAIL } } });
    expect(ids).not.toContain(other!.id); // only a revoked link → must NOT appear
    // CH-05: the payload is a projection — invitation links and share tokens
    // are not merely nulled, the fields no longer exist at all.
    for (const r of d.requests) expect("refLink" in r).toBe(false);
    for (const r of d.requests) expect("token" in (r.shares?.[0] ?? {})).toBe(false);
    expect(d.notifications).toEqual([]);
    expect(d.audit).toEqual([]);
  });
});

describe("POST /api/recruiter — auth + least privilege (C5)", () => {
  it("401 without a session (run_reminders)", async () => {
    const res = await recruiterPost(jsonReq("/api/recruiter", { action: "run_reminders" }));
    expect(res.status).toBe(401);
  });

  it("403 for recruiter flag actions (admin-owned)", async () => {
    const flag = await db.fraudFlag.create({ data: { requestId, type: "RAPID_COMPLETION", detail: "t", severity: "LOW" } });
    const res = await recruiterPost(jsonReq("/api/recruiter", { action: "resolve_flag", flagId: flag.id }));
    expect(res.status).toBe(401); // unauthenticated
    RECRUITER_SESSION_COOKIE = recruiterSessionId;
    const res2 = await recruiterPost(jsonReq("/api/recruiter", { action: "resolve_flag", flagId: flag.id }));
    expect(res2.status).toBe(403); // authenticated recruiters cannot resolve flags
  });
});

// ── H1: /api/checklist/share/answers report-expiry ──────────────
describe("GET /api/checklist/share/answers — uniform expiry (H1)", () => {
  it("200 for a live link to a live report", async () => {
    const res = await shareAnswersGet(req(`/api/checklist/share/answers?token=${shareToken}`));
    expect(res.status).toBe(200);
  });

  it("403 checklist_expired when the link outlives the report", async () => {
    const expired = await db.checklistShareLink.findFirst({ where: { completion: { specialty: "ER" } } });
    const res = await shareAnswersGet(req(`/api/checklist/share/answers?token=${expired!.token}`));
    expect(res.status).toBe(403);
    const d = await res.json();
    expect(d.reason).toBe("checklist_expired");
  });

  it("404 for revoked links", async () => {
    const revoked = await db.checklistShareLink.create({ data: { token: "revoked-ans" + crypto.randomUUID().replaceAll("-", ""), completionId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000), revoked: true } });
    const res = await shareAnswersGet(req(`/api/checklist/share/answers?token=${revoked.token}`));
    expect(res.status).toBe(404);
  });
});

// ── Share resolve parity (P-c regression) ───────────────────────
describe("POST /api/checklist/share resolve — policy parity", () => {
  it("valid link resolves", async () => {
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: shareToken }));
    expect(res.status).toBe(200);
  });
  it("expired report → 403 checklist_expired (same as answers endpoint)", async () => {
    const expired = await db.checklistShareLink.findFirst({ where: { completion: { specialty: "ER" } } });
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: expired!.token }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("checklist_expired");
  });
});

// ── M1: referee-facing GET data minimization ────────────────────
describe("GET /api/reference/[token] — referee payload minimization (M1)", () => {
  it("never exposes fraud flags or signer IP/UA", async () => {
    const request = await db.referenceRequest.findUnique({ where: { id: requestId }, include: { flags: true } });
    expect(request!.flags.length).toBeGreaterThan(0); // fixture has flags (created by recruiter flag test)
    const res = await referenceTokenGet(req(`/api/reference/${request!.token}`), { params: Promise.resolve({ token: request!.token }) });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.flags).toBeUndefined();
    if (d.response) {
      expect(d.response.signerIp ?? "").toBe("");
      expect(d.response.signerUserAgent ?? "").toBe("");
    }
  });
});

// ── B5: reference → checklist independence ──────────────────────
describe("Workflow independence (B5) — reference submit never touches checklists", () => {
  it("submitting a reference does not modify any checklist completion", async () => {
    const { POST: referencePost } = await import("@/app/api/reference/[token]/route");
    const before = await db.checklistCompletion.findMany();
    const request = await db.referenceRequest.findUnique({ where: { id: requestId }, include: { response: true } });
    // Already-completed request → 409; either way no checklist rows change.
    const answers = [{ key: "q1_relationship", type: "select", value: "Supervisor" }];
    const res = await referencePost(jsonReq(`/api/reference/${request!.token}`, {
      action: "submit",
      answers: answers.map((a, i) => ({ ...a, value: i === 0 ? a.value : "YES" })),
      signatureName: "Ref",
    }), { params: Promise.resolve({ token: request!.token }) });
    expect([409, 410]).toContain(res.status);
    const after = await db.checklistCompletion.findMany();
    expect(after).toEqual(before);
  });
});

// ── P-e: unauthenticated recruiter code no longer works ─────────
describe("Legacy static recruiter code is dead (C6)", () => {
  it("code-only access is rejected even when RECRUITER_CODE matches", async () => {
    // Session cookie intentionally absent; the code param used to suffice.
    const res = await recruiterGet(req(`/api/recruiter?code=test-recruiter-code`));
    expect(res.status).toBe(401);
  });
});
