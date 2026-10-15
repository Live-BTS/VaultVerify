import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.checklistCompletion.findUnique({ where: { id: "cmurykxwx0009mxmj97cftttk" } });
if (!c) { console.log("NOT FOUND"); process.exit(0); }
console.log("specialty:", c.specialty, "| yearsExperience:", c.yearsExperience);
console.log("additional:", c.additional.slice(0, 400));
console.log("attestation head:", c.attestation.slice(0, 220));
const answers = JSON.parse(c.answers);
console.log("answer rows:", answers.length, "| sample:", JSON.stringify(answers[0]), JSON.stringify(answers[5]));
const lp = answers.filter((a) => a.lastPerformed).length;
console.log("rows with lastPerformed:", lp, "/", answers.length);
await db.$disconnect();
