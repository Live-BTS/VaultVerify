// Companion to seed-browser-audit.ts — removes the browser-test recruiter
// account and its sessions. Safe to re-run (idempotent).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const acc = await db.recruiterAccount.findUnique({ where: { email: "browser.audit@example.com" } });
  if (acc) {
    await db.recruiterSession.deleteMany({ where: { accountId: acc.id } });
    await db.recruiterAccount.delete({ where: { id: acc.id } });
  }
  console.log("browser.audit cleaned");
  await db.$disconnect();
}
main();
