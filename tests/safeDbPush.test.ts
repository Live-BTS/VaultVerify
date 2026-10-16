import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl } from "../scripts/safe-db-push";

// ── SEC-24 / CH-04: db:push guard refuses non-local databases ──
describe("CH-04: safe-db-push local-DSN guard", () => {
  it("allows SQLite file URLs", () => {
    expect(isLocalDatabaseUrl("file:./db/custom.db")).toBe(true);
    expect(isLocalDatabaseUrl("file:/tmp/test.db")).toBe(true);
  });

  it("allows localhost hosts", () => {
    expect(isLocalDatabaseUrl("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
  });

  it("refuses hosted / production / LAN DSNs", () => {
    expect(isLocalDatabaseUrl("postgresql://u:p@db.abcd.supabase.co:6543/postgres")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://u:p@10.1.2.3:5432/db")).toBe(false);
    expect(isLocalDatabaseUrl("mysql://u:p@somehost/db")).toBe(false);
  });

  it("refuses empty or missing values", () => {
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});
