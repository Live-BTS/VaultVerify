/**
 * Brevo account + sender verification check (read-only, sends no email).
 * Also re-checks recent OTP audit events.
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (!m) continue;
  process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const db = new PrismaClient();

async function main() {
  const key = process.env.BREVO_API_KEY || "";
  console.log(`BREVO_API_KEY present: ${!!key} (prefix ${key.slice(0, 8)}..., len=${key.length})`);
  console.log(`BREVO_SENDER_EMAIL: ${process.env.BREVO_SENDER_EMAIL}`);

  // 1. Brevo account validity
  try {
    const acc = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": key, accept: "application/json" },
    });
    console.log(`\nBrevo /account → HTTP ${acc.status}`);
    if (acc.ok) {
      const j = await acc.json();
      console.log(`  plan: ${JSON.stringify(j.plan?.slice(0, 2))} email=${j.email}`);
    } else {
      console.log(`  body: ${(await acc.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.log("  account check error:", (e as Error).message);
  }

  // 2. Sender verification status
  try {
    const senders = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": key, accept: "application/json" },
    });
    console.log(`\nBrevo /senders → HTTP ${senders.status}`);
    if (senders.ok) {
      const j = await senders.json();
      for (const s of (j.senders ?? []).slice(0, 10)) {
        console.log(`  sender: ${s.email} verified=${s.checked ?? "(n/a)"} status=${JSON.stringify(s)}`.slice(0, 160));
      }
    } else {
      console.log(`  body: ${(await senders.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.log("  senders check error:", (e as Error).message);
  }

  // 3. Recent audit events around OTP
  const audits = await (db as any).auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  console.log("\n══ 12 most recent audit events ══");
  for (const a of audits) {
    console.log(`[${a.createdAt.toISOString()}] ${a.action} actor=${a.actorType}/${a.actorId ?? ""} entity=${a.entity} detail=${JSON.stringify(a.detail).slice(0, 100)}`);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
