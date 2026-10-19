import { beforeAll, it, expect, describe, vi, afterAll } from "vitest";

// ── SESSION-RESTORE: refresh must not sign the recruiter out ──────
// Owner report: "every time I refresh it logs out and then login … recruiter".
// Root cause (reproduced on the dev server, scripts/repro-refresh-logout.ts):
// a browser that has used BOTH portals carries vv_ck AND vv_rc. /api/auth "me"
// answered candidate-first unconditionally, so the recruiter dashboard's mount
// probe saw role CANDIDATE and rendered the login gate even though the
// recruiter cookie was live. The fix: "me" accepts a role HINT that jumps that
// identity's check to the front (the other identity stays a graceful
// fallback), and the portals record vv_last_role so the homepage boot probe
// restores the portal the browser actually used. These tests pin the server
// contract; the client halves are pinned by source gates at the bottom.

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
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { POST as authPost } from "@/app/api/auth/route";

const R_EMAIL = "session-restore.r@fix.local";
const C_EMAIL = "session-restore.c@fix.local";
const PASSWORD = "restore-pass-1";

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const me = (body: Record<string, unknown> = {}) => authPost(jsonReq("/api/auth", { action: "me", ...body }));
const meJson = async (body: Record<string, unknown> = {}) => {
  const res = await me(body);
  return { status: res.status, data: await res.json() };
};

