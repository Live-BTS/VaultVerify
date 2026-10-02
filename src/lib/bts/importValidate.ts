// ── Pure helpers for the MyZipVault skills import (client-safe, no db) ──

export const PROFESSIONS = ["Nursing", "Allied", "Pharmacy", "Locums"] as const;
export const QUESTION_TYPES = ["rating_1_4", "yes_no", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const RATING_SCALE_4 = [
  { value: 1, label: "No theory and/or experience", vv: "NEVER" },
  { value: 2, label: "Limited experience", vv: "SUPERVISED" },
  { value: 3, label: "Experienced / minimal support needed", vv: "INDEPENDENT" },
  { value: 4, label: "Proficient", vv: "CAN_TEACH" },
] as const;

// Skills flagged high-risk on import (keyword match, case-insensitive)
export const HIGH_RISK_KEYWORDS = [
  "ventilator", "vasoactive", "vasopressin", "norepi", "drip", "titrat",
  "arterial line", "central line", "crrt", "dialysis", "transfusion",
  "chemotherapy", "biotherapy", "epidural", "insulin", "heparin", "chest tube",
  "icp", "blood product", "pca", "chemo",
];

export function looksHighRisk(skillName: string): boolean {
  const s = skillName.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((k) => s.includes(k));
}

const SPECIALTY_ALIASES: Record<string, string> = {
  "med-surg": "MEDSURG", medsurg: "MEDSURG", "med surg": "MEDSURG",
  icu: "ICU", "icu / critical care": "ICU", "critical care": "ICU", intensivecare: "ICU", "intensive care": "ICU",
  er: "ER", ed: "ER", emergency: "ER", "emergency room": "ER", "emergency department": "ER",
  tele: "TELE", telemetry: "TELE",
  "l&d": "L&D", "l and d": "L&D", "labor & delivery": "L&D", "labor and delivery": "L&D",
  or: "OR", "operating room": "OR", pacu: "PACU",
  peds: "PEDS", pediatrics: "PEDS", pediatric: "PEDS",
  beh: "BEH", "behavioral health": "BEH", psych: "BEH",
  ltc: "LTC", "long-term care": "LTC", "long term care": "LTC", general: "GENERAL",
};

// Map a free-text Specialty from the workbook to the app's canonical key.
export function normalizeSpecialty(raw: string): { key: string; label: string } {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  const probe = cleaned.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  const direct = SPECIALTY_ALIASES[probe] ?? SPECIALTY_ALIASES[probe.replace(/\s/g, "")];
  if (direct) return { key: direct, label: cleaned };
  // Already canonical (short all-caps)?
  if (/^[A-Z&]{2,6}$/.test(cleaned)) return { key: cleaned, label: cleaned };
  // Free-text specialty: stable pseudo-key (UPPER_SNAKE)
  const key = cleaned.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { key: key || "GENERAL", label: cleaned };
}

export interface ImportRow {
  profession: string;
  jobTitle: string;
  specialty: string;
  category: string;
  skillName: string;
  questionType: string;
  hasNA: boolean;
}

export interface ValidatedRow extends ImportRow {
  specialtyKey: string;
}

export function validateRows(rows: ImportRow[]): { errors: string[]; clean: ValidatedRow[] } {
  const errors: string[] = [];
  const clean: ValidatedRow[] = [];
  rows.forEach((row, i) => {
    const n = i + 1;
    const rowErrors: string[] = [];
    const profession = (row.profession ?? "").trim();
    const jobTitle = (row.jobTitle ?? "").trim();
    const specialty = (row.specialty ?? "").trim();
    const category = (row.category ?? "").trim();
    const skillName = (row.skillName ?? "").trim();
    const questionType = (row.questionType ?? "").trim().toLowerCase();

    if (!profession) rowErrors.push("Profession is blank");
    else if (!PROFESSIONS.includes(profession as (typeof PROFESSIONS)[number])) rowErrors.push(`Profession "${profession}" must be one of ${PROFESSIONS.join(", ")}`);
    if (!jobTitle) rowErrors.push("Job Title is blank");
    if (!specialty) rowErrors.push("Specialty is blank");
    if (!category) rowErrors.push("Category is blank");
    if (!skillName) rowErrors.push("Skill Name is blank");
    if (!QUESTION_TYPES.includes(questionType as QuestionType)) rowErrors.push(`Question Type "${row.questionType}" must be rating_1_4, yes_no, or text`);

    if (rowErrors.length) {
      errors.push(...rowErrors.map((e) => `Row ${n}: ${e}`));
    } else {
      clean.push({ profession, jobTitle, specialty, category, skillName, questionType, hasNA: row.hasNA, specialtyKey: normalizeSpecialty(specialty).key });
    }
  });
  return { errors, clean };
}
