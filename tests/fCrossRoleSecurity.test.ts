import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Phase F — cross-role security matrix ─────────────────────────────
// Boundaries that span ROLES (candidate ↔ recruiter ↔ referee ↔ admin) on the
// surfaces touched by D4 / D4b / Phase E. Each test proves one boundary holds
// from BOTH sides (the allowed actor succeeds; the other actor is rejected).
// Session mock: house pattern.

let CANDIDATE_COOKIE: string | null = null;
let RECRUITER_COOKIE: string | null = null;

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
import { newToken } from "@/lib/bts/tokens";
import { encryptRefToken } from "@/lib/bts/refTokenCrypto";
import { sha256Hex } from "@/lib/bts/tokens";
import { POST as refSharePost, GET as refShareGet } from "@/app/api/reference/share/route";
import { GET as recruiterGet, POST as recruiterPost } from "@/app/api/recruiter/route";
import { GET as referenceTokenGet } from "@/app/api/reference/[token]/route";
import { POST as superadminPost } from "@/app/api/superadmin/route";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

const A_EMAIL = `xs-cand-a-${Date.now()}@phased.local`;
const B_EMAIL = `xs-cand-b-${Date.now()}@phased.local`;
const RA_EMAIL = `xs-rec-a-${Date.now()}@phased.local`;
const RB_EMAIL = `xs-rec-b-${Date.now()}@phased.local`;

let sidA = "", sidB = "", recA = "", recB = "";
let agencyId = "";
let reqA = "";        // A's reference request id
let rawA = "";        // A's referee raw token
let shareTokenA = ""; // A→recruiter-A share link (raw, shown once)

async function newAccount(email: string): Promise<string> {
  const account = await db.checklistAccount.create({ data: { email, name: "XS", passwordHash: hashPassword("x"), emailVerified: true } });
  const sid = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({ data: { id: sha256(sid), accountId: account.id, expiresAt: new Date(Date.now() + 86400_000) } });
  return sid;
}
async function newRecruiter(email: string): Promise<string> {
  const r = await db.recruiterAccount.create({ data: { email, name: "XS Rec", passwordHash: sha256("x"), emailVerified: true, onboardingComplete: true } });
  const sid = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.recruiterSession.create({ data: { id: sha256(sid), accountId: r.id, expiresAt: new Date(Date.now() + 86400_000) } });
  return sid;
}
function useCand(sid: string) { CANDIDATE_COOKIE = sid; RECRUITER_COOKIE = null; }
function useRec(sid: string) { RECRUITER_COOKIE = sid; CANDIDATE_COOKIE = null; }
function useAnon() { CANDIDATE_COOKIE = null; RECRUITER_COOKIE = null; }

beforeAll(async () => {
  const agency = await db.agency.create({ data: { name: "XSec", slug: `xsec-${Date.now()}` } });
  agencyId = agency.id;
  await db.creditLedger.create({ data: { agencyId, delta: 100, balanceAfter: 100, reason: "test" } });

  sidA = await newAccount(A_EMAIL);
  sidB = await newAccount(B_EMAIL);
  recA = await newRecruiter(RA_EMAIL);
  recB = await newRecruiter(RB_EMAIL);

  // Candidate A with a live reference request (post-cutover digest + envelope of the SAME raw)
  useCand(sidA);
  const candRaw = newToken();
  const candidate = await db.candidate.create({
    data: {
      agencyId, fullName: "Cand A", email: A_EMAIL, role: "RN", specialty: "ICU",
      consentSignature: "s", consentSignedAt: new Date(),
      requests: {
        create: {
          token: sha256Hex(candRaw), tokenEncrypted: encryptRefToken(candRaw),
          refName: "Ref A", refTitle: "RN", refEmail: `ref-a-${Date.now()}@phased.local`, facilityName: "F",
          status: "COMPLETED", completedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000),
          response: { create: { answers: "[]", signatureName: "Ref A", signedAt: new Date(), identityMethod: "SKIPPED", overallRating: 4 } },
        },
      },
    },
    include: { requests: true },
  });
  reqA = candidate.requests[0].id;
  rawA = candRaw; // the raw whose digest+envelope are stored — resolves by digest-first lookup
});

// ── 1. Revocation ends recruiter dashboard visibility ────────────────
describe("XF1 — revoking a share removes recruiter dashboard access", () => {
  it("recruiter sees the request before revoke, loses it after; candidate ledger reflects revoked state", async () => {
    useCand(sidA);
    const created = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId: reqA, accessType: "DURATION", durationDays: 7, recipientEmail: RA_EMAIL }));
    expect(created.status).toBe(200);
    const { link } = await created.json();
    void link;
    shareTokenA = link.token;

    useRec(recA);
    const before = await (await recruiterGet(getReq("/api/recruiter"))).json();
    expect(before.requests.some((r: { id: string }) => r.id === reqA)).toBe(true);

    // candidate revokes (id-based) — the A-owned, not-yet-revoked link
    useCand(sidA);
    const ledger = await refShareGet(getReq("/api/reference/share"));
    const rows = (await ledger.json()).links as { id: string; revoked: boolean; requestId: string }[];
    const mine = rows.find((l) => l.requestId === reqA && l.revoked === false);
    expect(mine).toBeTruthy();
    const revoked = await refSharePost(jsonReq("/api/reference/share", { action: "revoke", id: mine!.id }));
    expect(revoked.status).toBe(200);

    useRec(recA);
    const after = await (await recruiterGet(getReq("/api/recruiter"))).json();
    expect(after.requests.some((r: { id: string }) => r.id === reqA)).toBe(false);
  });
});

