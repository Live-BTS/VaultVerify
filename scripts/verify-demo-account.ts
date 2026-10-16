// Sandbox test helper: mark the demo candidate as email-verified so the
// browser test can sign in (sandbox has no real mailbox to click the link).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const acc = await db.checklistAccount.findUnique({ where: { email: "emma.chen@example.com" } });
if (!acc) { console.log("no demo account"); process.exit(1); }
console.log("emailVerified before:", acc.emailVerified);
if (!acc.emailVerified) {
  await db.checklistAccount.update({ where: { id: acc.id }, data: { emailVerified: true } });
  console.log("updated -> true");
} else {
  console.log("already verified");
}
await db.$disconnect();
