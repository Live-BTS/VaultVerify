import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Test fixture: an APPROVED ICU request for Emma so the browser fill can run.
const accId = "cmuraz1v50000pdovl2d6f1e0";
const existing = await db.checklistRequest.findFirst({ where: { accountId: accId, specialty: "ICU" } });
if (existing) {
  console.log("ICU request exists:", existing.id, existing.status, "completion:", !!existing.completionId);
} else {
  const r = await db.checklistRequest.create({
    data: { accountId: accId, profession: "Nursing", jobTitle: "RN", specialty: "ICU", status: "APPROVED", note: "Seed test request", decidedAt: new Date() },
  });
  console.log("Created ICU request:", r.id, r.status);
}

await db.$disconnect();
