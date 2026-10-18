import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock (same pattern as phaseBAuthz/phaseCReports) ───
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
import { sha256 } from "@/lib/bts/auth";
import { newToken, sha256Hex, tokenLookups, isTokenHashed } from "@/lib/bts/tokens";
import { POST as checklistSharePost } from "@/app/api/checklist/share/route";
import { GET as refShareGet, POST as refSharePost } from "@/app/api/reference/share/route";
import { POST as invitePost } from "@/app/api/checklist/invite/route";
import { GET as checklistPdfGet } from "@/app/api/checklist/pdf/route";
import { GET as refPdfGet } from "@/app/api/pdf/[requestId]/route";

// ── D4 fixtures: one funded agency, one candidate, one recruiter ─────
const A_EMAIL = "recruiter-d4@phased.local";
const CAND_EMAIL = "cand-d4@phased.local";

let recruiterAId = "";
let sessionAId = "";
let candAccountId = "";
let candSessionId = "";
let completionId = "";
let candidateRowId = "";
let requestId = "";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

beforeAll(async () => {
  const [recA, cand, agency] = await Promise.all([
    db.recruiterAccount.create({ data: { email: A_EMAIL, name: "Recruiter D4", passwordHash: sha256("x"), emailVerified: true, onboardingComplete: true } }),
    db.checklistAccount.create({ data: { email: CAND_EMAIL, name: "Cand D4", passwordHash: sha256("x"), emailVerified: true } }),
    db.agency.create({ data: { name: "PhaseD", slug: `phased-${Date.now()}` } }),
  ]);
  recruiterAId = recA.id;
  candAccountId = cand.id;
  await db.creditLedger.create({ data: { agencyId: agency.id, delta: 50, balanceAfter: 50, reason: "test" } });

  sessionAId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  candSessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await Promise.all([
    db.recruiterSession.create({ data: { id: sha256(sessionAId), accountId: recruiterAId, expiresAt: new Date(Date.now() + 86400_000) } }),
    db.checklistSession.create({ data: { id: sha256(candSessionId), accountId: candAccountId, expiresAt: new Date(Date.now() + 86400_000) } }),
  ]);

  const completion = await db.checklistCompletion.create({
    data: {
      accountId: candAccountId, profession: "Nursing", jobTitle: "RN", specialty: "ICU", specialtyLabel: "ICU",
      answers: JSON.stringify([{ category: "Clinical", skill: "IV placement", questionType: "rating_1_4", value: 3, na: false, highRisk: false, lastPerformed: "6" }]),
      completedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });
  completionId = completion.id;

  const candidate = await db.candidate.create({
    data: {
      // same email as the checklist account — the share routes resolve the
      // owning candidate profile by the signed-in account's email
      agencyId: agency.id, fullName: "Ref Cand D4", email: CAND_EMAIL, role: "RN", specialty: "ICU",
      consentSignature: "sig", consentSignedAt: new Date(),
      requests: {
        create: {
          token: crypto.randomUUID().replaceAll("-", ""), refName: "Ref D4", refTitle: "Charge",
          refEmail: "ref1@phased.local", refPhone: "5551234", facilityName: "General",
          relationship: "Supervisor", status: "COMPLETED", completedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400_000),
          response: { create: { answers: "[]", signatureName: "Ref D4", signedAt: new Date(), identityMethod: "SKIPPED", overallRating: 4 } },
        },
      },
    },
    include: { requests: true },
  });
  candidateRowId = candidate.id;
  requestId = candidate.requests[0].id;
});

