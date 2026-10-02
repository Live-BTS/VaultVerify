import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";

// ── POST /api/checklist/invite — recruiter sends a checklist to a candidate ──
// send  : { code, candidateName, candidateEmail, profession?, jobTitle?, specialty?, recruiterName, facilityName?, message? }
// list  : { code }
// claim : { token }  (candidate session) — attach an invite link to the signed-in account

const RECRUITER_CODE = process.env.RECRUITER_CODE ?? "meds2026";

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

  if (body.code !== RECRUITER_CODE) return NextResponse.json({ ok: false, error: "Invalid recruiter code" }, { status: 401 });

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
    if (candidateName.length < 2) return NextResponse.json({ ok: false, error: "Candidate name is required" }, { status: 400 });
    if (!emailOk(candidateEmail)) return NextResponse.json({ ok: false, error: "A valid candidate email is required" }, { status: 400 });

    const invite = await db.checklistInvite.create({
      data: {
        candidateName,
        candidateEmail,
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
