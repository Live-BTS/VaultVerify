import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.checklistCompletion.findUnique({ where: { id: "cmurykxwx0009mxmj97cftttk" } });
const answers = JSON.parse(c.answers);
for (const a of answers) console.log(a.category.slice(0,14).padEnd(15), a.skill.slice(0,38).padEnd(39), "v:", String(a.value), "na:", a.na, "lp:", a.lastPerformed);
await db.$disconnect();
