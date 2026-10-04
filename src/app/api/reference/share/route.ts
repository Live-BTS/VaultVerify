import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";
import { QUESTIONS } from "@/lib/bts/questions";
import { specialtyLabel } from "@/lib/bts/constants";

// ── /api/reference/share — candidate shares a COMPLETED reference report ──
// GET  ?email=            → ledger of every reference share link (Controlled Sharing)
// POST create             → { requestId, accessType, durationDays?, label? }
// POST resolve            → { token } public payload for /?rs=<token> view
// POST revoke / extend    → candidate-controlled access (same rules as checklists)

const RATING_ANCHORS: Record<number, string> = {
  1: "1 - Needs significant improvement",
  2: "2 - Below expectations",
  3: "3 - Meets expectations",
  4: "4 - Exceeds expectations",
  5: "5 - Exceptional",
};

function formatAnswers(raw: string) {
  const stored = JSON.parse(raw || "[]") as { key: string; type: string; value: string | number | null; unableToObserve?: boolean }[];
  return stored.map((a) => {
    const q = QUESTIONS.find((qq) => qq.key === a.key);
    let value = "";
    if (a.unableToObserve) value = "Unable to observe";
    else if (a.type === "rating" && typeof a.value === "number") value = RATING_ANCHORS[a.value] ?? String(a.value);
    else if (a.type === "boolean") value = a.value === "YES" ? "Yes" : a.value === "NO" ? "No" : "Prefer not to say";
    else value = String(a.value ?? "");
    return { key: a.key, question: q?.title ?? a.key, value };
  });
}

