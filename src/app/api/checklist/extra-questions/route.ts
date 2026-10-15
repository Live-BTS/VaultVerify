import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { DEFAULT_EXTRA_QUESTIONS } from "@/lib/bts/checklistShared";

// ── GET /api/checklist/extra-questions — the "Additional questions" for the fill form ──
// Auth: signed-in candidate. Idempotently seeds the PDF's default question set once,
// then returns the active set (global rows + any rows pinned to the candidate's specialty).

export async function GET(_req: NextRequest) {
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

    // seed the default set the first time anything asks (keeps fresh sandboxes demo-ready)
    const existing = await db.checklistExtraQuestion.count();
    if (existing === 0) {
      await db.checklistExtraQuestion.createMany({
        data: DEFAULT_EXTRA_QUESTIONS.map((q) => ({ ...q })),
      });
    }

    const spec = account.specialty ?? "";
    const questions = await db.checklistExtraQuestion.findMany({
      where: { active: true, OR: [{ specialty: "" }, ...(spec ? [{ specialty: spec }] : [])] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, kind: true, prompt: true, placeholder: true },
    });

    return NextResponse.json({ ok: true, questions });
  } catch (e) {
    console.error("[checklist/extra-questions]", e);
    return NextResponse.json({ ok: false, error: "Could not load additional questions" }, { status: 500 });
  }
}
