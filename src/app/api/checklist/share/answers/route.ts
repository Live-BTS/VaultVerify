import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── GET /api/checklist/share/answers?token= — answers for a valid share link ──
// Read-only companion to the resolve action (does not consume one-time links).

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const link = await db.checklistShareLink.findUnique({ where: { token }, include: { completion: true } });
    if (!link || link.revoked) return NextResponse.json({ ok: false }, { status: 404 });
    if (link.accessType === "ONE_TIME" && link.viewedAt) return NextResponse.json({ ok: false }, { status: 403 });
    if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ ok: false }, { status: 403 });
    return NextResponse.json({
      ok: true,
      answers: JSON.parse(link.completion.answers || "[]"),
      additional: JSON.parse(link.completion.additional || "[]"),
      attestation: link.completion.attestation ? JSON.parse(link.completion.attestation) : null,
    });
  } catch (e) {
    console.error("[checklist/share/answers]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
