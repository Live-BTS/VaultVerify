import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/bts/checklistAuth";
async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    console.error("Set DEMO_PASSWORD in the environment to seed the demo account (never hard-coded).");
    process.exit(1);
  }
  const email = "priya.n@example.com";
  const existing = await db.checklistAccount.findUnique({ where: { email } });
  if (existing) { console.log("account exists"); return; }
  await db.checklistAccount.create({ data: { email, name: "Priya Natarajan", title: "RN", passwordHash: hashPassword(password), onboardingComplete: true } });
  console.log("Priya portal account created");
}
main().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));
