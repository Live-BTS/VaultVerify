import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";
import { originFor } from "@/lib/bts/origin";
import { sendNotification, inviteBody } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { LINK_EXPIRY_DAYS } from "@/lib/bts/constants";
import { guardOutbound } from "@/lib/bts/guard";
import { creditSpend } from "@/lib/bts/credits";
import { newToken, sha256Hex } from "@/lib/bts/tokens";
import { encryptRefToken, refLinkFor } from "@/lib/bts/refTokenCrypto";
import { candidateProfileWhere } from "@/lib/bts/identity";

// Minimum hours between candidate-initiated reminders for the same request.
const NUDGE_COOLDOWN_HOURS = 12;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

// Delegates to the shared helper — APP_ORIGIN wins when configured; raw
// client headers are only a fallback (SEC: forged Host poisons emailed links).
function baseUrl(req: NextRequest): string {
  return originFor(req);
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

// ── POST /api/candidate/actions — nudge or swap a reference (SESSION REQUIRED) ──
// Every action is scoped to the signed-in account's own candidate profile.
export async function POST(req: NextRequest) {
  let body: ActionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Session gate: these actions send outbound messages and spend credits.
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

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
    // Ownership: the signed-in account may only act on its own profile.
    // Phase E unified identity: accountId link first, unlinked-legacy email fallback.
    const email = account.email.toLowerCase().trim();
    const candidate = await db.candidate.findFirst({ where: candidateProfileWhere(account), include: { agency: true } });
    if (!candidate) return NextResponse.json({ error: "No reference profile found for this account" }, { status: 404 });
    // Command layer: company state + credits gate every new outbound request.
    const outbound = await guardOutbound(candidate.agencyId);
    if (!outbound.ok) return NextResponse.json({ error: outbound.error }, { status: outbound.status });
    const dup = await db.referenceRequest.findFirst({ where: { candidateId: candidate.id, refEmail: rf.refEmail.toLowerCase().trim(), status: { notIn: ["EXPIRED"] } } });
    if (dup) return NextResponse.json({ error: `${dup.refName} already has an open request` }, { status: 409 });
    // D4b: digest + envelope at rest; raw only in memory for the invite email.
    const raw = newToken();
    const created = await db.referenceRequest.create({
      data: {
        token: sha256Hex(raw),
        tokenEncrypted: encryptRefToken(raw),
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
    const link = `${baseUrl(req)}/?r=${raw}`;
    const bodyText = inviteBody(candidate.agency.name, candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: created.refPhone || created.refEmail, body: bodyText, requestId: created.id });
    const sent = await sendTemplatedEmail("reference_invite", created.refEmail, {
      agencyName: candidate.agency.name,
      candidateName: candidate.fullName,
      refName: created.refName,
      link,
      expiryDays: LINK_EXPIRY_DAYS,
    }, { requestId: created.id });
    await logAudit({ actorType: "CANDIDATE", actorId: candidate.id, action: "REFERENCE_ADDED", entity: "reference_request", entityId: created.id, detail: { ref: created.refEmail }, ip: clientIp(req) });
    // Billing fairness: no spend when the provider failed outright.
    if (sent && sent.status !== "FAILED") {
      await creditSpend(candidate.agencyId, `Reference request — ${candidate.fullName} → ${created.refName}`, 1, "CANDIDATE", candidate.id);
    }
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

  // Ownership: the request must belong to the signed-in account's own profile.
  if (request.candidate.email.toLowerCase() !== account.email.toLowerCase()) {
    return NextResponse.json({ error: "You can only manage your own reference requests" }, { status: 403 });
  }

  const agency = request.candidate.agency;

  // Command layer: nudges/swaps send real outbound email — company must be live.
  const outbound = await guardOutbound(agency.id);
  if (!outbound.ok) return NextResponse.json({ error: outbound.error }, { status: outbound.status });

  const OPEN_STATUSES = ["SENT", "OPENED", "IN_PROGRESS"];
  const isTerminal = (st: string) => st === "COMPLETED" || st === "FLAGGED" || st === "EXPIRED";

  if (body.action === "nudge") {
    // Status guard: a nudge re-sends the referee link — pointless (and a
    // confusing email) for an already-signed, flagged, or expired request.
    if (!OPEN_STATUSES.includes(request.status)) {
      return NextResponse.json({ error: "This request is no longer active — a reminder isn't needed." }, { status: 409 });
    }
    // Expiry guard: don't email a link that is already dead.
    if (request.expiresAt && request.expiresAt <= new Date()) {
      await db.referenceRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      return NextResponse.json({ error: "This reference link has expired — use Swap to request a fresh one." }, { status: 409 });
    }
    // Cooldown: at most one candidate-initiated reminder per 12h window.
    const last = request.lastReminderAt ? new Date(request.lastReminderAt).getTime() : 0;
    if (last && Date.now() - last < NUDGE_COOLDOWN_HOURS * 3600 * 1000) {
      return NextResponse.json({ error: `A reminder was sent recently — try again in a few hours.` }, { status: 429 });
    }
    // D4b: reminder re-sends the EXISTING link — rebuilt by decrypting the
    // stored envelope (or the legacy raw value pre-migration). If the key is
    // unavailable the link cannot be rebuilt and NO email goes out: a broken
    // reminder would be worse than none.
    const link = refLinkFor(request, baseUrl(req));
    if (!link) {
      return NextResponse.json({ error: "Reference link could not be rebuilt (server encryption key unavailable) — please contact support." }, { status: 503 });
    }
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
    await db.referenceRequest.update({ where: { id: request.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
    await logAudit({ actorType: "CANDIDATE", actorId: request.candidateId, action: "NUDGE_SENT", entity: "reference_request", entityId: request.id, ip: clientIp(req) });
    return NextResponse.json({ ok: true, message: `Nudge sent to ${request.refName}` });
  }

  if (body.action === "swap") {
    const repl = body.replacement;
    if (!repl?.refName || !repl?.refEmail || !repl?.refTitle || !repl?.facilityName) {
      return NextResponse.json({ error: "Replacement reference needs name, title, email and facility" }, { status: 400 });
    }
    // Guard: a signed (or flagged) report is the candidate's deliverable —
    // retiring it via swap would silently destroy a completed reference.
    if (isTerminal(request.status) && request.status !== "EXPIRED") {
      return NextResponse.json({ error: "This reference was already completed — it can't be swapped." }, { status: 409 });
    }
    // Duplicate guard (same rule add_reference enforces): don't email a
    // second open request to a referee who already has one.
    const dup = await db.referenceRequest.findFirst({ where: { candidateId: request.candidateId, refEmail: repl.refEmail.toLowerCase().trim(), status: { notIn: ["EXPIRED"] }, id: { not: request.id } } });
    if (dup) return NextResponse.json({ error: `${dup.refName} already has an open request` }, { status: 409 });
    const old = await db.referenceRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    // D4b: digest + envelope at rest; raw only in memory for the invite email.
    const raw = newToken();
    const created = await db.referenceRequest.create({
      data: {
        token: sha256Hex(raw),
        tokenEncrypted: encryptRefToken(raw),
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
    const link = `${baseUrl(req)}/?r=${raw}`;
    const bodyText = inviteBody(agency.name, request.candidate.fullName, link, LINK_EXPIRY_DAYS);
    await sendNotification({ channel: "SMS", kind: "INVITE", to: created.refPhone || created.refEmail, body: bodyText, requestId: created.id });
    const inviteSent = await sendTemplatedEmail("reference_invite", created.refEmail, {
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
    // SEC-17: oldId keeps the audit trail correlatable; the old referee's
    // email stays only in the access-controlled request row, not in logs.
    await logAudit({ actorType: "CANDIDATE", actorId: request.candidateId, action: "REFERENCE_SWAPPED", entity: "reference_request", entityId: created.id, detail: { oldId: old.id }, ip: clientIp(req) });
    // Billing fairness: no spend when the provider failed outright.
    if (inviteSent && inviteSent.status !== "FAILED") {
      await creditSpend(agency.id, `Reference swap — ${request.candidate.fullName} → ${created.refName}`, 1, "CANDIDATE", request.candidateId);
    }
    return NextResponse.json({ ok: true, message: `New request sent to ${created.refName}` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function reminderText(agencyName: string, candidateName: string, link: string): string {
  return `Reminder: ${candidateName}'s ${agencyName} reference form is still waiting for you — 3-5 minutes on any phone. Secure link: ${link}`;
}