// GET — the candidate's reference-share ledger, keyed by account email
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });

  const candidate = await db.candidate.findFirst({ where: { email }, select: { id: true } });
  if (!candidate) return NextResponse.json({ ok: true, links: [] });

  const requests = await db.referenceRequest.findMany({
    where: { candidateId: candidate.id },
    include: { shares: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  const links = requests.flatMap((r) =>
    r.shares.map((l) => ({
      id: l.id,
      token: l.token,
      requestId: r.id,
      refName: r.refName,
      refTitle: r.refTitle,
      facilityName: r.facilityName,
      completed: !!(r.status === "COMPLETED" || r.status === "FLAGGED"),
      status: r.status,
      accessType: l.accessType,
      durationDays: l.durationDays,
      label: l.label,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      viewedAt: l.viewedAt,
      viewCount: l.viewCount,
      revoked: l.revoked,
    })),
  );

  return NextResponse.json({ ok: true, links });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    // ── public resolve ──
    if (body.action === "resolve") {
      const token = String(body.token ?? "");
      const link = await db.referenceShareLink.findUnique({
        where: { token },
        include: { request: { include: { candidate: { include: { agency: true } }, response: true } } },
      });
      if (!link || link.revoked) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
      if (link.accessType === "ONE_TIME" && link.viewedAt) return NextResponse.json({ ok: false, reason: "used" }, { status: 403 });
      if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
      const response = link.request.response;
      if (!response) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });

      const firstView = link.accessType === "ONE_TIME" && !link.viewedAt;
      await db.referenceShareLink.update({
        where: { id: link.id },
        data: { viewedAt: link.viewedAt ?? new Date(), viewCount: { increment: 1 } },
      });
      if (firstView) {
        await logAudit({ actorType: "RECRUITER", actorId: "ref-share-link", action: "REFERENCE_SHARE_VIEWED", entity: "referenceShareLink", entityId: link.id, detail: JSON.stringify({ oneTime: true }) });
      }

      const r = link.request;
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
        report: {
          agency: { name: r.candidate.agency.name, logoText: r.candidate.agency.logoText, primaryColor: r.candidate.agency.primaryColor, accentColor: r.candidate.agency.accentColor },
          candidate: {
            fullName: r.candidate.fullName,
            role: r.candidate.role,
            specialtyLabel: specialtyLabel(r.candidate.specialty),
            city: r.candidate.city,
            state: r.candidate.state,
          },
          referrer: {
            refName: r.refName,
            refTitle: r.refTitle,
            facilityName: r.facilityName,
            facilityCity: r.facilityCity,
            facilityState: r.facilityState,
            relationship: response.confirmedRelationship || r.relationship,
            dates: response.confirmedDates,
          },
          response: {
            identityMethod: response.identityMethod,
            verifiedDomain: response.verifiedDomain,
            overallRating: response.overallRating,
            answers: formatAnswers(response.answers),
            remarks: response.remarks,
            q8Discipline: response.q8Discipline,
            signatureName: response.signatureName,
            signedAt: response.signedAt,
            durationSeconds: response.durationSeconds,
          },
          completedAt: r.completedAt,
        },
      });
    }

    // ── authenticated candidate actions ──
    const account = await getAccount();
    if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

    const loadOwned = async (token: string) => {
      const link = await db.referenceShareLink.findUnique({
        where: { token },
        include: { request: { include: { candidate: true } } },
      });
      if (!link || link.request.candidate.email !== account.email) return null;
      return link;
    };

    if (body.action === "revoke") {
      const link = await loadOwned(String(body.token ?? ""));
      if (!link) return NextResponse.json({ ok: false, error: "Share link not found" }, { status: 404 });
      await db.referenceShareLink.update({ where: { id: link.id }, data: { revoked: true } });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_REVOKED", entity: "referenceShareLink", entityId: link.id });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "extend") {
      const link = await loadOwned(String(body.token ?? ""));
      if (!link) return NextResponse.json({ ok: false, error: "Share link not found" }, { status: 404 });
      if (link.revoked) return NextResponse.json({ ok: false, error: "This link was revoked — create a new one" }, { status: 400 });
      if (link.accessType !== "DURATION") return NextResponse.json({ ok: false, error: "One-time links can't be extended" }, { status: 400 });
      const days = Math.max(1, Math.min(365, Number(body.days) || 0));
      if (!days) return NextResponse.json({ ok: false, error: "Set how many days to add" }, { status: 400 });
      const base = link.expiresAt && link.expiresAt > new Date() ? link.expiresAt.getTime() : Date.now();
      const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000);
      await db.referenceShareLink.update({
        where: { id: link.id },
        data: { expiresAt, durationDays: (link.durationDays ?? 0) + days },
      });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_EXTENDED", entity: "referenceShareLink", entityId: link.id, detail: JSON.stringify({ days }) });
      return NextResponse.json({ ok: true, expiresAt });
    }

    // create — { requestId, accessType, durationDays?, label? }
    const request = await db.referenceRequest.findUnique({
      where: { id: String(body.requestId ?? "") },
      include: { candidate: true, response: true },
    });
    if (!request || request.candidate.email !== account.email) {
      return NextResponse.json({ ok: false, error: "Reference not found" }, { status: 404 });
    }
    if (!request.response) {
      return NextResponse.json({ ok: false, error: "This reference isn't completed yet — share it once it's signed" }, { status: 400 });
    }

    const accessType = body.accessType === "ONE_TIME" ? "ONE_TIME" : "DURATION";
    let durationDays: number | null = null;
    if (accessType === "DURATION") {
      durationDays = Math.max(1, Math.min(365, Number(body.durationDays) || 0));
      if (!durationDays) return NextResponse.json({ ok: false, error: "Set how long the link stays open" }, { status: 400 });
    }
    const link = await db.referenceShareLink.create({
      data: {
        requestId: request.id,
        accessType,
        durationDays,
        label: String(body.label ?? "").slice(0, 120),
        expiresAt: accessType === "DURATION" ? new Date(Date.now() + durationDays! * 24 * 60 * 60 * 1000) : null,
      },
    });
    await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_CREATED", entity: "referenceShareLink", entityId: link.id, detail: JSON.stringify({ requestId: request.id, accessType, durationDays }) });

    return NextResponse.json({
      ok: true,
      link: { token: link.token, accessType: link.accessType, durationDays: link.durationDays, expiresAt: link.expiresAt },
    });
  } catch (e) {
    console.error("[reference/share]", e);
    return NextResponse.json({ ok: false, error: "Share request failed" }, { status: 500 });
  }
}
