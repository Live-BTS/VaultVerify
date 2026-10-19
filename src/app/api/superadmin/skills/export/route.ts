import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { identityFromCookie } from "@/lib/bts/saSession";
import { buildExportWorkbook, templateToValidated } from "@/lib/bts/workbook";

// ── GET /api/superadmin/skills/export ──────────────────────────────
// Full skills-library download: every SkillTemplate row (BUILTIN + IMPORT),
// date-stamped filename. Specialty keys are written as their human labels and
// re-normalize to the same canonical keys on import — the round trip is
// covered by tests. Cookie-only auth (see ./template/route.ts for rationale).

export async function GET(req: NextRequest) {
  const identity = await identityFromCookie(req);
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: "Session expired — open the console and sign in again." },
      { status: 401 },
    );
  }
  try {
    const rows = await db.skillTemplate.findMany({
      orderBy: [{ profession: "asc" }, { jobTitle: "asc" }, { specialty: "asc" }, { sortOrder: "asc" }, { skillName: "asc" }],
    });
    const { buf, filename, contentType } = await buildExportWorkbook(rows.map(templateToValidated));
    await logAudit({
      actorType: "SYSTEM",
      actorId: identity.email || undefined,
      action: "SKILL_TEMPLATE_EXPORTED",
      entity: "skillTemplate",
      detail: { kind: "data", rows: rows.length },
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[skills/export]", e);
    return NextResponse.json({ ok: false, error: "Failed to generate the export workbook." }, { status: 500 });
  }
}
