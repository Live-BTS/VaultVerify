import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { GET as bootstrapGet } from "@/app/api/bootstrap/route";

// ── SEC-07 / CH-02: demo seeding must never run in production ──
describe("SEC-07 / CH-02: bootstrap demo-seed gate", () => {
  it("production mode: seeds agency branding + template catalog but NO demo data", async () => {
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
    // product data present (templates are not demo data)
    expect(await db.skillTemplate.count()).toBeGreaterThan(0);
  });

  it("non-production mode: demo data is seeded — sandbox workflow unchanged", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await bootstrapGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await db.candidate.count()).toBeGreaterThan(0);
    expect(await db.checklistAccount.count()).toBeGreaterThan(0);
    expect(await db.checklistCompletion.count()).toBeGreaterThan(0);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });
});
