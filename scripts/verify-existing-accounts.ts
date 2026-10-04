// Marks all existing candidate accounts as email-verified (one-time migration
// after the verification gate shipped, so legacy/demo accounts stay usable).
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
process.env.DATABASE_URL = line!.slice("DATABASE_URL=".length).trim();

const p = new PrismaClient();
try {
  const r1 = await p.checklistAccount.updateMany({ where: { emailVerified: false }, data: { emailVerified: true } });
  console.log("candidates verified:", r1.count);
} finally {
  await p.$disconnect();
}
