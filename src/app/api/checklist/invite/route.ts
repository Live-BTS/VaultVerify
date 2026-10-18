import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification } from "@/lib/bts/notifications";
import { sendTemplatedEmail } from "@/lib/bts/emailTemplates";
import { guardOutbound } from "@/lib/bts/guard";
import { creditSpend, primaryAgencyId } from "@/lib/bts/credits";
import { newToken, sha256Hex, tokenLookups, isTokenHashed } from "@/lib/bts/tokens";
import { originFor } from "@/lib/bts/origin";

// ── POST /api/checklist/invite — recruiter sends a checklist to a candidate ──
// CH-07 (PO decision): invitations are bound to the sending recruiter — a
// verified, onboarded recruiter ACCOUNT session is required; the legacy agency
// access code no longer authorizes any action here. Recruiters see and manage
// ONLY the invitations they sent; an invitation alone never authorizes a
// completed-checklist PDF (see /api/checklist/pdf).
// send    : { candidateName, candidateEmail, candidatePhone, profession, jobTitle, specialty, facilityName?, message? }
// list    : {}                     → THIS recruiter's invitations only
// lookup  : { email }              → pre-fill ONLY from invites this recruiter already sent
// preview : { token }              → public invite info so the signup form can pre-fill
// claim   : { token }  (candidate session) — attach an invite link to the signed-in account

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// UX pack: record a link-open when the candidate opens the claim link
// (preview or claim). firstViewedAt is set-once; the viewCount increment is
// rate-limited to once per minute (lastViewedAt guard) so refreshes and
// link prefetches don't inflate it. Best-effort — never blocks the read.
async function recordInviteView(invite: { id: string; firstViewedAt: Date | null; lastViewedAt: Date | null }) {
  try {
    const now = new Date();
    const recent = invite.lastViewedAt && now.getTime() - invite.lastViewedAt.getTime() < 60_000;
    await db.checklistInvite.update({
      where: { id: invite.id },
      data: {
        firstViewedAt: invite.firstViewedAt ?? now,
        lastViewedAt: now,
        ...(recent ? {} : { viewCount: { increment: 1 } }),
      },
    });
  } catch { /* tracking is advisory */ }
}

