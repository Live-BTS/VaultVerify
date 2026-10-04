import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, destroySession, getAccount, hashPassword, verifyPassword } from "@/lib/bts/checklistAuth";
import { createVerification, sendVerificationEmail, maskEmail, dbConfigured, emailLive } from "@/lib/bts/auth";
import { assertPlatformWritable } from "@/lib/bts/platform";
import { logAudit } from "@/lib/bts/audit";

// ── /api/checklist/account — candidate account for the skills checklist ──
// actions: signup | login | logout | me | profile | resend
// Verification gate: signup creates an UNVERIFIED account and emails a
// confirmation link (/?verify=<token>); login and profile saves stay locked
// until the address is confirmed.

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// Derived years of experience: calendar start dates win over manual entry,
// so the platform keeps computing continuously after the one-time entry.
function derivedYears(manual: number, start: Date | null): number {
  if (start) {
    const months = (Date.now() - new Date(start).getTime()) / (30.44 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(months / 12));
  }
  return manual;
}

// Auto-fetch: pre-fill empty profile fields from the most recent recruiter
// invite addressed to this email ("auto fetched if the details are mention
// in candidates account" — and vice versa: recruiter-provided basics carry
// over so the candidate only confirms/corrects them).
async function backfillFromInvites(accountId: string, email: string) {
  const account = await db.checklistAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  const invite = await db.checklistInvite.findFirst({
    where: { candidateEmail: email, accountId },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) return;
  const patch = {
    phone: account.phone || invite.candidatePhone || "",
    profession: account.profession || invite.profession || "",
    discipline: account.discipline || invite.jobTitle || "",
    specialty: account.specialty || invite.specialty || "",
  };
  if (patch.phone !== account.phone || patch.profession !== account.profession || patch.discipline !== account.discipline || patch.specialty !== account.specialty) {
    await db.checklistAccount.update({ where: { id: accountId }, data: patch });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // Missing deployment config should read as an owner action item, not a bug.
  if (!dbConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Server not configured: DATABASE_URL is missing. Add the environment variables in Vercel → Settings → Environment Variables, then redeploy." },
      { status: 503 },
    );
  }

  // Maintenance mode pauses all account writes (superadmin bypasses).
  const writable = await assertPlatformWritable();
  if (!writable.ok) {
    return NextResponse.json({ ok: false, error: writable.error ?? "Platform is in maintenance mode." }, { status: 503 });
  }

  try {
    if (action === "signup") {
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const title = String(body.title ?? "RN").trim() || "RN";
      if (name.length < 2) return NextResponse.json({ ok: false, error: "Enter your full name" }, { status: 400 });
      if (!emailOk(email)) return NextResponse.json({ ok: false, error: "Enter a valid email" }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ ok: false, error: "Password needs at least 8 characters" }, { status: 400 });
      const exists = await db.checklistAccount.findUnique({ where: { email } });
      if (exists?.emailVerified) {
        return NextResponse.json({ ok: false, error: "An account with this email already exists — sign in instead" }, { status: 400 });
      }
      if (exists) {
        // Unverified duplicate — refresh credentials and resend the link.
        await db.checklistAccount.update({ where: { id: exists.id }, data: { name, title, passwordHash: hashPassword(password) } });
      } else {
        await db.checklistAccount.create({ data: { name, email, title, passwordHash: hashPassword(password) } });
      }
      // claim recruiter invites addressed to this email right away
      const claimed = await db.checklistAccount.findUnique({ where: { email } });
      if (claimed) {
        await db.checklistInvite.updateMany({ where: { candidateEmail: email, accountId: null }, data: { accountId: claimed.id } });
        await backfillFromInvites(claimed.id, email);
        await logAudit({ actorType: "CANDIDATE", actorId: claimed.id, action: "CHECKLIST_ACCOUNT_CREATED", entity: "checklistAccount", entityId: claimed.id });
      }
      const token = await createVerification("CANDIDATE", email);
      await sendVerificationEmail("CANDIDATE", email, token, originOf(req));
      return NextResponse.json({ ok: true, checkEmail: true, sentTo: maskEmail(email), emailLive: emailLive() });
    }

    if (action === "login") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const account = await db.checklistAccount.findUnique({ where: { email } });
      if (!account || !verifyPassword(password, account.passwordHash)) {
        return NextResponse.json({ ok: false, error: "Wrong email or password" }, { status: 401 });
      }
      if (account.status === "SUSPENDED") {
        await logAudit({ actorType: "SYSTEM", actorId: email, action: "SIGNIN_BLOCKED_SUSPENDED", entity: "checklistAccount", entityId: account.id, ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? "" });
        return NextResponse.json({ ok: false, error: "This account is suspended. Contact VaultVerify support." }, { status: 403 });
      }
      if (!account.emailVerified) {
        const token = await createVerification("CANDIDATE", email);
        await sendVerificationEmail("CANDIDATE", email, token, originOf(req));
        return NextResponse.json({ ok: false, needsVerification: true, sentTo: maskEmail(email) });
      }
      await createSession(account.id);
      // claim any recruiter invites addressed to this email
      await db.checklistInvite.updateMany({ where: { candidateEmail: email, accountId: null }, data: { accountId: account.id } });
      await backfillFromInvites(account.id, email);
      return NextResponse.json({ ok: true, account: { name: account.name, email: account.email, title: account.title } });
    }

    if (action === "resend") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const account = await db.checklistAccount.findUnique({ where: { email } });
      if (account && !account.emailVerified) {
        const token = await createVerification("CANDIDATE", email);
        await sendVerificationEmail("CANDIDATE", email, token, originOf(req));
      }
      return NextResponse.json({ ok: true, sentTo: maskEmail(email) });
    }

    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }

    if (action === "profile") {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
      if (!account.emailVerified) return NextResponse.json({ ok: false, error: "Verify your email before saving your profile" }, { status: 403 });
      const str = (v: unknown, max = 80) => String(v ?? "").trim().slice(0, max);
      const int = (v: unknown) => Math.max(0, Math.min(60, Number(v) || 0));
      const dateOrNull = (v: unknown) => {
        const s = String(v ?? "").trim();
        if (!s) return null;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const name = str(body.name, 120);
      if (name.length < 2) return NextResponse.json({ ok: false, error: "Enter your full name" }, { status: 400 });
      const updated = await db.checklistAccount.update({
        where: { id: account.id },
        data: {
          name,
          phone: str(body.phone, 40),
          city: str(body.city, 80),
          state: str(body.state, 40),
          zip: str(body.zip, 20),
          profession: str(body.profession, 40),
          discipline: str(body.discipline, 60),
          title: str(body.discipline, 60) || account.title,
          specialty: str(body.specialty, 60),
          yrsOverall: int(body.yrsOverall),
          yrsOverallStart: dateOrNull(body.yrsOverallStart),
          yrsSpecialty: int(body.yrsSpecialty),
          yrsSpecialtyStart: dateOrNull(body.yrsSpecialtyStart),
          onboardingComplete: true,
        },
      });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "PROFILE_SAVED", entity: "checklistAccount", entityId: account.id });
      return NextResponse.json({ ok: true, account: { name: updated.name, email: updated.email, title: updated.title } });
    }

    if (action === "me") {
      const account = await getAccount();
      if (account?.status === "SUSPENDED") {
        await destroySession();
        return NextResponse.json({ ok: true, account: null, suspended: true });
      }
      if (!account || !account.emailVerified) {
        // Unverified accounts are invisible to the portal until confirmed.
        if (account) await destroySession();
        return NextResponse.json({ ok: true, account: null });
      }
      // auto-claim invites by email on every load (covers signups after invite was sent)
      const unclaimed = await db.checklistInvite.count({ where: { candidateEmail: account.email, accountId: null } });
      if (unclaimed) await db.checklistInvite.updateMany({ where: { candidateEmail: account.email, accountId: null }, data: { accountId: account.id } });
      // keep pre-fill current (fills only empty fields)
      await backfillFromInvites(account.id, account.email);
      const fresh = await db.checklistAccount.findUnique({ where: { id: account.id } });

      const [invites, requests, completions] = await Promise.all([
        db.checklistInvite.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } }),
        db.checklistRequest.findMany({ where: { accountId: account.id }, orderBy: { requestedAt: "desc" } }),
        db.checklistCompletion.findMany({ where: { accountId: account.id }, orderBy: { completedAt: "desc" }, include: { shareLinks: { orderBy: { createdAt: "desc" } } } }),
      ]);

      return NextResponse.json({
        ok: true,
        account: {
          name: fresh?.name ?? account.name, email: account.email, title: fresh?.title ?? account.title,
          phone: fresh?.phone ?? "", city: fresh?.city ?? "", state: fresh?.state ?? "", zip: fresh?.zip ?? "",
          profession: fresh?.profession ?? "", discipline: fresh?.discipline ?? "", specialty: fresh?.specialty ?? "",
          yrsOverall: derivedYears(fresh?.yrsOverall ?? 0, fresh?.yrsOverallStart ?? null),
          yrsSpecialty: derivedYears(fresh?.yrsSpecialty ?? 0, fresh?.yrsSpecialtyStart ?? null),
          yrsOverallStart: fresh?.yrsOverallStart ? fresh.yrsOverallStart.toISOString().slice(0, 10) : "",
          yrsSpecialtyStart: fresh?.yrsSpecialtyStart ? fresh.yrsSpecialtyStart.toISOString().slice(0, 10) : "",
          onboardingComplete: fresh?.onboardingComplete ?? false,
        },
        invites: invites.map((i) => ({
          id: i.id, recruiterName: i.recruiterName, facilityName: i.facilityName, agencyName: i.agencyName,
          profession: i.profession, jobTitle: i.jobTitle, specialty: i.specialty,
          status: i.status, createdAt: i.createdAt, completionId: i.completionId, message: i.message,
        })),
        requests: requests.map((r) => ({
          id: r.id, profession: r.profession, jobTitle: r.jobTitle, specialty: r.specialty,
          status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt,
          completionId: r.completion?.id ?? null,
        })),
        completions: completions.map((c) => {
          const safeParse = <T,>(raw: string | null | undefined, fallback: T): T => {
            try { const v = JSON.parse(raw || ""); return (v ?? fallback) as T; } catch { return fallback; }
          };
          return {
            id: c.id, profession: c.profession, jobTitle: c.jobTitle,
            specialty: c.specialty, specialtyLabel: c.specialtyLabel,
            source: c.source, completedAt: c.completedAt, expiresAt: c.expiresAt,
            yearsExperience: c.yearsExperience,
            answers: safeParse(c.answers, []) as unknown[], // recency-aware answer rows
            additional: safeParse(c.additional, []) as unknown[], // extra-question snapshot
            attestation: c.attestation ? safeParse(c.attestation, null) : null,
            shareLinks: c.shareLinks.map((s) => ({
              id: s.id, token: s.token, accessType: s.accessType, durationDays: s.durationDays,
              label: s.label, createdAt: s.createdAt, expiresAt: s.expiresAt,
              viewedAt: s.viewedAt, viewCount: s.viewCount, revoked: s.revoked,
            })),
          };
        }),
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[checklist/account]", e);
    return NextResponse.json({ ok: false, error: "Account request failed" }, { status: 500 });
  }
}
