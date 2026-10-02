import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/bts/checklistAuth";
import { logAudit } from "@/lib/bts/audit";

// ── POST /api/checklist/request — candidate asks for a checklist (superadmin approves) ──

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });

    const profession = String(body.profession ?? "Nursing").trim();
    const jobTitle = String(body.jobTitle ?? "").trim();
    const specialty = String(body.specialty ?? "").trim();
    if (!profession || !jobTitle || !specialty) {
      return NextResponse.json({ ok: false, error: "Pick a checklist from the catalog" }, { status: 400 });
    }

    // only one open request per checklist set
    const dupe = await db.checklistRequest.findFirst({
      where: { accountId: account.id, specialty, status: { in: ["PENDING", "APPROVED"] } },
    });
    if (dupe) {
      return NextResponse.json({ ok: false, error: dupe.status === "PENDING" ? "You already have a pending request for this checklist" : "This checklist is already approved — start it from Requests" }, { status: 400 });
    }
    // already completed and still valid?
    const done = await db.checklistCompletion.findFirst({
      where: { accountId: account.id, specialty, expiresAt: { gt: new Date() } },
    });
    if (done) {
      return NextResponse.json({ ok: false, error: "You already completed this checklist — it's valid in My checklists" }, { status: 400 });
    }

    const request = await db.checklistRequest.create({
      data: { accountId: account.id, profession, jobTitle, specialty },
    });
    await logAudit({ actorType: "CANDIDATE", actorId: account.id, action: "CHECKLIST_REQUESTED", entity: "checklistRequest", entityId: request.id, detail: JSON.stringify({ specialty, jobTitle }) });

    return NextResponse.json({ ok: true, requestId: request.id });
  } catch (e) {
    console.error("[checklist/request]", e);
    return NextResponse.json({ ok: false, error: "Could not create the request" }, { status: 500 });
  }
}
