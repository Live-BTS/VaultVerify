import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";
import { CHECKLIST_VALIDITY_DAYS } from "@/lib/bts/constants";
import { LABELS } from "@/lib/bts/checklistShared";

// ── POST /api/checklist/complete — save the self-assessment (once per checklist) ──
// body: { inviteId? } | { requestId? } + { profession, jobTitle, specialty, yearsExperience, answers }
// answers: [{ category, skill, questionType, value, na }] — one entry per active template row.

interface IncomingAnswer { category: string; skill: string; questionType: string; value: number | string | null; na: boolean }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

    const inviteId = typeof body.inviteId === "string" ? body.inviteId : null;
    const requestId = typeof body.requestId === "string" ? body.requestId : null;
    if (!inviteId === !requestId) {
      return NextResponse.json({ ok: false, error: "Specify an invite or an approved request" }, { status: 400 });
    }

    // resolve the checklist spec (profession/jobTitle/specialty) + permission
    let spec = { profession: "", jobTitle: "", specialty: "" };
    if (inviteId) {
      const invite = await db.checklistInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.accountId !== account.id) return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
      if (invite.status === "COMPLETED") return NextResponse.json({ ok: false, error: "This checklist was already completed — it lives in your account" }, { status: 400 });
      spec = { profession: body.profession || invite.profession, jobTitle: body.jobTitle || invite.jobTitle, specialty: body.specialty || invite.specialty };
    } else if (requestId) {
      const request = await db.checklistRequest.findUnique({ where: { id: requestId }, include: { completion: true } });
      if (!request || request.accountId !== account.id) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });
      if (request.status !== "APPROVED") return NextResponse.json({ ok: false, error: "This request is not approved yet" }, { status: 400 });
      if (request.completion) return NextResponse.json({ ok: false, error: "This checklist was already completed" }, { status: 400 });
      spec = { profession: request.profession, jobTitle: request.jobTitle, specialty: request.specialty };
    }
    if (!spec.specialty) return NextResponse.json({ ok: false, error: "Pick a specialty for the checklist" }, { status: 400 });

    // load the active template rows for this set
    const templates = await db.skillTemplate.findMany({
      where: { active: true, specialty: spec.specialty, jobTitle: spec.jobTitle, profession: spec.profession },
      orderBy: [{ sortOrder: "asc" }, { skillName: "asc" }],
    });
    if (!templates.length) return NextResponse.json({ ok: false, error: "No active skills found for that checklist — ask the admin to publish it" }, { status: 400 });

    // validate coverage + answer shapes
    const incoming: IncomingAnswer[] = Array.isArray(body.answers) ? body.answers : [];
    const bySkill = new Map(incoming.map((a) => [`${a.category}::${a.skill}`, a]));
    const snapshot: IncomingAnswer[] & { highRisk?: boolean }[] = [];
    const answers: { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk: boolean }[] = [];
    const problems: string[] = [];
    for (const t of templates) {
      const a = bySkill.get(`${t.category}::${t.skillName}`);
      if (!a) { problems.push(`Missing answer: ${t.skillName}`); continue; }
      if (t.questionType === "rating_1_4") {
        const v = Number(a.value);
        if (!a.na && (!Number.isInteger(v) || v < 1 || v > 4)) problems.push(`Rate 1-4 (or N/A): ${t.skillName}`);
      } else if (t.questionType === "yes_no") {
        if (!a.na && a.value !== "yes" && a.value !== "no") problems.push(`Answer yes/no: ${t.skillName}`);
      } else if (!a.na && !String(a.value ?? "").trim()) {
        problems.push(`Text answer required: ${t.skillName}`);
      }
      if (a.na && !t.hasNA) problems.push(`N/A not allowed: ${t.skillName}`);
      answers.push({ category: t.category, skill: t.skillName, questionType: t.questionType, value: a.na ? null : a.value, na: a.na, highRisk: t.highRisk });
    }
    if (problems.length) {
      return NextResponse.json({ ok: false, error: `Incomplete: ${problems.length} item(s) need attention`, problems: problems.slice(0, 12) }, { status: 400 });
    }

    const yearsExperience = Math.max(0, Math.min(60, Number(body.yearsExperience) || 0));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKLIST_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    const completion = await db.checklistCompletion.create({
      data: {
        accountId: account.id,
        profession: spec.profession || "Nursing",
        jobTitle: spec.jobTitle || account.title || "RN",
        specialty: spec.specialty,
        specialtyLabel: LABELS[spec.specialty] ?? spec.specialty.replace(/_/g, " "),
        answers: JSON.stringify(answers),
        yearsExperience,
        source: inviteId ? "RECRUITER" : "SELF",
        inviteId: inviteId ?? undefined,
        requestId: requestId ?? undefined,
        completedAt: now,
        expiresAt,
      },
    });

    if (inviteId) {
      await db.checklistInvite.update({ where: { id: inviteId }, data: { status: "COMPLETED", completedAt: now, completionId: completion.id } });
    }

    await logAudit({
      actorType: "CANDIDATE", actorId: account.id, action: "CHECKLIST_COMPLETED",
      entity: "checklistCompletion", entityId: completion.id,
      detail: JSON.stringify({ specialty: spec.specialty, skills: answers.length, source: completion.source }),
    });

    return NextResponse.json({ ok: true, completionId: completion.id, expiresAt });
  } catch (e) {
    console.error("[checklist/complete]", e);
    return NextResponse.json({ ok: false, error: "Could not save the checklist" }, { status: 500 });
  }
}
