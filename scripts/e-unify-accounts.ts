/**
 * Phase E migration — unify identities: link legacy Candidate rows to their
 * ChecklistAccount by exact (lowercased) email match.
 *
 * WHAT IT DOES
 *   For every Candidate row with accountId = null whose email matches an
 *   existing ChecklistAccount.email exactly, stamps Candidate.accountId.
 *   Idempotent + resumable: linked rows are skipped; unmatched rows are
 *   reported (they stay on the email fallback until their owner signs up).
 *
 * SAFETY
 *   • Never prints PII — counts and row ids only.
 *   • Refuses a non-local database unless --i-understand-production is passed
 *     (owner-approved operator action; additive nullable column only).
 *   • Exact-match only (no fuzzy matching, no case tricks beyond lowercasing
 *     both sides — ChecklistAccount.email is stored lowercased by the routes).
 *
 * USAGE
 *   bun scripts/e-unify-accounts.ts
 *   DATABASE_URL=<pooler dsn> bun scripts/e-unify-accounts.ts --i-understand-production
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const PROD_FLAG = process.argv.includes("--i-understand-production");

function assertLocalUnlessApproved(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url.startsWith("file:") || url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal && !PROD_FLAG) {
    console.error(
      "REFUSED: DATABASE_URL does not look local and --i-understand-production was not passed.\n" +
      "Production runs must be explicitly approved by the owner (additive nullable column only).",
    );
    process.exit(2);
  }
}

async function unifyAccounts(): Promise<{ linked: number; skipped: number; unmatched: number }> {
  const [unlinked, accounts] = await Promise.all([
    db.candidate.findMany({ where: { accountId: null }, select: { id: true, email: true } }),
    db.checklistAccount.findMany({ select: { id: true, email: true } }),
  ]);
  const byEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a.id]));

  let linked = 0;
  let unmatched = 0;
  for (const row of unlinked) {
    const accountId = byEmail.get(row.email.toLowerCase());
    if (!accountId) {
      unmatched++;
      continue;
    }
    // The account may already own a DIFFERENT linked profile — never steal it.
    const clash = await db.candidate.findFirst({ where: { accountId }, select: { id: true } });
    if (clash) {
      console.error(`WARN: account ${accountId} already links profile ${clash.id} — left candidate ${row.id} unlinked (resolve manually).`);
      unmatched++;
      continue;
    }
    await db.candidate.update({ where: { id: row.id }, data: { accountId } });
    linked++;
  }
  return { linked, skipped: 0, unmatched };
}

async function main(): Promise<void> {
  assertLocalUnlessApproved();
  const r = await unifyAccounts();
  console.log(`Phase E unify complete: linked=${r.linked} unmatched=${r.unmatched} (unmatched rows keep the email fallback)`);
}

// Testable entry point — module import stays side-effect free.
export { unifyAccounts };

if (import.meta.main) {
  main()
    .catch((e) => {
      console.error("Unify failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
