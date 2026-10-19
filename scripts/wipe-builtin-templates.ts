// OWNER DIRECTIVE (2026-10-20): remove the pre-filled skill checklist data.
// Deletes every BUILTIN source SkillTemplate row from the database it runs
// against. The skills library is owner-managed from here on: populated
// exclusively via SuperAdmin workbook imports (source=IMPORT rows untouched).
//
// Run against PROD only explicitly:
//   source .vv-prod-dsn && bun scripts/wipe-builtin-templates.ts --i-understand-production
// (uses the same consent flag as scripts/prod-wipe.ts)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  if (process.argv[2] !== "--i-understand-production" && process.env.NODE_ENV === "production") {
    console.error("Refusing: pass --i-understand-production to run against production.");
    process.exit(1);
  }
  const bySource = await db.skillTemplate.groupBy({ by: ["source"], _count: { _all: true } });
  console.log("before:", bySource.map((g) => `${g.source}=${g._count._all}`).join(", ") || "(empty)");
  const del = await db.skillTemplate.deleteMany({ where: { source: "BUILTIN" } });
  console.log(`deleted BUILTIN rows: ${del.count}`);
  const after = await db.skillTemplate.groupBy({ by: ["source"], _count: { _all: true } });
  console.log("after:", after.map((g) => `${g.source}=${g._count._all}`).join(", ") || "(empty)");
  await db.$disconnect();
}
main();
