import { beforeAll, it, expect, describe, vi } from "vitest";

// ── SEC-13: re-signup cannot hijack an unverified account ────────
// Before this fix, signing up again with a known email + ANY password
// overwrote the unverified row's name and passwordHash — a pre-verification
// account-takeover (the attacker never needs inbox access; the real owner's
// verification link keeps working against the ATTACKER's new password).
// Now every signup path that hits an existing unverified row demands the
// ORIGINAL password (409 otherwise) on all three surfaces. The honest
// notification for the real owner remains the re-sent verification link.
// Same harness conventions as phaseDHygiene/sec09ResendThrottle.

let RC_COOKIE: string | null = null;
let CK_COOKIE: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && CK_COOKIE ? { value: CK_COOKIE }
      : name === "vv_rc" && RC_COOKIE ? { value: RC_COOKIE }
      : undefined,
    set: (name: string, value: string) => {
      if (name === "vv_ck") CK_COOKIE = value;
      if (name === "vv_rc") RC_COOKIE = value;
    },
    delete: (name: string) => {
      if (name === "vv_ck") CK_COOKIE = null;
      if (name === "vv_rc") RC_COOKIE = null;
    },
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/bts/checklistAuth";
import { POST as authPost } from "@/app/api/auth/route";
import { POST as checklistAccountPost } from "@/app/api/checklist/account/route";

const CAND_EMAIL = "guard-cand@sec13.local";
const CAND_PASSWORD = "original-pass-1";
const REC_EMAIL = "guard-rec@sec13.local";
const REC_PASSWORD = "original-rec-1";
const LEGACY_EMAIL = "guard-legacy@sec13.local";
const LEGACY_PASSWORD = "original-leg-1";
const VERIFIED_EMAIL = "already-verified@sec13.local";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const authSignup = (body: Record<string, unknown>) => authPost(jsonReq("/api/auth", { action: "signup", ...body }));
const legacySignup = (body: Record<string, unknown>) => checklistAccountPost(jsonReq("/api/checklist/account", body));

beforeAll(async () => {
  await db.checklistAccount.create({
    data: { email: CAND_EMAIL, name: "Original Cand", passwordHash: hashPassword(CAND_PASSWORD), emailVerified: false },
  });
  await db.checklistAccount.create({
    data: { email: LEGACY_EMAIL, name: "Original Legacy", passwordHash: hashPassword(LEGACY_PASSWORD), emailVerified: false },
  });
  await db.recruiterAccount.create({
    data: { email: REC_EMAIL, name: "Original Rec", passwordHash: hashPassword(REC_PASSWORD), emailVerified: false },
  });
  await db.checklistAccount.create({
    data: { email: VERIFIED_EMAIL, name: "Verified Owner", passwordHash: hashPassword("verified-pass-1"), emailVerified: true },
  });
});

describe("SEC-13: re-signup against an unverified account requires the original password", () => {
  it("candidate: wrong password -> 409, row completely untouched", async () => {
    const before = await db.checklistAccount.findUnique({ where: { email: CAND_EMAIL } });
    const res = await authSignup({ role: "CANDIDATE", name: "Attacker Name", email: CAND_EMAIL, password: "hijack-pass-99" });
    expect(res.status).toBe(409);

    const after = await db.checklistAccount.findUnique({ where: { email: CAND_EMAIL } });
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.name).toBe(before?.name);
    expect(verifyPassword(CAND_PASSWORD, after?.passwordHash ?? "")).toBe(true);
    expect(verifyPassword("hijack-pass-99", after?.passwordHash ?? "")).toBe(false);
    // no verification email was triggered for the attacker
    expect(await db.emailVerification.count({ where: { email: CAND_EMAIL, role: "CANDIDATE" } })).toBe(0);
  });

  it("candidate: correct ORIGINAL password -> credentials refreshed + fresh link", async () => {
    const res = await authSignup({ role: "CANDIDATE", name: "Original Cand", email: CAND_EMAIL, password: CAND_PASSWORD });
    expect(res.status).toBe(200);
    expect((await res.json()).checkEmail).toBe(true);

    const after = await db.checklistAccount.findUnique({ where: { email: CAND_EMAIL } });
    // the submitted password is (re-)hashed onto the row — the original secret
    // still verifies, a new-attacker password can never be planted
    expect(verifyPassword(CAND_PASSWORD, after?.passwordHash ?? "")).toBe(true);
    expect(await db.emailVerification.count({ where: { email: CAND_EMAIL, role: "CANDIDATE" } })).toBe(1);
  });

  it("recruiter: wrong password -> 409, row untouched", async () => {
    const before = await db.recruiterAccount.findUnique({ where: { email: REC_EMAIL } });
    const res = await authSignup({ role: "RECRUITER", name: "Attacker Rec", email: REC_EMAIL, password: "hijack-rec-99" });
    expect(res.status).toBe(409);

    const after = await db.recruiterAccount.findUnique({ where: { email: REC_EMAIL } });
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(verifyPassword(REC_PASSWORD, after?.passwordHash ?? "")).toBe(true);
    expect(await db.emailVerification.count({ where: { email: REC_EMAIL, role: "RECRUITER" } })).toBe(0);
  });

  it("legacy checklist surface: wrong password -> 409 untouched; correct -> proceeds", async () => {
    const before = await db.checklistAccount.findUnique({ where: { email: LEGACY_EMAIL } });
    const blocked = await legacySignup({ action: "signup", name: "Attacker Legacy", email: LEGACY_EMAIL, password: "hijack-leg-99" });
    expect(blocked.status).toBe(409);
    const mid = await db.checklistAccount.findUnique({ where: { email: LEGACY_EMAIL } });
    expect(mid?.passwordHash).toBe(before?.passwordHash);

    const ok = await legacySignup({ action: "signup", name: "Original Legacy", email: LEGACY_EMAIL, password: LEGACY_PASSWORD });
    expect(ok.status).toBe(200);
    const after = await db.checklistAccount.findUnique({ where: { email: LEGACY_EMAIL } });
    expect(verifyPassword(LEGACY_PASSWORD, after?.passwordHash ?? "")).toBe(true);
  });

  it("verified accounts keep refusing re-signup regardless of password", async () => {
    const res = await authSignup({ role: "CANDIDATE", name: "Anyone", email: VERIFIED_EMAIL, password: "verified-pass-1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("sign in instead");
  });
});
