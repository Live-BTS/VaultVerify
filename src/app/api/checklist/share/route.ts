import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { evaluateChecklistShare, viewerAllowedByRecipient, resolveNewShareBinding } from "@/lib/bts/sharePolicy";
import { specialtyLabel } from "@/lib/bts/checklistShared";
import { newToken } from "@/lib/bts/tokens";

// ── POST /api/checklist/share — candidate shares a completed checklist ──
// create : { completionId, accessType: "ONE_TIME" | "DURATION", durationDays?, label?, audience?, recipientEmail? }
// resolve: { token } → public payload for the share view (marks ONE_TIME as viewed)
// listMine: {} → every link the signed-in candidate controls (both types)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    // ── candidate's own share ledger (Controlled Sharing panel) ──
    if (body.action === "listMine") {
      const account = await getAccount();
      if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

      const checklistLinks = await db.checklistShareLink.findMany({
        where: { completion: { accountId: account.id } },
        include: { completion: true },
        orderBy: { createdAt: "desc" },
      });
      const candidate = await db.candidate.findFirst({ where: { email: account.email.toLowerCase() }, select: { id: true } });
      const refLinks = candidate
        ? await db.referenceShareLink.findMany({
            where: { request: { candidateId: candidate.id } },
            include: { request: true },
            orderBy: { createdAt: "desc" },
          })
        : [];

      return NextResponse.json({
        ok: true,
        checklistLinks: checklistLinks.map((l) => ({
          id: l.id,
          token: l.token,
          type: "CHECKLIST" as const,
          assetLabel: l.completion.specialtyLabel || specialtyLabel(l.completion.specialty),
          assetSub: `${l.completion.jobTitle} · completed ${new Date(l.completion.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
          assetValidUntil: l.completion.expiresAt.toISOString(),
          accessType: l.accessType,
          durationDays: l.durationDays,
          label: l.label,
          recipientEmail: l.recipientEmail,
          audience: l.recipientRecruiterId || l.recipientEmail ? "SPECIFIC" : "ANYONE",
          createdAt: l.createdAt.toISOString(),
          expiresAt: l.expiresAt?.toISOString() ?? null,
          viewedAt: l.viewedAt?.toISOString() ?? null,
          viewCount: l.viewCount,
          revoked: l.revoked,
        })),
        refLinks: refLinks.map((l) => ({
          id: l.id,
          token: l.token,
          type: "REFERENCE" as const,
          assetLabel: `${l.request.refName} — ${l.request.facilityName}`,
          assetSub: l.request.refTitle,
          assetValidUntil: null,
          accessType: l.accessType,
          durationDays: l.durationDays,
          label: l.label,
          recipientEmail: l.recipientEmail,
          audience: l.recipientRecruiterId || l.recipientEmail ? "SPECIFIC" : "ANYONE",
          createdAt: l.createdAt.toISOString(),
          expiresAt: l.expiresAt?.toISOString() ?? null,
          viewedAt: l.viewedAt?.toISOString() ?? null,
          viewCount: l.viewCount,
          revoked: l.revoked,
        })),
      });
    }

    // ── public resolve ──
    if (body.action === "resolve") {
      const token = String(body.token ?? "");
      const link = await db.checklistShareLink.findUnique({ where: { token }, include: { completion: true } });
      const decision = evaluateChecklistShare(link, link?.completion);
      if (!decision.ok) {
        return NextResponse.json({ ok: false, reason: decision.reason }, { status: decision.status });
      }
      if (!link || !link.completion) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });

      // CH-06: a bound link opens only for the recruiter the candidate named.
      const viewer = await getRecruiterSessionAccount();
      if (!viewerAllowedByRecipient(link, viewer ? { recruiterId: viewer.id, recruiterEmail: viewer.email } : null)) {
        return NextResponse.json({ ok: false, reason: "reserved" }, { status: 403 });
      }

      const account = await db.checklistAccount.findUnique({ where: { id: link.completion.accountId } });
      // CH-08: one-time consumption is a single conditional UPDATE (… WHERE
      // viewedAt IS NULL) — under concurrent opens exactly one request wins
      // (count === 1); every other request sees the link as already used.
      // Identical semantics on SQLite and Postgres.
      const now = new Date();
      let firstView = false;
      if (link.accessType === "ONE_TIME") {
        // Deliver exactly once: the resolve view IS the delivery. A link that
        // is already consumed — or that just lost the concurrent race for it —
        // never re-delivers. (The save window only covers companion reads:
        // the answers fetch and the PDF save of the already-delivered view.)
        const claimed = await db.checklistShareLink.updateMany({
          where: { id: link.id, viewedAt: null },
          data: { viewedAt: now, viewCount: { increment: 1 } },
        });
        if (claimed.count === 0) {
          return NextResponse.json({ ok: false, reason: "used" }, { status: 403 });
        }
        firstView = true;
      } else {
        await db.checklistShareLink.update({
          where: { id: link.id },
          data: { viewedAt: link.viewedAt ?? now, viewCount: { increment: 1 } },
        });
      }
      if (firstView) {
        await logAudit({ actorType: "RECRUITER", actorId: "share-link", action: "SHARE_LINK_VIEWED", entity: "checklistShareLink", entityId: link.id, detail: JSON.stringify({ oneTime: true }) });
      }

      return NextResponse.json({
        ok: true,
        link: {
          accessType: link.accessType,
          durationDays: link.durationDays,
          expiresAt: link.expiresAt,
          createdAt: link.createdAt,
          label: link.label,
          justConsumed: firstView,
        },
        completion: {
          candidateName: account?.name ?? "Candidate",
          candidateTitle: account?.title ?? "RN",
          email: account?.email ?? "",
          profession: link.completion.profession,
          jobTitle: link.completion.jobTitle,
          specialty: link.completion.specialty,
          specialtyLabel: link.completion.specialtyLabel,
          yearsExperience: link.completion.yearsExperience,
          completedAt: link.completion.completedAt,
          expiresAt: link.completion.expiresAt,
        },
      });
    }

    // ── authenticated create ──
    const account = await getAccount();
    if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

    // CH-09: actions that EXPAND access (create / extend) require a verified
    // email. Revoking stays open for everyone — reducing access must never
    // wait on verification; listMine is the candidate's own ledger.
    const needsVerifiedEmail = () =>
      account.emailVerified ? null : NextResponse.json(
        { ok: false, error: "Verify your email before sharing — check your inbox for the confirmation link.", needsVerification: true },
        { status: 403 },
      );

    // ── revoke: { token } — candidate withdraws a share link ──
    if (body.action === "revoke") {
      const link = await db.checklistShareLink.findUnique({ where: { token: String(body.token ?? "") }, include: { completion: true } });
      if (!link || link.completion.accountId !== account.id) return NextResponse.json({ ok: false, error: "Share link not found" }, { status: 404 });
      await db.checklistShareLink.update({ where: { id: link.id }, data: { revoked: true } });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "SHARE_LINK_REVOKED", entity: "checklistShareLink", entityId: link.id });
      return NextResponse.json({ ok: true });
    }

    // ── extend: { token, days } — push the expiry out (DURATION links) ──
    if (body.action === "extend") {
      const gated = needsVerifiedEmail();
      if (gated) return gated;
      const link = await db.checklistShareLink.findUnique({ where: { token: String(body.token ?? "") }, include: { completion: true } });
      if (!link || link.completion.accountId !== account.id) return NextResponse.json({ ok: false, error: "Share link not found" }, { status: 404 });
      if (link.revoked) return NextResponse.json({ ok: false, error: "This link was revoked — create a new one" }, { status: 400 });
      if (link.accessType !== "DURATION") return NextResponse.json({ ok: false, error: "One-time links can't be extended" }, { status: 400 });
      const days = Math.max(1, Math.min(365, Number(body.days) || 0));
      if (!days) return NextResponse.json({ ok: false, error: "Set how many days to add" }, { status: 400 });
      const base = link.expiresAt && link.expiresAt > new Date() ? link.expiresAt.getTime() : Date.now();
      const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000);
      await db.checklistShareLink.update({
        where: { id: link.id },
        data: { expiresAt, durationDays: (link.durationDays ?? 0) + days },
      });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "SHARE_LINK_EXTENDED", entity: "checklistShareLink", entityId: link.id, detail: JSON.stringify({ days }) });
      return NextResponse.json({ ok: true, expiresAt });
    }

    // ── create — the share itself ──
    const gated = needsVerifiedEmail();
    if (gated) return gated;
    const completion = await db.checklistCompletion.findUnique({ where: { id: String(body.completionId ?? "") } });
    if (!completion || completion.accountId !== account.id) return NextResponse.json({ ok: false, error: "Checklist not found" }, { status: 404 });
    if (completion.expiresAt < new Date()) return NextResponse.json({ ok: false, error: "This checklist has expired — retake it to share again" }, { status: 400 });

    const accessType = body.accessType === "ONE_TIME" ? "ONE_TIME" : "DURATION";
    let durationDays: number | null = null;
    if (accessType === "DURATION") {
      durationDays = Math.max(1, Math.min(365, Number(body.durationDays) || 0));
      if (!durationDays) return NextResponse.json({ ok: false, error: "Set how long the link stays open" }, { status: 400 });
    }

    // CH-06: SPECIFIC (default) binds the link to the named recruiter; ANYONE is
    // the candidate's explicit open-link choice. Legacy rows are never re-bound.
    const binding = resolveNewShareBinding(body.audience, body.recipientEmail);
    if (!binding.ok) return NextResponse.json({ ok: false, error: binding.error }, { status: 400 });
    const recipientAccount = binding.recipientEmail
      ? await db.recruiterAccount.findUnique({ where: { email: binding.recipientEmail } })
      : null;

    const link = await db.checklistShareLink.create({
      data: {
        token: newToken(),
        completionId: completion.id,
        accessType,
        durationDays,
        label: String(body.label ?? "").slice(0, 120),
        expiresAt: accessType === "DURATION" ? new Date(Date.now() + durationDays! * 24 * 60 * 60 * 1000) : null,
        recipientRecruiterId: recipientAccount?.id ?? null,
        recipientEmail: binding.recipientEmail,
      },
    });
    await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "SHARE_LINK_CREATED", entity: "checklistShareLink", entityId: link.id, detail: JSON.stringify({ accessType, durationDays, audience: binding.audience }) });

    return NextResponse.json({
      ok: true,
      link: { token: link.token, accessType: link.accessType, durationDays: link.durationDays, expiresAt: link.expiresAt, audience: binding.audience, recipientEmail: binding.recipientEmail },
    });
  } catch (e) {
    console.error("[checklist/share]", e);
    return NextResponse.json({ ok: false, error: "Share request failed" }, { status: 500 });
  }
}
