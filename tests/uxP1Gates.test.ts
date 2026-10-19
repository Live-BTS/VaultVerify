import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// UX P1 pack source gates — pins the plain-language pipeline, honest share
// states, recruiter access banner, and the counts-only sessions action.
const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("UX P1: plain-language candidate statuses", () => {
  it("candidate components substitute plain-language labels on the badge", () => {
    expect(read("components/bts/checklist/ReferencesPanel.tsx")).toContain("candidateStatusText(r.status)");
    expect(read("components/bts/CandidateDashboard.tsx")).toContain("candidateStatusText(r.status)");
  });

  it("candidate map never shows the raw FLAGGED accusation", () => {
    const src = read("lib/bts/constants.ts");
    expect(src).toContain('"Needs your attention"');
    expect(src).toContain("candidateStatusText");
  });

  it("legacy dashboard no longer prints the internal status pipeline footer", () => {
    expect(read("components/bts/CandidateDashboard.tsx")).not.toContain("Statuses:");
  });
});

describe("UX P1: honest expiry language", () => {
  it("share view distinguishes link expiry from report expiry without stale claims", () => {
    const src = read("components/bts/checklist/ShareView.tsx");
    expect(src).not.toContain("1-year");
    expect(src).toContain("validity window has passed");
  });

  it("sharing panel marks report-expired links and carries cannot-recall copy", () => {
    const src = read("components/bts/checklist/SharingPanel.tsx");
    expect(src).toContain("Report expired");
    // JSX renders the apostrophe as &apos; — assert the entity-free phrase
    expect(src).toContain("retract copies");
    expect(src).toContain("reportExpired: c.expired");
  });

  it("expired reference requests point the candidate at the swap recovery path", () => {
    expect(read("components/bts/checklist/ReferencesPanel.tsx")).toContain("This reference link expired.");
  });

  it("expired checklist cards offer the fresh-request recovery CTA", () => {
    expect(read("components/bts/checklist/ChecklistPortal.tsx")).toContain("Request fresh");
  });
});

describe("UX P1: recruiter access banner", () => {
  it("recruiter dashboard renders share-state access info", () => {
    const src = read("components/bts/RecruiterDashboard.tsx");
    expect(src).toContain("Your access");
    expect(src).toContain("active share");
    expect(src).toContain("shares:");
    // the stale placeholder copy is replaced by the real access ledger
    expect(src).not.toContain("Report PDFs are moving");
  });
});

describe("UX P1: admin session-revocation UI", () => {
  it("console shows live session counts beside the breach-response controls", () => {
    const src = read("components/bts/SuperAdmin.tsx");
    expect(src).toContain('action: "sessions_status"');
    expect(src).toContain("Live sessions:");
  });

  it("sessions_status is registered READ_ONLY and stays counts-only", () => {
    const src = read("app/api/superadmin/route.ts");
    expect(src).toContain('"retention_status", "sessions_status"');
    const body = src.slice(src.indexOf('case "sessions_status"'), src.indexOf('case "retention_sweep"'));
    expect(body).toContain("db.checklistSession.count");
    expect(body).toContain("db.recruiterSession.count");
    expect(body).toContain("db.superAdminSession.count");
    expect(body).not.toContain("findMany");
    expect(body).not.toContain("findUnique");
  });
});
