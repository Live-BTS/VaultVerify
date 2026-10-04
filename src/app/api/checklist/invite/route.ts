import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { recruiterAuthed } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification } from "@/lib/bts/notifications";
import { guardOutbound } from "@/lib/bts/guard";
import { creditSpend, primaryAgencyId } from "@/lib/bts/credits";

// ── POST /api/checklist/invite — recruiter sends a checklist to a candidate ──
// send    : { code, candidateName, candidateEmail, candidatePhone, profession, jobTitle, specialty, recruiterName, facilityName?, message? }
// list    : { code }
// lookup  : { code, email }        -> auto-fetch candidate details if they already have an account
// preview : { token }              -> public invite info so the signup form can pre-fill
// claim   : { token }  (candidate session) — attach an invite link to the signed-in account

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "claim") {
    try {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
      const invite = await db.checklistInvite.findUnique({ where: { token: String(body.token ?? "") } });
      if (!invite) return NextResponse.json({ ok: false, error: "Invite link not found" }, { status: 404 });
      if (invite.status === "COMPLETED") return NextResponse.json({ ok: true, alreadyDone: true });
      if (invite.accountId && invite.accountId !== account.id) return NextResponse.json({ ok: false, error: "This invite belongs to another account" }, { status: 403 });
      if (!invite.accountId) {
        await db.checklistInvite.update({ where: { id: invite.id }, data: { accountId: account.id } });
      }
      return NextResponse.json({ ok: true, invite: { id: invite.id, recruiterName: invite.recruiterName, specialty: invite.specialty } });
    } catch (e) {
      console.error("[checklist/invite/claim]", e);
      return NextResponse.json({ ok: false, error: "Claim failed" }, { status: 500 });
    }
  }

  if (body.action === "preview") {
    try {
      const invite = await db.checklistInvite.findUnique({ where: { token: String(body.token ?? "") } });
      if (!invite) return NextResponse.json({ ok: false, error: "Invite link not found" }, { status: 404 });
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

  // Agency access code OR verified recruiter account session.
  if (!(await recruiterAuthed(typeof body.code === "string" ? body.code : ""))) {
    return NextResponse.json({ ok: false, error: "Invalid recruiter code" }, { status: 401 });
  }

  // recruiter asks: does this candidate already have an account? auto-fetch their details
  if (body.action === "lookup") {
    try {
      const email = String(body.email ?? "").trim().toLowerCase();
      const acc = await db.checklistAccount.findUnique({ where: { email } });
      if (!acc) return NextResponse.json({ ok: true, exists: false });
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
      const invites = await db.checklistInvite.findMany({ orderBy: { createdAt: "desc" }, take: 60 });
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
            claimUrl: i.accountId ? null : `/?view=checklist&invite=${i.token}`,
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

    const invite = await db.checklistInvite.create({
      data: {
        candidateName,
        candidateEmail,
        candidatePhone,
        profession: String(body.profession ?? "").trim(),
        jobTitle: String(body.jobTitle ?? "").trim(),
        specialty: String(body.specialty ?? "").trim(),
        recruiterName: String(body.recruiterName ?? "Recruiter").trim() || "Recruiter",
        facilityName: String(body.facilityName ?? "").trim(),
        message: String(body.message ?? "").slice(0, 500),
      },
    });
    // if the candidate already has an account, claim immediately
    const existing = await db.checklistAccount.findUnique({ where: { email: candidateEmail } });
    if (existing) {
      await db.checklistInvite.update({ where: { id: invite.id }, data: { accountId: existing.id } });
    }
    // sandbox email delivery (simulated → NotificationLog): the candidate gets a
    // setup link — email is pre-filled, they only set a password + onboarding form
    const setupLink = `/?view=checklist&invite=${invite.token}`;
    await sendNotification({
      channel: "EMAIL",
      kind: "INVITE",
      to: candidateEmail,
      subject: `${invite.recruiterName} requested your skills checklist`,
      body: existing
        ? `You have a new skills checklist request from ${invite.recruiterName} (${invite.facilityName || invite.agencyName}). Sign in at ${setupLink} — it's waiting in your Invites tab.`
        : `${invite.recruiterName} (${invite.facilityName || invite.agencyName}) requested your skills checklist. Your email is already set — open ${setupLink} to set your password, confirm your details, and complete it once (valid 1 year).`,
    }).catch(() => undefined);
    await creditSpend(outbound.agencyId ?? (await primaryAgencyId()) ?? "", `Checklist invite — ${candidateName}`, 1, "RECRUITER", invite.recruiterName);
    await logAudit({
      actorType: "RECRUITER", actorId: invite.recruiterName, action: "CHECKLIST_INVITE_SENT",
      entity: "checklistInvite", entityId: invite.id,
      detail: JSON.stringify({ candidateEmail, specialty: invite.specialty }),
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        claimUrl: existing ? null : `/?view=checklist&invite=${invite.token}`,
      },
      claimedByAccount: !!existing,
    });
  } catch (e) {
    console.error("[checklist/invite]", e);
    return NextResponse.json({ ok: false, error: "Invite request failed" }, { status: 500 });
  }
}
