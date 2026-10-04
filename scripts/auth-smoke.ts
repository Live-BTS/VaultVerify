// End-to-end smoke test for the new auth stack:
//   recruiter signup → email verify → onboarding → session dashboard
//   candidate signup → email verify
//   superadmin OTP request → verify → token auth + backup code
// Uses example.com addresses so the demo-domain guard simulates email sends.
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
process.env.DATABASE_URL = line!.slice("DATABASE_URL=".length).trim();

const BASE = "http://localhost:3000";
const db = new PrismaClient();
let failed = 0;

function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

async function api(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { status: res.status, data: await res.json().catch(() => ({})), setCookie };
}

const stamp = Date.now().toString().slice(-6);

// ── 1. Recruiter signup → verify → onboard → session dashboard ──
const rEmail = `recruiter.${stamp}@example.com`;
let r = await api("/api/auth", { action: "signup", role: "RECRUITER", name: "Test Recruiter", email: rEmail, password: "testpass123" });
check("recruiter signup → checkEmail", r.data.ok === true && r.data.checkEmail === true, `sentTo=${r.data.sentTo}`);
const rv = await db.emailVerification.findFirst({ where: { email: rEmail, consumedAt: null }, orderBy: { createdAt: "desc" } });
check("recruiter verification token stored", !!rv);

r = await api("/api/auth", { action: "verify", token: rv!.token });
check("recruiter verify → session", r.data.ok === true && r.data.role === "RECRUITER" && r.data.onboardingComplete === false, `cookie=${!!r.setCookie}`);
const rCookie = r.setCookie;

r = await api("/api/auth", { action: "onboard_recruiter", name: "Test Recruiter", phone: "5551234567", company: "Test Health", jobTitle: "Recruiter", city: "Austin", state: "TX", zip: "78701" }, rCookie);
check("recruiter onboarding saved", r.data.ok === true);

const dash = await fetch(`${BASE}/api/recruiter?code=`, { headers: { cookie: rCookie } });
check("session dashboard loads (no code)", dash.status === 200);

// ── 2. Candidate signup → verify ──
const cEmail = `candidate.${stamp}@example.com`;
let c = await api("/api/checklist/account", { action: "signup", name: "Test Candidate", email: cEmail, password: "testpass123", title: "RN" });
check("candidate signup → checkEmail", c.data.ok === true && c.data.checkEmail === true);
const cv = await db.emailVerification.findFirst({ where: { email: cEmail, consumedAt: null }, orderBy: { createdAt: "desc" } });
c = await api("/api/auth", { action: "verify", token: cv!.token });
check("candidate verify via link handler", c.data.ok === true && c.data.role === "CANDIDATE" && c.data.onboardingComplete === false);

// candidate login on /api/auth (unverified → needsVerification path sanity)
const c2 = await api("/api/auth", { action: "signup", role: "CANDIDATE", name: "Unverified Cand", email: `cand2.${stamp}@example.com`, password: "testpass123" });
check("candidate signup via /api/auth → checkEmail", c2.data.checkEmail === true);

// duplicate verified signup must be rejected
const dup = await api("/api/checklist/account", { action: "signup", name: "Test Candidate", email: cEmail, password: "testpass123" });
check("duplicate verified signup rejected", dup.status === 400);

// ── 3. Superadmin OTP ──
let o = await api("/api/superadmin", { action: "request_otp" });
check("OTP requested", o.data.ok === true, `sentTo=${o.data.sentTo} simulated=${o.data.simulated}`);
const log = await db.notificationLog.findFirst({ where: { kind: "OTP" }, orderBy: { createdAt: "desc" } });
const otp = log?.body.match(/\b(\d{6})\b/)?.[1];
check("OTP code retrievable from delivery log", !!otp);

o = await api("/api/superadmin", { action: "verify_otp", otp: "000000" });
check("wrong OTP rejected", o.data.ok === false);

o = await api("/api/superadmin", { action: "verify_otp", otp: otp! });
check("correct OTP → session token", o.data.ok === true && typeof o.data.token === "string" && o.data.token.startsWith("sas_"));
const saToken = o.data.token;

o = await api("/api/superadmin", { action: "auth", token: saToken });
check("token authenticates console", o.data.ok === true && !!o.data.stats);

o = await api("/api/superadmin", { action: "auth", code: "zipvault2026" });
check("backup code still works", o.data.ok === true);

o = await api("/api/superadmin", { action: "auth", code: "wrong-code" });
check("bad creds rejected", o.data.ok === false && o.status === 401);

// reuse of consumed OTP must fail
o = await api("/api/superadmin", { action: "verify_otp", otp: otp! });
check("consumed OTP single-use", o.data.ok === false);

await db.$disconnect();
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
