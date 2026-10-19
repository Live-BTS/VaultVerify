import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/bts/audit";
import { identityFromCookie } from "@/lib/bts/saSession";
import { buildTemplateWorkbook } from "@/lib/bts/workbook";

// ── GET /api/superadmin/skills/template ────────────────────────────
// Live import-template download (2-sheet styled workbook: Skills Data +
// Instructions). Always reflects the CURRENT profession universe, unlike the
// retired static file in /public. Cookie-only auth: the console's httpOnly
// vv_sa cookie rides along automatically; bearer tokens never appear in URLs
// (they'd leak into logs and history). Backup-code callers are covered —
// backup login mints a real session cookie.

export async function GET(req: NextRequest) {
  const identity = await identityFromCookie(req);
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: "Session expired — open the console and sign in again." },
      { status: 401 },
    );
  }
  try {
    const { buf, filename, contentType } = await buildTemplateWorkbook();
    await logAudit({
      actorType: "SYSTEM",
      actorId: identity.email || undefined,
      action: "SKILL_TEMPLATE_EXPORTED",
      entity: "skillTemplate",
      detail: { kind: "template" },
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
    console.error("[skills/template]", e);
    return NextResponse.json({ ok: false, error: "Failed to generate the template workbook." }, { status: 500 });
  }
}
