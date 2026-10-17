/**
 * D4b migration — ReferenceRequest tokens: plaintext → digest + encrypted envelope.
 *
 * WHAT IT DOES
 *   default mode   : for every ReferenceRequest row still holding a RAW token
 *                    (legacy, pre-cutover), store `token = SHA-256(raw)` and
 *                    `tokenEncrypted = AES-256-GCM envelope(raw)`. Post-cutover
 *                    rows are skipped. Idempotent + resumable: safe to re-run.
 *   --reencrypt    : rotation mode — every row whose envelope is stamped v1 is
 *                    decrypted (current/previous key) and re-encrypted with the
 *                    CURRENT key (stamped v2). Run after adding
 *                    REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS + a new current key.
 *
 * SAFETY
 *   • Never prints token values, digests, or envelopes — counts and row ids only.
 *   • Refuses to run against a non-local database unless the explicit flag
 *     --i-understand-production is passed (the owner approves production runs).
 *   • Crash-safe: each row migrates in its own UPDATE; a re-run continues where
 *     it stopped. A row can only be migrated when its raw value is present, so
 *     no partial state can corrupt a row.
 *
 * USAGE
 *   bun scripts/d4b-backfill.ts                       # local SQLite (dev DB)
 *   DATABASE_URL=<pooler dsn> bun scripts/d4b-backfill.ts --i-understand-production
 *   DATABASE_URL=<pooler dsn> bun scripts/d4b-backfill.ts --i-understand-production --reencrypt
 */
import { PrismaClient } from "@prisma/client";
import { sha256Hex, isTokenHashed } from "../src/lib/bts/tokens";
import { encryptRefToken, decryptRefToken } from "../src/lib/bts/refTokenCrypto";

const db = new PrismaClient();

const args = process.argv.slice(2);
const REENCRYPT = args.includes("--reencrypt");
const PROD_FLAG = args.includes("--i-understand-production");

function assertLocalUnlessApproved(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url.startsWith("file:") || url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal && !PROD_FLAG) {
    console.error(
      "REFUSED: DATABASE_URL does not look local and --i-understand-production was not passed.\n" +
      "Production runs must be explicitly approved by the owner (free-plan DB, no backups).\n" +
      "The production migration is ADDITIVE (nullable column) and row-by-row resumable.",
    );
    process.exit(2);
  }
}

async function backfillLegacy(): Promise<{ migrated: number; skipped: number; warnings: number }> {
  const rows = await db.referenceRequest.findMany({ select: { id: true, token: true, tokenEncrypted: true } });
  let migrated = 0;
  let skipped = 0;
  let warnings = 0;
  for (const row of rows) {
    if (row.tokenEncrypted) { skipped++; continue; }
    if (isTokenHashed(row.token)) {
      // Digest without an envelope cannot be migrated (raw is gone) and
      // cannot occur under the D4b code paths — report, never guess.
      warnings++;
      console.error(`WARN: request ${row.id} holds a digest but no envelope — left as-is (link validation still works).`);
      continue;
    }
    const raw = row.token;
    await db.referenceRequest.update({
      where: { id: row.id },
      data: { token: sha256Hex(raw), tokenEncrypted: encryptRefToken(raw) },
    });
    migrated++;
  }
  return { migrated, skipped, warnings };
}

async function reencryptV1(): Promise<{ reencrypted: number; skipped: number; warnings: number }> {
  const rows = await db.referenceRequest.findMany({ select: { id: true, token: true, tokenEncrypted: true } });
  let reencrypted = 0;
  let skipped = 0;
  let warnings = 0;
  for (const row of rows) {
    if (!row.tokenEncrypted || !row.tokenEncrypted.startsWith("v1.")) { skipped++; continue; }
    try {
      const raw = decryptRefToken(row.tokenEncrypted); // works via current or previous key
      await db.referenceRequest.update({
        where: { id: row.id },
        data: { tokenEncrypted: encryptRefToken(raw) },
      });
      reencrypted++;
    } catch (e) {
      warnings++;
      console.error(`WARN: re-encrypt failed for request ${row.id} — ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { reencrypted, skipped, warnings };
}

async function main(): Promise<void> {
  assertLocalUnlessApproved();

  if (!process.env.REFERENCE_TOKEN_ENCRYPTION_KEY) {
    console.error("REFUSED: REFERENCE_TOKEN_ENCRYPTION_KEY is not set — refusing to write envelopes that could not be read back.");
    process.exit(2);
  }

  const rows = await db.referenceRequest.findMany({ select: { id: true, token: true, tokenEncrypted: true } });

  if (REENCRYPT) {
    const r = await reencryptV1();
    console.log(`D4b re-encrypt complete: rows=${rows.length} reencrypted=${r.reencrypted} skipped=${r.skipped} warnings=${r.warnings}`);
    if (r.warnings > 0) process.exitCode = 1;
  } else {
    const r = await backfillLegacy();
    console.log(`D4b backfill complete: rows=${rows.length} migrated=${r.migrated} skipped=${r.skipped} warnings=${r.warnings}`);
    if (r.warnings > 0) process.exitCode = 1;
  }
}

// Testable entry points — module import stays side-effect free.
export { backfillLegacy, reencryptV1 };

if (import.meta.main) {
  main()
    .catch((e) => {
      console.error("Backfill failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
