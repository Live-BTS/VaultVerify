import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { runFraudChecks } from "@/lib/bts/fraud";
import { deriveCallbackCode } from "@/lib/bts/seed";
import { sendNotification } from "@/lib/bts/notifications";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { QUESTIONS, Q8_EXPLANATION_PROMPT } from "@/lib/bts/questions";
import { specialtyLabel, type AnswerRecord } from "@/lib/bts/constants";

export const FREE_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "proton.me"];

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

async function loadContext(token: string) {
  return db.referenceRequest.findUnique({
    where: { token },
    include: {
      candidate: { include: { agency: true, skills: true } },
      response: { include: { skillChecks: true } },
      flags: true,
    },
  });
}

// ── GET /api/reference/[token] — form context for the reference ──
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await loadContext(token);
  if (!request) return NextResponse.json({ error: "Invalid or unknown link" }, { status: 404 });

  const expired = new Date() > request.expiresAt && request.status !== "COMPLETED" && request.status !== "FLAGGED";
  if (expired && request.status !== "EXPIRED") {
    await db.referenceRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    await logAudit({ actorType: "SYSTEM", action: "LINK_EXPIRED", entity: "reference_request", entityId: request.id });
  }

  // mark opened
  if (request.status === "SENT") {
    await db.referenceRequest.update({ where: { id: request.id }, data: { status: "OPENED", openedAt: new Date() } });
    await logAudit({ actorType: "REFERENCE", action: "FORM_OPENED", entity: "reference_request", entityId: request.id, ip: clientIp(req), detail: { ref: request.refEmail } });
    request.status = "OPENED";
  }

  const { candidate } = request;
  // does the referrer already hold a VaultVerify account with this email?
  // (drives the onboarding section of the form — existing accounts skip it)
  const existingAccount = await db.checklistAccount.findUnique({ where: { email: request.refEmail.toLowerCase().trim() } });
  return NextResponse.json({
    agency: candidate.agency,
    candidate: {
      fullName: candidate.fullName,
      role: candidate.role,
      specialty: candidate.specialty,
      specialtyLabel: specialtyLabel(candidate.specialty),
      city: candidate.city,
      state: candidate.state,
    },
    request: {
      id: request.id,
      refName: request.refName,
      refTitle: request.refTitle,
      refEmail: request.refEmail,
      relationship: request.relationship,
      facilityName: request.facilityName,
      facilityCity: request.facilityCity,
      facilityState: request.facilityState,
      workStartDate: request.workStartDate,
      workEndDate: request.workEndDate,
      status: request.status,
      expired,
      sentAt: request.sentAt,
      expiresAt: request.expiresAt,
      startedAt: request.startedAt,
    },
    nurseSkills: candidate.skills.map((s) => ({ skillName: s.skillName, highRisk: s.highRisk, proficiency: s.proficiency, recencyMonths: s.recencyMonths })),
    response: request.response,
    flags: request.flags,
    accountExists: !!existingAccount,
  });
}

interface VerifyPayload {
  action: "verify_identity" | "start" | "submit";
  // verify_identity
  method?: "EMAIL_DOMAIN" | "CALLBACK_CODE" | "SKIPPED";
  workEmail?: string;
  callbackCode?: string;
  // start
  // submit
  identityMethodClient?: "EMAIL_DOMAIN" | "CALLBACK_CODE" | "SKIPPED";
  verifiedDomain?: string;
  confirmedRelationship?: string;
  confirmedFacility?: string;
  confirmedDates?: string;
  mismatchNotes?: string;
  answers?: AnswerRecord[];
  q8Explanation?: string;
  remarks?: string;
  signatureName?: string;
  durationSeconds?: number;
  // onboarding — when present (and no account exists yet) the referrer's
  // VaultVerify candidate account is created the moment they submit
  accountPassword?: string;
  skillsVerified?: boolean;
  skillChecks?: { skillName: string; nurseProficiency: string; confirmed: boolean; refProficiency?: string; comment?: string }[];
}

