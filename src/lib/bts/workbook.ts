// ── Server-side workbook builders (SuperAdmin skills export quartet) ──
// Mirrors the MyZipVault reference template: a two-sheet workbook with a
// "Skills Data" sheet (the 7 import columns) and an "Instructions" sheet
// (rules + rating scale + example rows). SheetJS is lazy-imported so the
// serverless cold start stays light.
//
// Style note: SheetJS Community Edition writes values, column widths and
// merges but not fonts/fills — the reference repo's inline `.s` styles are
// silently dropped by the community writer, so we rely on widths + merges +
// clean text for a professional read.

import { PROFESSIONS, QUESTION_TYPES, MAX_IMPORT_ROWS } from "./importValidate";
import { specialtyLabel } from "./checklistShared";
import type { ImportRow, ValidatedRow } from "./importValidate";

const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COL_WIDTHS = [{ wch: 15 }, { wch: 24 }, { wch: 26 }, { wch: 34 }, { wch: 52 }, { wch: 15 }, { wch: 14 }];

const EXAMPLE_ROWS: string[][] = [
  ["Nursing", "RN", "ICU", "Age of Patients Cared For", "Newborn/Neonate (birth to 30 days)", "rating_1_4", "No"],
  ["Nursing", "RN", "ICU", "General Skills", "Draw Blood Cultures", "rating_1_4", "No"],
  ["Nursing", "RN", "ICU", "Cardiac General Skills", "Interpretation of 12 lead EKG", "rating_1_4", "No"],
];

function instructionsSheet(X: typeof import("xlsx")): import("xlsx").WorkSheet {
  const data: string[][] = [
    ["VaultVerify Skills Checklist Import Template"],
    ["Instructions:"],
    ["1. Keep the header row in the Skills Data sheet exactly as provided (column ORDER also matters: a workbook with no header row is accepted only when the columns follow this exact order)."],
    [`2. Profession must be one of: ${PROFESSIONS.join(", ")}.`],
    [`3. Question Type must be one of: ${QUESTION_TYPES.join(", ")}.`],
    ["4. Has N/A Option must be: Yes or No."],
    ["5. Do not leave Profession, Job Title, Specialty, Category, or Skill Name blank."],
    ["6. Re-uploading a workbook is safe — rows are matched by Profession + Job Title + Specialty + Skill Name and refreshed in place (nothing is duplicated)."],
    ["7. Rows that fail validation are reported with their exact row number and skipped; all valid rows commit together in one atomic write."],
    [`8. One workbook can hold up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} data rows.`],
    ["9. Save the file as .xlsx before uploading."],
    [""],
    ["Rating Scale (rating_1_4):"],
    ["1 = No theory and/or experience"],
    ["2 = Limited experience"],
    ["3 = Experienced / minimal support needed"],
    ["4 = Proficient"],
    [""],
    ["Example rows:"],
    ...EXAMPLE_ROWS,
  ];
  const ws = X.utils.aoa_to_sheet(data);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws["!cols"] = COL_WIDTHS;
  return ws;
}

function skillsSheet(X: typeof import("xlsx"), rows: (string | boolean)[][], withExamples: boolean): import("xlsx").WorkSheet {
  const body: (string | boolean)[][] = withExamples ? [...EXAMPLE_ROWS] : [];
  const ws = X.utils.aoa_to_sheet([["Profession", "Job Title", "Specialty", "Category", "Skill Name", "Question Type", "Has N/A Option"], ...body, ...rows]);
  ws["!cols"] = COL_WIDTHS;
  return ws;
}

// Holder for the lazy module — resolved by ensureXlsx() before any builder.
let XLSX: typeof import("xlsx") | null = null;
async function ensureXlsx(): Promise<typeof import("xlsx")> {
  if (!XLSX) XLSX = await import("xlsx");
  return XLSX;
}

function write(X: typeof import("xlsx"), wb: import("xlsx").WorkBook): Buffer {
  return X.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface WorkbookResult {
  buf: Buffer;
  filename: string;
  contentType: string;
}

// GET /api/superadmin/skills/template — blank, re-importable template.
export async function buildTemplateWorkbook(): Promise<WorkbookResult> {
  const X = await ensureXlsx();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, skillsSheet(X, [], true), "Skills Data");
  X.utils.book_append_sheet(wb, instructionsSheet(X), "Instructions");
  return { buf: write(X, wb), filename: "VaultVerify_Skills_Import_Template.xlsx", contentType: CONTENT_TYPE };
}

// GET /api/superadmin/skills/export — the full library, date-stamped.
// Specialty keys are exported as their human labels (Med-Surg, ICU / Critical
// Care, …) which normalizeSpecialty() maps back to the exact same canonical
// key on re-import — the round-trip test in tests/skillsWorkbook.test.ts
// locks this contract.
export async function buildExportWorkbook(templates: ValidatedRow[]): Promise<WorkbookResult> {
  const X = await ensureXlsx();
  const rows: (string | boolean)[][] = templates.map((t) => [
    t.profession, t.jobTitle, specialtyLabel(t.specialtyKey), t.category, t.skillName, t.questionType, t.hasNA ? "Yes" : "No",
  ]);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, skillsSheet(X, rows, false), "Skills Data");
  X.utils.book_append_sheet(wb, instructionsSheet(X), "Instructions");
  const today = new Date().toISOString().slice(0, 10);
  return { buf: write(X, wb), filename: `VaultVerify_Skills_Export_${today}.xlsx`, contentType: CONTENT_TYPE };
}

// Shared row→ValidatedRow shape for export (the caller reads SkillTemplate rows).
export function templateToValidated(t: {
  profession: string; jobTitle: string; specialty: string; category: string;
  skillName: string; questionType: string; hasNA: boolean;
}): ValidatedRow {
  return {
    profession: t.profession, jobTitle: t.jobTitle, specialty: specialtyLabel(t.specialty),
    category: t.category, skillName: t.skillName, questionType: t.questionType, hasNA: t.hasNA,
    specialtyKey: t.specialty,
  };
}

export type { ImportRow };
