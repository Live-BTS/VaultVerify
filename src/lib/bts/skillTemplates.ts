import { db } from "@/lib/db";
import { validateRows, looksHighRisk, normalizeSpecialty, type ImportRow, type ValidatedRow } from "./importValidate";

// ── Zipvault-compatible skill checklist helpers (db-backed) ─────────
// Template schema mirrors the MyZipVault import workbook:
// Profession | Job Title | Specialty | Category | Skill Name | Question Type | Has N/A Option
// Pure validation lives in ./importValidate (client-safe).

export * from "./importValidate";

// ── Batched transactional upsert ──────────────────────────────────
// The per-row findUnique+create/update version made 3 sequential queries per
// row (~34k DB round trips for the owner's 16,894-row workbook — minutes on
// serverless Postgres, and a partial import if anything failed mid-way).
// Batched algorithm, O(chunked) queries and all-or-nothing:
//   1. dedupe rows in memory by the unique key (first wins, dupes counted)
//   2. chunked findMany loads every existing row for those keys
//   3. diff → creates vs real updates vs unchanged (identical rows skipped,
//      so re-uploading the same workbook touches nothing)
//   4. ONE $transaction: createMany chunks + the minimal update set — either
//      everything commits or nothing does (no partial imports, ever).
// sortOrder semantics: a row's position WITHIN its checklist set
// (profession | jobTitle | specialty) is fixed at first import — new rows
// continue after the set's current max — and is preserved on every
// re-import. That is the only semantic under which an export → import round
// trip is a no-op (the export orders rows set-by-set, so any file-index
// scheme would rewrite every row on re-import) and under which two imports
// into the same set compose instead of colliding. Rows failing validation
// never reach this function — the caller reports them with their row number
// and the valid remainder commits atomically.
export async function upsertTemplates(rows: ValidatedRow[], source: "IMPORT" | "BUILTIN" = "IMPORT") {
  const seen = new Map<string, { row: ValidatedRow }>();
  let duplicates = 0;
  rows.forEach((row) => {
    const key = `${row.profession}|${row.jobTitle}|${row.specialtyKey}|${row.skillName}`.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.set(key, { row });
  });
  const entries = [...seen.values()];

  const existing = new Map<string, {
    id: string; category: string; questionType: string; hasNA: boolean;
    highRisk: boolean; active: boolean; source: string; sortOrder: number;
  }>();
  // Per-set continuation baseline: new rows append AFTER the set's current
  // max sortOrder, so skills added by a later workbook keep a stable order
  // instead of restarting at 0 and colliding with earlier imports.
  const setMax = new Map<string, number>();
  const CHUNK = 400; // ~400 OR-clauses per findMany — safe for both dialects
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const found = await db.skillTemplate.findMany({
      where: {
        OR: slice.map(({ row }) => ({
          profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName,
        })),
      },
    });
    for (const f of found) {
      existing.set(`${f.profession}|${f.jobTitle}|${f.specialty}|${f.skillName}`.toLowerCase(), f);
      const sk = `${f.profession}|${f.jobTitle}|${f.specialty}`.toLowerCase();
      setMax.set(sk, Math.max(setMax.get(sk) ?? -1, f.sortOrder));
    }
  }

  const creates: {
    profession: string; jobTitle: string; specialty: string; skillName: string;
    category: string; questionType: string; hasNA: boolean; highRisk: boolean;
    active: boolean; source: string; sortOrder: number;
  }[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  let unchanged = 0;
  const createPos = new Map<string, number>();
  for (const { row } of entries) {
    // sortOrder is deliberately ABSENT from update data: a row's position is
    // fixed at first import and preserved on every re-import — the only
    // semantic under which an export → import round trip is a no-op. New
    // rows continue after the set's current max, in file order.
    const data = {
      category: row.category,
      questionType: row.questionType,
      hasNA: row.hasNA,
      highRisk: looksHighRisk(row.skillName),
      active: true,
      source,
    };
    const ex = existing.get(`${row.profession}|${row.jobTitle}|${row.specialtyKey}|${row.skillName}`.toLowerCase());
    if (!ex) {
      const sk = `${row.profession}|${row.jobTitle}|${row.specialtyKey}`.toLowerCase();
      const pos = (setMax.get(sk) ?? -1) + 1 + (createPos.get(sk) ?? 0);
      createPos.set(sk, (createPos.get(sk) ?? 0) + 1);
      creates.push({ ...data, sortOrder: pos, profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName });
    } else if (
      ex.category !== data.category || ex.questionType !== data.questionType || ex.hasNA !== data.hasNA ||
      ex.highRisk !== data.highRisk || ex.active !== data.active || ex.source !== data.source
    ) {
      updates.push({ id: ex.id, data });
    } else {
      unchanged += 1;
    }
  }

  // createMany is supported on SQLite (Prisma ≥5.12) and Postgres alike.
  await db.$transaction([
    ...chunk(creates, 500).map((c) => db.skillTemplate.createMany({ data: c })),
    ...updates.map((u) => db.skillTemplate.update({ where: { id: u.id }, data: u.data })),
  ]);

  return { created: creates.length, updated: updates.length, unchanged, duplicates };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Seed the two built-in Phase 1 checklists (Med-Surg + ICU) as BUILTIN templates.
// Idempotent: re-running refreshes categories/order without duplicating.
export const BUILTIN_CHECKLISTS = [
  {
    specialty: "MEDSURG",
    skills: [
      ["IV Therapy & Access", "IV insertion & site care", false],
      ["Medication Administration", "IV push / infusion medications", false],
      ["Medication Administration", "Medication administration (oral / IM / SubQ)", false],
      ["Medication Administration", "Diabetic care & insulin management", true],
      ["Wound Care & Skin", "Wound care & dressing changes", false],
      ["Symptom & Pain Management", "Pain management & reassessment", false],
      ["Genitourinary Care", "Foley catheter insertion & care", false],
      ["Respiratory Care", "Tracheostomy care & suctioning", false],
      ["Respiratory Care", "Oxygen therapy & respiratory treatments", false],
      ["Care Planning & Education", "Care plans & discharge education", false],
      ["Safety & Compliance", "Fall risk & safety protocols", false],
      ["Cardiac Monitoring", "Telemetry — basic rhythm interpretation", false],
      ["Transfusion Medicine", "Blood transfusion administration", true],
      ["GI & Nutrition", "NG / G-tube feeding & care", false],
    ],
  },
  {
    specialty: "ICU",
    skills: [
      ["Respiratory Support", "Ventilator management", true],
      ["Hemodynamic Monitoring", "Titrating vasoactive drips (norepi, vasopressin)", true],
      ["Hemodynamic Monitoring", "Arterial lines & hemodynamic monitoring", true],
      ["Vascular Access & Infection Control", "Central line care & CLABSI prevention", true],
      ["Renal Replacement Therapy", "CRRT / dialysis circuits", true],
      ["Chest Tubes & Drains", "Chest tube management", true],
      ["Neurological Care", "ICP monitoring & neuro assessments", false],
      ["Sedation & Analgesia", "Sedation & analgesia (RASS scoring)", false],
      ["Emergency Response", "Code Blue / ACLS response", false],
      ["Transfusion Medicine", "Blood transfusion in critical care", true],
      ["Airway & Tracheostomy Care", "Tracheostomy care & suctioning", false],
      ["Wound Care & Skin", "Pressure injury prevention", false],
      ["Psychosocial & End-of-Life", "Family communication & end-of-life care", false],
    ],
  },
  {
    specialty: "ER",
    skills: [
      ["Triage & Assessment", "ESI triage categorization & rapid assessment", false],
      ["Medication Administration", "Documentation on M.A.R.", false],
      ["Medication Administration", "Dose Calculation", false],
      ["Emergency Response", "Code Blue / ACLS response", false],
      ["Trauma Care", "Trauma bay primary & secondary survey", true],
      ["Cardiac Monitoring", "12-lead ECG acquisition & rhythm interpretation", false],
      ["Respiratory Care", "Oxygen therapy & airway management", false],
      ["Wound Care & Skin", "Laceration care & splinting", false],
      ["Transfusion Medicine", "Emergency blood transfusion administration", true],
      ["Safety & Compliance", "De-escalation & behavioral emergencies", false],
      ["IV Therapy & Access", "IV insertion & phlebotomy", false],
    ],
  },
  {
    specialty: "TELE",
    skills: [
      ["Cardiac Monitoring", "Telemetry — basic rhythm interpretation", false],
      ["Cardiac Monitoring", "Arrhythmia recognition & escalation protocol", true],
      ["Cardiac Monitoring", "Cardiac drip titration (amiodarone, diltiazem)", true],
      ["Medication Administration", "Documentation on M.A.R.", false],
      ["Medication Administration", "Diabetic care & insulin management", true],
      ["IV Therapy & Access", "IV insertion & site care", false],
      ["Symptom & Pain Management", "Chest pain assessment & protocol", false],
      ["Safety & Compliance", "Fall risk & safety protocols", false],
      ["Care Planning & Education", "Patient & family heart-failure education", false],
      ["Wound Care & Skin", "Wound care & dressing changes", false],
    ],
  },
  {
    // From the MyZipVault import template example rows (Nursing / RN / General)
    specialty: "GENERAL",
    skills: [
      ["Medication Administration", "Documentation on M.A.R.", false],
      ["Medication Administration", "Dose Calculation", false],
      ["Medication Administration", "Generic Equivalents", false],
      ["Medication Administration", "Usage of PDR", false],
      ["Medication Administration", "Knowledge of Drug Actions/Interactions", false],
      ["Medication Administration", "IV push / infusion medications", false],
      ["Medication Administration", "Diabetic care & insulin management", true],
    ],
  },
] as const;

export async function seedBuiltinTemplates() {
  for (const set of BUILTIN_CHECKLISTS) {
    const rows = set.skills.map((entry, i) => {
      const [category, skillName] = entry as readonly [string, string];
      return {
        profession: "Nursing",
        jobTitle: "RN",
        specialty: set.specialty,
        specialtyKey: set.specialty,
        category,
        skillName,
        questionType: "rating_1_4",
        hasNA: true,
        sortOrder: i,
      };
    });
    const { errors } = validateRows(rows as ImportRow[]);
    if (errors.length) throw new Error(`Builtin seed invalid: ${errors.join("; ")}`);
    await upsertTemplates(rows as ValidatedRow[], "BUILTIN");
  }
}
