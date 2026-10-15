// Seed a Candidate + reference requests for priya.n@example.com so the nurse
// portal References tab shows live data (one completed, one pending).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = "priya.n@example.com";
  const existing = await db.candidate.findFirst({ where: { email } });
  if (existing) {
    console.log("Candidate already exists:", existing.id);
    return;
  }

  const agency = (await db.agency.findUnique({ where: { slug: "vaultverify" } })) ?? (await db.agency.findFirst());
  if (!agency) throw new Error("No agency found");

  const candidate = await db.candidate.create({
    data: {
      agencyId: agency.id,
      fullName: "Priya Natarajan",
      email,
      phone: "(312) 555-0182",
      role: "RN",
      specialty: "ICU",
      yearsExperience: 6,
      city: "Chicago",
      state: "IL",
      licenseNumber: "IL-RN-90211",
      consentSignature: "Priya Natarajan",
      consentSignedAt: new Date(),
      requests: {
        create: [
          {
            refName: "Marcus Bell",
            refTitle: "ICU Nurse Manager",
            refEmail: "mbell@northwesternmedicine.org",
            refPhone: "(312) 555-0161",
            facilityName: "Northwestern Memorial Hospital",
            facilityCity: "Chicago",
            facilityState: "IL",
            relationship: "Direct supervisor",
            workStartDate: "2021-06",
            workEndDate: "",
            status: "COMPLETED",
            sentAt: new Date(Date.now() - 6 * 86400000),
            openedAt: new Date(Date.now() - 5 * 86400000),
            startedAt: new Date(Date.now() - 4 * 86400000),
            completedAt: new Date(Date.now() - 4 * 86400000),
            expiresAt: new Date(Date.now() + 8 * 86400000),
            response: {
              create: {
                identityMethod: "EMAIL_DOMAIN",
                verifiedDomain: "northwesternmedicine.org",
                confirmedRelationship: "Direct supervisor",
                confirmedFacility: "Northwestern Memorial Hospital",
                confirmedDates: "Jun 2021 – present",
                answers: "[]",
                overallRating: 4.6,
                q8Discipline: false,
                remarks: "Outstanding critical thinking and calm under pressure. Independent with all core ICU skills.",
                signatureName: "Marcus Bell, MSN, RN",
                signedAt: new Date(Date.now() - 4 * 86400000),
                durationSeconds: 511,
                skillsVerified: true,
              },
            },
          },
          {
            refName: "Sofia Andres",
            refTitle: "Charge Nurse, MICU",
            refEmail: "s.andres@rush.edu",
            refPhone: "(312) 555-0188",
            facilityName: "Rush University Medical Center",
            facilityCity: "Chicago",
            facilityState: "IL",
            relationship: "Charge nurse / team lead",
            workStartDate: "2018-03",
            workEndDate: "2021-05",
            status: "SENT",
            sentAt: new Date(Date.now() - 2 * 86400000),
            expiresAt: new Date(Date.now() + 12 * 86400000),
          },
        ],
      },
    },
  });

  console.log("Seeded candidate:", candidate.id, "with 2 reference requests");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
