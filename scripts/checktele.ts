import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const comps = await db.checklistCompletion.findMany({ where: { specialty: "TELE" }, orderBy: { completedAt: "desc" }, take: 2 });
for (const c of comps) {
  const a = JSON.parse(c.answers);
  console.log("ID:", c.id, "| yrs:", c.yearsExperience, "| source:", c.source);
  console.log("ratings:", a.map((x: any) => x.na ? "NA" : x.value).join(","));
  console.log("recency:", a.map((x: any) => x.lastPerformed).join(","));
  const rated = a.filter((x: any) => !x.na).map((x: any) => Number(x.value));
  console.log("avg:", (rated.reduce((s: number, v: number) => s + v, 0) / rated.length).toFixed(2), "| addLen:", c.additional.length, "| attLen:", c.attestation.length);
  const att = JSON.parse(c.attestation || "{}");
  console.log("att mode:", att.mode, "| printed:", att.printedName, "| sig head:", (att.signature||"").slice(0,30));
  console.log("additional:", JSON.parse(c.additional).map((q: any) => `${q.kind}:${q.value}`).join(" "));
}
await db.$disconnect();
