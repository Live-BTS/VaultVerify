import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { viewerAllowedByRecipient, isWithinSaveWindow } from "@/lib/bts/sharePolicy";
import { sha256Hex } from "@/lib/bts/tokens";
import { buildReferencePacket, type PacketData } from "@/lib/bts/pdf";
import { specialtyLabel, PROFICIENCY_META } from "@/lib/bts/constants";
import { QUESTIONS } from "@/lib/bts/questions";

// ── GET /api/pdf/[requestId] — branded reference packet (AUTHORIZED ACCESS ONLY) ──
// Two legitimate paths:
//   ?share=<ReferenceShareLink token>  — public download through a candidate-
//       controlled share link. CH-08: enforces the SAME policy as the /?rs=
//       resolve view — revoked / consumed / expired + CH-06 recipient binding.
//       A fresh ONE_TIME link is consumed atomically by this download; a
//       just-consumed link stays downloadable inside its save window.
//   owner session                      — the candidate downloads their own packet.
// Anything else returns 401: requestIds alone must never grant access.
export async function GET(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const shareToken = req.nextUrl.searchParams.get("share") ?? "";

  const request = await db.referenceRequest.findUnique({
    where: { id: requestId },
    include: {
      candidate: { include: { agency: true, skills: true } },
      response: { include: { skillChecks: true } },
      flags: true,
      shares: true,
    },
  });
  if (!request || !request.response) {
    return NextResponse.json({ error: "No completed response for this request" }, { status: 404 });
  }

  // ── authorization ──
  let actor = "unauthorized";
  if (shareToken) {
    // D4: the presented raw token matches either a post-cutover row (stored as
    // its SHA-256 digest) or a legacy row (stored raw).
    const link = request.shares.find((l) => l.token === shareToken || l.token === sha256Hex(shareToken));
    if (!link || link.revoked) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    // CH-08: same one-time rule as the resolve view — a consumed link is
    // readable only inside its bounded save window (the just-delivered view's
    // "save the PDF" moment), then rejected for good.
    if (link.accessType === "ONE_TIME" && link.viewedAt && !isWithinSaveWindow(link.viewedAt)) {
      return NextResponse.json({ error: "This link was already used" }, { status: 403 });
    }
    if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired" }, { status: 403 });
    // CH-06: a bound link downloads only for the recruiter the candidate named.
    const viewer = await getRecruiterSessionAccount();
    if (!viewerAllowedByRecipient(link, viewer ? { recruiterId: viewer.id, recruiterEmail: viewer.email } : null)) {
      return NextResponse.json({ error: "This link is reserved for the recruiter it was shared with" }, { status: 403 });
    }
    // Deliver-once: a fresh ONE_TIME link is consumed by THIS download, via a
    // single conditional UPDATE — a concurrent open can never both win.
    if (link.accessType === "ONE_TIME" && !link.viewedAt) {
      const claimed = await db.referenceShareLink.updateMany({
        where: { id: link.id, viewedAt: null },
        // D4: the same statement lazily upgrades a legacy row (raw → digest).
        data: { viewedAt: new Date(), viewCount: { increment: 1 }, token: sha256Hex(shareToken) },
      });
      if (claimed.count === 1) {
        await logAudit({ actorType: "RECRUITER", actorId: "ref-share-link", action: "REFERENCE_SHARE_VIEWED", entity: "referenceShareLink", entityId: link.id, detail: { oneTime: true, via: "pdf" } });
      }
    }
    actor = `share:${link.id}`;
  } else {
    const account = await getAccount();
    if (!account || request.candidate.email.toLowerCase() !== account.email.toLowerCase()) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
    actor = `candidate:${account.id}`;
  }

  const storedAnswers = JSON.parse(request.response.answers || "[]") as { key: string; type: string; value: string | number | boolean | null; unableToObserve?: boolean }[];

  const answers = storedAnswers.map((a) => {
    const q = QUESTIONS.find((qq) => qq.key === a.key);
    let value = "";
    if (a.unableToObserve) value = "Unable to observe";
    else if (a.type === "rating" && typeof a.value === "number") {
      const anchors: Record<number, string> = { 1: "1 - Needs significant improvement", 2: "2 - Below expectations", 3: "3 - Meets expectations", 4: "4 - Exceeds expectations", 5: "5 - Exceptional" };
      value = anchors[a.value] ?? String(a.value);
    } else if (a.type === "boolean") value = a.value === "YES" ? "Yes" : a.value === "NO" ? "No" : "Prefer not to say";
    else value = String(a.value ?? "");
    return { key: a.key, question: q?.title ?? a.key, value };
  });

  const data: PacketData = {
    agency: {
      name: request.candidate.agency.name,
      logoText: request.candidate.agency.logoText,
      tagline: request.candidate.agency.tagline,
      primaryColor: request.candidate.agency.primaryColor,
      accentColor: request.candidate.agency.accentColor,
    },
    candidate: {
      fullName: request.candidate.fullName,
      role: request.candidate.role,
      specialty: specialtyLabel(request.candidate.specialty),
      email: request.candidate.email,
      phone: request.candidate.phone,
      city: request.candidate.city,
      state: request.candidate.state,
      yearsExperience: request.candidate.yearsExperience,
      consentSignedAt: request.candidate.consentSignedAt,
    },
    request: {
      refName: request.refName,
      refTitle: request.refTitle,
      refEmail: request.refEmail,
      refPhone: request.refPhone,
      facilityName: request.facilityName,
      facilityCity: request.facilityCity,
      facilityState: request.facilityState,
      relationship: request.relationship,
      workStartDate: request.workStartDate,
      workEndDate: request.workEndDate,
      status: request.status,
      sentAt: request.sentAt,
      completedAt: request.completedAt,
    },
    response: {
      identityMethod: request.response.identityMethod,
      confirmedRelationship: request.response.confirmedRelationship,
      confirmedFacility: request.response.confirmedFacility,
      confirmedDates: request.response.confirmedDates,
      mismatchNotes: request.response.mismatchNotes,
      answers,
      overallRating: request.response.overallRating,
      q8Discipline: request.response.q8Discipline,
      q8Explanation: request.response.q8Explanation,
      remarks: request.response.remarks,
      signatureName: request.response.signatureName,
      signedAt: request.response.signedAt,
      signerIp: request.response.signerIp,
      signerUserAgent: request.response.signerUserAgent,
      durationSeconds: request.response.durationSeconds,
    },
    skills: request.response.skillChecks.map((s) => ({
      skillName: s.skillName,
      nurseProficiency: PROFICIENCY_META[s.nurseProficiency]?.short ?? s.nurseProficiency,
      confirmed: s.confirmed,
      refProficiency: s.refProficiency ? (PROFIENCY_SAFE(s.refProficiency)) : null,
    })),
    flags: request.flags.map((f) => ({ type: f.type, detail: f.detail, severity: f.severity })),
  };

  const bytes = await buildReferencePacket(data);
  await logAudit({ actorType: "RECRUITER", actorId: actor, action: "PDF_DOWNLOADED", entity: "reference_request", entityId: request.id });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reference-${request.candidate.fullName.replace(/\s+/g, "-").toLowerCase()}-${request.refName.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function PROFIENCY_SAFE(key: string): string {
  return PROFICIENCY_META[key]?.short ?? key;
}
