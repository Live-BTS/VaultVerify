/**
 * Read-only hosted-DB verification for D4b + E1 migration (counts only, no values).
 * Uses Bun's built-in Postgres client — safe to run while node_modules holds the
 * SQLite Prisma client. Usage: bun scripts/verify-prod-d4b-e1.ts  (sources DSN from env)
 */
const raw = process.env.DATABASE_URL ?? "";
if (!raw) { console.error("DATABASE_URL not set"); process.exit(1); }

const { SQL } = Bun as unknown as { SQL: new (url: string) => {
  unsafe: (q: string) => Promise<Record<string, unknown>[]>;
  close: () => Promise<void>;
} };

let db: InstanceType<typeof SQL>;
try {
  db = new SQL(raw); // full URL incl. sslmode param
} catch {
  const base = raw.split("?")[0]; // fallback: bare URL + TLS
  db = new SQL(`${base}?sslmode=require`);
}

async function scalar(q: string): Promise<string> {
  const rows = await db.unsafe(q);
  const v = Object.values(rows[0] ?? {})[0];
  return v === undefined || v === null ? "?" : String(v);
}

const cols = await db.unsafe(
  `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
   WHERE (table_name='ReferenceRequest' AND column_name='tokenEncrypted')
      OR (table_name='Candidate' AND column_name='accountId') ORDER BY 1`,
);
console.log("COLUMNS PRESENT:", cols.map((r) => String(r.c)).join(", ") || "NONE");

console.log("FK Candidate_accountId_fkey:", await scalar(
  `SELECT COALESCE(string_agg(conname, ','), 'MISSING') FROM pg_constraint WHERE conname='Candidate_accountId_fkey'`));
console.log("UNIQUE INDEX Candidate_accountId_key:", await scalar(
  `SELECT COALESCE(string_agg(indexname, ','), 'MISSING') FROM pg_indexes WHERE indexname='Candidate_accountId_key'`));

for (const t of ["Candidate", "ChecklistAccount", "ReferenceRequest"]) {
  console.log(`COUNT ${t}:`, await scalar(`SELECT COUNT(*)::text FROM "${t}"`));
}
console.log("Candidate rows already linked (accountId NOT NULL):", await scalar(
  `SELECT COUNT(*)::text FROM "Candidate" WHERE "accountId" IS NOT NULL`));
console.log("ReferenceRequest rows still holding legacy plaintext (no envelope):", await scalar(
  `SELECT COUNT(*)::text FROM "ReferenceRequest" WHERE "tokenEncrypted" IS NULL`));
console.log("ReferenceRequest rows already digest+envelope:", await scalar(
  `SELECT COUNT(*)::text FROM "ReferenceRequest" WHERE "tokenEncrypted" IS NOT NULL`));

await db.close();
