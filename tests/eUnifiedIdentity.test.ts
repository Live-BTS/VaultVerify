import { beforeAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock (house pattern) ──────────────────────────────
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
import { POST as candidatePost, GET as candidateGet } from "@/app/api/candidate/route";
import { GET as refShareGet } from "@/app/api/reference/share/route";
import { POST as checklistSharePost } from "@/app/api/checklist/share/route";
import { unifyAccounts } from "../scripts/e-unify-accounts";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

let agencyId = "";

async function newAccountSession(email: string): Promise<string> {
  const account = await db.checklistAccount.create({
    data: { email, name: "E User", passwordHash: hashPassword("password123"), emailVerified: true },
  });
  const sid = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({ data: { id: sha256(sid), accountId: account.id, expiresAt: new Date(Date.now() + 86400_000) } });
  return sid;
}
function adoptSession(sid: string) { CANDIDATE_COOKIE = sid; RECRUITER_COOKIE = null; }

beforeAll(async () => {
  const agency = await db.agency.create({ data: { name: "PhaseE", slug: `phasee-${Date.now()}` } });
  agencyId = agency.id;
  await db.creditLedger.create({ data: { agencyId, delta: 100, balanceAfter: 100, reason: "test" } });
});

// ── One registration drives both workflows ───────────────────────────
describe("Phase E — unified identity: one login, separate workflow profiles", () => {
  it("signed-in onboarding links the references profile to the account (accountId stamped)", async () => {
    const email = `uni-${Date.now()}@phased.local`;
    const sid = await newAccountSession(email);
    adoptSession(sid);

    const res = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Unified User", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 2, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "R", refTitle: "RN", refEmail: `r-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    expect(res.status).toBe(201);

    const account = await db.checklistAccount.findUnique({ where: { email } });
    const profile = await db.candidate.findFirst({ where: { email } });
    expect(profile!.accountId).toBe(account!.id);
  });

  it("accountId is AUTHORITATIVE: a linked profile resolves even when its own email no longer matches", async () => {
    const email = `auth-${Date.now()}@phased.local`;
    const sid = await newAccountSession(email);
    adoptSession(sid);

    // Profile row carries a DIFFERENT email (e.g. legacy row linked by backfill,
    // or the account email changed) — only the accountId link can find it.
    const otherEmail = `moved-${Date.now()}@phased.local`;
    await db.candidate.create({
      data: {
        agencyId, fullName: "Linked Legacy", email: otherEmail, role: "RN", specialty: "ICU",
        consentSignature: "s", consentSignedAt: new Date(),
        accountId: (await db.checklistAccount.findUnique({ where: { email } }))!.id,
      },
    });

    const res = await candidateGet(getReq(`/api/candidate?email=${email}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidate.fullName).toBe("Linked Legacy");

    // The unified share ledgers also resolve via the link
    const ledger = await refShareGet(getReq("/api/reference/share"));
    expect(ledger.status).toBe(200);
    expect((await ledger.json()).ok).toBe(true);
    const mine = await checklistSharePost(jsonReq("/api/checklist/share", { action: "listMine" }));
    expect(mine.status).toBe(200);
    expect((await mine.json()).ok).toBe(true);
  });

  it("pre-unification legacy rows still resolve by exact email (fallback), and only when unlinked", async () => {
    const email = `legacy-${Date.now()}@phased.local`;
    const sid = await newAccountSession(email);
    adoptSession(sid);

    await db.candidate.create({
      data: {
        agencyId, fullName: "Email Legacy", email, role: "RN", specialty: "ICU",
        consentSignature: "s", consentSignedAt: new Date(),
        // accountId: null — pre-unification row
      },
    });
    const res = await candidateGet(getReq(`/api/candidate?email=${email}`));
    expect(res.status).toBe(200);
    expect((await res.json()).candidate.fullName).toBe("Email Legacy");
  });

  it("cross-role isolation: another account sees no profile and cannot act on someone else's requests", async () => {
    const ownerEmail = `iso-owner-${Date.now()}@phased.local`;
    const attackerEmail = `iso-attacker-${Date.now()}@phased.local`;
    const ownerSid = await newAccountSession(ownerEmail);
    const attackerSid = await newAccountSession(attackerEmail);

    const created = await (async () => {
      adoptSession(ownerSid);
      return candidatePost(jsonReq("/api/candidate", {
        fullName: "Iso Owner", email: ownerEmail, phone: "", role: "RN", specialty: "ICU",
        yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
        references: [{ refName: "R", refTitle: "RN", refEmail: `ir-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
      }));
    })();
    const requestId = (await created.json()).candidate.requests[0].id;

    // attacker session — no profile of their own, and not the owner
    adoptSession(attackerSid);

    const noProfile = await candidateGet(getReq(`/api/candidate?email=${attackerEmail}`));
    expect(noProfile.status).toBe(404);

    const foreign = await candidateGet(getReq(`/api/candidate?email=${ownerEmail}`));
    expect(foreign.status).toBe(403);

    const { POST: actionsPost } = await import("@/app/api/candidate/actions/route");
    const nudge = await actionsPost(jsonReq("/api/candidate/actions", { action: "nudge", requestId }));
    expect(nudge.status).toBe(403);
  });
});

// ── Backfill: link pre-unification rows (idempotent, clash-safe) ─────
describe("Phase E — e-unify-accounts backfill", () => {
  it("links unlinked rows by exact email; repeats are no-ops; already-linked accounts are never stolen", async () => {
    const email = `bf-${Date.now()}@phased.local`;
    await db.checklistAccount.create({
      data: { email, name: "BF User", passwordHash: hashPassword("password123"), emailVerified: true },
    });
    const row = await db.candidate.create({
      data: {
        agencyId, fullName: "BF Cand", email, role: "RN", specialty: "ICU",
        consentSignature: "s", consentSignedAt: new Date(),
      },
    });

    const first = await unifyAccounts();
    expect(first.linked).toBeGreaterThanOrEqual(1);

    const linked = await db.candidate.findUnique({ where: { id: row.id } });
    expect(linked!.accountId).toBe((await db.checklistAccount.findUnique({ where: { email } }))!.id);

    // idempotent
    const second = await unifyAccounts();
    expect(second.linked).toBe(0);
  });
});
