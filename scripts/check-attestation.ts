// Sandbox check: confirm the newest completion stored consentAccepted in its attestation JSON.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.checklistCompletion.findMany({
  where: { account: { email: "emma.chen@example.com" }, specialty: "MEDSURG" },
  orderBy: { completedAt: "desc" }, take: 1,
  select: { id: true, completedAt: true, attestation: true },
});
const att = rows[0] ? JSON.parse(rows[0].attestation || "{}") : null;
console.log(JSON.stringify({ id: rows[0]?.id, completedAt: rows[0]?.completedAt, agreed: att?.agreed, consentAccepted: att?.consentAccepted, mode: att?.mode, printedName: att?.printedName }, null, 2));
await db.$disconnect();
