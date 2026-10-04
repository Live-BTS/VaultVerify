import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/bts/checklistAuth";
async function main() {
  const email = "priya.n@example.com";
  const existing = await db.checklistAccount.findUnique({ where: { email } });
  if (existing) { console.log("account exists"); return; }
  await db.checklistAccount.create({ data: { email, name: "Priya Natarajan", title: "RN", passwordHash: hashPassword("demo1234"), onboardingComplete: true } });
  console.log("Priya portal account created");
}
main().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));
