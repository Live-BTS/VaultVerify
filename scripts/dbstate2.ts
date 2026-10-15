import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const comps = await db.checklistCompletion.findMany({ select: { id: true, specialty: true, accountId: true } });
const accs = await db.checklistAccount.findMany({ select: { id: true, email: true } });
const amap = Object.fromEntries(accs.map((a) => [a.id, a.email]));
for (const c of comps) console.log("COMP:", c.id, c.specialty, amap[c.accountId]);

const invites = await db.checklistInvite.findMany({ select: { id: true, specialty: true, candidateEmail: true, status: true, completionId: true, recruiterName: true, accountId: true } });
console.log("INVITES:", JSON.stringify(invites, null, 1));

const reqs2 = await db.checklistRequest.findMany({ select: { id: true, specialty: true, status: true, accountId: true } });
for (const r of reqs2) console.log("REQ:", r.id, r.specialty, r.status, amap[r.accountId]);

await db.$disconnect();
