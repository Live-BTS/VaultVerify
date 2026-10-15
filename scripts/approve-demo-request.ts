// Sandbox test helper: approve Emma's seeded pending GENERAL request so the
// fill form (and the new consent checkbox) can be verified in the browser.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const email = "emma.chen@example.com";
const acc = await db.checklistAccount.findUnique({ where: { email } });
if (!acc) { console.log("no demo account"); process.exit(1); }
const reqs = await db.checklistRequest.findMany({ where: { accountId: acc.id, specialty: "GENERAL" } });
for (const r of reqs) {
  if (r.status !== "APPROVED") {
    await db.checklistRequest.update({ where: { id: r.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    console.log("approved:", r.id);
  } else console.log("already approved:", r.id);
}
if (!reqs.length) console.log("no GENERAL request found");
await db.$disconnect();
