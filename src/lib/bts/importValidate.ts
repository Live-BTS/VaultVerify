// ── Pure helpers for the MyZipVault skills import (client-safe, no db) ──
// Validation universe aligns with the owner's real workbook (2026-10-19):
// three professions — Nursing, Allied, Providers — with "Provider" from the
// workbook normalized to the canonical plural "Providers". Legacy
// Pharmacy/Locums values still validate so an export→import round trip of
// older data never breaks, but they are no longer offered anywhere in the UI.

import { SPECIALTY_LABELS } from "./checklistShared";

export const PROFESSIONS = ["Nursing", "Allied", "Providers"] as const;
// Accepted for backward compatibility (round-trip safety); not offered in UI.
export const LEGACY_PROFESSIONS = ["Pharmacy", "Locums"] as const;
export const QUESTION_TYPES = ["rating_1_4", "yes_no", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// Import guard: the owner's real workbook has ~17k rows — the cap must sit
// comfortably above that while still protecting the serverless import path.
export const MAX_IMPORT_ROWS = 25_000;

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

// ── Profession normalization ──────────────────────────────────────
// The workbook uses "Provider" (singular); the owner calls the profession
// "Providers". Both normalize to the canonical "Providers". Case-insensitive,
// whitespace-collapsed. Returns null for unrecognized values (row rejected).
export function normalizeProfession(raw: string): string | null {
  const probe = (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!probe) return null;
  if (probe === "provider" || probe === "providers") return "Providers";
  if (probe === "nursing") return "Nursing";
  if (probe === "allied" || probe === "allied health" || probe === "aide") return "Allied";
  if (probe === "pharmacy") return "Pharmacy"; // legacy — round-trip only
  if (probe === "locums") return "Locums"; // legacy — round-trip only
  return null;
}

// ── Question-type normalization ───────────────────────────────────
// Tolerates the common spreadsheet spellings ("1-4 Rating", "rating", "Y/N").
export function normalizeQuestionType(raw: string): QuestionType | null {
  const probe = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!probe) return null;
  if (["rating_1_4", "rating", "1_4", "rating_1_4_scale", "1_4_rating", "rating_1_4_rating"].includes(probe)) return "rating_1_4";
  if (["yes_no", "yesno", "y_n", "boolean"].includes(probe)) return "yes_no";
  if (["text", "free_text", "textarea", "note"].includes(probe)) return "text";
  return null;
}

// ── Has-N/A normalization ─────────────────────────────────────────
// Accepts Yes/No/Y/N/true/false/1/0 and blanks (blank = No, matching the
// reference template where N/A is opt-in). Real booleans pass through.
export function normalizeHasNA(raw: string | boolean): boolean {
  if (typeof raw === "boolean") return raw;
  const probe = (raw ?? "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(probe);
}

const SPECIALTY_ALIASES: Record<string, string> = {
  "med surg": "MEDSURG", medsurg: "MEDSURG",
  icu: "ICU", "icu critical care": "ICU", "critical care": "ICU", intensivecare: "ICU", "intensive care": "ICU",
  er: "ER", ed: "ER", emergency: "ER", "emergency room": "ER", "emergency department": "ER",
  tele: "TELE", telemetry: "TELE",
  "l d": "L&D", "l and d": "L&D", "labor delivery": "L&D", "labor and delivery": "L&D",
  or: "OR", "operating room": "OR", pacu: "PACU",
  peds: "PEDS", pediatrics: "PEDS", pediatric: "PEDS",
  beh: "BEH", "behavioral health": "BEH", psych: "BEH",
  ltc: "LTC", "long term care": "LTC", general: "GENERAL",
};

// Label aliases generated from the app's canonical label map (single source
// of truth: ./checklistShared — the same map the export endpoints use) so an
// export → import round trip reproduces the exact same keys: e.g. the
// canonical key GENERAL exports as "General (Medication Administration)" and
// must normalize back to GENERAL, not to a fresh pseudo-key. Manual aliases
// always win.
const LABEL_ALIASES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, label] of Object.entries(SPECIALTY_LABELS)) {
    const probe = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (probe && !(probe in map)) map[probe] = key;
  }
  return map;
})();

// Map a free-text Specialty from the workbook to the app's canonical key.
// Slashes, dashes and ampersands are folded to spaces so "Med/Surg",
// "Med-Surg" and "Med Surg" all land on MEDSURG.
export function normalizeSpecialty(raw: string): { key: string; label: string } {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  const probe = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const direct = SPECIALTY_ALIASES[probe] ?? SPECIALTY_ALIASES[probe.replace(/\s/g, "")] ?? LABEL_ALIASES[probe];
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
  const validProfessions = [...PROFESSIONS, ...LEGACY_PROFESSIONS];
  rows.forEach((row, i) => {
    const n = i + 1;
    const rowErrors: string[] = [];
    const rawProfession = (row.profession ?? "").trim();
    const jobTitle = (row.jobTitle ?? "").trim();
    const specialty = (row.specialty ?? "").trim();
    const category = (row.category ?? "").trim();
    const skillName = (row.skillName ?? "").trim();

    const profession = rawProfession ? normalizeProfession(rawProfession) : null;
    if (!rawProfession) rowErrors.push("Profession is blank");
    else if (!profession) rowErrors.push(`Profession "${rawProfession}" must be one of ${PROFESSIONS.join(", ")}`);
    if (!jobTitle) rowErrors.push("Job Title is blank");
    if (!specialty) rowErrors.push("Specialty is blank");
    if (!category) rowErrors.push("Category is blank");
    if (!skillName) rowErrors.push("Skill Name is blank");
    const questionType = row.questionType ? normalizeQuestionType(String(row.questionType)) : null;
    if (!questionType) rowErrors.push(`Question Type "${row.questionType}" must be rating_1_4, yes_no, or text`);

    if (rowErrors.length) {
      errors.push(...rowErrors.map((e) => `Row ${n}: ${e}`));
    } else {
      clean.push({
        profession: profession as string,
        jobTitle,
        specialty,
        category,
        skillName,
        questionType: questionType as QuestionType,
        hasNA: normalizeHasNA(row.hasNA),
        specialtyKey: normalizeSpecialty(specialty).key,
      });
    }
  });
  return { errors, clean };
}
