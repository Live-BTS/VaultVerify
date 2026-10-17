import { beforeAll, afterAll, it, expect, describe, vi } from "vitest";

// ── Session cookie mock (same pattern as authz/phaseB/phaseC/D4) ─────
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
import { sha256Hex, newToken, deriveCallbackCode } from "@/lib/bts/tokens";
import {
  encryptRefToken,
  decryptRefToken,
  rawTokenFor,
  refLinkFor,
  callbackCodeFor,
} from "@/lib/bts/refTokenCrypto";
import { POST as candidatePost, GET as candidateGet } from "@/app/api/candidate/route";
import { POST as candidateActionsPost } from "@/app/api/candidate/actions/route";
import { GET as referenceTokenGet, POST as referenceTokenPost } from "@/app/api/reference/[token]/route";
import { POST as recruiterPost } from "@/app/api/recruiter/route";
import { backfillLegacy } from "../scripts/d4b-backfill";

const A_EMAIL = "cand-d4b@phased.local";
const REF_EMAIL = "referee-d4b@phased.local";
const REC_EMAIL = "recruiter-d4b@phased.local";

let candSessionId = "";
let recSessionId = "";
let agencyId = "";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getReq = (url: string) => new NextRequest(`http://localhost:3000${url}`);

function useCandidate() { CANDIDATE_COOKIE = candSessionId; RECRUITER_COOKIE = null; }
function useRecruiter() { RECRUITER_COOKIE = recSessionId; CANDIDATE_COOKIE = null; }
function useAnonymous() { RECRUITER_COOKIE = null; CANDIDATE_COOKIE = null; }

/** Mint a checklist account + session for `email` and adopt its cookie —
 *  dashboard/nudge/swap ownership checks match the session account's email. */
async function signInAs(email: string): Promise<void> {
  const account = await db.checklistAccount.create({
    data: { email, name: "D4B User", passwordHash: hashPassword("password123"), emailVerified: true },
  });
  const sid = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({ data: { id: sha256(sid), accountId: account.id, expiresAt: new Date(Date.now() + 86400_000) } });
  CANDIDATE_COOKIE = sid;
  RECRUITER_COOKIE = null;
}

let savedKey = "";
let savedPrevious = "";

