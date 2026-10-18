import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Bugfix regression gates — production incident 2026-10-18: a recruiter with
// zero admitted share links received `agency: null` from GET /api/recruiter
// and the dashboard shell crashed on `data.agency.logoText`. These gates pin
// the server fallback + client guards so neither side can regress silently.
const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Recruiter agency null crash (prod 2026-10-18)", () => {
  it("GET /api/recruiter never returns a null agency — platform brand fallback", () => {
    const src = read("app/api/recruiter/route.ts");
    expect(src).not.toMatch(/agency:\s*all\.find\([^\n]*\?\?\s*null/);
    expect(src).toContain('logoText: "VV"');
    expect(src).toContain('name: "VaultVerify"');
  });

  it("recruiter payload projects agency fields only — billing/status never leak (SEC-01a)", () => {
    const src = read("app/api/recruiter/route.ts");
    expect(src).toContain("firstAdmitted");
    // The projection must not forward raw billing/trust state columns.
    expect(src).not.toMatch(/creditsGranted/);
    expect(src).not.toMatch(/allowOverage/);
  });

  it("recruiter dashboard shell guards every data.agency read", () => {
    const src = read("components/bts/RecruiterDashboard.tsx");
    expect(src).toContain('data.agency?.logoText ?? "VV"');
    expect(src).toContain('data.agency?.name ?? "VaultVerify"');
    // No unguarded `data.agency.` property reads may remain.
    expect(src).not.toMatch(/data\.agency\./);
  });
});
