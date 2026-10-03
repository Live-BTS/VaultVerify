import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { buildChecklistPdf, type ChecklistPdfData } from "../src/lib/bts/checklistPdf";

const db = new PrismaClient();
const id = process.argv[2] || "cmusu54bf0007lsuykina24zz";
const out = process.argv[3] || "/home/z/my-project/download/checklist-current.pdf";

const completion = await db.checklistCompletion.findUniqueOrThrow({ where: { id } });
const account = await db.checklistAccount.findUniqueOrThrow({ where: { id: completion.accountId } });

type RawAnswer = { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk?: boolean; lastPerformed?: string | null };
const safeParse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { const v = JSON.parse(raw || ""); return (v ?? fallback) as T; } catch { return fallback; }
};
const answers = safeParse<RawAnswer[]>(completion.answers, []);
const grouped: ChecklistPdfData["categories"] = [];
for (const a of answers) {
  let cat = grouped.find((g) => g.name === a.category);
  if (!cat) { cat = { name: a.category, items: [] }; grouped.push(cat); }
  cat.items.push({ skill: a.skill, questionType: a.questionType, value: a.value, na: a.na, highRisk: !!a.highRisk, lastPerformed: a.lastPerformed ?? null });
}

const bytes = await buildChecklistPdf({
  account: { name: account.name, email: account.email, title: account.title },
  completion: {
    profession: completion.profession,
    jobTitle: completion.jobTitle,
    specialty: completion.specialty,
    specialtyLabel: completion.specialtyLabel,
    yearsExperience: completion.yearsExperience,
    source: completion.source,
    completedAt: completion.completedAt,
    expiresAt: completion.expiresAt,
  },
  categories: grouped,
  additional: safeParse<ChecklistPdfData["additional"]>(completion.additional, []),
  attestation: completion.attestation ? safeParse<ChecklistPdfData["attestation"]>(completion.attestation, null) : null,
});

await writeFile(out, Buffer.from(bytes));
console.log("WROTE", out, bytes.length, "bytes");
await db.$disconnect();
