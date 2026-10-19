import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { sha256 } from "@/lib/bts/auth";
import { db } from "@/lib/db";
import { POST as superadminPost } from "@/app/api/superadmin/route";

// ── Refresh-persistence for the superadmin console (owner report, 2026-10-19) ──
// The console bearer now ALSO rides an httpOnly cookie (vv_sa) so a page
// reload restores the session instead of hitting the gate. Gates:
//   1. a live cookie authorizes console calls with NO body token
//   2. an unknown/expired cookie is rejected (fail-closed)
//   3. verify_otp sets the cookie alongside the token
//   4. backup-code login mints a REAL session (token + cookie) — the code is
//      accepted once and never has to live in client state
//   5. logout deletes the cookie-bound session row and clears the cookie

const RUN = Date.now();
const jsonReq = (body: unknown, cookie?: string) =>
  new NextRequest("http://localhost:3000/api/superadmin", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

let otpRaw = "";
let backupRaw = "";

async function seedOtpLogin(): Promise<string> {
  // Account → OTP row → verify_otp → minted token.
  const email = `sa-cookie-${RUN}@sa.local`;
  await db.superadminAccount.create({ data: { email, name: "Cookie Owner", role: "OWNER", status: "ACTIVE" } });
  await db.superAdminOtp.create({
    data: { email, codeHash: sha256("654321"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  const res = await superadminPost(jsonReq({ action: "verify_otp", otp: "654321" }));
  expect(res.status).toBe(200);
  const d = await res.json();
  expect(d.ok).toBe(true);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("vv_sa=");
  otpRaw = String(d.token);
  expect(otpRaw.startsWith("sas_")).toBe(true);
  return email;
}

beforeAll(async () => {
  await seedOtpLogin();
});

afterEach(() => {
  delete process.env.SUPERADMIN_CODE;
});

describe("vv_sa cookie session — refresh persistence for the console", () => {
  it("1. a live cookie authorizes console calls with no body token", async () => {
    const res = await superadminPost(jsonReq({ action: "auth" }, `vv_sa=${otpRaw}`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.identity.role).toBe("OWNER");
  });

  it("2. an unknown cookie is rejected (fail-closed)", async () => {
    delete process.env.SUPERADMIN_CODE;
    const res = await superadminPost(jsonReq({ action: "auth" }, "vv_sa=sas_does-not-exist"));
    expect(res.status).toBe(401);
  });

  it("3. no cookie and no token → gate (401)", async () => {
    delete process.env.SUPERADMIN_CODE;
    const res = await superadminPost(jsonReq({ action: "auth" }));
    expect(res.status).toBe(401);
  });

  it("4. backup-code login mints a real session: token + Set-Cookie", async () => {
    const gateCode = "env-backup-" + "cookie-4821";
    process.env.SUPERADMIN_CODE = gateCode;
    const res = await superadminPost(jsonReq({ action: "auth", code: gateCode }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.identity.role).toBe("OWNER");
    backupRaw = String(d.token ?? "");
    expect(backupRaw.startsWith("sas_")).toBe(true);
    expect(res.headers.get("set-cookie") ?? "").toContain("vv_sa=");
    // The minted session must authorize follow-up calls on its own.
    const follow = await superadminPost(jsonReq({ action: "auth" }, `vv_sa=${backupRaw}`));
    expect(follow.status).toBe(200);
    const fd = await follow.json();
    expect(fd.identity.role).toBe("OWNER");
  });

  it("5. logout deletes the cookie-bound session and clears the cookie", async () => {
    const res = await superadminPost(jsonReq({ action: "logout" }, `vv_sa=${backupRaw}`));
    expect(res.status).toBe(200);
    const clear = res.headers.get("set-cookie") ?? "";
    expect(clear).toContain("vv_sa=");
    expect(/max-age=0/i.test(clear)).toBe(true);
    const gone = await db.superAdminSession.findUnique({ where: { token: sha256(backupRaw) } });
    expect(gone).toBeNull();
    // The cleared session no longer authorizes anything.
    delete process.env.SUPERADMIN_CODE;
    const after = await superadminPost(jsonReq({ action: "auth" }, `vv_sa=${backupRaw}`));
    expect(after.status).toBe(401);
  });

  it("6. logout without a cookie is a harmless no-op (still ok)", async () => {
    const res = await superadminPost(jsonReq({ action: "logout" }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
  });

  it("7. explicit body token still wins over the cookie (back-compat)", async () => {
    // A valid body token authorizes even when the cookie is garbage.
    const res = await superadminPost(jsonReq({ action: "auth", token: otpRaw }, "vv_sa=sas_garbage"));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
  });
});
