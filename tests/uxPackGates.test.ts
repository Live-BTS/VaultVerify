import { beforeAll, it, expect, describe, vi } from "vitest";

// ── UX pack gates (owner-directed 2026-10-18): checklist engagement + progress ──
// C1: link opens recorded on preview/claim (rate-limited increment)
// C2: draft progress — owner-only writes, completed immutability, size cap,
//     list exposure (draftAnswered), and recruiter dashboard checklistStats.

let RECRUITER_COOKIE: string | null = null;
let OWNER_COOKIE: string | null = null;
let OTHER_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && OWNER_COOKIE ? { value: OWNER_COOKIE }
      : name === "vv_ck" && OTHER_COOKIE ? { value: OTHER_COOKIE }
      : name === "vv_rc" && RECRUITER_COOKIE ? { value: RECRUITER_COOKIE }
      : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/bts/auth";
import { newToken, sha256Hex } from "@/lib/bts/tokens";
import { POST as invitePost } from "@/app/api/checklist/invite/route";
import { GET as recruiterGet } from "@/app/api/recruiter/route";

const R_EMAIL = "recruiter-uxpack@phased.local";
const OWNER_EMAIL = "owner-uxpack@phased.local";
const OTHER_EMAIL = "other-uxpack@phased.local";

let recruiterId = "";
let ownerId = "";
let otherId = "";
let rcSession = "";
let ownerSession = "";
let otherSession = "";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

// invite fixtures created in beforeAll (counts feed the stats assertions)
let iUntouched = "";   // SENT, never opened
let iCompleted = "";   // COMPLETED (owned — for the 409 immutability gate)
let iOpened = "";      // SENT with firstViewedAt seeded
let iClaimed = "";     // SENT, owned by OWNER — progress target
let rawPreview = "";   // unclaimed invite for the preview/open test
let rawClaim = "";     // unclaimed invite for the claim/open test

beforeAll(async () => {
  const [rec, owner, other, agency] = await Promise.all([
    db.recruiterAccount.create({ data: { email: R_EMAIL, name: "UX Recruiter", passwordHash: sha256("x"), emailVerified: true, onboardingComplete: true } }),
    db.checklistAccount.create({ data: { email: OWNER_EMAIL, name: "Owner Cand", passwordHash: sha256("x"), emailVerified: true } }),
    db.checklistAccount.create({ data: { email: OTHER_EMAIL, name: "Other Cand", passwordHash: sha256("x"), emailVerified: true } }),
    db.agency.create({ data: { name: "UXPack", slug: `uxpack-${Date.now()}` } }),
  ]);
  recruiterId = rec.id; ownerId = owner.id; otherId = other.id;
  await db.creditLedger.create({ data: { agencyId: agency.id, delta: 10, balanceAfter: 10, reason: "test" } });

  rcSession = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  ownerSession = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  otherSession = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await Promise.all([
    db.recruiterSession.create({ data: { id: sha256(rcSession), accountId: recruiterId, expiresAt: new Date(Date.now() + 86400_000) } }),
    db.checklistSession.create({ data: { id: sha256(ownerSession), accountId: ownerId, expiresAt: new Date(Date.now() + 86400_000) } }),
    db.checklistSession.create({ data: { id: sha256(otherSession), accountId: otherId, expiresAt: new Date(Date.now() + 86400_000) } }),
  ]);

  const base = { profession: "Nursing", jobTitle: "RN", specialty: "ICU", recruiterName: "UX Recruiter", recruiterAccountId: recruiterId };
  const [untouched, completed, opened, claimed, pv, cl] = await Promise.all([
    db.checklistInvite.create({ data: { ...base, candidateName: "U Touch", candidateEmail: "u1@x.local", candidatePhone: "5551234567" } }),
    db.checklistInvite.create({ data: { ...base, candidateName: "C Done", candidateEmail: "c1@x.local", candidatePhone: "5551234567", status: "COMPLETED", accountId: ownerId } }),
    db.checklistInvite.create({ data: { ...base, candidateName: "O Pen", candidateEmail: "o1@x.local", candidatePhone: "5551234567", firstViewedAt: new Date(Date.now() - 3600_000), lastViewedAt: new Date(Date.now() - 3600_000), viewCount: 1 } }),
    db.checklistInvite.create({ data: { ...base, candidateName: "L Aimed", candidateEmail: "l1@x.local", candidatePhone: "5551234567", accountId: ownerId } }),
    (async () => { const raw = newToken(); await db.checklistInvite.create({ data: { ...base, candidateName: "P Rev", candidateEmail: "p1@x.local", candidatePhone: "5551234567", token: sha256Hex(raw) } }); return raw; })(),
    (async () => { const raw = newToken(); await db.checklistInvite.create({ data: { ...base, candidateName: "K Laim", candidateEmail: "k1@x.local", candidatePhone: "5551234567", token: sha256Hex(raw) } }); return raw; })(),
  ]);
  iUntouched = untouched.id; iCompleted = completed.id; iOpened = opened.id; iClaimed = claimed.id;
  rawPreview = pv; rawClaim = cl;
});

