// Full logical export of the production Postgres (Supabase) — pre-wipe snapshot.
// Writes one JSON file per public table into download/prod-backup-<stamp>/ plus a
// manifest with per-table row counts. Read-only against the database.
// Run: source .vv-prod-dsn && bun scripts/prod-export.ts
import { mkdirSync, writeFileSync } from "node:fs";

const DSN = process.env.DATABASE_URL;
if (!DSN || !DSN.includes("pooler.supabase.com")) {
  console.error("Refusing: DATABASE_URL must be the prod pooler DSN (export it from .vv-prod-dsn).");
  process.exit(1);
}

const sql = new Bun.SQL(DSN, { connectionTimeout: 15 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = `/home/z/my-project/download/prod-backup-${stamp}`;
mkdirSync(outDir, { recursive: true });

const tables = (await sql`
  select table_name as t from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name
`) as { t: string }[];

const manifest: Record<string, unknown>[] = [];
let total = 0;
for (const { t } of tables) {
  const rows = await sql.unsafe(`select * from "${t}"`);
  writeFileSync(`${outDir}/${t}.json`, JSON.stringify(rows, null, 1));
  total += rows.length;
  manifest.push({ table: t, rows: rows.length, file: `${t}.json` });
  console.log(`  ${String(rows.length).padStart(5)}  ${t}`);
}

writeFileSync(`${outDir}/manifest.json`, JSON.stringify(
  { stamp, dsnHost: new URL(DSN).host, tables: manifest, totalRows: total },
  null, 2,
));
console.log(`\nBacked up ${total} rows across ${tables.length} tables -> ${outDir}`);
await sql.end();
