import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock (same pattern as phaseBAuthz.test.ts) ─────────
let RECRUITER_COOKIE: string | null = null;
let CANDIDATE_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && CANDIDATE_COOKIE ? { value: CANDIDATE_COOKIE }
      : name === "vv_rc" && RECRUITER_COOKIE ? { value: RECRUITER_COOKIE }
      : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isWithinSaveWindow, evaluateCompanionRead, SHARE_SAVE_WINDOW_MINUTES } from "@/lib/bts/sharePolicy";
import { POST as checklistSharePost } from "@/app/api/checklist/share/route";
import { POST as refSharePost } from "@/app/api/reference/share/route";
import { POST as completePost } from "@/app/api/checklist/complete/route";
import { GET as checklistAnswersGet } from "@/app/api/checklist/share/answers/route";
import { GET as checklistPdfGet } from "@/app/api/checklist/pdf/route";
import { GET as refPdfGet } from "@/app/api/pdf/[requestId]/route";

// ── CH-08 fixtures: one account, one completion, one-time + duration links ──
let candId = "";
let candSessionId = "";
// CH-09: an explicitly UNVERIFIED account proves the email-verification gates
let cand2Id = "";
let cand2SessionId = "";
let completionId = "";
let recruiterAId = "";
let sessionAId = "";
let agencyId = "";
let candidateRowId = "";
let requestId = "";

const NOW = () => new Date();

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

