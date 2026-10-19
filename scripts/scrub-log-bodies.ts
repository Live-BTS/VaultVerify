/**
 * OD-11 follow-through — NotificationLog body scrub (pre-SEC-17 rows).
 *
 * WHAT IT DOES
 *   default mode: for every NotificationLog row whose body/html/subject still
 *   contains a raw capability URL (/?r=<token>, /?verify=<token>,
 *   /?view=checklist&invite=<token>, including HTML-escaped forms), re-apply
 *   the exact redaction the SEC-17 write-time chokepoint uses
 *   (lib/bts/logRedaction.scrubLogText — raw token → 10-hex SHA-256 prefix).
 *   Metadata (to, kind, status, provider, timestamps) is untouched. Rows with
 *   no matching token text are skipped. Idempotent + resumable: safe to re-run.
 *
 * WHY
 *   SEC-17 redacts at WRITE time; rows written before that deploy keep their
 *   raw bearer URLs until the 90-day retention purge removes them. This script
 *   closes that residual immediately instead of waiting out the window. The
 *   runtime sweep (scrubRetainedNotificationBodies) does the same job on every
 *   pass — this script is the one-time prod accelerator.
 *
 * SAFETY
 *   • Never prints body content, tokens, or digests — counts only.
 *   • Refuses to run against a non-local database unless the explicit flag
 *     --i-understand-production is passed (the owner approves production runs).
 *   • Row-by-row updates; a re-run continues where it stopped.
 *
 * USAGE
 *   bun scripts/scrub-log-bodies.ts                       # local SQLite (dev DB)
 *   DATABASE_URL=<pooler dsn> bun scripts/scrub-log-bodies.ts --i-understand-production
 */
import { PrismaClient } from "@prisma/client";
import { scrubLogText } from "../src/lib/bts/logRedaction";

const db = new PrismaClient();

const PROD_FLAG = process.argv.slice(2).includes("--i-understand-production");

function assertLocalUnlessApproved(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url.startsWith("file:") || url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal && !PROD_FLAG) {
    console.error(
      "REFUSED: DATABASE_URL does not look local and --i-understand-production was not passed.\n" +
      "Production runs must be explicitly approved by the owner (free-plan DB, no backups).\n" +
      "The scrub rewrites only body/html/subject of rows that still contain token URLs.",
    );
    process.exit(2);
  }
}

async function main(): Promise<void> {
  assertLocalUnlessApproved();

  const candidates = await db.notificationLog.findMany({
    where: {
      OR: [
        { body: { contains: "?r=" } }, { body: { contains: "?verify=" } }, { body: { contains: "invite=" } },
        { html: { contains: "?r=" } }, { html: { contains: "?verify=" } }, { html: { contains: "invite=" } },
      ],
    },
    select: { id: true, body: true, html: true, subject: true },
  });

  let scrubbed = 0;
  let skipped = 0;
  for (const row of candidates) {
    const body = scrubLogText(row.body);
    const html = row.html === null ? null : scrubLogText(row.html);
    const subject = scrubLogText(row.subject);
    if (body === row.body && html === row.html && subject === row.subject) {
      skipped++; // hint matched but no live token pattern — nothing to do
      continue;
    }
    await db.notificationLog.update({ where: { id: row.id }, data: { body, html, subject } });
    scrubbed++;
  }

  console.log(`scrub-log-bodies: candidates=${candidates.length} scrubbed=${scrubbed} skipped=${skipped}`);
  console.log("done — counts only; no row content was printed.");
}

main()
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
