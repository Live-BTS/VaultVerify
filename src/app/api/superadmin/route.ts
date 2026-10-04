import { NextRequest, NextResponse } from "next/server";
import { randomInt, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/bts/audit";
import { validateRows, upsertTemplates, type ImportRow } from "@/lib/bts/skillTemplates";
import { buildSystemStatus } from "@/lib/bts/systemConfig";
import { sha256, hashPassword, createPasswordReset, maskEmail, RESET_TTL_MINUTES } from "@/lib/bts/auth";
import { sendTemplatedEmail, listTemplates, renderEmail, TEMPLATE_INDEX } from "@/lib/bts/emailTemplates";
import { creditAdjust, creditBalance } from "@/lib/bts/credits";
import { killCandidateSessions, killRecruiterSessions } from "@/lib/bts/guard";
import { getPlatformFlag, setPlatformFlag, deletePlatformFlag, MAINTENANCE_KEY } from "@/lib/bts/platform";
import { getFraudConfig, setFraudConfig, normalizeFraudConfig } from "@/lib/bts/fraudConfig";

// ── POST /api/superadmin — platform administration (OTP + backup code) ──
// Auth model:
//   1. PRIMARY — emailed OTP: `request_otp` emails a 6-digit code to the
//      OWNER address (SUPERADMIN_EMAIL) or to an ACTIVE team member's
//      address (Phase 3 RBAC); `verify_otp` exchanges it for an 8h session
//      token that authenticates every subsequent call.
//   2. BACKUP — the static SUPERADMIN_CODE still works (the owner's recovery
//      path when email is down; always OWNER privileges). Fail-closed:
//      neither configured → nobody gets in.
// Roles (Phase 3):
//   OWNER   — everything, incl. team management, maintenance, breach nuke.
//   ADMIN   — everything except those owner-only commands.
//   SUPPORT — read-only by construction (queries, dossiers, lists, pings).
// Actions:
//   request_otp { email? }                   -> OTP emailed to the address
//   verify_otp { otp }                       -> { token, identity, ...overview }
//   auth       { code|token }                -> { identity, ...overview }
//   import     { code|token, rows }          -> upsert validated templates
//   toggle / deleteSet / clone_set / requests / decide / extras* ...
//   team_list / team_invite / team_set_role / team_set_status / team_remove
//   fraud_config_get / fraud_config_set

const SUPERADMIN_CODE = process.env.SUPERADMIN_CODE ?? "";
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_HOURS = 8;

type AdminRole = "OWNER" | "ADMIN" | "SUPPORT";

interface AdminIdentity {
  role: AdminRole;
  email: string;
  accountId: string | null; // null = backup-code/legacy access → OWNER
  token: string | null;
}

function unauthorized(msg = "Invalid superadmin code") {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

function forbidden(msg = "Your console role does not allow this action") {
  return NextResponse.json({ ok: false, error: msg }, { status: 403 });
}

// ── Phase 3 RBAC: resolve WHO is calling ──
// The authoritative role lives on the SuperadminAccount row and is re-read on
// every call, so role changes and suspensions apply to live sessions
// instantly. Backup-code access is the owner's recovery path → OWNER.
async function resolveIdentity(body: Record<string, unknown>): Promise<AdminIdentity | null> {
  const token = typeof body.token === "string" ? body.token : "";
  if (token.startsWith("sas_")) {
    const session = await db.superAdminSession.findUnique({ where: { token } });
    if (session && session.expiresAt > new Date()) {
      if (session.accountId) {
        const account = await db.superadminAccount.findUnique({ where: { id: session.accountId } });
        if (!account || account.status === "SUSPENDED") return null;
        const role: AdminRole = ["OWNER", "ADMIN", "SUPPORT"].includes(account.role)
          ? (account.role as AdminRole)
          : "SUPPORT";
        return { role, email: account.email, accountId: account.id, token };
      }
      return { role: "OWNER", email: session.email || SUPERADMIN_EMAIL, accountId: null, token };
    }
  }
  const supplied = typeof body.code === "string" ? body.code.trim() : "";
  if (SUPERADMIN_CODE && supplied === SUPERADMIN_CODE.trim()) {
    return { role: "OWNER", email: SUPERADMIN_EMAIL || "owner", accountId: null, token: null };
  }
  return null;
}

// Permission model (documented for the audit):
//   OWNER   — everything.
//   ADMIN   — everything except the owner-only platform commands.
//   SUPPORT — read-only set only.
const OWNER_ONLY = new Set([
  "team_list", "team_invite", "team_set_role", "team_set_status", "team_remove",
  "set_platform", "revoke_all_sessions",
]);
const READ_ONLY = new Set([
  "auth", "system_config", "requests", "impersonate_view", "audit_query",
  "ledger_query", "shares_list", "notifications_list", "ping", "fraud_config_get",
  "templates_list", "template_get",
]);

function roleAllowed(role: AdminRole, action: string): boolean {
  if (role === "OWNER") return true;
  if (role === "ADMIN") return !OWNER_ONLY.has(action);
  return READ_ONLY.has(action); // SUPPORT
}

// Realistic sample values for template previews and test sends.
function sampleVarsFor(key: string): Record<string, string> {
  const base: Record<string, string> = {
    code: "481902",
    expiryMinutes: "5",
    portal: "recruiter",
    expiryHours: "24",
    link: "https://vaultverify.vercel.app/?verify=sample-token-abc123",
    setupLink: "https://vaultverify.vercel.app/?view=checklist&invite=sample-token-abc123",
    role: "ADMIN",
    email: "teammember@example.com",
    accessDescription: "Your access covers all console commands except owner-only platform controls.",
    consoleHint: "Open the console, enter your team email, and request a login code.",
    agencyName: "Meridian Health Staffing",
    candidateName: "Jordan Blake, RN",
    refName: "Alex Rivera, MSN",
    expiryDays: "14",
    daysOpen: "6",
    recruiterName: "Sam Chen",
    organization: "St. Camillus Medical Center",
    finalStatus: "completed",
    rating: "4.6 / 5",
    tempPassword: "Vv-92841xk",
  };
  return base;
}

function yearsFrom(manual: number, start: Date | null): number {
  if (start) {
    const months = (Date.now() - new Date(start).getTime()) / (30.44 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(months / 12));
  }
  return manual;
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

const tempPassword = () => randomBytes(9).toString("base64url"); // ~12 URL-safe chars

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

async function overview() {
  const [agencies, candidates, requests, responses, templates, flags, notifications, accounts, invites, refRequests, extras, flagRows, recruiters] = await Promise.all([
    db.agency.findMany({ include: { _count: { select: { candidates: true } } }, orderBy: { createdAt: "asc" } }),
    db.candidate.count(),
    db.referenceRequest.count(),
    db.referenceResponse.count(),
    db.skillTemplate.count(),
    db.fraudFlag.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
    db.notificationLog.count(),
    db.checklistAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { completions: true, requests: true, invites: true, sessions: true } } },
    }),
    db.checklistInvite.count(),
    db.referenceRequest.count(),
    db.checklistExtraQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.fraudFlag.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { request: { include: { candidate: true } } },
    }),
    db.recruiterAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { sessions: true } } },
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
    failedLogins: a.failedLogins, lastFailedLogin: a.lastFailedLogin, liveSessions: a._count.sessions,
    completions: a._count.completions, requests: a._count.requests, invites: a._count.invites,
    joinedAt: a.createdAt,
  }));
  const recruiterRows = recruiters.map((r) => ({
    id: r.id, name: r.name, email: r.email, company: r.company, jobTitle: r.jobTitle,
    emailVerified: r.emailVerified, onboardingComplete: r.onboardingComplete, status: r.status,
    failedLogins: r.failedLogins, lastFailedLogin: r.lastFailedLogin, liveSessions: r._count.sessions,
    joinedAt: r.createdAt,
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
    recruiters: recruiterRows,
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
      // Who gets the code: the OWNER address by default, or an ACTIVE team
      // member invited via the console (Phase 3 RBAC).
      const requested = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      let target = SUPERADMIN_EMAIL;
      if (requested && requested !== SUPERADMIN_EMAIL) {
        const member = await db.superadminAccount.findUnique({ where: { email: requested } });
        if (!member || member.status !== "ACTIVE") {
          return NextResponse.json({ ok: false, error: "No active admin account for that address." }, { status: 403 });
        }
        target = member.email;
      }
      if (!target) {
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
        data: { email: target, codeHash: sha256(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      const result = await sendTemplatedEmail("admin_otp", target, {
        code: otp,
        expiryMinutes: Math.round(OTP_TTL_MS / 60000),
      });
      await logAudit({ actorType: "SYSTEM", action: "ADMIN_OTP_REQUESTED", entity: "superAdminOtp", entityId: result.id, detail: { status: result.status } });
      const masked = target.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
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
      // Resolve WHO logged in from the code's target address. The owner row
      // is auto-seeded on first login; team members were validated as ACTIVE
      // at request time and are re-checked here.
      const otpEmail = (row.email || SUPERADMIN_EMAIL).trim().toLowerCase();
      let account = await db.superadminAccount.findUnique({ where: { email: otpEmail } });
      if (!account && otpEmail && otpEmail === SUPERADMIN_EMAIL) {
        account = await db.superadminAccount.create({ data: { email: otpEmail, name: "Owner", role: "OWNER" } });
      }
      if (!account || account.status !== "ACTIVE") {
        return NextResponse.json({ ok: false, error: "This admin account is no longer active." }, { status: 403 });
      }
      const role: AdminRole = ["OWNER", "ADMIN", "SUPPORT"].includes(account.role)
        ? (account.role as AdminRole)
        : "SUPPORT";
      const token = `sas_${randomBytes(24).toString("hex")}`;
      await db.superAdminSession.create({
        data: { token, accountId: account.id, email: account.email, role, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000) },
      });
      await logAudit({ actorType: "SYSTEM", actorId: account.email, action: "ADMIN_OTP_LOGIN", entity: "superAdminSession", detail: { role } });
      return NextResponse.json({ ok: true, token, identity: { email: account.email, role }, ...(await overview()) });
    }

    // Every other action requires a live session token or the backup code.
    const identity = await resolveIdentity(body);
    if (!identity) return unauthorized();
    if (!roleAllowed(identity.role, String(body.action ?? ""))) {
      return forbidden(
        identity.role === "SUPPORT"
          ? "Support access is read-only — this action is not permitted."
          : "Only the owner can perform this action.",
      );
    }
    const auditActor = identity.email || "superadmin";

    switch (body.action) {
      case "auth": {
        return NextResponse.json({ ok: true, identity: { email: identity.email, role: identity.role }, ...(await overview()) });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "COMPANY_STATUS_SET", entity: "agency", entityId: agency.id, detail: { status } });
        return NextResponse.json({ ok: true, company: agency });
      }

      case "set_company_overage": {
        const agency = await db.agency.update({ where: { id: String(body.id) }, data: { allowOverage: !!body.allow } });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "COMPANY_OVERAGE_SET", entity: "agency", entityId: agency.id, detail: { allowOverage: !!body.allow } });
        return NextResponse.json({ ok: true, company: agency });
      }

      case "credit_adjust": {
        const delta = Number(body.delta);
        const result = await creditAdjust(String(body.id), delta, String(body.reason ?? ""), auditActor);
        if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "CREDIT_ADJUSTED", entity: "agency", entityId: String(body.id), detail: { delta, reason: body.reason ?? "", balanceAfter: result.balance } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: id, detail: { status, sessionsKilled: killed } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "CHECKLIST_REQUEST_REVOKED", entity: "checklistRequest", entityId: id, detail: { reason } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "FRAUD_FLAG_DECIDED", entity: "fraudFlag", entityId: flag.id, detail: { decision, note: body.note ?? "" } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "AUDIT_VIEWED", detail: { q, actorType, days } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "PLATFORM_FLAG_SET", entity: "platformConfig", entityId: key, detail: { on } });
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
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "CONNECTIVITY_PING", detail: result as unknown as Record<string, unknown> });
        return NextResponse.json({ ok: true, ...result });
      }

      // ── Phase 2: security center, view-as, share oversight, exports ──
      case "impersonate_view": {
        // Read-only proxy dossier — the compliant way to "see what they see":
        // no session is created, nothing can be written, and the access is
        // audit-stamped as impersonation every single time.
        const kind = body.kind === "RECRUITER" ? "RECRUITER" : "CANDIDATE";
        const id = String(body.id);
        if (kind === "RECRUITER") {
          const r = await db.recruiterAccount.findUnique({
            where: { id },
            include: { _count: { select: { sessions: true } } },
          });
          if (!r) return NextResponse.json({ ok: false, error: "Recruiter not found" }, { status: 404 });
          await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "IMPERSONATION_VIEWED", entity: "recruiterAccount", entityId: r.id, detail: { email: r.email } });
          const invites = await db.checklistInvite.findMany({ where: { recruiterName: r.name }, orderBy: { createdAt: "desc" }, take: 25 });
          return NextResponse.json({
            ok: true,
            view: {
              kind, id: r.id, name: r.name, email: r.email, status: r.status, emailVerified: r.emailVerified,
              onboardingComplete: r.onboardingComplete, liveSessions: r._count.sessions, createdAt: r.createdAt,
              profile: { phone: r.phone, company: r.company, jobTitle: r.jobTitle, city: r.city, state: r.state, zip: r.zip },
              invites: invites.map((i) => ({ id: i.id, candidate: i.candidateName, specialty: i.specialty, status: i.status, createdAt: i.createdAt })),
              requests: [], completions: [], shareLinks: [],
            },
          });
        }
        const a = await db.checklistAccount.findUnique({
          where: { id },
          include: {
            _count: { select: { sessions: true } },
            invites: { orderBy: { createdAt: "desc" }, take: 25 },
            requests: { orderBy: { requestedAt: "desc" }, take: 25 },
            completions: { orderBy: { completedAt: "desc" }, take: 25, include: { shareLinks: { orderBy: { createdAt: "desc" } } } },
          },
        });
        if (!a) return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "IMPERSONATION_VIEWED", entity: "checklistAccount", entityId: a.id, detail: { email: a.email } });
        return NextResponse.json({
          ok: true,
          view: {
            kind, id: a.id, name: a.name, email: a.email, status: a.status, emailVerified: a.emailVerified,
            onboardingComplete: a.onboardingComplete, liveSessions: a._count.sessions, createdAt: a.createdAt,
            profile: { phone: a.phone, city: a.city, state: a.state, zip: a.zip, profession: a.profession, discipline: a.discipline, specialty: a.specialty, yrsOverall: a.yrsOverall, yrsSpecialty: a.yrsSpecialty },
            invites: a.invites.map((i) => ({ id: i.id, candidate: i.candidateName, specialty: i.specialty, status: i.status, createdAt: i.createdAt })),
            requests: a.requests.map((r) => ({ id: r.id, jobTitle: r.jobTitle, specialty: r.specialty, status: r.status, requestedAt: r.requestedAt })),
            completions: a.completions.map((c) => ({ id: c.id, specialtyLabel: c.specialtyLabel, source: c.source, completedAt: c.completedAt, expiresAt: c.expiresAt, shareLinks: c.shareLinks.length })),
            shareLinks: a.completions.flatMap((c) => c.shareLinks.map((s) => ({ id: s.id, accessType: s.accessType, revoked: s.revoked, expiresAt: s.expiresAt, viewCount: s.viewCount }))),
          },
        });
      }

      case "security_reset": {
        // Email a /?reset=<token> link and kill every live session.
        const kind = body.kind === "RECRUITER" ? "RECRUITER" : "CANDIDATE";
        const id = String(body.id);
        const account = kind === "RECRUITER"
          ? await db.recruiterAccount.findUnique({ where: { id } })
          : await db.checklistAccount.findUnique({ where: { id } });
        if (!account) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
        const token = await createPasswordReset(kind, account.id);
        if (kind === "RECRUITER") await killRecruiterSessions(account.id);
        else await killCandidateSessions(account.id);
        const result = await sendTemplatedEmail("password_reset", account.email, {
          link: `${originOf(req)}/?reset=${token}`,
          expiryMinutes: RESET_TTL_MINUTES,
        });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "PASSWORD_RESET_SENT", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: account.id, detail: { status: result.status, sessionsKilled: true } });
        return NextResponse.json({ ok: true, sentTo: maskEmail(account.email), simulated: result.status === "SIMULATED" });
      }

      case "security_temp_password": {
        // Issue a one-time temp password (shown once in the console) and email
        // it together with the set-your-own-password link.
        const kind = body.kind === "RECRUITER" ? "RECRUITER" : "CANDIDATE";
        const id = String(body.id);
        const account = kind === "RECRUITER"
          ? await db.recruiterAccount.findUnique({ where: { id } })
          : await db.checklistAccount.findUnique({ where: { id } });
        if (!account) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
        const temp = tempPassword();
        await (kind === "RECRUITER" ? db.recruiterAccount : db.checklistAccount).update({
          where: { id: account.id },
          data: { passwordHash: hashPassword(temp), failedLogins: 0 },
        });
        const token = await createPasswordReset(kind, account.id);
        if (kind === "RECRUITER") await killRecruiterSessions(account.id);
        else await killCandidateSessions(account.id);
        const result = await sendTemplatedEmail("temp_password", account.email, {
          tempPassword: temp,
          link: `${originOf(req)}/?reset=${token}`,
          expiryMinutes: RESET_TTL_MINUTES,
        });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "TEMP_PASSWORD_ISSUED", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: account.id, detail: { status: result.status, sessionsKilled: true } });
        return NextResponse.json({ ok: true, tempPassword: temp, sentTo: maskEmail(account.email), simulated: result.status === "SIMULATED" });
      }

      case "revoke_user_sessions": {
        const kind = body.kind === "RECRUITER" ? "RECRUITER" : "CANDIDATE";
        const id = String(body.id);
        const killed = kind === "RECRUITER" ? await killRecruiterSessions(id) : await killCandidateSessions(id);
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "USER_SESSIONS_REVOKED", entity: kind === "RECRUITER" ? "recruiterAccount" : "checklistAccount", entityId: id, detail: { killed } });
        return NextResponse.json({ ok: true, killed });
      }

      case "revoke_all_sessions": {
        // Nukes every candidate + recruiter session platform-wide. The
        // superadmin's own console session is deliberately untouched.
        const [c, r] = await Promise.all([
          db.checklistSession.deleteMany({}),
          db.recruiterSession.deleteMany({}),
        ]);
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "ALL_SESSIONS_REVOKED", detail: { candidates: c.count, recruiters: r.count } });
        return NextResponse.json({ ok: true, candidates: c.count, recruiters: r.count });
      }

      case "shares_list": {
        const [refLinks, checkLinks] = await Promise.all([
          db.referenceShareLink.findMany({
            orderBy: { createdAt: "desc" }, take: 100,
            include: { request: { include: { candidate: true } } },
          }),
          db.checklistShareLink.findMany({
            orderBy: { createdAt: "desc" }, take: 100,
            include: { completion: { include: { account: true } } },
          }),
        ]);
        const links = [
          ...refLinks.map((l) => ({
            kind: "reference" as const, id: l.id, token: l.token, accessType: l.accessType,
            label: l.label, revoked: l.revoked, viewCount: l.viewCount, expiresAt: l.expiresAt, createdAt: l.createdAt,
            owner: l.request.candidate.fullName, ownerEmail: l.request.candidate.email, what: `Reference — ${l.request.candidate.fullName}`,
          })),
          ...checkLinks.map((l) => ({
            kind: "checklist" as const, id: l.id, token: l.token, accessType: l.accessType,
            label: l.label, revoked: l.revoked, viewCount: l.viewCount, expiresAt: l.expiresAt, createdAt: l.createdAt,
            owner: l.completion.account.name, ownerEmail: l.completion.account.email, what: `Checklist — ${l.completion.specialtyLabel || l.completion.specialty}`,
          })),
        ].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
        return NextResponse.json({ ok: true, links });
      }

      case "share_revoke": {
        const kind = body.kind === "reference" ? "reference" : "checklist";
        const id = String(body.id);
        if (kind === "reference") await db.referenceShareLink.update({ where: { id }, data: { revoked: true } });
        else await db.checklistShareLink.update({ where: { id }, data: { revoked: true } });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "SHARE_REVOKED_ADMIN", entity: kind === "reference" ? "referenceShareLink" : "checklistShareLink", entityId: id });
        return NextResponse.json({ ok: true });
      }

      case "notifications_list": {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [rows, sent, simulated, failed] = await Promise.all([
          db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
          db.notificationLog.count({ where: { createdAt: { gte: since }, status: "SENT" } }),
          db.notificationLog.count({ where: { createdAt: { gte: since }, status: "SIMULATED" } }),
          db.notificationLog.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
        ]);
        return NextResponse.json({
          ok: true,
          stats: { sent, simulated, failed },
          notifications: rows.map((n) => ({ id: n.id, at: n.createdAt, channel: n.channel, kind: n.kind, to: n.to, subject: n.subject, status: n.status, provider: n.provider })),
        });
      }

      case "export_csv": {
        const what = String(body.what ?? "");
        let rows: Record<string, unknown>[] = [];
        if (what === "users") {
          rows = (await db.checklistAccount.findMany({ orderBy: { createdAt: "desc" } })).map((a) => ({
            name: a.name, email: a.email, title: a.discipline || a.title, phone: a.phone,
            city: a.city, state: a.state, zip: a.zip, profession: a.profession, specialty: a.specialty,
            status: a.status, emailVerified: a.emailVerified, onboardingComplete: a.onboardingComplete,
            failedLogins: a.failedLogins, joinedAt: a.createdAt.toISOString(),
          }));
        } else if (what === "companies") {
          for (const a of await db.agency.findMany({ orderBy: { createdAt: "asc" } })) {
            rows.push({
              name: a.name, slug: a.slug, candidates: a._count?.candidates ?? (await db.candidate.count({ where: { agencyId: a.id } })),
              status: a.status, allowOverage: a.allowOverage, creditsGranted: a.creditsGranted,
              creditsRemaining: await creditBalance(a.id), createdAt: a.createdAt.toISOString(),
            });
          }
        } else if (what === "audit") {
          rows = (await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5000 })).map((e) => ({
            at: e.createdAt.toISOString(), actorType: e.actorType, actorId: e.actorId,
            action: e.action, entity: e.entity, entityId: e.entityId, ip: e.ip, detail: e.detail,
          }));
        } else {
          return NextResponse.json({ ok: false, error: "Unknown export" }, { status: 400 });
        }
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "DATA_EXPORTED", detail: { what, rows: rows.length } });
        return NextResponse.json({ ok: true, csv: toCsv(rows), count: rows.length, what });
      }

      case "import": {
        const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return NextResponse.json({ ok: false, error: "No rows to import" }, { status: 400 });
        const { errors, clean } = validateRows(rows);
        let result = { created: 0, updated: 0 };
        if (clean.length) result = await upsertTemplates(clean, "IMPORT");
        await logAudit({
          actorType: "RECRUITER",
          actorId: auditActor,
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
          actorId: auditActor,
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
          actorId: auditActor,
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
        await logAudit({ actorType: "RECRUITER", actorId: auditActor, action: "EXTRA_QUESTION_CREATED", entity: "checklistExtraQuestion", entityId: q.id, detail: JSON.stringify({ kind }) });
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
        await logAudit({ actorType: "RECRUITER", actorId: auditActor, action: "EXTRA_QUESTION_UPDATED", entity: "checklistExtraQuestion", entityId: q.id });
        return NextResponse.json({ ok: true, question: q });
      }

      case "extra.toggle": {
        const q = await db.checklistExtraQuestion.update({ where: { id: String(body.id ?? "") }, data: { active: !!body.active } });
        await logAudit({ actorType: "RECRUITER", actorId: auditActor, action: "EXTRA_QUESTION_TOGGLED", entity: "checklistExtraQuestion", entityId: q.id, detail: JSON.stringify({ active: q.active }) });
        return NextResponse.json({ ok: true, question: q });
      }

      case "extra.delete": {
        await db.checklistExtraQuestion.delete({ where: { id: String(body.id ?? "") } });
        await logAudit({ actorType: "RECRUITER", actorId: auditActor, action: "EXTRA_QUESTION_DELETED", entity: "checklistExtraQuestion", entityId: String(body.id ?? "") });
        return NextResponse.json({ ok: true });
      }

      // ── Phase 3: RBAC — admin team management (OWNER only) ──
      case "team_list": {
        const members = await db.superadminAccount.findMany({ orderBy: { createdAt: "asc" } });
        const grouped = await db.superAdminSession.groupBy({
          by: ["accountId"],
          where: { accountId: { not: null }, expiresAt: { gt: new Date() } },
          _count: { accountId: true },
        });
        const liveByAccount = new Map(grouped.map((g) => [g.accountId, g._count.accountId]));
        return NextResponse.json({
          ok: true,
          team: members.map((m) => ({
            id: m.id, email: m.email, name: m.name, role: m.role, status: m.status,
            liveSessions: liveByAccount.get(m.id) ?? 0, createdAt: m.createdAt,
          })),
        });
      }

      case "team_invite": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const name = String(body.name ?? "").trim().slice(0, 80);
        const role = String(body.role ?? "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
        if (!["ADMIN", "SUPPORT"].includes(role)) return NextResponse.json({ ok: false, error: "Role must be ADMIN or SUPPORT." }, { status: 400 });
        if (email === SUPERADMIN_EMAIL) return NextResponse.json({ ok: false, error: "That address is the platform owner." }, { status: 400 });
        const existing = await db.superadminAccount.findUnique({ where: { email } });
        if (existing) return NextResponse.json({ ok: false, error: "A team account with this email already exists." }, { status: 409 });
        const member = await db.superadminAccount.create({ data: { email, name, role } });
        const result = await sendTemplatedEmail("team_invite", email, {
          role,
          email,
          accessDescription:
            role === "SUPPORT"
              ? "Your access is read-only: you can review users, companies, dossiers, the audit log and platform health, but cannot change anything."
              : "Your access covers all console commands except owner-only platform controls (team management, maintenance mode, platform-wide session revocation).",
          consoleHint: `To sign in: open the console, enter ${email} as the team member email, and request a login code — a 6-digit code will be emailed to you.`,
        });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "SUBADMIN_INVITED", entity: "superadminAccount", entityId: member.id, detail: { email, role, notified: result.status } });
        return NextResponse.json({ ok: true, member: { id: member.id, email: member.email, role: member.role }, notified: result.status !== "FAILED" });
      }

      case "team_set_role": {
        const role = String(body.role ?? "");
        if (!["ADMIN", "SUPPORT"].includes(role)) return NextResponse.json({ ok: false, error: "Role must be ADMIN or SUPPORT." }, { status: 400 });
        const member = await db.superadminAccount.findUnique({ where: { id: String(body.id) } });
        if (!member) return NextResponse.json({ ok: false, error: "Team member not found" }, { status: 404 });
        if (member.role === "OWNER") return NextResponse.json({ ok: false, error: "The owner role cannot be changed." }, { status: 400 });
        const updated = await db.superadminAccount.update({ where: { id: member.id }, data: { role } });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "SUBADMIN_ROLE_CHANGED", entity: "superadminAccount", entityId: member.id, detail: { email: member.email, from: member.role, to: role } });
        return NextResponse.json({ ok: true, member: { id: updated.id, role: updated.role } });
      }

      case "team_set_status": {
        const status = body.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
        const member = await db.superadminAccount.findUnique({ where: { id: String(body.id) } });
        if (!member) return NextResponse.json({ ok: false, error: "Team member not found" }, { status: 404 });
        if (member.role === "OWNER") return NextResponse.json({ ok: false, error: "The owner account cannot be suspended." }, { status: 400 });
        const updated = await db.superadminAccount.update({ where: { id: member.id }, data: { status } });
        let killed = 0;
        if (status === "SUSPENDED") {
          const gone = await db.superAdminSession.deleteMany({ where: { accountId: member.id } });
          killed = gone.count;
        }
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: status === "SUSPENDED" ? "SUBADMIN_SUSPENDED" : "SUBADMIN_REACTIVATED", entity: "superadminAccount", entityId: member.id, detail: { email: member.email, status, sessionsKilled: killed } });
        return NextResponse.json({ ok: true, status, sessionsKilled: killed });
      }

      case "team_remove": {
        const member = await db.superadminAccount.findUnique({ where: { id: String(body.id) } });
        if (!member) return NextResponse.json({ ok: false, error: "Team member not found" }, { status: 404 });
        if (member.role === "OWNER") return NextResponse.json({ ok: false, error: "The owner account cannot be removed." }, { status: 400 });
        await db.superAdminSession.deleteMany({ where: { accountId: member.id } });
        await db.superadminAccount.delete({ where: { id: member.id } });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "SUBADMIN_REMOVED", entity: "superadminAccount", entityId: member.id, detail: { email: member.email, role: member.role } });
        return NextResponse.json({ ok: true });
      }

      // ── Phase 3: fraud tuning (read: any role; write: ADMIN and above) ──
      case "fraud_config_get": {
        return NextResponse.json({ ok: true, config: await getFraudConfig() });
      }

      case "fraud_config_set": {
        const config = normalizeFraudConfig(body.config);
        await setFraudConfig(config, identity.email || "superadmin");
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "FRAUD_CONFIG_UPDATED", entity: "platformConfig", entityId: "FRAUD_CONFIG", detail: config as unknown as Record<string, unknown> });
        return NextResponse.json({ ok: true, config });
      }

      // ── Phase 3: checklist cloning (ADMIN and above) ──
      // Copies every template row of one Profession + Job Title + Specialty
      // set to a new key — the fast path for building near-variant checklists
      // without re-importing a workbook.
      case "clone_set": {
        const from = {
          profession: String(body.profession ?? ""),
          jobTitle: String(body.jobTitle ?? ""),
          specialty: String(body.specialty ?? ""),
        };
        const to = {
          profession: String(body.toProfession ?? from.profession).trim(),
          jobTitle: String(body.toJobTitle ?? from.jobTitle).trim(),
          specialty: String(body.toSpecialty ?? "").trim(),
        };
        if (!from.profession || !from.jobTitle || !from.specialty) return NextResponse.json({ ok: false, error: "Source set not fully specified." }, { status: 400 });
        if (!to.specialty) return NextResponse.json({ ok: false, error: "Pick a specialty key for the clone." }, { status: 400 });
        if (to.profession.toLowerCase() === from.profession.toLowerCase() && to.jobTitle.toLowerCase() === from.jobTitle.toLowerCase() && to.specialty.toLowerCase() === from.specialty.toLowerCase()) {
          return NextResponse.json({ ok: false, error: "The clone must differ from the source (change the specialty, job title, or profession)." }, { status: 400 });
        }
        const source = await db.skillTemplate.findMany({ where: from, orderBy: { sortOrder: "asc" } });
        if (!source.length) return NextResponse.json({ ok: false, error: "Source set not found." }, { status: 404 });
        const clash = await db.skillTemplate.count({ where: to });
        if (clash > 0) return NextResponse.json({ ok: false, error: "A checklist set already exists for that Profession + Job Title + Specialty." }, { status: 409 });
        await db.skillTemplate.createMany({
          data: source.map((r, i) => ({
            profession: to.profession,
            jobTitle: to.jobTitle,
            specialty: to.specialty,
            category: r.category,
            skillName: r.skillName,
            questionType: r.questionType,
            hasNA: r.hasNA,
            highRisk: r.highRisk,
            active: r.active,
            source: "CLONE",
            sortOrder: i,
          })),
        });
        await logAudit({
          actorType: "RECRUITER",
          actorId: auditActor,
          action: "SKILL_TEMPLATE_SET_CLONED",
          entity: "skillTemplate",
          detail: { from: `${from.profession}/${from.jobTitle}/${from.specialty}`, to: `${to.profession}/${to.jobTitle}/${to.specialty}`, rows: source.length },
        });
        return NextResponse.json({ ok: true, cloned: source.length });
      }

      // ── Email template management (Superadmin → Templates) ─────────
      // List/get for every role; save/reset/test for ADMIN and above.
      case "templates_list": {
        return NextResponse.json({ ok: true, templates: await listTemplates() });
      }

      case "template_get": {
        const key = String(body.key ?? "");
        if (!TEMPLATE_INDEX[key]) return NextResponse.json({ ok: false, error: "Unknown template key." }, { status: 404 });
        const override = await db.emailTemplate.findUnique({ where: { key } });
        const spec = TEMPLATE_INDEX[key];
        return NextResponse.json({
          ok: true,
          key,
          name: override?.name ?? spec.name,
          kind: spec.kind,
          description: override?.description ?? spec.description,
          subject: override?.subject ?? spec.subject,
          html: override?.html ?? spec.html,
          customized: !!override,
        });
      }

      case "template_save": {
        const key = String(body.key ?? "");
        const spec = TEMPLATE_INDEX[key];
        if (!spec) return NextResponse.json({ ok: false, error: "Unknown template key." }, { status: 404 });
        const subject = String(body.subject ?? "").trim();
        const html = String(body.html ?? "");
        const name = String(body.name ?? "").trim().slice(0, 80) || spec.name;
        if (!subject) return NextResponse.json({ ok: false, error: "Subject cannot be empty." }, { status: 400 });
        if (html.length < 40 || !/<[a-z]/i.test(html)) return NextResponse.json({ ok: false, error: "The HTML body looks empty or invalid." }, { status: 400 });
        // Sanity render — a broken template must never take down sends.
        try {
          const preview = await renderEmail(key, sampleVarsFor(key));
          if (!preview.subject || !preview.html.includes("<")) throw new Error("render produced empty output");
        } catch (e) {
          return NextResponse.json({ ok: false, error: `Template failed to render: ${(e as Error).message}` }, { status: 400 });
        }
        const saved = await db.emailTemplate.upsert({
          where: { key },
          create: { key, name, subject, html, description: spec.description, updatedBy: auditActor },
          update: { name, subject, html, updatedBy: auditActor },
        });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "EMAIL_TEMPLATE_SAVED", entity: "emailTemplate", entityId: saved.id, detail: { key } });
        return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
      }

      case "template_reset": {
        const key = String(body.key ?? "");
        if (!TEMPLATE_INDEX[key]) return NextResponse.json({ ok: false, error: "Unknown template key." }, { status: 404 });
        await db.emailTemplate.deleteMany({ where: { key } });
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "EMAIL_TEMPLATE_RESET", entity: "emailTemplate", entityId: key, detail: {} });
        return NextResponse.json({ ok: true });
      }

      case "template_test": {
        const key = String(body.key ?? "");
        if (!TEMPLATE_INDEX[key]) return NextResponse.json({ ok: false, error: "Unknown template key." }, { status: 404 });
        const to = String(body.to ?? auditActor ?? SUPERADMIN_EMAIL).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return NextResponse.json({ ok: false, error: "Enter a valid test recipient email." }, { status: 400 });
        const result = await sendTemplatedEmail(key, to, sampleVarsFor(key));
        await logAudit({ actorType: "SYSTEM", actorId: auditActor, action: "EMAIL_TEMPLATE_TEST_SENT", entity: "emailTemplate", entityId: key, detail: { to, status: result.status } });
        return NextResponse.json({ ok: true, sentTo: maskEmail(to), simulated: result.status === "SIMULATED", status: result.status });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[superadmin]", e);
    const msg = e instanceof Error ? e.message : "";
    const dbHint = /P1001|P1013|P1017|Authentication|Can't reach|Timed out fetching|doesn't exist|Invalid/i.test(msg)
      ? " The deployment's database connection is failing — verify DATABASE_URL in Vercel → Settings → Environment Variables and redeploy."
      : "";
    return NextResponse.json({ ok: false, error: `Superadmin request failed.${dbHint}` }, { status: 500 });
  }
}
