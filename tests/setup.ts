import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// ── Disposable test database ─────────────────────────────────────
// Every test run pushes the Prisma schema onto a FRESH SQLite file and deletes
// it afterwards. `prisma db push` on an empty file cannot destroy data, and the
// dev database (db/custom.db) is never touched: DATABASE_URL is overridden
// BEFORE any PrismaClient is instantiated (this setup file runs first).
const TEST_DB = path.resolve(__dirname, "test-audit.db");

process.env.DATABASE_URL = `file:${TEST_DB}`;
process.env.BREVO_API_KEY = ""; // force the simulated provider — no real email can ever be sent
process.env.RECRUITER_CODE = "test-recruiter-code";
process.env.SUPERADMIN_CODE = "test-superadmin-code";

if (existsSync(TEST_DB)) rmSync(TEST_DB);
for (const suffix of ["-wal", "-shm"]) {
  if (existsSync(TEST_DB + suffix)) rmSync(TEST_DB + suffix);
}

execSync("bunx prisma db push --skip-generate", {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env },
  stdio: "pipe",
});
