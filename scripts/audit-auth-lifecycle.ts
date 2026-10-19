// DEEP AUDIT (owner: "it automatically logs in even after I logged out")
// Full lifecycle over HTTP for all three portals:
//   signin → probe restores → signout → probe must NOT restore (row dead,
//   cookie expired). Any FAIL here = the auto-login-after-logout bug.
// Also audits Set-Cookie expiry on signout (browser must drop the cookie).
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const stamp = Date.now().toString().slice(-6);
let failed = 0;

function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, data: await res.json().catch(() => ({})), setCookies };
}

async function main() {
  const { hashPassword } = await import("../src/lib/bts/auth");
  // ── Seed verified+onboarded accounts ──
  const rEmail = `audit.r.${stamp}@example.com`;
  const cEmail = `audit.c.${stamp}@example.com`;
  const recruiter = await db.recruiterAccount.create({
    data: {
      email: rEmail, name: "Audit Recruiter", passwordHash: hashPassword("auditpass123"),
      emailVerified: true, onboardingComplete: true,
      phone: "5551234567", company: "Audit Health", city: "Austin", state: "TX", zip: "78701",
    },
  });
  const candidate = await db.checklistAccount.create({
    data: { email: cEmail, name: "Audit Candidate", passwordHash: hashPassword("auditpass123"), emailVerified: true, onboardingComplete: true },
  });

  // ══ 1. RECRUITER lifecycle ══
  console.log("══ 1. Recruiter ══");
  let r = await post("/api/auth", { action: "signin", role: "RECRUITER", email: rEmail, password: "auditpass123" });
  const rCookie = r.setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("vv_rc="));
  check("recruiter signin sets vv_rc", !!rCookie);
  let probe = await post("/api/auth", { action: "me", role: "RECRUITER" }, rCookie);
  check("probe restores before signout", probe.data.role === "RECRUITER" && !!probe.data.account);

  const so = await post("/api/auth", { action: "signout" }, rCookie);
  check("signout 200", so.status === 200 && so.data.ok === true);
  const expire = so.setCookies.find((c) => c.startsWith("vv_rc="));
  check("signout sends vv_rc expiry (Max-Age=0 / Expires past)", !!expire && /max-age=0|expires=Thu, 01 Jan 1970/i.test(expire), expire?.slice(0, 80));
  const after = await post("/api/auth", { action: "me", role: "RECRUITER" }, rCookie);
  check("OLD cookie rejected after signout (row deleted)", after.data.ok === true && (after.data.account ?? null) === null, JSON.stringify(after.data).slice(0, 80));
  const rows = await db.recruiterSession.count({ where: { accountId: recruiter.id } });
  check("recruiter session rows = 0 after signout", rows === 0, `rows=${rows}`);

  // ══ 2. CANDIDATE lifecycle ══
  console.log("══ 2. Candidate (nurse) ══");
  let c = await post("/api/checklist/account", { action: "login", email: cEmail, password: "auditpass123" });
  const cCookie = c.setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("vv_ck="));
  check("candidate login sets vv_ck", !!cCookie);
  probe = await post("/api/checklist/account", { action: "me" }, cCookie);
  check("candidate probe restores", !!probe.data.account);
  const cso = await post("/api/checklist/account", { action: "logout" }, cCookie);
  check("candidate logout 200", cso.status === 200 && cso.data.ok === true);
  const cExpire = cso.setCookies.find((c) => c.startsWith("vv_ck="));
  check("candidate logout sends vv_ck expiry", !!cExpire && /max-age=0|expires=Thu, 01 Jan 1970/i.test(cExpire), cExpire?.slice(0, 80));
  const cAfter = await post("/api/checklist/account", { action: "me" }, cCookie);
  check("OLD vv_ck rejected after logout", (cAfter.data.account ?? null) === null, JSON.stringify(cAfter.data).slice(0, 80));
  // /api/auth signout must also kill the candidate cookie (shared exit)
  const c2 = await post("/api/checklist/account", { action: "login", email: cEmail, password: "auditpass123" });
  const cCookie2 = c2.setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("vv_ck="));
  await post("/api/auth", { action: "signout" }, cCookie2);
  const cAfter2 = await post("/api/checklist/account", { action: "me" }, cCookie2);
  check("/api/auth signout also kills candidate session", (cAfter2.data.account ?? null) === null);

  // ══ 3. SUPERADMIN lifecycle ══
  console.log("══ 3. SuperAdmin ══");
  let o = await post("/api/superadmin", { action: "request_otp" });
  check("OTP requested", o.data.ok === true);
  const log = await db.notificationLog.findFirst({ where: { kind: "OTP" }, orderBy: { createdAt: "desc" } });
  const otp = log?.body.match(/\b(\d{6})\b/)?.[1];
  check("OTP code retrievable", !!otp);
  o = await post("/api/superadmin", { action: "verify_otp", otp: otp! });
  check("verify_otp ok + vv_sa cookie", o.data.ok === true && o.setCookies.some((c) => c.startsWith("vv_sa=")), o.setCookies.map((c) => c.split("=")[0]).join(","));
  const saCookie = o.setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("vv_sa="));
  probe = await post("/api/superadmin", { action: "auth" }, saCookie);
  check("SA probe restores via cookie", probe.data.ok === true && !!probe.data.stats);
  const slo = await post("/api/superadmin", { action: "logout" }, saCookie);
  check("SA logout 200", slo.status === 200 && slo.data.ok === true);
  const saExpire = slo.setCookies.find((c) => c.startsWith("vv_sa="));
  check("SA logout sends vv_sa expiry", !!saExpire && /max-age=0|expires=Thu, 01 Jan 1970/i.test(saExpire), saExpire?.slice(0, 80));
  const saAfter = await post("/api/superadmin", { action: "auth" }, saCookie);
  check("SA cookie dead after logout", saAfter.status === 401, `status=${saAfter.status}`);

  // ══ 4. The owner's exact scenario: logout, then "click recruiter" ══
  console.log("══ 4. Logout → click Recruiter on index (must NOT auto-login) ══");
  r = await post("/api/auth", { action: "signin", role: "RECRUITER", email: rEmail, password: "auditpass123" });
  const rc2 = r.setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("vv_rc="));
  await post("/api/auth", { action: "signout" }, rc2);
  // click "Recruiter sign in" → RecruiterDashboard probes with hint
  const click = await post("/api/auth", { action: "me", role: "RECRUITER" }, rc2);
  check("after signout, portal probe does NOT auto-login", (click.data.account ?? null) === null, JSON.stringify(click.data).slice(0, 80));

  // cleanup
  await db.recruiterSession.deleteMany({ where: { accountId: recruiter.id } });
  await db.checklistSession.deleteMany({ where: { accountId: candidate.id } });
  await db.recruiterAccount.delete({ where: { id: recruiter.id } });
  await db.checklistAccount.delete({ where: { id: candidate.id } });
  await db.$disconnect();
  console.log(failed === 0 ? "\nALL PASS — signout is sound; bug is presentation-layer" : `\n${failed} FAILED — real session bug`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