beforeAll(async () => {
  const cand = await db.checklistAccount.create({
    data: { email: "cand@phasec.local", name: "Cand C", passwordHash: "x", emailVerified: true },
  });
  candId = cand.id;

  const recruiterA = await db.recruiterAccount.create({
    data: { email: "rec-a@phasec.local", name: "Recruiter A", passwordHash: "x", emailVerified: true, onboardingComplete: true },
  });
  recruiterAId = recruiterA.id;

  const completion = await db.checklistCompletion.create({
    data: {
      accountId: candId,
      profession: "Nursing",
      jobTitle: "RN",
      specialty: "ICU",
      specialtyLabel: "ICU",
      answers: JSON.stringify([{ category: "Clinical", skill: "Airway management", questionType: "rating_1_4", value: 3, na: false, highRisk: false, lastPerformed: "3" }]),
      additional: "[]",
      attestation: "",
      completedAt: NOW(),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });
  completionId = completion.id;

  // real session rows — the mock cookie value IS the session id
  candSessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({
    data: { id: candSessionId, accountId: candId, expiresAt: new Date(Date.now() + 86400_000) },
  });
  const cand2 = await db.checklistAccount.create({
    data: { email: "cand2-unverified@phasec.local", name: "Cand Unverified", passwordHash: "x", emailVerified: false },
  });
  cand2Id = cand2.id;
  cand2SessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({
    data: { id: cand2SessionId, accountId: cand2Id, expiresAt: new Date(Date.now() + 86400_000) },
  });
  sessionAId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.recruiterSession.create({
    data: { id: sessionAId, accountId: recruiterAId, expiresAt: new Date(Date.now() + 86400_000) },
  });

  // Reference-side fixtures (agency → candidate → request → response)
  const agency = await db.agency.create({ data: { name: "A", slug: `phasec-${Date.now()}` } });
  agencyId = agency.id;
  const candidate = await db.candidate.create({
    data: { agencyId, fullName: "Ref Cand", email: "refcand@phasec.local", role: "RN", specialty: "ICU" },
  });
  candidateRowId = candidate.id;
  const request = await db.referenceRequest.create({
    data: {
      candidateId: candidate.id,
      refName: "Ref One",
      refTitle: "Charge Nurse",
      refEmail: "ref1@phasec.local",
      facilityName: "General Hospital",
      token: `crq_${crypto.randomUUID().replaceAll("-", "")}`,
      status: "COMPLETED",
      completedAt: NOW(),
      expiresAt: new Date(Date.now() + 86400_000),
      response: {
        create: { signatureName: "Ref One", signedAt: NOW(), answers: "[]", overallRating: 4.5 },
      },
    },
  });
  requestId = request.id;
});

function useCandidate() {
  CANDIDATE_COOKIE = candSessionId;
  RECRUITER_COOKIE = null;
}
function useUnverifiedCandidate() {
  CANDIDATE_COOKIE = cand2SessionId;
  RECRUITER_COOKIE = null;
}
function useRecruiterA() {
  RECRUITER_COOKIE = sessionAId;
  CANDIDATE_COOKIE = null;
}
function useAnonymous() {
  RECRUITER_COOKIE = null;
  CANDIDATE_COOKIE = null;
}

async function makeChecklistLink(accessType: "ONE_TIME" | "DURATION", opts?: { audience?: "ANYONE" | "SPECIFIC"; recipientEmail?: string }) {
  useCandidate(); // the candidate creates their own share links
  const res = await checklistSharePost(jsonReq("/api/checklist/share", {
    action: "create",
    completionId,
    accessType,
    ...(accessType === "DURATION" ? { durationDays: 7 } : {}),
    audience: opts?.audience ?? "ANYONE",
    recipientEmail: opts?.recipientEmail,
  }));
  const body = await res.json();
  expect(res.status).toBe(200);
  return db.checklistShareLink.findUniqueOrThrow({ where: { token: body.link.token } });
}

describe("CH-08 policy — save window (pure)", () => {
  it("no consumption timestamp → no window", () => {
    expect(isWithinSaveWindow(null)).toBe(false);
  });

  it("fresh consumption is inside the window", () => {
    const t = new Date();
    expect(isWithinSaveWindow(new Date(t.getTime() - 1000), t)).toBe(true);
  });

  it("exactly SHARE_SAVE_WINDOW_MINUTES old is still inside (inclusive)", () => {
    const t = new Date();
    expect(isWithinSaveWindow(new Date(t.getTime() - SHARE_SAVE_WINDOW_MINUTES * 60_000), t)).toBe(true);
  });

  it("one ms past the window is outside", () => {
    const t = new Date();
    expect(isWithinSaveWindow(new Date(t.getTime() - (SHARE_SAVE_WINDOW_MINUTES * 60_000 + 1)), t)).toBe(false);
  });

  it("evaluateCompanionRead: consumed one-time inside window reads, outside window 403 used", () => {
    const link = { revoked: false, accessType: "ONE_TIME", expiresAt: null, recipientRecruiterId: null, recipientEmail: null };
    const completion = { expiresAt: new Date(Date.now() + 86400_000) };
    const fresh = new Date();
    expect(evaluateCompanionRead({ ...link, viewedAt: new Date(fresh.getTime() - 60_000) }, completion, fresh).ok).toBe(true);
    const stale = evaluateCompanionRead({ ...link, viewedAt: new Date(fresh.getTime() - (SHARE_SAVE_WINDOW_MINUTES * 60_000 + 5)) }, completion, fresh);
    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe("used");
  });

  it("evaluateCompanionRead: revoked wins even inside the window", () => {
    const d = evaluateCompanionRead(
      { revoked: true, accessType: "ONE_TIME", viewedAt: new Date(), expiresAt: null, recipientRecruiterId: null, recipientEmail: null },
      { expiresAt: new Date(Date.now() + 86400_000) },
    );
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("invalid");
  });
});

describe("CH-08 resolve — atomic one-time consumption", () => {
  it("parallel opens of one ONE_TIME link: exactly one consumer wins", async () => {
    const link = await makeChecklistLink("ONE_TIME");
    useAnonymous();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: link.token }))),
    );
    const bodies = await Promise.all(attempts.map((r) => r.json()));
    const wins = bodies.filter((b) => b.ok === true && b.link?.justConsumed === true);
    const losses = bodies.filter((b) => b.ok === false && b.reason === "used");
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(4);

    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.viewedAt).not.toBeNull();
    expect(row.viewCount).toBe(1);
  });

  it("a consumed link beyond the save window is rejected by resolve", async () => {
    const link = await makeChecklistLink("ONE_TIME");
    await db.checklistShareLink.update({
      where: { id: link.id },
      data: { viewedAt: new Date(Date.now() - (SHARE_SAVE_WINDOW_MINUTES * 60_000 + 60_000)) },
    });
    useAnonymous();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: link.token }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("used");
  });

  it("DURATION links never burn: repeated resolves keep working and count views", async () => {
    const link = await makeChecklistLink("DURATION");
    useAnonymous();
    for (let i = 1; i <= 2; i++) {
      const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: link.token }));
      expect(res.status).toBe(200);
      expect((await res.json()).link.justConsumed).toBe(false);
    }
    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.viewCount).toBe(2);
  });

  it("regression: answers load right after resolve consumed the one-time link (save window)", async () => {
    const link = await makeChecklistLink("ONE_TIME");
    useAnonymous();
    const res1 = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: link.token }));
    expect(res1.status).toBe(200); // consumed here
    const res2 = await checklistAnswersGet(getReq(`/api/checklist/share/answers?token=${link.token}`));
    expect(res2.status).toBe(200); // the just-delivered view can still load its answers
    const body = await res2.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.answers)).toBe(true);
  });
});

