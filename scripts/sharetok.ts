import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const links = await db.checklistShareLink.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { token: true, accessType: true, durationDays: true, label: true, revoked: true, completionId: true } });
for (const l of links) console.log(JSON.stringify(l));
await db.$disconnect();
