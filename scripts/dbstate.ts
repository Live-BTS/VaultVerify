import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const reqs = await db.checklistRequest.findMany({ select: { id: true, specialty: true, status: true, accountId: true } });
console.log("REQUESTS:", JSON.stringify(reqs, null, 1));

const tpl = await db.skillTemplate.groupBy({ by: ["specialty"], where: { active: true }, _count: true });
console.log("TEMPLATES:", JSON.stringify(tpl));

const comps = await db.checklistCompletion.findMany({
  select: { id: true, specialty: true, answers: true, additional: true, attestation: true, accountId: true, expiresAt: true },
});
for (const c of comps) console.log("COMPLETION:", c.id, c.specialty, "answersLen:", c.answers.length, "addLen:", c.additional.length, "attLen:", c.attestation.length, "expires:", c.expiresAt.toISOString().slice(0, 10));

const accs = await db.checklistAccount.findMany({ select: { email: true, name: true } });
console.log("ACCOUNTS:", JSON.stringify(accs));

const extras = await db.checklistExtraQuestion.findMany({ select: { id: true, kind: true, prompt: true, active: true, specialty: true, sortOrder: true } });
console.log("EXTRAS:", JSON.stringify(extras, null, 1));

const shares = await db.checklistShareLink.findMany({ select: { token: true, accessType: true, revoked: true, completionId: true } });
console.log("SHARES:", JSON.stringify(shares));

await db.$disconnect();