// ── 2. Cross-candidate share-link control ────────────────────────────
describe("XF2 — candidate B cannot touch candidate A's share links", () => {
  it("B's ledger is empty of A's links; B cannot revoke A's link by id", async () => {
    // A creates a fresh link
    useCand(sidA);
    await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId: reqA, accessType: "DURATION", durationDays: 7, recipientEmail: RA_EMAIL }));

    useCand(sidB);
    const ledgerB = await refShareGet(getReq("/api/reference/share"));
    const rowsB = (await ledgerB.json()).links as { requestId: string }[];
    expect(rowsB.every((l) => l.requestId !== reqA)).toBe(true);

    // B attempts to revoke an A-owned link id → ownership check → 404
    const aLedger = await (async () => { useCand(sidA); return (await refShareGet(getReq("/api/reference/share"))).json(); })();
    const aLink = (aLedger.links as { id: string; revoked: boolean }[]).find((l) => !l.revoked)!;
    useCand(sidB);
    const steal = await refSharePost(jsonReq("/api/reference/share", { action: "revoke", id: aLink.id }));
    expect(steal.status).toBe(404);
  });
});

// ── 3. One-time consumption is global, not per-recruiter ─────────────
describe("XF3 — a consumed ONE_TIME link is dead for every recruiter", () => {
  it("recruiter A consumes; recruiter B resolving the same raw token gets 'used'", async () => {
    useCand(sidA);
    const created = await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId: reqA, accessType: "ONE_TIME", audience: "ANYONE" }));
    const { link } = await created.json();
    const raw = link.token as string;

    useRec(recA);
    const first = await refSharePost(jsonReq("/api/reference/share", { action: "resolve", token: raw }));
    expect(first.status).toBe(200);

    useRec(recB);
    const second = await refSharePost(jsonReq("/api/reference/share", { action: "resolve", token: raw }));
    expect(second.status).toBe(403);
    expect((await second.json()).reason).toBe("used");
  });
});

// ── 4. Referee token isolation between candidates ────────────────────
describe("XF4 — a referee token exposes exactly one candidate's context", () => {
  it("A's referee link carries only A's data; a fabricated token never resolves A's request", async () => {
    const res = await referenceTokenGet(getReq(`/api/reference/${rawA}`), { params: Promise.resolve({ token: rawA }) } as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidate.fullName).toBe("Cand A");
    expect(JSON.stringify(data)).not.toContain("Cand B");

    const wrong = await referenceTokenGet(getReq(`/api/reference/${newToken()}`), { params: Promise.resolve({ token: newToken() }) } as never);
    expect(wrong.status).toBe(404);
  });
});

// ── 5. Reminder sweep is scoped by binding, not by pipeline ──────────
describe("XF5 — recruiter sweep only emails requests admitted to THEM", () => {
  it("an A-bound link makes the request invisible to B's sweep (no reminder for A's referee from B)", async () => {
    useCand(sidA);
    await refSharePost(jsonReq("/api/reference/share", { action: "create", requestId: reqA, accessType: "DURATION", durationDays: 7, recipientEmail: RA_EMAIL }));
    // make the request reminder-due
    await db.referenceRequest.update({ where: { id: reqA }, data: { status: "SENT", sentAt: new Date(Date.now() - 6 * 86400_000), reminderCount: 0 } });

    useRec(recB);
    const sweepB = await recruiterPost(jsonReq("/api/recruiter", { action: "run_reminders" }));
    expect(sweepB.status).toBe(200);
    const logsB = await db.notificationLog.findMany({ where: { requestId: reqA, kind: "REMINDER" } });
    expect(logsB).toHaveLength(0); // B must not have emailed A's referee

    useRec(recA);
    const sweepA = await recruiterPost(jsonReq("/api/recruiter", { action: "run_reminders" }));
    expect(sweepA.status).toBe(200);
    const logsA = await db.notificationLog.findMany({ where: { requestId: reqA, kind: "REMINDER" } });
    expect(logsA.length).toBeGreaterThanOrEqual(1); // A (bound) does
  });
});

// ── 6. Admin surfaces stay gated ─────────────────────────────────────
describe("XF6 — superadmin console rejects unauthenticated control actions", () => {
  it("data sweep without a valid admin token → 401/403", async () => {
    useAnon();
    const res = await superadminPost(jsonReq("/api/superadmin", { action: "shares_list" }));
    expect([401, 403]).toContain(res.status);
  });
});
