import { NextRequest, NextResponse } from "next/server";
import { randomInt, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { validateRows, upsertTemplates, type ImportRow } from "@/lib/bts/skillTemplates";
import { buildSystemStatus } from "@/lib/bts/systemConfig";
import { sha256 } from "@/lib/bts/auth";
import { sendNotification } from "@/lib/bts/notifications";
import { creditAdjust, creditBalance } from "@/lib/bts/credits";
import { killCandidateSessions, killRecruiterSessions } from "@/lib/bts/guard";
import { getPlatformFlag, setPlatformFlag, deletePlatformFlag, MAINTENANCE_KEY } from "@/lib/bts/platform";

// ── POST /api/superadmin — platform administration (OTP + backup code) ──
// Auth model:
//   1. PRIMARY — emailed OTP: `request_otp` emails a 6-digit code to the
//      address in SUPERADMIN_EMAIL; `verify_otp` exchanges it for an 8h
//      session token that authenticates every subsequent call.
//   2. BACKUP — the static SUPERADMIN_CODE still works (recovery path when
//      email is down). Fail-closed: neither configured → nobody gets in.
// Actions:
//   request_otp {}                           -> OTP emailed to SUPERADMIN_EMAIL
//   verify_otp { otp }                       -> { token, ...overview }
//   auth       { code|token }                -> overview payload
//   import     { code|token, rows }          -> upsert validated templates
//   toggle / deleteSet / requests / decide / extras* ...

const SUPERADMIN_CODE = process.env.SUPERADMIN_CODE ?? "";
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_HOURS = 8;

function unauthorized(msg = "Invalid superadmin code") {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

async function sessionIsValid(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token.startsWith("sas_")) return false;
  const session = await db.superAdminSession.findUnique({ where: { token } });
  return !!session && session.expiresAt > new Date();
}

async function codeMatches(body: Record<string, unknown>): Promise<boolean> {
  if (await sessionIsValid(body.token)) return true;
  const supplied = typeof body.code === "string" ? body.code.trim() : "";
  return !!SUPERADMIN_CODE && supplied === SUPERADMIN_CODE.trim();
}

function yearsFrom(manual: number, start: Date | null): number {
  if (start) {
    const months = (Date.now() - new Date(start).getTime()) / (30.44 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(months / 12));
  }
  return manual;
}

async function overview() {
  const [agencies, candidates, requests, responses, templates, flags, notifications, accounts, invites, refRequests, extras, flagRows] = await Promise.all([
    db.agency.findMany({ include: { _count: { select: { candidates: true } } }, orderBy: { createdAt: "asc" } }),
    db.candidate.count(),
    db.referenceRequest.count(),
    db.referenceResponse.count(),
    db.skillTemplate.count(),
    db.fraudFlag.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
    db.notificationLog.count(),
    db.checklistAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { completions: true, requests: true, invites: true } } },
    }),
    db.checklistInvite.count(),
    db.referenceRequest.count(),
    db.checklistExtraQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.fraudFlag.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { request: { include: { candidate: true } } },
    }),
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
    onboardingComplete: a.onboardingComplete, status: a.status,
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
  // Authoritative metering: balance comes from the immutable CreditLedger
  // (opening grant + spends + superadmin adjustments), not row counts.
  const companies = await Promise.all(agencies.map(async (a) => {
    const balance = await creditBalance(a.id);
    const spentAgg = await db.creditLedger.aggregate({ where: { agencyId: a.id, delta: { lt: 0 } }, _sum: { delta: true } });
    const used = Math.abs(spentAgg._sum.delta ?? 0);
    return {
      id: a.id, name: a.name, slug: a.slug, logoText: a.logoText,
      candidates: a._count.candidates, primaryColor: a.primaryColor, accentColor: a.accentColor,
      status: a.status, allowOverage: a.allowOverage,
      creditsGranted: a.creditsGranted, creditsUsed: used, creditsRemaining: balance,
    };
  }));

  const threatFlags = flagRows.map((f) => ({
    id: f.id, type: f.type, detail: f.detail, severity: f.severity,
    status: f.status, resolution: f.resolution, createdAt: f.createdAt,
    requestId: f.requestId,
    candidate: f.request.candidate.fullName, candidateEmail: f.request.candidate.email,
    referee: f.request.refName, refEmail: f.request.refEmail,
  }));

  return {
    stats: { agencies: agencies.length, candidates, requests, completed, responses, templates, openFlags: flags, notifications, pendingChecklistRequests: checklistRequests },
    agencies: agencies.map((a) => ({ id: a.id, name: a.name, slug: a.slug, logoText: a.logoText, candidates: a._count.candidates, primaryColor: a.primaryColor, accentColor: a.accentColor })),
    sets: [...sets.values()].map((s) => ({ ...s, sources: [...s.sources], rows: s.rows.map((r) => ({ id: r.id, category: r.category, skillName: r.skillName, questionType: r.questionType, hasNA: r.hasNA, highRisk: r.highRisk, active: r.active, source: r.source })) })),
    users,
    candidateProfiles,
    companies,
    threatFlags,
    platform: { maintenance: (await getPlatformFlag(MAINTENANCE_KEY)) === "1" },
    extras: extras.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, placeholder: q.placeholder, specialty: q.specialty, active: q.active, sortOrder: q.sortOrder })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── OTP flow — no prior auth required, heavily rate-limited ──
    if (body.action === "request_otp") {
      if (!SUPERADMIN_EMAIL) {
        return NextResponse.json({ ok: false, error: "No admin email configured. Set SUPERADMIN_EMAIL in the environment." }, { status: 503 });
      }
      // Rate limit: at most 3 codes per 10 minutes — counts EVERY request,
      // consumed or not, so resends can't bypass it.
      const recent = await db.superAdminOtp.count({
        where: { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
      });
      if (recent >= 3) {
        return NextResponse.json({ ok: false, error: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
      }
      // Void every earlier code BEFORE issuing the new one: exactly ONE live
      // code exists at any moment, so the code in the most recent email is
      // always the valid one — older emails can never mislead again.
      await db.superAdminOtp.updateMany({ where: { consumedAt: null }, data: { consumedAt: new Date() } });
      const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db.superAdminOtp.create({
        data: { codeHash: sha256(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      const result = await sendNotification({
        channel: "EMAIL",
        kind: "OTP",
        to: SUPERADMIN_EMAIL,
        subject: "VaultVerify admin login code",
        body: `Your VaultVerify admin login code is:\n\n${otp}\n\nIt expires in 5 minutes. Never share this code.`,
      });
      await logAudit({ actorType: "SYSTEM", action: "ADMIN_OTP_REQUESTED", entity: "superAdminOtp", entityId: result.id, detail: { status: result.status } });
      const masked = SUPERADMIN_EMAIL.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
      if (result.status === "FAILED") {
        return NextResponse.json({ ok: false, error: "Email delivery failed — use the backup access code." });
      }
      return NextResponse.json({ ok: true, sentTo: masked, simulated: result.status === "SIMULATED" });
    }

    if (body.action === "verify_otp") {
      const otp = typeof body.otp === "string" ? body.otp.trim() : "";
      if (!/^\d{6}$/.test(otp)) return NextResponse.json({ ok: false, error: "Enter the 6-digit code from your email." });
      const row = await db.superAdminOtp.findFirst({
        where: { consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!row) return NextResponse.json({ ok: false, error: "No active code — request a new one." });
      if (row.attempts >= OTP_MAX_ATTEMPTS) {
        await db.superAdminOtp.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
        return NextResponse.json({ ok: false, error: "Too many wrong attempts — request a new code." });
      }
      if (row.codeHash !== sha256(otp)) {
        await db.superAdminOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        const left = Math.max(0, OTP_MAX_ATTEMPTS - row.attempts - 1);
        return NextResponse.json({ ok: false, error: `That code is not right. Use the code from the most recent email — ${left} attempt${left === 1 ? "" : "s"} left.` });
      }
      await db.superAdminOtp.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      // consume any older live codes too
      await db.superAdminOtp.updateMany({ where: { consumedAt: null, id: { not: row.id } }, data: { consumedAt: new Date() } });
      const token = `sas_${randomBytes(24).toString("hex")}`;
      await db.superAdminSession.create({
        data: { token, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000) },
      });
      await logAudit({ actorType: "SYSTEM", action: "ADMIN_OTP_LOGIN", entity: "superAdminSession" });
      return NextResponse.json({ ok: true, token, ...(await overview()) });
    }

    // Every other action requires a live session token or the backup code.
    if (!(await codeMatches(body))) return unauthorized();

    switch (body.action) {
      case "auth": {
        return NextResponse.json({ ok: true, ...(await overview()) });
      }

      case "system_config": {
        // CONFIGURED FLAGS ONLY — values never leave the server.
        return NextResponse.json({ ok: true, ...buildSystemStatus() });
      }

      // ── Phase 1 command layer ─────────────────────────────────
      case "set_company_status": {
        const status = String(body.status ?? "");
        if (!["ACTIVE", "SUSPENDED", "READ_ONLY"].includes(status)) return NextResponse.json({ ok: false, error: "Unknown status" }, { status: 400 });
        const agency = await db.agency.update({ where: { id: String(body.id) }, data: { status } });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "COMPANY_STATUS_SET", entity: "agency", entityId: agency.id, detail: { status } });
        return NextResponse.json({ ok: true, company: agency });
      }

      case "set_company_overage": {
        const agency = await db.agency.update({ where: { id: String(body.id) }, data: { allowOverage: !!body.allow } });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "COMPANY_OVERAGE_SET", entity: "agency", entityId: agency.id, detail: { allowOverage: !!body.allow } });
        return NextResponse.json({ ok: true, company: agency });
      }

      case "credit_adjust": {
        const delta = Number(body.delta);
        const result = await creditAdjust(String(body.id), delta, String(body.reason ?? ""), "superadmin");
        if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "CREDIT_ADJUSTED", entity: "agency", entityId: String(body.id), detail: { delta, reason: body.reason ?? "", balanceAfter: result.balance } });
        return NextResponse.json({ ok: true, balance: result.balance });
      }

      case "set_user_status": {
        const status = body.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
        const kind = body.kind === "RECRUITER" ? "RECRUITER" : "CANDIDATE";
        const id = String(body.id);
        let killed = 0;
        if (kind === "RECRUITER") {
          await db.recruiterAccount.update({ where: { id }, data: { status } });
          if (status === "SUSPENDED") killed = await killRecruiterSessions(id);
        } else {
          await db.checklistAccount.update({ where: { id }, data: { status } });
          if (status === "SUSPENDED") killed = await killCandidateSessions(id);
        }
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: id, detail: { status, sessionsKilled: killed } });
        return NextResponse.json({ ok: true, status, sessionsKilled: killed });
      }

      case "revoke_request": {
        const id = String(body.id);
        const reason = String(body.reason ?? "").slice(0, 300) || "Revoked by platform admin";
        const request = await db.checklistRequest.update({
          where: { id },
          data: { status: "REVOKED", decidedAt: new Date(), note: reason },
        });
        // A completed report loses its validity immediately (expiry machinery reused).
        await db.checklistCompletion.updateMany({ where: { requestId: id }, data: { expiresAt: new Date() } });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "CHECKLIST_REQUEST_REVOKED", entity: "checklistRequest", entityId: id, detail: { reason } });
        return NextResponse.json({ ok: true, request });
      }

      case "flag_decide": {
        const decision = String(body.decision ?? "");
        if (!["RESOLVED", "ESCALATED", "DISMISSED"].includes(decision)) return NextResponse.json({ ok: false, error: "Unknown decision" }, { status: 400 });
        const flag = await db.fraudFlag.update({
          where: { id: String(body.id) },
          data: {
            status: decision,
            resolved: decision === "RESOLVED" || decision === "DISMISSED",
            resolution: String(body.note ?? "").slice(0, 300),
            resolvedAt: new Date(),
          },
        });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "FRAUD_FLAG_DECIDED", entity: "fraudFlag", entityId: flag.id, detail: { decision, note: body.note ?? "" } });
        return NextResponse.json({ ok: true, flag });
      }

      case "ledger_query": {
        const agencyId = typeof body.agencyId === "string" && body.agencyId ? body.agencyId : null;
        const rows = await db.creditLedger.findMany({
          where: agencyId ? { agencyId } : {},
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { agency: { select: { name: true } } },
        });
        return NextResponse.json({
          ok: true,
          ledger: rows.map((l) => ({ id: l.id, at: l.createdAt, agency: l.agency.name, delta: l.delta, reason: l.reason, actorType: l.actorType, actorId: l.actorId, balanceAfter: l.balanceAfter })),
        });
      }

      case "audit_query": {
        const days = Math.max(1, Math.min(365, Number(body.days) || 30));
        const actorType = typeof body.actorType === "string" && body.actorType ? body.actorType : null;
        const q = typeof body.q === "string" ? body.q.trim() : "";
        const rows = await db.auditEvent.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
            ...(actorType ? { actorType: actorType as "CANDIDATE" | "REFERENCE" | "RECRUITER" | "SYSTEM" } : {}),
            ...(q ? { OR: [{ action: { contains: q } }, { actorId: { contains: q } }, { entityId: { contains: q } }, { entity: { contains: q } }] } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        });
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "AUDIT_VIEWED", detail: { q, actorType, days } });
        return NextResponse.json({
          ok: true,
          events: rows.map((r) => ({ id: r.id, at: r.createdAt, actorType: r.actorType, actorId: r.actorId, action: r.action, entity: r.entity, entityId: r.entityId, detail: r.detail, ip: r.ip })),
        });
      }

      case "set_platform": {
        const key = String(body.key ?? "");
        if (key !== MAINTENANCE_KEY) return NextResponse.json({ ok: false, error: "Unknown platform flag" }, { status: 400 });
        const on = !!body.value;
        if (on) await setPlatformFlag(key, "1");
        else await deletePlatformFlag(key);
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "PLATFORM_FLAG_SET", entity: "platformConfig", entityId: key, detail: { on } });
        return NextResponse.json({ ok: true, maintenance: on });
      }

      case "ping": {
        const result: Record<string, { ok: boolean; detail: string }> = {};
        try {
          await db.$queryRaw`SELECT 1`;
          result.db = { ok: true, detail: "Postgres reachable" };
        } catch (e) {
          result.db = { ok: false, detail: e instanceof Error ? e.message.slice(0, 140) : "unreachable" };
        }
        const key = process.env.BREVO_API_KEY;
        if (!key) {
          result.brevo = { ok: false, detail: "BREVO_API_KEY not configured" };
        } else {
          try {
            const res = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key } });
            result.brevo = { ok: res.ok, detail: res.ok ? "Brevo API live" : `HTTP ${res.status}` };
          } catch (e) {
            result.brevo = { ok: false, detail: e instanceof Error ? e.message.slice(0, 140) : "unreachable" };
          }
        }
        await logAudit({ actorType: "SYSTEM", actorId: "superadmin", action: "CONNECTIVITY_PING", detail: result as unknown as Record<string, unknown> });
        return NextResponse.json({ ok: true, ...result });
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
