import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAgency, ensureSeed, demoSeedingAllowed } from "@/lib/bts/seed";
import { logAudit } from "@/lib/bts/audit";
import { seedChecklistDemo } from "@/lib/bts/checklistDemo";

// ── GET /api/bootstrap — agency branding + (non-prod only) demo data ──
// SEC-07 / CH-02: DEMO seeding (demo candidates, demo checklist account and
// its completions/requests) never runs in production. Agency branding is
// product data and is ensured everywhere.
//
// OWNER DIRECTIVE (2026-10-20): the built-in skill-template catalog is GONE.
// The skills library starts EMPTY — the owner imports their own workbook via
// the SuperAdmin console and manages it there. No code path seeds templates
// anymore; /api/checklists simply returns whatever the owner has published.
export async function GET() {
  try {
    await ensureAgency();

    if (demoSeedingAllowed()) {
      const result = await ensureSeed();
      if (result.seeded) {
        await logAudit({ actorType: "SYSTEM", action: "SEED_CREATED", entity: "agency", entityId: result.agencyId });
      }
      await seedChecklistDemo();
    }
    // Production: branding only — no demo accounts, no demo rows, no template seeding.

    const row = await db.agency.findUnique({ where: { slug: "vaultverify" } });
    // SEC-01(a): projected fields only — billing/trust state columns never
    // reach the anonymous landing page.
    const agency = row
      ? {
          id: row.id, name: row.name, slug: row.slug, logoText: row.logoText,
          tagline: row.tagline, primaryColor: row.primaryColor, accentColor: row.accentColor,
        }
      : null;
    return NextResponse.json({ ok: true, agency });
  } catch (e) {
    console.error("[bootstrap]", e);
    return NextResponse.json({ ok: false, error: "Bootstrap failed" }, { status: 500 });
  }
}
