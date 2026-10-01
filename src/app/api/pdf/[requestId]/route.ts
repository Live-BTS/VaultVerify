import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { buildReferencePacket, type PacketData } from "@/lib/bts/pdf";
import { specialtyLabel, PROFICIENCY_META } from "@/lib/bts/constants";
import { QUESTIONS } from "@/lib/bts/questions";

// ── GET /api/pdf/[requestId] — branded reference packet ──
export async function GET(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;

  const request = await db.referenceRequest.findUnique({
    where: { id: requestId },
    include: {
      candidate: { include: { agency: true, skills: true } },
      response: { include: { skillChecks: true } },
      flags: true,
    },
  });
  if (!request || !request.response) {
    return NextResponse.json({ error: "No completed response for this request" }, { status: 404 });
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
  await logAudit({ actorType: "RECRUITER", action: "PDF_DOWNLOADED", entity: "reference_request", entityId: request.id });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reference-${request.candidate.fullName.replace(/\s+/g, "-").toLowerCase()}-${request.refName.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
    },
  });
}

function PROFIENCY_SAFE(key: string): string {
  return PROFICIENCY_META[key]?.short ?? key;
}
