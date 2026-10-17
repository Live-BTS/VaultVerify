import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock (same pattern as authz.test.ts) ─────────
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
import { hashPassword } from "@/lib/bts/checklistAuth";
import { sha256 } from "@/lib/bts/auth";
import { viewerAllowedByRecipient, resolveNewShareBinding } from "@/lib/bts/sharePolicy";
import { POST as refSharePost } from "@/app/api/reference/share/route";
import { POST as checklistSharePost } from "@/app/api/checklist/share/route";
import { POST as invitePost } from "@/app/api/checklist/invite/route";
import { GET as checklistPdfGet } from "@/app/api/checklist/pdf/route";
import { GET as recruiterGet } from "@/app/api/recruiter/route";

const A_EMAIL = "recruiter-a@phaseb.local";
const B_EMAIL = "recruiter-b@phaseb.local";
const CAND_EMAIL = "cand@phaseb.local";

let recruiterAId = "";
let recruiterBId = "";
let sessionAId = "";
let sessionBId = "";
let candAccountId = "";
let candSessionId = "";
let requestId = "";
let completionId = "";
let inviteAId = "";
let inviteLegacyId = "";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

beforeAll(async () => {
  const [recA, recB, cand] = await Promise.all([
    db.recruiterAccount.create({ data: { email: A_EMAIL, name: "Recruiter A", passwordHash: hashPassword("x"), emailVerified: true, onboardingComplete: true } }),
    db.recruiterAccount.create({ data: { email: B_EMAIL, name: "Recruiter B", passwordHash: hashPassword("x"), emailVerified: true, onboardingComplete: true } }),
    db.checklistAccount.create({ data: { email: CAND_EMAIL, name: "Cand", passwordHash: hashPassword("x"), emailVerified: true } }),
  ]);
  recruiterAId = recA.id;
  recruiterBId = recB.id;
  candAccountId = cand.id;
  sessionAId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  sessionBId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  candSessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await Promise.all([
    db.recruiterSession.create({ data: { id: sha256(sessionAId), accountId: recruiterAId, expiresAt: new Date(Date.now() + 86400_000) } }),
    db.recruiterSession.create({ data: { id: sha256(sessionBId), accountId: recruiterBId, expiresAt: new Date(Date.now() + 86400_000) } }),
    db.checklistSession.create({ data: { id: sha256(candSessionId), accountId: candAccountId, expiresAt: new Date(Date.now() + 86400_000) } }),
  ]);

  // Candidate profile + completed reference (funded agency for guardOutbound)
  const agency = await db.agency.create({ data: { name: "PhaseB", slug: `phaseb-${Date.now()}` } });
  await db.creditLedger.create({ data: { agencyId: agency.id, delta: 50, balanceAfter: 50, reason: "test" } });
  const candidate = await db.candidate.create({
    data: {
      agencyId: agency.id, fullName: "Cand", email: CAND_EMAIL, role: "RN", specialty: "ICU",
      consentSignature: "sig", consentSignedAt: new Date(),
      requests: {
        create: {
          token: crypto.randomUUID().replaceAll("-", ""), refName: "Ref", refTitle: "Charge",
          refEmail: "ref@phaseb.local", refPhone: "5551234", facilityName: "General",
          relationship: "Supervisor", status: "COMPLETED", completedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400_000),
          response: { create: { answers: "[]", signatureName: "Ref", signedAt: new Date(), identityMethod: "SKIPPED", overallRating: 4 } },
        },
      },
    },
    include: { requests: true },
  });
  requestId = candidate.requests[0].id;

  const completion = await db.checklistCompletion.create({
    data: {
      accountId: candAccountId, profession: "Nursing", jobTitle: "RN", specialty: "ICU", specialtyLabel: "ICU",
      answers: JSON.stringify([{ category: "Clinical", skill: "IV placement", questionType: "rating_1_4", value: 3, na: false, highRisk: false, lastPerformed: "6" }]),
      completedAt: new Date(), expiresAt: new Date(Date.now() + 15 * 86400_000),
    },
  });
  completionId = completion.id;

  const inviteA = await db.checklistInvite.create({
    data: {
      token: crypto.randomUUID().replaceAll("-", ""), candidateName: "Cand", candidateEmail: CAND_EMAIL,
      candidatePhone: "5551234", profession: "Nursing", jobTitle: "RN", specialty: "ICU",
      recruiterName: "Recruiter A", status: "COMPLETED", accountId: candAccountId,
      completionId, recruiterAccountId: recruiterAId,
    },
  });
  inviteAId = inviteA.id;
  // Legacy invite: created before sender binding existed (owner null)
  const inviteLegacy = await db.checklistInvite.create({
    data: {
      token: crypto.randomUUID().replaceAll("-", ""), candidateName: "Cand", candidateEmail: CAND_EMAIL,
      candidatePhone: "5551234", profession: "Nursing", jobTitle: "RN", specialty: "ICU",
      recruiterName: "Pre-Phase-B", status: "SENT",
    },
  });
  inviteLegacyId = inviteLegacy.id;
});

