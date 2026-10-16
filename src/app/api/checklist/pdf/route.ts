import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { getRecruiterSessionAccount } from "@/lib/bts/auth";
import { logAudit } from "@/lib/bts/audit";
import { specialtyLabel, CONSENT_STATEMENT } from "@/lib/bts/checklistShared";
import { CHECKLIST_VALIDITY_DAYS } from "@/lib/bts/constants";
import { evaluateCompanionRead, viewerAllowedByRecipient } from "@/lib/bts/sharePolicy";
import { renderSkillsChecklistPdf, type ChecklistData, type LastPerformed, type Rating } from "@/lib/pdf/skills-checklist-pdf";
import type { ChecklistCompletion, ChecklistAccount } from "@prisma/client";

// ── GET /api/checklist/pdf — approved Skills-Checklist PDF (pdfkit renderer) ──
// ?share=<token>                    public via share link — CH-08: enforces the
//                                   SAME policy as the resolve view (sharePolicy
//                                   single source of truth: revoked/used/expired/
//                                   report-expired + CH-06 recipient binding).
//                                   A fresh ONE_TIME link is consumed atomically
//                                   by this download; a just-consumed link stays
//                                   downloadable inside its save window.
// ?completion=<id>                  signed-in candidate (own checklist)
// ?invite=<id>                      the recruiter who SENT the invite (session) —
//                                   CH-07: ownership-checked; an invitation alone
//                                   never authorizes the PDF for anyone else

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const LP_MAP: Record<string, LastPerformed> = {
  "3": "within_3_months",
  "6": "within_6_months",
  "6+": "over_6_months",
  na: "na",
};

type RawAnswer = { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk?: boolean; lastPerformed?: string | null };
type RawExtra = { id?: string; prompt: string; kind: string; value?: unknown };

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  try { const v = JSON.parse(raw || ""); return (v ?? fallback) as T; } catch { return fallback; }
}

