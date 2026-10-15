// Prepare a fresh APPROVED ICU request for priya.n@example.com (mimics superadmin approval)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const accs = await db.checklistAccount.findMany({ select: { id: true, email: true } });
  console.log("accounts:", accs.map((a) => a.email).join(", "));
  const email = accs.some((a) => a.email === "priya.n@example.com") ? "priya.n@example.com" : accs.find((a) => !a.email.includes("emma"))?.email ?? accs[0].email;
  const acc = await db.checklistAccount.findUnique({ where: { email } });
  if (!acc) throw new Error("no account");
  const comps = await db.checklistCompletion.findMany({ where: { accountId: acc.id }, select: { specialty: true } });
  console.log(`using ${email}; existing completions:`, comps.map((c) => c.specialty).join(", ") || "none");
  const existing = await db.checklistRequest.findFirst({
    where: { accountId: acc.id, specialty: "ICU", status: "APPROVED", completion: null },
  });
  if (existing) { console.log("approved ICU request already prepared:", existing.id); return; }
  const req = await db.checklistRequest.create({
    data: { accountId: acc.id, profession: "Nursing", jobTitle: "RN", specialty: "ICU", status: "APPROVED", decidedAt: new Date() },
  });
  console.log("created approved ICU request:", req.id, "for", email);
}
main().finally(() => db.$disconnect());