beforeAll(async () => {
  await db.recruiterAccount.create({
    data: {
      email: R_EMAIL, name: "Restore Recruiter", passwordHash: hashPassword(PASSWORD),
      emailVerified: true, onboardingComplete: true,
      phone: "5551234567", company: "Restore Health", city: "Austin", state: "TX", zip: "78701",
    },
  });
  await db.checklistAccount.create({
    data: { email: C_EMAIL, name: "Restore Candidate", passwordHash: hashPassword(PASSWORD), emailVerified: true },
  });
  // Live sessions for both identities, exactly what a two-portal browser holds.
  const rawR = `rcs_test_${Date.now().toString(36)}`;
  await db.recruiterSession.create({
    data: { id: createHash("sha256").update(rawR).digest("hex"), accountId: (await db.recruiterAccount.findUnique({ where: { email: R_EMAIL } }))!.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  RC_COOKIE = rawR;
  const rawC = `cks_test_${Date.now().toString(36)}`;
  await db.checklistSession.create({
    data: { id: createHash("sha256").update(rawC).digest("hex"), accountId: (await db.checklistAccount.findUnique({ where: { email: C_EMAIL } }))!.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  CK_COOKIE = rawC;
});

afterAll(async () => {
  await db.recruiterSession.deleteMany({ where: { account: { email: R_EMAIL } } });
  await db.checklistSession.deleteMany({ where: { account: { email: C_EMAIL } } });
  await db.recruiterAccount.deleteMany({ where: { email: R_EMAIL } });
  await db.checklistAccount.deleteMany({ where: { email: C_EMAIL } });
  await db.$disconnect();
});

describe("session restore — /api/auth me with two live identities", () => {
  it("recruiter-only jar restores the recruiter (no hint needed)", async () => {
    const ck = CK_COOKIE;
    CK_COOKIE = null;
    const { data } = await meJson();
    CK_COOKIE = ck;
    expect(data.ok).toBe(true);
    expect(data.role).toBe("RECRUITER");
    expect(data.account.email).toBe(R_EMAIL);
    expect(data.account.onboardingComplete).toBe(true);
  });

  it("both cookies, no hint: historical candidate-first order preserved (back-compat)", async () => {
    const { data } = await meJson();
    expect(data.role).toBe("CANDIDATE");
    expect(data.account.email).toBe(C_EMAIL);
  });

  it("THE FIX — both cookies + role RECRUITER hint: the recruiter dashboard probe restores the recruiter", async () => {
    const { data } = await meJson({ role: "RECRUITER" });
    expect(data.ok).toBe(true);
    expect(data.role).toBe("RECRUITER");
    expect(data.account.email).toBe(R_EMAIL);
  });

  it("both cookies + role CANDIDATE hint: candidate probe still answers candidate", async () => {
    const { data } = await meJson({ role: "CANDIDATE" });
    expect(data.role).toBe("CANDIDATE");
    expect(data.account.email).toBe(C_EMAIL);
  });

  it("dead recruiter session + RECRUITER hint falls back gracefully to the live candidate", async () => {
    const saved = RC_COOKIE;
    RC_COOKIE = "rcs_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"; // no session row
    const { data } = await meJson({ role: "RECRUITER" });
    RC_COOKIE = saved;
    expect(data.role).toBe("CANDIDATE");
    expect(data.account.email).toBe(C_EMAIL);
  });

  it("suspended recruiter + RECRUITER hint: never restored, session killed, clean logout when no fallback", async () => {
    const recruiterId = (await db.recruiterAccount.findUnique({ where: { email: R_EMAIL } }))!.id;
    await db.recruiterSession.deleteMany({ where: { accountId: recruiterId } }); // clean slate (beforeAll session may still be live)
    await db.recruiterAccount.update({ where: { email: R_EMAIL }, data: { status: "SUSPENDED" } });
    // Fresh recruiter session on the suspended account; candidate cookie still live.
    const raw = `rcs_susp_${Date.now().toString(36)}`;
    await db.recruiterSession.create({ data: { id: createHash("sha256").update(raw).digest("hex"), accountId: recruiterId, expiresAt: new Date(Date.now() + 86_400_000) } });
    RC_COOKIE = raw;
    // With the candidate also live, the probe falls back to the candidate —
    // the recruiter dashboard still shows its gate (role ≠ RECRUITER).
    const fb = await meJson({ role: "RECRUITER" });
    expect(fb.data.role).toBe("CANDIDATE");
    expect(fb.data.account.email).toBe(C_EMAIL);
    // The suspended recruiter's session row was deleted (defense-in-depth).
    expect(await db.recruiterSession.count({ where: { accountId: recruiterId } })).toBe(0);
    // With NO other identity, the probe answers a clean logout. (The
    // suspended:true shape is a route-level safety net, but the session
    // getters already kill suspended sessions before the route sees them —
    // defense-in-depth pre-empts it, so the observable answer is plain null.)
    RC_COOKIE = null; CK_COOKIE = null;
    const raw2 = `rcs_susp2_${Date.now().toString(36)}`;
    await db.recruiterSession.create({ data: { id: createHash("sha256").update(raw2).digest("hex"), accountId: recruiterId, expiresAt: new Date(Date.now() + 86_400_000) } });
    RC_COOKIE = raw2;
    const solo = await meJson({ role: "RECRUITER" });
    expect(solo.data.ok).toBe(true);
    expect(solo.data.account ?? null).toBeNull();
    expect(solo.data.role).toBeUndefined();
    // Both suspension probes left zero live recruiter sessions.
    expect(await db.recruiterSession.count({ where: { accountId: recruiterId } })).toBe(0);
    await db.recruiterAccount.update({ where: { email: R_EMAIL }, data: { status: "ACTIVE" } });
  });

  it("no cookies at any hint: account null, still ok:true", async () => {
    const rc = RC_COOKIE, ck = CK_COOKIE;
    RC_COOKIE = null; CK_COOKIE = null;
    const hinted = await meJson({ role: "RECRUITER" });
    const plain = await meJson();
    RC_COOKIE = rc; CK_COOKIE = ck;
    expect(hinted.data.ok).toBe(true);
    expect(hinted.data.account ?? null).toBeNull();
    expect(plain.data.account ?? null).toBeNull();
  });
});

// ── Client-half source gates ──────────────────────────────────────
// The dashboards must not flash the login gate while their probes run, must
// send the role hint, signout must end the "returning user" treatment, and
// the homepage must not paint the landing between "logged out" and the portal.
import { readFileSync } from "node:fs";

describe("session restore — client halves", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  it("RecruiterDashboard shows a booting splash instead of the login gate while probing", () => {
    const src = read("src/components/bts/RecruiterDashboard.tsx");
    expect(src).toContain("useState(true)"); // booting gate exists…
    expect(src).toMatch(/booting/);
    expect(src).toMatch(/if \(booting\)/);
    expect(src).toContain("Checking your session");
  });

  it("RecruiterDashboard probe sends the RECRUITER role hint", () => {
    const src = read("src/components/bts/RecruiterDashboard.tsx");
    expect(src).toContain('JSON.stringify({ action: "me", role: "RECRUITER" })');
  });

  it("SuperAdmin shows the boot splash before its gate (no OTP-gate flash on refresh)", () => {
    const src = read("src/components/bts/SuperAdmin.tsx");
    expect(src).toMatch(/const \[booting, setBooting\] = useState\(true\)/);
    expect(src).toMatch(/if \(booting\)/);
    expect(src).toContain("Checking your session");
    // splash must render BEFORE the gate block
    expect(src.indexOf("if (booting)")).toBeLessThan(src.indexOf("if (!data)"));
  });

  it("homepage probes on EVERY plain load — no marker gate, splash covers the round trip", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain("readLastRole()");
    // DEEP AUDIT: the probe must NOT be gated on the marker — an evicted
    // marker (Safari, cleared storage) with a live cookie was the "landing →
    // sign-in → auto-login" cycle. The probe now always runs; the marker is
    // only the role hint.
    expect(home).toMatch(/const hint = readLastRole\(\);/);
    expect(home).toMatch(/AbortController/); // bounded probe — no infinite splash
    expect(home).toMatch(/settled/); // a late response after the timeout never swaps the view
    // verify deep link still paints immediately (no hang behind the splash)
    expect(home).toMatch(/setBooted\(true\); \/\/ the interstitial renders below/);
  });

  it("homepage probe clears the marker ONLY on a definitive ok:null — never on 503/timeout", () => {
    const home = read("src/app/page.tsx");
    // clearLastRole must be reachable only behind `d?.ok` (definitive answer);
    // a bare `else clearLastRole()` after `if (d.ok && d.account)` would evict
    // the marker on maintenance 503s and DB hiccups — the auto-login cycle.
    expect(home).toMatch(/else if \(d\?\.ok\) clearLastRole\(\)/);
    expect(home).not.toMatch(/else clearLastRole\(\)/);
  });

  it("'me' and 'signout' bypass the maintenance/DB-failure gate (logout must always work)", () => {
    const auth = read("src/app/api/auth/route.ts");
    expect(auth).toMatch(/if \(action !== "me" && action !== "signout"\) \{\s*\n\s*const writable = await assertPlatformWritable\(\);/);
    const checklist = read("src/app/api/checklist/account/route.ts");
    expect(checklist).toMatch(/if \(action !== "me" && action !== "logout"\) \{\s*\n\s*const writable = await assertPlatformWritable\(\);/);
  });

  it("SuperAdmin exit awaits the server logout (keepalive) before navigating away", () => {
    const src = read("src/components/bts/SuperAdmin.tsx");
    // fire-and-forget logout + immediate router push could abort the request,
    // leaving the vv_sa session alive → "auto-logged in after exit".
    expect(src).toMatch(/exitConsole = useCallback\(async/);
    expect(src).toContain("keepalive: true");
  });

  it("every signout path ends the returning-user treatment (clearLastRole)", () => {
    expect(read("src/components/bts/RecruiterDashboard.tsx")).toMatch(/clearLastRole\(\).*signed out|signed out[\s\S]{0,40}clearLastRole\(\)/);
    expect(read("src/components/bts/RecruiterDashboard.tsx")).toContain("clearLastRole();");
    expect(read("src/components/bts/checklist/ChecklistPortal.tsx")).toContain("clearLastRole();");
    expect(read("src/components/bts/SuperAdmin.tsx")).toContain("clearLastRole();");
  });

  it("both portals + homepage participate in the last-role marker", () => {
    expect(read("src/components/bts/RecruiterDashboard.tsx")).toContain('markLastRole("RECRUITER")');
    expect(read("src/components/bts/checklist/ChecklistPortal.tsx")).toContain('markLastRole("CANDIDATE")');
    expect(read("src/app/page.tsx")).toContain("markLastRole(d.role)");
  });

  it("the recruiter auth gate opens on the SIGN-IN form, not signup", () => {
    const src = read("src/components/bts/AuthPanel.tsx");
    expect(src).toMatch(/useState<Mode>\("signin"\)/);
  });

  it("lastRole helper is storage-safe (private mode) by construction", () => {
    const src = read("src/lib/lastRole.ts");
    expect(src).toContain("try {");
    expect(src).toContain("clearLastRole");
  });
});