function useCandidate() {
  CANDIDATE_COOKIE = candSessionId;
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

// ── pure helpers ─────────────────────────────────────────────────────
describe("D4 helpers — sha256Hex / tokenLookups / isTokenHashed (pure)", () => {
  it("sha256Hex is the hex SHA-256 digest", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("tokenLookups puts the digest first, raw second; empty input stays empty", () => {
    const raw = newToken();
    const set = tokenLookups(raw);
    expect(set).toEqual([sha256Hex(raw), raw]);
    expect(tokenLookups("")).toEqual([]);
    expect(tokenLookups("  ")).toEqual([]);
  });

  it("isTokenHashed recognizes 64-hex digests only", () => {
    expect(isTokenHashed(sha256Hex(newToken()))).toBe(true);
    expect(isTokenHashed(newToken())).toBe(false); // 32-char base64url
    expect(isTokenHashed("cuidstylevalue")).toBe(false);
    expect(isTokenHashed("")).toBe(false);
  });
});

// ── checklist share links ────────────────────────────────────────────
describe("D4 — ChecklistShareLink hashed at rest + shown once", () => {
  it("create returns the raw token exactly once and stores only its digest", async () => {
    useCandidate();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", {
      completionId, accessType: "DURATION", durationDays: 7, audience: "ANYONE",
    }));
    expect(res.status).toBe(200);
    const raw = (await res.json()).link.token as string;
    expect(raw).toMatch(/^[A-Za-z0-9_-]{32}$/); // base64url, 192-bit
    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { token: sha256Hex(raw) } });
    expect(row.token).not.toBe(raw); // raw never lands in the database
    expect(row.completionId).toBe(completionId);
  });

  it("resolve by the raw token finds the hashed row (digest-first lookup)", async () => {
    useCandidate();
    const created = await checklistSharePost(jsonReq("/api/checklist/share", {
      completionId, accessType: "DURATION", durationDays: 7, audience: "ANYONE",
    }));
    const raw = (await created.json()).link.token as string;
    useAnonymous();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: raw }));
    expect(res.status).toBe(200);
    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { token: sha256Hex(raw) } });
    expect(row.viewCount).toBe(1);
  });

  it("legacy raw rows still resolve AND are lazily upgraded to digest-only", async () => {
    const legacyRaw = newToken();
    const seeded = await db.checklistShareLink.create({
      data: { token: legacyRaw, completionId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    expect(isTokenHashed(seeded.token)).toBe(false);
    useAnonymous();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: legacyRaw }));
    expect(res.status).toBe(200);
    const upgraded = await db.checklistShareLink.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(upgraded.token).toBe(sha256Hex(legacyRaw)); // raw is GONE from the row
    // The same URL keeps working after the upgrade (digest branch).
    const again = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: legacyRaw }));
    expect(again.status).toBe(200);
  });

  it("one-time hashed links still consume exactly once", async () => {
    useCandidate();
    const created = await checklistSharePost(jsonReq("/api/checklist/share", {
      completionId, accessType: "ONE_TIME", audience: "ANYONE",
    }));
    const raw = (await created.json()).link.token as string;
    useAnonymous();
    const first = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: raw }));
    expect((await first.json()).link.justConsumed).toBe(true);
    const second = await checklistSharePost(jsonReq("/api/checklist/share", { action: "resolve", token: raw }));
    expect(second.status).toBe(403);
    expect((await second.json()).reason).toBe("used");
  });

  it("listMine never carries a token field; hashed rows get linkUrl null, legacy keep theirs", async () => {
    const legacyRaw = newToken();
    await db.checklistShareLink.create({
      data: { token: legacyRaw, completionId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    useCandidate();
    const res = await checklistSharePost(jsonReq("/api/checklist/share", { action: "listMine" }));
    const d = await res.json();
    expect(d.ok).toBe(true);
    for (const l of [...d.checklistLinks, ...d.refLinks]) {
      expect("token" in l).toBe(false); // neither raw nor digest ever leaves
    }
    const legacyRow = d.checklistLinks.find((l: { linkUrl: string | null }) => l.linkUrl === `/?s=${legacyRaw}`);
    expect(legacyRow).toBeTruthy();
    const hashedRows = d.checklistLinks.filter((l: { linkUrl: string | null }) => l.linkUrl === null);
    expect(hashedRows.length).toBeGreaterThan(0); // the links created above
  });

  it("revoke and extend work by id on hashed rows", async () => {
    useCandidate();
    const created = await checklistSharePost(jsonReq("/api/checklist/share", {
      completionId, accessType: "DURATION", durationDays: 7, audience: "ANYONE",
    }));
    const raw = (await created.json()).link.token as string;
    const row = await db.checklistShareLink.findUniqueOrThrow({ where: { token: sha256Hex(raw) } });

    const ext = await checklistSharePost(jsonReq("/api/checklist/share", { action: "extend", id: row.id, days: 7 }));
    expect(ext.status).toBe(200);
    const after = await db.checklistShareLink.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.durationDays).toBe(14);

    const rev = await checklistSharePost(jsonReq("/api/checklist/share", { action: "revoke", id: row.id }));
    expect(rev.status).toBe(200);
    const revoked = await db.checklistShareLink.findUniqueOrThrow({ where: { id: row.id } });
    expect(revoked.revoked).toBe(true);
  });
});

