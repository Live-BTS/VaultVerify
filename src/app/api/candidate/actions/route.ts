import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, inviteBody } from "@/lib/bts/notifications";
import { LINK_EXPIRY_DAYS } from "@/lib/bts/constants";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

interface ActionPayload {
  action: "nudge" | "swap";
  requestId: string;
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

  const request = await db.referenceRequest.findUnique({
    where: { id: body.requestId },
    include: { candidate: { include: { agency: true } } },
  });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const agency = request.candidate.agency;

  if (body.action === "nudge") {
    const link = `${baseUrl(req)}/?r=${request.token}`;
    await sendNotification({
      channel: "SMS",
      kind: "REMINDER",
      to: request.refPhone || request.refEmail,
      body: reminderText(agency.name, request.candidate.fullName, link),
      requestId: request.id,
    });
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
    await sendNotification({ channel: "EMAIL", kind: "INVITE", to: created.refEmail, subject: `Reference request — ${request.candidate.fullName}`, body: bodyText, requestId: created.id });
    await sendNotification({ channel: "EMAIL", kind: "SWAP_NOTICE", to: old.refEmail, subject: "Reference request withdrawn", body: `${request.candidate.fullName} has replaced this reference request with a different contact. No action is needed.`, requestId: old.id });
    await logAudit({ actorType: "CANDIDATE", actorId: request.candidateId, action: "REFERENCE_SWAPPED", entity: "reference_request", entityId: created.id, detail: { oldId: old.id, oldEmail: old.refEmail }, ip: clientIp(req) });
    return NextResponse.json({ ok: true, message: `New request sent to ${created.refName}` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function reminderText(agencyName: string, candidateName: string, link: string): string {
  return `Reminder: ${candidateName}'s ${agencyName} reference form is still waiting for you — 3-5 minutes on any phone. Secure link: ${link}`;
}
