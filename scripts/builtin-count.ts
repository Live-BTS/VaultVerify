// Print SkillTemplate row counts grouped by source, straight over Postgres
// (bun SQL) — independent of which Prisma client is currently generated.
// Usage:  source .vv-prod-dsn && bun scripts/builtin-count.ts
import { SQL } from "bun";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgres")) {
  console.error("Refusing: DATABASE_URL is not a postgres DSN.");
  process.exit(1);
}
const sql = new SQL(url, { connectionTimeout: 8, maxLifetime: 0 });
const rows = (await sql`select source, count(*)::int as n from "SkillTemplate" group by source order by source`) as {
  source: string;
  n: number;
}[];
console.log(rows.map((r) => `${r.source}=${r.n}`).join(", ") || "(empty)");
await sql.end();