function useRecruiter() { RECRUITER_COOKIE = rcSession; OWNER_COOKIE = null; OTHER_COOKIE = null; }
function useOwner() { OWNER_COOKIE = ownerSession; RECRUITER_COOKIE = null; OTHER_COOKIE = null; }
function useOther() { OTHER_COOKIE = otherSession; RECRUITER_COOKIE = null; OWNER_COOKIE = null; }
function useAnon() { RECRUITER_COOKIE = null; OWNER_COOKIE = null; OTHER_COOKIE = null; }

describe("UX pack — recruiter dashboard checklistStats", () => {
  it("GET counts BOTH pipelines: sent/completed/opened/awaiting/rate", async () => {
    useRecruiter();
    const res = await recruiterGet(getReq("/api/recruiter"));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.checklistStats).toBeTruthy();
    // fixtures: 6 invites, 1 COMPLETED, 1 pre-opened → deterministic counts
    expect(d.checklistStats.sent).toBe(6);
    expect(d.checklistStats.completed).toBe(1);
    expect(d.checklistStats.opened).toBe(1);
    expect(d.checklistStats.awaiting).toBe(5);
    expect(d.checklistStats.rate).toBe(17); // round(1/6*100)
  });
});

describe("UX pack — C1 link-open tracking", () => {
  it("preview records firstViewedAt + viewCount, rate-limited to once/minute", async () => {
    useAnon();
    const first = await invitePost(jsonReq("/api/checklist/invite", { action: "preview", token: rawPreview }));
    expect(first.status).toBe(200);
    const row1 = await db.checklistInvite.findUniqueOrThrow({ where: { token: sha256Hex(rawPreview) } });
    expect(row1.firstViewedAt).toBeTruthy();
    expect(row1.viewCount).toBe(1);

    // immediate second open — same minute: lastViewedAt refreshes, count doesn't
    await invitePost(jsonReq("/api/checklist/invite", { action: "preview", token: rawPreview }));
    const row2 = await db.checklistInvite.findUniqueOrThrow({ where: { token: sha256Hex(rawPreview) } });
    expect(row2.viewCount).toBe(1);

    // backdate past the guard window → the next open increments again
    await db.checklistInvite.update({ where: { id: row2.id }, data: { lastViewedAt: new Date(Date.now() - 2 * 60_000) } });
    await invitePost(jsonReq("/api/checklist/invite", { action: "preview", token: rawPreview }));
    const row3 = await db.checklistInvite.findUniqueOrThrow({ where: { token: sha256Hex(rawPreview) } });
    expect(row3.viewCount).toBe(2);
  });

  it("claim by a signed-in candidate records an open too", async () => {
    useOwner();
    const claim = await invitePost(jsonReq("/api/checklist/invite", { action: "claim", token: rawClaim }));
    expect(claim.status).toBe(200);
    const row = await db.checklistInvite.findUniqueOrThrow({ where: { token: sha256Hex(rawClaim) } });
    expect(row.accountId).toBe(ownerId);
    expect(row.firstViewedAt).toBeTruthy();
    expect(row.viewCount).toBe(1);
  });
});

describe("UX pack — C2 draft progress", () => {
  const draft = {
    years: "4",
    answers: {
      "IV Therapy::Peripheral line": { value: 3, na: false, lastPerformed: "2" },
      "Airway::Suctioning": { value: null, na: true, lastPerformed: "na" },
      "Airway::Unfilled row": { value: null, na: false }, // not answered — must not count
    },
  };

  it("rejects anonymous (401) and non-owner candidates (403)", async () => {
    useAnon();
    const anon = await invitePost(jsonReq("/api/checklist/invite", { action: "progress", inviteId: iClaimed, draft }));
    expect(anon.status).toBe(401);

    useOther();
    const other = await invitePost(jsonReq("/api/checklist/invite", { action: "progress", inviteId: iClaimed, draft }));
    expect(other.status).toBe(403);
  });

  it("owner saves the draft; list exposes draftAnswered + engagement fields", async () => {
    useOwner();
    const ok = await invitePost(jsonReq("/api/checklist/invite", { action: "progress", inviteId: iClaimed, draft }));
    expect(ok.status).toBe(200);
    const row = await db.checklistInvite.findUniqueOrThrow({ where: { id: iClaimed } });
    expect(row.draftUpdatedAt).toBeTruthy();
    expect(JSON.parse(row.draftProgress!).answers).toHaveProperty("IV Therapy::Peripheral line");

    useRecruiter();
    const list = await invitePost(jsonReq("/api/checklist/invite", { action: "list" }));
    const d = await list.json();
    const rowDto = d.invites.find((i: { id: string }) => i.id === iClaimed);
    expect(rowDto.draftAnswered).toBe(2); // filled + na count; empty row does not
    expect(rowDto.firstViewedAt).toBeNull();
    expect(rowDto.viewCount).toBe(0);
    expect(rowDto.draftUpdatedAt).toBeTruthy();
  });

  it("completed invites are immutable (409) and oversized drafts are rejected (413)", async () => {
    useOwner();
    const done = await invitePost(jsonReq("/api/checklist/invite", { action: "progress", inviteId: iCompleted, draft }));
    expect(done.status).toBe(409);

    const big = { answers: { filler: "x".repeat(25_000) } };
    const huge = await invitePost(jsonReq("/api/checklist/invite", { action: "progress", inviteId: iClaimed, draft: big }));
    expect(huge.status).toBe(413);
  });
});
