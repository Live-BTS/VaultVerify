import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { validateRows, upsertTemplates, type ImportRow } from "@/lib/bts/skillTemplates";
import { buildSystemStatus } from "@/lib/bts/systemConfig";

// ── POST /api/superadmin — platform administration (sandbox: passcode) ──
// Actions:
//   auth       { code }                              -> overview payload (+users, candidateProfiles, companies w/ credits)
//   import     { code, rows: ImportRow[] }           -> upsert validated templates
//   toggle     { code, id, active }                  -> enable/disable a template row
//   deleteSet  { code, profession, jobTitle, specialty } -> remove a whole checklist set
//   requests   { code }                              -> candidate checklist requests queue
//   decide     { code, id, approve }                 -> approve/reject a checklist request
// In production, replace the passcode with NextAuth/Supabase role claims.

// Access code lives ONLY in environment variables — never in source.
// Fail-closed: if SUPERADMIN_CODE is unset, no code can match.
const SUPERADMIN_CODE = process.env.SUPERADMIN_CODE ?? "";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Invalid superadmin code" }, { status: 401 });
}

function yearsFrom(manual: number, start: Date | null): number {
  if (start) {
    const months = (Date.now() - new Date(start).getTime()) / (30.44 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(months / 12));
  }
  return manual;
}

