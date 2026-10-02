import { db } from "@/lib/db";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { CHECKLIST_VALIDITY_DAYS } from "@/lib/bts/constants";

// ── Idempotent demo seed for the Skills Checklist feature ──
// Demo candidate: emma.chen@example.com / demo1234
//  · completed ICU self-assessment (valid 1 year) — ready to share
//  · pending request for the GENERAL (Medication Administration) checklist — ready for superadmin approval

export async function seedChecklistDemo() {
  const email = "emma.chen@example.com";
  let account = await db.checklistAccount.findUnique({ where: { email } });
  if (!account) {
    account = await db.checklistAccount.create({
      data: {
        email, name: "Emma Chen", title: "RN", passwordHash: hashPassword("demo1234"),
        // onboarding / Data Center profile
        phone: "(555) 214-8890", city: "Denver", state: "CO", zip: "80203",
        profession: "Nursing", discipline: "RN", specialty: "ICU",
        yrsOverall: 6, yrsOverallStart: null, yrsSpecialty: 4, yrsSpecialtyStart: null,
        onboardingComplete: true,
      },
    });
  }

  // completed ICU checklist
  const hasCompletion = await db.checklistCompletion.findFirst({
    where: { accountId: account.id, specialty: "ICU" },
  });
  if (!hasCompletion) {
    const templates = await db.skillTemplate.findMany({
      where: { active: true, profession: "Nursing", jobTitle: "RN", specialty: "ICU" },
      orderBy: [{ sortOrder: "asc" }, { skillName: "asc" }],
    });
    if (templates.length) {
      const spread = [4, 3, 4, 2, 3, 4, 1, 3, 4, 2, 3, 4, 3];
      const answers = templates.map((t, i) => ({
        category: t.category,
        skill: t.skillName,
        questionType: t.questionType,
        value: t.highRisk && i % 5 === 3 ? null : spread[i % spread.length],
        na: t.highRisk && i % 5 === 3,
        highRisk: t.highRisk,
      }));
      await db.checklistCompletion.create({
        data: {
          accountId: account.id,
          profession: "Nursing",
          jobTitle: "RN",
          specialty: "ICU",
          specialtyLabel: "ICU / Critical Care",
          answers: JSON.stringify(answers),
          yearsExperience: 6,
          source: "SELF",
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + CHECKLIST_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  // pending request (superadmin approval demo)
  const hasPending = await db.checklistRequest.findFirst({
    where: { accountId: account.id, specialty: "GENERAL" },
  });
  if (!hasPending) {
    await db.checklistRequest.create({
      data: { accountId: account.id, profession: "Nursing", jobTitle: "RN", specialty: "GENERAL" },
    });
  }
}
