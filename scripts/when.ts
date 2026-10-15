import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.checklistCompletion.findUnique({ where: { id: "cmurykxwx0009mxmj97cftttk" }, select: { createdAt: true, completedAt: true } });
console.log("createdAt:", c?.createdAt.toISOString(), "completedAt:", c?.completedAt.toISOString());
console.log("now:", new Date().toISOString());
await db.$disconnect();