// ── reference share links ────────────────────────────────────────────
describe("D4 — ReferenceShareLink hashed at rest + shown once", () => {
  it("create returns the raw once, stores the digest; resolve + PDF work by raw", async () => {
    useCandidate();
    const created = await refSharePost(jsonReq("/api/reference/share", {
      requestId, accessType: "DURATION", durationDays: 7, audience: "ANYONE",
    }));
    expect(created.status).toBe(200);
    const raw = (await created.json()).link.token as string;
    expect(raw).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const row = await db.referenceShareLink.findUniqueOrThrow({ where: { token: sha256Hex(raw) } });
    expect(row.token).not.toBe(raw);

    useAnonymous();
    const resolved = await refSharePost(jsonReq("/api/reference/share", { action: "resolve", token: raw }));
    expect(resolved.status).toBe(200);

    const pdf = await refPdfGet(getReq(`/api/pdf/${requestId}?share=${raw}`), { params: Promise.resolve({ requestId }) });
    expect(pdf.status).toBe(200);
  });

  it("GET ledger never carries a token field; hashed rows get linkUrl null, legacy keep theirs", async () => {
    const legacyRaw = newToken();
    await db.referenceShareLink.create({
      data: { token: legacyRaw, requestId, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 86400_000) },
    });
    useCandidate();
    const res = await refShareGet(getReq("/api/reference/share"));
    expect(res.status).toBe(200);
    const d = await res.json();
    for (const l of d.links) {
      expect("token" in l).toBe(false);
      expect(l.linkUrl === null || typeof l.linkUrl === "string").toBe(true);
    }
    expect(d.links.some((l: { linkUrl: string | null }) => l.linkUrl === `/?rs=${legacyRaw}`)).toBe(true);
    expect(d.links.some((l: { linkUrl: string | null }) => l.linkUrl === null)).toBe(true);
  });
});

// ── checklist invites ────────────────────────────────────────────────
describe("D4 — ChecklistInvite hashed at rest + delivered once", () => {
  it("send delivers the raw claim URL once (response), stores only the digest; claim works by raw", async () => {
    useRecruiterA();
    const send = await invitePost(jsonReq("/api/checklist/invite", {
      action: "send", candidateName: "D4 Cand", candidateEmail: "newd4@phased.local",
      candidatePhone: "5551234567", profession: "Nursing", jobTitle: "RN", specialty: "ICU",
    }));
    expect(send.status).toBe(200);
    const d = await send.json();
    expect(d.ok).toBe(true);
    const claimUrl: string | null = d.invite.claimUrl;
    expect(claimUrl).toContain("/?view=checklist&invite=");
    // EMAIL-LINK HOST GATE (prod incident 2026-10-18): the claim URL must be
    // ABSOLUTE. A relative link 404s inside email clients and breaks Brevo's
    // click-tracking redirect ("invalid URL: host missing").
    expect(claimUrl!.startsWith("http://localhost:3000/?view=checklist&invite=")).toBe(true);
    const raw = claimUrl!.split("invite=")[1];
    expect(raw).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const row = await db.checklistInvite.findUniqueOrThrow({ where: { token: sha256Hex(raw) } });
    expect(row.token).not.toBe(raw);
    expect(row.recruiterAccountId).toBe(recruiterAId);

    // The email HTML the provider receives (Brevo tracker source) must carry
    // the host. The persisted log copy is token-scrubbed (SEC-17), so assert
    // on the host portion, which survives scrubbing.
    const mail = await db.notificationLog.findFirst({ where: { templateKey: "checklist_invite" }, orderBy: { createdAt: "desc" } });
    expect(mail).toBeTruthy();
    expect(mail!.html).toContain("http://localhost:3000");

    // claim by the raw token (digest-first lookup)
    useCandidate();
    const claim = await invitePost(jsonReq("/api/checklist/invite", { action: "claim", token: raw }));
    expect(claim.status).toBe(200);
  });

  it("preview resolves hashed invites by raw; list hides claimUrl for hashed rows", async () => {
    // hashed unclaimed invite owned by recruiter A
    const raw = newToken();
    await db.checklistInvite.create({
      data: {
        token: sha256Hex(raw), candidateName: "Hashed", candidateEmail: "hashed-d4@phased.local",
        candidatePhone: "5551234567", profession: "Nursing", jobTitle: "RN", specialty: "ICU",
        recruiterName: "Recruiter D4", status: "SENT", recruiterAccountId: recruiterAId,
      },
    });
    useAnonymous();
    const preview = await invitePost(jsonReq("/api/checklist/invite", { action: "preview", token: raw }));
    expect(preview.status).toBe(200);
    expect((await preview.json()).invite.candidateName).toBe("Hashed");

    useRecruiterA();
    const list = await invitePost(jsonReq("/api/checklist/invite", { action: "list" }));
    const d = await list.json();
    expect(d.ok).toBe(true);
    const hashed = d.invites.find((i: { candidateEmail: string }) => i.candidateEmail === "hashed-d4@phased.local");
    expect(hashed).toBeTruthy();
    expect(hashed.claimUrl).toBeNull(); // can never re-display a hashed invite
  });
});

// ── checklist PDF via share token ────────────────────────────────────
describe("D4 — checklist share PDF opens a hashed row by raw token", () => {
  it("200 with a raw token whose row stores the digest", async () => {
    useCandidate();
    const created = await checklistSharePost(jsonReq("/api/checklist/share", {
      completionId, accessType: "DURATION", durationDays: 7, audience: "ANYONE",
    }));
    const raw = (await created.json()).link.token as string;
    useAnonymous();
    const res = await checklistPdfGet(getReq(`/api/checklist/pdf?share=${raw}`));
    expect(res.status).toBe(200);
  });
});
