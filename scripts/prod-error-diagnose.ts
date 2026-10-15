/**
 * Diagnose the "Superadmin request failed … database connection is failing" toast.
 * Part A: does the shared Supabase DB actually have the new EmailTemplate table
 *         + NotificationLog.html/templateKey columns (schema drift check)?
 * Part B: probe PRODUCTION /api/superadmin action-by-action with the backup code
 *         to find which console action throws.
 * Run: npx tsx scripts/prod-error-diagnose.ts
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (!m) continue;
  const val = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  process.env[m[1]] = val;
}

const db = new PrismaClient();
const PROD = "https://vaultverify.vercel.app/api/superadmin";
const CODE = process.env.SUPERADMIN_CODE ?? "";

async function schemaCheck() {
  console.log("══ Part A — schema check on shared Supabase DB ══");
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('EmailTemplate','NotificationLog','SuperadminAccount','SuperAdminSession')`
  );
  console.log("  tables present:", tables.map((t) => t.table_name).join(", ") || "(none!)");

  const cols = await db.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='NotificationLog'
       AND column_name IN ('html','templateKey')`
  );
  console.log("  NotificationLog new columns:", cols.map((c) => `${c.column_name}:${c.data_type}`).join(", ") || "(MISSING — schema drift!)");

  const tplCount = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "EmailTemplate"`);
  console.log("  EmailTemplate override rows:", tplCount[0]?.c ?? "n/a");
}

const ACTIONS = [
  "auth", "requests", "system_config", "audit_query", "ledger_query",
  "shares_list", "notifications_list", "ping", "fraud_config_get",
  "templates_list", "team_list",
];

async function prodProbe() {
  console.log("\n══ Part B — production API probe (each console read action) ══");
  for (const action of ACTIONS) {
    const body: Record<string, unknown> = { action, code: CODE };
    if (action === "audit_query") { body.q = ""; body.days = 7; }
    const t0 = Date.now();
    try {
      const res = await fetch(PROD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      const ms = Date.now() - t0;
      const short = txt.length > 260 ? txt.slice(0, 260) + "…" : txt;
      const mark = res.ok ? "✅" : "❌";
      console.log(`${mark} ${action.padEnd(18)} ${res.status} ${String(ms).padStart(5)}ms  ${short}`);
    } catch (e) {
      console.log(`💥 ${action.padEnd(18)} network error: ${(e as Error).message}`);
    }
  }
}

async function main() {
  await schemaCheck();
  await prodProbe();
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
