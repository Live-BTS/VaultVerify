/**
 * One-time migration: seed CreditLedger opening entries so balances match
 * the pre-ledger sandbox state (grant 500, N already-spent verifications).
 * Idempotent — skips agencies that already have ledger rows.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const agencies = await db.agency.findMany();
  for (const agency of agencies) {
    const existing = await db.creditLedger.count({ where: { agencyId: agency.id } });
    if (existing > 0) {
      console.log(`${agency.slug}: ledger already exists (${existing} rows) — skipped`);
      continue;
    }
    // Count outbound verifications actually sent before the ledger existed.
    const refCount = await db.referenceRequest.count({});
    const inviteCount = await db.checklistInvite.count({});
    const spent = refCount + inviteCount;

    await db.creditLedger.create({
      data: {
        agencyId: agency.id,
        delta: agency.creditsGranted,
        reason: "Opening grant (sandbox plan)",
        actorType: "SYSTEM",
        balanceAfter: agency.creditsGranted,
      },
    });
    let balance = agency.creditsGranted;
    if (spent > 0) {
      balance -= spent;
      await db.creditLedger.create({
        data: {
          agencyId: agency.id,
          delta: -spent,
          reason: `Pre-ledger verifications (${refCount} reference requests + ${inviteCount} checklist invites)`,
          actorType: "SYSTEM",
          balanceAfter: balance,
        },
      });
    }
    console.log(`${agency.slug}: grant ${agency.creditsGranted}, spent ${spent}, balance ${balance}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
