/**
 * OTP delivery diagnosis — reads live NotificationLog + SuperAdminOtp rows.
 * Run: npx tsx scripts/otp-diagnose.ts
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

// Load .env manually — shell env has a conflicting DATABASE_URL=file:... value,
// and `source .env` breaks on the unquoted '&' in the Postgres URL.
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (!m) continue;
  const val = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  process.env[m[1]] = val;
}

const db = new PrismaClient();

async function main() {
  const logs = await db.notificationLog.findMany({
    where: { kind: "OTP" },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  console.log("══ Recent OTP notification logs (newest first) ══");
  if (!logs.length) console.log("  (no OTP log rows at all — request never reached the send step)");
  for (const l of logs) {
    console.log(
      `[${l.createdAt.toISOString()}] to=${l.to} status=${l.status} provider=${l.provider} subject="${l.subject}"`
    );
  }

  const anyLogs = await db.notificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("\n══ 5 most recent notifications of ANY kind ══");
  for (const l of anyLogs) {
    console.log(
      `[${l.createdAt.toISOString()}] kind=${l.kind} to=${l.to} status=${l.status} provider=${l.provider}`
    );
  }

  const otps = await (db as any).superAdminOtp.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  console.log("\n══ Recent SuperAdminOtp rows ══");
  for (const o of otps) {
    console.log(
      `[${o.createdAt.toISOString()}] email=${o.email} consumed=${o.consumedAt?.toISOString() ?? "LIVE/unused"} expires=${o.expiresAt.toISOString()} attempts=${o.attempts}`
    );
  }
}

main()
  .catch((e) => {
    console.error("DIAGNOSTIC ERROR:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
