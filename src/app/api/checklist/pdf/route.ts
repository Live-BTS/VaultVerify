import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { buildChecklistPdf, type ChecklistPdfData } from "@/lib/bts/checklistPdf";

// ── GET /api/checklist/pdf — branded checklist PDF ──
// ?share=<token>                    public via share link (validates without consuming one-time)
// ?completion=<id>                  signed-in candidate (own checklist)
// ?invite=<id>&code=<recruiter>     recruiter download for an invite they sent

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    let account: { name: string; email: string; title: string } | null = null;
    let completion = null;

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
    } else if (inviteId) {
      if (sp.get("code") !== (process.env.RECRUITER_CODE ?? "meds2026")) return new NextResponse("Invalid code", { status: 401 });
      const invite = await db.checklistInvite.findUnique({ where: { id: inviteId } });
      if (!invite?.completionId) return new NextResponse("Not completed yet", { status: 404 });
      completion = await db.checklistCompletion.findUnique({ where: { id: invite.completionId } });
      if (!completion) return new NextResponse("Not found", { status: 404 });
      account = await db.checklistAccount.findUnique({ where: { id: completion.accountId } });
    } else {
      return new NextResponse("Missing parameters", { status: 400 });
    }

    if (!account || !completion) return new NextResponse("Not found", { status: 404 });

    const answers = JSON.parse(completion.answers || "[]") as { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk: boolean }[];
    const grouped: ChecklistPdfData["categories"] = [];
    for (const a of answers) {
      let cat = grouped.find((g) => g.name === a.category);
      if (!cat) { cat = { name: a.category, items: [] }; grouped.push(cat); }
      cat.items.push({ skill: a.skill, questionType: a.questionType, value: a.value, na: a.na, highRisk: a.highRisk });
    }

    const bytes = await buildChecklistPdf({
      account: { name: account.name, email: account.email, title: account.title },
      completion: {
        profession: completion.profession,
        jobTitle: completion.jobTitle,
        specialty: completion.specialty,
        specialtyLabel: completion.specialtyLabel,
        yearsExperience: completion.yearsExperience,
        source: completion.source,
        completedAt: completion.completedAt,
        expiresAt: completion.expiresAt,
      },
      categories: grouped,
    });

    const fname = `Skills-Checklist-${completion.specialtyLabel || completion.specialty}-${account.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  } catch (e) {
    console.error("[checklist/pdf]", e);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
