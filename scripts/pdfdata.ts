import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const cs = await db.checklistCompletion.findMany({
  orderBy: { completedAt: "desc" },
  take: 8,
  select: { id: true, specialty: true, specialtyLabel: true, completedAt: true, accountId: true, answers: true, additional: true, attestation: true },
});
for (const c of cs) {
  const acc = await db.checklistAccount.findUnique({ where: { id: c.accountId }, select: { name: true, email: true } });
  const nAnswers = (() => { try { return (JSON.parse(c.answers) as unknown[]).length; } catch { return 0; } })();
  const nAdd = (() => { try { return (JSON.parse(c.additional || "[]") as unknown[]).length; } catch { return 0; } })();
  const hasAtt = !!c.attestation;
  console.log(c.id, "|", acc?.name, "|", c.specialty, "|", nAnswers, "answers |", nAdd, "extras | att:", hasAtt, "|", c.completedAt?.toISOString());
}
await db.$disconnect();