// Count draft rows the candidate actually filled (rating given, or marked N/A).
// Mirrors the fill screen's completion idea loosely — it powers the recruiter's
// "In progress" chip; the fill screen's own validation stays the real gate.
function draftAnsweredOf(draft: string | null): number {
  if (!draft) return 0;
  try {
    const d = JSON.parse(draft) as { answers?: Record<string, { value: number | null; na?: boolean }> };
    return Object.values(d.answers ?? {}).filter((a) => a && typeof a === "object" && (a.na === true || a.value != null)).length;
  } catch { return 0; }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "claim") {
    try {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
      // D4: digest-first lookup (post-cutover invites), raw fallback (legacy).
      const invite = await db.checklistInvite.findFirst({ where: { token: { in: tokenLookups(String(body.token ?? "")) } } });
      if (!invite) return NextResponse.json({ ok: false, error: "Invite link not found" }, { status: 404 });
      if (invite.status === "COMPLETED") return NextResponse.json({ ok: true, alreadyDone: true });
      if (invite.accountId && invite.accountId !== account.id) return NextResponse.json({ ok: false, error: "This invite belongs to another account" }, { status: 403 });
      if (!invite.accountId) {
        await db.checklistInvite.update({ where: { id: invite.id }, data: { accountId: account.id } });
      }
      // UX pack: a signed-in candidate landing via the link counts as an open.
      await recordInviteView(invite);
      return NextResponse.json({ ok: true, invite: { id: invite.id, recruiterName: invite.recruiterName, specialty: invite.specialty } });
    } catch (e) {
      console.error("[checklist/invite/claim]", e);
      return NextResponse.json({ ok: false, error: "Claim failed" }, { status: 500 });
    }
  }

  if (body.action === "preview") {
    try {
      // D4: digest-first lookup (post-cutover invites), raw fallback (legacy).
      const invite = await db.checklistInvite.findFirst({ where: { token: { in: tokenLookups(String(body.token ?? "")) } } });
      if (!invite) return NextResponse.json({ ok: false, error: "Invite link not found" }, { status: 404 });
      // UX pack: opening the claim link is the recruiter's first signal.
      await recordInviteView(invite);
      return NextResponse.json({
        ok: true,
        invite: {
          candidateName: invite.candidateName,
          candidateEmail: invite.candidateEmail,
          candidatePhone: invite.candidatePhone,
          profession: invite.profession,
          jobTitle: invite.jobTitle,
          specialty: invite.specialty,
          recruiterName: invite.recruiterName,
          facilityName: invite.facilityName,
          agencyName: invite.agencyName,
          message: invite.message,
          status: invite.status,
        },
      });
    } catch (e) {
      console.error("[checklist/invite/preview]", e);
      return NextResponse.json({ ok: false, error: "Preview failed" }, { status: 500 });
    }
  }

  // UX pack (C2): candidate autosaves in-flight checklist progress so the
  // recruiter sees live completion percentage. Only the claimed owner can
  // write; completed invites are immutable; the draft is size-capped.
  // NOTE: candidate-scope action — must sit ABOVE the recruiter-session gate.
  if (body.action === "progress") {
    try {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
      const inviteId = String(body.inviteId ?? "");
      if (!inviteId) return NextResponse.json({ ok: false, error: "Invite required" }, { status: 400 });
      const invite = await db.checklistInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.accountId !== account.id) return NextResponse.json({ ok: false, error: "Not your invite" }, { status: 403 });
      if (invite.status === "COMPLETED") return NextResponse.json({ ok: false, error: "Checklist already completed" }, { status: 409 });
      const raw = JSON.stringify(body.draft ?? {});
      if (raw.length > 24_000) return NextResponse.json({ ok: false, error: "Draft too large" }, { status: 413 });
      await db.checklistInvite.update({
        where: { id: invite.id },
        data: { draftProgress: raw, draftUpdatedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[checklist/invite/progress]", e);
      return NextResponse.json({ ok: false, error: "Progress save failed" }, { status: 500 });
    }
  }

  // CH-07: verified, onboarded recruiter account session — the static agency
  // code is retired from this route. Everything below is scoped to the sender.
  const recruiter = await getRecruiterSessionAccount();
  if (!recruiter || !recruiter.emailVerified || !recruiter.onboardingComplete) {
    return NextResponse.json({ ok: false, error: "Recruiter access requires a verified VaultVerify account. Sign in first." }, { status: 401 });
  }

  // Emailed claim links MUST be absolute — an email client has no base-URL
  // context, and Brevo's click-tracking wrapper 404s on relative URLs
  // ("invalid URL: host missing", prod incident 2026-10-18). Every other
  // email flow builds links via originFor(); this route is no exception.
  const origin = originFor(req);

  // recruiter asks: does this candidate already have an account? Pre-fill is
  // answered ONLY from invitations THIS recruiter already sent — never a
  // platform-wide directory probe (SEC-02).
  if (body.action === "lookup") {
    try {
      const email = String(body.email ?? "").trim().toLowerCase();
      const prior = await db.checklistInvite.findFirst({
        where: { recruiterAccountId: recruiter.id, candidateEmail: email },
        orderBy: { createdAt: "desc" },
      });
      if (!prior) return NextResponse.json({ ok: true, exists: false });
      const acc = await db.checklistAccount.findUnique({ where: { email } });
      if (!acc) return NextResponse.json({ ok: true, exists: false, fromInvite: { name: prior.candidateName, phone: prior.candidatePhone, profession: prior.profession, jobTitle: prior.jobTitle, specialty: prior.specialty } });
      return NextResponse.json({
        ok: true,
        exists: true,
        profile: {
          name: acc.name,
          phone: acc.phone,
          profession: acc.profession,
          jobTitle: acc.discipline || acc.title,
          specialty: acc.specialty,
        },
      });
    } catch (e) {
      console.error("[checklist/invite/lookup]", e);
      return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
    }
  }

  try {
    if (body.action === "list") {
      // CH-07: THIS recruiter's invitations only. Legacy invites (sent before
      // sender binding existed) are console-only — they appear to no recruiter.
      const invites = await db.checklistInvite.findMany({
        where: { recruiterAccountId: recruiter.id },
        orderBy: { createdAt: "desc" },
        take: 60,
      });
      const completionIds = invites.map((i) => i.completionId).filter((x): x is string => !!x);
      const completions = await db.checklistCompletion.findMany({
        where: { id: { in: completionIds } },
        include: { account: true },
      });
      const byId = new Map(completions.map((c) => [c.id, c]));
      return NextResponse.json({
        ok: true,
        invites: invites.map((i) => {
          const c = i.completionId ? byId.get(i.completionId) : null;
          return {
            id: i.id,
            candidateName: i.candidateName,
            candidateEmail: i.candidateEmail,
            candidatePhone: i.candidatePhone,
            profession: i.profession,
            jobTitle: i.jobTitle,
            specialty: i.specialty,
            specialtyLabel: c?.specialtyLabel ?? i.specialty.replace(/_/g, " "),
            recruiterName: i.recruiterName,
            facilityName: i.facilityName,
            status: i.status,
            createdAt: i.createdAt,
            completedAt: i.completedAt,
            // UX pack: engagement + live progress for the recruiter's list.
            firstViewedAt: i.firstViewedAt?.toISOString() ?? null,
            lastViewedAt: i.lastViewedAt?.toISOString() ?? null,
            viewCount: i.viewCount,
            draftAnswered: draftAnsweredOf(i.draftProgress),
            draftUpdatedAt: i.draftUpdatedAt?.toISOString() ?? null,
            // D4: hashed invites can't re-build their claim URL (shown once in
            // the send response and delivered by email). Legacy invites keep it.
            claimUrl: i.accountId || isTokenHashed(i.token) ? null : `${origin}/?view=checklist&invite=${i.token}`,
            completion: c
              ? {
                  candidateName: c.account.name,
                  candidateTitle: c.account.title,
                  jobTitle: c.jobTitle,
                  specialtyLabel: c.specialtyLabel,
                  yearsExperience: c.yearsExperience,
                  completedAt: c.completedAt,
                  expiresAt: c.expiresAt,
                }
              : null,
          };
        }),
      });
    }

    // ── send ──
    const candidateName = String(body.candidateName ?? "").trim();
    const candidateEmail = String(body.candidateEmail ?? "").trim().toLowerCase();
    const candidatePhone = String(body.candidatePhone ?? "").trim();
    if (candidateName.length < 2) return NextResponse.json({ ok: false, error: "Candidate name is required" }, { status: 400 });
    if (!emailOk(candidateEmail)) return NextResponse.json({ ok: false, error: "A valid candidate email is required" }, { status: 400 });
    if (candidatePhone.replace(/\D/g, "").length < 7) return NextResponse.json({ ok: false, error: "A valid candidate phone number is required" }, { status: 400 });

    // Command layer: company state + credit balance gate every outbound invite.
    const outbound = await guardOutbound();
    if (!outbound.ok) return NextResponse.json({ ok: false, error: outbound.error }, { status: outbound.status });

    // CH-07: the invitation is owned by the sending recruiter account. The
    // recruiter name is taken from the authenticated account, not the client.
    // D4: the raw invite token is generated here, hashed into the row, and
    // delivered exactly once — in this response's claimUrl and in the email.
    const rawInviteToken = newToken();
    const invite = await db.checklistInvite.create({
      data: {
        token: sha256Hex(rawInviteToken),
        candidateName,
        candidateEmail,
        candidatePhone,
        profession: String(body.profession ?? "").trim(),
        jobTitle: String(body.jobTitle ?? "").trim(),
        specialty: String(body.specialty ?? "").trim(),
        recruiterName: recruiter.name || "Recruiter",
        facilityName: String(body.facilityName ?? "").trim(),
        message: String(body.message ?? "").slice(0, 500),
        recruiterAccountId: recruiter.id,
      },
    });
    // if the candidate already has an account, claim immediately
    const existing = await db.checklistAccount.findUnique({ where: { email: candidateEmail } });
    if (existing) {
      await db.checklistInvite.update({ where: { id: invite.id }, data: { accountId: existing.id } });
    }
    // sandbox email delivery (simulated → NotificationLog): the candidate gets a
    // setup link — email is pre-filled, they only set a password + onboarding form
    // SEC-25: the delivery result is SURFACED, never swallowed — the recruiter
    // sees whether the invite actually went out (SENT / SIMULATED / FAILED).
    const setupLink = `${origin}/?view=checklist&invite=${rawInviteToken}`;
    let emailDelivery: "SENT" | "SIMULATED" | "FAILED" = "FAILED";
    try {
      const logRow = await sendTemplatedEmail("checklist_invite", candidateEmail, {
        recruiterName: invite.recruiterName,
        organization: invite.facilityName || invite.agencyName,
        candidateName,
        setupLink,
      });
      emailDelivery = (logRow?.status as typeof emailDelivery) ?? "FAILED";
    } catch {
      emailDelivery = "FAILED"; // invite row survives; the recruiter can resend from the dashboard
    }
    // Billing fairness: no spend when the provider failed outright.
    if (emailDelivery !== "FAILED") {
      await creditSpend(outbound.agencyId ?? (await primaryAgencyId()) ?? "", `Checklist invite — ${candidateName}`, 1, "RECRUITER", invite.recruiterName);
    }
    await logAudit({
      actorType: "RECRUITER", actorId: recruiter.id, action: "CHECKLIST_INVITE_SENT",
      entity: "checklistInvite", entityId: invite.id,
      // F4 consistency: no candidate email in the audit detail — entityId links
      // to the invite row, which holds contact data behind access control.
      detail: { specialty: invite.specialty, emailDelivery },
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        claimUrl: existing ? null : `${origin}/?view=checklist&invite=${rawInviteToken}`,
      },
      claimedByAccount: !!existing,
      emailDelivery,
    });
  } catch (e) {
    console.error("[checklist/invite]", e);
    return NextResponse.json({ ok: false, error: "Invite request failed" }, { status: 500 });
  }
}
