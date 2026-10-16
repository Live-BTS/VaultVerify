import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateChecklistShare, type ShareRejectReason } from "@/lib/bts/sharePolicy";

const reject = (r: ShareRejectReason) => NextResponse.json({ ok: false, reason: r }, { status: r === "invalid" ? 404 : 403 });

// ── GET /api/checklist/share/answers?token= — answers for a valid share link ──
// Read-only companion to the resolve action (does not consume one-time links).
// Enforces the SAME policy as resolve, including the 30-day report validity.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const link = await db.checklistShareLink.findUnique({ where: { token }, include: { completion: true } });
    const decision = evaluateChecklistShare(link, link?.completion);
    if (!decision.ok) return reject(decision.reason!);
    if (!link || !link.completion) return reject("invalid");
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