async function overview() {
  const [agencies, candidates, requests, responses, templates, flags, notifications, accounts, invites, refRequests, extras] = await Promise.all([
    db.agency.findMany({ include: { _count: { select: { candidates: true } } }, orderBy: { createdAt: "asc" } }),
    db.candidate.count(),
    db.referenceRequest.count(),
    db.referenceResponse.count(),
    db.skillTemplate.count(),
    db.fraudFlag.count({ where: { resolved: false } }),
    db.notificationLog.count(),
    db.checklistAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { completions: true, requests: true, invites: true } } },
    }),
    db.checklistInvite.count(),
    db.referenceRequest.count(),
    db.checklistExtraQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
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

  // ── Data Center + user management payloads (from checklist accounts) ──
  const users = accounts.map((a) => ({
    id: a.id, name: a.name, email: a.email, title: a.discipline || a.title,
    onboardingComplete: a.onboardingComplete,
    completions: a._count.completions, requests: a._count.requests, invites: a._count.invites,
    joinedAt: a.createdAt,
  }));
  const candidateProfiles = accounts.map((a) => ({
    id: a.id, name: a.name, phone: a.phone, email: a.email,
    city: a.city, state: a.state, zip: a.zip,
    profession: a.profession, discipline: a.discipline || a.title, specialty: a.specialty,
    yrsOverall: yearsFrom(a.yrsOverall, a.yrsOverallStart),
    yrsSpecialty: yearsFrom(a.yrsSpecialty, a.yrsSpecialtyStart),
    yrsOverallStart: a.yrsOverallStart ? a.yrsOverallStart.toISOString().slice(0, 10) : "",
    yrsSpecialtyStart: a.yrsSpecialtyStart ? a.yrsSpecialtyStart.toISOString().slice(0, 10) : "",
  }));

  // ── Company management + credit management ──
  // Sandbox metering: 1 credit per outbound verification (reference request or checklist invite).
  const companies = agencies.map((a) => {
    const used = refRequests + invites; // sandbox-level metering (per-platform until per-tenant counters ship)
    return {
      id: a.id, name: a.name, slug: a.slug, logoText: a.logoText,
      candidates: a._count.candidates, primaryColor: a.primaryColor, accentColor: a.accentColor,
      creditsGranted: a.creditsGranted, creditsUsed: used, creditsRemaining: Math.max(0, a.creditsGranted - used),
    };
  });

  return {
    stats: { agencies: agencies.length, candidates, requests, completed, responses, templates, openFlags: flags, notifications, pendingChecklistRequests: checklistRequests },
    agencies: agencies.map((a) => ({ id: a.id, name: a.name, slug: a.slug, logoText: a.logoText, candidates: a._count.candidates, primaryColor: a.primaryColor, accentColor: a.accentColor })),
    sets: [...sets.values()].map((s) => ({ ...s, sources: [...s.sources], rows: s.rows.map((r) => ({ id: r.id, category: r.category, skillName: r.skillName, questionType: r.questionType, hasNA: r.hasNA, highRisk: r.highRisk, active: r.active, source: r.source })) })),
    users,
    candidateProfiles,
    companies,
    extras: extras.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, placeholder: q.placeholder, specialty: q.specialty, active: q.active, sortOrder: q.sortOrder })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Trim both sides: paste-whitespace or autocapitalize must not lock the owner out.
    // Fail-closed stays intact: if SUPERADMIN_CODE is unset, no supplied code can match.
    const supplied = typeof body.code === "string" ? body.code.trim() : "";
    if (!SUPERADMIN_CODE || supplied !== SUPERADMIN_CODE.trim()) return unauthorized();

    switch (body.action) {
      case "auth": {
        return NextResponse.json({ ok: true, ...(await overview()) });
      }

      case "system_config": {
        // CONFIGURED FLAGS ONLY — values never leave the server.
        return NextResponse.json({ ok: true, ...buildSystemStatus() });
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

      // ── Additional questions (the PDF's extra section) — full CRUD ──
      case "extra.create": {
        const kind = body.kind === "TEXT" ? "TEXT" : "YES_NO";
        const prompt = String(body.prompt ?? "").trim();
        if (prompt.length < 4) return NextResponse.json({ ok: false, error: "Question text is too short" }, { status: 400 });
        const q = await db.checklistExtraQuestion.create({
          data: {
            kind,
            prompt: prompt.slice(0, 300),
            placeholder: String(body.placeholder ?? "").slice(0, 200),
            specialty: String(body.specialty ?? ""),
            sortOrder: Number(body.sortOrder) || (kind === "YES_NO" ? 10 : 50),
          },
        });
        await logAudit({ actorType: "RECRUITER", actorId: "superadmin", action: "EXTRA_QUESTION_CREATED", entity: "checklistExtraQuestion", entityId: q.id, detail: JSON.stringify({ kind }) });
        return NextResponse.json({ ok: true, question: q });
      }

      case "extra.update": {
        const prompt = String(body.prompt ?? "").trim();
        if (prompt.length < 4) return NextResponse.json({ ok: false, error: "Question text is too short" }, { status: 400 });
        const q = await db.checklistExtraQuestion.update({
          where: { id: String(body.id ?? "") },
          data: {
            prompt: prompt.slice(0, 300),
            placeholder: String(body.placeholder ?? "").slice(0, 200),
            specialty: String(body.specialty ?? ""),
          },
        });
        await logAudit({ actorType: "RECRUITER", actorId: "superadmin", action: "EXTRA_QUESTION_UPDATED", entity: "checklistExtraQuestion", entityId: q.id });
        return NextResponse.json({ ok: true, question: q });
      }

      case "extra.toggle": {
        const q = await db.checklistExtraQuestion.update({ where: { id: String(body.id ?? "") }, data: { active: !!body.active } });
        await logAudit({ actorType: "RECRUITER", actorId: "superadmin", action: "EXTRA_QUESTION_TOGGLED", entity: "checklistExtraQuestion", entityId: q.id, detail: JSON.stringify({ active: q.active }) });
        return NextResponse.json({ ok: true, question: q });
      }

      case "extra.delete": {
        await db.checklistExtraQuestion.delete({ where: { id: String(body.id ?? "") } });
        await logAudit({ actorType: "RECRUITER", actorId: "superadmin", action: "EXTRA_QUESTION_DELETED", entity: "checklistExtraQuestion", entityId: String(body.id ?? "") });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[superadmin]", e);
    return NextResponse.json({ ok: false, error: "Superadmin request failed" }, { status: 500 });
  }
}