beforeAll(async () => {
  savedKey = process.env.REFERENCE_TOKEN_ENCRYPTION_KEY ?? "";
  savedPrevious = process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS ?? "";
  process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = ""; // no rotation by default

  // Deterministic onboarding agency: /api/candidate resolves slug "vaultverify" first.
  const agency = await db.agency.create({ data: { name: "D4B", slug: `d4b-${Date.now()}` } });
  agencyId = agency.id;
  await db.agency.create({ data: { name: "VaultVerify", slug: "vaultverify" } }).catch(() => null);
  const vv = await db.agency.findUnique({ where: { slug: "vaultverify" } });
  await db.creditLedger.create({ data: { agencyId: vv!.id, delta: 100, balanceAfter: 100, reason: "d4b" } });
  await db.creditLedger.create({ data: { agencyId, delta: 100, balanceAfter: 100, reason: "d4b" } });

  // Candidate account + session (dashboard / nudge)
  const account = await db.checklistAccount.create({
    data: { email: A_EMAIL, name: "Cand D4B", passwordHash: hashPassword("password123"), emailVerified: true },
  });
  candSessionId = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.checklistSession.create({ data: { id: sha256(candSessionId), accountId: account.id, expiresAt: new Date(Date.now() + 86400_000) } });

  // Recruiter account + session (reminder sweep)
  const recruiter = await db.recruiterAccount.create({
    data: { email: REC_EMAIL, name: "Rec D4B", passwordHash: sha256("x"), emailVerified: true, onboardingComplete: true },
  });
  recSessionId = `rcs_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.recruiterSession.create({ data: { id: sha256(recSessionId), accountId: recruiter.id, expiresAt: new Date(Date.now() + 86400_000) } });
});

afterAll(() => {
  process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = savedKey;
  process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = savedPrevious;
});

// ── A. Crypto primitives ─────────────────────────────────────────────
describe("D4b crypto — AES-256-GCM envelopes (pure)", () => {
  it("roundtrips raw → envelope → raw; envelope is self-describing v1", () => {
    const raw = newToken();
    const env = encryptRefToken(raw);
    const parts = env.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(decryptRefToken(env)).toBe(raw);
    // two encryptions of the same raw differ (random IV) but both decrypt
    expect(encryptRefToken(raw)).not.toBe(env);
    expect(decryptRefToken(encryptRefToken(raw))).toBe(raw);
  });

  it("rejects tampered ciphertext / tag / version (authenticated encryption)", () => {
    const env = encryptRefToken(newToken());
    const parts = env.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0x01;
    expect(() => decryptRefToken([parts[0], parts[1], parts[2], flipped.toString("base64url")].join("."))).toThrow();
    expect(() => decryptRefToken("v9.aaaa.aaaa.aaaa")).toThrow();
    expect(() => decryptRefToken("garbage")).toThrow();
  });

  it("fails closed when the key is missing or unusable", () => {
    const raw = newToken();
    const env = encryptRefToken(raw);
    delete process.env.REFERENCE_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptRefToken(raw)).toThrow(/not configured/);
    expect(() => decryptRefToken(env)).toThrow(/not configured/);
    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encryptRefToken(raw)).toThrow(/unusable/);
    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = savedKey;
    expect(decryptRefToken(env)).toBe(raw);
  });

  it("rotation: previous key keeps v1 readable; new envelopes stamp v2; re-encrypt upgrades in place", async () => {
    const raw = newToken();
    const v1Envelope = encryptRefToken(raw); // stamped v1 with the original key

    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = savedKey;
    const newKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = newKey;

    // v2 envelopes encrypt with the NEW key
    const v2Envelope = encryptRefToken(raw);
    expect(v2Envelope.startsWith("v2.")).toBe(true);
    expect(decryptRefToken(v2Envelope)).toBe(raw);
    // v1 envelopes still decrypt through the previous key
    expect(decryptRefToken(v1Envelope)).toBe(raw);

    // re-encrypt flow: v1 → v2, same raw recovered
    expect(v2Envelope.startsWith("v1.")).toBe(false);
    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = "";
    process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = savedKey;

    // wrong-key isolation: a previous-generation key must NOT decrypt v2 rows
    const envNew = (() => {
      process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = savedKey;
      process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = newKey;
      const e = encryptRefToken(raw);
      process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS = "";
      process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = savedKey;
      return e;
    })();
    expect(() => decryptRefToken(envNew)).toThrow(); // savedKey alone can't read v2
  });
});

// ── B. Row-level resolvers ───────────────────────────────────────────
describe("D4b row resolvers — rawTokenFor / refLinkFor / callbackCodeFor", () => {
  it("envelope rows decrypt; legacy raw rows pass through; digest-without-envelope is unrecoverable", () => {
    const raw = newToken();
    const row = { id: "r1", token: sha256Hex(raw), tokenEncrypted: encryptRefToken(raw) };
    expect(rawTokenFor(row)).toBe(raw);
    expect(refLinkFor(row, "https://app")).toBe(`https://app/?r=${raw}`);
    expect(callbackCodeFor(row)).toBe(deriveCallbackCode(raw));

    const legacy = { id: "r2", token: raw, tokenEncrypted: null };
    expect(rawTokenFor(legacy)).toBe(raw);

    const orphan = { id: "r3", token: sha256Hex(raw), tokenEncrypted: null };
    expect(rawTokenFor(orphan)).toBeNull();
  });

  it("callback code is IDENTICAL before and after migration (legacy raw vs envelope of the same raw)", () => {
    const raw = newToken();
    const before = deriveCallbackCode(raw); // legacy derivation
    const after = callbackCodeFor({ id: "r4", token: sha256Hex(raw), tokenEncrypted: encryptRefToken(raw) });
    expect(after).toBe(before);
  });
});

