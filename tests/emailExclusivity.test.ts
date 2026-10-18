import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { sha256 } from "@/lib/bts/auth";
import { db } from "@/lib/db";
import { POST as authPost } from "@/app/api/auth/route";
import { emailIdentityConflict } from "@/lib/bts/emailExclusivity";

// ── EMAIL-EXCLUSIVITY (owner rule): one email — one identity type. ────────
// A recruiter-registered email can never register as a candidate and a
// candidate-registered email (unified login OR references-workflow profile)
// can never register as a recruiter. Guards live at /api/auth signup (both
// roles) and at the reference claim flow's account auto-creation.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: async () => undefined, set: async () => {}, delete: async () => {} }),
}));

const jsonReq = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const RUN = Date.now();
const RECRUITER_EMAIL = `excl-rec-${RUN}@excl.local`;
const CANDIDATE_ACCT_EMAIL = `excl-cand-${RUN}@excl.local`;
const CANDIDATE_PROFILE_EMAIL = `excl-prof-${RUN}@excl.local`;
const FREE_EMAIL = `excl-free-${RUN}@excl.local`;

beforeAll(async () => {
  await db.recruiterAccount.create({
    data: { email: RECRUITER_EMAIL, name: "Excl Recruiter", passwordHash: sha256("x") },
  });
  await db.checklistAccount.create({
    data: { email: CANDIDATE_ACCT_EMAIL, name: "Excl Candidate", passwordHash: sha256("x") },
  });
  // Candidate PROFILE row (references workflow) — needs an agency parent.
  const agency = await db.agency.create({ data: { name: `Excl Agency ${RUN}`, slug: `excl-agency-${RUN}` } });
  await db.candidate.create({
    data: { agencyId: agency.id, fullName: "Excl Profile", email: CANDIDATE_PROFILE_EMAIL },
  });
});

describe("emailIdentityConflict helper", () => {
  it("recruiter-registered email -> 'recruiter'", async () => {
    expect(await emailIdentityConflict(RECRUITER_EMAIL)).toBe("recruiter");
  });
  it("candidate unified-login email -> 'candidate'", async () => {
    expect(await emailIdentityConflict(CANDIDATE_ACCT_EMAIL)).toBe("candidate");
  });
  it("candidate profile-only email -> 'candidate'", async () => {
    expect(await emailIdentityConflict(CANDIDATE_PROFILE_EMAIL)).toBe("candidate");
  });
  it("unregistered email -> null", async () => {
    expect(await emailIdentityConflict(FREE_EMAIL)).toBeNull();
  });
  it("matching is case-insensitive (emails normalize to lowercase)", async () => {
    expect(await emailIdentityConflict(RECRUITER_EMAIL.toUpperCase())).toBe("recruiter");
  });
});

describe("signup surface enforcement", () => {
  it("candidate signup with a recruiter email -> 409, no account created", async () => {
    const res = await authPost(jsonReq({ action: "signup", role: "CANDIDATE", name: "Try Cand", email: RECRUITER_EMAIL, password: "password123" }));
    expect(res.status).toBe(409);
    expect(await db.checklistAccount.findUnique({ where: { email: RECRUITER_EMAIL } })).toBeNull();
  });

  it("recruiter signup with a candidate unified-login email -> 409, no account created", async () => {
    const res = await authPost(jsonReq({ action: "signup", role: "RECRUITER", name: "Try Rec", email: CANDIDATE_ACCT_EMAIL, password: "password123" }));
    expect(res.status).toBe(409);
    expect(await db.recruiterAccount.findUnique({ where: { email: CANDIDATE_ACCT_EMAIL } })).toBeNull();
  });

  it("recruiter signup with a candidate profile-only email -> 409, no account created", async () => {
    const res = await authPost(jsonReq({ action: "signup", role: "RECRUITER", name: "Try Rec 2", email: CANDIDATE_PROFILE_EMAIL, password: "password123" }));
    expect(res.status).toBe(409);
    expect(await db.recruiterAccount.findUnique({ where: { email: CANDIDATE_PROFILE_EMAIL } })).toBeNull();
  });

  it("recruiter signup with mixed-case candidate email is blocked too (normalization before guard)", async () => {
    const res = await authPost(jsonReq({ action: "signup", role: "RECRUITER", name: "Try Rec 3", email: CANDIDATE_ACCT_EMAIL.toUpperCase(), password: "password123" }));
    expect(res.status).toBe(409);
  });

  it("control: both roles can still register distinct free emails", async () => {
    const cand = await authPost(jsonReq({ action: "signup", role: "CANDIDATE", name: "Free Cand", email: FREE_EMAIL, password: "password123" }));
    expect(cand.status).toBe(200);
    const rec = await authPost(jsonReq({ action: "signup", role: "RECRUITER", name: "Free Rec", email: `excl-free2-${RUN}@excl.local`, password: "password123" }));
    expect(rec.status).toBe(200);
  });
});
