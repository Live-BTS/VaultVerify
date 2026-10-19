// Delete BUILTIN-source SkillTemplate rows via direct Postgres SQL (bun) —
// independent of which Prisma client is currently generated.
// Usage:  source .vv-prod-dsn && bun scripts/builtin-wipe-sql.ts
import { SQL } from "bun";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgres")) {
  console.error("Refusing: DATABASE_URL is not a postgres DSN.");
  process.exit(1);
}
const sql = new SQL(url, { connectionTimeout: 8, maxLifetime: 0 });
const before = (await sql`select source, count(*)::int as n from "SkillTemplate" group by source order by source`) as {
  source: string;
  n: number;
}[];
console.log("before:", before.map((r) => `${r.source}=${r.n}`).join(", ") || "(empty)");
const del = await sql`delete from "SkillTemplate" where source = 'BUILTIN'`;
console.log("deleted BUILTIN rows:", del.count ?? del);
const after = (await sql`select source, count(*)::int as n from "SkillTemplate" group by source order by source`) as {
  source: string;
  n: number;
}[];
console.log("after:", after.map((r) => `${r.source}=${r.n}`).join(", ") || "(empty)");
await sql.end();
