/**
 * Confirm stale-Prisma-client hypothesis on prod + verify OTP send path.
 * 1. template_get on prod (unprotected db.emailTemplate access) — expect 500 if client is stale.
 * 2. request_otp on prod (resilient renderEmail w/ fallback) — expect ok:true.
 * 3. Newest NotificationLog OTP row — answers whether prod Brevo really sends now.
 * Run: npx tsx scripts/prod-probe-2.ts
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
const EMAIL = process.env.SUPERADMIN_EMAIL ?? "";

async function call(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
  const res = await fetch(PROD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  console.log("══ 1. prod template_get (admin_otp) — unprotected table access ══");
  const r1 = await call({ action: "template_get", key: "admin_otp", code: CODE });
  console.log(`  → ${r1.status} ${r1.text.slice(0, 200)}`);

  console.log("\n══ 2. prod request_otp — resilient fallback render ══");
  const r2 = await call({ action: "request_otp", email: EMAIL });
  console.log(`  → ${r2.status} ${r2.text.slice(0, 300)}`);

  console.log("\n══ 3. newest OTP NotificationLog rows (send-path truth) ══");
  await new Promise((r) => setTimeout(r, 2500)); // let the send settle
  const logs = await db.notificationLog.findMany({
    where: { kind: "OTP" },
    orderBy: { createdAt: "desc" },
    take: 4,
  });
  for (const l of logs) {
    console.log(
      `  [${l.createdAt.toISOString()}] to=${l.to} status=${l.status} provider=${l.provider} templateKey=${l.templateKey ?? "—"} subject="${l.subject}"`
    );
  }
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
