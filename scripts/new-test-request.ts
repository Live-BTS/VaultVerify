// Sandbox test helper: create an APPROVED checklist request for a specialty the
// demo candidate has NOT completed yet, so the fill->consent->submit flow can be
// verified end-to-end in the browser.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const email = "emma.chen@example.com";
const acc = await db.checklistAccount.findUnique({ where: { email } });
if (!acc) { console.log("no demo account"); process.exit(1); }

const completions = await db.checklistCompletion.findMany({ where: { accountId: acc.id }, select: { specialty: true, specialtyLabel: true, expiresAt: true } });
console.log("existing completions:", completions.map((c) => `${c.specialty} (valid until ${String(c.expiresAt ?? "").slice(0, 10)})`).join(", "));

// pick a Nursing/RN specialty with active templates that has no valid completion
const templates = await db.skillTemplate.findMany({ where: { active: true, profession: "Nursing", jobTitle: "RN" }, select: { specialty: true }, distinct: ["specialty"] });
const taken = new Set(completions.filter((c) => c.expiresAt > new Date()).map((c) => c.specialty));
const open = templates.map((t) => t.specialty).filter((s) => !taken.has(s) && s !== "GENERAL");
console.log("candidate specialties:", templates.map((t) => t.specialty).join(", "));
console.log("open for test:", open.join(", ") || "none");
if (!open.length) process.exit(1);
const specialty = open[0];

const dupe = await db.checklistRequest.findFirst({ where: { accountId: acc.id, specialty, status: { in: ["PENDING", "APPROVED"] } } });
if (dupe) {
  if (dupe.status !== "APPROVED") await db.checklistRequest.update({ where: { id: dupe.id }, data: { status: "APPROVED", decidedAt: new Date() } });
  console.log("using existing request:", dupe.id, dupe.status);
} else {
  const r = await db.checklistRequest.create({ data: { accountId: acc.id, profession: "Nursing", jobTitle: "RN", specialty, status: "APPROVED", decidedAt: new Date() } });
  console.log("created approved request:", r.id, specialty);
}
await db.$disconnect();
