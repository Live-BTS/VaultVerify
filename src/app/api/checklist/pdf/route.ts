import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { specialtyLabel } from "@/lib/bts/checklistShared";
import { renderSkillsChecklistPdf, type ChecklistData, type LastPerformed, type Rating } from "@/lib/pdf/skills-checklist-pdf";
import type { ChecklistCompletion, ChecklistAccount } from "@prisma/client";

// ── GET /api/checklist/pdf — approved Skills-Checklist PDF (pdfkit renderer) ──
// ?share=<token>                    public via share link (validates without consuming one-time)
// ?completion=<id>                  signed-in candidate (own checklist)
// ?invite=<id>&code=<recruiter>     recruiter download for an invite they sent

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

  // Attestation: the app captures one agreement covering both approved statements.
  // signature: type mode stores plain text; draw/upload store a data-URL image.
  const statements = [
    "I confirm that the ratings above are my own and reflect my real experience. I understand that inaccurate information may affect my eligibility for placement.",
    "I agree that VaultVerify may share this self-assessment with the recruiters and employers I authorize, and that it may be verified against my references.",
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
      validUntil: `${fmtDate(completion.expiresAt)} (1 year)`,
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
    footerNote: `Self-reported assessment. Completed once by the candidate and valid for 12 months. ${accessClause}`,
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
      if (!link || link.revoked) return new NextResponse("Link not found", { status: 404 });
      if (link.expiresAt && link.expiresAt < new Date()) return new NextResponse("Link expired", { status: 403 });
      if (link.completion.expiresAt < new Date()) return new NextResponse("Checklist expired", { status: 403 });
      completion = link.completion;
      account = await db.checklistAccount.findUnique({ where: { id: completion.accountId } });
    } else if (completionId) {
      const acc = await getAccount();
      if (!acc) return new NextResponse("Sign in first", { status: 401 });
      completion = await db.checklistCompletion.findUnique({ where: { id: completionId } });
      if (!completion || completion.accountId !== acc.id) return new NextResponse("Not found", { status: 404 });
      account = acc;
      accessClause = "Accessed by the candidate from their VaultVerify portal.";
    } else if (inviteId) {
      const recruiterCode = process.env.RECRUITER_CODE ?? "";
      if (!recruiterCode || (sp.get("code") ?? "").trim() !== recruiterCode.trim()) return new NextResponse("Invalid code", { status: 401 });
      const invite = await db.checklistInvite.findUnique({ where: { id: inviteId } });
      if (!invite?.completionId) return new NextResponse("Not completed yet", { status: 404 });
      completion = await db.checklistCompletion.findUnique({ where: { id: invite.completionId } });
      if (!completion) return new NextResponse("Not found", { status: 404 });
      account = await db.checklistAccount.findUnique({ where: { id: completion.accountId } });
      accessClause = "Access was granted to the authorized recruiter through VaultVerify.";
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
