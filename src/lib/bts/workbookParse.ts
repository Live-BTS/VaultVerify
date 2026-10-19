// ── Client-side workbook extraction (pure, no db) ──────────────────
// Used by the SuperAdmin import flow: SheetJS is lazy-imported by the caller
// (keeps ~1MB out of the console bundle), this module only handles the pure
// row-extraction logic so it is unit-testable without a component mount.
//
// Two accepted layouts:
//   1. HEADERED — a row within the first 12 rows carries the 7 MyZipVault
//      headers (Profession … Has N/A Option); columns are mapped by name.
//   2. POSITIONAL — the owner's real workbook has NO header row at all: the
//      7 columns in the standard order, one row per skill. Accepted when the
//      sheet itself is the Skills Data sheet (name matches /skill/i).
// The Instructions sheet never matches /skill/i so it can never be parsed
// positionally by accident.

import { normalizeHasNA } from "./importValidate";
import type { ImportRow } from "./importValidate";

export const WORKBOOK_HEADERS = ["Profession", "Job Title", "Specialty", "Category", "Skill Name", "Question Type", "Has N/A Option"] as const;

// XLSX (OOXML) is a ZIP container — every valid file starts with PK\x03\x04
// (or PK\x05\x06 for an empty archive). Checking magic bytes up front gives a
// clear "this isn't a real .xlsx" error instead of a cryptic SheetJS throw
// when someone renames a .csv/.xls to .xlsx.
export function hasXlsxMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07;
  }
  // Legacy .xls (BIFF) — accept the compound-file signature too; SheetJS reads it.
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

export type ParseMode = "header" | "positional";

export interface ExtractResult {
  rows: ImportRow[];
  mode: ParseMode | null; // null = no usable data found
  sheetName: string;
  dataRowsScanned: number;
}

interface SheetAoa {
  sheetName: string;
  aoa: string[][];
}

function locateHeader(aoa: string[][]): number {
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    if (cells.includes("skill name") && cells.includes("profession")) return i;
  }
  return -1;
}

function rowsFromHeadered(aoa: string[][], headerIdx: number): ImportRow[] {
  const headers = (aoa[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const colMap = {
    profession: idx("Profession"), jobTitle: idx("Job Title"), specialty: idx("Specialty"),
    category: idx("Category"), skillName: idx("Skill Name"), questionType: idx("Question Type"), hasNA: idx("Has N/A Option"),
  };
  const rows: ImportRow[] = [];
  for (const cells of aoa.slice(headerIdx + 1)) {
    const get = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    const r = {
      profession: get(colMap.profession), jobTitle: get(colMap.jobTitle), specialty: get(colMap.specialty),
      category: get(colMap.category), skillName: get(colMap.skillName), questionType: get(colMap.questionType),
      hasNA: normalizeHasNA(get(colMap.hasNA)),
    };
    if (!r.profession && !r.jobTitle && !r.specialty && !r.category && !r.skillName) continue; // skip fully blank rows
    rows.push(r);
  }
  return rows;
}

function rowsFromPositional(aoa: string[][]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const cells of aoa) {
    const get = (i: number) => String(cells[i] ?? "").trim();
    const r: ImportRow = {
      profession: get(0), jobTitle: get(1), specialty: get(2), category: get(3),
      skillName: get(4), questionType: get(5), hasNA: normalizeHasNA(get(6)),
    };
    if (!r.profession && !r.jobTitle && !r.specialty && !r.category && !r.skillName) continue;
    rows.push(r);
  }
  return rows;
}

// Pure core: pick the right sheet and extraction mode from pre-parsed AOAs.
// `sheets` should list every sheet in workbook order (name + grid); the
// Skills Data sheet wins, then the first sheet that yields usable data.
export function extractRowsFromSheets(sheets: SheetAoa[]): ExtractResult {
  const ordered = [...sheets].sort((a, b) => {
    const aSkill = /skill/i.test(a.sheetName) ? 0 : 1;
    const bSkill = /skill/i.test(b.sheetName) ? 0 : 1;
    return aSkill - bSkill;
  });

  // 1) any sheet with a real header row (searched in priority order)
  for (const { sheetName, aoa } of ordered) {
    const headerIdx = locateHeader(aoa);
    if (headerIdx !== -1) {
      return { rows: rowsFromHeadered(aoa, headerIdx), mode: "header", sheetName, dataRowsScanned: aoa.length - headerIdx - 1 };
    }
  }

  // 2) headerless positional — only a Skills-named sheet qualifies (the
  //    Instructions sheet must never be mistaken for data).
  for (const { sheetName, aoa } of ordered) {
    if (!/skill/i.test(sheetName)) continue;
    if (!aoa.length) continue;
    const rows = rowsFromPositional(aoa);
    if (rows.length) return { rows, mode: "positional", sheetName, dataRowsScanned: aoa.length };
  }

  const fallback = sheets[0];
  return { rows: [], mode: null, sheetName: fallback?.sheetName ?? "(none)", dataRowsScanned: 0 };
}

// Client convenience: read a File, lazy-import SheetJS, extract rows.
export async function extractRowsFromWorkbook(file: File): Promise<ExtractResult> {
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!hasXlsxMagic(magic)) {
    throw new Error("NOT_XLSX");
  }
  const buf = await file.arrayBuffer();
  const XLSX = await import("xlsx"); // lazy — keeps SheetJS out of the console bundle
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames.map((sheetName) => {
    const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: "" });
    return { sheetName, aoa };
  });
  return extractRowsFromSheets(sheets);
}
