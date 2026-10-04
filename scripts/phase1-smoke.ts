/**
 * Phase 1 command-layer smoke tests.
 * Uses throwaway test entities (prefixed _smoke_) and cleans up after.
 * Exercises: credit gate, overage, company status, user suspend + session kill,
 * flag decision, request revoke, audit query, ledger query — via the live API.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/bts/checklistAuth";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const CODE = process.env.SUPERADMIN_CODE ?? "zipvault2026";

async function api(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/superadmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODE, ...payload }),
  });
  return { status: res.status, data: await res.json() };
}

let pass = 0, failCount = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failCount++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function main() {
  // ── setup: throwaway company + candidate account ──
  const agency = await db.agency.create({ data: { name: "_smoke_co", slug: `_smoke_${Date.now()}`, creditsGranted: 10 } });
  const cand = await db.checklistAccount.create({
    data: { email: `_smoke_${Date.now()}@example.com`, name: "Smoke Test", passwordHash: hashPassword("smoke-pass-123"), status: "SUSPENDED" },
  });

  // 1. credit gate — 0 balance blocks, overage bypasses, suspend blocks
  const v0 = await api({ action: "credit_adjust", id: agency.id, delta: 5, reason: "smoke grant" });
  ok("grant +5 via API", v0.data.ok === true && v0.data.balance === 5);
  await api({ action: "credit_adjust", id: agency.id, delta: -5, reason: "smoke drain" });
  const v1 = await api({ action: "set_company_overage", id: agency.id, allow: false });
  ok("overage toggle ok", v1.data.ok === true);
  const { assertCanVerify } = await import("../src/lib/bts/credits");
  const blocked = await assertCanVerify(agency.id);
  ok("0 credits blocks outbound", !blocked.ok && blocked.status === 402, JSON.stringify(blocked));
  await db.agency.update({ where: { id: agency.id }, data: { allowOverage: true } });
  const overage = await assertCanVerify(agency.id);
  ok("post-paid overage bypasses 0", overage.ok === true);
  await db.agency.update({ where: { id: agency.id }, data: { allowOverage: false, status: "SUSPENDED" } });
  const suspended = await assertCanVerify(agency.id);
  ok("suspended company blocks outbound", !suspended.ok && suspended.status === 403);
  await db.agency.update({ where: { id: agency.id }, data: { status: "READ_ONLY" } });
  const readonly = await assertCanVerify(agency.id);
  ok("read-only company blocks outbound", !readonly.ok && readonly.status === 403);

  // 2. suspended user: session kill via command + login rejection
  await db.checklistSession.create({ data: { id: `_smoke_ses_${Date.now()}`, accountId: cand.id, expiresAt: new Date(Date.now() + 864e5) } });
  const sus = await api({ action: "set_user_status", kind: "CANDIDATE", id: cand.id, status: "SUSPENDED" });
  const sessionsLeft = await db.checklistSession.count({ where: { accountId: cand.id } });
  ok("suspend kills live sessions", sus.data.ok === true && sessionsLeft === 0, JSON.stringify({ ok: sus.data.ok, sessionsLeft }));
  const signin = await fetch(`${BASE}/api/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "signin", role: "CANDIDATE", email: cand.email, password: "smoke-pass-123" }),
  });
  ok("suspended sign-in rejected 403", signin.status === 403);
  const react = await api({ action: "set_user_status", kind: "CANDIDATE", id: cand.id, status: "ACTIVE" });
  ok("reactivate ok", react.data.ok === true);

  // 3. flag decision
  const req = await db.referenceRequest.findFirst();
  if (req) {
    const flag = await db.fraudFlag.create({ data: { requestId: req.id, type: "SMOKE_TEST", detail: "phase1 smoke", severity: "LOW" } });
    const dec = await api({ action: "flag_decide", id: flag.id, decision: "DISMISSED", note: "smoke dismissal" });
    const fresh = await db.fraudFlag.findUnique({ where: { id: flag.id } });
    ok("flag dismissed with note", dec.data.ok === true && fresh?.status === "DISMISSED" && fresh.resolved === true);
    await db.fraudFlag.delete({ where: { id: flag.id } });
  } else ok("flag decision (no reference request available — skipped)", true);

  // 4. request revoke
  const creq = await db.checklistRequest.create({
    data: { accountId: cand.id, profession: "NURSING", jobTitle: "RN", specialty: "GENERAL", status: "APPROVED", decidedAt: new Date() },
  });
  const rev = await api({ action: "revoke_request", id: creq.id, reason: "smoke revoke" });
  const freshReq = await db.checklistRequest.findUnique({ where: { id: creq.id } });
  ok("request revoked with reason", rev.data.ok === true && freshReq?.status === "REVOKED");

  // 5. audit_query returns our commands
  const au = await api({ action: "audit_query", q: "CREDIT_ADJUSTED", days: 1 });
  ok("audit query finds commands", au.data.ok === true && au.data.events.length >= 2);

  // 6. ledger_query shows opening + smoke entries
  const lq = await api({ action: "ledger_query" });
  const smokeRows = (lq.data.ledger ?? []).filter((l: { agency: string }) => l.agency === "_smoke_co");
  ok("ledger query returns entries", lq.data.ok === true && smokeRows.length >= 2);

  // 7. maintenance flag round-trip (off — never leave it on)
  const m1 = await api({ action: "set_platform", key: "MAINTENANCE_MODE", value: true });
  const m2 = await api({ action: "set_platform", key: "MAINTENANCE_MODE", value: false });
  ok("maintenance flag round-trip", m1.data.ok && m2.data.ok && m2.data.maintenance === false);

  // 8. connectivity ping
  const pg = await api({ action: "ping" });
  ok("connectivity ping (DB ok, Brevo live)", pg.data.ok && pg.data.db?.ok === true && pg.data.brevo?.ok === true, JSON.stringify(pg.data));

  // ── cleanup ──
  await db.checklistRequest.deleteMany({ where: { accountId: cand.id } });
  await db.checklistAccount.delete({ where: { id: cand.id } });
  await db.agency.delete({ where: { id: agency.id } }); // cascades ledger

  console.log(`\n${pass} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
