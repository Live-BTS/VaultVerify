import { beforeAll, it, expect, describe, vi } from "vitest";

// ── SEC-09: verification-email resend throttle ───────────────────
// The sign-in lockout half of SEC-09 shipped with Phase D (loginLockedFor —
// covered in phaseDHygiene.test.ts). This file pins the OTHER half: every
// unauthenticated email trigger (explicit resend, unverified sign-in, signup
// re-issue) enforces one durable per-address+role budget — 3 sends / 10 min —
// shared across BOTH auth surfaces (/api/auth and /api/checklist/account).
// The counter is the EmailVerification table itself: each send creates
// exactly one row, so the throttle works across serverless instances with
// zero schema change. Same harness conventions as phaseDHygiene.test.ts.

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
import { RESEND_MAX_PER_WINDOW, RESEND_WINDOW_MS } from "@/lib/bts/hygiene";
import { POST as authPost } from "@/app/api/auth/route";
import { POST as checklistAccountPost } from "@/app/api/checklist/account/route";

const UNVERIFIED_EMAIL = "resend-throttle@sec09.local";
const UNVERIFIED_PASSWORD = "throttle-pass-1";
const VERIFIED_EMAIL = "already-verified@sec09.local";
const CROSS_EMAIL = "cross-surface@sec09.local";
const DUAL_EMAIL = "dual-role@sec09.local";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const resend = (email: string, role: "CANDIDATE" | "RECRUITER" = "CANDIDATE") =>
  authPost(jsonReq("/api/auth", { action: "resend", role, email }));

const legacyResend = (email: string) =>
  checklistAccountPost(jsonReq("/api/checklist/account", { action: "resend", email }));

const rowsInWindowFor = (email: string, role: "CANDIDATE" | "RECRUITER") =>
  db.emailVerification.count({
    where: { email, role, createdAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) } },
  });

// Push every verification row for an address outside the sliding window —
// simulates the window having fully elapsed.
const expireWindow = async (email: string) => {
  await db.emailVerification.updateMany({
    where: { email },
    data: { createdAt: new Date(Date.now() - RESEND_WINDOW_MS - 60_000) },
  });
};

beforeAll(async () => {
  await db.checklistAccount.create({
    data: { email: UNVERIFIED_EMAIL, name: "Resend Throttle", passwordHash: hashPassword(UNVERIFIED_PASSWORD), emailVerified: false },
  });
  await db.checklistAccount.create({
    data: { email: VERIFIED_EMAIL, name: "Already Verified", passwordHash: hashPassword("verified-pass-1"), emailVerified: true },
  });
  await db.checklistAccount.create({
    data: { email: CROSS_EMAIL, name: "Cross Surface", passwordHash: hashPassword("cross-pass-1"), emailVerified: false },
  });
  await db.checklistAccount.create({
    data: { email: DUAL_EMAIL, name: "Dual Role Candidate", passwordHash: hashPassword("dual-pass-1"), emailVerified: false },
  });
  await db.recruiterAccount.create({
    data: { email: DUAL_EMAIL, name: "Dual Role Recruiter", passwordHash: hashPassword("dual-pass-1"), emailVerified: false },
  });
});

describe("SEC-09: explicit resend is throttled per address", () => {
  it("allows the first 3 sends then 429s the 4th without creating a row", async () => {
    for (let i = 0; i < RESEND_MAX_PER_WINDOW; i++) {
      const res = await resend(UNVERIFIED_EMAIL);
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    }
    expect(await rowsInWindowFor(UNVERIFIED_EMAIL, "CANDIDATE")).toBe(3);

    const res = await resend(UNVERIFIED_EMAIL);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    // the throttled call must not have created another row
    expect(await rowsInWindowFor(UNVERIFIED_EMAIL, "CANDIDATE")).toBe(3);
  });

  it("slides open again once the window has elapsed", async () => {
    await expireWindow(UNVERIFIED_EMAIL);
    const res = await resend(UNVERIFIED_EMAIL);
    expect(res.status).toBe(200);
    // only the fresh send sits inside the window now
    expect(await rowsInWindowFor(UNVERIFIED_EMAIL, "CANDIDATE")).toBe(1);
    expect(await db.emailVerification.count({ where: { email: UNVERIFIED_EMAIL, role: "CANDIDATE" } })).toBe(4);
  });
});

