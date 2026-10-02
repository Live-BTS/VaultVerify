import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/bts/seed";
import { logAudit } from "@/lib/bts/audit";

// ── GET /api/bootstrap — idempotent seed + agency branding ──
export async function GET() {
  try {
    const result = await ensureSeed();
    if (result.seeded) {
      await logAudit({ actorType: "SYSTEM", action: "SEED_CREATED", entity: "agency", entityId: result.agencyId });
    }
    const agency = await db.agency.findUnique({ where: { slug: "meds-talent" } });
    return NextResponse.json({ ok: true, agency });
  } catch (e) {
    console.error("[bootstrap]", e);
    return NextResponse.json({ ok: false, error: "Bootstrap failed" }, { status: 500 });
  }
}
