import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, inviteBody } from "@/lib/bts/notifications";
import { deriveCallbackCode } from "@/lib/bts/seed";
import { LINK_EXPIRY_DAYS, specialtyLabel } from "@/lib/bts/constants";
import { CHECKLISTS } from "@/lib/bts/questions";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ── GET /api/candidate?email=... — candidate login / dashboard data ──
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const candidate = await db.candidate.findFirst({
    where: { email },
    include: {
      agency: true,
      skills: { orderBy: { id: "asc" } },
      requests: {
        orderBy: { createdAt: "asc" },
        include: { response: true, flags: true },
      },
    },
  });
  if (!candidate) return NextResponse.json({ error: "No profile found for this email" }, { status: 404 });

  const requests = candidate.requests.map((r) => ({
    ...r,
    callbackCode: deriveCallbackCode(r.token),
    refLink: `${baseUrl(req)}/?r=${r.token}`,
  }));

  await logAudit({ actorType: "CANDIDATE", actorId: candidate.id, action: "DASHBOARD_VIEWED", entity: "candidate", entityId: candidate.id, ip: clientIp(req) });

  return NextResponse.json({ candidate: { ...candidate, requests } });
}

interface CreatePayload {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  specialty: string;
  yearsExperience: number;
  city: string;
  state: string;
  licenseNumber?: string;
  consentSignature: string;
  skills: { skillName: string; proficiency: string; recencyMonths: number }[];
  references: {
    refName: string; refTitle: string; refEmail: string; refPhone: string;
    facilityName: string; facilityCity?: string; facilityState?: string;
    relationship: string; workStartDate: string; workEndDate?: string;
  }[];
}

// ── POST /api/candidate — onboarding: profile + skills + references + consent ──
export async function POST(req: NextRequest) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const required = ["fullName", "email", "role", "specialty", "consentSignature"] as const;
  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === "") {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }
  if (!body.references || body.references.length < 2) {
    return NextResponse.json({ error: "At least 2 references are required" }, { status: 400 });
  }
  // NOTE: the skills checklist is a SEPARATE, self-reported feature — it is NOT
  // required for (or verified by) reference verification. Optional self-reported
  // skills submitted here are stored as-is.

  const existing = await db.candidate.findFirst({ where: { email: body.email.toLowerCase().trim() } });
  if (existing) {
    return NextResponse.json({ error: "A profile with this email already exists — sign in instead." }, { status: 409 });
  }

  const agency = (await db.agency.findUnique({ where: { slug: "vaultverify" } })) ?? (await db.agency.findFirst());
  if (!agency) return NextResponse.json({ error: "Agency not configured" }, { status: 500 });

  const candidate = await db.candidate.create({
    data: {
      agencyId: agency.id,
      fullName: body.fullName.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone ?? "",
      role: body.role,
      specialty: body.specialty,
      yearsExperience: Number(body.yearsExperience) || 0,
      city: body.city ?? "",
      state: body.state ?? "",
      licenseNumber: body.licenseNumber ?? "",
      consentSignature: body.consentSignature,
      consentSignedAt: new Date(),
      skills: {
        create: (body.skills ?? []).map((s) => ({
          skillName: s.skillName,
          specialty: body.specialty,
          highRisk: !!CHECKLISTS.find((c) => c.specialty === body.specialty)?.skills.find((t) => t.name === s.skillName)?.highRisk,
          proficiency: s.proficiency,
          recencyMonths: Number(s.recencyMonths) || 0,
        })),
      },
      requests: {
        create: body.references.map((r) => ({
          refName: r.refName.trim(),
          refTitle: r.refTitle.trim(),
          refEmail: r.refEmail.toLowerCase().trim(),
          refPhone: r.refPhone ?? "",
          facilityName: r.facilityName.trim(),
          facilityCity: r.facilityCity ?? "",
          facilityState: r.facilityState ?? "",
          relationship: r.relationship,
          workStartDate: r.workStartDate ?? "",
          workEndDate: r.workEndDate ?? "",
          status: "SENT",
          expiresAt: new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        })),
      },
    },
    include: { requests: true },
  });

  // invite notifications: SMS first, email fallback per reference
  for (const r of candidate.requests) {
    const link = `${baseUrl(req)}/?r=${r.token}`;
    const bodyText = inviteBody(agency.name, candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: r.refPhone || r.refEmail, body: bodyText, requestId: r.id });
    await sendNotification({ channel: "EMAIL", kind: "INVITE", to: r.refEmail, subject: `Reference request — ${candidate.fullName}`, body: bodyText, requestId: r.id });
    await logAudit({ actorType: "SYSTEM", action: "REQUEST_SENT", entity: "reference_request", entityId: r.id, detail: { ref: r.refEmail }, ip: clientIp(req) });
  }
  await logAudit({ actorType: "CANDIDATE", actorId: candidate.id, action: "PROFILE_CREATED", entity: "candidate", entityId: candidate.id, detail: { specialty: specialtyLabel(body.specialty), refs: candidate.requests.length }, ip: clientIp(req) });

  const requests = candidate.requests.map((r) => ({
    ...r,
    callbackCode: deriveCallbackCode(r.token),
    refLink: `${baseUrl(req)}/?r=${r.token}`,
  }));

  return NextResponse.json({ candidate: { ...candidate, requests } }, { status: 201 });
}
