/**
 * Phase 2 smoke tests — security center, view-as, session revocation,
 * share oversight, notification health, CSV exports.
 * Throwaway _p2smoke_ entities, cleaned up at the end.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/bts/checklistAuth";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const CODE = process.env.SUPERADMIN_CODE ?? "zipvault2026";
const EMAIL = `_p2smoke_${Date.now()}@example.com`;
const PASSWORD = "p2-smoke-pass-123";

async function api(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/superadmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODE, ...payload }),
  });
  return { status: res.status, data: await res.json() };
}

async function auth(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, data: await res.json() };
}

let pass = 0, failCount = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failCount++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function main() {
  const cand = await db.checklistAccount.create({
    data: { email: EMAIL, name: "P2 Smoke", passwordHash: hashPassword(PASSWORD), emailVerified: true },
  });

  // 1. view-as dossier (read-only proxy)
  const imp = await api({ action: "impersonate_view", kind: "CANDIDATE", id: cand.id });
  ok("impersonate_view returns dossier", imp.data.ok === true && imp.data.view.email === EMAIL && imp.data.view.kind === "CANDIDATE");
  const impAudit = await db.auditEvent.count({ where: { action: "IMPERSONATION_VIEWED", entityId: cand.id } });
  ok("view-as is audit-stamped", impAudit === 1);

  // 2. security_reset — token + simulated email (demo-domain guard) + sessions killed
  await db.checklistSession.create({ data: { id: `_p2_ses_${Date.now()}`, accountId: cand.id, expiresAt: new Date(Date.now() + 864e5) } });
  const reset = await api({ action: "security_reset", kind: "CANDIDATE", id: cand.id });
  const resetToken = await db.passwordResetToken.findFirst({ where: { accountId: cand.id, consumedAt: null }, orderBy: { createdAt: "desc" } });
  const sessionsAfterReset = await db.checklistSession.count({ where: { accountId: cand.id } });
  ok("security_reset emails link + kills sessions", reset.data.ok === true && !!resetToken && sessionsAfterReset === 0 && reset.data.simulated === true);

  // 3. public password_reset consumes the token
  const newPw = "brand-new-pass-99";
  const doReset = await auth({ action: "password_reset", token: resetToken?.token ?? "", password: newPw });
  const fresh = await db.checklistAccount.findUnique({ where: { id: cand.id } });
  const consumed = await db.passwordResetToken.findUnique({ where: { id: resetToken!.id } });
  ok("password_reset sets new hash", doReset.data.ok === true && !!fresh && consumed?.consumedAt !== null);
  const signInNew = await auth({ action: "signin", role: "CANDIDATE", email: EMAIL, password: newPw });
  ok("sign-in works with new password", signInNew.data.ok === true);

  // 4. failed-login counters
  await auth({ action: "signin", role: "CANDIDATE", email: EMAIL, password: "wrong-1" });
  await auth({ action: "signin", role: "CANDIDATE", email: EMAIL, password: "wrong-2" });
  const afterFails = await db.checklistAccount.findUnique({ where: { id: cand.id } });
  ok("failed logins counted", afterFails?.failedLogins === 2, `got ${afterFails?.failedLogins}`);
  await auth({ action: "signin", role: "CANDIDATE", email: EMAIL, password: newPw });
  const afterOk = await db.checklistAccount.findUnique({ where: { id: cand.id } });
  ok("successful sign-in resets counter", afterOk?.failedLogins === 0);

  // 5. temp password — changes hash, returns it once, emails link
  const temp = await api({ action: "security_temp_password", kind: "CANDIDATE", id: cand.id });
  const tempOk = typeof temp.data.tempPassword === "string" && temp.data.tempPassword.length >= 8;
  const signInTemp = await auth({ action: "signin", role: "CANDIDATE", email: EMAIL, password: temp.data.tempPassword ?? "" });
  ok("temp password issued + signs in", tempOk && signInTemp.data.ok === true);

  // 6. revoke_user_sessions
  await db.checklistSession.create({ data: { id: `_p2_ses2_${Date.now()}`, accountId: cand.id, expiresAt: new Date(Date.now() + 864e5) } });
  const revoke = await api({ action: "revoke_user_sessions", kind: "CANDIDATE", id: cand.id });
  const left = await db.checklistSession.count({ where: { accountId: cand.id } });
  ok("revoke_user_sessions kills live sessions", revoke.data.ok === true && left === 0);

  // 7. share oversight — create a completion + link, list, revoke
  const completion = await db.checklistCompletion.create({
    data: {
      accountId: cand.id, profession: "NURSING", jobTitle: "RN", specialty: "GENERAL",
      specialtyLabel: "General · RN · Nursing", answers: "[]", expiresAt: new Date(Date.now() + 864e5),
    },
  });
  const link = await db.checklistShareLink.create({
    data: { completionId: completion.id, accessType: "DURATION", durationDays: 7, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  const list = await api({ action: "shares_list" });
  const mine = (list.data.links ?? []).find((l: { id: string }) => l.id === link.id);
  ok("shares_list includes the new link", list.data.ok === true && !!mine && mine.owner === "P2 Smoke");
  const rev = await api({ action: "share_revoke", kind: "checklist", id: link.id });
  const revoked = await db.checklistShareLink.findUnique({ where: { id: link.id } });
  ok("share_revoke flips revoked", rev.data.ok === true && revoked?.revoked === true);

  // 8. notification health + CSV exports
  const notif = await api({ action: "notifications_list" });
  ok("notifications_list returns stats", notif.data.ok === true && typeof notif.data.stats.sent === "number");
  for (const what of ["users", "companies", "audit"] as const) {
    const exp = await api({ action: "export_csv", what });
    ok(`export_csv ${what}`, exp.data.ok === true && typeof exp.data.csv === "string" && exp.data.csv.includes(","));
  }

  // 9. cleanup
  await db.checklistShareLink.deleteMany({ where: { completionId: completion.id } });
  await db.checklistCompletion.delete({ where: { id: completion.id } });
  await db.passwordResetToken.deleteMany({ where: { accountId: cand.id } });
  await db.checklistSession.deleteMany({ where: { accountId: cand.id } });
  await db.checklistAccount.delete({ where: { id: cand.id } });

  console.log(`\n${pass} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
