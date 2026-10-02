import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── GET /api/checklists — active skill checklists for the candidate wizard ──
// Returns Zipvault-format sets grouped by (profession, jobTitle, specialty).
// Free-text specialties are normalized to a stable key so the wizard can match.

const LABELS: Record<string, string> = {
  MEDSURG: "Med-Surg", ICU: "ICU / Critical Care", ER: "Emergency Room", TELE: "Telemetry",
  "L&D": "Labor & Delivery", OR: "Operating Room", PACU: "PACU", PEDS: "Pediatrics",
  BEH: "Behavioral Health", LTC: "Long-Term Care", GENERAL: "General",
};

export async function GET() {
  try {
    const rows = await db.skillTemplate.findMany({
      where: { active: true },
      orderBy: [{ specialty: "asc" }, { sortOrder: "asc" }, { skillName: "asc" }],
    });

    const sets = new Map<string, { key: string; profession: string; jobTitle: string; specialty: string; label: string; skills: { name: string; category: string; questionType: string; hasNA: boolean; highRisk: boolean }[] }>();
    for (const t of rows) {
      const k = `${t.profession}|${t.jobTitle}|${t.specialty}`;
      if (!sets.has(k)) {
        sets.set(k, {
          key: k,
          profession: t.profession,
          jobTitle: t.jobTitle,
          specialty: t.specialty,
          label: LABELS[t.specialty] ?? t.specialty.replace(/_/g, " "),
          skills: [],
        });
      }
      sets.get(k)!.skills.push({ name: t.skillName, category: t.category, questionType: t.questionType, hasNA: t.hasNA, highRisk: t.highRisk });
    }

    return NextResponse.json({ ok: true, checklists: [...sets.values()] });
  } catch (e) {
    console.error("[checklists]", e);
    return NextResponse.json({ ok: false, error: "Failed to load checklists", checklists: [] }, { status: 500 });
  }
}
