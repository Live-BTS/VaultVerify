/**
 * Phase 3 smoke tests — 3-tier RBAC (team), fraud tuning config, checklist cloning.
 * Throwaway _p3smoke_ entities, cleaned up at the end.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const CODE = process.env.SUPERADMIN_CODE ?? "zipvault2026";
const STAMP = Date.now();
const ADMIN_EMAIL = `_p3smoke_admin_${STAMP}@example.com`;
const SUPPORT_EMAIL = `_p3smoke_support_${STAMP}@example.com`;
const GHOST_EMAIL = `_p3smoke_ghost_${STAMP}@example.com`;
const CLONE_KEY = `SMOKE_P3_${STAMP}`;

async function api(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/superadmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODE, ...payload }),
  });
  return { status: res.status, data: await res.json() };
}

async function callAs(token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/superadmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...payload }),
  });
  return { status: res.status, data: await res.json() };
}

let pass = 0, failCount = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failCount++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function main() {
  // ── 1. Owner identity via backup code ──
  const owner = await api({ action: "auth" });
  ok("owner auth returns OWNER identity", owner.data.ok === true && owner.data.identity?.role === "OWNER");

  // ── 2. Team invites (OWNER only) ──
  const invAdmin = await api({ action: "team_invite", email: ADMIN_EMAIL, name: "P3 Admin", role: "ADMIN" });
  ok("invite ADMIN member", invAdmin.data.ok === true && invAdmin.data.member?.role === "ADMIN");
  const invSupport = await api({ action: "team_invite", email: SUPPORT_EMAIL, name: "P3 Support", role: "SUPPORT" });
  ok("invite SUPPORT member", invSupport.data.ok === true && invSupport.data.member?.role === "SUPPORT");
  const invDup = await api({ action: "team_invite", email: ADMIN_EMAIL, role: "ADMIN" });
  ok("duplicate invite rejected 409", invDup.status === 409);
  const invOwner = await api({ action: "team_invite", email: owner.data.identity.email, role: "ADMIN" });
  ok("cannot re-invite the owner address", invOwner.status === 400);
  const inviteAudit = await db.auditEvent.count({ where: { action: "SUBADMIN_INVITED" } });
  ok("invites audit-stamped", inviteAudit >= 2);

  // ── 3. team_list ──
  const list = await api({ action: "team_list" });
  const adminRow = (list.data.team ?? []).find((m: { email: string }) => m.email === ADMIN_EMAIL);
  const supportRow = (list.data.team ?? []).find((m: { email: string }) => m.email === SUPPORT_EMAIL);
  ok("team_list shows both members", list.data.ok === true && !!adminRow && !!supportRow);

  // ── 4. Team-member sessions (OTP delivery already covered in earlier phases;
  //      sessions are created directly to exercise role enforcement) ──
  const mkSession = async (accountId: string) => {
    const token = `sas_p3_${STAMP}_${accountId.slice(-6)}`;
    await db.superAdminSession.create({
      data: { token, accountId, email: "", role: "SUPPORT", expiresAt: new Date(Date.now() + 3600_000) },
    });
    return token;
  };
  const adminToken = await mkSession(adminRow.id);
  const supportToken = await mkSession(supportRow.id);

  // ADMIN: everything except owner-only commands
  const adminAllowed = await callAs(adminToken, { action: "audit_query", days: 1 });
  ok("ADMIN can query the audit log", adminAllowed.status === 200 && adminAllowed.data.ok === true);
  const adminDeniedOwner = await callAs(adminToken, { action: "set_platform", key: "MAINTENANCE_MODE", value: true });
  ok("ADMIN blocked from maintenance mode (403)", adminDeniedOwner.status === 403);
  const adminDeniedTeam = await callAs(adminToken, { action: "team_list" });
  ok("ADMIN blocked from team management (403)", adminDeniedTeam.status === 403);
  const adminNuke = await callAs(adminToken, { action: "revoke_all_sessions" });
  ok("ADMIN blocked from platform-wide revoke (403)", adminNuke.status === 403);
  const adminFraudSet = await callAs(adminToken, { action: "fraud_config_set", config: { rapidSeconds: 45, duplicateIp: false } });
  ok("ADMIN can save fraud tuning", adminFraudSet.status === 200 && adminFraudSet.data.config?.rapidSeconds === 45 && adminFraudSet.data.config?.duplicateIp === false);

  // SUPPORT: read-only by construction
  const supportRead = await callAs(supportToken, { action: "audit_query", days: 1 });
  ok("SUPPORT can query the audit log", supportRead.status === 200 && supportRead.data.ok === true);
  const supportConfigGet = await callAs(supportToken, { action: "fraud_config_get" });
  ok("SUPPORT can read fraud config", supportConfigGet.status === 200 && supportConfigGet.data.ok === true);
  const supportWrite1 = await callAs(supportToken, { action: "fraud_config_set", config: { rapidSeconds: 10 } });
  ok("SUPPORT blocked from fraud tuning write (403)", supportWrite1.status === 403);
  const supportWrite2 = await callAs(supportToken, { action: "set_user_status", kind: "CANDIDATE", id: "x", status: "SUSPENDED" });
  ok("SUPPORT blocked from user suspension (403)", supportWrite2.status === 403);
  const supportWrite3 = await callAs(supportToken, { action: "export_csv", what: "users" });
  ok("SUPPORT blocked from CSV export (403)", supportWrite3.status === 403);
  const supportWrite4 = await callAs(supportToken, { action: "clone_set", profession: "Nursing", jobTitle: "RN", specialty: "GENERAL", toSpecialty: CLONE_KEY + "_B" });
  ok("SUPPORT blocked from cloning (403)", supportWrite4.status === 403);

  // ── 5. Role change applies to the live session instantly ──
  await api({ action: "team_set_role", id: supportRow.id, role: "ADMIN" });
  const promoted = await callAs(supportToken, { action: "fraud_config_set", config: { rapidSeconds: 90 } });
  ok("promoted SUPPORT→ADMIN works mid-session", promoted.status === 200 && promoted.data.config?.rapidSeconds === 90);
  const roleAudit = await db.auditEvent.count({ where: { action: "SUBADMIN_ROLE_CHANGED" } });
  ok("role change audit-stamped", roleAudit >= 1);

  // ── 6. Suspension kills the session instantly; reactivation requires a fresh sign-in ──
  const susp = await api({ action: "team_set_status", id: adminRow.id, status: "SUSPENDED" });
  const suspendedCall = await callAs(adminToken, { action: "audit_query", days: 1 });
  ok("suspended member's session dies (401)", susp.data.ok === true && suspendedCall.status === 401);
  const sessionsGone = await db.superAdminSession.count({ where: { accountId: adminRow.id } });
  ok("suspension deleted the console session", sessionsGone === 0);
  await api({ action: "team_set_status", id: adminRow.id, status: "ACTIVE" });
  const stillDead = await callAs(adminToken, { action: "audit_query", days: 1 });
  const revivedList = await api({ action: "team_list" });
  const revivedRow = (revivedList.data.team ?? []).find((m: { email: string }) => m.email === ADMIN_EMAIL);
  ok("reactivation restores the account but not the killed session (sign in fresh)",
    revivedRow?.status === "ACTIVE" && stillDead.status === 401);

  // ── 7. Unknown team email cannot request an OTP ──
  const ghost = await api({ action: "request_otp", email: GHOST_EMAIL });
  ok("OTP request for unknown member rejected (403)", ghost.status === 403);

  // ── 8. Fraud config round-trip (owner, backup code) + restore defaults ──
  const cfgGet = await api({ action: "fraud_config_get" });
  ok("owner reads fraud config", cfgGet.data.ok === true && typeof cfgGet.data.config?.rapidSeconds === "number");
  const cfgSet = await api({ action: "fraud_config_set", config: { ...cfgGet.data.config, rapidSeconds: 30, minSurnameLength: 4 } });
  ok("owner saves fraud tuning", cfgSet.data.ok === true && cfgSet.data.config?.rapidSeconds === 30);
  const cfgBad = await api({ action: "fraud_config_set", config: { rapidSeconds: 99999 } });
  ok("absurd values clamp to valid range", cfgBad.data.ok === true && cfgBad.data.config?.rapidSeconds <= 600);
  const cfgAudit = await db.auditEvent.count({ where: { action: "FRAUD_CONFIG_UPDATED" } });
  ok("fraud tuning audit-stamped", cfgAudit >= 3);
  await api({ action: "fraud_config_set", config: {} }); // restore defaults

  // ── 9. Checklist cloning ──
  const src = await db.skillTemplate.count({ where: { profession: "Nursing", jobTitle: "RN", specialty: "GENERAL" } });
  const clone = await api({ action: "clone_set", profession: "Nursing", jobTitle: "RN", specialty: "GENERAL", toSpecialty: CLONE_KEY });
  ok("clone_set copies every row", clone.data.ok === true && clone.data.cloned === src && src > 0, `src=${src}`);
  const clonedRows = await db.skillTemplate.count({ where: { profession: "Nursing", jobTitle: "RN", specialty: CLONE_KEY } });
  ok("cloned rows exist with source=CLONE", clonedRows === src && (await db.skillTemplate.findFirst({ where: { specialty: CLONE_KEY } }))?.source === "CLONE");
  const cloneDup = await api({ action: "clone_set", profession: "Nursing", jobTitle: "RN", specialty: "GENERAL", toSpecialty: CLONE_KEY });
  ok("clone onto existing key rejected 409", cloneDup.status === 409);
  const cloneSame = await api({ action: "clone_set", profession: "Nursing", jobTitle: "RN", specialty: "GENERAL", toSpecialty: "general" });
  ok("clone onto itself (case-insensitive) rejected 400", cloneSame.status === 400);
  const cloneMissing = await api({ action: "clone_set", profession: "Nursing", jobTitle: "RN", specialty: "NOPE_P3", toSpecialty: "X" });
  ok("unknown source rejected 404", cloneMissing.status === 404);
  const overview = await api({ action: "auth" });
  const clonedSet = (overview.data.sets ?? []).find((s: { specialty: string }) => s.specialty === CLONE_KEY);
  ok("cloned set visible in library", !!clonedSet && clonedSet.count === src);
  const cloneAudit = await db.auditEvent.count({ where: { action: "SKILL_TEMPLATE_SET_CLONED" } });
  ok("clone audit-stamped", cloneAudit >= 1);
  const del = await api({ action: "deleteSet", profession: "Nursing", jobTitle: "RN", specialty: CLONE_KEY });
  ok("cloned set deletable via deleteSet", del.data.ok === true && del.data.deleted === src);

  // ── 10. cleanup ──
  await db.superAdminSession.deleteMany({ where: { token: { startsWith: "sas_p3_" } } });
  await db.superadminAccount.deleteMany({ where: { email: { in: [ADMIN_EMAIL, SUPPORT_EMAIL] } } });
  await db.skillTemplate.deleteMany({ where: { specialty: { startsWith: CLONE_KEY } } });
  await db.platformConfig.deleteMany({ where: { key: "FRAUD_CONFIG" } });

  console.log(`\n${pass} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