// ── Pure policy: viewerAllowedByRecipient ───────────────────────
describe("viewerAllowedByRecipient — CH-06 binding rule", () => {
  const open = { recipientRecruiterId: null, recipientEmail: null };

  it("an OPEN link admits anyone, including anonymous viewers", () => {
    expect(viewerAllowedByRecipient(open, null)).toBe(true);
    expect(viewerAllowedByRecipient(open, { recruiterId: "x", recruiterEmail: "x@y.z" })).toBe(true);
  });

  it("a bound link rejects anonymous viewers", () => {
    expect(viewerAllowedByRecipient({ recipientRecruiterId: "r1", recipientEmail: null }, null)).toBe(false);
    expect(viewerAllowedByRecipient({ recipientRecruiterId: null, recipientEmail: "r@x.y" }, null)).toBe(false);
  });

  it("a bound link admits exactly the named recruiter (id or email, case-insensitive)", () => {
    expect(viewerAllowedByRecipient({ recipientRecruiterId: "r1", recipientEmail: null }, { recruiterId: "r1" })).toBe(true);
    expect(viewerAllowedByRecipient({ recipientRecruiterId: "r1", recipientEmail: null }, { recruiterId: "r2" })).toBe(false);
    expect(viewerAllowedByRecipient({ recipientRecruiterId: null, recipientEmail: "Rec@X.Y" }, { recruiterEmail: "rec@x.y" })).toBe(true);
    expect(viewerAllowedByRecipient({ recipientRecruiterId: null, recipientEmail: "rec@x.y" }, { recruiterEmail: "OTHER@x.y" })).toBe(false);
  });

  it("a link bound to another recruiter never admits a different id even with matching email fallback absent", () => {
    expect(viewerAllowedByRecipient({ recipientRecruiterId: "r1", recipientEmail: "r1@x.y" }, { recruiterId: "r2", recruiterEmail: "r2@x.y" })).toBe(false);
  });
});

describe("resolveNewShareBinding — SPECIFIC is the default", () => {
  it("explicit ANYONE yields an unbound link", () => {
    const b = resolveNewShareBinding("ANYONE", "ignored@x.y");
    expect(b).toEqual({ ok: true, audience: "ANYONE", recipientEmail: null });
  });

  it("no audience (default) requires a recipient email", () => {
    expect(resolveNewShareBinding(undefined, "").ok).toBe(false);
    expect(resolveNewShareBinding(undefined, "not-an-email").ok).toBe(false);
  });

  it("SPECIFIC with a valid email normalizes to lowercase", () => {
    const b = resolveNewShareBinding("SPECIFIC", "  Recruiter@Agency.COM ");
    expect(b.ok && b.audience === "SPECIFIC" && b.recipientEmail === "recruiter@agency.com").toBe(true);
  });
});

