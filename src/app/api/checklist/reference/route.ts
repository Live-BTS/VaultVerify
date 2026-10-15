import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";
import { sendNotification } from "@/lib/bts/notifications";

// ── /api/checklist/reference — candidate-collected references ──
// GET  (auth)                       → my collected references
// POST { action: "create" }  (auth) → add a referee, email them the secure link
// POST { action: "preview", token } → public form payload (candidate name, context)
// POST { action: "submit", token }  → public referee answers (single-use link)

const LINK_DAYS = 30;

const RATINGS = [
  { key: "clinical", label: "Clinical competence" },
  { key: "professionalism", label: "Professionalism & ethics" },
  { key: "communication", label: "Communication" },
  { key: "teamwork", label: "Teamwork & collaboration" },
  { key: "reliability", label: "Reliability & attendance" },
  { key: "criticalThinking", label: "Critical thinking under pressure" },
] as const;

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  const refs = await db.collectedReference.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });
  // lazily expire stale pending links
  const now = new Date();
  const stale = refs.filter((r) => r.status === "PENDING" && r.expiresAt < now);
  if (stale.length) {
    await db.collectedReference.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: { status: "EXPIRED" },
    });
    for (const r of stale) r.status = "EXPIRED";
  }
  return NextResponse.json({
    ok: true,
    refs: refs.map((r) => ({
      id: r.id,
      refName: r.refName,
      refTitle: r.refTitle,
      refEmail: r.refEmail,
      facility: r.facility,
      status: r.status,
      relationship: r.relationship,
      yearsKnown: r.yearsKnown,
      wouldRehire: r.wouldRehire,
      overallRating: r.overallRating,
      answers: r.status === "COMPLETED" ? r.answers : "",
      signatureName: r.signatureName,
      completedAt: r.completedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // ── public: referee opens the form ──
  if (action === "preview") {
    try {
      const ref = await db.collectedReference.findUnique({
        where: { token: String(body.token ?? "") },
        include: { account: true },
      });
      if (!ref) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
      if (ref.status === "COMPLETED") return NextResponse.json({ ok: false, reason: "completed" }, { status: 403 });
      if (ref.status === "EXPIRED" || ref.expiresAt < new Date())
        return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
      return NextResponse.json({
        ok: true,
        context: {
          candidateName: ref.account.name,
          candidateTitle: ref.account.discipline || ref.account.title,
          refName: ref.refName,
          refTitle: ref.refTitle,
          facility: ref.facility,
          expiresAt: ref.expiresAt,
        },
        anchors: RATINGS,
      });
    } catch (e) {
      console.error("[checklist/reference/preview]", e);
      return NextResponse.json({ ok: false, error: "Preview failed" }, { status: 500 });
    }
  }

  // ── public: referee submits answers ──
  if (action === "submit") {
    try {
      const ref = await db.collectedReference.findUnique({
        where: { token: String(body.token ?? "") },
        include: { account: true },
      });
      if (!ref) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
      if (ref.status === "COMPLETED") return NextResponse.json({ ok: false, reason: "completed" }, { status: 403 });
      if (ref.status === "EXPIRED" || ref.expiresAt < new Date())
        return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });

      const relationship = String(body.relationship ?? "").trim();
      const yearsKnownRaw = Number(body.yearsKnown);
      const yearsKnown = Number.isFinite(yearsKnownRaw) && yearsKnownRaw >= 0 ? Math.round(yearsKnownRaw) : null;
      const ratingsIn = (body.ratings ?? {}) as Record<string, unknown>;
      const ratings: Record<string, number> = {};
      for (const a of RATINGS) {
        const v = Number(ratingsIn[a.key]);
        if (Number.isFinite(v) && v >= 1 && v <= 5) ratings[a.key] = Math.round(v);
      }
      if (!relationship) return NextResponse.json({ ok: false, error: "Relationship is required" }, { status: 400 });
      if (Object.keys(ratings).length === 0)
        return NextResponse.json({ ok: false, error: "Rate at least one competency" }, { status: 400 });
      const signatureName = String(body.signatureName ?? "").trim();
      if (!signatureName) return NextResponse.json({ ok: false, error: "E-signature is required" }, { status: 400 });

      const wouldRehire = ["YES", "NO", "WITH_RESERVATION"].includes(String(body.wouldRehire))
        ? String(body.wouldRehire)
        : "";
      const vals = Object.values(ratings);
      const overall = vals.reduce((s, v) => s + v, 0) / vals.length;
      const answers = JSON.stringify({
        ratings,
        strengths: String(body.strengths ?? "").slice(0, 1200),
        comments: String(body.comments ?? "").slice(0, 1200),
      });

      const updated = await db.collectedReference.update({
        where: { id: ref.id },
        data: {
          status: "COMPLETED",
          relationship,
          yearsKnown,
          wouldRehire,
          overallRating: Math.round(overall * 10) / 10,
          signatureName,
          answers,
          completedAt: new Date(),
        },
      });

      await logAudit({
        actorType: "REFERENCE",
        actorId: ref.refEmail,
        action: "COLLECTED_REFERENCE_SUBMITTED",
        entity: "collectedReference",
        entityId: ref.id,
        detail: JSON.stringify({ overall: updated.overallRating, wouldRehire }),
      });
      // notify the candidate their reference landed
      await sendNotification({
        channel: "EMAIL",
        kind: "REFERENCE",
        to: ref.account.email,
        subject: "Your collected reference is in the vault",
        body: `${ref.refName} (${relationship}) just completed your VaultVerify reference. It is now stored on your profile and can be shared with any recruiter.`,
      });

      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[checklist/reference/submit]", e);
      return NextResponse.json({ ok: false, error: "Submit failed" }, { status: 500 });
    }
  }

  // ── authenticated: candidate adds a referee ──
  const account = await getAccount();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

  try {
    if (action === "create") {
      const refName = String(body.refName ?? "").trim();
      const refTitle = String(body.refTitle ?? "").trim();
      const refEmail = String(body.refEmail ?? "").trim().toLowerCase();
      const facility = String(body.facility ?? "").trim();
      if (!refName || !refTitle || !refEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(refEmail)) {
        return NextResponse.json({ ok: false, error: "Name, title and a valid email are required" }, { status: 400 });
      }
      // dupe guard: same email still pending
      const pending = await db.collectedReference.findFirst({
        where: { accountId: account.id, refEmail, status: "PENDING" },
      });
      if (pending) {
        return NextResponse.json({ ok: false, error: `${refEmail} already has a pending request` }, { status: 409 });
      }

      const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000);
      const ref = await db.collectedReference.create({
        data: { accountId: account.id, refName, refTitle, refEmail, facility, expiresAt },
      });

      const cleanLink = `/?cr=${ref.token}`;
      await sendNotification({
        channel: "EMAIL",
        kind: "REFERENCE",
        to: refEmail,
        subject: `${account.name} asked you to be their professional reference`,
        body: `Hi ${refName}, ${account.name} (${account.discipline || account.title}) listed you as their ${refTitle} on VaultVerify. Please confirm their clinical performance — 8 quick questions on any phone, no login needed. Secure link (expires in ${LINK_DAYS} days): ${cleanLink}`,
      });
      await logAudit({
        actorType: "CANDIDATE",
        actorId: account.id,
        action: "COLLECTED_REFERENCE_SENT",
        entity: "collectedReference",
        entityId: ref.id,
        detail: JSON.stringify({ refEmail, refTitle }),
      });

      return NextResponse.json({
        ok: true,
        ref: { id: ref.id, refName, refTitle, refEmail, facility, status: ref.status, expiresAt },
        // sandbox: the email is simulated — surface the link so the flow is testable
        sandboxLink: cleanLink,
      });
    }

    if (action === "resend") {
      const ref = await db.collectedReference.findFirst({
        where: { id: String(body.id ?? ""), accountId: account.id },
      });
      if (!ref) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      if (ref.status !== "PENDING") return NextResponse.json({ ok: false, error: "Already completed" }, { status: 409 });
      await sendNotification({
        channel: "EMAIL",
        kind: "REMINDER",
        to: ref.refEmail,
        subject: `Reminder: reference request for ${account.name}`,
        body: `Friendly reminder — ${account.name} is waiting on your VaultVerify reference. Secure link: /?cr=${ref.token}`,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[checklist/reference]", e);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
}
