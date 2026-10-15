// Check priya's completions + server-side DB path
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const acc = await db.checklistAccount.findUnique({ where: { email: "priya.n@example.com" } });
  const comps = await db.checklistCompletion.findMany({
    where: { accountId: acc!.id },
    orderBy: { completedAt: "desc" },
    select: { id: true, specialty: true, completedAt: true, source: true },
  });
  console.log("priya completions:", JSON.stringify(comps, null, 1));
  const att = await db.checklistCompletion.findFirst({
    where: { accountId: acc!.id, specialty: "ICU" },
    select: { answers: true, additional: true, attestation: true },
  });
  if (att) {
    const answers = JSON.parse(att.answers || "[]");
    console.log("ICU answers:", answers.length, "first:", JSON.stringify(answers[0]));
    console.log("additional:", att.additional.slice(0, 120));
    console.log("attestation:", att.attestation ? att.attestation.slice(0, 120) : "EMPTY");
  } else {
    console.log("NO ICU COMPLETION");
  }
}
main().finally(() => db.$disconnect());
