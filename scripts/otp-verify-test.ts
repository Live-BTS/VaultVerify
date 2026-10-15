/**
 * OTP verify-flow regression test (no emails sent by this script).
 *
 * Inserts a known OTP row as the NEWEST live code, then exercises
 * POST /api/superadmin verify_otp:
 *   1. wrong code  -> error + attempts incremented
 *   2. right code  -> ok:true + sas_ token, row consumed
 *   3. replay      -> rejected (single-use)
 * Optionally (SEND=1) calls request_otp once to prove prior live codes get
 * voided — this DOES email SUPERADMIN_EMAIL for real.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const TEST_CODE = "913204"; // known only to this script; hashed at rest

async function call(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/superadmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  // Seed: one stale live row + our known-code row (newest wins on verify).
  await db.superAdminOtp.create({
    data: { codeHash: createHash("sha256").update("111111").digest("hex"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  const row = await db.superAdminOtp.create({
    data: { codeHash: createHash("sha256").update(TEST_CODE).digest("hex"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  // 1. wrong code
  const wrong = await call({ action: "verify_otp", otp: "000000" });
  const afterWrong = await db.superAdminOtp.findUnique({ where: { id: row.id } });
  console.log(`1. wrong code -> ${wrong.status} | ok=${wrong.data.ok} | "${wrong.data.error}" | attempts=${afterWrong?.attempts}`);
  if (wrong.data.ok !== false || afterWrong?.attempts !== 1) throw new Error("FAIL wrong-code step");

  // 2. right code (newest row)
  const right = await call({ action: "verify_otp", otp: TEST_CODE });
  const afterRight = await db.superAdminOtp.findUnique({ where: { id: row.id } });
  const token: string = right.data.token ?? "";
  console.log(`2. right code -> ${right.status} | ok=${right.data.ok} | token=${token.slice(0, 8)}… | consumed=${!!afterRight?.consumedAt}`);
  if (!right.data.ok || !token.startsWith("sas_") || !afterRight?.consumedAt) throw new Error("FAIL right-code step");

  // 3. replay must fail
  const replay = await call({ action: "verify_otp", otp: TEST_CODE });
  console.log(`3. replay     -> ${replay.status} | ok=${replay.data.ok} | "${replay.data.error}"`);
  if (replay.data.ok !== false) throw new Error("FAIL replay step");

  // 4. token actually unlocks data actions
  const authed = await call({ action: "system_config", token });
  console.log(`4. token auth -> ${authed.status} | ok=${authed.data.ok}`);
  if (!authed.data.ok) throw new Error("FAIL token step");

  // 5. optional: request_otp voids prior live codes (sends ONE real email)
  if (process.env.SEND === "1") {
    await db.superAdminOtp.create({
      data: { codeHash: createHash("sha256").update("222222").digest("hex"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    // clear this run's own seed rows so they don't trip the request rate limit
    await db.superAdminOtp.deleteMany({
      where: { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, codeHash: { not: createHash("sha256").update("222222").digest("hex") } },
    });
    const req = await call({ action: "request_otp" });
    const live = await db.superAdminOtp.count({ where: { consumedAt: null } });
    console.log(`5. request_otp -> ${req.status} | ok=${req.data.ok} | "${req.data.error ?? req.data.sentTo}" | live codes now=${live}`);
    if (req.data.ok !== true || live !== 1) throw new Error("FAIL request_otp invalidation step");
  }

  console.log("ALL OTP TESTS PASS");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