describe("CH-08 checklist PDF (?share=) — same policy, deliver-once", () => {
  it("fresh ONE_TIME link: the download itself consumes it and returns a PDF", async () => {
    const link = await makeChecklistLink("ONE_TIME");
    useAnonymous();
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${link.token}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.viewedAt).not.toBeNull();
    // SEC-04/05: the share-PDF download is audited
    const audit = await db.auditEvent.findFirst({ where: { action: "SHARE_PDF_DOWNLOADED", entityId: link.id } });
    expect(audit).not.toBeNull();
  });

  it("second download inside the save window still works; beyond it is 403 used", async () => {
    const link = await makeChecklistLink("ONE_TIME");
    await db.checklistShareLink.update({ where: { id: link.id }, data: { viewedAt: new Date() } });
    useAnonymous();
    const ok = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${link.token}`));
    expect(ok.status).toBe(200);
    await db.checklistShareLink.update({
      where: { id: link.id },
      data: { viewedAt: new Date(Date.now() - (SHARE_SAVE_WINDOW_MINUTES * 60_000 + 60_000)) },
    });
    const late = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${link.token}`));
    expect(late.status).toBe(403);
    expect(await late.text()).toBe("This link was already used");
  });

  it("revoked / report-expired links are rejected", async () => {
    const revoked = await makeChecklistLink("DURATION");
    await db.checklistShareLink.update({ where: { id: revoked.id }, data: { revoked: true } });
    const r1 = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${revoked.token}`));
    expect(r1.status).toBe(404);

    const dead = await makeChecklistLink("DURATION");
    await db.checklistCompletion.update({ where: { id: completionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r2 = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${dead.token}`));
    expect(r2.status).toBe(403);
    await db.checklistCompletion.update({ where: { id: completionId }, data: { expiresAt: new Date(Date.now() + 30 * 86400_000) } });
  });

  it("CH-06 on the PDF path: a bound link is reserved for its named recruiter", async () => {
    const bound = await makeChecklistLink("DURATION", { audience: "SPECIFIC", recipientEmail: "rec-a@phasec.local" });
    useAnonymous();
    const anon = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${bound.token}`));
    expect(anon.status).toBe(403);
    expect(await anon.text()).toContain("reserved");

    useRecruiterA();
    const mine = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${bound.token}`));
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("application/pdf");
  });
});