describe("SEC-09: every unauthenticated email trigger shares the budget", () => {
  it("signup re-issue: wrong password 409s first (SEC-13), correct password 429s on throttle (SEC-09)", async () => {
    // fill the window for CROSS_EMAIL
    for (let i = 0; i < RESEND_MAX_PER_WINDOW; i++) {
      expect((await resend(CROSS_EMAIL)).status).toBe(200);
    }
    const before = await db.checklistAccount.findUnique({ where: { email: CROSS_EMAIL } });

    // SEC-13 gate runs FIRST: a wrong password 409s even with a full window
    const wrongPw = await authPost(jsonReq("/api/auth", {
      action: "signup", role: "CANDIDATE",
      name: "Cross Surface", email: CROSS_EMAIL, password: "attacker-new-pass-9",
    }));
    expect(wrongPw.status).toBe(409);

    // SEC-09 gate: the ORIGINAL password passes the proof, then hits the throttle
    const throttled = await authPost(jsonReq("/api/auth", {
      action: "signup", role: "CANDIDATE",
      name: "Cross Surface", email: CROSS_EMAIL, password: "cross-pass-1",
    }));
    expect(throttled.status).toBe(429);
    expect((await throttled.json()).retryAfterSeconds).toBeGreaterThan(0);

    const after = await db.checklistAccount.findUnique({ where: { email: CROSS_EMAIL } });
    // credential rotation blocked either way: the ORIGINAL password still verifies
    expect(verifyPassword("cross-pass-1", after?.passwordHash ?? "")).toBe(true);
    expect(verifyPassword("attacker-new-pass-9", after?.passwordHash ?? "")).toBe(false);
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(await rowsInWindowFor(CROSS_EMAIL, "CANDIDATE")).toBe(RESEND_MAX_PER_WINDOW);
  });

  it("correct-password sign-in for an unverified account is 429'd too", async () => {
    // CROSS_EMAIL window is still full from the previous test
    const res = await authPost(jsonReq("/api/auth", {
      action: "signin", role: "CANDIDATE", email: CROSS_EMAIL, password: "cross-pass-1",
    }));
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfterSeconds).toBeGreaterThan(0);
    expect(await rowsInWindowFor(CROSS_EMAIL, "CANDIDATE")).toBe(RESEND_MAX_PER_WINDOW);
  });

  it("the legacy checklist surface shares ONE budget with /api/auth", async () => {
    await expireWindow(CROSS_EMAIL);
    expect((await resend(CROSS_EMAIL)).status).toBe(200);           // 1 via /api/auth
    expect((await resend(CROSS_EMAIL)).status).toBe(200);           // 2 via /api/auth
    expect((await legacyResend(CROSS_EMAIL)).status).toBe(200);     // 3 via /api/checklist/account
    expect(await rowsInWindowFor(CROSS_EMAIL, "CANDIDATE")).toBe(3);

    const blocked429 = await legacyResend(CROSS_EMAIL);
    expect(blocked429.status).toBe(429);
    const blockedAuth = await resend(CROSS_EMAIL);
    expect(blockedAuth.status).toBe(429);
    expect(await rowsInWindowFor(CROSS_EMAIL, "CANDIDATE")).toBe(3);
  });
});

describe("SEC-09: neutral paths stay neutral, counters stay scoped", () => {
  it("ghost and verified addresses never 429 and never create rows", async () => {
    expect((await resend("ghost@sec09.local")).status).toBe(200);
    expect((await resend(VERIFIED_EMAIL)).status).toBe(200);
    expect(await rowsInWindowFor("ghost@sec09.local", "CANDIDATE")).toBe(0);
    expect(await rowsInWindowFor(VERIFIED_EMAIL, "CANDIDATE")).toBe(0);
  });

  it("the budget is scoped per role — a full CANDIDATE window does not block RECRUITER", async () => {
    for (let i = 0; i < RESEND_MAX_PER_WINDOW; i++) {
      expect((await resend(DUAL_EMAIL, "CANDIDATE")).status).toBe(200);
    }
    expect(await resend(DUAL_EMAIL, "CANDIDATE").then((r) => r.status)).toBe(429);

    const recruiterResend = await resend(DUAL_EMAIL, "RECRUITER");
    expect(recruiterResend.status).toBe(200);
    expect(await rowsInWindowFor(DUAL_EMAIL, "RECRUITER")).toBe(1);
    expect(await rowsInWindowFor(DUAL_EMAIL, "CANDIDATE")).toBe(RESEND_MAX_PER_WINDOW);
  });
});
