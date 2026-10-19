// Browser-test seed: a verified+onboarded recruiter account for the
// owner-scenario walkthrough (scripts run from the repo so @prisma/client resolves).
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

async function main() {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync("browser-pass-123", salt, 64).toString("hex");
  await db.recruiterAccount.upsert({
    where: { email: "browser.audit@example.com" },
    update: { passwordHash: `${salt}:${hash}`, emailVerified: true, onboardingComplete: true },
    create: {
      email: "browser.audit@example.com", name: "Browser Audit", passwordHash: `${salt}:${hash}`,
      emailVerified: true, onboardingComplete: true,
      phone: "5551234567", company: "Audit Co", city: "Austin", state: "TX", zip: "78701",
    },
  });
  console.log("seeded browser.audit@example.com");
  await db.$disconnect();
}
main();