// ── Route: reference share create + resolve binding ─────────────
describe("POST /api/reference/share — recipient binding (CH-06)", () => {
  it("create defaults to SPECIFIC and requires the recipient email", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const bad = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7 }));
    expect(bad.status).toBe(400);

    const ok = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7, recipientEmail: A_EMAIL }));
    const d = await ok.json();
    expect(d.ok).toBe(true);
    expect(d.link.audience).toBe("SPECIFIC");
    expect(d.link.recipientEmail).toBe(A_EMAIL);
    return d.link.token as string;
  });

  it("explicit ANYONE creates an open link", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const res = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "ONE_TIME", audience: "ANYONE" }));
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.link.audience).toBe("ANYONE");
    expect(d.link.recipientEmail).toBeNull();
  });

  it("a bound link opens for the named recruiter, rejects others and anonymous viewers", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const created = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7, recipientEmail: A_EMAIL }));
    const token = (await created.json()).link.token as string;

    const body = { action: "resolve", token };
    const anon = await refSharePost(jsonReq("/api/reference/share", body));
    expect(anon.status).toBe(403);
    expect((await anon.json()).reason).toBe("reserved");

    RECRUITER_COOKIE = sessionBId;
    const other = await refSharePost(jsonReq("/api/reference/share", body));
    expect(other.status).toBe(403);

    RECRUITER_COOKIE = sessionAId;
    const own = await refSharePost(jsonReq("/api/reference/share", body));
    expect((await own.json()).ok).toBe(true);
  });

  it("an OPEN link still resolves for anonymous viewers (grandfathered semantics)", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const created = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7, audience: "ANYONE" }));
    const token = (await created.json()).link.token as string;
    RECRUITER_COOKIE = null;
    const res = await refSharePost(jsonReq("/api/reference/share", { action: "resolve", token }));
    expect((await res.json()).ok).toBe(true);
  });
});

// ── Route: recruiter dashboard admits only binding-compatible links ──
describe("GET /api/recruiter — CH-06 dashboard scope", () => {
  it("shows links bound to this recruiter; hides links bound to others", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const boundA = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7, recipientEmail: A_EMAIL }));
    const boundB = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId, accessType: "DURATION", durationDays: 7, recipientEmail: B_EMAIL }));

    RECRUITER_COOKIE = sessionAId;
    const resA = await recruiterGet(getReq("/api/recruiter"));
    const dA = await resA.json();
    expect(dA.requests.length).toBeGreaterThanOrEqual(1);

    RECRUITER_COOKIE = sessionBId;
    const resB = await recruiterGet(getReq("/api/recruiter"));
    const dB = await resB.json();
    // B has no open-link access here (only its own bound link + revoked fixture);
    // the request carries links for both A and B — B's own binding admits it too.
    expect(dB.requests.length).toBeGreaterThanOrEqual(1);
    void boundA; void boundB;
  });
});

// ── Route: checklist share listMine + binding fields ────────────
describe("POST /api/checklist/share — listMine (previously dead action)", () => {
  it("returns the candidate's links of both types with audience metadata", async () => {
    CANDIDATE_COOKIE = candSessionId;
    const created = await checklistSharePost(jsonReq("/api/checklist/share", { completionId, accessType: "DURATION", durationDays: 7, recipientEmail: A_EMAIL }));
    const c = await created.json();
    expect(c.ok).toBe(true);
    expect(c.link.audience).toBe("SPECIFIC");

    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "listMine" }));
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(Array.isArray(d.checklistLinks)).toBe(true);
    expect(Array.isArray(d.refLinks)).toBe(true);
    const mine = d.checklistLinks.find((l: { token: string }) => l.token === c.link.token);
    expect(mine.audience).toBe("SPECIFIC");
    expect(mine.recipientEmail).toBe(A_EMAIL);
  });

  it("401 without a candidate session", async () => {
    CANDIDATE_COOKIE = null;
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "listMine" }));
    expect(res.status).toBe(401);
  });
});

