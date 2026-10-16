import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAgency, ensureSeed, demoSeedingAllowed } from "@/lib/bts/seed";
import { logAudit } from "@/lib/bts/audit";
import { seedBuiltinTemplates } from "@/lib/bts/skillTemplates";
import { seedChecklistDemo } from "@/lib/bts/checklistDemo";

// ── GET /api/bootstrap — agency branding + idempotent seeding ──
// SEC-07 / CH-02: DEMO seeding (demo candidates, demo checklist account and
// its completions/requests) never runs in production. Agency branding and the
// built-in skill-template catalog are product data and are seeded everywhere.
export async function GET() {
  try {
    await ensureAgency();

    if (demoSeedingAllowed()) {
      const result = await ensureSeed();
      if (result.seeded) {
        await logAudit({ actorType: "SYSTEM", action: "SEED_CREATED", entity: "agency", entityId: result.agencyId });
      }
      // Idempotent: keeps built-in Med-Surg / ICU / General skill templates fresh.
      await seedBuiltinTemplates();
      await seedChecklistDemo();
    } else {
      // Production: product catalog only — no demo accounts, no demo rows.
      await seedBuiltinTemplates();
    }

    const agency = await db.agency.findUnique({ where: { slug: "vaultverify" } });
    return NextResponse.json({ ok: true, agency });
  } catch (e) {
    console.error("[bootstrap]", e);
    return NextResponse.json({ ok: false, error: "Bootstrap failed" }, { status: 500 });
  }
}
