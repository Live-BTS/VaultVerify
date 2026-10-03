// Verify the submitted completion persisted + create nothing
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const acc = await db.checklistAccount.findUnique({ where: { email: "priya.n@example.com" } });
  const comps = await db.checklistCompletion.findMany({ where: { accountId: acc!.id } });
  console.log("completions:", comps.length);
  for (const c of comps) {
    const answers = JSON.parse(c.answers || "[]");
    const additional = JSON.parse(c.additional || "[]");
    const att = c.attestation ? JSON.parse(c.attestation) : null;
    console.log(JSON.stringify({
      id: c.id, specialty: c.specialty,
      answers: answers.length,
      firstAnswer: answers[0],
      naAnswer: answers.find((a: { na: boolean }) => a.na) ?? null,
      additionalCount: additional.length,
      additionalFirst: additional[0] ?? null,
      attestation: att ? { mode: att.mode, printedName: att.printedName, sigLen: (att.signature || "").length, signedAt: att.signedAt } : null,
    }, null, 1));
  }
}
main().finally(() => db.$disconnect());
