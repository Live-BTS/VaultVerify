import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";

// ── POST /api/checklist/share — candidate shares a completed checklist ──
// create : { completionId, accessType: "ONE_TIME" | "DURATION", durationDays?, label? }
// resolve: { token } → public payload for the share view (marks ONE_TIME as viewed)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    // ── public resolve ──
    if (body.action === "resolve") {
      const token = String(body.token ?? "");
      const link = await db.checklistShareLink.findUnique({ where: { token }, include: { completion: true } });
      if (!link || link.revoked) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
      if (link.accessType === "ONE_TIME" && link.viewedAt) return NextResponse.json({ ok: false, reason: "used" }, { status: 403 });
      if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
      if (link.completion.expiresAt < new Date()) return NextResponse.json({ ok: false, reason: "checklist_expired" }, { status: 403 });

      const account = await db.checklistAccount.findUnique({ where: { id: link.completion.accountId } });
      const firstView = link.accessType === "ONE_TIME" && !link.viewedAt;
      await db.checklistShareLink.update({
        where: { id: link.id },
        data: { viewedAt: link.viewedAt ?? new Date(), viewCount: { increment: 1 } },
      });
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
    const completion = await db.checklistCompletion.findUnique({ where: { id: String(body.completionId ?? "") } });
    if (!completion || completion.accountId !== account.id) return NextResponse.json({ ok: false, error: "Checklist not found" }, { status: 404 });
    if (completion.expiresAt < new Date()) return NextResponse.json({ ok: false, error: "This checklist has expired — retake it to share again" }, { status: 400 });

    const accessType = body.accessType === "ONE_TIME" ? "ONE_TIME" : "DURATION";
    let durationDays: number | null = null;
    if (accessType === "DURATION") {
      durationDays = Math.max(1, Math.min(365, Number(body.durationDays) || 0));
      if (!durationDays) return NextResponse.json({ ok: false, error: "Set how long the link stays open" }, { status: 400 });
    }
    const link = await db.checklistShareLink.create({
      data: {
        completionId: completion.id,
        accessType,
        durationDays,
        label: String(body.label ?? "").slice(0, 120),
        expiresAt: accessType === "DURATION" ? new Date(Date.now() + durationDays! * 24 * 60 * 60 * 1000) : null,
      },
    });
    await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "SHARE_LINK_CREATED", entity: "checklistShareLink", entityId: link.id, detail: JSON.stringify({ accessType, durationDays }) });

    return NextResponse.json({
      ok: true,
      link: { token: link.token, accessType: link.accessType, durationDays: link.durationDays, expiresAt: link.expiresAt },
    });
  } catch (e) {
    console.error("[checklist/share]", e);
    return NextResponse.json({ ok: false, error: "Share request failed" }, { status: 500 });
  }
}
