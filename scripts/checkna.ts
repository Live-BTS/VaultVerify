import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.checklistCompletion.findUnique({ where: { id: "cmurykxwx0009mxmj97cftttk" } });
const answers = JSON.parse(c.answers);
for (const a of answers) {
  if (a.na || a.value === null || a.lastPerformed === "na") console.log("SPECIAL:", JSON.stringify(a));
}
console.log("na count:", answers.filter((a) => a.na).length, "| null-value count:", answers.filter((a) => a.value === null).length, "| lp=na:", answers.filter((a) => a.lastPerformed === "na").length);
console.log("mix:", [1,2,3,4].map((n) => answers.filter((a) => Number(a.value) === n).length).join("/"));
await db.$disconnect();
