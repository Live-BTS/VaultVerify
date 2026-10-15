// One-time data alignment for the 30-day validity policy.
// Tightens ONLY: expiresAt = min(current expiresAt, completedAt + 30 days).
// Never extends any record; prints before/after for every row it touches.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

async function main() {
  const rows = await db.checklistCompletion.findMany({
    select: { id: true, completedAt: true, expiresAt: true, profession: true, specialtyLabel: true },
  });
  console.log(`Found ${rows.length} completed checklist(s)`);
  let changed = 0;
  for (const r of rows) {
    const policyExpiry = new Date(new Date(r.completedAt).getTime() + VALIDITY_MS);
    if (r.expiresAt > policyExpiry) {
      console.log(`  clamp ${r.id} (${r.specialtyLabel ?? r.profession}): ${r.expiresAt.toISOString()} -> ${policyExpiry.toISOString()}`);
      await db.checklistCompletion.update({ where: { id: r.id }, data: { expiresAt: policyExpiry } });
      changed++;
    } else {
      console.log(`  ok    ${r.id} (${r.specialtyLabel ?? r.profession}): ${r.expiresAt.toISOString()} already within 30-day policy`);
    }
  }
  console.log(`Done — ${changed} record(s) tightened to the 30-day policy, ${rows.length - changed} already compliant.`);
}

main().finally(() => db.$disconnect());
