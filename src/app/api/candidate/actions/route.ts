import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, inviteBody } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { LINK_EXPIRY_DAYS } from "@/lib/bts/constants";
import { guardOutbound } from "@/lib/bts/guard";
import { creditSpend } from "@/lib/bts/credits";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

interface ActionPayload {
  action: "nudge" | "swap" | "add_reference";
  requestId?: string;
  email?: string;
  reference?: {
    refName: string; refTitle: string; refEmail: string; refPhone: string;
    facilityName: string; facilityCity?: string; facilityState?: string;
    relationship: string; workStartDate?: string; workEndDate?: string;
  };
  replacement?: {
    refName: string; refTitle: string; refEmail: string; refPhone: string;
    facilityName: string; facilityCity?: string; facilityState?: string;
    relationship: string; workStartDate?: string; workEndDate?: string;
  };
}

// ── POST /api/candidate/actions — nudge or swap a reference ──
export async function POST(req: NextRequest) {
  let body: ActionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── add_reference: { email, reference } — candidate adds another reference from the portal ──
  // Resolved by candidate email (not an existing request), so it runs BEFORE the requestId lookup
  if (body.action === "add_reference") {
    const rf = body.reference;
    if (!rf?.refName || !rf?.refTitle || !rf?.refEmail || !rf?.facilityName || !rf?.relationship) {
      return NextResponse.json({ error: "Name, title, email, facility, and relationship are required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rf.refEmail)) {
      return NextResponse.json({ error: "Enter a valid email for the reference" }, { status: 400 });
    }
    const email = String(body.email ?? "").toLowerCase().trim();
    const candidate = await db.candidate.findFirst({ where: { email }, include: { agency: true } });
    if (!candidate) return NextResponse.json({ error: "No reference profile found for this account" }, { status: 404 });
    // Command layer: company state + credits gate every new outbound request.
    const outbound = await guardOutbound(candidate.agencyId);
    if (!outbound.ok) return NextResponse.json({ error: outbound.error }, { status: outbound.status });
    const dup = await db.referenceRequest.findFirst({ where: { candidateId: candidate.id, refEmail: rf.refEmail.toLowerCase().trim(), status: { notIn: ["EXPIRED"] } } });
    if (dup) return NextResponse.json({ error: `${dup.refName} already has an open request` }, { status: 409 });
    const created = await db.referenceRequest.create({
      data: {
        candidateId: candidate.id,
        refName: rf.refName.trim(),
        refTitle: rf.refTitle.trim(),
        refEmail: rf.refEmail.toLowerCase().trim(),
        refPhone: rf.refPhone ?? "",
        facilityName: rf.facilityName.trim(),
        facilityCity: rf.facilityCity ?? "",
        facilityState: rf.facilityState ?? "",
        relationship: rf.relationship,
        workStartDate: rf.workStartDate ?? "",
        workEndDate: rf.workEndDate ?? "",
        status: "SENT",
        expiresAt: new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const link = `${baseUrl(req)}/?r=${created.token}`;
    const bodyText = inviteBody(candidate.agency.name, candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: created.refPhone || created.refEmail, body: bodyText, requestId: created.id });
    await sendTemplatedEmail("reference_invite", created.refEmail, {
      agencyName: candidate.agency.name,
      candidateName: candidate.fullName,
      refName: created.refName,
      link,
      expiryDays: LINK_EXPIRY_DAYS,
    }, { requestId: created.id });
    await logAudit({ actorType: "CANDIDATE", actorId: candidate.id, action: "REFERENCE_ADDED", entity: "reference_request", entityId: created.id, detail: { ref: created.refEmail }, ip: clientIp(req) });
    await creditSpend(candidate.agencyId, `Reference request — ${candidate.fullName} → ${created.refName}`, 1, "CANDIDATE", candidate.id);
    return NextResponse.json({ ok: true, message: `Request sent to ${created.refName}` });
  }

  // nudge/swap operate on an existing request; add_reference keys off the
  // candidate email instead, so only resolve the request when an id was sent
  const request = body.requestId
    ? await db.referenceRequest.findUnique({
        where: { id: body.requestId },
        include: { candidate: { include: { agency: true } } },
      })
    : null;

  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const agency = request.candidate.agency;

  // Command layer: nudges/swaps send real outbound email — company must be live.
  const outbound = await guardOutbound(agency.id);
  if (!outbound.ok) return NextResponse.json({ error: outbound.error }, { status: outbound.status });

  if (body.action === "nudge") {
    const link = `${baseUrl(req)}/?r=${request.token}`;
    await sendNotification({
      channel: "SMS",
      kind: "REMINDER",
      to: request.refPhone || request.refEmail,
      body: reminderText(agency.name, request.candidate.fullName, link),
      requestId: request.id,
    });
    await sendTemplatedEmail("reference_reminder", request.refEmail, {
      agencyName: agency.name,
      candidateName: request.candidate.fullName,
      refName: request.refName,
      link,
      daysOpen: Math.floor((Date.now() - new Date(request.sentAt).getTime()) / 86400000),
    }, { requestId: request.id });
    await db.referenceRequest.update({ where: { id: request.id }, data: { lastReminderAt: new Date() } });
    await logAudit({ actorType: "CANDIDATE", actorId: request.candidateId, action: "NUDGE_SENT", entity: "reference_request", entityId: request.id, ip: clientIp(req) });
    return NextResponse.json({ ok: true, message: `Nudge sent to ${request.refName}` });
  }

  if (body.action === "swap") {
    const repl = body.replacement;
    if (!repl?.refName || !repl?.refEmail || !repl?.refTitle || !repl?.facilityName) {
      return NextResponse.json({ error: "Replacement reference needs name, title, email and facility" }, { status: 400 });
    }
    const old = await db.referenceRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    const created = await db.referenceRequest.create({
      data: {
        candidateId: request.candidateId,
        refName: repl.refName.trim(),
        refTitle: repl.refTitle.trim(),
        refEmail: repl.refEmail.toLowerCase().trim(),
        refPhone: repl.refPhone ?? "",
        facilityName: repl.facilityName.trim(),
        facilityCity: repl.facilityCity ?? "",
        facilityState: repl.facilityState ?? "",
        relationship: repl.relationship ?? request.relationship,
        workStartDate: repl.workStartDate ?? request.workStartDate,
        workEndDate: repl.workEndDate ?? request.workEndDate,
        status: "SENT",
        expiresAt: new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const link = `${baseUrl(req)}/?r=${created.token}`;
    const bodyText = inviteBody(agency.name, request.candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: created.refPhone || created.refEmail, body: bodyText, requestId: created.id });
    await sendTemplatedEmail("reference_invite", created.refEmail, {
      agencyName: agency.name,
      candidateName: request.candidate.fullName,
      refName: created.refName,
      link,
      expiryDays: LINK_EXPIRY_DAYS,
    }, { requestId: created.id });
    await sendTemplatedEmail("reference_withdrawn", old.refEmail, {
      candidateName: request.candidate.fullName,
      refName: old.refName,
    }, { requestId: old.id });
    await logAudit({ actorType: "CANDIDATE", actorId: request.candidateId, action: "REFERENCE_SWAPPED", entity: "reference_request", entityId: created.id, detail: { oldId: old.id, oldEmail: old.refEmail }, ip: clientIp(req) });
    await creditSpend(agency.id, `Reference swap — ${request.candidate.fullName} → ${created.refName}`, 1, "CANDIDATE", request.candidateId);
    return NextResponse.json({ ok: true, message: `New request sent to ${created.refName}` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function reminderText(agencyName: string, candidateName: string, link: string): string {
  return `Reminder: ${candidateName}'s ${agencyName} reference form is still waiting for you — 3-5 minutes on any phone. Secure link: ${link}`;
}
