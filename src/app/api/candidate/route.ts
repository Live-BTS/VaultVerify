import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { guardOutbound } from "@/lib/bts/guard";
import { creditSpend } from "@/lib/bts/credits";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, inviteBody } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { LINK_EXPIRY_DAYS, specialtyLabel } from "@/lib/bts/constants";
import { CHECKLISTS } from "@/lib/bts/questions";
import { newToken, sha256Hex } from "@/lib/bts/tokens";
import { encryptRefToken, refLinkFor, callbackCodeFor } from "@/lib/bts/refTokenCrypto";
import { candidateProfileWhere, withAccountLink } from "@/lib/bts/identity";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ── GET /api/candidate?email=... — candidate dashboard data (SESSION REQUIRED) ──
// Authorization: the signed-in checklist account may read ONLY its own legacy
// candidate profile (matched by email). Any unauthenticated or mismatched
// request is rejected — this endpoint exposes reference responses, fraud flags
// and live invitation links, so email alone must never grant access.
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (email !== account.email.toLowerCase()) {
    return NextResponse.json({ error: "You can only view your own profile" }, { status: 403 });
  }

  // Phase E unified identity: the account's references profile resolves by its
  // accountId link first; unlinked pre-unification rows fall back to email.
  const candidate = await db.candidate.findFirst({
    where: candidateProfileWhere(account),
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

  // D4b: the raw token never leaves the server. The payload carries the
  // rebuilt link + callback code (decrypted server-side) and strips the
  // stored digest + envelope fields from the response.
  const requests = candidate.requests.map((r) => {
    const { token: _token, tokenEncrypted: _enc, ...safe } = r;
    void _token; void _enc;
    return {
      ...safe,
      callbackCode: callbackCodeFor(r) ?? "",
      refLink: refLinkFor(r, baseUrl(req)) ?? "",
    };
  });

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
  // References are requested ONE AT A TIME — a single referee is enough to
  // onboard; candidates add as many as they like from the portal afterward.
  if (!body.references || body.references.length < 1) {
    return NextResponse.json({ error: "At least 1 reference is required" }, { status: 400 });
  }
  // NOTE: the skills checklist is a SEPARATE, self-reported feature — it is NOT
  // required for (or verified by) reference verification. Optional self-reported
  // skills submitted here are stored as-is.

  const existing = await db.candidate.findFirst({ where: { email: body.email.toLowerCase().trim() } });
  if (existing) {
    return NextResponse.json({ error: "A profile with this email already exists — sign in instead." }, { status: 409 });
  }

  // Phase E unified identity: when the onboarding runs signed-in (the normal
  // portal path), the new references profile is linked to the account — one
  // registration drives both workflows. Signed-out onboarding still works and
  // is linked later by scripts/e-unify-accounts.ts (exact email match).
  const sessionAccount = await getAccount();

  const agency = (await db.agency.findUnique({ where: { slug: "vaultverify" } })) ?? (await db.agency.findFirst());
  if (!agency) return NextResponse.json({ error: "Agency not configured" }, { status: 500 });

  // Command layer: company state + credit balance gate every outbound batch.
  const outbound = await guardOutbound(agency.id);
  if (!outbound.ok) return NextResponse.json({ error: outbound.error }, { status: outbound.status });

  const candidate = await db.candidate.create({
    data: {
      agencyId: agency.id,
      ...withAccountLink(sessionAccount?.id),
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
        // D4b: the raw token exists only in memory — the row stores its
        // digest (lookup key) and its authenticated envelope (for resend).
        create: body.references.map((r) => {
          const raw = newToken();
          return {
            token: sha256Hex(raw),
            tokenEncrypted: encryptRefToken(raw),
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
          };
        }),
      },
    },
    include: { requests: true },
  });

  // invite notifications: SMS first, email fallback per reference.
  // The raw token is rebuilt server-side from the stored envelope
  // (refLinkFor → decryptRefToken). The email IS the delivery channel.
  for (const r of candidate.requests) {
    const link = refLinkFor(r, baseUrl(req)) ?? "";
    const bodyText = inviteBody(agency.name, candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: r.refPhone || r.refEmail, body: bodyText, requestId: r.id });
    await sendTemplatedEmail("reference_invite", r.refEmail, {
      agencyName: agency.name,
      candidateName: candidate.fullName,
      refName: r.refName,
      link,
      expiryDays: LINK_EXPIRY_DAYS,
    }, { requestId: r.id });
    await logAudit({ actorType: "SYSTEM", action: "REQUEST_SENT", entity: "reference_request", entityId: r.id, detail: { ref: r.refEmail }, ip: clientIp(req) });
  }
  await logAudit({ actorType: "CANDIDATE", actorId: candidate.id, action: "PROFILE_CREATED", entity: "candidate", entityId: candidate.id, detail: { specialty: specialtyLabel(body.specialty), refs: candidate.requests.length }, ip: clientIp(req) });
  // Meter: 1 credit per outbound verification (one batch = one request here).
  await creditSpend(agency.id, `Reference request — ${candidate.fullName}`, 1, "CANDIDATE", candidate.id);

  // D4b: creation response — the rebuilt link + callback code (raw delivered
  // here and in the invite email), stored digest/envelope stripped.
  const requests = candidate.requests.map((r) => {
    const { token: _token, tokenEncrypted: _enc, ...safe } = r;
    void _token; void _enc;
    return {
      ...safe,
      callbackCode: callbackCodeFor(r) ?? "",
      refLink: refLinkFor(r, baseUrl(req)) ?? "",
    };
  });

  return NextResponse.json({ candidate: { ...candidate, requests } }, { status: 201 });
}
