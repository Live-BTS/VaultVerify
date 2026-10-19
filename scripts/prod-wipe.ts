// Owner-approved clean slate (OD-04 + "remove all accounts/data, start testing
// with real accounts"): deletes EVERY row from every public table EXCEPT the
// keep-list (builtin content + platform settings). FK-safe: computes a
// child-before-parent delete order from the live information_schema catalog,
// runs inside ONE transaction, verifies zeros, prints per-table counts.
// Refuses to run unless DATABASE_URL is the prod pooler DSN.
// Run: source .vv-prod-dsn && bun scripts/prod-wipe.ts --i-understand-production
const KEEP = new Set(["SkillTemplate", "EmailTemplate", "PlatformConfig"]);

const DSN = process.env.DATABASE_URL;
if (!DSN || !DSN.includes("pooler.supabase.com")) {
  console.error("Refusing: DATABASE_URL must be the prod pooler DSN.");
  process.exit(1);
}
if (!process.argv.includes("--i-understand-production")) {
  console.error("Refusing: pass --i-understand-production (this deletes all prod rows outside the keep-list).");
  process.exit(1);
}

const sql = new Bun.SQL(DSN, { connectionTimeout: 15 });

const tables = (await sql`
  select table_name as t from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
`) as { t: string }[];
const wipeSet = tables.map((r) => r.t).filter((t) => !KEEP.has(t));

// edges: parent <- child (child rows must go first)
const fks = (await sql`
  select distinct tc.table_name as child, ccu.table_name as parent
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    and tc.table_name <> ccu.table_name
`) as { child: string; parent: string }[];

// Kahn: repeatedly take a wipe-table that no remaining wipe-table references.
const remaining = new Set(wipeSet);
const references = (t: string) =>
  fks.some((f) => remaining.has(f.child) && f.parent === t);
const order: string[] = [];
while (remaining.size > 0) {
  const leaf = [...remaining].find((t) => !references(t));
  if (!leaf) {
    console.error(`FK cycle among: ${[...remaining].join(", ")} — refusing, handle manually.`);
    process.exit(1);
  }
  order.push(leaf);
  remaining.delete(leaf);
}
console.log("Delete order:", order.join(" -> "));

await sql.begin(async (tx) => {
  for (const t of order) {
    const res = await tx.unsafe(`delete from "${t}"`);
    console.log(`  deleted ${res.count ?? 0}\t${t}`);
  }
});

console.log("\nVerification (should all be 0):");
let bad = 0;
for (const t of order) {
  const c = await sql.unsafe(`select count(*)::int as n from "${t}"`);
  if (c[0].n !== 0) bad++;
  console.log(`  ${String(c[0].n).padStart(4)}  ${t}`);
}
const kept = [...KEEP].map(async (t) => {
  const c = await sql.unsafe(`select count(*)::int as n from "${t}"`);
  console.log(`  ${String(c[0].n).padStart(4)}  ${t} (kept)`);
});
await Promise.all(kept);
console.log(bad === 0 ? "\nWIPE COMPLETE — all wiped tables empty." : `\nWARNING: ${bad} table(s) non-empty!`);
await sql.end();
process.exit(bad === 0 ? 0 : 2);
