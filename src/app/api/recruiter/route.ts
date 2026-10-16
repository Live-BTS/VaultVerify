import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, reminderBody } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { REMINDER_DAYS, LINK_EXPIRY_DAYS } from "@/lib/bts/constants";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";

// ── GET/POST /api/recruiter — recruiter dashboard (SESSION REQUIRED) ──
// Authorization model (PO decision Q3): recruiters see ONLY reference reports
// that candidates explicitly shared with them — i.e. requests with at least one
// ACTIVE ReferenceShareLink (not revoked, not consumed, not expired). The legacy
// agency-wide static access code no longer grants pipeline access. Fraud-flag
// resolution is an admin function owned by the superadmin console.

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function linkIsActive(l: { revoked: boolean; accessType: string; viewedAt: Date | null; expiresAt: Date | null }): boolean {
  if (l.revoked) return false;
  if (l.expiresAt && l.expiresAt < new Date()) return false;
  if (l.accessType === "ONE_TIME" && l.viewedAt) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const recruiter = await getRecruiterSessionAccount();
  if (!recruiter) {
    return NextResponse.json(
      { error: "Recruiter access now requires a VaultVerify account. Sign in, or ask the candidate for a secure share link." },
      { status: 401 },
    );
  }

  // Explicitly shared requests only: any request that currently has an active
  // share link granted by a candidate. Revoked/expired/consumed links cut access.
  const all = await db.referenceRequest.findMany({
    orderBy: { sentAt: "desc" },
    include: {
      candidate: { include: { agency: true } },
      response: { include: { skillChecks: true } },
      flags: true,
      shares: true,
    },
  });
  const requests = all.filter((r) => r.shares.some(linkIsActive));

  const completed = requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED");
  const active = requests.filter((r) => r.status !== "COMPLETED" && r.status !== "FLAGGED" && r.status !== "EXPIRED");
  const flagged = requests.filter((r) => r.status === "FLAGGED" || r.flags.length > 0);
  const durations = completed.map((r) => r.response?.durationSeconds ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
  const ratings = completed.map((r) => r.response?.overallRating).filter((v): v is number => v != null);
  const avgRating = ratings.length > 0 ? ratings.reduce((s, v) => s + v) / ratings.length : null;

  await logAudit({ actorType: "RECRUITER", actorId: recruiter.id, action: "DASHBOARD_VIEWED", entity: "recruiter", ip: clientIp(req) });

  return NextResponse.json({
    agency: requests[0]?.candidate.agency ?? null,
    stats: {
      totalRequests: requests.length,
      completedCount: completed.length,
      completionRate: active.length + completed.length > 0 ? Math.round((completed.length / (active.length + completed.length)) * 100) : 0,
      flaggedCount: flagged.length,
      pendingCount: active.length,
      medianCompletionSeconds: median,
      avgRating,
    },
    requests: requests.map((r) => ({
      ...r,
      shares: r.shares.map((l) => ({ token: l.token, accessType: l.accessType, expiresAt: l.expiresAt, viewedAt: l.viewedAt, revoked: l.revoked })),
      refLink: null, // invitation links are the candidate's capability — never exposed to recruiters
      daysOpen: Math.floor((Date.now() - new Date(r.sentAt).getTime()) / 86400000),
    })),
    // Platform notification/audit tails are internal ops data — not recruiter-visible.
    notifications: [],
    audit: [],
  });
}

interface RecruiterAction {
  action: "run_reminders" | "resolve_flag" | "unflag_request";
  requestId?: string;
  flagId?: string;
}

// ── POST /api/recruiter — scoped reminder sweep (SESSION REQUIRED) ──
export async function POST(req: NextRequest) {
  let body: RecruiterAction;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recruiter = await getRecruiterSessionAccount();
  if (!recruiter) {
    return NextResponse.json(
      { error: "Recruiter access now requires a VaultVerify account. Sign in first." },
      { status: 401 },
    );
  }

  // Fraud-flag resolution belongs to the superadmin console (least privilege).
  if (body.action === "resolve_flag" || body.action === "unflag_request") {
    await logAudit({ actorType: "RECRUITER", actorId: recruiter.id, action: "FLAG_ACTION_DENIED", entity: "recruiter", entityId: body.flagId ?? body.requestId ?? "", ip: clientIp(req) });
    return NextResponse.json({ error: "Flag review is handled by the VaultVerify trust & safety team." }, { status: 403 });
  }

  if (body.action === "run_reminders") {
    // Scoped sweep: only requests explicitly shared with recruiters via an
    // active share link — never the whole agency pipeline.
    const all = await db.referenceRequest.findMany({
      where: { status: { in: ["SENT", "OPENED", "IN_PROGRESS"] } },
      include: { candidate: { include: { agency: true } }, shares: true },
    });
    const active = all.filter((r) => r.shares.some(linkIsActive));
    let sent = 0;
    let expiredCount = 0;
    for (const r of active) {
      const daysOpen = Math.floor((Date.now() - new Date(r.sentAt).getTime()) / 86400000);
      if (daysOpen > LINK_EXPIRY_DAYS) {
        await db.referenceRequest.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
        await logAudit({ actorType: "SYSTEM", action: "LINK_EXPIRED", entity: "reference_request", entityId: r.id });
        expiredCount++;
        continue;
      }
      const due = REMINDER_DAYS.filter((d) => daysOpen >= d).length;
      if (due > r.reminderCount) {
        const link = `${baseUrl(req)}/?r=${r.token}`;
        await sendNotification({
          channel: "SMS",
          kind: "REMINDER",
          to: r.refPhone || r.refEmail,
          body: reminderBody(r.candidate.agency.name, r.candidate.fullName, link, daysOpen),
          requestId: r.id,
        });
        await sendTemplatedEmail("reference_reminder", r.refEmail, {
          agencyName: r.candidate.agency.name,
          candidateName: r.candidate.fullName,
          refName: r.refName,
          link,
          daysOpen,
        }, { requestId: r.id });
        await db.referenceRequest.update({ where: { id: r.id }, data: { reminderCount: due, lastReminderAt: new Date() } });
        await logAudit({ actorType: "SYSTEM", action: "REMINDER_SENT", entity: "reference_request", entityId: r.id, detail: { day: daysOpen, count: due } });
        sent++;
      }
    }
    return NextResponse.json({ ok: true, remindersSent: sent, expiredCount, message: `Sweep complete: ${sent} reminder(s) sent, ${expiredCount} expired.` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
