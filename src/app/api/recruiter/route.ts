import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, reminderBody } from "@/lib/bts/notifications";
import { REMINDER_DAYS, LINK_EXPIRY_DAYS } from "@/lib/bts/constants";

// Access code lives ONLY in environment variables — never in source.
// Fail-closed: if RECRUITER_CODE is unset, no code can match.
export const RECRUITER_CODE = process.env.RECRUITER_CODE ?? "";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

function baseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ── GET /api/recruiter?code=... — full pipeline dashboard ──
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code !== RECRUITER_CODE) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  const agency = await db.agency.findFirst({ where: { slug: "vaultverify" } });
  const requests = await db.referenceRequest.findMany({
    orderBy: { sentAt: "desc" },
    include: {
      candidate: { include: { agency: true } },
      response: { include: { skillChecks: true } },
      flags: true,
    },
  });

  const completed = requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED");
  const active = requests.filter((r) => r.status !== "COMPLETED" && r.status !== "FLAGGED" && r.status !== "EXPIRED");
  const flagged = requests.filter((r) => r.status === "FLAGGED" || r.flags.length > 0);
  const durations = completed.map((r) => r.response?.durationSeconds ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
  const ratings = completed.map((r) => r.response?.overallRating).filter((v): v is number => v != null);
  const avgRating = ratings.length > 0 ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null;

  const notifications = await db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 });
  const audit = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 });

  await logAudit({ actorType: "RECRUITER", action: "DASHBOARD_VIEWED", entity: "recruiter", ip: clientIp(req) });

  return NextResponse.json({
    agency,
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
      refLink: `${baseUrl(req)}/?r=${r.token}`,
      daysOpen: Math.floor((Date.now() - new Date(r.sentAt).getTime()) / 86400000),
    })),
    notifications,
    audit,
  });
}

interface RecruiterAction {
  action: "run_reminders" | "resolve_flag" | "unflag_request";
  requestId?: string;
  flagId?: string;
}

// ── POST /api/recruiter — reminder sweep + flag resolution ──
export async function POST(req: NextRequest) {
  let body: RecruiterAction;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "run_reminders") {
    const active = await db.referenceRequest.findMany({
      where: { status: { in: ["SENT", "OPENED", "IN_PROGRESS"] } },
      include: { candidate: { include: { agency: true } } },
    });
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
        await db.referenceRequest.update({ where: { id: r.id }, data: { reminderCount: due, lastReminderAt: new Date() } });
        await logAudit({ actorType: "SYSTEM", action: "REMINDER_SENT", entity: "reference_request", entityId: r.id, detail: { day: daysOpen, count: due } });
        sent++;
      }
    }
    return NextResponse.json({ ok: true, remindersSent: sent, expiredCount, message: `Sweep complete: ${sent} reminder(s) sent, ${expiredCount} expired.` });
  }

  if (body.action === "resolve_flag" && body.flagId) {
    const flag = await db.fraudFlag.update({ where: { id: body.flagId }, data: { resolved: true } });
    await logAudit({ actorType: "RECRUITER", action: "FLAG_RESOLVED", entity: "fraud_flag", entityId: flag.id, ip: clientIp(req) });
    return NextResponse.json({ ok: true, message: "Flag marked as reviewed." });
  }

  if (body.action === "unflag_request" && body.requestId) {
    await db.fraudFlag.updateMany({ where: { requestId: body.requestId }, data: { resolved: true } });
    const request = await db.referenceRequest.update({ where: { id: body.requestId }, data: { status: "COMPLETED" } });
    await logAudit({ actorType: "RECRUITER", action: "REQUEST_UNFLAGGED", entity: "reference_request", entityId: request.id, ip: clientIp(req) });
    return NextResponse.json({ ok: true, message: "Request reviewed and cleared." });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
