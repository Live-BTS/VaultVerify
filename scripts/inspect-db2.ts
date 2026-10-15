import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const comps = await db.checklistCompletion.findMany({ orderBy: { completedAt: "desc" }, take: 5, select: { id: true, accountId: true, specialty: true, additional: true, attestation: true, yearsExperience: true, answers: true } });
console.log("COMPLETIONS:", comps.length);
for (const c of comps) {
  console.log("  ", c.id, c.specialty, "attLen:", c.attestation.length, "addLen:", (c.additional || "").length, "ansLen:", c.answers.length, "years:", c.yearsExperience);
  const arr = JSON.parse(c.answers);
  console.log("    rows:", arr.length, "withLastPerformed:", arr.filter((a: any) => a.lastPerformed).length, "first:", JSON.stringify(arr[0]));
}

const extras = await db.checklistExtraQuestion.findMany({ orderBy: { sortOrder: "asc" } });
console.log("EXTRAS:", extras.length);
for (const e of extras) console.log("   ", e.kind, "|", e.prompt.slice(0, 40), "| active:", e.active, "| spec:", e.specialty || "(global)");

await db.$disconnect();
