// Refresh-logout repro: does a valid session cookie survive the /me probe?
// Scenarios:
//   A) recruiter-only cookies: signin → me → expect RECRUITER account
//   B) candidate+recruiter cookies in ONE jar (what the owner's browser has
//      after testing both portals): me → WHO WINS? (server checks candidate first)
//   C) RecruiterDashboard probe contract: d.role === "RECRUITER" required
//   D) GET /api/recruiter with cookie → dashboard data contract
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const stamp = Date.now().toString().slice(-6);

function jarOf(res: Response): string[] {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]);
}

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})), cookies: jarOf(res) };
}

async function main() {
  // Seed a verified+onboarded recruiter and a verified candidate directly.
  const { hashPassword } = await import("../src/lib/bts/auth");
  const rEmail = `repro.r.${stamp}@example.com`;
  const cEmail = `repro.c.${stamp}@example.com`;
  const recruiter = await db.recruiterAccount.create({
    data: {
      email: rEmail, name: "Repro Recruiter", passwordHash: hashPassword("testpass123"),
      emailVerified: true, onboardingComplete: true,
      phone: "5551234567", company: "Repro Health", city: "Austin", state: "TX", zip: "78701",
    },
  });
  const candidate = await db.checklistAccount.create({
    data: { email: cEmail, name: "Repro Candidate", passwordHash: hashPassword("testpass123"), emailVerified: true },
  });

  console.log("── A) recruiter-only jar ──");
  const signin = await post("/api/auth", { action: "signin", role: "RECRUITER", email: rEmail, password: "testpass123" });
  console.log("signin:", signin.status, JSON.stringify(signin.data).slice(0, 120), "cookies:", signin.cookies);
  const rCookie = signin.cookies.find((c) => c.startsWith("vv_rc="));
  if (!rCookie) throw new Error("no vv_rc Set-Cookie on signin!");
  const meA = await post("/api/auth", { action: "me" }, rCookie);
  console.log("me(recruiter-only):", meA.status, JSON.stringify(meA.data).slice(0, 160));
  console.log(meA.data.role === "RECRUITER" && meA.data.account ? "PASS A: recruiter session restored" : "FAIL A");

  console.log("\n── B) candidate+recruiter jar (owner's browser after testing both) ──");
  const csign = await post("/api/checklist/account", { action: "login", email: cEmail, password: "testpass123" });
  const cCookie = csign.cookies.find((c) => c.startsWith("vv_ck="));
  console.log("candidate signin:", csign.status, "cookie:", cCookie ? "vv_ck set" : "MISSING");
  const both = [rCookie, cCookie].filter(Boolean).join("; ");
  const meB = await post("/api/auth", { action: "me" }, both);
  console.log("me(both):", meB.status, JSON.stringify(meB.data).slice(0, 200));
  console.log(`→ /api/auth me reports role=${meB.data.role} (candidate-first priority)`);

  console.log("\n── C) RecruiterDashboard probe contract with both cookies ──");
  const wantsRecruiter = meB.data.ok && meB.data.account && meB.data.role === "RECRUITER";
  console.log(wantsRecruiter
    ? "dashboard probe passes — recruiter restored"
    : "PROBE FAILS → RecruiterDashboard renders AuthPanel (login gate) = the reported 'logged out on refresh'");

  console.log("\n── C2) THE FIX: same jar, role-hinted probe (what RecruiterDashboard now sends) ──");
  const meHint = await post("/api/auth", { action: "me", role: "RECRUITER" }, both);
  console.log("me(both, hint RECRUITER):", meHint.status, JSON.stringify(meHint.data).slice(0, 160));
  console.log(meHint.data.role === "RECRUITER" && meHint.data.account
    ? "PASS C2: recruiter restored despite the live candidate cookie"
    : "FAIL C2");

  console.log("\n── D) GET /api/recruiter with recruiter cookie ──");
  const dash = await fetch(`${BASE}/api/recruiter`, { headers: { cookie: rCookie! } });
  const dd = await dash.json().catch(() => ({}));
  console.log("dashboard:", dash.status, dd.ok ? `stats totalRequests=${dd.stats?.totalRequests ?? "?"}` : JSON.stringify(dd).slice(0, 120));

  // Candidate-portal probe for the same jar (what the owner sees on /):
  console.log("\n── E) ChecklistPortal probe (/api/checklist/account me) with both cookies ──");
  const meE = await post("/api/checklist/account", { action: "me" }, both);
  console.log("checklist me(both):", meE.status, "account:", meE.data.account ? meE.data.account.email : "null");

  await db.recruiterSession.deleteMany({ where: { accountId: recruiter.id } });
  await db.checklistSession.deleteMany({ where: { accountId: candidate.id } });
  await db.recruiterAccount.delete({ where: { id: recruiter.id } });
  await db.checklistAccount.delete({ where: { id: candidate.id } });
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
