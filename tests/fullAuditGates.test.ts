import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Full-audit regression gates (2026-10-18) — pins the security and
// data-integrity fixes so none of them can silently regress.
const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Audit: CH-06 binding on the answers companion read", () => {
  it("answers endpoint enforces viewerAllowedByRecipient like resolve and the PDF routes", () => {
    const src = read("app/api/checklist/share/answers/route.ts");
    expect(src).toContain("viewerAllowedByRecipient");
    expect(src).toContain('reject("reserved")');
  });
});

describe("Audit: ONE_TIME claim race cannot leak the report", () => {
  it("both PDF routes reject the concurrent claim loser (count === 0)", () => {
    expect(read("app/api/checklist/pdf/route.ts")).toMatch(/count === 1[\s\S]*?else \{\s*\/\/ A concurrent request won/);
    expect(read("app/api/pdf/[requestId]/route.ts")).toMatch(/count === 1[\s\S]*?else \{\s*\/\/ A concurrent request won/);
  });
});

describe("Audit: login lockout on the checklist account surface", () => {
  it("POST login enforces loginLockedFor BEFORE the password check", () => {
    const src = read("app/api/checklist/account/route.ts");
    expect(src).toContain("loginLockedFor(account) > 0");
    const lock = src.indexOf("loginLockedFor(account) > 0");
    const verify = src.indexOf("verifyPassword(password, account.passwordHash)");
    expect(lock).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(lock);
  });
});

describe("Audit: screening data never reaches the referee surface", () => {
  it("the submit response strips fraud flag details", () => {
    expect(read("app/api/reference/[token]/route.ts")).toContain("flags: []");
  });
});

describe("Audit: token digests are written from the normalized value", () => {
  it("every presented token is trimmed before hashing", () => {
    expect(read("app/api/checklist/share/route.ts")).toContain('String(body.token ?? "").trim()');
    expect(read("app/api/reference/share/route.ts")).toContain('String(body.token ?? "").trim()');
    expect(read("app/api/checklist/pdf/route.ts")).toContain('sp.get("share")?.trim()');
    expect(read("app/api/pdf/[requestId]/route.ts")).toContain('searchParams.get("share")?.trim()');
  });
});

describe("Audit: suspended-session cleanup deletes the hashed id", () => {
  it("defense-in-depth deletes use sha256(id), matching the at-rest key", () => {
    expect(read("lib/bts/auth.ts")).toContain("deleteMany({ where: { id: sha256(id) } })");
    expect(read("lib/bts/checklistAuth.ts")).toContain("deleteMany({ where: { id: sha256(id) } })");
  });
});

describe("Audit: emailed links resist Host-header poisoning", () => {
  it("every origin builder delegates to originFor (APP_ORIGIN wins when set)", () => {
    for (const f of [
      "app/api/auth/route.ts",
      "app/api/checklist/account/route.ts",
      "app/api/candidate/route.ts",
      "app/api/candidate/actions/route.ts",
      "app/api/recruiter/route.ts",
      "app/api/superadmin/route.ts",
      "app/api/reference/[token]/route.ts",
    ]) {
      expect(read(f)).toContain("originFor");
    }
    expect(read("lib/bts/origin.ts")).toContain("APP_ORIGIN");
  });
});

describe("Audit: billing and trust state stay server-side", () => {
  it("bootstrap and the referee route project agency fields only", () => {
    const boot = read("app/api/bootstrap/route.ts");
    expect(boot).toContain("primaryColor: row.primaryColor");
    // Console-only billing/trust columns must not appear in the public payload.
    expect(boot).not.toMatch(/creditsGranted|allowOverage/);
    expect(read("app/api/reference/[token]/route.ts")).toContain("agencyForReferee");
  });
});

describe("Audit: credit ledger integrity", () => {
  it("spend is transactional and adjustments reject fractional deltas", () => {
    const src = read("lib/bts/credits.ts");
    expect(src).toContain("db.$transaction");
    expect(src).toContain("Math.trunc(delta) !== delta");
  });
});

describe("Audit: recruiter surface hygiene", () => {
  it("recruiter routes gate on verified + onboarded accounts", () => {
    const src = read("app/api/recruiter/route.ts");
    expect(src).toContain("!recruiter.emailVerified || !recruiter.onboardingComplete");
  });
  it("the sweep expires on the same boundary the referee link enforces", () => {
    expect(read("app/api/recruiter/route.ts")).toContain("r.expiresAt && r.expiresAt <= new Date()");
  });
});
