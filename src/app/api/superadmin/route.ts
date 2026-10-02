import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { validateRows, upsertTemplates, type ImportRow } from "@/lib/bts/skillTemplates";

// ── POST /api/superadmin — platform administration (sandbox: passcode) ──
// Actions:
//   auth       { code }                              -> overview payload
//   import     { code, rows: ImportRow[] }           -> upsert validated templates
//   toggle     { code, id, active }                  -> enable/disable a template row
//   deleteSet  { code, profession, jobTitle, specialty } -> remove a whole checklist set
//   requests   { code }                              -> candidate checklist requests queue
//   decide     { code, id, approve }                 -> approve/reject a checklist request
// In production, replace the passcode with NextAuth/Supabase role claims.

const SUPERADMIN_CODE = process.env.SUPERADMIN_CODE ?? "zipvault2026";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Invalid superadmin code" }, { status: 401 });
}

async function overview() {
  const [agencies, candidates, requests, responses, templates, flags, notifications] = await Promise.all([
    db.agency.findMany({ include: { _count: { select: { candidates: true } } }, orderBy: { createdAt: "asc" } }),
    db.candidate.count(),
    db.referenceRequest.count(),
    db.referenceResponse.count(),
    db.skillTemplate.count(),
    db.fraudFlag.count({ where: { resolved: false } }),
    db.notificationLog.count(),
  ]);
  const completed = await db.referenceRequest.count({ where: { status: "COMPLETED" } });
  const checklistRequests = await db.checklistRequest.count({ where: { status: "PENDING" } });

  const templatesRaw = await db.skillTemplate.findMany({ orderBy: [{ specialty: "asc" }, { sortOrder: "asc" }, { skillName: "asc" }] });
  const sets = new Map<string, { profession: string; jobTitle: string; specialty: string; count: number; sources: Set<string>; rows: typeof templatesRaw }>();
  for (const t of templatesRaw) {
    const k = `${t.profession}|${t.jobTitle}|${t.specialty}`;
    if (!sets.has(k)) sets.set(k, { profession: t.profession, jobTitle: t.jobTitle, specialty: t.specialty, count: 0, sources: new Set(), rows: [] });
    const s = sets.get(k)!;
    s.count += t.active ? 1 : 0;
    s.sources.add(t.source);
    s.rows.push(t);
  }

  return {
    stats: { agencies: agencies.length, candidates, requests, completed, responses, templates, openFlags: flags, notifications, pendingChecklistRequests: checklistRequests },
    agencies: agencies.map((a) => ({ id: a.id, name: a.name, slug: a.slug, logoText: a.logoText, candidates: a._count.candidates, primaryColor: a.primaryColor, accentColor: a.accentColor })),
    sets: [...sets.values()].map((s) => ({ ...s, sources: [...s.sources], rows: s.rows.map((r) => ({ id: r.id, category: r.category, skillName: r.skillName, questionType: r.questionType, hasNA: r.hasNA, highRisk: r.highRisk, active: r.active, source: r.source })) })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.code !== SUPERADMIN_CODE) return unauthorized();

    switch (body.action) {
      case "auth": {
        return NextResponse.json({ ok: true, ...(await overview()) });
      }

      case "import": {
        const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return NextResponse.json({ ok: false, error: "No rows to import" }, { status: 400 });
        const { errors, clean } = validateRows(rows);
        let result = { created: 0, updated: 0 };
        if (clean.length) result = await upsertTemplates(clean, "IMPORT");
        await logAudit({
          actorType: "RECRUITER",
          actorId: "superadmin",
          action: "SKILL_TEMPLATES_IMPORTED",
          entity: "skillTemplate",
          detail: JSON.stringify({ submitted: rows.length, created: result.created, updated: result.updated, rejected: errors.length }),
        });
        return NextResponse.json({ ok: true, ...result, errors });
      }

      case "toggle": {
        const t = await db.skillTemplate.update({ where: { id: body.id }, data: { active: !!body.active } });
        return NextResponse.json({ ok: true, template: t });
      }

      case "requests": {
        const rows = await db.checklistRequest.findMany({
          orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
          take: 100,
          include: { account: { select: { name: true, email: true, title: true } } },
        });
        return NextResponse.json({
          ok: true,
          requests: rows.map((r) => ({
            id: r.id,
            account: r.account,
            profession: r.profession,
            jobTitle: r.jobTitle,
            specialty: r.specialty,
            status: r.status,
            requestedAt: r.requestedAt,
            decidedAt: r.decidedAt,
          })),
        });
      }

      case "decide": {
        const request = await db.checklistRequest.findUnique({ where: { id: String(body.id ?? "") }, include: { account: true } });
        if (!request) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });
        if (request.status !== "PENDING") return NextResponse.json({ ok: false, error: "Already decided" }, { status: 400 });
        const updated = await db.checklistRequest.update({
          where: { id: request.id },
          data: { status: body.approve ? "APPROVED" : "REJECTED", decidedAt: new Date() },
        });
        await logAudit({
          actorType: "RECRUITER",
          actorId: "superadmin",
          action: body.approve ? "CHECKLIST_REQUEST_APPROVED" : "CHECKLIST_REQUEST_REJECTED",
          entity: "checklistRequest",
          entityId: request.id,
          detail: JSON.stringify({ specialty: request.specialty, email: request.account.email }),
        });
        return NextResponse.json({ ok: true, request: updated });
      }

      case "deleteSet": {
        const del = await db.skillTemplate.deleteMany({
          where: { profession: body.profession, jobTitle: body.jobTitle, specialty: body.specialty },
        });
        await logAudit({
          actorType: "RECRUITER",
          actorId: "superadmin",
          action: "SKILL_TEMPLATE_SET_DELETED",
          entity: "skillTemplate",
          detail: JSON.stringify({ specialty: body.specialty, deleted: del.count }),
        });
        return NextResponse.json({ ok: true, deleted: del.count });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[superadmin]", e);
    return NextResponse.json({ ok: false, error: "Superadmin request failed" }, { status: 500 });
  }
}
