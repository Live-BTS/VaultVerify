import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { GET as bootstrapGet } from "@/app/api/bootstrap/route";

// ── SEC-07 / CH-02: demo seeding must never run in production ──
describe("SEC-07 / CH-02: bootstrap demo-seed gate", () => {
  it("production mode: seeds agency branding only — NO demo data, NO template seeding", async () => {
    // OWNER DIRECTIVE (2026-10-20): the skills library starts EMPTY — the
    // owner imports their own catalog. Wipe only BUILTIN rows (the thing
    // bootstrap used to re-seed on every hit) so this pins "bootstrap creates
    // zero built-in templates" without racing parallel test files that own
    // their IMPORT rows.
    await db.skillTemplate.deleteMany({ where: { source: "BUILTIN" } });
    vi.stubEnv("NODE_ENV", "production");
    const res = await bootstrapGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.agency).toBeTruthy();
    // demo artifacts absent
    expect(await db.checklistAccount.count()).toBe(0);
    expect(await db.checklistCompletion.count()).toBe(0);
    expect(await db.checklistRequest.count()).toBe(0);
    expect(await db.candidate.count()).toBe(0);
    expect(await db.referenceRequest.count()).toBe(0);
    // OWNER: no built-in skill templates are seeded anymore — the library is
    // owned by the SuperAdmin import flow and stays empty until they import.
    expect(await db.skillTemplate.count({ where: { source: "BUILTIN" } })).toBe(0);
  });

  it("non-production mode: demo data is seeded — sandbox workflow unchanged", async () => {
    // seedChecklistDemo only builds Emma's completed ICU checklist when ICU
    // templates exist (the library is owner-managed now). Provide one tagged
    // row so the sandbox workflow is exercised deterministically; removed in
    // afterAll (Emma's demo completion itself stays — it IS the demo data).
    await db.skillTemplate.create({
      data: {
        profession: "Nursing", jobTitle: "RN", specialty: "ICU",
        category: "Respiratory Support", skillName: "WT-bootstrap-demo ICU skill",
        questionType: "rating_1_4", hasNA: true, highRisk: true, active: true, source: "IMPORT", sortOrder: 0,
      },
    });
    vi.stubEnv("NODE_ENV", "development");
    const res = await bootstrapGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await db.candidate.count()).toBeGreaterThan(0);
    expect(await db.checklistAccount.count()).toBeGreaterThan(0);
    expect(await db.checklistCompletion.count()).toBeGreaterThan(0);
  });

  it("source gate: no code path seeds built-in skill templates anymore", () => {
    const boot = readFileSync(new URL("../src/app/api/bootstrap/route.ts", import.meta.url), "utf8");
    expect(boot).not.toContain("seedBuiltinTemplates");
    const lib = readFileSync(new URL("../src/lib/bts/skillTemplates.ts", import.meta.url), "utf8");
    expect(lib).not.toContain("seedBuiltinTemplates");
    expect(lib).not.toContain("BUILTIN_CHECKLISTS");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.skillTemplate.deleteMany({ where: { skillName: "WT-bootstrap-demo ICU skill" } });
  });
});

