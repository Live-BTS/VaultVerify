import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, destroySession, getAccount, hashPassword, verifyPassword } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";

// ── /api/checklist/account — candidate account for the skills checklist ──
// actions: signup | login | logout | me

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

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
      if (exists) return NextResponse.json({ ok: false, error: "An account with this email already exists — sign in instead" }, { status: 400 });
      const account = await db.checklistAccount.create({ data: { name, email, title, passwordHash: hashPassword(password) } });
      await createSession(account.id);
      // claim recruiter invites addressed to this email right away
      await db.checklistInvite.updateMany({ where: { candidateEmail: email, accountId: null }, data: { accountId: account.id } });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "CHECKLIST_ACCOUNT_CREATED", entity: "checklistAccount", entityId: account.id });
      return NextResponse.json({ ok: true, account: { name: account.name, email: account.email, title: account.title } });
    }

    if (action === "login") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const account = await db.checklistAccount.findUnique({ where: { email } });
      if (!account || !verifyPassword(password, account.passwordHash)) {
        return NextResponse.json({ ok: false, error: "Wrong email or password" }, { status: 401 });
      }
      await createSession(account.id);
      // claim any recruiter invites addressed to this email
      await db.checklistInvite.updateMany({ where: { candidateEmail: email, accountId: null }, data: { accountId: account.id } });
      return NextResponse.json({ ok: true, account: { name: account.name, email: account.email, title: account.title } });
    }

    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }

    if (action === "me") {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: true, account: null });
      // auto-claim invites by email on every load (covers signups after invite was sent)
      const unclaimed = await db.checklistInvite.count({ where: { candidateEmail: account.email, accountId: null } });
      if (unclaimed) await db.checklistInvite.updateMany({ where: { candidateEmail: account.email, accountId: null }, data: { accountId: account.id } });

      const [invites, requests, completions] = await Promise.all([
        db.checklistInvite.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } }),
        db.checklistRequest.findMany({ where: { accountId: account.id }, orderBy: { requestedAt: "desc" } }),
        db.checklistCompletion.findMany({ where: { accountId: account.id }, orderBy: { completedAt: "desc" }, include: { shareLinks: { orderBy: { createdAt: "desc" } } } }),
      ]);

      return NextResponse.json({
        ok: true,
        account: { name: account.name, email: account.email, title: account.title },
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
        completions: completions.map((c) => ({
          id: c.id, profession: c.profession, jobTitle: c.jobTitle,
          specialty: c.specialty, specialtyLabel: c.specialtyLabel,
          source: c.source, completedAt: c.completedAt, expiresAt: c.expiresAt,
          yearsExperience: c.yearsExperience,
          shareLinks: c.shareLinks.map((s) => ({
            id: s.id, token: s.token, accessType: s.accessType, durationDays: s.durationDays,
            label: s.label, createdAt: s.createdAt, expiresAt: s.expiresAt,
            viewedAt: s.viewedAt, viewCount: s.viewCount, revoked: s.revoked,
          })),
        })),
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[checklist/account]", e);
    return NextResponse.json({ ok: false, error: "Account request failed" }, { status: 500 });
  }
}