describe("CH-08 reference PDF (?share=) — same policy, deliver-once", () => {
  async function makeRefLink(accessType: "ONE_TIME" | "DURATION", opts?: { audience?: "ANYONE" | "SPECIFIC"; recipientEmail?: string; revoked?: boolean }) {
    return db.referenceShareLink.create({
      data: {
        token: `rs_${crypto.randomUUID().replaceAll("-", "")}`,
        requestId,
        accessType,
        durationDays: accessType === "DURATION" ? 7 : null,
        expiresAt: accessType === "DURATION" ? new Date(Date.now() + 7 * 86400_000) : null,
        recipientRecruiterId: null,
        recipientEmail: null,
        ...(opts?.audience === "SPECIFIC" && opts?.recipientEmail ? { recipientEmail: opts.recipientEmail } : {}),
        ...(opts?.revoked ? { revoked: true } : {}),
      },
    });
  }

  const pdfUrl = (token: string) => `/api/pdf/${requestId}?share=${token}`;
  const pdfCall = (token: string) => refPdfGet(getReq(pdfUrl(token)), { params: Promise.resolve({ requestId }) });

  it("DURATION link downloads for anyone (OPEN binding)", async () => {
    const link = await makeRefLink("DURATION");
    useAnonymous();
    const res = await pdfCall(link.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("ONE_TIME link: first download consumes atomically, window keeps saving, then 403", async () => {
    const link = await makeRefLink("ONE_TIME");
    useAnonymous();
    const first = await pdfCall(link.token);
    expect(first.status).toBe(200);
    const row = await db.referenceShareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.viewedAt).not.toBeNull();

    const second = await pdfCall(link.token);
    expect(second.status).toBe(200); // inside the save window

    await db.referenceShareLink.update({
      where: { id: link.id },
      data: { viewedAt: new Date(Date.now() - (SHARE_SAVE_WINDOW_MINUTES * 60_000 + 60_000)) },
    });
    const late = await pdfCall(link.token);
    expect(late.status).toBe(403);
    expect((await late.json()).error).toBe("This link was already used");
  });

  it("CH-06 on the reference PDF path: bound link reserved; named recruiter passes", async () => {
    const bound = await makeRefLink("DURATION", { audience: "SPECIFIC", recipientEmail: "rec-a@phasec.local" });
    useAnonymous();
    const anon = await pdfCall(bound.token);
    expect(anon.status).toBe(403);

    useRecruiterA();
    const mine = await pdfCall(bound.token);
    expect(mine.status).toBe(200);
  });

  it("revoked link → 404", async () => {
    const dead = await makeRefLink("DURATION", { revoked: true });
    useAnonymous();
    const res = await pdfCall(dead.token);
    expect(res.status).toBe(404);
  });
});

// silence unused warnings if a fixture helper changes shape later
void candId; void cand2Id; void agencyId; void candidateRowId;

describe("CH-09 — email verification gates (candidate side)", () => {
  it("checklist completion is blocked for an unverified account — before any validation", async () => {
    useUnverifiedCandidate();
    const res = await completePost(jsonReq("/api/checklist/complete", {}));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.needsVerification).toBe(true);
  });

  it("a verified account passes the gate (reaches spec validation, fails only on missing invite/request)", async () => {
    useCandidate();
    const res = await completePost(jsonReq("/api/checklist/complete", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Specify an invite or an approved request");
  });

  it("sharing (create) is blocked for an unverified account", async () => {
    useUnverifiedCandidate();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "create", completionId, accessType: "DURATION", durationDays: 7, audience: "ANYONE" }));
    expect(res.status).toBe(403);
    expect((await res.json()).needsVerification).toBe(true);
  });

  it("extending a link is blocked for an unverified account", async () => {
    useUnverifiedCandidate();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "extend", token: "whatever", days: 7 }));
    expect(res.status).toBe(403);
  });

  it("revoking stays OPEN for an unverified account (reducing access never waits)", async () => {
    useUnverifiedCandidate();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "revoke", token: "no-such-token" }));
    expect(res.status).toBe(404); // past the gate — ownership lookup answered
  });

  it("reference share create is blocked for an unverified account", async () => {
    useUnverifiedCandidate();
    const res = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId: "whatever", accessType: "DURATION", durationDays: 7 }));
    expect(res.status).toBe(403);
    expect((await res.json()).needsVerification).toBe(true);
  });
});
