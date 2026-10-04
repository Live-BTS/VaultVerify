// Probe Supabase Supavisor pooler regions to find a working Postgres connection.
// Tries session (5432) and transaction (6543) pooler ports per region with the
// tenant username postgres.<ref>. Prints the first working connection string.
import { SQL } from "bun";

const REF = "qdarfofiofwzkfadvkkx";
const PASSWORD = encodeURIComponent("Shaswat@0047");

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "sa-east-1",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
];

const PORTS = [6543, 5432]; // transaction pooler first (serverless-friendly)

async function tryConn(host: string, port: number): Promise<string | null> {
  const url = `postgres://postgres.${REF}:${PASSWORD}@${host}:${port}/postgres?sslmode=require`;
  try {
    const sql = new SQL(url, { connectionTimeout: 8, maxLifetime: 0 });
    const res = (await sql`select version() as v`) as { v: string }[];
    await sql.end();
    return res?.[0]?.v ?? null;
  } catch {
    return null;
  }
}

let found: { url: string; version: string } | null = null;
outer: for (const region of REGIONS) {
  for (const port of PORTS) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const v = await tryConn(host, port);
    if (v) {
      found = { url: `postgresql://postgres.${REF}:[password]@${host}:${port}/postgres?sslmode=require`, version: v };
      console.log(`✅ CONNECTED region=${region} port=${port}`);
      console.log(`   version: ${v.slice(0, 60)}`);
      break outer;
    } else {
      console.log(`… no: ${host}:${port}`);
    }
  }
}
if (!found) {
  console.log("❌ no pooler region accepted the credentials");
  process.exit(1);
}
console.log(JSON.stringify(found, null, 2));
