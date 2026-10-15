// Prepare a fresh APPROVED request for browser verification of the fill flow
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const accs = await db.checklistAccount.findMany({ select: { id: true, email: true } });
  for (const email of ["priya.n@example.com", "tara.o@example.com"]) {
    const acc = accs.find((a) => a.email === email);
    if (!acc) { console.log(email, "— no account"); continue; }
    const comps = await db.checklistCompletion.findMany({ where: { accountId: acc.id }, select: { specialty: true } });
    const reqs = await db.checklistRequest.findMany({ where: { accountId: acc.id }, select: { specialty: true, status: true } });
    console.log(email, "completions:", comps.map((c) => c.specialty), "requests:", reqs);
  }
}
main().finally(() => db.$disconnect());
