import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification, reminderBody } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { REMINDER_DAYS } from "@/lib/bts/constants";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { viewerAllowedByRecipient } from "@/lib/bts/sharePolicy";
import { refLinkFor } from "@/lib/bts/refTokenCrypto";
import { originFor } from "@/lib/bts/origin";

// ── GET/POST /api/recruiter — recruiter dashboard (SESSION REQUIRED) ──
// Authorization model (PO decision Q3 + CH-06): recruiters see ONLY reference
// reports shared with THEM — a request is visible when it has an ACTIVE share
// link (not revoked, not consumed, not expired) whose recipient binding admits
// this recruiter: bound to their account/email, or an OPEN link (both recipient
// fields null — legacy rows grandfathered, or the candidate's explicit
// "anyone with this link" choice). Links bound to a different recruiter are
// invisible here. The legacy agency-wide static access code no longer grants
// pipeline access. Fraud-flag resolution is an admin function owned by the
// superadmin console.

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sandbox";
}

// Delegates to the shared helper — APP_ORIGIN wins when configured; raw
// client headers are only a fallback (SEC: forged Host poisons emailed links).
function baseUrl(req: NextRequest): string {
  return originFor(req);
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
  // CH-07: same verified+onboarded gate the invite/PDF routes enforce — a
  // verify-link session alone must not reach pipeline data or sweeps.
  if (!recruiter.emailVerified || !recruiter.onboardingComplete) {
    return NextResponse.json({ error: "Recruiter access requires a verified VaultVerify account. Finish onboarding first." }, { status: 401 });
  }

  // Explicitly shared requests only, and only bindings that admit THIS
  // recruiter (CH-06). Revoked/expired/consumed links cut access; links bound
  // to another recruiter never appear.
  // SEC-01(a)/SEC-15/CH-05: explicit field projection — the recruiter payload
  // carries report CONTENT only. Screening metadata (signerIp/signerUserAgent),
  // fraud-flag rows (admin console keeps those), and raw bearer share tokens
  // are never sent to recruiters.
  const viewer = { recruiterId: recruiter.id, recruiterEmail: recruiter.email };
  type ShareRowLike = { revoked: boolean; accessType: string; viewedAt: Date | null; expiresAt: Date | null } & Parameters<typeof viewerAllowedByRecipient>[0];
  const admitted = (l: ShareRowLike) => linkIsActive(l) && viewerAllowedByRecipient(l, viewer);
  const all = await db.referenceRequest.findMany({
    orderBy: { sentAt: "desc" },
    include: {
      candidate: { include: { agency: true } },
      response: { include: { skillChecks: true } },
      flags: true,
      shares: true,
    },
  });
  const requests = all.filter((r) => r.shares.some(admitted)).map((r) => ({
    id: r.id,
    status: r.status,
    sentAt: r.sentAt,
    completedAt: r.completedAt,
    daysOpen: Math.floor((Date.now() - new Date(r.sentAt).getTime()) / 86400000),
    candidate: {
      fullName: r.candidate.fullName,
      email: r.candidate.email,
      role: r.candidate.role,
      specialty: r.candidate.specialty,
      city: r.candidate.city,
      state: r.candidate.state,
    },
    refName: r.refName,
    refTitle: r.refTitle,
    refEmail: r.refEmail,
    facilityName: r.facilityName,
    relationship: r.relationship,
    response: r.response
      ? {
          overallRating: r.response.overallRating,
          identityMethod: r.response.identityMethod,
          confirmedRelationship: r.response.confirmedRelationship,
          confirmedFacility: r.response.confirmedFacility,
          confirmedDates: r.response.confirmedDates,
          answers: r.response.answers,
          q8Discipline: r.response.q8Discipline,
          q8Explanation: r.response.q8Explanation,
          remarks: r.response.remarks,
          signatureName: r.response.signatureName,
          signedAt: r.response.signedAt,
          durationSeconds: r.response.durationSeconds,
          skillChecks: r.response.skillChecks,
        }
      : null,
    // Share STATE without capabilities: no token field is exposed.
    shares: r.shares.map((l) => ({ accessType: l.accessType, expiresAt: l.expiresAt, viewedAt: l.viewedAt, revoked: l.revoked })),
  }));

  const completed = requests.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED");
  const active = requests.filter((r) => r.status !== "COMPLETED" && r.status !== "FLAGGED" && r.status !== "EXPIRED");
  // Flag-derived stats are computed server-side from the pre-projection rows;
  // flag details themselves stay in the admin console (SEC-15).
  const flagged = all.filter((r) => r.shares.some(admitted) && (r.status === "FLAGGED" || r.flags.length > 0));
  const durations = completed.map((r) => r.response?.durationSeconds ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
  const ratings = completed.map((r) => r.response?.overallRating).filter((v): v is number => v != null);
  const avgRating = ratings.length > 0 ? ratings.reduce((s, v) => s + v) / ratings.length : null;

  await logAudit({ actorType: "RECRUITER", actorId: recruiter.id, action: "DASHBOARD_VIEWED", entity: "recruiter", ip: clientIp(req) });

  // CH-06: a recruiter with zero admitted shares has no candidate agency to
  // brand from. The dashboard shell renders the agency unconditionally, so
  // returning null here crashed the client (prod incident 2026-10-18 —
  // "Cannot read properties of null (reading 'logoText')"). Return the
  // platform brand as the safe default instead.
  // SEC-01(a): agency fields are projected explicitly — billing and trust
  // state columns never leave the admin console.
  const firstAdmitted = all.find((r) => r.shares.some(admitted))?.candidate.agency;
  const agency = firstAdmitted
    ? {
        name: firstAdmitted.name,
        slug: firstAdmitted.slug,
        logoText: firstAdmitted.logoText,
        tagline: firstAdmitted.tagline,
        primaryColor: firstAdmitted.primaryColor,
        accentColor: firstAdmitted.accentColor,
      }
    : {
        name: "VaultVerify",
        slug: "vaultverify",
        logoText: "VV",
        tagline: "Honest references. Clearly labeled skills.",
        primaryColor: "#03363d",
        accentColor: "#7cc118",
      };

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
    requests,
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
  // CH-07: verified+onboarded gate (matches GET and the invite/PDF routes).
  if (!recruiter.emailVerified || !recruiter.onboardingComplete) {
    return NextResponse.json({ error: "Recruiter access requires a verified VaultVerify account. Finish onboarding first." }, { status: 401 });
  }

  // Fraud-flag resolution belongs to the superadmin console (least privilege).
  if (body.action === "resolve_flag" || body.action === "unflag_request") {
    await logAudit({ actorType: "RECRUITER", actorId: recruiter.id, action: "FLAG_ACTION_DENIED", entity: "recruiter", entityId: body.flagId ?? body.requestId ?? "", ip: clientIp(req) });
    return NextResponse.json({ error: "Flag review is handled by the VaultVerify trust & safety team." }, { status: 403 });
  }

  if (body.action === "run_reminders") {
    // Scoped sweep: only requests admitted to THIS recruiter via an active,
    // binding-compatible share link (CH-06) — never the whole agency pipeline.
    const viewer = { recruiterId: recruiter.id, recruiterEmail: recruiter.email };
    const all = await db.referenceRequest.findMany({
      where: { status: { in: ["SENT", "OPENED", "IN_PROGRESS"] } },
      include: { candidate: { include: { agency: true } }, shares: true },
    });
    const active = all.filter((r) => r.shares.some((l) => linkIsActive(l) && viewerAllowedByRecipient(l, viewer)));
    let sent = 0;
    let expiredCount = 0;
    let skippedCount = 0;
    for (const r of active) {
      const daysOpen = Math.floor((Date.now() - new Date(r.sentAt).getTime()) / 86400000);
      // Expire on the SAME boundary the referee link enforces (expiresAt),
      // not a day-count — otherwise day-14 sweeps email reminders whose
      // links are already dead.
      if (r.expiresAt && r.expiresAt <= new Date()) {
        await db.referenceRequest.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
        await logAudit({ actorType: "SYSTEM", action: "LINK_EXPIRED", entity: "reference_request", entityId: r.id });
        expiredCount++;
        continue;
      }
      // D4b: the reminder re-sends the EXISTING referee link, rebuilt by
      // decrypting the stored envelope (legacy rows: their raw value). If the
      // server key is unavailable the link cannot be rebuilt — that request is
      // SKIPPED, never emailed with a broken link. The sweep continues.
      const link = refLinkFor(r, baseUrl(req));
      if (!link) {
        skippedCount++;
        continue;
      }
      const due = REMINDER_DAYS.filter((d) => daysOpen >= d).length;
      if (due > r.reminderCount) {
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
    return NextResponse.json({ ok: true, remindersSent: sent, expiredCount, skippedCount, message: `Sweep complete: ${sent} reminder(s) sent, ${expiredCount} expired${skippedCount ? `, ${skippedCount} skipped (link unavailable)` : ""}.` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