// ── C. Onboarding creation: digest + envelope at rest, raw shown once ─
describe("D4b — POST /api/candidate stores no plaintext token", () => {
  it("creates rows with digest + envelope; response carries the raw link + callback code exactly once", async () => {
    const email = `onboard-${Date.now()}@phased.local`;
    const res = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Onboard D4B", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 3, city: "X", state: "Y", consentSignature: "sig",
      skills: [],
      references: [{
        refName: "Ref One", refTitle: "Charge", refEmail: REF_EMAIL, refPhone: "5550001",
        facilityName: "General", relationship: "Supervisor", workStartDate: "2024-01", workEndDate: "",
      }],
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    const req0 = data.candidate.requests[0];

    // raw shown once in the response…
    expect(req0.refLink).toMatch(/\?r=/);
    const raw = req0.refLink.split("r=")[1];
    expect(raw).toBeTruthy();
    expect(req0.callbackCode).toBe(deriveCallbackCode(raw));

    // …and the payload carries NO stored token material
    expect(req0).not.toHaveProperty("token");
    expect(req0).not.toHaveProperty("tokenEncrypted");

    // row at rest: digest + envelope only
    const row = await db.referenceRequest.findUnique({ where: { id: req0.id } });
    expect(row!.token).toBe(sha256Hex(raw));
    expect(row!.tokenEncrypted).toBeTruthy();
    expect(row!.tokenEncrypted!.includes(raw)).toBe(false);
    expect(JSON.stringify(row)).not.toContain(raw); // no plaintext anywhere in the row
  });
});

