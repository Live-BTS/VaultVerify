import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { QUESTIONS } from "@/lib/bts/questions";
import { specialtyLabel } from "@/lib/bts/constants";
import { newToken, sha256Hex, tokenLookups, isTokenHashed } from "@/lib/bts/tokens";
import { candidateProfileWhere } from "@/lib/bts/identity";
import { viewerAllowedByRecipient, resolveNewShareBinding } from "@/lib/bts/sharePolicy";

// ── /api/reference/share — candidate shares a COMPLETED reference report ──
// GET  (session)          → ledger of every reference share link (Controlled Sharing)
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

// GET — the candidate's reference-share ledger. SESSION REQUIRED: the ledger
// exposes live share tokens, so it is only ever returned to the owning account.
export async function GET(_req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

  // Phase E unified identity: accountId link first, unlinked-legacy email fallback.
  const candidate = await db.candidate.findFirst({ where: candidateProfileWhere(account), select: { id: true } });
  if (!candidate) return NextResponse.json({ ok: true, links: [] });

  const requests = await db.referenceRequest.findMany({
    where: { candidateId: candidate.id },
    include: { shares: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  const links = requests.flatMap((r) =>
    // D4: hashed rows can never re-display their URL — the full link was shown
    // exactly once in the creation response. Legacy (pre-cutover) rows keep
    // their raw token until first resolve, so they still get a working linkUrl.
    r.shares.map((l) => ({
      id: l.id,
      linkUrl: isTokenHashed(l.token) ? null : `/?rs=${l.token}`,
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
      // D4: try the SHA-256 digest first (post-cutover rows), then the raw
      // value (legacy rows). At most one row can match — the column is unique.
      const token = String(body.token ?? "").trim();
      const link = await db.referenceShareLink.findFirst({
        where: { token: { in: tokenLookups(token) } },
        include: { request: { include: { candidate: { include: { agency: true } }, response: true } } },
      });
      if (!link || link.revoked) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
      if (link.accessType === "ONE_TIME" && link.viewedAt) return NextResponse.json({ ok: false, reason: "used" }, { status: 403 });
      if (link.expiresAt && link.expiresAt < new Date()) return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
      // CH-06: a bound link opens only for the recruiter the candidate named.
      // OPEN links (both recipient fields null) behave exactly as issued.
      const viewer = await getRecruiterSessionAccount();
      if (!viewerAllowedByRecipient(link, viewer ? { recruiterId: viewer.id, recruiterEmail: viewer.email } : null)) {
        return NextResponse.json({ ok: false, reason: "reserved" }, { status: 403 });
      }
      const response = link.request.response;
      if (!response) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });

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
        // the PDF save of the already-delivered view.)
        const claimed = await db.referenceShareLink.updateMany({
          where: { id: link.id, viewedAt: null },
          // D4: the same statement lazily upgrades a legacy row (raw → digest);
          // for post-cutover rows writing the digest back is a no-op.
          data: { viewedAt: now, viewCount: { increment: 1 }, token: sha256Hex(token) },
        });
        if (claimed.count === 0) {
          return NextResponse.json({ ok: false, reason: "used" }, { status: 403 });
        }
        firstView = true;
      } else {
        await db.referenceShareLink.update({
          where: { id: link.id },
          data: { viewedAt: link.viewedAt ?? now, viewCount: { increment: 1 }, token: sha256Hex(token) },
        });
      }
      if (firstView) {
        await logAudit({ actorType: "RECRUITER", actorId: "ref-share-link", action: "REFERENCE_SHARE_VIEWED", entity: "referenceShareLink", entityId: link.id, detail: { oneTime: true } });
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

    // CH-09: actions that EXPAND access (create / extend) require a verified
    // email. Revoking stays open for everyone — reducing access must never
    // wait on verification; the GET ledger is the candidate's own data.
    const needsVerifiedEmail = () =>
      account.emailVerified ? null : NextResponse.json(
        { ok: false, error: "Verify your email before sharing — check your inbox for the confirmation link.", needsVerification: true },
        { status: 403 },
      );

    // D4: id-based (the ledger carries row ids; hashed rows have no raw token
    // to present). The token path remains for sessions opened before the cutover.
    const loadOwned = async (idOrToken: string, byId: boolean) => {
      const link = byId
        ? await db.referenceShareLink.findUnique({
            where: { id: idOrToken },
            include: { request: { include: { candidate: true } } },
          })
        : await db.referenceShareLink.findFirst({
            where: { token: { in: tokenLookups(idOrToken) } },
            include: { request: { include: { candidate: true } } },
          });
      if (!link || link.request.candidate.email !== account.email) return null;
      return link;
    };

    if (body.action === "revoke") {
      const link = await loadOwned(String(body.id ?? body.token ?? ""), !!body.id);
      if (!link) return NextResponse.json({ ok: false, error: "Share link not found" }, { status: 404 });
      await db.referenceShareLink.update({ where: { id: link.id }, data: { revoked: true } });
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_REVOKED", entity: "referenceShareLink", entityId: link.id });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "extend") {
      const gated = needsVerifiedEmail();
      if (gated) return gated;
      const link = await loadOwned(String(body.id ?? body.token ?? ""), !!body.id);
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
      await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_EXTENDED", entity: "referenceShareLink", entityId: link.id, detail: { days } });
      return NextResponse.json({ ok: true, expiresAt });
    }

    // create — { requestId, accessType, durationDays?, label?, audience?, recipientEmail? }
    const gated = needsVerifiedEmail();
    if (gated) return gated;
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

    // CH-06: SPECIFIC (default) binds the link to the named recruiter; ANYONE is
    // the candidate's explicit open-link choice. Legacy rows are never re-bound.
    const binding = resolveNewShareBinding(body.audience, body.recipientEmail);
    if (!binding.ok) return NextResponse.json({ ok: false, error: binding.error }, { status: 400 });
    const recipientAccount = binding.recipientEmail
      ? await db.recruiterAccount.findUnique({ where: { email: binding.recipientEmail } })
      : null;

    // D4: the raw token is generated here, hashed into the row, and returned
    // ONCE in this response — it is never stored and never re-displayed.
    const rawToken = newToken();
    const link = await db.referenceShareLink.create({
      data: {
        token: sha256Hex(rawToken),
        requestId: request.id,
        accessType,
        durationDays,
        label: String(body.label ?? "").slice(0, 120),
        expiresAt: accessType === "DURATION" ? new Date(Date.now() + durationDays! * 24 * 60 * 60 * 1000) : null,
        recipientRecruiterId: recipientAccount?.id ?? null,
        recipientEmail: binding.recipientEmail,
      },
    });
    await logAudit({
      actorType: "CANDIDATE", actorId: account.id, action: "REFERENCE_SHARE_CREATED", entity: "referenceShareLink", entityId: link.id,
      detail: { requestId: request.id, accessType, durationDays, audience: binding.audience },
    });

    return NextResponse.json({
      ok: true,
      link: { token: rawToken, accessType: link.accessType, durationDays: link.durationDays, expiresAt: link.expiresAt, audience: binding.audience, recipientEmail: binding.recipientEmail },
    });
  } catch (e) {
    console.error("[reference/share]", e);
    return NextResponse.json({ ok: false, error: "Share request failed" }, { status: 500 });
  }
}
