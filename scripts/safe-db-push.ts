/**
 * SEC-24 / CH-04 — guarded `prisma db push`.
 *
 * `prisma db push` syncs the schema DIRECTLY onto whatever DATABASE_URL points
 * at, and with --accept-data-loss it can drop tables/columns without asking.
 * This guard refuses to run against any non-local database (hosted Postgres /
 * Supabase / LAN hosts) so a destructive sync can never hit production by
 * accident. Migrations for a hosted database follow the reviewed path in
 * DEPLOY.md with explicit operator approval — never this script.
 *
 * The --accept-data-loss flag is stripped: local pushes now fail closed on
 * destructive changes instead of silently applying them.
 *
 * CLI: bun scripts/safe-db-push.ts [extra prisma args]
 * Library (tests): import { isLocalDatabaseUrl } from "./safe-db-push";
 */
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("file:")) return true;
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const url = process.env.DATABASE_URL ?? "";
  if (!isLocalDatabaseUrl(url)) {
    console.error("[safe-db-push] REFUSED: DATABASE_URL is not a local database.");
    console.error("[safe-db-push] `db:push` may destroy data and is restricted to local development (file: or localhost).");
    console.error("[safe-db-push] For a hosted database use the reviewed migration path in DEPLOY.md with explicit operator approval.");
    process.exit(1);
  }
  const args = process.argv.slice(2).filter((a) => a !== "--accept-data-loss");
  execSync(`bunx prisma db push ${args.join(" ")}`.trim(), { stdio: "inherit" });
}
