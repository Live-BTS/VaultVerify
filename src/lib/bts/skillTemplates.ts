import { db } from "@/lib/db";
import { validateRows, looksHighRisk, normalizeSpecialty, type ImportRow, type ValidatedRow } from "./importValidate";

// ── Zipvault-compatible skill checklist helpers (db-backed) ─────────
// Template schema mirrors the MyZipVault import workbook:
// Profession | Job Title | Specialty | Category | Skill Name | Question Type | Has N/A Option
// Pure validation lives in ./importValidate (client-safe).

export * from "./importValidate";

export async function upsertTemplates(rows: ValidatedRow[], source: "IMPORT" | "BUILTIN" = "IMPORT") {
  let created = 0;
  let updated = 0;
  for (const [i, row] of rows.entries()) {
    const existing = await db.skillTemplate.findUnique({
      where: { profession_jobTitle_specialty_skillName: { profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName } },
    });
    const data = {
      category: row.category,
      questionType: row.questionType,
      hasNA: row.hasNA,
      highRisk: looksHighRisk(row.skillName),
      active: true,
      source,
      sortOrder: i,
    };
    if (existing) {
      await db.skillTemplate.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.skillTemplate.create({
        data: { ...data, profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName },
      });
      created += 1;
    }
  }
  return { created, updated };
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
    const rows = set.skills.map(([category, skillName], i) => ({
      profession: "Nursing",
      jobTitle: "RN",
      specialty: set.specialty,
      specialtyKey: set.specialty,
      category,
      skillName,
      questionType: "rating_1_4",
      hasNA: true,
      sortOrder: i,
    }));
    const { errors } = validateRows(rows as ImportRow[]);
    if (errors.length) throw new Error(`Builtin seed invalid: ${errors.join("; ")}`);
    await upsertTemplates(rows as ValidatedRow[], "BUILTIN");
  }
}