/** DB completion rows -> approved ChecklistData contract (read-only mapping). */
function mapChecklistData(
  account: ChecklistAccount,
  completion: ChecklistCompletion,
  accessClause: string,
): ChecklistData {
  const answers = safeParse<RawAnswer[]>(completion.answers, []);
  const extras = safeParse<RawExtra[]>(completion.additional, []);
  const att = safeParse<{ agreed?: boolean; mode?: string; signature?: string; printedName?: string; signedAt?: string } | null>(completion.attestation, null);

  // Skills: group by category in stored (template) order; rating null = candidate marked N/A.
  const categories: ChecklistData["categories"] = [];
  for (const a of answers) {
    const lp = LP_MAP[a.lastPerformed ?? ""] ?? "na";
    const rating: Rating | null = a.na || a.value == null || Number(a.value) < 1 || Number(a.value) > 4 ? null : (Number(a.value) as Rating);
    let cat = categories.find((g) => g.name === a.category);
    if (!cat) { cat = { name: a.category, skills: [] }; categories.push(cat); }
    cat.skills.push({ name: a.skill, rating, lastPerformed: lp });
  }

  // Additional questions: Yes/No extras -> "Availability & preferences", text extras -> "Experience notes"
  // (same two groups as the approved design; kind-based so superadmin-added questions flow in too).
  const yn = extras.filter((e) => (e.kind || "").toUpperCase() === "YES_NO");
  const tx = extras.filter((e) => (e.kind || "").toUpperCase() !== "YES_NO");
  const questions: ChecklistData["questions"] = [];
  if (yn.length) {
    questions.push({
      category: "Availability & preferences",
      items: yn.map((e) => ({ type: "yes_no" as const, question: e.prompt, answer: e.value === true || e.value === "yes" || e.value === "Yes" })),
    });
  }
  if (tx.length) {
    questions.push({
      category: "Experience notes",
      items: tx.map((e) => ({ type: "text" as const, question: e.prompt, answer: typeof e.value === "string" ? e.value : e.value == null ? "" : String(e.value) })),
    });
  }

  // Attestation: the app captures the honesty statement + the Privacy Policy / Terms of Use consent.
  // signature: type mode stores plain text; draw/upload store a data-URL image.
  const statements = [
    "I confirm that the ratings above are my own and reflect my real experience. I understand that inaccurate information may affect my eligibility for placement.",
    CONSENT_STATEMENT,
  ];
  const sig = att?.signature ?? "";
  const isImage = sig.startsWith("data:image");
  const agreed = !!att?.agreed;

  return {
    candidate: {
      name: account.name || "Candidate",
      profession: completion.profession || "Nursing",
      jobTitle: completion.jobTitle || "RN",
      specialty: completion.specialtyLabel || specialtyLabel(completion.specialty),
      email: account.email,
      experience: completion.yearsExperience != null ? `${completion.yearsExperience} yr(s)` : "—",
      completedOn: fmtDate(completion.completedAt),
      validUntil: `${fmtDate(completion.expiresAt)} (${CHECKLIST_VALIDITY_DAYS} days)`,
      source: (completion.source || "") === "RECRUITER" ? "Requested by a recruiter" : "Self-initiated",
    },
    categories,
    questions,
    attestation: {
      statements: statements.map((text) => ({ text, accepted: agreed })),
      signatureName: !isImage && sig ? sig : undefined,
      signatureImage: isImage ? sig : undefined,
      printedName: att?.printedName || account.name || "",
      signedOn: fmtDate(att?.signedAt ?? completion.completedAt),
    },
    footerNote: `Self-reported assessment. Completed once by the candidate and valid for ${CHECKLIST_VALIDITY_DAYS} days. ${accessClause}`,
    generatedOn: fmtDate(new Date()),
    sampleNotice: "",
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    let account: ChecklistAccount | null = null;
    let completion: ChecklistCompletion | null = null;
    let accessClause = "Access was granted through a VaultVerify share link; sharing rules (one-time or duration) are logged by platform.";

    const shareToken = sp.get("share");
    const completionId = sp.get("completion");
    const inviteId = sp.get("invite");

    if (shareToken) {
      const link = await db.checklistShareLink.findUnique({ where: { token: shareToken }, include: { completion: true } });
      // CH-08: identical decision to the resolve view — plus the bounded save
      // window so the just-delivered one-time view can still save its PDF.
      const decision = evaluateCompanionRead(link, link?.completion);
      if (!decision.ok) {
        const msg =
          decision.reason === "invalid" ? "Link not found"
          : decision.reason === "used" ? "This link was already used"
          : decision.reason === "expired" ? "Link expired"
          : "Checklist expired";
        return new NextResponse(msg, { status: decision.status });
      }
      if (!link || !link.completion) return new NextResponse("Link not found", { status: 404 });
      // CH-06: a bound link downloads only for the recruiter the candidate named.
      const viewer = await getRecruiterSessionAccount();
      if (!viewerAllowedByRecipient(link, viewer ? { recruiterId: viewer.id, recruiterEmail: viewer.email } : null)) {
        return new NextResponse("This link is reserved for the recruiter it was shared with", { status: 403 });
      }
      // Deliver-once: a fresh ONE_TIME link is consumed by THIS download, via a
      // single conditional UPDATE — a concurrent open can never both win.
      if (link.accessType === "ONE_TIME" && !link.viewedAt) {
        const claimed = await db.checklistShareLink.updateMany({
          where: { id: link.id, viewedAt: null },
          data: { viewedAt: new Date(), viewCount: { increment: 1 } },
        });
        if (claimed.count === 1) {
          await logAudit({ actorType: "RECRUITER", actorId: "share-link", action: "SHARE_LINK_VIEWED", entity: "checklistShareLink", entityId: link.id, detail: { oneTime: true, via: "pdf" } });
        }
      }
      completion = link.completion;
      account = await db.checklistAccount.findUnique({ where: { id: completion.accountId } });
      // SEC-04/05 matrix: the public share-PDF download is audited like the view.
      await logAudit({ actorType: "RECRUITER", actorId: viewer?.id ?? "share-link", action: "SHARE_PDF_DOWNLOADED", entity: "checklistShareLink", entityId: link.id });
    } else if (completionId) {
      const acc = await getAccount();
      if (!acc) return new NextResponse("Sign in first", { status: 401 });
      completion = await db.checklistCompletion.findUnique({ where: { id: completionId } });
      if (!completion || completion.accountId !== acc.id) return new NextResponse("Not found", { status: 404 });
      account = acc;
      accessClause = "Accessed by the candidate from their VaultVerify portal.";
    } else if (inviteId) {
      // CH-07: only the recruiter who sent this invitation may download its
      // completion PDF, via their verified account session. The legacy access
      // code path is retired. An invitation alone never authorizes this PDF.
      const recruiter = await getRecruiterSessionAccount();
      if (!recruiter || !recruiter.emailVerified || !recruiter.onboardingComplete) {
        return new NextResponse("Recruiter sign-in required", { status: 401 });
      }
      const invite = await db.checklistInvite.findUnique({ where: { id: inviteId } });
      if (!invite?.completionId) return new NextResponse("Not completed yet", { status: 404 });
      if (invite.recruiterAccountId !== recruiter.id) {
        return new NextResponse("This invitation was sent by another recruiter", { status: 403 });
      }
      completion = await db.checklistCompletion.findUnique({ where: { id: invite.completionId } });
      if (!completion) return new NextResponse("Not found", { status: 404 });
      account = await db.checklistAccount.findUnique({ where: { id: completion.accountId } });
      accessClause = "Access was granted to the recruiter who requested this checklist, through VaultVerify.";
    } else {
      return new NextResponse("Missing parameters", { status: 400 });
    }

    if (!account || !completion) return new NextResponse("Not found", { status: 404 });

    const data = mapChecklistData(account, completion, accessClause);
    const pdf = await renderSkillsChecklistPdf(data);

    const fname = `Skills-Checklist-${completion.specialtyLabel || completion.specialty}-${account.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[checklist/pdf]", e);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
