import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateCompanionRead, viewerAllowedByRecipient, type ShareRejectReason } from "@/lib/bts/sharePolicy";
import { tokenLookups } from "@/lib/bts/tokens";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";

const reject = (r: ShareRejectReason) => NextResponse.json({ ok: false, reason: r }, { status: r === "invalid" ? 404 : 403 });

// ── GET /api/checklist/share/answers?token= — answers for a valid share link ──
// Read-only companion to the resolve action (does not consume one-time links).
// Enforces the SAME policy as resolve, including the 30-day report validity —
// plus CH-08: a consumed ONE_TIME link stays readable inside its save window,
// so the just-delivered view can still load the answers table it promises.

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  try {
    // D4: digest-first lookup (post-cutover rows), raw fallback (legacy rows).
    const link = await db.checklistShareLink.findFirst({ where: { token: { in: tokenLookups(token) } }, include: { completion: true } });
    const decision = evaluateCompanionRead(link, link?.completion);
    if (!decision.ok) return reject(decision.reason!);
    if (!link || !link.completion) return reject("invalid");
    // CH-06: a bound link reads only for the recruiter the candidate named —
    // the same rule resolve and both PDF routes enforce (the old comment
    // claimed parity but the check was missing). Open (unbound) links admit
    // anonymous viewers, so the ordinary share-view path is unchanged.
    const viewer = await getRecruiterSessionAccount();
    if (!viewerAllowedByRecipient(link, viewer ? { recruiterId: viewer.id, recruiterEmail: viewer.email } : null)) {
      return reject("reserved");
    }
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