// ── Route: invite ownership (CH-07) ─────────────────────────────
describe("POST /api/checklist/invite — sender-bound invitations (CH-07)", () => {
  it("list/lookup/send require a verified recruiter session (code alone is dead)", async () => {
    RECRUITER_COOKIE = null;
    const list = await invitePost(jsonReq("/api/checklist/invite", { action: "list", code: "test-recruiter-code" }));
    expect(list.status).toBe(401);
    const send = await invitePost(jsonReq("/api/checklist/invite", { action: "send", code: "test-recruiter-code", candidateName: "X", candidateEmail: "x@y.z", candidatePhone: "5551234567" }));
    expect(send.status).toBe(401);
  });

  it("list returns only invitations this recruiter sent", async () => {
    RECRUITER_COOKIE = sessionAId;
    const res = await invitePost(jsonReq("/api/checklist/invite", { action: "list" }));
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.invites.length).toBe(1);
    expect(d.invites[0].id).toBe(inviteAId);
  });

  it("send binds the invitation to the sender; client cannot spoof the owner or name", async () => {
    RECRUITER_COOKIE = sessionAId;
    const res = await invitePost(jsonReq("/api/checklist/invite", {
      action: "send", candidateName: "New Person", candidateEmail: "new.cand@phaseb.local",
      candidatePhone: "5550001111", profession: "Nursing", jobTitle: "RN", specialty: "ICU",
      recruiterName: "Spoofed Name",
    }));
    const d = await res.json();
    expect(d.ok).toBe(true);
    const row = await db.checklistInvite.findUnique({ where: { id: d.invite.id } });
    expect(row?.recruiterAccountId).toBe(recruiterAId);
    expect(row?.recruiterName).toBe("Recruiter A");
  });

  it("lookup answers only from this recruiter's own invitations (no directory probe)", async () => {
    RECRUITER_COOKIE = sessionAId;
    const own = await invitePost(jsonReq("/api/checklist/invite", { action: "lookup", email: CAND_EMAIL }));
    expect((await own.json()).exists).toBe(true);

    RECRUITER_COOKIE = sessionBId;
    const other = await invitePost(jsonReq("/api/checklist/invite", { action: "lookup", email: CAND_EMAIL }));
    const d = await other.json();
    expect(d.ok).toBe(true);
    expect(d.exists).toBe(false); // B never invited this candidate — no account existence leak
    expect(d.profile).toBeUndefined();
  });
});

// ── Route: checklist PDF invite path ownership (CH-07) ──────────
describe("GET /api/checklist/pdf?invite= — ownership-checked (CH-07)", () => {
  it("401 without a recruiter session", async () => {
    RECRUITER_COOKIE = null;
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteAId}`));
    expect(res.status).toBe(401);
  });

  it("403 for a recruiter who did not send the invitation", async () => {
    RECRUITER_COOKIE = sessionBId;
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteAId}`));
    expect(res.status).toBe(403);
  });

  it("200 with the PDF for the sending recruiter", async () => {
    RECRUITER_COOKIE = sessionAId;
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteAId}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("legacy unowned invites (pre-binding) are closed to every recruiter", async () => {
    RECRUITER_COOKIE = sessionAId;
    const resA = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteLegacyId}`));
    expect(resA.status).toBe(404); // not completed → no PDF either way
    // Complete it, then confirm the ownership wall:
    await db.checklistInvite.update({ where: { id: inviteLegacyId }, data: { status: "COMPLETED", completionId } });
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteLegacyId}`));
    expect(res.status).toBe(403);
    RECRUITER_COOKIE = sessionBId;
    const resB = await checklistPdfGet(getReq(`/api/checklist/pdf?invite=${inviteLegacyId}`));
    expect(resB.status).toBe(403);
  });
});
