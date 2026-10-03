import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";
import { CHECKLIST_VALIDITY_DAYS } from "@/lib/bts/constants";
import { LABELS, LAST_PERFORMED } from "@/lib/bts/checklistShared";

// ── POST /api/checklist/complete — save the self-assessment (once per checklist) ──
// body: { inviteId? } | { requestId? } + { profession, jobTitle, specialty, yearsExperience,
//         answers, additional, attestation }
// answers: [{ category, skill, questionType, value, na, lastPerformed }] — every rating row
//          also records WHEN the skill was last performed (3 | 6 | "6+" | na).
// additional: [{ id, value }] — the superadmin-managed "Additional questions" snapshot.
// attestation: { agreed, mode: "draw"|"type"|"upload", signature, printedName }

interface IncomingAnswer { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; lastPerformed?: string }

const RECENCY_KEYS = LAST_PERFORMED.map((r) => r.key);
const MAX_SIGNATURE_CHARS = 400_000; // ~300KB PNG/JPG data URL — keeps the row well under limits

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

    // validate coverage + answer shapes (rating rows also require the recency dimension)
    const incoming: IncomingAnswer[] = Array.isArray(body.answers) ? body.answers : [];
    const bySkill = new Map(incoming.map((a) => [`${a.category}::${a.skill}`, a]));
    const answers: { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk: boolean; lastPerformed: string | null }[] = [];
    const problems: string[] = [];
    for (const t of templates) {
      const a = bySkill.get(`${t.category}::${t.skillName}`);
      if (!a) { problems.push(`Missing answer: ${t.skillName}`); continue; }
      let lastPerformed: string | null = null;
      if (t.questionType === "rating_1_4") {
        const lp = typeof a.lastPerformed === "string" ? a.lastPerformed : "";
        if (!RECENCY_KEYS.includes(lp)) {
          problems.push(`Pick when you last performed it: ${t.skillName}`);
        } else {
          lastPerformed = lp;
        }
        const v = Number(a.value);
        if (!a.na && (!Number.isInteger(v) || v < 1 || v > 4)) problems.push(`Rate 1-4 (or N/A): ${t.skillName}`);
      } else if (t.questionType === "yes_no") {
        if (!a.na && a.value !== "yes" && a.value !== "no") problems.push(`Answer yes/no: ${t.skillName}`);
      } else if (!a.na && !String(a.value ?? "").trim()) {
        problems.push(`Text answer required: ${t.skillName}`);
      }
      if (a.na && !t.hasNA) problems.push(`N/A not allowed: ${t.skillName}`);
      answers.push({ category: t.category, skill: t.skillName, questionType: t.questionType, value: a.na ? null : a.value, na: a.na, highRisk: t.highRisk, lastPerformed });
    }
    if (problems.length) {
      return NextResponse.json({ ok: false, error: `Incomplete: ${problems.length} item(s) need attention`, problems: problems.slice(0, 12) }, { status: 400 });
    }

    // ── Additional questions (superadmin-managed; YES/No required, notes optional) ──
    const extrasRaw = await db.checklistExtraQuestion.findMany({
      where: { active: true, OR: [{ specialty: "" }, ...(spec.specialty ? [{ specialty: spec.specialty }] : [])] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const extraVals = new Map<string, unknown>(
      (Array.isArray(body.additional) ? body.additional : []).map((x: { id?: unknown; value?: unknown }) => [String(x?.id ?? ""), x?.value ?? null])
    );
    const additional: { id: string; prompt: string; kind: string; value: string | null }[] = [];
    for (const q of extrasRaw) {
      const v = extraVals.get(q.id);
      if (q.kind === "YES_NO") {
        if (v !== "yes" && v !== "no") { problems.push(`Answer Yes/No: ${q.prompt}`); continue; }
        additional.push({ id: q.id, prompt: q.prompt, kind: q.kind, value: v as string });
      } else {
        const text = String(v ?? "").trim().slice(0, 2000);
        additional.push({ id: q.id, prompt: q.prompt, kind: q.kind, value: text || null });
      }
    }
    if (problems.length) {
      return NextResponse.json({ ok: false, error: `Incomplete: ${problems.length} item(s) need attention`, problems: problems.slice(0, 12) }, { status: 400 });
    }

    // ── Attestation — required ──
    const att = body.attestation ?? {};
    const attAgreed = att?.agreed === true;
    const attMode = att?.mode === "draw" || att?.mode === "type" || att?.mode === "upload" ? att.mode : null;
    const attSignature = typeof att?.signature === "string" ? att.signature : "";
    const attPrinted = typeof att?.printedName === "string" ? att.printedName.trim().slice(0, 120) : "";
    if (!attAgreed) problems.push("Confirm the candidate attestation");
    if (!attMode) problems.push("Choose a signature method (draw, type or upload)");
    if (!attSignature) problems.push("Add your signature");
    else if (attSignature.length > MAX_SIGNATURE_CHARS) problems.push("Signature image is too large — try a smaller scan");
    if (problems.length) {
      return NextResponse.json({ ok: false, error: `Incomplete: ${problems.length} item(s) need attention`, problems: problems.slice(0, 12) }, { status: 400 });
    }

    const yearsExperience = Math.max(0, Math.min(60, Number(body.yearsExperience) || 0));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHECKLIST_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const attestation = JSON.stringify({ agreed: true, mode: attMode, signature: attSignature, printedName: attPrinted || account.name, signedAt: now.toISOString() });

    const completion = await db.checklistCompletion.create({
      data: {
        accountId: account.id,
        profession: spec.profession || "Nursing",
        jobTitle: spec.jobTitle || account.title || "RN",
        specialty: spec.specialty,
        specialtyLabel: LABELS[spec.specialty] ?? spec.specialty.replace(/_/g, " "),
        answers: JSON.stringify(answers),
        additional: JSON.stringify(additional),
        attestation,
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
      detail: JSON.stringify({ specialty: spec.specialty, skills: answers.length, source: inviteId ? "RECRUITER" : "SELF", attested: true }),
    });

    return NextResponse.json({ ok: true, completionId: completion.id, expiresAt });
  } catch (e) {
    console.error("[checklist/complete]", e);
    return NextResponse.json({ ok: false, error: "Could not save the checklist" }, { status: 500 });
  }
}
