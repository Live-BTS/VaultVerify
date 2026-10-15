import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const accounts = await db.checklistAccount.findMany({ where: { OR: [{ email: { contains: "emma" } }, { email: { contains: "maya" } }] }, select: { id: true, email: true, name: true } });
console.log("ACCOUNTS:", JSON.stringify(accounts));

const requests = await db.checklistRequest.findMany({ orderBy: { requestedAt: "desc" }, take: 6, select: { id: true, accountId: true, specialty: true, status: true } });
console.log("REQUESTS:", JSON.stringify(requests));

const invites = await db.checklistInvite.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, email: true, specialty: true, status: true } });
console.log("INVITES:", JSON.stringify(invites));

const comps = await db.checklistCompletion.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, accountId: true, specialty: true, additional: true, attestation: true, yearsExperience: true } });
for (const c of comps) {
  const ans = await (db as any).checklistCompletion.findUnique({ where: { id: c.id }, select: { answers: true } });
  console.log("COMPLETION:", c.id, c.specialty, "attLen:", c.attestation.length, "addLen:", (c.additional || "").length, "ansLen:", ans?.answers?.length, "years:", c.yearsExperience);
}

const extras = await (db as any).checklistExtraQuestion.findMany({ orderBy: { sortOrder: "asc" } });
console.log("EXTRAS:", extras.length, extras.map((e: any) => `${e.kind}:${e.prompt.slice(0, 30)}`).join(" | "));

await db.$disconnect();
