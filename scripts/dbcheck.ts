// Quick DB state check for browser verification planning
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const accs = await db.checklistAccount.findMany({
    select: { id: true, email: true, name: true, onboardingComplete: true },
  });
  console.log("accounts:", accs.map((a) => `${a.email}(${a.name})`));

  const emma = accs.find((a) => a.email.includes("emma"));
  if (emma) {
    const reqs = await db.checklistRequest.findMany({
      where: { accountId: emma.id },
      select: { id: true, specialty: true, status: true, completion: { select: { id: true } } },
    });
    console.log("emma requests:", reqs.map((r) => ({ ...r, completionId: r.completion?.id ?? null })));

    const comps = await db.checklistCompletion.findMany({
      where: { accountId: emma.id },
      select: { id: true, specialty: true, completedAt: true },
    });
    console.log("emma completions:", comps);
  }

  const extras = await db.checklistExtraQuestion.findMany({ select: { id: true, kind: true, prompt: true, active: true } });
  console.log("extra questions:", extras.length, extras.map((e) => `${e.kind}:${e.prompt.slice(0, 30)}(${e.active ? "on" : "off"})`));

  const sets = await db.checklistSet.findMany({ select: { specialty: true, jobTitle: true, published: true } });
  console.log("catalog sets:", sets);

  const invites = await db.checklistInvite.findMany({
    select: { id: true, candidateEmail: true, specialty: true, status: true, completionId: true },
    take: 8,
  });
  console.log("invites:", invites);
}

main().finally(() => db.$disconnect());