// ── POST /api/reference/[token] — lifecycle actions ──
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: VerifyPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const request = await loadContext(token);
  if (!request) return NextResponse.json({ error: "Invalid or unknown link" }, { status: 404 });
  if (new Date() > request.expiresAt && request.status !== "COMPLETED" && request.status !== "FLAGGED") {
    return NextResponse.json({ error: "This link has expired. Please ask the nurse to send a new request." }, { status: 410 });
  }
  if (request.response && body.action !== "verify_identity") {
    return NextResponse.json({ error: "This reference has already been submitted." }, { status: 409 });
  }

  // ── Identity verification ──
  if (body.action === "verify_identity") {
    const method = body.method ?? "SKIPPED";
    if (method === "EMAIL_DOMAIN") {
      const email = (body.workEmail ?? "").toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid work email address" }, { status: 400 });
      }
      const domain = email.split("@")[1];
      if (FREE_EMAIL_DOMAINS.includes(domain)) {
        return NextResponse.json({ error: "Free email providers can't be used for verification — use your employer email or the phone callback code." }, { status: 400 });
      }
      await db.referenceRequest.update({ where: { id: request.id }, data: { status: "IN_PROGRESS", startedAt: request.startedAt ?? new Date() } });
      await logAudit({ actorType: "REFERENCE", action: "IDENTITY_VERIFIED", entity: "reference_request", entityId: request.id, detail: { method, domain }, ip: clientIp(req) });
      return NextResponse.json({ ok: true, identityMethod: method, verifiedDomain: domain });
    }
    if (method === "CALLBACK_CODE") {
      const expected = deriveCallbackCode(request.token);
      if ((body.callbackCode ?? "").trim() !== expected) {
        return NextResponse.json({ error: "That code doesn't match. Ask the nurse for the 6-digit callback code." }, { status: 400 });
      }
      await db.referenceRequest.update({ where: { id: request.id }, data: { status: "IN_PROGRESS", startedAt: request.startedAt ?? new Date() } });
      await logAudit({ actorType: "REFERENCE", action: "IDENTITY_VERIFIED", entity: "reference_request", entityId: request.id, detail: { method }, ip: clientIp(req) });
      return NextResponse.json({ ok: true, identityMethod: method });
    }
    // SKIPPED — allowed, but a LOW flag is recorded at submit
    await db.referenceRequest.update({ where: { id: request.id }, data: { status: "IN_PROGRESS", startedAt: request.startedAt ?? new Date() } });
    await logAudit({ actorType: "REFERENCE", action: "IDENTITY_SKIPPED", entity: "reference_request", entityId: request.id, ip: clientIp(req) });
    return NextResponse.json({ ok: true, identityMethod: "SKIPPED" });
  }

  // ── Start (progress heartbeat) ──
  if (body.action === "start") {
    if (request.status === "OPENED" || request.status === "SENT") {
      await db.referenceRequest.update({ where: { id: request.id }, data: { status: "IN_PROGRESS", startedAt: request.startedAt ?? new Date() } });
      await logAudit({ actorType: "REFERENCE", action: "FORM_STARTED", entity: "reference_request", entityId: request.id, ip: clientIp(req) });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Submit ──
  const answers = body.answers ?? [];
  const answerMap = new Map(answers.map((a) => [a.key, a]));

  // validate required questions
  const missing: string[] = [];
  for (const q of QUESTIONS) {
    const a = answerMap.get(q.key);
    if (!a) { missing.push(q.key); continue; }
    if (q.type === "rating") {
      if (!a.unableToObserve && (a.value == null || (typeof a.value === "number" && (a.value < 1 || a.value > 5)))) missing.push(q.key);
    } else if (q.type === "select" || q.type === "text") {
      if (!a.value || String(a.value).trim() === "") missing.push(q.key);
    } else if (q.type === "boolean") {
      if (a.value !== "YES" && a.value !== "NO" && a.value !== "PREFER_NOT") missing.push(q.key);
    }
  }
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing answers: ${missing.join(", ")}` }, { status: 400 });
  }

  const q8Value = answerMap.get("q8_discipline")?.value;
  const q8Yes = q8Value === "YES";
  const q8Explanation = (body.q8Explanation ?? "").trim();
  const remarks = (body.remarks ?? "").trim();
  if (q8Yes && q8Explanation.length < 10) {
    return NextResponse.json({ error: Q8_EXPLANATION_PROMPT }, { status: 400 });
  }
  if (q8Yes && remarks.length < 5) {
    return NextResponse.json({ error: "Remarks are required when a disciplinary action or complaint is reported." }, { status: 400 });
  }

  const signatureName = (body.signatureName ?? "").trim();
  if (signatureName.length < 3) {
    return NextResponse.json({ error: "A typed signature is required to submit." }, { status: 400 });
  }

  // compute overall rating from numeric rating answers
  const ratings = answers.filter((a) => a.type === "rating" && !a.unableToObserve && typeof a.value === "number") as { value: number }[];
  const overall = ratings.length > 0 ? ratings.reduce((s, r) => s + r.value, 0) / ratings.length : null;

  // server-side duration
  const startedAt = request.startedAt ?? request.openedAt ?? request.sentAt;
  const serverDuration = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
  const duration = Math.max(body.durationSeconds ?? 0, serverDuration);

  // employment fields — the new single-screen form no longer asks the referrer
  // to re-enter what the candidate already provided; derive from the request
  // (the q1 answer is the referrer's own stated relationship, including
  // "Other — <custom relation>" when they picked Other and typed it in)
  const q1Value = String(answerMap.get("q1_relationship")?.value ?? "");
  const confirmedRelationship = (body.confirmedRelationship ?? "").trim() || q1Value || request.relationship;
  const confirmedFacility = (body.confirmedFacility ?? "").trim() ||
    `${request.facilityName}${request.facilityCity ? ", " + request.facilityCity : ""}${request.facilityState ? ", " + request.facilityState : ""}`;
  const confirmedDates = (body.confirmedDates ?? "").trim() ||
    `${request.workStartDate || "?"} – ${request.workEndDate || "present"}`;
  let mismatchNotes = (body.mismatchNotes ?? "").trim();
  const relMismatch = confirmedRelationship && request.relationship && confirmedRelationship !== request.relationship;
  if (relMismatch) {
    mismatchNotes = (mismatchNotes ? mismatchNotes + " " : "") + `Stated relationship "${request.relationship}" was corrected to "${confirmedRelationship}".`;
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  const identityMethod = body.identityMethodClient ?? "SKIPPED";
  const flags = await runFraudChecks({
    requestId: request.id,
    candidateName: request.candidate.fullName,
    refEmail: request.refEmail,
    signerIp: ip,
    durationSeconds: duration,
    identityMethod,
    verifiedDomain: body.verifiedDomain ?? null,
  });

  const highSeverity = flags.some((f) => f.severity === "HIGH");
  const finalStatus = highSeverity ? "FLAGGED" : "COMPLETED";

  const response = await db.referenceResponse.create({
    data: {
      requestId: request.id,
      identityMethod,
      verifiedDomain: body.verifiedDomain ?? null,
      confirmedRelationship,
      confirmedFacility,
      confirmedDates,
      mismatchNotes,
      answers: JSON.stringify(answers),
      overallRating: overall,
      q8Discipline: q8Yes,
      q8Explanation: q8Yes ? q8Explanation : null,
      remarks,
      signatureName,
      signedAt: new Date(),
      signerIp: ip,
      signerUserAgent: ua,
      durationSeconds: duration,
      skillsVerified: !!body.skillsVerified,
      skillChecks: {
        create: (body.skillChecks ?? []).map((s) => ({
          skillName: s.skillName,
          nurseProficiency: s.nurseProficiency,
          confirmed: !!s.confirmed,
          refProficiency: s.refProficiency ?? null,
          comment: s.comment ?? "",
        })),
      },
    },
  });

  await db.referenceRequest.update({ where: { id: request.id }, data: { status: finalStatus, completedAt: new Date() } });

  // ── Onboarding: the referrer becomes a VaultVerify candidate ──
  // Completing the reference creates their account with the password they set
  // in the onboarding section — exactly like any other candidate signup.
  let accountCreated = false;
  const password = String(body.accountPassword ?? "");
  const refEmail = request.refEmail.toLowerCase().trim();
  const alreadyExists = await db.checklistAccount.findUnique({ where: { email: refEmail } });
  if (password.length >= 8 && !alreadyExists) {
    try {
      const account = await db.checklistAccount.create({
        data: {
          email: refEmail,
          name: request.refName.trim(),
          passwordHash: hashPassword(password),
          title: request.refTitle.trim() || "RN",
          phone: request.refPhone ?? "",
          profession: "Nursing",
          discipline: request.refTitle.trim() || "RN",
          onboardingComplete: false, // they confirm their profile on first sign-in
        },
      });
      accountCreated = true;
      await logAudit({ actorType: "REFERENCE", action: "REFERRER_ACCOUNT_CREATED", entity: "checklistAccount", entityId: account.id, detail: { requestId: request.id }, ip });
    } catch {
      // unique-race or DB issue — the reference itself is already saved
      accountCreated = false;
    }
  }

  await sendNotification({
    channel: "EMAIL",
    kind: "COMPLETION",
    to: request.candidate.agency.name.toLowerCase().replace(/\s+/g, "") + "@recruiting.local",
    subject: `Reference completed — ${request.candidate.fullName} (${request.refName})`,
    body: `Reference from ${request.refName} for ${request.candidate.fullName} was ${finalStatus === "FLAGGED" ? "completed and FLAGGED for review" : "completed"}. Average rating: ${overall?.toFixed(1) ?? "n/a"}.`,
    requestId: request.id,
  });
  await logAudit({
    actorType: "REFERENCE",
    action: "FORM_SUBMITTED",
    entity: "reference_request",
    entityId: request.id,
    detail: { status: finalStatus, flags: flags.map((f) => f.type), overall },
    ip,
  });

  return NextResponse.json({ ok: true, status: finalStatus, responseId: response.id, flags, accountCreated });
}