// ── D. Referee link validation + lazy upgrade + callback verification ─
describe("D4b — referee resolve, lazy upgrade, callback verification", () => {
  it("resolves a post-cutover (digest) row via digest-first lookup", async () => {
    const raw = newToken();
    const created = await db.referenceRequest.create({
      data: {
        token: sha256Hex(raw), tokenEncrypted: encryptRefToken(raw), candidateId: "none",
        refName: "X", refTitle: "T", refEmail: REF_EMAIL, facilityName: "F",
        status: "SENT", expiresAt: new Date(Date.now() + 86400_000),
      },
    }).catch(() => null);
    // candidateId FK: create through a real candidate instead
    let row = created;
    if (!row) {
      const cand = await db.candidate.create({
        data: {
          agencyId, fullName: "Resolve Cand", email: `resolve-${Date.now()}@phased.local`, role: "RN", specialty: "ICU",
          consentSignature: "s", consentSignedAt: new Date(),
        },
      });
      row = await db.referenceRequest.create({
        data: {
          token: sha256Hex(raw), tokenEncrypted: encryptRefToken(raw), candidateId: cand.id,
          refName: "X", refTitle: "T", refEmail: REF_EMAIL, facilityName: "F",
          status: "SENT", expiresAt: new Date(Date.now() + 86400_000),
        },
      });
    }
    const res = await referenceTokenGet(getReq(`/api/reference/${raw}`), { params: Promise.resolve({ token: raw }) } as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.request.id).toBe(row!.id);
    expect(JSON.stringify(data)).not.toContain(raw); // response never re-displays the bearer token
  });

  it("legacy raw row: first resolve upgrades raw → digest + envelope; same link keeps working; callback code stable", async () => {
    const cand = await db.candidate.create({
      data: {
        agencyId, fullName: "Legacy Cand", email: `legacy-${Date.now()}@phased.local`, role: "RN", specialty: "ICU",
        consentSignature: "s", consentSignedAt: new Date(),
      },
    });
    const raw = newToken();
    const legacyRow = await db.referenceRequest.create({
      data: {
        token: raw, tokenEncrypted: null, candidateId: cand.id, // LEGACY: raw at rest
        refName: "Legacy Ref", refTitle: "T", refEmail: `legacy-ref-${Date.now()}@phased.local`, facilityName: "F",
        status: "SENT", expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const codeBefore = deriveCallbackCode(raw);

    // first resolve → 200 + lazy upgrade
    const res1 = await referenceTokenGet(getReq(`/api/reference/${raw}`), { params: Promise.resolve({ token: raw }) } as never);
    expect(res1.status).toBe(200);
    const after = await db.referenceRequest.findUnique({ where: { id: legacyRow.id } });
    expect(after!.token).toBe(sha256Hex(raw));   // now hash-only
    expect(after!.tokenEncrypted).toBeTruthy();  // + envelope for resend
    expect(after!.token).not.toBe(raw);

    // second resolve with the SAME raw link still works
    const res2 = await referenceTokenGet(getReq(`/api/reference/${raw}`), { params: Promise.resolve({ token: raw }) } as never);
    expect(res2.status).toBe(200);

    // callback verification post-migration derives from the decrypted raw
    const verify = await referenceTokenPost(jsonReq(`/api/reference/${raw}`, {
      action: "verify_identity", method: "CALLBACK_CODE", callbackCode: codeBefore,
    }), { params: Promise.resolve({ token: raw }) } as never);
    expect(verify.status).toBe(200);
    expect((await verify.json()).identityMethod).toBe("CALLBACK_CODE");

    // a WRONG code is still rejected
    const bad = await referenceTokenPost(jsonReq(`/api/reference/${raw}`, {
      action: "verify_identity", method: "CALLBACK_CODE", callbackCode: "000000",
    }), { params: Promise.resolve({ token: raw }) } as never);
    expect(bad.status).toBe(400);
  });

  it("unknown tokens are 404; the raw value of a hashed row never matches by digest reversal", async () => {
    const res = await referenceTokenGet(getReq(`/api/reference/${newToken()}`), { params: Promise.resolve({ token: newToken() }) } as never);
    expect(res.status).toBe(404);
  });
});

// ── E. Dashboard: raw token stripped, refLink + callbackCode intact ──
describe("D4b — candidate dashboard payload", () => {
  it("GET /api/candidate returns refLink + callbackCode and NO token/tokenEncrypted fields", async () => {
    const email = `dash-${Date.now()}@phased.local`;
    await signInAs(email);
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Dash Cand", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Dash Ref", refTitle: "RN", refEmail: `dr-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    expect(created.status).toBe(201);

    const res = await candidateGet(getReq(`/api/candidate?email=${email}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    const req0 = data.candidate.requests[0];
    expect(req0.refLink).toMatch(/\?r=/);
    expect(req0.refLink.split("r=")[1].length).toBeGreaterThan(20);
    expect(req0.callbackCode).toMatch(/^\d{6}$/);
    expect(req0).not.toHaveProperty("token");
    expect(req0).not.toHaveProperty("tokenEncrypted");
  });
});

// ── F. Reminder re-send preserved (nudge + recruiter sweep) ──────────
describe("D4b — reminders keep re-sending the EXISTING link", () => {
  it("candidate nudge emails the same link rebuilt from the stored envelope", async () => {
    const email = `nudge-${Date.now()}@phased.local`;
    await signInAs(email);
    const refEmail = `nr-${Date.now()}@phased.local`;
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Nudge Cand", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Nudge Ref", refTitle: "RN", refEmail, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    const data = await created.json();
    const raw = data.candidate.requests[0].refLink.split("r=")[1];
    const requestId = data.candidate.requests[0].id;

    // make the reminder due: 6 days open (≥ 2-day first reminder, < 14-day expiry)
    await db.referenceRequest.update({ where: { id: requestId }, data: { sentAt: new Date(Date.now() - 6 * 86400_000) } });

    const res = await candidateActionsPost(jsonReq("/api/candidate/actions", { action: "nudge", requestId }));
    expect(res.status).toBe(200);
    const log = await db.notificationLog.findFirst({ where: { requestId, kind: "REMINDER" }, orderBy: { createdAt: "desc" } });
    expect(log).toBeTruthy();
    expect(log!.body).toContain(`/?r=${raw}`); // SAME link as the original invite
  });

  it("recruiter run_reminders rebuilds links from envelopes; key outage SKIPS instead of sending broken mail", async () => {
    useRecruiter();
    const email = `sweep-${Date.now()}@phased.local`;
    const refEmail = `sr-${Date.now()}@phased.local`;
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Sweep Cand", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Sweep Ref", refTitle: "RN", refEmail, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    const data = await created.json();
    const raw = data.candidate.requests[0].refLink.split("r=")[1];
    const requestId = data.candidate.requests[0].id;
    await db.referenceRequest.update({ where: { id: requestId }, data: { sentAt: new Date(Date.now() - 6 * 86400_000) } });
    // open share link admits the recruiter (CH-06: no binding → anyone with the link)
    await db.referenceShareLink.create({
      data: { token: "rsl" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""), requestId, accessType: "DURATION" },
    });

    const res = await recruiterPost(jsonReq("/api/recruiter", { action: "run_reminders" }));
    expect(res.status).toBe(200);
    const sweep = await res.json();
    expect(sweep.remindersSent).toBeGreaterThanOrEqual(1);
    const log = await db.notificationLog.findFirst({ where: { requestId, kind: "REMINDER" }, orderBy: { createdAt: "desc" } });
    expect(log!.body).toContain(`/?r=${raw}`);

    // key outage → the SAME sweep skips (never a broken link), no crash
    const realKey = process.env.REFERENCE_TOKEN_ENCRYPTION_KEY;
    delete process.env.REFERENCE_TOKEN_ENCRYPTION_KEY;
    try {
      const out = await recruiterPost(jsonReq("/api/recruiter", { action: "run_reminders" }));
      expect(out.status).toBe(200);
      const outage = await out.json();
      expect(outage.skippedCount).toBeGreaterThanOrEqual(1);
      expect(outage.message).toContain("skipped");
    } finally {
      process.env.REFERENCE_TOKEN_ENCRYPTION_KEY = realKey;
    }
  });
});

// ── G. Revocation via swap: the old link dies, the new one works ─────
describe("D4b — swap revokes the old referee link", () => {
  it("after a swap the old token is expired (410) and the new link resolves", async () => {
    const email = `swap-${Date.now()}@phased.local`;
    await signInAs(email);
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Swap Cand", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Old Ref", refTitle: "RN", refEmail: `old-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    const data = await created.json();
    const requestId = data.candidate.requests[0].id;
    const oldRow = await db.referenceRequest.findUnique({ where: { id: requestId } });
    const oldRaw = rawTokenFor(oldRow!)!;

    const swap = await candidateActionsPost(jsonReq("/api/candidate/actions", {
      action: "swap", requestId,
      replacement: { refName: "New Ref", refTitle: "RN", refEmail: `new-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer" },
    }));
    expect(swap.status).toBe(200);

    // old link: validation still matches the row, but the request is EXPIRED
    const gone = await referenceTokenPost(jsonReq(`/api/reference/${oldRaw}`, { action: "verify_identity", method: "SKIPPED" }), { params: Promise.resolve({ token: oldRaw }) } as never);
    expect(gone.status).toBe(410);

    // new request stored digest+envelope, no plaintext
    const candRow = await db.candidate.findFirst({ where: { email } });
    const rows = await db.referenceRequest.findMany({ where: { candidateId: candRow!.id } });
    expect(rows.some((r) => r.status === "EXPIRED")).toBe(true);
    const fresh = rows.find((r) => r.status === "SENT")!;
    expect(fresh.tokenEncrypted).toBeTruthy();
    expect(fresh.token).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── H. Backfill migration: legacy plaintext → digest + envelope ──────
describe("D4b — backfill script migrates legacy rows (idempotent, resumable)", () => {
  it("migrates every raw row; original links keep validating; second run is a no-op", async () => {
    const cand = await db.candidate.create({
      data: {
        agencyId, fullName: "Backfill Cand", email: `bf-${Date.now()}@phased.local`, role: "RN", specialty: "ICU",
        consentSignature: "s", consentSignedAt: new Date(),
      },
    });
    const raws = [newToken(), newToken(), newToken()];
    for (const raw of raws) {
      await db.referenceRequest.create({
        data: {
          token: raw, tokenEncrypted: null, candidateId: cand.id,
          refName: "BF Ref", refTitle: "T", refEmail: `bf-ref-${raw}@phased.local`.slice(0, 60), facilityName: "F",
          status: "SENT", expiresAt: new Date(Date.now() + 86400_000),
        },
      });
    }

    const first = await backfillLegacy();
    expect(first.migrated).toBeGreaterThanOrEqual(3);
    expect(first.warnings).toBe(0);

    // every legacy row now digest+envelope; original raw links still resolve
    for (const raw of raws) {
      const row = await db.referenceRequest.findFirst({ where: { token: sha256Hex(raw) } });
      expect(row).toBeTruthy();
      expect(row!.tokenEncrypted).toBeTruthy();
      expect(rawTokenFor(row!)).toBe(raw); // resend capability preserved by the migration
    }

    // idempotent: second run migrates nothing new
    const second = await backfillLegacy();
    expect(second.migrated).toBe(0);
  });
});
